const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
function load(storage) {
    const context = { crypto, TextEncoder, Uint8Array, sessionStorage:storage };
    const source = readFileSync(require.resolve('../src/frontend/services/driftSubmission.js'),'utf8').replace('export function ', 'function ');
    vm.runInNewContext(source+'\nthis.create = createDriftSubmissions;',context);
    return context.create();
}
function storage() {
    const values = new Map();
    return { values, getItem:key=>values.get(key), setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key) };
}
test('lost acknowledgement keeps the same request ID across tracker reload without storing private text', async () => {
    const tab = storage();
    const body = await load(tab).prepare('user:bottle','A private note','zh');
    const retry = await load(tab).prepare('user:bottle','A private note','zh');
    assert.equal(retry.requestId,body.requestId);
    assert.equal(retry.content,'A private note');
    assert.equal([...tab.values.values()].some(value=>value.includes('A private note')),false);
});
test('edits, language, users and bottles have independent submissions; successful send permits a new identical note', async () => {
    const tracker = load(storage());
    const first = await tracker.prepare('user:reply:1','Hello','zh');
    for (const args of [['other:reply:1','Hello','zh'],['user:reply:2','Hello','zh'],['user:bottle','Hello','zh'],['user:reply:1','Hello','ja'],['user:reply:1','Edited','zh']]) {
        assert.notEqual((await tracker.prepare(...args)).requestId,first.requestId);
    }
    const latest = await tracker.prepare('user:reply:1','Edited','zh');
    tracker.complete('user:reply:1',first.requestId);
    assert.equal((await tracker.prepare('user:reply:1','Edited','zh')).requestId,latest.requestId);
    tracker.complete('user:reply:1',latest.requestId);
    assert.notEqual((await tracker.prepare('user:reply:1','Edited','zh')).requestId,latest.requestId);
});
test('blocked or stale session storage does not break in-page retries', async () => {
    const tab = { getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');},removeItem:()=>{throw Error('denied');} };
    const tracker = load(tab);
    const first = await tracker.prepare('user:bottle','Hello','zh');
    assert.equal((await tracker.prepare('user:bottle','Hello','zh')).requestId,first.requestId);
    tracker.complete('user:bottle',first.requestId);
    assert.notEqual((await tracker.prepare('user:bottle','Hello','zh')).requestId,first.requestId);
});
