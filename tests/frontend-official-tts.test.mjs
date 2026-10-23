import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestOfficialTts } from '../src/frontend/services/room/officialTts.mjs';
test('offline capacity prevents translation and job creation', async () => {
    let prepared=0, posts=0;
    await assert.rejects(requestOfficialTts('你好', {officialAccount:'offline-fixture'}, async (url, options) => {
        if(options.method==='POST')posts++;
        assert.equal(url,'/api/tts/official/status');
        return Response.json({success:true,data:{online:false}});
    }, async()=>{prepared++;return 'こんにちは。';}), /未发起翻译或合成/);
    assert.equal(prepared,0);assert.equal(posts,0);
});
test('repeated playback shares a job and never translates or charges twice', async () => {
    let prepared=0, posts=0, online=true;
    const request=async (url,options)=>{
        if(url.endsWith('/status'))return Response.json({success:true,data:{online}});
        if(url.endsWith('/audio'))return new Response('audio',{headers:{'Content-Type':'audio/wav'}});
        if(options.method==='POST'){posts++;assert.equal(JSON.parse(options.body).text,'こんにちは。');}
        return Response.json({success:true,data:{id:'req_voice_'+'b'.repeat(64),state:'ready'}});
    };
    const translate=async()=>{prepared++;return 'こんにちは。';};
    const a=await requestOfficialTts('你好',{officialAccount:'replay-fixture'},request,translate);
    online=false;
    const b=await requestOfficialTts('你好',{officialAccount:'replay-fixture'},request,translate);
    assert.equal(await a.text(),'audio');assert.equal(await b.text(),'audio');assert.equal(prepared,1);assert.equal(posts,1);
});
