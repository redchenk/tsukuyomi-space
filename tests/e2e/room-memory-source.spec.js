const { test, expect } = require('../e2e-fixtures.cjs');

test.use({ launchOptions: { args: ['--no-proxy-server'] } });

const ZERO_CONTENT = '  我的猫喜欢安静的夜晚。\n\n  保留第二段缩进，也保留末尾换行。\n';

function writeHeaders(page) {
  return { Origin: new URL(page.url()).origin, 'Sec-Fetch-Site': 'same-origin', 'X-Requested-With': 'XMLHttpRequest' };
}

async function configure(page, guestId) {
  await page.addInitScript((id) => {
    localStorage.setItem('roomMemoryGuestId', id);
    localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: true }));
  }, guestId);
  const requests = [];
  await page.route('**/api/chat/stream', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: done\ndata: {"reply":"我记下了，也会参考已有记忆。"}\n\n' });
  });
  await page.goto('/login');
  const records = [
    { id: `${guestId}-cat`, userKey: `guest:${guestId}`, type: 'preference', summary: '本地猫的名字',
      content: '我的本地猫叫麦芽。', importance: 0.4, confidence: 0.7, tags: ['猫', '本地'],
      createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z' },
    { id: `${guestId}-zero`, userKey: `guest:${guestId}`, type: 'episodic', summary: '零分值段落记忆',
      content: ZERO_CONTENT, importance: 0, confidence: 0, tags: ['段落'],
      createdAt: '2026-09-02T12:00:00.000Z', updatedAt: '2026-09-02T12:00:00.000Z' }
  ];
  await page.evaluate((rows) => new Promise((resolve, reject) => {
    const request = indexedDB.open('tsukuyomi-room-memory', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore('memories', { keyPath: 'id' });
      store.createIndex('userKey', 'userKey', { unique: false });
      store.createIndex('createdAt', 'createdAt', { unique: false });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('memories', 'readwrite');
      for (const row of rows) tx.objectStore('memories').put(row);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), records);
  return { requests, records };
}

async function readLocalRows(page, userKey) {
  return page.evaluate((key) => new Promise((resolve, reject) => {
    const request = indexedDB.open('tsukuyomi-room-memory', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('memories', 'readonly');
      const get = tx.objectStore('memories').index('userKey').getAll(key);
      get.onsuccess = () => { db.close(); resolve(get.result); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  }), userKey);
}

async function login(page, username) {
  await page.goto('/login');
  await page.locator('#loginAccount').fill(username);
  await page.locator('#loginPassword').fill('mem0-test-password');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/hub$/);
}

async function seedCloud(page) {
  const created = await page.request.post('/api/room/memory', {
    headers: writeHeaders(page),
    data: { type: 'preference', summary: '云端猫的名字', content: '我的云端猫叫云栖。',
      importance: 0.6, confidence: 0.85, force: true, captureChat: false }
  });
  expect(created.status()).toBe(201);
  return (await created.json()).data;
}

async function cloudRows(page) {
  const response = await page.request.get('/api/room/memory?view=manage&limit=200');
  expect(response.status()).toBe(200);
  const rows = (await response.json()).data.items;
  return Promise.all(rows.map(async (row) => {
    const detail = await page.request.get(`/api/room/memory/${row.id}`);
    expect(detail.status()).toBe(200);
    return (await detail.json()).data;
  }));
}

async function readChoice(page, accountId) {
  return page.evaluate((id) => JSON.parse(localStorage.getItem(`roomMemorySource:${id}`) || 'null'), accountId);
}

async function expectChooser(page) {
  const chooser = page.locator('.memory-source-choice');
  await expect(chooser).toBeVisible();
  await expect(chooser).toHaveCSS('opacity', '1');
  await expect(chooser.getByRole('button', { name: '使用本地数据', exact: true })).toBeVisible();
  await expect(chooser.getByRole('button', { name: '合并本地与云端数据', exact: true })).toBeVisible();
  await expect(chooser.getByRole('button', { name: '使用云端数据', exact: true })).toBeVisible();
  return chooser;
}

async function openMemoryManager(page) {
  const menu = page.locator('.settings-mobile-menu');
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: '长期记忆', exact: true }).click();
  return page.locator('.room-memory-manager');
}

async function send(page, message, accountId) {
  const before = await page.locator('.chat-message.assistant:not([aria-busy="true"])').count();
  await page.locator('#chatInput').fill(message);
  await page.locator('#sendChatBtn').click();
  await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toHaveCount(before + 1);
  await expect(page.locator('#chatInput')).toBeEnabled();
  await expect.poll(() => page.evaluate((id) => localStorage.getItem(`roomChatGeneration:${id}`), accountId)).toBeNull();
}

async function newChat(page) {
  page.once('dialog', (dialog) => dialog.accept());
  const mobileTools = page.locator('.room-tools-disclosure');
  if (await mobileTools.isVisible()) {
    await mobileTools.locator('summary').click();
    await mobileTools.getByRole('button', { name: '新建会话', exact: true }).click();
  } else {
    await page.locator('.chat-session-toolbar').getByRole('button', { name: '新建会话', exact: true }).click();
  }
  await expect(page.locator('.chat-message.assistant')).toHaveCount(0);
}

for (const width of [1280, 390]) {
  test(`memory source local choice, scores and explicit merge work at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 844 });
    const accountId = width === 1280 ? 'memory-source-local-desktop' : 'memory-source-local-mobile';
    const guestId = `source-guest-${width}`;
    const { requests, records } = await configure(page, guestId);
    await login(page, accountId);
    const cloud = await seedCloud(page);
    const originalCloud = await cloudRows(page);

    await page.goto('/room/settings');
    const chooser = await expectChooser(page);
    await page.screenshot({ path: testInfo.outputPath(`source-choice-${width}.png`), fullPage: true, animations: 'disabled' });
    await chooser.getByRole('button', { name: '使用本地数据', exact: true }).click();
    await expect(chooser).toBeHidden();
    await expect(page.locator('.memory-source-status')).toContainText('本地');
    await expect(page.getByRole('button', { name: '重新选择', exact: true })).toBeVisible();
    expect(await readChoice(page, accountId)).toMatchObject({ mode: 'local', fingerprint: expect.any(String) });
    expect((await readChoice(page, accountId)).fingerprint).not.toBe('');
    expect(await readLocalRows(page, `guest:${guestId}`)).toEqual(records);
    const copies = await readLocalRows(page, `user-local:${accountId}`);
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      expect(copy.userKey).toBe(`user-local:${accountId}`);
      expect(copy.id).toMatch(new RegExp(`^user-local:${accountId}:import:`));
    }
    expect(await cloudRows(page)).toEqual(originalCloud);

    const manager = await openMemoryManager(page);
    await expect(manager.locator('.memory-item').filter({ hasText: '本地猫的名字' })).toBeVisible();
    await expect(manager.locator('.memory-item').filter({ hasText: '云端猫的名字' })).toHaveCount(0);
    await manager.locator('.memory-item').filter({ hasText: '本地猫的名字' }).getByRole('button', { name: '编辑' }).click();
    const editor = manager.locator('.memory-editor');
    const editedContent = '  我的本地猫叫麦芽，喜欢窗边晒太阳。\n\n  第二段缩进应在保存与合并后保留。\n';
    await editor.locator('input[type="text"]').first().fill('本地猫的名字（已编辑）');
    await editor.locator('textarea').fill(editedContent);
    await editor.getByLabel('重要度数值', { exact: true }).fill('0.23');
    await editor.getByLabel('置信度数值', { exact: true }).fill('0.91');
    await editor.locator('button[type="submit"]').click();
    await expect(editor).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.memory-source-choice')).toBeHidden();
    expect(await readChoice(page, accountId)).toMatchObject({ mode: 'local' });
    const reopened = await openMemoryManager(page);
    await reopened.locator('.memory-item').filter({ hasText: '本地猫的名字（已编辑）' }).getByRole('button', { name: '编辑' }).click();
    await expect(reopened.locator('.memory-editor').getByLabel('重要度数值', { exact: true })).toHaveValue('0.23');
    await expect(reopened.locator('.memory-editor').getByLabel('置信度数值', { exact: true })).toHaveValue('0.91');
    await expect(reopened.locator('.memory-editor textarea')).toHaveValue(editedContent);
    await page.screenshot({ path: testInfo.outputPath(`source-local-scores-${width}.png`), fullPage: true, animations: 'disabled' });
    expect(await readLocalRows(page, `guest:${guestId}`)).toEqual(records);

    const turns = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/room/chat/turn')) turns.push(request.postDataJSON());
    });
    await page.goto('/room');
    await send(page, '我的本地猫和云端猫叫什么名字？', accountId);
    expect(requests.at(-1).systemPrompt).toContain('麦芽');
    expect(requests.at(-1).systemPrompt).not.toContain('云栖');
    await send(page, '我的猫还喜欢纸箱，我的家乡在苏州。', accountId);
    await expect.poll(async () => (await readLocalRows(page, `user-local:${accountId}`)).length).toBe(4);
    expect(turns).toHaveLength(2);
    for (const turn of turns) expect(turn).toMatchObject({ memorySource: 'local', memoryEnabled: false });
    expect(await cloudRows(page)).toEqual(originalCloud);

    await page.goto('/room/settings');
    await page.getByRole('button', { name: '重新选择', exact: true }).click();
    await expectChooser(page);
    const imported = page.waitForResponse((response) => response.url().endsWith('/api/room/memory/import') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '合并本地与云端数据', exact: true }).click();
    const importResponse = await imported;
    expect(importResponse.status()).toBe(201);
    const importRequest = importResponse.request().postDataJSON();
    expect(importRequest.expectedUserId).toBe(accountId);
    expect(importRequest.records).toHaveLength(4);
    expect((await importResponse.json()).data).toMatchObject({ imported: 4, skipped: 0, count: 5 });
    await expect(page.locator('.memory-source-choice')).toBeHidden();
    await expect(page.locator('.memory-source-status')).toContainText('云端');
    expect(await readChoice(page, accountId)).toMatchObject({ mode: 'cloud', fingerprint: expect.any(String) });
    const merged = await cloudRows(page);
    expect(merged).toHaveLength(5);
    expect(merged.find((row) => row.id === cloud.id)).toEqual(originalCloud.find((row) => row.id === cloud.id));
    expect(merged.find((row) => row.summary === '本地猫的名字（已编辑）')).toMatchObject({ content: editedContent, importance: 0.23, confidence: 0.91 });
    expect(merged.find((row) => row.summary === '零分值段落记忆')).toMatchObject({ content: ZERO_CONTENT, importance: 0, confidence: 0 });
    expect(await readLocalRows(page, `guest:${guestId}`)).toEqual(records);
    // Exercise the real backend receipt for a retry of the exact import request.
    const duplicate = await page.request.post('/api/room/memory/import', { headers: writeHeaders(page), data: importRequest });
    expect(duplicate.status()).toBe(200);
    expect((await duplicate.json()).data).toMatchObject({ imported: 0, skipped: 4, count: 5 });

    await page.goto('/room');
    await newChat(page);
    await page.reload();
    await send(page, '我的本地猫和云端猫叫什么名字？', accountId);
    expect(requests.at(-1).systemPrompt).toContain('麦芽');
    expect(requests.at(-1).systemPrompt).toContain('云栖');
    await page.screenshot({ path: testInfo.outputPath(`source-merged-chat-${width}.png`), fullPage: true, animations: 'disabled' });
  });
}

test('choosing cloud leaves guest records intact and performs no import', async ({ page }, testInfo) => {
  const accountId = 'memory-source-cloud', guestId = 'source-guest-cloud';
  const { requests, records } = await configure(page, guestId);
  await login(page, accountId);
  await seedCloud(page);
  const before = await cloudRows(page);
  let importCalls = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/room/memory/import')) importCalls += 1; });
  await page.goto('/room/settings');
  const chooser = await expectChooser(page);
  await chooser.getByRole('button', { name: '使用云端数据', exact: true }).click();
  await expect(chooser).toBeHidden();
  expect(await readChoice(page, accountId)).toMatchObject({ mode: 'cloud', fingerprint: expect.any(String) });
  expect(await cloudRows(page)).toEqual(before);
  expect(await readLocalRows(page, `guest:${guestId}`)).toEqual(records);
  expect(await readLocalRows(page, `user-local:${accountId}`)).toEqual([]);
  await page.reload();
  await expect(page.locator('.memory-source-choice')).toBeHidden();
  await page.goto('/room');
  await send(page, '我的本地猫和云端猫叫什么名字？', accountId);
  expect(requests.at(-1).systemPrompt).toContain('云栖');
  expect(requests.at(-1).systemPrompt).not.toContain('麦芽');
  expect(importCalls).toBe(0);
  expect(await readLocalRows(page, `guest:${guestId}`)).toEqual(records);
  await page.screenshot({ path: testInfo.outputPath('source-cloud-chat.png'), fullPage: true, animations: 'disabled' });
});

test('failed memory import remains unresolved and can retry the real backend', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const accountId = 'memory-source-retry', guestId = 'source-guest-retry';
  const { records } = await configure(page, guestId);
  await login(page, accountId);
  await seedCloud(page);
  const before = await cloudRows(page);
  const failImport = (route) => route.fulfill({ status: 503, json: { success: false, message: '导入暂时失败，请重试' } });
  await page.route('**/api/room/memory/import', failImport);
  await page.goto('/room/settings');
  const chooser = await expectChooser(page);
  await chooser.getByRole('button', { name: '合并本地与云端数据', exact: true }).click();
  await expect(chooser).toContainText('导入暂时失败，请重试');
  await expect(chooser.getByRole('button', { name: '合并本地与云端数据', exact: true })).toBeEnabled();
  expect(await readChoice(page, accountId)).toBeNull();
  expect(await cloudRows(page)).toEqual(before);
  expect(await readLocalRows(page, `guest:${guestId}`)).toEqual(records);
  await page.screenshot({ path: testInfo.outputPath('source-import-failure-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.reload();
  await expectChooser(page);
  expect(await readChoice(page, accountId)).toBeNull();
  await page.unroute('**/api/room/memory/import', failImport);
  const imported = page.waitForResponse((response) => response.url().endsWith('/api/room/memory/import') && response.request().method() === 'POST');
  await chooser.getByRole('button', { name: '合并本地与云端数据', exact: true }).click();
  expect((await imported).status()).toBe(201);
  await expect(chooser).toBeHidden();
  expect(await readChoice(page, accountId)).toMatchObject({ mode: 'cloud', fingerprint: expect.any(String) });
  expect(await cloudRows(page)).toHaveLength(3);
  expect(await readLocalRows(page, `guest:${guestId}`)).toEqual(records);
});
