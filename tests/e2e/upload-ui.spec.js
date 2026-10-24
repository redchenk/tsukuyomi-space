const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { test, expect } = require('../e2e-fixtures.cjs');
test.beforeEach(async ({ context }, info) => {
  const identity = createHash('sha256').update(info.testId).digest('hex');
  await context.setExtraHTTPHeaders({ 'X-Upload-Fixture-Delay': '1800', 'X-Real-IP': `2001:db8:${identity.slice(0,4)}:${identity.slice(4,8)}::1` });
});
const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAQb7R3sAAAAASUVORK5CYII=', 'base64');
async function login(page) {
  await page.goto('/login');
  await page.locator('#loginAccount').fill('e2e-user');
  await page.locator('#loginPassword').fill('e2e-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
}
async function fits(page, selector) {
  try {
    await expect.poll(async () => page.locator(selector).evaluateAll(nodes => nodes.every(n => { const r=n.getBoundingClientRect();return r.x>=-1&&r.right<=innerWidth+1&&n.scrollWidth<=n.clientWidth+2; }))).toBe(true);
  } catch(error) {
    console.log(await page.locator(selector).evaluateAll(nodes=>nodes.map(n=>({class:n.className,rect:n.getBoundingClientRect().toJSON(),width:getComputedStyle(n).width,minWidth:getComputedStyle(n).minWidth,parent:n.parentElement.getBoundingClientRect().toJSON(),viewport:innerWidth}))));
    await page.screenshot({path:test.info().outputPath('overflow.png'),fullPage:true});
    throw error;
  }
  const boxes = await page.locator(selector).evaluateAll(nodes => nodes.map(n => ({ width:n.clientWidth, content:n.scrollWidth, x:n.getBoundingClientRect().x, right:n.getBoundingClientRect().right, viewport:innerWidth })));
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) { expect(b.content).toBeLessThanOrEqual(b.width + 2); expect(b.x).toBeGreaterThanOrEqual(-1); expect(b.right).toBeLessThanOrEqual(b.viewport + 1); }
}
test('measured slow upload, pause/resume and server confirmation remain readable on narrow screens', async ({ page, browserName }, info) => {
  test.setTimeout(90000);
  await login(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/attachments');
  await expect(page.locator('.attachments-hero')).toBeVisible();
  await expect.poll(() => page.locator('.attachments-search-tools :is(input,select), .attachments-upload-options select').evaluateAll(nodes => nodes.every(n => n.getBoundingClientRect().height >= 42))).toBe(true);
  await page.route('**/api/assets/uploads/*/complete', async route => {
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 2500));
    await route.fulfill({ response });
  });
  let cdp;
  if (browserName === 'chromium') {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline:false, latency:0, downloadThroughput:10000000, uploadThroughput:65536 });
  }
  const name = `附件中文长文件名_${info.project.name}_a-long-file-name-that-must-wrap-without-squeezing-buttons-or-clipping-any-progress-label.pdf`;
  const file = info.outputPath(name); const bytes = Buffer.alloc(256 * 1024, 65); bytes.write('%PDF-1.7'); fs.writeFileSync(file, bytes);
  await page.locator('input[type=file]').setInputFiles(file);
  const card = page.locator('.upload-progress-card');
  await expect(card).toBeVisible();
  if (cdp) {
    await expect.poll(async () => card.locator('progress').evaluate(n => n.value), { timeout:20000 }).toBeGreaterThan(0);
    expect(await card.locator('progress').evaluate(n => n.value)).toBeLessThan(100);
    await fits(page, '.upload-progress-card, .upload-progress-file, .attachments-search-tools');
    await page.screenshot({ path:info.outputPath('actual-byte-progress-320.png'),fullPage:true });
    await card.getByRole('button', { name:'暂停上传' }).click();
    await expect(card).toHaveAttribute('data-stage','paused');
    await page.locator('input[type=file]').setInputFiles(file);
  }
  await expect(card).toHaveAttribute('data-stage','processing', { timeout:20000 });
  await expect(card).toContainText('等待服务器确认');
  expect(await card.locator('progress').evaluate(n => n.value)).toBe(100);
  await fits(page, '.upload-progress-card, .upload-progress-file');
  await expect(card).toHaveAttribute('data-stage','complete',{timeout:20000});
  await expect(page.locator('.attachments-grid')).toContainText(name);
  if(cdp) await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  const assets = await (await page.request.get('/api/assets')).json();
  const asset = assets.data.assets.find(a=>a.metadata.fileName===name); expect(asset).toBeTruthy();
  const downloaded = await page.request.get(`/api/assets/proxy/${asset.id}`); expect(await downloaded.body()).toEqual(bytes);
  await page.request.delete(`/api/assets/${asset.id}`,{headers:{Origin:new URL(page.url()).origin,'X-Requested-With':'XMLHttpRequest'}});
});
test('editor modal keeps controls readable and inserts the uploaded attachment', async ({ page }, info) => {
  await login(page); await page.goto('/editor');
  await page.getByRole('button',{name:'上传 / 选择附件',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'附件库'});
  for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:740});
    await fits(page,'.editor-asset-modal, .editor-asset-tools');
    await page.screenshot({path:info.outputPath(`editor-attachments-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:320,height:740});
  await page.route('**/api/assets/uploads/*/complete',async route=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,1200));await route.fulfill({response});});
  await dialog.locator('input[type=file]').setInputFiles({name:'文章编辑器长附件文件名-layout-verification.txt',mimeType:'text/plain',buffer:Buffer.from('Public local fixture attachment')});
  await expect(dialog.locator('.upload-progress-card')).toBeVisible();
  await fits(page,'.editor-asset-modal, .upload-progress-card, .upload-progress-file');
  await expect(dialog).not.toBeVisible({timeout:15000});
  await expect(page.locator('#editorContent')).toHaveValue(/文章编辑器长附件文件名-layout-verification/);
});
test('gallery and avatar show server processing before success',async({page},info)=>{
  await login(page); await page.setViewportSize({width:390,height:844});
  for(const [path,endpoint,input] of [['/gallery/manage','/api/assets','.gallery-file-input'],['/user-center','/api/user/avatar','input[type=file]']]) {
    await page.goto(path);
    await expect(page.locator(input)).toBeAttached();
    await page.locator(input).setInputFiles({name:'头像和图库图片排版验证.png',mimeType:'image/png',buffer:IMAGE});
    const card=page.locator('.upload-progress-card');
    await expect(card).toHaveAttribute('data-stage','processing');
    await expect(card).toContainText('等待服务器确认');
    await fits(page,'.upload-progress-card, .upload-progress-file');
    await page.screenshot({path:info.outputPath(path.includes('gallery')?'gallery-processing.png':'avatar-processing.png'),fullPage:true});
    await expect(card).toHaveAttribute('data-stage','complete',{timeout:12000});
  }
});

test('cover preparation stays distinct from article upload and publication waits for confirmation',async({page},info)=>{
  await login(page);await page.goto('/editor');
  await page.locator('.editor-cover-upload input[type=file]').setInputFiles({name:'文章封面.png',mimeType:'image/png',buffer:IMAGE});
  const cover=page.locator('.upload-progress-card').filter({hasText:'文章封面.png'});
  await expect(cover).toHaveAttribute('data-stage','complete');
  await expect(cover).toContainText('发布文章时上传');
  expect(await cover.locator('progress').count()).toBe(0);
  await page.locator('#editorTitle').fill(`附件界面本地测试-${info.project.name}`);
  await page.locator('#editorContent').fill('This is a public local fixture verifying article cover upload confirmation.');
  await page.locator('.editor-form button[type=submit]').click();
  const publishing=page.locator('.upload-progress-card[data-stage=processing]');
  await expect(publishing).toBeVisible();
  await expect(publishing).toContainText('等待服务器确认');
  await expect(page).toHaveURL(/\/stage$/,{timeout:15000});
});

test('Room images wait for private upload confirmation before starting the reply', async ({page},info) => {
  await page.addInitScript(() => {
    localStorage.setItem('roomLLMSettings', JSON.stringify({useProxy:true}));
    localStorage.setItem('roomMemorySettings', JSON.stringify({enabled:false}));
  });
  let replyStarted=false;
  await page.route('**/api/chat/stream', route => {
    replyStarted=true;
    return route.fulfill({status:200,contentType:'text/event-stream',body:'event: delta\ndata: {"text":"图片收到了。"}\n\nevent: done\ndata: {"reply":"图片收到了。"}\n\n'});
  });
  await login(page); await page.setViewportSize({width:390,height:844}); await page.goto('/room');
  await page.locator('#chatImageInput').setInputFiles({name:'聊天图片-very-long-file-name-that-should-wrap-without-squeezing-the-remove-or-send-buttons.png',mimeType:'image/png',buffer:IMAGE});
  const card=page.locator('.room-image-upload');
  await expect(card).toContainText('发送时上传');
  expect(await card.locator('progress').count()).toBe(0);
  await fits(page,'.room-image-upload, .upload-progress-file, #chatImagePreview');
  await page.locator('#chatInput').fill('看看这张图片'); await page.locator('#sendChatBtn').click();
  await expect(card).toHaveAttribute('data-stage','processing');
  await expect(card).toContainText('等待服务器确认');
  expect(replyStarted).toBe(false);
  await fits(page,'.room-image-upload, .upload-progress-file');
  await page.screenshot({path:info.outputPath('room-image-processing-390.png'),fullPage:true});
  await expect(card).toHaveAttribute('data-stage','complete');
  await expect(card).toContainText('图片已上传');
  await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])').last()).toContainText('图片收到了。');
  await expect(page.locator('#sendChatBtn')).toBeVisible();
  const assistant=page.locator('.chat-message.assistant').last();
  const shareButton=assistant.getByRole('button',{name:'分享这轮对话'});
  if (!await shareButton.isVisible()) await assistant.locator('.room-message-options summary').click();
  await shareButton.click();
  const dialog=page.getByRole('dialog',{name:'对话分享卡'});
  await dialog.getByRole('button',{name:'创建公开链接'}).click();
  const shareCard=dialog.locator('.upload-progress-card');
  await expect(shareCard).toHaveAttribute('data-stage','processing');
  await fits(page,'.room-share-dialog, .room-share-dialog .upload-progress-card, .room-share-dialog .upload-progress-file');
  await expect(shareCard).toHaveAttribute('data-stage','complete');
  await expect(shareCard).toContainText('分享卡已上传');
});
