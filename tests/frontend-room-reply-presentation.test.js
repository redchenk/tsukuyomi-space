const assert = require('node:assert/strict');
const { test } = require('node:test');
const presentation = () => import('../src/frontend/services/room/roomReplyPresentation.mjs');

function clock() {
  const tasks = new Map();
  let id = 0;
  let elapsed = 0;
  return {
    schedule(fn, delay) { tasks.set(++id, { fn, delay }); return id; },
    unschedule(id) { tasks.delete(id); },
    step() {
      const first = tasks.entries().next().value;
      if (!first) return false;
      tasks.delete(first[0]);
      elapsed += first[1].delay;
      first[1].fn();
      return true;
    },
    get count() { return tasks.size; },
    get elapsed() { return elapsed; }
  };
}

test('short chat becomes separate pieces without losing punctuation, quotes or emoji', async () => {
  const { splitRoomReply } = await presentation();
  assert.deepEqual(splitRoomReply('啊，被抓到了。\n\n好啦，你说，八千代听着～'), ['啊，被抓到了。', '好啦，你说，八千代听着～']);
  assert.deepEqual(splitRoomReply('「要一起吗？」（眨眼）当然呀！👩‍🚀'), ['「要一起吗？」', '（眨眼）当然呀！', '👩‍🚀']);
  const text = ('这是一段完整的说明，'.repeat(18) + '不能遗漏。').repeat(8);
  const parts = splitRoomReply(text);
  assert.ok(parts.length > 8);
  assert.equal(parts.join(''), text);
});

test('English URLs, decimal numbers, abbreviations and code remain readable', async () => {
  const { splitRoomReply } = await presentation();
  assert.deepEqual(splitRoomReply('Dr. Lee paid 3.14 today. Look at https://example.com/a?x=1.2 next!'), [
    'Dr. Lee paid 3.14 today.', 'Look at https://example.com/a?x=1.2 next!'
  ]);
  const code = '```js\nconsole.log("你好。世界！");\n\nrun();\n```';
  assert.deepEqual(splitRoomReply(code), [code]);
  assert.deepEqual(splitRoomReply('Use `a.b()` here. Then run it!'), ['Use `a.b()` here.', 'Then run it!']);
});

test('first words render immediately and queued pieces arrive in order with a bounded final wait', async () => {
  const { createRoomReplyPresenter } = await presentation();
  const timer = clock();
  const updates = [];
  const presenter = createRoomReplyPresenter({ ...timer, onUpdate: parts => updates.push(parts) });
  presenter.update('八千');
  assert.deepEqual(updates.at(-1), ['八千']);
  presenter.update('八千代也会紧张。只是藏得好一点。');
  assert.deepEqual(updates.at(-1), ['八千代也会紧张。']);
  assert.equal(timer.count, 1);
  const reply = '八千代也会紧张。只是藏得好一点。' + '继续说明。'.repeat(12);
  const done = presenter.finish(reply);
  while (timer.step()) {}
  await done;
  assert.equal(updates.at(-1).join(''), reply);
  assert.ok(timer.elapsed <= 1801);
  assert.equal(timer.count, 0);
});

test('stopping or leaving during presentation cancels the queue and rejects completion', async () => {
  const { createRoomReplyPresenter } = await presentation();
  const timer = clock();
  const controller = new AbortController();
  const updates = [];
  const presenter = createRoomReplyPresenter({ ...timer, signal: controller.signal, onUpdate: parts => updates.push(parts) });
  const done = presenter.finish('第一句。第二句。第三句。');
  controller.abort();
  await assert.rejects(done, { name: 'AbortError' });
  assert.equal(timer.count, 0);
  presenter.update('不该到达。');
  assert.equal(updates.length, 1);
  await assert.rejects(presenter.finish('迟到的回复。'), { name: 'AbortError' });
});

test('reduced-motion presentation skips artificial waiting and keeps the full turn', async () => {
  const { createRoomReplyPresenter } = await presentation();
  let parts;
  const presenter = createRoomReplyPresenter({ immediate: true, schedule() { throw new Error('Unexpected delay'); }, onUpdate: value => { parts = value; } });
  await presenter.finish('来了。\n\n今天想说什么？');
  assert.deepEqual(parts, ['来了。', '今天想说什么？']);
});
