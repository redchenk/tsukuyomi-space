const { test, expect } = require('../e2e-fixtures.cjs');

test('another device generates a complete cloud diary and retains messages sent during generation', async ({ page, browser, baseURL }, testInfo) => {
  const username = `diary-cross-device-${testInfo.project.name}`;
  const login = await page.request.post('/api/auth/login', { headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' }, data: { username, password: 'mem0-test-password' } });
  expect(login.status()).toBe(200);
  const user = (await login.json()).data.user;
  await page.addInitScript(user => localStorage.setItem('tsukuyomi_user', JSON.stringify(user)), user);
  await page.addInitScript(() => {
    localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
  });
  await page.route('**/lib/live2dcubismcore-v5.min.js', route => route.fulfill({ status: 404, body: '' }));
  let releaseDiary;
  const waitForDiary = new Promise(resolve => { releaseDiary = resolve; });
  let prompt;
  await page.route('**/api/chat', async route => {
    prompt = route.request().postDataJSON().message;
    await waitForDiary;
    await route.fulfill({ json: { success: true, data: { reply: '从早上的早餐和旅行计划，到晚上的月亮和晚安，今天的每一次交谈我都记在了心里。' } } });
  });
  await page.goto('/room');
  await expect(page.locator('#chatMessages')).toContainText('手机晚上的月亮和晚安');
  // This browser has never sent a turn: its local diary recorder is empty.
  expect(await page.evaluate(id => localStorage.getItem(`roomDiaryArchive:${id}:recording`), user.id)).toBeNull();
  if (testInfo.project.name.includes('mobile')) {
    await page.locator('.room-tools-disclosure > summary').click();
    await page.getByRole('button', { name: '结束聊天', exact: true }).click();
  } else await page.locator('#endChatBtn').click();
  const dialog = page.getByRole('dialog', { name: '结束聊天', exact: true });
  await expect(dialog).toContainText('260 条对话');
  await page.screenshot({ path: testInfo.outputPath('cross-device-complete-diary.png') });
  await dialog.getByRole('button', { name: '确认结束并写日记' }).click();
  await expect.poll(() => prompt).toContain('手机早上说的早餐和旅行计划');
  expect(prompt).toContain('手机晚上的月亮和晚安');
  expect(prompt).toContain('跨设备交流第50轮');

  const phone = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const otherLogin = await phone.request.post('/api/auth/login', { headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' }, data: { username, password: 'mem0-test-password' } });
    expect(otherLogin.status()).toBe(200);
    const late = await phone.request.post('/api/room/chat/turn', { headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' }, data: { turnId: 'late-phone-message', userMessage: '日记生成时手机发来的新消息', assistantMessage: '这条应该留给下一篇日记', memoryEnabled: false } });
    expect(late.status()).toBe(201);
    releaseDiary();
    await expect(page.getByRole('dialog', { name: '八千代的日记', exact: true })).toBeVisible();
    const remaining = await phone.request.get('/api/room/chat/diary');
    expect(remaining.status()).toBe(200);
    const state = (await remaining.json()).data;
    expect(state.total).toBe(2);
    expect(state.messages[0].content).toBe('日记生成时手机发来的新消息');
    expect(prompt).not.toContain('日记生成时手机发来的新消息');
    const diary = await phone.request.get('/api/room/diary');
    const entries = (await diary.json()).data.entries.filter(item => !item.deleted);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry.conversationLength).toBe(260);
  } finally { releaseDiary(); await phone.close(); }
});

test('relationship UI explains older points, zero-point reasons and can page through the full ledger', async ({ page, baseURL }, testInfo) => {
  const username = `diary-cross-device-${testInfo.project.name}`;
  const login = await page.request.post('/api/auth/login', { headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' }, data: { username, password: 'mem0-test-password' } });
  expect(login.status()).toBe(200);
  const records = Array.from({ length: 13 }, (_, i) => ({ turnId: `ledger-${i}`, delta: i === 12 ? 2 : 0,
    reason: i === 12 ? '表达信任' : '未发现可计分互动', scoreBefore: i === 12 ? 0 : 2, scoreAfter: 2, createdAt: '2026-10-11 03:00:00' }));
  const relationship = { enabled: true, score: 2, stage: '初次相识', pending: 0, totalRecords: 13, totalDelta: 2, recentDelta: 0, earlierDelta: 2, todayDelta: 0, records: records.slice(0, 12), nextCursor: 'ledger-11' };
  await page.route('**/api/room/memory/status?*', route => route.fulfill({ json: { success: true, data: { count: 2525, localIntelligence: { enabled: true, indexed: 2525, analysisFailed: 0, relationship } } } }));
  await page.route('**/api/room/relationship?*', route => route.fulfill({ json: { success: true, data: { ...relationship, records: records.slice(12), nextCursor: null } } }));
  await page.goto('/room/settings');
  const menu = page.locator('.settings-mobile-menu');
  await expect(menu).toBeAttached();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '长期记忆' }).click();
  const status = page.locator('.local-memory-status');
  await expect(status).toContainText('更早记录 +2');
  await expect(status).toContainText('日常分享 +1');
  await status.locator('summary').click();
  await expect(status).toContainText('未发现可计分互动');
  await status.getByRole('button', { name: '查看更早记录' }).click();
  await expect(status).toContainText('表达信任 · +2 · 0 → 2');
  await expect(status.getByRole('button', { name: '查看更早记录' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('relationship-full-ledger.png') });
});
