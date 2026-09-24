const { test, expect } = require('../e2e-fixtures.cjs');

test.use({ launchOptions: { args: ['--no-proxy-server'] } });

async function openMemoryManager(page) {
  await page.locator('.room-advanced-settings > summary').click();
  const manager = page.locator('.room-memory-manager');
  await manager.locator('.memory-manager-toggle').click();
  return manager;
}

async function loginAsUser(page) {
  await page.goto('/login');
  await page.locator('#loginAccount').fill('e2e-user');
  await page.locator('#loginPassword').fill('e2e-password');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/hub$/);
}

function sameOriginWriteHeaders(page) {
  return {
    Origin: new URL(page.url()).origin,
    'Sec-Fetch-Site': 'same-origin',
    'X-Requested-With': 'XMLHttpRequest'
  };
}

for (const width of [1280, 390]) {
  test(`signed-in Room memory can be edited and reopened at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginAsUser(page);
    const marker = `e2e-memory-edit-${width}-${Date.now()}`;
    const initialSummary = `${marker} original`;
    const nextSummary = `${marker} updated`;
    const nextContent = `  The ${marker} project now has a revised delivery plan.\n\n  Keep the second paragraph indented.\n`;
    const created = await page.request.post('/api/room/memory', {
      headers: sameOriginWriteHeaders(page),
      data: {
        type: 'episodic',
        summary: initialSummary,
        content: `The ${marker} project has an original delivery plan.`,
        force: true,
        captureChat: false
      }
    });
    expect(created.status()).toBe(201);
    const memoryId = (await created.json()).data.id;

    await page.goto('/room/settings');
    const manager = await openMemoryManager(page);
    const item = manager.locator('.memory-item').filter({ hasText: initialSummary });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: '编辑' }).click();

    const editor = manager.locator('.memory-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toBeInViewport();
    await expect(editor.locator('input[type="text"]').first()).toBeFocused();
    await editor.locator('select').selectOption('project');
    await editor.locator('input[type="text"]').first().fill(nextSummary);
    await editor.locator('textarea').fill(nextContent);
    await editor.locator('input[type="text"]').nth(1).fill('edited, project');
    const scores = editor.locator('input[type="range"]');
    await scores.first().focus();
    await scores.first().press('Home');
    await scores.nth(1).focus();
    await scores.nth(1).press('Home');
    const saved = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && response.url().includes(`/api/room/memory/${memoryId}`));
    await editor.locator('button[type="submit"]').click();
    expect((await saved).status()).toBe(200);
    await expect(editor).toHaveCount(0);

    const detail = await page.request.get(`/api/room/memory/${memoryId}`);
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data).toMatchObject({
      id: memoryId,
      type: 'project',
      summary: nextSummary,
      content: nextContent,
      importance: 0,
      confidence: 0,
      tags: ['edited', 'project']
    });
    await page.reload();
    const reopened = await openMemoryManager(page);
    const editedItem = reopened.locator('.memory-item').filter({ hasText: nextSummary });
    await expect(editedItem).toBeVisible();
    await editedItem.getByRole('button', { name: '编辑' }).click();
    const reopenedEditor = reopened.locator('.memory-editor');
    await expect(reopenedEditor.locator('input[type="text"]').first()).toHaveValue(nextSummary);
    await expect(reopenedEditor.locator('textarea')).toHaveValue(nextContent);
    await expect(reopenedEditor).toContainText('0.00');
    if (width === 1280) {
      const savedAllSummary = `${marker} saved all`;
      await reopenedEditor.locator('input[type="text"]').first().fill(savedAllSummary);
      const savedAll = page.waitForResponse((response) => response.request().method() === 'PATCH'
        && response.url().includes(`/api/room/memory/${memoryId}`));
      await page.locator('.room-settings-actions .primary-btn').first().click();
      expect((await savedAll).status()).toBe(200);
      await expect(reopenedEditor).toHaveCount(0);
      const afterSaveAll = await page.request.get(`/api/room/memory/${memoryId}`);
      expect((await afterSaveAll.json()).data.summary).toBe(savedAllSummary);
    }
  });
}

test('failed detail fetch and validation preserve the existing server memory', async ({ page }) => {
  await loginAsUser(page);
  const marker = `e2e-memory-failure-${Date.now()}`;
  const content = `The ${marker} event happened on a clear evening.`;
  const created = await page.request.post('/api/room/memory', {
    headers: sameOriginWriteHeaders(page),
    data: { type: 'episodic', summary: marker, content, force: true, captureChat: false }
  });
  expect(created.status()).toBe(201);
  const memoryId = (await created.json()).data.id;

  await page.goto('/room/settings');
  const manager = await openMemoryManager(page);
  const item = manager.locator('.memory-item').filter({ hasText: marker });
  await expect(item).toBeVisible();
  const failDetail = (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.pathname === `/api/room/memory/${memoryId}`) {
      return route.fulfill({ status: 503, json: { success: false, message: 'Temporary detail failure' } });
    }
    return route.continue();
  };
  await page.route('**/api/room/memory/**', failDetail);
  await item.getByRole('button', { name: '编辑' }).click();
  await expect(manager.locator('.memory-editor')).toHaveCount(0);
  await expect(page.locator('.plaza-toast')).toContainText('Temporary detail failure');
  await page.unroute('**/api/room/memory/**', failDetail);

  await item.getByRole('button', { name: '编辑' }).click();
  const editor = manager.locator('.memory-editor');
  await expect(editor.locator('textarea')).toHaveValue(content);
  await editor.locator('input[type="text"]').first().fill(`${marker} draft`);
  await editor.locator('textarea').fill('');
  await editor.locator('button[type="submit"]').click();
  await expect(editor.getByRole('alert')).toContainText('记忆摘要和内容不能为空');
  await expect(editor.locator('input[type="text"]').first()).toHaveValue(`${marker} draft`);
  await expect(editor.locator('textarea')).toHaveValue('');
  const detail = await page.request.get(`/api/room/memory/${memoryId}`);
  expect((await detail.json()).data).toMatchObject({ summary: marker, content });
});

test('guest Room memory edit persists in IndexedDB', async ({ page }) => {
  const guestId = `e2e-guest-${Date.now()}`;
  const memoryId = `e2e-local-memory-${Date.now()}`;
  await page.addInitScript((id) => localStorage.setItem('roomMemoryGuestId', id), guestId);
  await page.goto('/room/settings');
  await page.evaluate(({ guestId, memoryId }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('tsukuyomi-room-memory', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore('memories', { keyPath: 'id' });
      store.createIndex('userKey', 'userKey', { unique: false });
      store.createIndex('createdAt', 'createdAt', { unique: false });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('memories', 'readwrite');
      tx.objectStore('memories').put({
        id: memoryId,
        userKey: `guest:${guestId}`,
        type: 'preference',
        summary: 'Guest memory before edit',
        content: 'Guest content before edit',
        importance: 0,
        confidence: 0,
        tags: ['old'],
        createdAt: new Date().toISOString()
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { guestId, memoryId });

  const manager = await openMemoryManager(page);
  const item = manager.locator('.memory-item').filter({ hasText: 'Guest memory before edit' });
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: '编辑' }).click();
  const editor = manager.locator('.memory-editor');
  await expect(editor).toBeInViewport();
  await expect(editor.locator('input[type="text"]').first()).toHaveValue('Guest memory before edit');
  await expect(editor).toContainText('0.00');
  await editor.locator('input[type="text"]').first().fill('Guest memory after edit');
  await editor.locator('textarea').fill('Guest content after edit');
  await editor.locator('input[type="text"]').nth(1).fill('new');
  await editor.locator('button[type="submit"]').click();
  await expect(editor).toHaveCount(0);

  await page.reload();
  const reopened = await openMemoryManager(page);
  await expect(reopened.locator('.memory-item').filter({ hasText: 'Guest memory after edit' })).toBeVisible();
  const record = await page.evaluate((id) => new Promise((resolve, reject) => {
    const request = indexedDB.open('tsukuyomi-room-memory', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('memories', 'readonly');
      const get = tx.objectStore('memories').get(id);
      get.onsuccess = () => { db.close(); resolve(get.result); };
      get.onerror = () => reject(get.error);
    };
  }), memoryId);
  expect(record).toMatchObject({
    summary: 'Guest memory after edit',
    content: 'Guest content after edit',
    importance: 0,
    confidence: 0,
    tags: ['new']
  });
});
