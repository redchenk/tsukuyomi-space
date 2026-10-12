'use strict';
// Local-only fixture. Test broadcasts and seeded scores never reach a site API.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
if (!process.env.KAGUYA_HTML || !process.env.KAGUYA_ARCHIVE) throw new Error('Set KAGUYA_HTML and KAGUYA_ARCHIVE to verified operator-supplied exports');
const htmlPath=path.resolve(process.env.KAGUYA_HTML);
const archivePath=path.resolve(process.env.KAGUYA_ARCHIVE);
const port=Number(process.env.KAGUYA_PORT||4182);
if (!Number.isInteger(port)||port<1024||port>65535) throw new Error('Invalid fixture port');
let html=fs.readFileSync(htmlPath,'utf8');
const hook=`<script>
window.__rideErrors=[];window.addEventListener('error',e=>__rideErrors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>__rideErrors.push(String(e.reason)));
window.__rideSnapshot=()=>{const runtime=vm.runtime,stage=runtime.getTargetForStage();if(!window.__rideCounting){window.__rideCounting=true;window.__rideFrames=0;runtime.on('AFTER_EXECUTE',()=>window.__rideFrames++);}const values=Object.fromEntries(Object.values(stage.variables).map(v=>[v.name,v.value]));const rider=runtime.targets.find(t=>t.isOriginal&&t.getName()==='feichua');return {riderClones:runtime.targets.filter(t=>!t.isOriginal&&t.getName()==='feichua').length,frames:window.__rideFrames,values,y:rider?.y,x:rider?.x,visible:rider?.visible,threads:runtime.threads.length,clones:runtime._cloneCounter,errors:__rideErrors,contextLost:vm.renderer._gl.isContextLost(),phase:window.__kaguyaStability?.inspect().phase};};
window.__rideStart=async()=>{vm.greenFlag();await new Promise(resolve=>setTimeout(resolve,500));vm.runtime.startHats('event_whenbroadcastreceived',{BROADCAST_OPTION:'1111'});};
window.__rideReset=()=>vm.runtime.startHats('event_whenbroadcastreceived',{BROADCAST_OPTION:'死亡重开'});
window.__rideEnterRun=()=>vm.runtime.startHats('event_whenbroadcastreceived',{BROADCAST_OPTION:'顶1'});
window.__ridePickup=()=>{const values=Object.values(vm.runtime.getTargetForStage().variables);values.find(v=>v.name==='分数').value=810;values.find(v=>v.name==='心情值').value=100;values.find(v=>v.name==='自主扣血吗').value=0;vm.runtime.startHats('event_whenbroadcastreceived',{BROADCAST_OPTION:'辉夜消失'});};
window.__rideKey=(key,isDown)=>vm.postIOData('keyboard',{key,isDown});
</script>`;
const end=html.lastIndexOf('</body>');html=html.slice(0,end)+hook+html.slice(end);
http.createServer((req,res)=>{if(req.url==='/game-runtime/kaguya-run-ef04c26b4900-r9.sb3'){res.writeHead(200,{'Content-Type':'application/octet-stream','Access-Control-Allow-Origin':'*',...(archivePath.endsWith('.gz')?{'Content-Encoding':'gzip'}:{})});fs.createReadStream(archivePath).pipe(res);}else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}else{res.writeHead(404);res.end();}}).listen(port,'127.0.0.1',()=>console.log('Kaguya ride fixture on http://127.0.0.1:'+port));
