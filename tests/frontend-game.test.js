const assert=require('node:assert/strict');const {test}=require('node:test');const fs=require('node:fs');const vm=require('node:vm');
function fixture(load=async()=>({entries:[{userId:'a',rank:1,score:1}],page:1,totalPages:500})){
 const source=fs.readFileSync(require.resolve('../src/frontend/pages/GamePage.vue'),'utf8').split('<script setup>')[1].split('</script>')[0].replace(/^import .*;\n/gm,'').replace('import.meta.env.VITE_KAGUYA_GAME_URL',"''");
 const calls=[],timers=new Map();let nextTimer=1,unmount,accountWatch;
 const ctx=vm.createContext({Number,Map,Date,Intl,AbortController,nameInitial:()=>'',computed:fn=>({get value(){return fn();}}),ref:value=>({value}),defineProps:()=>({lang:'zh',t:{},user:{id:'user-a'}}),defineEmits:()=>()=>{},inject:()=>null,getSession:()=>null,onMounted:()=>{},onBeforeUnmount:fn=>unmount=fn,watch:(_,fn)=>accountWatch=fn,
  window:{location:{hostname:'localhost'},setTimeout(fn){const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},addEventListener(){},removeEventListener(){}},loadKaguyaLeaderboard:opts=>{calls.push(opts);return load(opts);},submitKaguyaScore:async score=>({current:{score,rank:2}})});
 vm.runInContext(source+'\nthis.game={refreshLeaderboard,flushScore,handleGameScore,leaderboard,leaderboardPage,leaderboardLoading,leaderboardError,bestScore,frame,props};',ctx);
 return {g:ctx.game,calls,timers,unmount:()=>unmount(),change:(id)=>{ctx.game.props.user={id};return accountWatch(id,'user-a');}};
}
test('a 25000-player board loads one page, keeps the previous page on network failure, and is explicitly paged',async()=>{
 let fail=false;const f=fixture(async opts=>{if(fail)throw new Error('network');return {entries:Array.from({length:50},(_,i)=>({userId:String(opts.page*50+i),rank:i+1,score:100})),page:opts.page,totalPages:500};});
 await f.g.refreshLeaderboard();assert.equal(f.calls.length,1);assert.equal(f.g.leaderboard.value.length,50);
 await f.g.refreshLeaderboard(2);assert.equal(f.calls.length,2);assert.equal(f.g.leaderboardPage.value,2);fail=true;await f.g.refreshLeaderboard(3);
 assert.equal(f.g.leaderboardPage.value,2);assert.equal(f.g.leaderboard.value.length,50);assert.equal(f.g.leaderboardError.value,true);
});
test('stale page requests are aborted and cannot overwrite a later result',async()=>{
 const jobs=[];const f=fixture(opts=>new Promise(resolve=>jobs.push({opts,resolve})));
 const a=f.g.refreshLeaderboard(1),b=f.g.refreshLeaderboard(2);assert.equal(jobs[0].opts.signal.aborted,true);
 jobs[1].resolve({entries:[{userId:'second'}],page:2,totalPages:4});await b;jobs[0].resolve({entries:[{userId:'stale'}],page:1,totalPages:4});await a;
 assert.equal(f.g.leaderboard.value[0].userId,'second');f.unmount();assert.equal(jobs[1].opts.signal.aborted,true);
});
test('score saves do not refresh the board or post a prior account\'s pending score',async()=>{
 const f=fixture();const frameWindow={};f.g.frame.value={contentWindow:frameWindow};f.g.handleGameScore({source:frameWindow,data:{type:'tsukuyomi:kaguya-score',score:12500}});
 await Promise.resolve();await Promise.resolve();assert.equal(f.calls.length,0);assert.equal(f.g.bestScore.value,12500);
 f.change('user-b');await Promise.resolve();assert.equal(f.timers.size,0);
});
