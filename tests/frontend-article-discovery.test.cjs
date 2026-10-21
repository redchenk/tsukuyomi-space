const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const source=fs.readFileSync('src/frontend/services/articleDiscovery.mjs','utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 let time=0,next=0,callback;const timers=new Map(),listeners=new Map(),calls=[],store=new Map();
 const document={visibilityState:'visible',addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
 const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 const Observer=class{constructor(fn,options){callback=fn;assert.deepEqual(Array.from(options.threshold),[0,0.5,1]);}observe(){}disconnect(){}};
 const request=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>({success:true,data:url.endsWith('/session')?{token:'signed-proof'}:{counted:[11]}})};};
 const context={AbortController,Map,Set,JSON,Number,Date,globalThis:undefined};delete context.globalThis;
 vm.runInNewContext(source+'\nglobalThis.create=createArticleDiscoveryTracker;globalThis.read=discoveryReadToken;',context);
 const tracker=context.create({request,documentImpl:document,Observer,storage,setTimer:(fn,delay)=>{timers.set(++next,{at:time+delay,fn});return next;},clearTimer:id=>timers.delete(id)});
 return{tracker,calls,storage,context,root:{querySelectorAll:()=>[{dataset:{articleId:'11'}}]},
  visible:ratio=>callback([{target:{dataset:{articleId:'11'}},isIntersecting:ratio>0,intersectionRatio:ratio}]),
  hide:()=>{document.visibilityState='hidden';listeners.get('visibilitychange')?.();},show:()=>{document.visibilityState='visible';listeners.get('visibilitychange')?.();},
  tick:async ms=>{time+=ms;for(const[id,t]of[...timers])if(t.at<=time){timers.delete(id);await t.fn();}await Promise.resolve();},timers};
}
test('only half-visible cards held for a full continuous foreground second create an impression',async()=>{
 const f=fixture();await f.tracker.start(f.root,{sort:'featured'});assert.equal(f.calls.length,1);
 f.visible(0.49);await f.tick(2000);assert.equal(f.calls.length,1);
 f.visible(0.5);await f.tick(999);assert.equal(f.calls.length,1);
 f.hide();await f.tick(5000);assert.equal(f.calls.length,1);
 f.show();await f.tick(1000);await f.tick(100);assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].body.ids,[11]);
 assert.equal(f.context.read(11,f.storage),'signed-proof');
 f.visible(1);await f.tick(3000);assert.equal(f.calls.length,2);f.tracker.destroy();assert.equal(f.timers.size,0);
});
test('leaving the list before the duration threshold cancels observation and does not infer exposure',async()=>{
 const f=fixture();await f.tracker.start(f.root,{sort:'featured'});f.visible(1);await f.tick(900);f.tracker.stop();await f.tick(2000);assert.equal(f.calls.length,1);assert.equal(f.context.read(11,f.storage),'');
});
test('attribution tokens expire and malformed optional storage cannot block reading',()=>{
 const f=fixture();f.storage.setItem('tsukuyomi:article-discovery',JSON.stringify({11:{token:'old',at:1}}));assert.equal(f.context.read(11,f.storage,21*60000),'');
 f.storage.setItem('tsukuyomi:article-discovery','not-json');assert.equal(f.context.read(11,f.storage),'');
});
