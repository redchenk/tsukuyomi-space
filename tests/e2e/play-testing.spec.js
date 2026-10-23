const { test, expect } = require('../e2e-fixtures.cjs');
async function open(page) {
  const response=await page.goto('/apply'); expect(response.status()).toBe(200);
  await expect(page.locator('#boot-splash')).toBeHidden();
  await expect(page.locator('#loadingOverlay')).toBeHidden();
  await expect(page.getByRole('heading',{name:'申请参与测试',exact:true})).toBeVisible();
  await expect(page.locator('#play-email')).toBeVisible();
}
async function fill(page,email) {
  await page.locator('#play-email').fill(email);
  await page.locator('#play-device').fill('Pixel 9');
  await page.locator('#play-android').fill('16');
  await page.getByRole('checkbox',{name:/我有可使用/}).check();
  await page.getByRole('checkbox',{name:/我同意将邮箱/}).check();
}
for (const width of [1440,390]) test(`guest signup, repeat receipt and joining guide at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000}); await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await open(page);
  await expect(page.getByRole('button',{name:'提交测试申请'})).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await fill(page,`browser-${width}@example.test`);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:`test-results/play-apply-${width}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'提交测试申请'}).click();
  await expect(page.getByRole('heading',{name:'谢谢，接下来留意邮箱'})).toBeVisible();
  await expect(page.locator('.apply-receipt')).toBeFocused();
  await expect(page.locator('.apply-receipt')).toContainText('申请成功还不等于成为 Google Play 测试者');
  await page.getByRole('link',{name:'查看接下来的步骤'}).click();
  await expect(page.getByRole('heading',{name:'从报名，到真正加入测试'})).toBeInViewport();
  await page.reload(); await expect(page.locator('#boot-splash')).toBeHidden(); await expect(page.locator('#play-email')).toBeVisible();
  await fill(page,`BROWSER-${width}@example.test`);
  await page.getByRole('button',{name:'提交测试申请'}).click();
  await expect(page.getByRole('heading',{name:'谢谢，接下来留意邮箱'})).toBeVisible();
  expect(errors).toEqual([]);
});
test('submission failure preserves form and permits retry',async({page})=>{
  await open(page); await fill(page,'retry-browser@example.test');
  let failed=false;
  await page.route('**/api/play-testing',async route=>{
    if(route.request().method()==='POST' && !failed) {failed=true; return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'暂时无法处理，请稍后重试'})});}
    return route.continue();
  });
  await page.getByRole('button',{name:'提交测试申请'}).click();
  await expect(page.getByRole('alert')).toContainText('暂时无法处理');
  await expect(page.locator('#play-email')).toHaveValue('retry-browser@example.test');
  await page.getByRole('button',{name:'提交测试申请'}).click();
  await expect(page.getByRole('heading',{name:'谢谢，接下来留意邮箱'})).toBeVisible();
});
test('administrator sees persisted applicants and exports exact emails; ordinary guests cannot',async({page})=>{
  await page.goto('/admin/play-testing');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.play-admin-list article')).toHaveCount(0);
  await page.goto('/terminal?panel=mail');
  await expect(page.locator('#boot-splash')).toBeHidden();
  await page.getByRole('textbox',{name:'管理员账号'}).fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
  await page.getByRole('button',{name:'连接终端'}).click();
  await expect(page.getByRole('heading',{name:'发送邮件',exact:true})).toBeVisible();
  await page.goto('/admin/play-testing');
  await expect(page.locator('#boot-splash')).toBeHidden();
  await expect(page.locator('.play-admin-list article').filter({hasText:'browser-390@example.test'})).toBeVisible();
  const exportResponse=await page.request.get('/api/admin/play-testing/export?status=all&search=browser-390');
  expect(exportResponse.status()).toBe(200); expect(await exportResponse.text()).toBe('browser-390@example.test\n');
  await page.screenshot({path:'test-results/play-apply-admin.png',fullPage:true,animations:'disabled'});
});
for (const width of [1440,390]) test(`invitation preview, explicit send and persistent receipt at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000}); await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/terminal?panel=mail'); await expect(page.locator('#boot-splash')).toBeHidden();
  await page.getByRole('textbox',{name:'管理员账号'}).fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
  await page.getByRole('button',{name:'连接终端'}).click();
  await expect(page.getByRole('heading',{name:'发送邮件',exact:true})).toBeVisible();
  await page.goto('/admin/play-testing'); await expect(page.locator('#boot-splash')).toBeHidden();
  const email=width===1440?'legacy-invitation@example.test':'browser-390@example.test';
  const row=page.locator('.play-admin-list article').filter({hasText:email});
  await row.getByRole('button',{name:width===1440?'补发邀请邮件':'发送邀请邮件并登记',exact:true}).click();
  const dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(email);
  await expect(dialog.getByRole('link')).toHaveAttribute('href','https://play.google.com/apps/internaltest/4701667283312409674');
  const mail=page.frameLocator('iframe[title="测试邀请邮件预览"]');
  await expect(mail.getByRole('link',{name:/^加入 Google Play 内部测试/})).toHaveAttribute('href','https://play.google.com/apps/internaltest/4701667283312409674');
  await expect(mail.locator('body')).toContainText('这是内部测试，不计入');
  const send=dialog.getByRole('button',{name:'确认发送邀请邮件',exact:true}); await expect(send).toBeDisabled();
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:`test-results/play-invitation-preview-${width}.png`,fullPage:true,animations:'disabled'});
  await dialog.getByRole('checkbox').check(); await expect(send).toBeEnabled();
  await send.click(); await expect(dialog).toBeHidden();
  await expect(row).toContainText('邮件服务已接收');
  await expect(row.getByRole('heading')).toContainText('已发邀请');
  await page.reload(); await expect(page.locator('#boot-splash')).toBeHidden();
  await row.getByRole('button',{name:'查看已发送邀请',exact:true}).click();
  await expect(dialog).toContainText('不会重复发送'); await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'确认发送邀请邮件',exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(dialog).toBeHidden(); expect(errors).toEqual([]);
});
