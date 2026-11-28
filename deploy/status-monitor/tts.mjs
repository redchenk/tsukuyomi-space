import { createRequire } from 'node:module';
import { hasMp3Frames } from './audio.mjs';
import { publish, sample } from './sample.mjs';

const requireSite = createRequire(process.cwd() + '/package.json');
const directory = process.env.STATE_DIRECTORY;
await publish(directory, async () => {
  const {settings,freeFishProbeKey} = requireSite('./backend/services/official-tts-settings');
  const cfg = settings('default');
  if (!cfg) return {state:'down',evidence:'disabled'};
  const response = await fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/tts/official/status',
    {signal:AbortSignal.timeout(18000),redirect:'error'});
  const {success,data} = await response.json();
  if (!response.ok || !success || typeof data?.online !== 'boolean' || !Number.isFinite(data.checkedAt)
      || Math.abs(Date.now()-data.checkedAt)>120000) return {state:'unknown',evidence:'stale'};
  const freeDuringBillingFailure = cfg.protocol==='fish-audio' && cfg.publicModels.includes('s2.1-pro-free') && data.reason==='credit_unavailable';
  if (!data.online && !freeDuringBillingFailure) return {state:'down',evidence:'voice_offline',at:data.checkedAt};
  if (cfg.nativeProbe) return {state:'up',evidence:'generated_audio',at:data.checkedAt};
  if (cfg.protocol!=='fish-audio' || (!freeDuringBillingFailure && data.defaultModel!=='s2.1-pro-free')) {
    return {state:'unknown',evidence:'readiness_only',at:data.checkedAt};
  }
  const fish=requireSite('./shared/fish-audio.cjs');
  const {fetchFishAudio}=requireSite('./backend/services/fish-audio-transport');
  const sampled=await sample(directory,freeFishProbeKey(cfg),null,async()=>{
    const options=fish.request('こんにちは。',{apiKey:cfg.key,model:'s2.1-pro-free',voice:cfg.voice});
    const audio=await fetchFishAudio(cfg.endpoint,{...options,redirect:'error',signal:AbortSignal.timeout(25000)});
    if(!audio.ok || !audio.body){await audio.body?.cancel();return {state:'down',evidence:'provider_rejected'};}
    const reader=audio.body.getReader();
    const chunks=[];let length=0;
    try { for (;;) {
      const {done,value}=await reader.read();if(done)break;
      length+=value.length;if(length>2*1024*1024)throw Error('oversized audio');
      chunks.push(value);
    } } finally {await reader.cancel().catch(()=>{});}
    const bytes=Buffer.concat(chunks);
    const ok=length>=256 && fish.isMp3(bytes) && hasMp3Frames(bytes) && /audio\/|octet-stream/i.test(audio.headers.get('content-type')||'');
    return {state:ok?'up':'down',evidence:ok?'generated_audio':'invalid_audio'};
  },undefined,{preserveResultWhileSampling:true});
  if (sampled.state==='up' && freeDuringBillingFailure) {
    return {...sampled,state:'degraded',evidence:'audio_ok_credit_unavailable'};
  }
  return sampled;
});
