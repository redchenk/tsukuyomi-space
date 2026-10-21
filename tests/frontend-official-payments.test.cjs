const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
let service;
const load = async () => service ||= await import('../src/frontend/services/official-service.mjs');
test('billing display preserves tiny charges and signed credits without float rounding', async () => {
  const { moneyAtoms, rateAtoms } = await load();
  for (const [atoms, value] of [['1','0.000000001'], ['0','0.00'], ['2200000000','2.20'], ['-1234567890','-1.23456789'], ['123456789123456789','123456789.123456789']]) assert.equal(moneyAtoms(atoms),value);
  assert.equal(rateAtoms('0.044'),'44000000'); assert.equal(rateAtoms('29.70'),'29700000000');
  for (const value of ['NaN','1e5','-1','0.0000000001','1.00oops']) assert.throws(() => rateAtoms(value));
});
test('official requests use Cookie, no-store and account guards, without legacy bearer fallback', async () => {
  const { officialRequest, assertDashboardAccount } = await load(); let calls = 0;
  const request = async (url, options) => { calls++; assert.equal(url,'/official-api/api/admin/settings'); assert.equal(options.credentials,'same-origin'); assert.equal(options.cache,'no-store'); assert.equal(options.headers.Authorization,undefined); assert.equal(options.headers['X-Official-Expected-Account'],'acct-a'); assert.deepEqual(JSON.parse(options.body),{enabled:false}); return {ok:true,json:async()=>({revision:2})}; };
  assert.deepEqual(await officialRequest('/api/admin/settings',{method:'POST',body:{enabled:false},account:'acct-a',request}),{revision:2});
  await assert.rejects(officialRequest('/api/admin/settings',{method:'POST',request}),/确认当前账号/); assert.equal(calls,1);
  await assert.rejects(officialRequest('//evil.test',{request}),/地址无效/);
  assert.throws(()=>assertDashboardAccount({me:{site_user_id:'b',account_id:'acct-b'},models:[]},'a'),/账号已变化/);
  assert.throws(()=>assertDashboardAccount({me:{site_user_id:'a',account_id:'acct-a'}},'a'),/账号已变化/);
  assert.equal(assertDashboardAccount({me:{site_user_id:'a',account_id:'acct-a'},models:[]},'a').me.account_id,'acct-a');
});
test('account change and server errors are surfaced instead of treated as successful updates', async () => {
  const {officialRequest}=await load();
  await assert.rejects(officialRequest('/api/usage',{account:'acct-a',request:async()=>({ok:false,status:409,json:async()=>({error:{code:'ACCOUNT_CHANGED',message:'账号已切换'}})})}),error=>error.code==='ACCOUNT_CHANGED'&&error.status===409);
});
// Exercise page initialization without a browser: an unavailable API service must
// not suppress the authoritative site wallet or payment order history.
function pageRuntime({catalogFailure=false}={}) {
  let code=fs.readFileSync('src/frontend/pages/PaymentsPage.vue','utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\n/gm,'');
  const calls=[],mounted=[];const context={ref:value=>({value}),computed:fn=>({get value(){return fn();}}),onMounted:fn=>mounted.push(fn),onUnmounted:()=>{},useRoute:()=>({query:{}}),useRouter:()=>({replace:()=>{}}),loadCurrentSession:async()=>({user:{id:'site-a'},admin:false}),paymentRequest:async path=>{calls.push(path); if(path.endsWith('/catalog')){if(catalogFailure)throw Error('catalog offline');return {enabled:true,products:[]};} if(path.includes('/orders'))return {items:[],page:1,totalPages:1};return {available_atoms:'5000000000',balance_atoms:'5000000000',held_atoms:'0'};},Map,Boolean,String,window:{clearTimeout:()=>{}},crypto:require('node:crypto').webcrypto};
  vm.createContext(context);vm.runInContext(code+'\nthis.state={authed,wallet,loading,error,siteUserId};',context);return {context,calls,start:()=>mounted[0]()};
}
test('payment page still loads site wallet and orders if the catalog read fails',async()=>{
  const page=pageRuntime({catalogFailure:true});await page.start();assert.equal(page.context.state.loading.value,false);assert.equal(page.context.state.authed.value,true);assert.equal(page.context.state.wallet.value.available_atoms,'5000000000');assert.equal(page.context.state.siteUserId.value,'site-a');assert.ok(page.calls.includes('/api/payments/orders?page=1'));
});
