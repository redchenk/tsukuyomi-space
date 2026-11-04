const { test, expect } = require('../e2e-fixtures.cjs');
const fs = require('node:fs');
const path = require('node:path');
test('official voice disables offline, enables online, binds account and replays without a new job', async ({ page }) => {
    let online=false, submitted=0;
    const audio=Buffer.alloc(16044);audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);
    audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(8000,24);audio.writeUInt32LE(16000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(16000,40);
    await page.route('**/api/tts/official/**', route => {
        const request=route.request(), url=new URL(request.url());
        if(url.pathname.endsWith('/status')) return route.fulfill({json:{success:true,data:{online,language:'ja',price:'0.05'}}});
        expect(request.headers()['x-tts-account']).toBe('e2e-user-001');
        if(url.pathname.endsWith('/audio')) return route.fulfill({contentType:'audio/wav',body:audio});
        if(request.method()==='POST') {
            submitted++;
            expect(Object.keys(request.postDataJSON()).sort()).toEqual(['requestKey','text']);
        }
        return route.fulfill({json:{success:true,data:{id:'req_voice_'+ 'a'.repeat(64),state:'ready',chargedAtoms:'50000000'}}});
    });
    await page.goto('/login');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await expect(page.locator('#app')).not.toHaveAttribute('inert','');
    await page.locator('#loginAccount').fill('e2e-user');await page.locator('#loginPassword').fill('e2e-password');await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.goto('/room/settings?section=tts');
    const menu=page.locator('.settings-mobile-menu');if(await menu.isVisible())await menu.click();
    await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'语音与朗读 可选',exact:true}).click();
    const card=page.locator('#room-tts-settings');
    await expect(card.getByText('算力离线',{exact:true})).toBeVisible();
    await expect(card.locator('option[value="official"]')).toHaveAttribute('disabled','');
    online=true;await card.getByRole('button',{name:'检测算力',exact:true}).click();
    await expect(card.getByText('算力在线',{exact:true})).toBeVisible();
    await card.getByLabel('语音服务',{exact:true}).selectOption('official');
    await expect(card.locator('input[type="password"]')).toHaveCount(0);
    await card.getByRole('button',{name:'仅保存设置',exact:true}).click();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('roomTTSSettings')))).toMatchObject({provider:'official',officialAccount:'e2e-user-001',useProxy:true,enabled:true});
    await card.getByRole('button',{name:'保存并试听 · ¥0.05',exact:true}).click();
    await expect(page.getByText('连接成功，已开始播放测试语音。',{exact:true})).toBeVisible();
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
    await card.getByRole('button',{name:'保存并试听 · ¥0.05',exact:true}).click();
    await expect(page.getByText('连接成功，已开始播放测试语音。',{exact:true})).toBeVisible();
    expect(submitted).toBe(1);
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
    online=false;await card.getByRole('button',{name:'检测算力',exact:true}).click();
    await expect(card.getByRole('button',{name:'保存并试听 · ¥0.05',exact:true})).toBeDisabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    const out=path.resolve(process.env.TTS_EVIDENCE_DIR || 'test-results');fs.mkdirSync(out,{recursive:true});
    await card.screenshot({path:path.join(out,`official-tts-${test.info().project.name}.png`)});
});

test('Fish settings keep a personal voice distinct from official Fish', async ({ page }) => {
    await page.route('**/api/tts/official/status*', route => route.fulfill({json:{success:true,data:{
        online:new URL(route.request().url()).searchParams.get('engine')==='fish-audio', supportsEmotion:true, language:'auto',
        models:['s2.1-pro','drama-3'], defaultModel:'s2.1-pro'
    }}}));
    await page.goto('/login');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.goto('/room/settings?section=tts');
    const card=page.locator('#room-tts-settings'), providers=card.getByLabel('语音服务',{exact:true});
    const menu=page.locator('.settings-mobile-menu');if(await menu.isVisible())await menu.click();
    await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'语音与朗读 可选',exact:true}).click();
    await providers.selectOption('fishAudio');
    await expect(card.locator('[name="room-setting-tts-voice"]')).toHaveValue('a746d80afdb5451ca44c63401c001c9b');
    const fishModels=card.locator('[name="room-setting-tts-model"]');
    await expect(fishModels.locator('option')).toHaveCount(5);
    await fishModels.selectOption('drama-3');
    await card.locator('[name="room-setting-tts-apikey"]').fill('personal-fixture');
    await card.locator('[name="room-setting-fish-style"]').selectOption('calm');
    let sent;
    await page.route('**/api/tts',route=>{ sent=route.request().postDataJSON(); return route.fulfill({status:401,json:{message:'测试密钥'}}); });
    await card.getByRole('button',{name:'保存并试听',exact:true}).click();
    await expect.poll(()=>sent?.emotion).toBe('calm');
    expect(sent).toMatchObject({provider:'fish-audio',apiKey:'personal-fixture',model:'drama-3'});
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
    await providers.selectOption('officialFish');
    await card.locator('[name="room-setting-official-fish-model"]').selectOption('drama-3');
    await expect(card.locator('input[type="password"]')).toHaveCount(0);
    await card.getByRole('button',{name:'仅保存设置'}).click();
    const stored=await page.evaluate(()=>JSON.parse(localStorage.roomTTSSettings));
    expect(stored).toMatchObject({provider:'official',officialEngine:'fish-audio',officialAccount:'e2e-user-001',textLang:'auto',officialFishModel:'drama-3'});
    expect(stored.apiKey).toBeUndefined();
});

test('Room play sends the saved Fish model and expression, without changing the chat text', async ({page}) => {
    const { configureRoomFixture, waitForRoom } = require('../e2e-room-helpers.cjs');
    await configureRoomFixture(page);
    await page.addInitScript(() => {
        localStorage.setItem('roomTTSSettings', JSON.stringify({enabled:true,provider:'fish-audio',apiKey:'personal-fixture',
            model:'drama-3',voice:'a746d80afdb5451ca44c63401c001c9b',fishStyle:'auto',useProxy:false}));
        localStorage.setItem('roomChatHistory:guest', JSON.stringify([
            {id:'fish-room',role:'assistant',content:'这场演出真开心！'}
        ]));
        HTMLMediaElement.prototype.play = function () {
            if (this.src.startsWith('blob:')) window.__fishPlayed = true;
            return Promise.resolve();
        };
    });
    let sent, model;
    await page.route('https://api.fish.audio/v1/tts', route => {
        sent=route.request().postDataJSON();model=route.request().headers().model;
        return route.fulfill({status:200,contentType:'audio/mpeg',body:Buffer.from('ID3fixture-audio')});
    });
    await page.goto('/room');await waitForRoom(page);
    const reply=page.locator('.chat-message.assistant').filter({hasText:'这场演出真开心！'});
    const actions=reply.locator('details');
    if (!await actions.evaluate(el => el.open)) await actions.locator('summary').click();
    await reply.getByRole('button',{name:'播放语音',exact:true}).click();
    await expect.poll(()=>sent?.text).toBe('[happy] 这场演出真开心！');
    expect(model).toBe('drama-3');expect(sent.reference_id).toBe('a746d80afdb5451ca44c63401c001c9b');
    await expect.poll(()=>page.evaluate(()=>Boolean(window.__fishPlayed))).toBe(true);
    await expect(reply).not.toContainText('[happy]');
});
