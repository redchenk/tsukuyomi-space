const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tick = () => new Promise(setImmediate);
function setup() {
  let owner = 'a', mounted, unmounted, changed;
  const requests = [], listeners = new Map();
  const context = {
    ref: value => ({ value }), watch: (_, cb) => { changed = cb; }, onMounted: cb => { mounted = cb; }, onBeforeUnmount: cb => { unmounted = cb; },
    AbortController, setTimeout: () => 1, clearTimeout() {},
    getSession: () => owner ? { user: { id: owner } } : null,
    authFetch: () => new Promise(resolve => requests.push(resolve)), parseResponse: r => r.json(),
    ROOM_RELATIONSHIP_UPDATED: 'updated', owner: () => owner,
    window: { addEventListener: (name,cb) => listeners.set(name,cb), removeEventListener: name => listeners.delete(name) },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  };
  const code = fs.readFileSync('src/frontend/composables/room/useRoomRelationship.js','utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.runInNewContext(code+'\nglobalThis.api=useRoomRelationship(owner);',context);mounted();
  return { api:context.api, requests, updated: detail=>listeners.get('updated')({detail}), changeOwner: id=>{owner=id;changed();}, unmount:()=>unmounted(), listeners };
}
const reply = (score, ok=true) => ({ok,json:async()=>({success:ok,data:{score,pending:0}})});
test('a late read cannot replace a newer save receipt or leak into another account', async()=>{
  const h=setup();h.updated({userId:'a',relationship:{score:3,pending:0},change:{delta:1,reason:'日常交流'}});
  h.requests[0](reply(1));await tick();assert.equal(h.api.state.value.score,3);
  h.changeOwner('b');assert.equal(h.api.state.value,null);assert.equal(h.api.feedback.value,null);
  h.updated({userId:'a',relationship:{score:99,pending:0}});assert.equal(h.api.state.value,null);
  h.requests[1](reply(0));await tick();assert.equal(h.api.state.value.score,0);
  h.unmount();assert.equal(h.listeners.size,0);
});
test('a failed read is explicit and a retry can recover without inventing progress', async()=>{
  const h=setup();h.requests[0](reply(0,false));await tick();assert.equal(h.api.status.value,'error');assert.equal(h.api.state.value,null);
  const retry=h.api.refresh();h.requests[1](reply(7));await retry;assert.equal(h.api.state.value.score,7);assert.equal(h.api.feedback.value,null);
  h.changeOwner('');assert.equal(h.api.status.value,'guest');assert.equal(h.api.state.value,null);h.unmount();
});
