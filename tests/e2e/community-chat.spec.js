const {test,expect} = require('../e2e-fixtures.cjs');

test('the primary navigation opens Moon Chat directly from the hub', async ({ page, isMobile }) => {
  await page.goto('/hub');
  const nav = page.locator(isMobile ? '.mobile-dock' : '.desktop-nav');
  const chat = nav.locator('a[href="/chatroom"]');
  await expect(chat).toBeInViewport();
  await expect(chat).toHaveAccessibleName(isMobile ? /^(聊天室|Chat|チャット)$/ : /^(月读聊天室|Moon Chat|月読チャット)$/);
  await chat.click();
  await expect(page).toHaveURL(/\/chatroom$/);
  await expect(page.locator('.moon-chat')).toBeVisible();
  await expect(page.locator('.site-header, .mobile-dock')).toHaveCount(0);
  await page.locator('.mc-hub:visible').click();
  await expect(chat).toBeInViewport();
});

test('two sessions exchange channel messages, quotes and withdrawals in real time',async({page,browser,baseURL},info)=>{
  const ctx=await browser.newContext({baseURL});
  const other=await ctx.newPage();
  try {
    const headers={Origin:new URL(baseURL).origin,'X-Requested-With':'XMLHttpRequest'};
    for (const [p,username] of [[page,`chatroom-sender-${info.project.name}`],[other,`chatroom-reader-${info.project.name}`]]) {
      const login=await p.request.post('/api/auth/login',{headers,data:{username,password:'e2e-password'}});
      expect(login.ok()).toBe(true);
      await p.goto('/chatroom?channel=studio');
      await expect(p.locator('#boot-splash')).toHaveCount(0);
      await expect(p.locator('.mc-compose textarea')).toBeVisible();
    }
    const message='一起来画月亮吧 '+info.project.name+' '+Date.now();
    await page.locator('.mc-compose textarea').fill(message);
    await page.locator('.mc-send').click();
    const row=other.locator('.mc-message').filter({has:other.getByText(message,{exact:true})});
    await expect(row).toBeVisible();
    const firstPostedAt = Date.now();
    await row.locator('.mc-more').click();
    await other.getByRole('button',{name:'回复',exact:true}).click();
    await other.locator('.mc-compose textarea').fill('想画湖边的月亮。');
    await other.locator('.mc-send').click();
    await expect(page.locator('.mc-message blockquote').filter({hasText:message})).toBeVisible();
    const own=page.locator('.mc-message').filter({has:page.getByText(message,{exact:true})});
    await own.locator('.mc-more').click();
    await page.getByRole('button',{name:'撤回',exact:true}).click();
    await expect(other.getByText(message,{exact:true})).toHaveCount(0);
    await other.reload();
    await expect(other.locator('.mc-message blockquote').filter({hasText:'消息已撤回'}).last()).toBeVisible();
    const compact = await page.locator('.mc-picker').isVisible();
    await expect(page.locator('.site-header, .site-footer, .mobile-dock')).toHaveCount(0);
    const frame = await page.locator('.moon-chat').boundingBox();
    const viewport = page.viewportSize();
    expect(frame.x).toBeCloseTo(0,0);
    expect(frame.y).toBeCloseTo(0,0);
    expect(frame.width).toBeCloseTo(viewport.width,0);
    expect(frame.height).toBeCloseTo(viewport.height,0);
    const composer = await page.locator('.mc-compose').boundingBox();
    expect(viewport.height - composer.y - composer.height).toBeLessThan(40);
    await page.locator('.mc-presence-trigger').click();
    await expect(page.locator('.mc-roster')).toBeVisible();
    await expect(page.locator('.mc-assistant')).toContainText('免费');
    if (compact) await expect(page.locator('.mc-drawer')).toBeVisible();
    await page.locator('.mc-roster [data-modal-close]').click();
    await expect(page.locator('.mc-roster')).toHaveCount(0);
    await page.locator('.mc-compose textarea').fill('草稿');
    if (compact) await page.locator('.mc-picker').click();
    await page.locator('.mc-channels button').filter({hasText:'技术交流'}).click();
    await expect(page.locator('.mc-heading h2')).toContainText('技术交流');
    await expect(page.locator('.mc-compose textarea')).toHaveValue('');
    if (compact) await page.locator('.mc-picker').click();
    await page.locator('.mc-channels button').filter({hasText:'创作交流'}).click();
    await expect(page.locator('.mc-compose textarea')).toHaveValue('草稿');
    await expect(page.locator('.mc-drawer')).not.toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    const longMessage = Array.from({length: 60}, (_, i) => info.project.name+' 第 '+(i+1)+' 行').join('\n');
    // The server permits one message per member per second.
    await expect.poll(() => Date.now() - firstPostedAt).toBeGreaterThan(1000);
    await page.locator('.mc-compose textarea').fill(longMessage);
    await page.locator('.mc-send').click();
    await expect(page.locator('.mc-message-body p').filter({hasText:info.project.name+' 第 60 行'})).toHaveCount(1);
    const feed = page.locator('.mc-feed');
    await expect.poll(() => feed.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100);
    await expect.poll(() => feed.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await feed.evaluate(el => { el.scrollTop = 0; });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const pinned = await page.locator('.mc-compose').boundingBox();
    expect(pinned.y + pinned.height).toBeCloseTo(composer.y + composer.height,0);
    await page.locator('.mc-hub:visible').click();
    await expect(page).toHaveURL(/\/hub$/);
    await expect(page.locator('.site-header')).toBeVisible();
  } finally {await ctx.close();}
});

test('the chat composer follows a resized and panned keyboard viewport', async ({page, baseURL}, info) => {
  await page.setViewportSize({width:390, height:844});
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), {width:390, height:844, offsetTop:0, offsetLeft:0, scale:1});
    Object.defineProperty(window, 'visualViewport', {value:viewport, configurable:true});
  });
  const login = await page.request.post('/api/auth/login', {
    headers:{Origin:new URL(baseURL).origin,'X-Requested-With':'XMLHttpRequest'},
    data:{username:'chatroom-sender-'+info.project.name, password:'e2e-password'}
  });
  expect(login.ok()).toBe(true);
  await page.goto('/chatroom');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  const input = page.locator('.mc-compose textarea');
  await input.fill('今晚的月亮');
  await input.dispatchEvent('keydown', {key:'Enter', isComposing:true, keyCode:229, bubbles:true});
  await expect(input).toHaveValue('今晚的月亮');
  await page.evaluate(() => {
    Object.assign(window.visualViewport, {height:430, offsetTop:90});
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.chatroom-shell')).toHaveClass(/is-keyboard-open/);
  const panel = await page.locator('.moon-chat').boundingBox();
  const composer = await page.locator('.mc-compose').boundingBox();
  expect(panel.y).toBeCloseTo(90,0);
  expect(panel.height).toBeCloseTo(430,0);
  expect(composer.y + composer.height).toBeLessThanOrEqual(520);
  expect(composer.y + composer.height).toBeGreaterThan(490);
});

test('two clients exchange messages when a CDN buffers both streaming transports', async ({page, browser, baseURL}, info) => {
  const readerContext = await browser.newContext({baseURL});
  try {
    const reader = await readerContext.newPage();
    for (const client of [reader,page]) {
      await client.addInitScript(() => {
        const order = window.chatConnectionEvents = [];
        const fetch = window.fetch.bind(window);
        window.fetch = (url, options) => {
          if (String(url).includes('/api/chatroom/games/sync')) order.push('sync');
          return fetch(url, options);
        };
        window.WebSocket = class { close() { order.push('socket closed'); } };
        window.EventSource = class { close() {} };
      });
    }
    const headers = {Origin:new URL(baseURL).origin, 'X-Requested-With':'XMLHttpRequest'};
    const login = await page.request.post('/api/auth/login',{
      headers, data:{username:'chatroom-sync-'+info.project.name, password:'e2e-password'}
    });
    expect(login.ok()).toBe(true);
    const open = async client => {
      const sync = client.waitForResponse(r => r.url().includes('/api/chatroom/games/sync') && r.ok());
      await client.goto('/chatroom?channel=games');
      await sync;
    };
    await Promise.all([open(page),open(reader)]);
    const events = await reader.evaluate(() => window.chatConnectionEvents);
    expect(events[0]).toBe('sync');
    expect(events.filter(event => event === 'sync')).toHaveLength(1);
    const text = '频道同步 '+info.project.name+' '+Date.now();
    await page.locator('.mc-compose textarea').fill(text);
    await page.locator('.mc-send').click();
    await expect(reader.locator('.mc-message-body p').filter({hasText:text})).toHaveCount(1,{timeout:12000});
  } finally { await readerContext.close(); }
});
