const { test, expect } = require('../e2e-fixtures.cjs');
const ok = data => ({json:{success:true,data}});
async function signIn(page) {
    const response=await page.request.post('/api/admin/login',{headers:{Origin:process.env.E2E_BASE_URL || 'http://127.0.0.1:4174','X-Requested-With':'XMLHttpRequest'},data:{username:'admin',password:'admin-test-password'}});
    expect(response.status()).toBe(200);
    const {data}=await response.json();
    await page.addInitScript(({admin,user}) => {
        localStorage.setItem('admin_user', JSON.stringify(admin));
        localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
    },data);
}
test('Terminal manages LLM and Fish settings from the dedicated page', async({page},info)=>{
    await signIn(page);
    const models=['s2.1-pro','s2.1-pro-free','drama-3'];
    const tts={revision:'r1',primary:{enabled:true,protocol:'gpt-sovits',language:'ja'},fish:{enabled:true,voice:'a'.repeat(32),hasKey:true,language:'ja',models:[models[0]],model:models[0]},availableModels:models,languages:['auto','ja']};
    const llm={providers:[{id:'fixture',name:'Fixture LLM',host:'llm.example.test',hasKey:true}],provider:'fixture',model:'chat-1',
        revision:1,rates:{input_cached:'1',input_uncached:'2',output:'3'},paymentsEnabled:false,published:true,usageVerified:true,boundVerified:true,enabled:true,
        maxInputTokens:8192,maxOutputTokens:512,perUserConcurrent:2,requestsPerMinute:20};
    let savedTts,savedLlm;
    await page.route('**/api/admin/official-services/**',route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.pathname.endsWith('/me'))return route.fulfill(ok({account:'test-account'}));
        if(url.pathname.endsWith('/reconciliation'))return route.fulfill(ok({items:[]}));
        if(url.pathname.endsWith('/settings')){
            expect(req.headers()['x-official-expected-account']).toBe('test-account');
            if(req.method()==='POST') savedLlm=req.postDataJSON();
            return route.fulfill(ok({...llm,...savedLlm}));
        }
        if(req.method()==='PUT')savedTts=req.postDataJSON();
        return route.fulfill(ok(tts));
    });
    await page.goto('/terminal?panel=official-services');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await expect(page.locator('#app')).not.toHaveAttribute('inert','');
    await page.getByLabel('模型 ID',{exact:true}).fill('chat-2');
    await page.getByLabel('开放 DeepSeek 应用能力').check();
    await page.getByLabel('DeepSeek 输出 / 百万 Token').fill('8.8');
    await page.getByRole('button',{name:'保存服务配置'}).click();
    await expect.poll(()=>savedLlm?.model).toBe('chat-2');
    expect(savedLlm.deepseekApps).toEqual({ enabled:true, markupNumerator:'11', markupDenominator:'10', reservationAtoms:'1000000000', tokenRates:{input_uncached:'2200000000',input_cached:'44000000',output:'8800000000'} });
    await page.getByRole('button',{name:'语音合成',exact:true}).click();
    await page.getByRole('button',{name:/Fish Audio/}).click();
    await expect(page.getByLabel('更换 Fish 密钥')).toHaveValue('');
    await page.getByLabel('默认模型').selectOption('s2.1-pro-free');
    await page.getByRole('button',{name:'保存音源设置'}).click();
    await expect.poll(()=>savedTts?.model).toBe('s2.1-pro-free');
    expect(savedTts.models).toContain('s2.1-pro-free');expect(savedTts).not.toHaveProperty('apiKey');
    await expect(page.getByText('语音配置已保存，新朗读请求使用新设置。')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.locator('.speech-settings').screenshot({path:info.outputPath('tts-manager.png')});
});
test('twenty products never push orders down and only one product editor is shown',async({page},info)=>{
    await signIn(page);
    const products=Array.from({length:20},(_,i)=>({id:'p'+i,title:'月读商品 '+(i+1),description:'',enabled:true,walletCredit:false,price:'2.50'}));
    let saved;
    await page.route('**/api/admin/payments/**',route=>{
        const req=route.request();
        if(req.url().includes('/orders'))return route.fulfill(ok({items:[],page:1,totalPages:1,total:0}));
        if(req.method()==='PUT')saved=req.postDataJSON();
        return route.fulfill(ok({enabled:false,products:saved?.products||products,readiness:{configured:true,missing:[],maxAmountCents:5000,environment:'sandbox'}}));
    });
    await page.goto('/terminal?panel=payments');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    const manager=page.locator('.payment-manager');
    await expect(manager.getByRole('heading',{name:'支付订单'})).toBeVisible();
    expect(await manager.locator('.payment-product-editor').count()).toBe(0);
    await manager.getByRole('button',{name:/商品与收款/}).click();
    await expect(manager.locator('.product-list li')).toHaveCount(5);
    await manager.getByRole('button',{name:'第 4 页'}).click();
    await manager.getByRole('button',{name:/月读商品 20/}).click();
    await expect(manager.locator('.payment-product-editor')).toHaveCount(1);
    await manager.getByLabel('商品名称').fill('更新后的商品');
    await manager.getByRole('button',{name:'支付订单',exact:true}).click();
    await expect(manager.getByRole('heading',{name:'支付订单'})).toBeVisible();
    await manager.getByRole('button',{name:/商品与收款/}).click();
    await expect(manager.getByLabel('商品名称')).toHaveValue('更新后的商品');
    await manager.getByRole('button',{name:'保存支付配置'}).click();
    await expect.poll(()=>saved?.products.length).toBe(20);
    expect(saved.products[19].title).toBe('更新后的商品');expect(saved.products.slice(0,19)).toEqual(products.slice(0,19));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await manager.screenshot({path:info.outputPath('product-manager.png')});
});
