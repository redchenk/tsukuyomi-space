const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const originalFetch = global.fetch;
let server, base, calls = [];
before(async () => {
  const app = express(); app.use(express.json({ limit:'12mb' })); app.use('/bridge',require('../backend/routes/deepseek'));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
  global.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'file-fixture'}),{headers:{'content-type':'application/json'}});};
});
after(async()=>{global.fetch=originalFetch;server.closeAllConnections();await new Promise(r=>server.close(r));});
const send=(path,body,key='fixture-deepseek-personal-key')=>originalFetch(base+'/bridge'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Deepseek-Key':key},body:JSON.stringify(body)});
test('proxy never accepts site credential markers or arbitrary paths',async()=>{
  assert.equal((await send('/files',{},'tsukuyomi-site-session')).status,400);
  assert.equal((await send('/https://other.test/',{})).status,404);assert.equal(calls.length,0);
});
test('proxy fixes provider origin, forbids redirects, forces safety and keeps the caller key private',async()=>{
  const res=await send('/chat/completions',{model:'deepseek-flash',messages:[{role:'user',content:'hello'}],safety_check:{level:'low'}});
  assert.equal(res.status,200);const request=calls.at(-1);
  assert.equal(request.url,'https://api.deepseek.com/chat/completions');assert.equal(request.options.redirect,'error');
  assert.equal(request.options.headers.Authorization,'Bearer fixture-deepseek-personal-key');
  assert.equal(JSON.parse(request.options.body).safety_check.level,'high');
  assert.equal(res.headers.get('authorization'),null);assert.equal(res.headers.get('cache-control'),'no-store');
});
test('file form places purpose before file and rejects oversized uploads before upstream dispatch',async()=>{
  assert.equal((await send('/files',{file:{name:'a.txt',type:'text/plain',data:Buffer.from('hello').toString('base64')},purpose:'user_data'})).status,200);
  assert.deepEqual([...calls.at(-1).options.body.keys()],['purpose','file']);
  const before=calls.length;assert.equal((await send('/files',{file:{name:'huge.txt',data:Buffer.alloc(8*1024*1024+1).toString('base64')},purpose:'user_data'})).status,413);assert.equal(calls.length,before);
});
