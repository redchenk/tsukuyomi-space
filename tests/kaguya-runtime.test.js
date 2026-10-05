const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { attach, MAX_SPEED, MAX_CLONES } = require('../shared/kaguya-runtime.cjs');
function fixture() {
  const runtime = new EventEmitter();
  const variables = Object.fromEntries(['分数','轮回分数','关卡轮换中','轮回重置完成','轮回启动完成','轮回心情','心情值','背景速度（我跑步速度'].map(name => [name, {name, value: 0}]));
  variables['轮回启动完成'].value = 1; variables['心情值'].value = 67; variables['背景速度（我跑步速度'].value = 8;
  runtime.getTargetForStage = () => ({variables}); runtime.targets = []; runtime.threads = []; runtime._cloneCounter = 0;
  let flags=0,starts=0,time=0; const jobs=[], reports=[];
  runtime.startHats=()=>{starts++;variables['轮回启动完成'].value=1;};
  const vm={runtime,greenFlag(){flags++;runtime.emit('PROJECT_START');},setRuntimeOptions(options){runtime.options=options;},setCompilerOptions(options){runtime.compiler=options;}};
  const controller=attach(vm,{defer:job=>jobs.push(job),clock:()=>time,report:score=>reports.push(score)});
  const tick=()=>{time+=34;runtime.emit('AFTER_EXECUTE');while(jobs.length)jobs.shift()();};
  return {runtime,vm,variables,controller,tick,reports,counts:()=>({flags,starts}),setScore:n=>variables['分数'].value=n};
}
test('a stalled engine waits for reset/start acknowledgements without elapsed-time retries or score loss',()=>{
  const f=fixture();f.setScore(10007);f.tick();
  for(let i=0;i<500;i++)f.tick();
  assert.deepEqual(f.counts(),{flags:1,starts:0});assert.equal(f.controller.inspect().phase,'reset');assert.deepEqual(f.reports,[]);
  f.variables['轮回重置完成'].value=1;f.tick();f.tick();
  assert.equal(f.controller.inspect().phase,'idle');assert.equal(f.variables['分数'].value,10007);assert.equal(f.variables['轮回心情'].value,67);assert.equal(f.variables['关卡轮换中'].value,0);
});
test('200 long-run stage cycles remain bounded, score remains monotonic, and speed is finite',()=>{
  const f=fixture();
  for(let i=1;i<=200;i++){
    f.setScore(i*10000);f.tick();f.variables['轮回重置完成'].value=1;f.tick();f.tick();
  }
  assert.equal(f.counts().flags,200);assert.equal(f.counts().starts,200);assert.equal(f.controller.inspect().score,2000000);
  assert.equal(f.runtime.options.maxClones,MAX_CLONES);assert.equal(f.runtime.compiler.warpTimer,true);assert.ok(f.controller.inspect().speed<=MAX_SPEED);
  assert.ok(f.reports.length<100);assert.ok(f.reports.every((n,i)=>!i||n>=f.reports[i-1]));
});
test('a dead player is not resurrected by the 10000 boundary and a manual restart cancels queued work',()=>{
  const f=fixture();f.variables['心情值'].value=0;f.setScore(10000);f.tick();assert.equal(f.counts().flags,0);
  f.variables['心情值'].value=80;f.setScore(10000);f.runtime.emit('AFTER_EXECUTE');f.runtime.emit('PROJECT_START');f.tick();
  assert.equal(f.counts().starts,0);assert.equal(f.variables['关卡轮换中'].value,0);
});
test('disposing removes engine hooks and stale deferred work',()=>{
  const f=fixture();f.setScore(10000);f.runtime.emit('AFTER_EXECUTE');f.controller.dispose();f.tick();
  assert.equal(f.counts().flags,0);assert.equal(f.runtime.listenerCount('AFTER_EXECUTE'),0);assert.equal(f.runtime.listenerCount('PROJECT_START'),0);
});
test('the real project patch acknowledges starts and preserves both score and health only during cycles',()=>{
  const patch=require('../shared/kaguya-project-patch.cjs');
  const source=require('./fixtures/kaguya-project.json');
  const result=JSON.parse(new TextDecoder().decode(patch(new TextEncoder().encode(JSON.stringify(source)))));
  const stage=result.targets.find(t=>t.isStage);
  const values=Object.fromEntries(Object.entries(stage.variables).map(([id,v])=>[id,v[1]]));
  const evaluate=(target,input)=>{
    if(Array.isArray(input[1]))return input[1][0]===12?Number(values[input[1][2]]):Number(input[1][1]);
    const b=target.blocks[input[1]],a=evaluate(target,b.inputs.NUM1),c=evaluate(target,b.inputs.NUM2);
    return b.opcode==='operator_multiply'?a*c:b.opcode==='operator_subtract'?a-c:a+c;
  };
  const fen=result.targets.find(t=>t.name==='fen2'),health=result.targets.find(t=>t.name==='xl1');
  const healthBlock=Object.values(health.blocks).find(b=>b.opcode==='data_setvariableto'&&b.fields.VARIABLE[0]==='心情值');
  const scoreId=Object.entries(stage.variables).find(([,v])=>v[0]==='分数')[0];
  values[scoreId]=123456;values['tsukuyomi-postgame-cycle-restart']=1;values['tsukuyomi-cycle-mood']=67;
  assert.equal(evaluate(fen,fen.blocks.pJ.inputs.VALUE),123456);assert.equal(evaluate(health,healthBlock.inputs.VALUE),67);
  values['tsukuyomi-postgame-cycle-restart']=0;
  assert.equal(evaluate(fen,fen.blocks.pJ.inputs.VALUE),0);assert.equal(evaluate(health,healthBlock.inputs.VALUE),100);
  assert.equal(fen.blocks['tsukuyomi-start-ack'].fields.VARIABLE[0],'轮回启动完成');
  assert.equal(stage.blocks['tsukuyomi-reset-ack'].fields.VARIABLE[0],'轮回重置完成');
});
