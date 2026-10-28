const { test, expect } = require('../e2e-fixtures.cjs');
const { waitForRoom, configureRoomFixture } = require('../e2e-room-helpers.cjs');

async function login(page, baseURL, username) {
  const response = await page.request.post('/api/auth/login', { headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' }, data: { username, password: 'mem0-test-password' } });
  expect(response.status()).toBe(200);
  const user = (await response.json()).data.user;
  await page.addInitScript(user => { localStorage.setItem('tsukuyomi_user', JSON.stringify(user)); localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false })); }, user);
}
async function setup(page) {
  await configureRoomFixture(page);
  await page.route('**/lib/live2dcubismcore-v5.min.js', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/chat/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'event: done\ndata: '+JSON.stringify({ reply: '我听见了，慢慢聊，今天有什么想分享的呢？' })+'\n\n' }));
  await page.goto('/room'); await waitForRoom(page);
}
async function openDrawer(page) {
  if (!await page.locator('.room-relationship-trigger:visible').count()) await page.locator('.room-tools-disclosure > summary').click();
  await page.locator('.room-relationship-trigger:visible').click();
  await expect(page.locator('.room-relationship-drawer')).toBeVisible();
  await expect(page.locator('.room-relationship-drawer')).toHaveCSS('opacity', '1');
}
async function closeDrawer(page) {
  await page.locator('.relationship-drawer-close').click();
  await expect(page.locator('.room-relationship-drawer')).toHaveCount(0);
}

test('completed chat visibly increases affinity, persists, and explains duplicates with memory disabled', async ({ page, browser, baseURL }, info) => {
  test.setTimeout(60000);
  const username = `affection-${info.project.name}`;
  await login(page, baseURL, username); await setup(page);
  await expect(page.locator('.room-conversation-surface .room-relationship')).toHaveCount(0);
  await expect(page.locator('.room-relationship-drawer')).toHaveCount(0);
  await openDrawer(page);
  const card=page.locator('.room-relationship');
  await expect(card.locator('.relationship-score')).toHaveText('0/1000');
  await closeDrawer(page);
  const send=async text=>{
    await page.locator('#chatInput').fill(text);
    await page.locator('#sendChatBtn').click();
    await expect(page.locator('.room-relationship-notice')).toBeVisible();
  };
  await send('今天想和你聊聊窗外的晚霞。');
  await expect(page.locator('.room-relationship-notice')).toContainText('好感度 +1');
  await page.screenshot({path:info.outputPath('affinity-compact-chat.png')});
  await page.locator('.room-relationship-notice').click();
  await expect(card.locator('.relationship-score')).toHaveText('1/1000');
  await expect(card.locator('.relationship-feedback')).toContainText('本次 +1');
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);
    await expect(card).toBeVisible();
    await expect(page.locator('.room-relationship-drawer')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
    await page.screenshot({path:info.outputPath(`affinity-${theme}.png`)});
  }
  await page.reload(); await waitForRoom(page);
  await expect(page.locator('.room-relationship-notice')).toHaveCount(0);
  await openDrawer(page);
  await expect(card.locator('.relationship-score')).toHaveText('1/1000');
  await closeDrawer(page);
  await send('今天想和你聊聊窗外的晚霞。');
  await expect(page.locator('.room-relationship-notice')).toContainText('未增加');
  await openDrawer(page);
  await expect(card.locator('.relationship-feedback')).toContainText('重复互动');
  await expect(card.locator('.relationship-score')).toHaveText('1/1000');
  await expect(card).toContainText('无需开启长期记忆或写日记');
  await expect(card).toContainText('日常交流');
  const other=await browser.newContext({baseURL});
  try {
    const p=await other.newPage();await login(p,baseURL,`affection-other-${info.project.name}`);await setup(p);await openDrawer(p);
    await expect(p.locator('.relationship-score')).toHaveText('0/1000');
  } finally {await other.close();}
});

test('daily limit and guest state provide explicit next steps', async({page,baseURL},info)=>{
  test.setTimeout(60000);
  await login(page,baseURL,`affection-cap-${info.project.name}`);
  for(let i=0;i<11;i++) {
    const r=await page.request.post('/api/room/chat/turn',{headers:{Origin:baseURL,'X-Requested-With':'XMLHttpRequest'},data:{turnId:`affinity-cap-${i}`,userMessage:`想聊今天的新话题 ${i}`,assistantMessage:'继续聊吧。',memoryEnabled:false}});
    expect(r.status()).toBe(201);
    const body=await r.json();expect(body.relationship.score).toBe(Math.min(10,i+1));
    if(i===10)expect(body.relationshipChange.reason).toBe('今日已达加分上限');
  }
  await setup(page);
  await openDrawer(page);
  const card=page.locator('.room-relationship');await expect(card).toContainText('今日 +10/10');
  await expect(card).toContainText('今日已达加分上限');
  // A fresh anonymous context must show sign-in rather than another account's score.
  const guest=await page.context().browser().newContext({baseURL});
  try {const p=await guest.newPage();await setup(p);await expect(p.locator('.relationship-guest')).toHaveCount(0);await openDrawer(p);await expect(p.locator('.relationship-guest')).toHaveText('登录后记录好感度');await expect(p.locator('.relationship-score')).toHaveCount(0);await p.keyboard.press('Escape');await expect(p.locator('.room-relationship-drawer')).toHaveCount(0);}finally{await guest.close();}
});

test('English and Japanese affinity feedback remains readable', async({page,baseURL},info)=>{
  await login(page,baseURL,`affection-other-${info.project.name}`);
  await page.addInitScript(()=>localStorage.setItem('lang','en'));
  await setup(page);
  await openDrawer(page);
  await expect(page.locator('.room-relationship')).toContainText('Affinity');
  await expect(page.locator('.room-relationship')).toContainText('Complete and save a new conversation turn');
  await page.addInitScript(()=>localStorage.setItem('lang','ja'));
  await page.reload();await waitForRoom(page);
  await openDrawer(page);
  await expect(page.locator('.room-relationship')).toContainText('新しい会話を1往復完了');
});
