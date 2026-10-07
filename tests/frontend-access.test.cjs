const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parse } = require('@vue/compiler-sfc');
const script = parse(fs.readFileSync('src/frontend/pages/AccessPage.vue', 'utf8')).descriptor.scriptSetup.content.replace(/^import .*;\n/gm, '');

// Exercise the real setup script with controlled media/lifecycle/clock boundaries.
function setup({ mobile=false, reduced=false, saveData=false }={}) {
 const mounted=[],unmounted=[],frames=new Map(),timers=new Map(),docEvents=new Map(),changes=new Map();
 let now=0,id=0,plays=0,pauses=0,loads=0;
 const query={matches:reduced,addEventListener:(k,f)=>changes.set('motion',f),removeEventListener:()=>changes.delete('motion')};
 const connection={saveData,addEventListener:(k,f)=>changes.set('data',f),removeEventListener:()=>changes.delete('data')};
 const document={hidden:false,addEventListener:(k,f)=>docEvents.set(k,f),removeEventListener:k=>docEvents.delete(k)};
 const emitted=[];
 const video={muted:false,playsInline:false,play(){plays++;return Promise.resolve();},pause(){pauses++;},removeAttribute(){},load(){loads++;}};
 const context=vm.createContext({
  computed:fn=>({get value(){return fn();}}),nextTick:()=>Promise.resolve(),onMounted:fn=>mounted.push(fn),onBeforeUnmount:fn=>unmounted.push(fn),
  reactive:x=>x,ref:value=>({value}),defineProps:()=>{},defineEmits:()=> (...args)=>emitted.push(args),
  desktopVideo:'desktop.mp4',mobileVideo:'mobile.mp4',accessPosterSrc:'poster.webp',navigator:{connection},document,
  window:{matchMedia:s=>s.includes('reduced')?query:{matches:mobile},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:n=>timers.delete(n)},
  performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:n=>frames.delete(n)
 });
 vm.runInContext(script+'\nthis.access={videoEl,accessVideoSrc,motionAllowed,userPaused,videoState,loading,tryPlayAccessVideo,toggleMotion,syncMotionPreference,startAccess,markVideoFailed};',context);
 const a=context.access;a.videoEl.value=video;
 const mount=async()=>{mounted.forEach(fn=>fn());await Promise.resolve();await Promise.resolve();};
 const advance=ms=>{now+=ms;for(const [key,fn] of [...frames]){frames.delete(key);fn();}};
 const finish=()=>{for(const [key,fn] of [...timers]){timers.delete(key);fn();}};
 return {a,video,query,connection,document,docEvents,changes,emitted,frames,timers,mount,advance,finish,unmount:()=>unmounted.forEach(fn=>fn()),counts:()=>({plays,pauses,loads})};
}
const labels={connecting:'connect',loading:'loading',sync:'sync',welcome:'welcome'};
for (const mobile of [false,true]) test(`selects exactly one ${mobile?'mobile':'desktop'} clip`,async()=>{
 const s=setup({mobile});await s.mount();assert.equal(s.a.accessVideoSrc.value,mobile?'mobile.mp4':'desktop.mp4');assert.equal(s.counts().plays,1);assert.equal(s.video.muted,true);assert.equal(s.video.playsInline,true);
});
for (const preference of ['reduced','saveData']) test(`${preference} starts with only a static poster`,async()=>{
 const s=setup({[preference]:true});await s.mount();assert.equal(s.a.motionAllowed.value,false);assert.equal(s.counts().plays,0);
});
test('manual pause survives hiding and restoring the tab',async()=>{
 const s=setup();await s.mount();s.a.toggleMotion();s.document.hidden=true;s.docEvents.get('visibilitychange')();s.document.hidden=false;s.docEvents.get('visibilitychange')();assert.equal(s.counts().plays,1);s.a.toggleMotion();assert.equal(s.counts().plays,2);
});
test('automatically pauses hidden video and resumes visible video',async()=>{
 const s=setup();await s.mount();s.document.hidden=true;s.docEvents.get('visibilitychange')();assert.equal(s.counts().pauses,1);s.document.hidden=false;s.docEvents.get('visibilitychange')();assert.equal(s.counts().plays,2);
});
test('failed autoplay returns to the poster without blocking entry',async()=>{
 const s=setup();s.video.play=()=>Promise.reject(new Error('autoplay denied'));await s.mount();await Promise.resolve();assert.equal(s.a.videoState.failed,true);s.a.startAccess(labels);s.advance(400);s.finish();assert.deepEqual(s.emitted,[['go','/hub']]);
});
test('a stale play rejection after pause and resume does not hide a playing clip',async()=>{
 const s=setup();let reject;s.video.play=()=>new Promise((resolve,r)=>{reject=r;});await s.mount();const rejectOld=reject;s.a.toggleMotion();s.video.play=()=>Promise.resolve();s.a.toggleMotion();rejectOld(new Error('interrupted'));await Promise.resolve();assert.equal(s.a.videoState.failed,false);
});
test('turning reduced motion on stops playback and turning it off can resume',async()=>{
 const s=setup();await s.mount();s.query.matches=true;await s.changes.get('motion')();assert.equal(s.a.motionAllowed.value,false);s.query.matches=false;await s.changes.get('motion')();assert.equal(s.a.motionAllowed.value,true);assert.equal(s.counts().plays,2);
});
test('duplicate enter clicks emit only one navigation',async()=>{
 const s=setup();await s.mount();s.a.startAccess(labels);s.a.startAccess(labels);assert.equal(s.frames.size,1);s.advance(400);s.finish();assert.deepEqual(s.emitted,[['go','/hub']]);
});
test('leaving cancels frames, timers, listeners and video decoding',async()=>{
 const s=setup();await s.mount();s.a.startAccess(labels);s.advance(400);s.unmount();s.finish();assert.equal(s.frames.size,0);assert.equal(s.timers.size,0);assert.equal(s.docEvents.size,0);assert.equal(s.changes.size,0);assert.equal(s.counts().loads,1);assert.equal(s.emitted.length,0);
});
test('unmount before the entry animation frame prevents delayed navigation',async()=>{
 const s=setup();await s.mount();s.a.startAccess(labels);s.unmount();s.advance(400);s.finish();assert.equal(s.emitted.length,0);assert.equal(s.frames.size,0);
});
