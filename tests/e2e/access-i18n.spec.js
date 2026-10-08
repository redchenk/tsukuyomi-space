const { test, expect } = require('../e2e-fixtures.cjs');

async function language(page, lang) {
 await page.addInitScript(value=>{
  // Sandboxed game frames intentionally have no storage access.
  if(window.top!==window)return;
  localStorage.setItem('lang',value);localStorage.setItem('tsukuyomi_theme','light');
 },lang);
}
async function openSettingsNavigation(page) {
 const button=page.locator('.settings-mobile-menu');
 if(await button.isVisible()) await button.click();
}
for (const size of [{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
 test(`access entry is visible before any gesture at ${size.width}x${size.height}`, async({page})=>{
  await page.setViewportSize(size);
  await page.route('**/*moon-gate*.mp4',route=>route.abort());
  await page.goto('/');
  const enter=page.locator('.access-enter');await expect(enter).toBeVisible();await expect(enter).toBeInViewport();
  expect(await enter.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  await page.screenshot({path:`.codex_tmp/access-i18n-20261008/access-${test.info().project.name}-${size.width}.png`});
  await enter.click();await expect(page).toHaveURL(/\/hub$/);
 });
}
test('access BFCache pageshow clears a transient exit state without a gesture',async({page})=>{
 await page.goto('/');await expect(page.locator('.access-enter')).toBeVisible();
 await page.locator('.access-enter').evaluate(button=>{
  button.click();window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 await expect(page.locator('.access-page')).not.toHaveClass(/is-leaving/);await expect(page.locator('.access-enter')).toBeEnabled();
 await page.locator('.access-enter').click();await expect(page).toHaveURL(/\/hub$/);
});
for(const lang of ['en','ja'])test(`all public destinations render localized controls (${lang})`,async({page})=>{
 test.setTimeout(60000);
 await language(page,lang);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const remoteTranslation=[];page.on('request',r=>{if(r.url().includes('/en-translate'))remoteTranslation.push(r.url());});
 const destinations=[['/','access-enter',lang==='en'?'Enter Tsukuyomi Space':'月読空間へ'],['/hub','.hub'],['/stage','.stage-page'],['/wiki','.wiki-page'],['/gallery','.gallery-page'],['/room/settings','.room-settings-page'],['/login','.auth-page'],['/register','.auth-page'],['/plaza','.plaza-page'],['/friend-links','.friend-links-page'],['/reality','.reality-page'],['/pixel','.pixel-workspace'],['/game','.game-page']];
 for(const [url,selector,label]of destinations){
  if(url==='/')await page.goto(url);
  else await page.evaluate(path=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path),url);
  if(selector==='access-enter')await expect(page.locator('.access-enter')).toContainText(label);else await expect(page.locator(selector)).toBeVisible();
  if(url==='/wiki')await expect(page.locator('.wiki-filter-bar').first()).toContainText(lang==='en'?'Main characters':'主人公');
 }
 await page.goto('/room/settings');await expect(page.locator('.settings-main > .room-settings-card').first()).toContainText(lang==='en'?'Chat model':'チャットモデル');
 const tabs=page.locator('.settings-navigation .settings-nav-button');
 for(let i=0;i<await tabs.count();i++){await openSettingsNavigation(page);await tabs.nth(i).click();await expect(page.locator('.settings-main > .room-settings-card:visible').first()).toBeVisible();}
 expect(remoteTranslation).toEqual([]);expect(errors).toEqual([]);
});
for(const lang of ['en','ja'])test(`signed-in destinations retain translations and access (${lang})`,async({page})=>{
 await language(page,lang);await page.goto('/login');
 await page.locator('#loginAccount').fill('e2e-user');await page.locator('#loginPassword').fill('e2e-password');
 await page.locator('#loginPassword').press('Enter');await expect(page).toHaveURL(/\/hub$/);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [url,selector]of [['/user-center','.uc-page'],['/growth','.growth-page'],['/attachments','.attachments-page'],['/notifications','.notifications-page'],['/editor','.editor-page'],['/gallery/manage','.gallery-page'],['/room','.room-page']]) {
  await page.goto(url);await expect(page.locator(selector)).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang',lang);
 }
 expect(errors).toEqual([]);
});
test('switching language preserves room settings drafts, keys and user-owned knowledge',async({page})=>{
 await page.goto('/room/settings');await expect(page.locator('#settings-llm-key')).toBeAttached();

 // Values are data, including words that also happen to be interface keys.
 await page.evaluate(()=>{localStorage.setItem('roomKnowledgeSettings',JSON.stringify({enabled:true,entries:[{id:'owned',title:'保存设置',content:'删除 你好 搜索',tags:['保存'],enabled:true}]}));});
 await page.reload();const input=page.locator('#settings-llm-key');await input.fill('fixture-only-key-not-a-real-secret');
 await page.getByRole('button',{name:'账号菜单',exact:true}).click();
 await page.getByRole('button',{name:'日本語',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','ja');await expect(input).toHaveValue('fixture-only-key-not-a-real-secret');
 await page.keyboard.press('Escape');
 await openSettingsNavigation(page);
 await page.locator('.settings-navigation .settings-nav-button').filter({hasText:'キャラクター知識庫'}).click();
 await expect(page.locator('.knowledge-item').filter({hasText:'保存设置'})).toContainText('删除 你好 搜索');
 await page.screenshot({path:'.codex_tmp/access-i18n-20261008/settings-ja.png',fullPage:true});
});
test('entry remains usable when its optional locale chunk cannot load',async({page})=>{
 await language(page,'ja');
 await page.route('**/*tsukuyomi-interface-ja*.js',route=>route.abort());
 await page.goto('/');await expect(page.locator('.access-enter')).toBeVisible();
 await page.locator('.access-enter').click();await expect(page).toHaveURL(/\/hub$/);
});
for(const lang of ['en','ja']) test(`terminal panels keep localized controls (${lang})`,async({page})=>{
 await language(page,lang);await page.goto('/terminal');
 await page.locator('input[autocomplete="username"]').fill('admin');
 await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
 await page.locator('.terminal-login-card button[type="submit"]').click();
 const tabs=page.locator('.terminal-nav-btn');await expect(tabs).toHaveCount(9);
 for(let i=0;i<await tabs.count();i++) { await tabs.nth(i).click();await expect(page.locator('.terminal-panel')).toBeVisible(); }
 expect(await page.locator('.terminal-nav-group-label').allTextContents()).toEqual(lang==='en'?['Inspection','Content','System']:['点検','内容','システム']);
});
test('Chinese entry does not fetch the English or Japanese dictionaries',async({page})=>{
 const localeRequests=[];page.on('request',r=>{if(/tsukuyomi-interface-(en|ja)/.test(r.url()))localeRequests.push(r.url());});
 await page.goto('/');await expect(page.locator('.access-enter')).toBeVisible();expect(localeRequests).toEqual([]);
});
