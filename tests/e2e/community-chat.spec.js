const {test,expect} = require('../e2e-fixtures.cjs');

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
    await page.locator('.mc-channels button').filter({hasText:'技术交流'}).click();
    await expect(page.locator('.mc-heading h2')).toContainText('技术交流');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  } finally {await ctx.close();}
});
