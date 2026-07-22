const { test, expect } = require('@playwright/test');

test('Wiki loads as a production route and core interactions work', async ({ page }) => {
  const response = await page.goto('/wiki');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: '超辉夜姬！Wiki' })).toBeVisible();
  await expect(page.getByAltText('原创月夜虚拟舞台插画：新月传送门与星空城市')).toBeVisible();
  await expect(page.getByText('8000 年的时间闭环')).toBeHidden();

  await page.getByText('展开完整剧情与结局剧透', { exact: true }).click();
  await expect(page.getByText('8000 年的时间闭环')).toBeVisible();

  await page.getByRole('button', { name: '主角' }).click();
  await expect(page.locator('.wiki-character-card')).toHaveCount(3);
  await expect(page.getByText('显示 3 位角色')).toBeVisible();

  const kaguyaCard = page.getByRole('link', { name: '查看辉夜角色词条' });
  await expect(kaguyaCard).toHaveCSS('cursor', 'pointer');
  await kaguyaCard.hover();
  await expect(kaguyaCard).toHaveCSS('scale', '1.018');
  await kaguyaCard.click();
  await expect(page).toHaveURL(/\/wiki\/characters\/kaguya$/);
  await page.goBack();

  await page.getByRole('button', { name: '虚拟空间“月读”' }).click();
  const dialog = page.getByRole('dialog', { name: '月读／TSUKUYOMI' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '关闭词条速览' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link', { name: /打开独立词条/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭词条速览' })).toBeFocused();
  await dialog.getByRole('button', { name: '关闭词条速览' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: '翻唱' }).click();
  await expect(page.locator('.wiki-music-row')).toHaveCount(7);
});

test('Wiki table of contents tracks rapid scrolling without skipping sections', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/wiki');
  await expect(page.locator('.wiki-toc a.active')).toHaveCount(1);

  const observed = await page.evaluate(async () => {
    const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    const links = Array.from(document.querySelectorAll('.wiki-toc a'));
    const ids = links.map((link) => link.getAttribute('href')?.slice(1)).filter(Boolean);
    const sequence = [];
    const recordActive = () => {
      const id = document.querySelector('.wiki-toc a.active')?.getAttribute('href')?.slice(1);
      if (id && sequence.at(-1) !== id) sequence.push(id);
    };
    const observer = new MutationObserver(recordActive);

    root.style.scrollBehavior = 'auto';
    links.forEach((link) => observer.observe(link, { attributes: true, attributeFilter: ['class'] }));
    window.scrollTo(0, 0);
    await nextFrame();
    await nextFrame();
    recordActive();

    const maxScroll = root.scrollHeight - window.innerHeight;
    for (let step = 1; step <= 100; step += 1) {
      window.scrollTo(0, (maxScroll * step) / 100);
      await nextFrame();
    }
    await nextFrame();
    const down = [...sequence];

    sequence.length = 0;
    recordActive();
    for (let step = 99; step >= 0; step -= 1) {
      window.scrollTo(0, (maxScroll * step) / 100);
      await nextFrame();
    }
    await nextFrame();
    const up = [...sequence];

    observer.disconnect();
    root.style.scrollBehavior = previousScrollBehavior;
    return { ids, down, up };
  });

  expect(observed.down).toEqual(observed.ids);
  expect(observed.up).toEqual([...observed.ids].reverse());
});

test('Character and term secondary pages support direct production access', async ({ page }) => {
  const kaguyaResponse = await page.goto('/wiki/characters/kaguya');
  expect(kaguyaResponse?.status()).toBe(200);
  const realityImage = page.getByAltText('辉夜现实形象透明立绘');
  await expect(realityImage).toBeVisible();
  await expect(realityImage).toHaveAttribute('src', '/assets/images/wiki/entries/characters/kaguya-reality.webp');
  await expect(realityImage).toHaveJSProperty('naturalWidth', 1200);
  await expect(page.locator('.wiki-entry-hero-copy').getByText('角色词条', { exact: true })).toHaveCount(0);
  await expect(page.locator('.wiki-entry-hero-visual > figcaption')).toHaveCount(0);
  await expect(page.locator('.wiki-entry-article > .wiki-entry-notice')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: '注释及外部链接' })).toHaveCount(0);
  await expect(page.locator('.wiki-entry-toc a[href="#source-notes"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '现实' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.moon')).toHaveCSS('pointer-events', 'none');
  const realityButtonIsTopmost = await page.getByRole('button', { name: '现实' }).evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button') === button;
  });
  expect(realityButtonIsTopmost).toBe(true);
  await page.getByRole('button', { name: '月夜见' }).click();
  const tsukuyomiImage = page.getByAltText('辉夜月夜见形象透明立绘');
  await expect(tsukuyomiImage).toBeVisible();
  await expect(tsukuyomiImage).toHaveAttribute('src', '/assets/images/wiki/entries/characters/kaguya-tsukuyomi.webp');
  await expect(tsukuyomiImage).toHaveJSProperty('naturalWidth', 1200);
  await expect(page.getByRole('button', { name: '月夜见' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { level: 2, name: '基本资料（源条目）' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '简介' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '经历' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '角色相关逸事' })).toBeVisible();
  await expect(page.locator('.wiki-source-media-slot')).toHaveCount(26);
  await expect(page.locator('.wiki-source-media-float-right')).toHaveCount(7);
  await expect(page.locator('.wiki-source-media-center')).toHaveCount(5);
  await expect(page.locator('.wiki-source-profile')).toHaveCSS('float', 'right');
  const leadProfileOverlap = await page.evaluate(() => {
    const profile = document.querySelector('.wiki-source-profile')?.getBoundingClientRect();
    const quote = document.querySelector('.wiki-source-section#source-lead .wiki-source-quote')?.getBoundingClientRect();
    if (!profile || !quote) return Number.POSITIVE_INFINITY;
    return Math.max(0, quote.right - profile.left);
  });
  expect(leadProfileOverlap).toBe(0);
  await expect(page.locator('.wiki-source-media-float-right').first()).toHaveCSS('float', 'right');
  await expect(page.locator('.wiki-entry-infobox')).toHaveCount(0);
  await expect(page.getByText(/好，决定了！要自己创造Happy End/)).toBeVisible();
  const sourceEnding = page.getByText(/而这一次，是真正的.*皆大欢喜，可喜可贺/);
  await expect(sourceEnding).toBeHidden();
  await page.getByText('……这样的结局也好意思叫“Happy End”吗？！别开玩笑了！', { exact: true }).click();
  await expect(sourceEnding).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.wiki-source-profile')).toHaveCSS('float', 'none');
  await expect(page.locator('.wiki-source-media-float-right').first()).toHaveCSS('float', 'none');
  await page.setViewportSize({ width: 1280, height: 720 });

  const sourceCharacters = [
    { slug: 'iroha', title: '酒寄彩叶', alt: '酒寄彩叶现实形象清晰设定图', tsukuyomiAlt: '酒寄彩叶月夜见形象清晰设定图', switches: 2 },
    { slug: 'yachiyo', title: '月见八千代', alt: '月见八千代清晰角色设定图', switches: 0 },
    { slug: 'akira', title: '帝アキラ', alt: '酒寄朝日月夜见形象清晰设定图', switches: 0 },
    { slug: 'rai', title: '驹泽雷', alt: '驹泽雷月夜见形象清晰设定图', switches: 0 },
    { slug: 'noi', title: '驹泽乃依', alt: '驹泽乃依月夜见形象清晰设定图', switches: 0 },
    { slug: 'roka', title: '绫䌷芦花', alt: '绫䌷芦花现实形象清晰设定图', tsukuyomiAlt: '绫䌷芦花月夜见形象清晰设定图', switches: 2 },
    { slug: 'mami', title: '谏山真实', alt: '谏山真实现实形象清晰设定图', tsukuyomiAlt: '谏山真实月夜见形象清晰设定图', switches: 2 }
  ];

  for (const character of sourceCharacters) {
    const characterResponse = await page.goto(`/wiki/characters/${character.slug}`);
    expect(characterResponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: character.title })).toBeVisible();
    await expect(page.locator('.wiki-entry-hero-copy').getByText('角色词条', { exact: true })).toHaveCount(0);
    const characterImage = page.getByAltText(character.alt);
    await expect(characterImage).toBeVisible();
    expect(await characterImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.wiki-entry-image-variants button')).toHaveCount(character.switches);
    if (character.switches === 2) {
      const tsukuyomiButton = page.getByRole('button', { name: '月夜见' });
      await tsukuyomiButton.click();
      await expect(tsukuyomiButton).toHaveAttribute('aria-pressed', 'true');
      const tsukuyomiImage = page.getByAltText(character.tsukuyomiAlt);
      await expect(tsukuyomiImage).toBeVisible();
      await expect.poll(() => tsukuyomiImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    }
    await expect(page.getByRole('heading', { level: 2, name: '基本资料（源条目）' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '简介' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '经历' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '角色相关逸事' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '注释及外部链接' })).toHaveCount(0);
    await expect(page.locator('.wiki-entry-article > .wiki-entry-notice')).toHaveCount(0);
    await expect(page.locator('.wiki-entry-infobox')).toHaveCount(0);
    expect(await page.locator('.wiki-entry-article').evaluate((article) => article.innerText.length)).toBeGreaterThan(1000);
    const sourceRenderingArtifacts = await page.locator('.wiki-entry-article').evaluate((article) => {
      const tokens = ['{{', '}}', '[[', ']]', '<span', '</span>', '&lt;br', '&gt;'];
      return tokens.filter((token) => article.innerText.includes(token));
    });
    expect(sourceRenderingArtifacts).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    if (character.slug === 'yachiyo') {
      const blackoutCaption = page.locator('.wiki-source-media-slot figcaption').filter({ hasText: '从此，我们再也没有听说过这位敲墙邻居的下落' });
      await expect(blackoutCaption).toHaveCount(1);
      await expect(blackoutCaption.locator('.wiki-source-blackout')).toHaveText('。南无三，今天也为您带来月读空间的黑暗真实');
      const lineBreakCaption = page.locator('.wiki-source-media-slot figcaption').filter({ hasText: '弥生时代以前的饭纯纯一坨' });
      await expect(lineBreakCaption).toHaveCount(1);
      await expect(lineBreakCaption.locator('br')).toHaveCount(1);
    }

    if (character.slug === 'iroha') {
      const moegirlCard = page.locator('.wiki-entry-moegirl-card');
      await expect(moegirlCard).toHaveAttribute('href', 'https://zh.moegirl.org.cn/%E9%85%92%E5%AF%84%E5%BD%A9%E5%8F%B6');
      await expect(moegirlCard).toHaveAttribute('target', '_blank');
      await expect(moegirlCard).toHaveAttribute('rel', 'noopener noreferrer');
    }
  }

  const termResponse = await page.goto('/wiki/terms/tsukuyomi');
  expect(termResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: '月读／TSUKUYOMI' })).toBeVisible();
  const termImage = page.getByAltText('月读／TSUKUYOMI：公式书场景裁图');
  await expect(termImage).toBeVisible();
  await expect(termImage).toHaveJSProperty('naturalWidth', 1095);
  await expect(page.getByText(/公式ガイドブック.*第 41 页/)).toBeVisible();
  await expect(page.getByRole('link', { name: /月见八千代/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '图片资料' })).toBeVisible();

  await page.goto('/wiki/characters/fushi');
  const directoryFallback = page.locator('.wiki-entry-moegirl-card');
  await expect(directoryFallback).toContainText('该角色暂无独立词条');
  await expect(directoryFallback).toHaveAttribute('href', 'https://zh.moegirl.org.cn/%E8%B6%85%E6%97%B6%E7%A9%BA%E8%BE%89%E5%A4%9C%E5%A7%AC%EF%BC%81#%E4%B8%BB%E8%A6%81%E8%A7%92%E8%89%B2');
});

test('Wiki mobile layout retains navigation and spoiler protection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/wiki');
  await expect(page.getByText('页面目录', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '超辉夜姬！Wiki' })).toBeVisible();
  await expect(page.getByText('8000 年的时间闭环')).toBeHidden();
  await expect(page.getByRole('button', { name: '更多' })).toBeVisible();
  await page.getByText('页面目录', { exact: true }).click();
  await page.getByRole('searchbox', { name: '词条速查' }).fill('八千代');
  await expect(page.locator('.wiki-mobile-search').getByText(/找到 \d+ 个词条/)).toBeVisible();
  await expect(page.locator('.site-pet-route-wiki')).toBeHidden();

  await page.goto('/wiki/characters/yachiyo');
  await expect(page.getByAltText('月见八千代清晰角色设定图')).toBeVisible();
  await expect(page.locator('.wiki-source-profile')).toHaveCSS('float', 'none');
  await expect(page.locator('.wiki-source-media-slot')).toHaveCount(26);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
