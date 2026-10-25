const { test, expect } = require('../e2e-fixtures.cjs');

async function ready(page, url = '/game/gomoku') {
  await page.goto(url);
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
  if (url === '/game/gomoku') {
    await expect(page.locator('.site-pet-game-bubble')).toBeVisible();
    await closePetChat(page);
  }
}
async function openPetChat(page) {
  const pet = page.getByRole('button', { name: '与八千代下棋聊天', exact: true });
  await expect(pet).toBeVisible();
  if (await pet.getAttribute('aria-expanded') !== 'true') await pet.click();
  await expect(page.locator('.site-pet-game-bubble.is-expanded')).toBeVisible();
}
async function closePetChat(page) {
  const close = page.locator('.site-pet-game-bubble .bubble-close');
  if (await close.isVisible()) await close.click();
  await expect(page.locator('.site-pet-game-bubble')).toBeHidden();
}
const stones = page => page.locator('.gomoku-stone');
const cell = (page, index) => page.locator(`.gomoku-cell[data-index="${index}"]`);

test('game center opens both games; discovery and search use the new name', async ({ page }, testInfo) => {
  await ready(page, '/game');
  await expect(page.getByRole('heading', { name: '把时间留给一局小游戏。' })).toBeVisible();
  await expect(page.getByRole('link', { name: '开始快跑' })).toHaveAttribute('href', '/game/kaguya-run');
  await page.screenshot({ path: testInfo.outputPath('game-center.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: '和八千代下棋' }).click();
  await expect(page).toHaveURL(/\/game\/gomoku$/);
  await expect(page.getByRole('grid', { name: '五子棋棋盘' })).toBeVisible();
  await page.getByRole('link', { name: '返回游戏中心' }).click();
  if (testInfo.project.name === 'chromium') await page.locator('.site-search-trigger').click();
  else {
    await page.getByRole('button', { name: '探索', exact: true }).click();
    await expect(page.locator('#site-navigation').getByRole('link', { name: /游戏中心/ })).toBeVisible();
    await page.locator('.site-menu-search').click();
  }
  const search = page.locator('.site-search-dialog');
  await search.getByRole('combobox').fill('五子棋');
  await expect(search.getByRole('option', { name: /^游戏中心(?: \/game)?$/ })).toBeVisible();
  await search.getByRole('button', { name: '关闭搜索', exact: true }).click();
  await expect(search).not.toBeVisible();
  if (testInfo.project.name === 'chromium') {
    await page.locator('#site-nav-discover').click();
    await expect(page.locator('#site-panel-discover').getByRole('link', { name: /游戏中心/ })).toBeVisible();
  }
});

test('human and Yachiyo alternate, interact, hint, undo and resume after refresh', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await cell(page, 112).click();
  await expect(stones(page)).toHaveCount(2);
  await expect(page.locator('.gomoku-status')).toContainText('轮到你落子');
  await expect(cell(page, 112)).toBeDisabled();
  await cell(page, 112).evaluate(el => el.click());
  await expect(stones(page)).toHaveCount(2);
  await openPetChat(page);
  await expect(page.getByRole('button', { name: '不许放水哦' })).toBeDisabled();
  await expect(page.locator('.gomoku-chat-empty')).toContainText('连接 Room 中的聊天模型');
  await page.keyboard.press('Escape');
  await expect(page.locator('.site-pet-game-bubble')).toBeHidden();
  await page.getByRole('button', { name: '给我提示' }).click();
  await expect(page.locator('.gomoku-hint-mark')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
  await expect(stones(page)).toHaveCount(2);
  await expect(page.locator('.gomoku-storage')).toHaveText('上一局的棋盘还在，我们接着下。');
  await page.screenshot({ path: testInfo.outputPath('gomoku.png'), fullPage: true, animations: 'disabled' });
  await closePetChat(page);
  await page.getByRole('button', { name: '悔一步' }).click();
  await expect(stones(page)).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('keyboard controls, pending-turn cancellation, and second-player settings', async ({ page }) => {
  await ready(page);
  await cell(page, 112).focus();
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 113)).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '悔一步' }).click();
  await page.waitForTimeout(700);
  await expect(stones(page)).toHaveCount(0);
  await page.getByText('下一局设置', { exact: true }).click();
  await page.getByLabel('对弈难度', { exact: true }).selectOption('challenge');
  await page.getByLabel('谁先落子', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '按此设置开局' }).click();
  await expect(stones(page)).toHaveCount(1);
  await expect(cell(page, 112)).toHaveAttribute('aria-label', /黑棋/);
  await cell(page, 113).click();
  await expect(stones(page)).toHaveCount(3);
  await page.getByRole('button', { name: '悔一步' }).click();
  await expect(stones(page)).toHaveCount(1);
  await page.getByRole('button', { name: '再开一局' }).click();
  const dialog = page.getByRole('dialog', { name: '结束当前棋局，重新开始？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '继续这局' }).click();
  await expect(stones(page)).toHaveCount(1);
});

test('winning line stops play, undo recovers, and navigation cancels pending replies', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tsukuyomi.gomoku.v1', JSON.stringify({ version: 1, human: 1, difficulty: 'casual', moves: [0, 30, 1, 31, 2, 32, 3, 50] })));
  await ready(page);
  await cell(page, 4).click();
  await expect(page.locator('.gomoku-status')).toContainText('你赢了');
  await expect(page.locator('.is-winning')).toHaveCount(5);
  await expect(cell(page, 20)).toBeDisabled();
  await cell(page, 20).evaluate(el => el.click());
  await expect(stones(page)).toHaveCount(9);
  await page.getByRole('button', { name: '悔一步' }).click();
  await expect(stones(page)).toHaveCount(8);
  await cell(page, 100).click();
  await page.getByRole('link', { name: '返回游戏中心' }).click();
  const saved = await page.evaluate(() => localStorage.getItem('tsukuyomi.gomoku.v1'));
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => localStorage.getItem('tsukuyomi.gomoku.v1'))).toBe(saved);
  await page.getByRole('link', { name: '和八千代下棋' }).click();
  await expect(stones(page)).toHaveCount(10);
});

test.describe('runner iframe fixture', () => {
// Production permits HTTPS frames; the isolated local runtime fixture uses HTTP.
test.use({ bypassCSP: true });
test('corrupt or blocked storage does not prevent playing; runner still loads separately', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tsukuyomi.gomoku.v1', '{broken');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'tsukuyomi.gomoku.v1') throw new Error('quota'); return original.call(this, key, value); };
  });
  await ready(page);
  await cell(page, 112).click();
  await expect(stones(page)).toHaveCount(2);
  await expect(page.locator('.gomoku-storage')).toContainText('暂时无法保存');
  await page.route('**/game-runtime/**', route => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "script-src 'unsafe-inline'" }, body: '<script>parent.postMessage({type:"tsukuyomi:kaguya-status",status:"ready"},"*")</script>' }));
  await page.getByRole('link', { name: '返回游戏中心' }).click();
  await page.getByRole('link', { name: '开始快跑' }).click();
  await expect(page.getByRole('heading', { name: '辉夜快跑', exact: true })).toBeVisible();
  await expect(page.locator('.game-frame')).toBeVisible();
  await expect(page.locator('.game-loading')).toBeHidden();
});

});

test('English and Japanese copies and dark mode keep the board usable', async ({ page }, testInfo) => {
  await ready(page);
  await page.getByRole('button', { name: '账号菜单', exact: true }).click();
  await page.locator('#site-navigation').getByRole('button', { name: '切换深色主题', exact: true }).click();
  await page.locator('#site-navigation').getByRole('button', { name: '日本語', exact: true }).click();
  await page.locator('#site-navigation .site-nav-drawer-head button').click();
  await expect(page.getByRole('heading', { name: '月下の五目並べ' })).toBeVisible();
  await cell(page, 112).click();
  await expect(stones(page)).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('gomoku-dark-ja.png'), fullPage: true, animations: 'disabled' });
  await page.evaluate(() => localStorage.setItem('lang', 'en'));
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Moonlit Gomoku' })).toBeVisible();
  await expect(stones(page)).toHaveCount(2);
});


test('large square board stays centered and cells never overlap', async ({ page }, testInfo) => {
  await ready(page);
  const board = await page.locator('.gomoku-board').boundingBox();
  const frame = await page.locator('.gomoku-board-frame').boundingBox();
  const viewport = page.viewportSize();
  expect(Math.abs(board.width - board.height)).toBeLessThan(2);
  expect(Math.abs(frame.x + frame.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(board.x + board.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(board.width).toBeGreaterThan(testInfo.project.name === 'chromium' ? 600 : viewport.width - 85);
  const top = await cell(page, 112).boundingBox(), below = await cell(page, 127).boundingBox();
  expect(top.y + top.height).toBeLessThanOrEqual(below.y + 1);
  await expect(page.locator('.site-pet')).toHaveCount(1);
  await expect(page.locator('.gomoku-companion, .gomoku-yachiyo')).toHaveCount(0);
});

async function configureModel(page) {
  await page.addInitScript(() => localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true,
    apiUrl: 'https://fixture.test/v1/chat/completions', model: 'fixture-model', apiKey: 'fixture-key' })));
}

test('one global pet opens a nonmodal bubble, keeps drafts, and returns to the site guide outside Gomoku', async ({ page }, info) => {
  await configureModel(page);
  await ready(page);
  await openPetChat(page);
  const bubble = page.getByRole('dialog', { name: '与八千代的棋局对话', exact: true });
  await expect(bubble).toHaveAttribute('aria-modal', 'false');
  await expect(page.locator('.site-guide-backdrop')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  const before = await page.locator('.gomoku-board').boundingBox();
  const input = page.getByLabel('和八千代说句话', { exact: true });
  await input.fill('等一下，我还在想');
  await page.keyboard.press('Escape');
  await expect(bubble).toBeHidden();
  await expect(page.locator('.site-pet')).toBeFocused();
  await openPetChat(page);
  await expect(input).toHaveValue('等一下，我还在想');
  const after = await page.locator('.gomoku-board').boundingBox();
  expect(Math.abs(before.width - after.width)).toBeLessThan(1);
  const bounds = await bubble.boundingBox(), size = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
  await page.screenshot({ path: info.outputPath('pet-game-bubble.png'), animations: 'disabled' });
  await closePetChat(page);
  await page.getByRole('link', { name: '返回游戏中心', exact: true }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator('.site-pet-game-bubble')).toHaveCount(0);
  await page.locator('.site-pet').click();
  await expect(page.getByRole('dialog', { name: '八千代向导', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭向导', exact: true }).click();
  await page.getByRole('link', { name: '和八千代下棋', exact: true }).click();
  await expect(page.locator('.site-pet')).toHaveCount(1);
  await expect(page.locator('.site-guide-backdrop')).toHaveCount(0);
  await openPetChat(page);
  await expect(input).toHaveValue('');
});

test('LLM uses the shared persona, current board, free chat and hint context', async ({ page }, testInfo) => {
  const character = require('../../shared/room-character.cjs');
  const policy = require('../../shared/room-dialogue.cjs').policy;
  const requests = [];
  await configureModel(page);
  await page.route('**/api/chat/stream', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'text/event-stream', body: `event: delta\ndata: {"text":"我看见你的棋了。"}\n\nevent: done\ndata: {"reply":"我看见你的棋了。"}\n\n` });
  });
  await ready(page);
  expect(requests).toHaveLength(0);
  const settingsBefore = await page.evaluate(() => localStorage.getItem('roomLLMSettings'));
  await cell(page, 112).click();
  await expect(page.locator('.site-pet-speech')).toContainText('我看见你的棋了。');
  await openPetChat(page);
  await expect(page.locator('.gomoku-chat-assistant[data-state="complete"]')).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].systemPrompt).toContain(character.corePrompt());
  const board = JSON.parse(requests[0].message).board;
  expect(board.black).toEqual(['H8']);
  expect(board.moveCount).toBe(2);
  expect(board.white).toHaveLength(1);
  expect(board.next).toBe('human');
  await page.getByLabel('和八千代说句话', { exact: true }).fill('不要开玩笑，这一步怎么看？');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.gomoku-chat-assistant[data-state="complete"]')).toHaveCount(2);
  expect(requests[1].systemPrompt).toContain(policy.notes.noBanter);
  expect(JSON.parse(requests[1].message).userText).toBe('不要开玩笑，这一步怎么看？');
  expect(requests[1].conversation).toHaveLength(2);
  await closePetChat(page);
  await page.getByRole('button', { name: '给我提示', exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  await openPetChat(page);
  await expect(page.locator('.gomoku-chat-assistant[data-state="complete"]')).toHaveCount(3);
  const hint = JSON.parse(requests[2].message);
  expect(hint.event).toBe('hint');
  expect(hint.board.hint).toMatch(/^[A-O]\d{1,2}$/);
  await expect(page.locator('.gomoku-cell.is-hint')).toHaveAttribute('aria-label', new RegExp(hint.board.hint));
  expect(requests[2].systemPrompt).toContain(policy.notes.noBanter);
  await page.getByLabel('落子时回应', { exact: true }).uncheck();
  await closePetChat(page);
  await page.getByRole('button', { name: '悔一步', exact: true }).click();
  await expect(stones(page)).toHaveCount(0);
  expect(requests).toHaveLength(3);
  await openPetChat(page);
  await page.getByRole('button', { name: '不许放水哦', exact: true }).click();
  await expect(page.locator('.gomoku-chat-assistant[data-state="complete"]')).toHaveCount(4);
  expect(JSON.parse(requests[3].message).board.moveCount).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('roomLLMSettings'))).toBe(settingsBefore);
  expect(await page.evaluate(() => localStorage.getItem('roomChatHistory:guest'))).toBeNull();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('gomoku-llm.png'), fullPage: true, animations: 'disabled' });
});

test('streamed text is visible before completion; stopping and a new board reject stale output', async ({ page }) => {
  await configureModel(page);
  await page.addInitScript(() => {
    const fetchOriginal = window.fetch.bind(window);
    window.gomokuStreams = [];
    window.fetch = (input, options = {}) => {
      if (typeof input !== 'string' || new URL(input, location.href).pathname !== '/api/chat/stream') return fetchOriginal(input, options);
      const entry = { request: JSON.parse(options.body), aborted: false };
      const body = new ReadableStream({ start(controller) { entry.controller = controller; } });
      options.signal.addEventListener('abort', () => { entry.aborted = true; entry.controller.error(new DOMException('Aborted', 'AbortError')); }, { once: true });
      window.gomokuStreams.push(entry);
      return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
    };
    window.deliverGomoku = (index, text, done = false) => {
      const entry = window.gomokuStreams[index];
      if (entry.aborted) return;
      const chunk = done ? `event: done\ndata: ${JSON.stringify({ reply: text })}\n\n` : `event: delta\ndata: ${JSON.stringify({ text })}\n\n`;
      entry.controller.enqueue(new TextEncoder().encode(chunk));
      if (done) entry.controller.close();
    };
  });
  await ready(page);
  await openPetChat(page);
  await page.getByRole('button', { name: '不许放水哦', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.gomokuStreams.length)).toBe(1);
  await page.evaluate(() => window.deliverGomoku(0, '那我可要认真'));
  await expect(page.locator('.gomoku-chat-assistant[data-state="streaming"]')).toContainText('那我可要认真');
  await expect(page.getByRole('button', { name: '停止回应', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止回应', exact: true }).click();
  await expect(page.locator('.gomoku-chat-assistant[data-state="stopped"]')).toContainText('回应未完成');
  expect(await page.evaluate(() => window.gomokuStreams[0].aborted)).toBe(true);
  await page.getByRole('button', { name: '重新回应', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.gomokuStreams.length)).toBe(2);
  await closePetChat(page);
  expect(await page.evaluate(() => window.gomokuStreams[1].aborted)).toBe(false);
  await cell(page, 112).click();
  await expect(stones(page)).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.gomokuStreams.length)).toBe(3);
  expect(await page.evaluate(() => window.gomokuStreams[1].aborted)).toBe(true);
  await page.evaluate(() => window.deliverGomoku(1, '过期回应', true));
  await page.evaluate(() => window.deliverGomoku(2, '棋盘中央这一手，我接住了。', true));
  await openPetChat(page);
  await expect(page.locator('.gomoku-chat-assistant[data-state="complete"]')).toContainText('棋盘中央这一手');
  await expect(page.locator('.gomoku-chat-log')).not.toContainText('过期回应');
  await page.getByRole('button', { name: '这局我要赢', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.gomokuStreams.length)).toBe(4);
  await closePetChat(page);
  await page.getByRole('link', { name: '返回游戏中心', exact: true }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect.poll(() => page.evaluate(() => window.gomokuStreams[3].aborted)).toBe(true);
});

test('failed model reply can be retried; model changes clear game chat', async ({ page }) => {
  await configureModel(page);
  let calls = 0;
  await page.route('**/api/chat/stream', route => {
    calls++;
    return calls === 1 ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"fixture-private-provider-error"}' })
      : route.fulfill({ contentType: 'text/event-stream', body: 'event: done\ndata: {"reply":"我回来了，继续吧。"}\n\n' });
  });
  await ready(page);
  await openPetChat(page);
  await page.getByRole('button', { name: '让我想想', exact: true }).click();
  await expect(page.locator('.gomoku-chat-error')).toContainText('这次没能接通模型');
  await expect(page.locator('.site-pet-game-bubble')).not.toContainText('fixture-private-provider-error');
  await page.getByRole('button', { name: '重新回应', exact: true }).click();
  await expect(page.locator('.gomoku-chat-assistant[data-state="complete"]')).toContainText('我回来了');
  await page.getByLabel('和八千代说句话', { exact: true }).fill('还没有发出的消息');
  await page.evaluate(() => { localStorage.removeItem('roomLLMSettings'); window.dispatchEvent(new StorageEvent('storage', { key: 'roomLLMSettings' })); });
  await expect(page.locator('.gomoku-chat-turn')).toHaveCount(0);
  await expect(page.getByLabel('和八千代说句话', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('和八千代说句话', { exact: true })).toHaveValue('');
  await closePetChat(page);
  await cell(page, 112).click();
  await expect(stones(page)).toHaveCount(2);
  expect(calls).toBe(2);
});

test('official Room session works without a separately configured API key', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('roomLLMSettings', JSON.stringify({
    apiUrl: `${location.origin}/official-api/v1/chat/completions`, model: 'site-model', useProxy: false
  })));
  await page.route('**/official-api/api/dashboard', route => route.fulfill({ json: { enabled: true, me: { account_id: 'fixture-account' }, models: [{ id: 'site-model', enabled: true, max_output_tokens: 2048, provider: 'deepseek' }] } }));
  let request;
  await page.route('**/official-api/v1/chat/completions', route => {
    request = route.request().postDataJSON();
    return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"那就认真下一局。"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n' });
  });
  await ready(page);
  await openPetChat(page);
  await page.getByRole('button', { name: '不许放水哦', exact: true }).click();
  await expect(page.locator('.gomoku-chat-assistant[data-state="complete"]')).toContainText('那就认真下一局');
  expect(request.max_tokens).toBe(1024);
  expect(request.thinking).toEqual({ type: 'disabled' });
  expect(JSON.parse(request.messages.at(-1).content).userText).toBe('不许放水哦');
});
