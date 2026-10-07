const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function fixture({ memory = 8, cores = 8 } = {}) {
  let now = 0, nextFrame = 0;
  const frames = new Map();
  const idleCallbacks = new Map();
  const timers = new Map();
  const listeners = new Map();
  const document = {
    documentElement: { dataset: {} }, visibilityState: 'visible',
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); }
  };
  const context = {
    document, navigator: { deviceMemory: memory, hardwareConcurrency: cores },
    performance: { now: () => now },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: {
      matchMedia: () => ({ matches: false }), dispatchEvent() {},
      requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame(id) { frames.delete(id); },
      requestIdleCallback(callback) { idleCallbacks.set(++nextFrame, callback); return nextFrame; },
      cancelIdleCallback(id) { idleCallbacks.delete(id); },
      setTimeout(callback) { timers.set(++nextFrame, callback); return nextFrame; },
      clearTimeout(id) { timers.delete(id); }
    }
  };
  let source = fs.readFileSync(path.join(__dirname, '../src/frontend/utils/performance.js'), 'utf8');
  source = source.replace(/export /g, '');
  vm.runInNewContext(source + '\nthis.api = { initializePerformanceProfile, refreshPerformanceProbe, getPerformanceProfile, scheduleIdleTask };', context);
  const emit = type => [...(listeners.get(type) || [])].forEach(callback => callback());
  const step = delta => {
    now += delta;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(now));
  };
  const flush = (queue, argument) => { const pending=[...queue.values()]; queue.clear(); pending.forEach(callback=>callback(argument)); };
  return { api: context.api, window:context.window, document, emit, step, pending: () => frames.size, listeners, idleCallbacks, timers,
    idle: deadline=>flush(idleCallbacks, deadline), timersRun: ()=>flush(timers) };
}

test('late interaction starts a bounded probe and detects repeated dropped frames', () => {
  const f = fixture();
  f.api.initializePerformanceProfile();
  f.step(20000);
  assert.equal(f.pending(), 0, 'startup probe finishes');
  f.step(2500);
  f.emit('scroll');
  assert.equal(f.pending(), 1, 'late scrolling rearms sampling');
  f.step(17);
  for (let i = 0; i < 8; i++) {
    f.emit('scroll');
    f.step(60);
  }
  assert.equal(f.api.getPerformanceProfile(), 'reduced');
  assert.equal(f.pending(), 0);
  assert.equal(f.listeners.get('scroll').size, 0, 'reduced mode removes monitoring listeners');
});

test('healthy interaction does not create a permanent RAF loop or duplicate probes', () => {
  const f = fixture();
  f.api.initializePerformanceProfile();
  f.step(20000);
  f.emit('wheel');
  assert.equal(f.pending(), 0, 'cooldown prevents immediate restart');
  f.step(2100);
  f.emit('pointerdown');
  for (let i = 0; i < 1000; i++) f.emit('scroll');
  assert.equal(f.pending(), 1, 'many events share one probe');
  for (let i = 0; i < 725; i++) { f.emit('scroll'); f.step(1000 / 60); }
  assert.equal(f.pending(), 0, 'continuous scroll does not extend the deadline');
  assert.equal(f.api.getPerformanceProfile(), 'balanced');
});

test('hidden tabs stop sampling and visibility restores the grace period', () => {
  const f = fixture();
  f.api.initializePerformanceProfile();
  f.document.visibilityState = 'hidden';
  f.emit('visibilitychange');
  assert.equal(f.pending(), 0);
  f.emit('keydown');
  assert.equal(f.pending(), 0);
  f.document.visibilityState = 'visible';
  f.emit('visibilitychange');
  assert.equal(f.pending(), 1);
  for (let i = 0; i < 8; i++) f.step(100);
  assert.equal(f.api.getPerformanceProfile(), 'balanced', 'resume frames are excluded by grace');
});

test('hardware reduced mode never installs interaction sampling', () => {
  const f = fixture({ memory: 2, cores: 2 });
  f.api.initializePerformanceProfile();
  f.emit('pointerdown');
  assert.equal(f.api.getPerformanceProfile(), 'reduced');
  assert.equal(f.pending(), 0);
  assert.equal(f.listeners.size, 0);
});

test('optional preloads defer a busy timeout and use a later real idle slot', () => {
  const f = fixture();
  let calls = 0;
  f.api.scheduleIdleTask(() => calls++, { requireIdle:true });
  f.idle({ didTimeout:true, timeRemaining:()=>0 });
  assert.equal(calls, 0);
  f.timersRun();
  f.idle({ didTimeout:false, timeRemaining:()=>3 });
  assert.equal(calls, 0);
  f.timersRun();
  f.idle({ didTimeout:false, timeRemaining:()=>12 });
  assert.equal(calls, 1);
});

test('speculative retries are bounded and cancelled work cannot run', () => {
  const f = fixture();
  let calls=0;
  const cancel=f.api.scheduleIdleTask(()=>calls++, {requireIdle:true});
  f.idle({didTimeout:true,timeRemaining:()=>0});
  cancel();
  f.timersRun();
  assert.equal(f.idleCallbacks.size,0);
  f.api.scheduleIdleTask(()=>calls++, {requireIdle:true});
  for(let i=0;i<3;i++) { f.idle({didTimeout:true,timeRemaining:()=>0}); f.timersRun(); }
  assert.equal(calls,0);
  assert.equal(f.idleCallbacks.size,0);
  assert.equal(f.timers.size,0);
});

test('required idle work remains available after timeout and hidden work is skipped', () => {
  const f=fixture();
  let calls=0;
  f.api.scheduleIdleTask(()=>calls++);
  f.idle({didTimeout:true,timeRemaining:()=>0});
  assert.equal(calls,1);
  f.api.scheduleIdleTask(()=>calls++);
  f.document.visibilityState='hidden';
  f.idle({didTimeout:false,timeRemaining:()=>15});
  assert.equal(calls,1);
});

test('older browsers omit speculative work while keeping required timer fallback', () => {
  const f=fixture();
  delete f.window.requestIdleCallback;
  delete f.window.cancelIdleCallback;
  let calls=0;
  f.api.scheduleIdleTask(()=>calls++,{requireIdle:true});
  assert.equal(f.timers.size,0);
  f.api.scheduleIdleTask(()=>calls++);
  f.timersRun();
  assert.equal(calls,1);
});

test('adjacent route warmup waits for each module and stops after navigation', async () => {
  const source=fs.readFileSync(path.join(__dirname,'../src/frontend/router/index.js'),'utf8');
  const scheduling=source.slice(source.indexOf('function scheduleRouteWarmup(to)'),source.indexOf('\nrouter.afterEach((to, from, failure)'));
  const idle=[];
  const imported=[];
  const pending=[];
  const route={name:'hub'};
  const context={
    window:{navigator:{}},document:{visibilityState:'visible'},
    router:{currentRoute:{value:route}},
    isReducedPerformance:()=>false,
    routeWarmups:{hub:['stage','plaza'],stage:[]},defaultRouteWarmups:[],
    warmRouteComponent:loader=>{imported.push(loader);return new Promise(resolve=>pending.push(resolve));},
    prefetchStageData(){},
    scheduleIdleTask:(callback,options)=>{
      assert.equal(options.requireIdle,true);
      const entry={callback,cancelled:false};idle.push(entry);
      return ()=>entry.cancelled=true;
    }
  };
  vm.runInNewContext('let routeWarmupRun=0;let cancelPendingRouteWarmup=null;\n'+scheduling+'\nthis.schedule=scheduleRouteWarmup;',context);
  context.schedule({name:'hub'});
  idle.shift().callback();
  assert.deepEqual(imported,['stage']);
  assert.equal(idle.length,0,'second module cannot start while first is loading');
  pending.shift()();
  await new Promise(resolve=>setImmediate(resolve));
  const second=idle.shift();
  route.name='stage';
  context.schedule({name:'stage'});
  assert.equal(second.cancelled,true);
  second.callback();
  assert.deepEqual(imported,['stage'],'stale callback cannot preload the old route');
});

test('intent and idle warmups share the same in-flight module promise', async () => {
  const source=fs.readFileSync(path.join(__dirname,'../src/frontend/router/index.js'),'utf8');
  const warm=source.slice(source.indexOf('function warmRouteComponent(loader)'),source.indexOf('\nexport function warmRoutePath'));
  const context={};
  vm.runInNewContext('const warmedRouteComponents=new WeakMap();\n'+warm+'\nthis.warm=warmRouteComponent;',context);
  let calls=0, reject;
  const loader=()=>{calls++;return new Promise((_,fail)=>reject=fail);};
  const request=context.warm(loader);
  assert.equal(context.warm(loader),request);
  assert.equal(calls,1);
  reject(new Error('fixture load failure'));
  await request;
  assert.notEqual(context.warm(loader),request,'failed modules may be tried again');
  assert.equal(calls,2);
  reject(new Error('fixture retry failure'));
});

function counterFixture(reduced) {
  const frames=new Map();
  let id=0;
  const context={
    defineProps:()=>({value:12345,duration:900}),ref:value=>({value}),
    watch:(read,callback)=>callback(read()),onBeforeUnmount(){},
    isReducedPerformance:()=>reduced,
    window:{matchMedia:()=>({matches:false})},document:{visibilityState:'visible'},
    performance:{now:()=>0},requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},
    cancelAnimationFrame:frame=>frames.delete(frame)
  };
  const source=fs.readFileSync(path.join(__dirname,'../src/frontend/components/CountUpValue.vue'),'utf8').split('<script setup>')[1].split('</script>')[0].replace(/^import .*;\n/gm,'');
  vm.runInNewContext(source+'\nthis.display=display;',context);
  return {context,frames,setReduced:value=>reduced=value};
}

test('numeric decorations render immediately on constrained devices', () => {
  const f=counterFixture(true);
  assert.equal(f.context.display.value,'12,345');
  assert.equal(f.frames.size,0);
});

test('healthy devices keep the complete numeric animation and its duration', () => {
  const f=counterFixture(false);
  const advance=now=>{
    const callbacks=[...f.frames.values()];f.frames.clear();
    callbacks.forEach(callback=>callback(now));
  };
  advance(450);
  assert.equal(f.context.display.value,'10,802');
  assert.equal(f.frames.size,1,'animation continues through the midpoint');
  advance(899);
  assert.equal(f.frames.size,1,'animation does not end before its configured duration');
  advance(900);
  assert.equal(f.context.display.value,'12,345');
  assert.equal(f.frames.size,0);
});

test('numeric animation stops immediately when pressure changes or tab hides', () => {
  const f=counterFixture(false);
  assert.equal(f.frames.size,1);
  f.setReduced(true);
  const callbacks=[...f.frames.values()];f.frames.clear();callbacks.forEach(callback=>callback(100));
  assert.equal(f.context.display.value,'12,345');
  assert.equal(f.frames.size,0);
});
