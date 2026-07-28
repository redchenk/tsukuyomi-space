const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function loadSiteVariant({ compiledEnglish = false, hostname = '' } = {}) {
    const context = {
        __TSUKUYOMI_ENGLISH_SITE__: compiledEnglish,
        window: { location: { hostname } }
    };
    const code = source('src/frontend/utils/siteVariant.js')
        .replace(/export const /g, 'const ')
        .replace(/export function /g, 'function ')
        .concat('\nglobalThis.__siteVariant = { forcedSiteLanguage, isEnglishSite };\n');

    vm.runInNewContext(code, context, { filename: 'src/frontend/utils/siteVariant.js' });
    return context.__siteVariant;
}

function loadNotificationBadge(navigatorTarget = {}) {
    const events = [];
    const context = {
        navigator: navigatorTarget,
        window: {
            dispatchEvent(event) {
                events.push(event);
            }
        },
        CustomEvent: class CustomEvent {
            constructor(type, options = {}) {
                this.type = type;
                this.detail = options.detail;
            }
        },
        Number,
        Math,
        Promise
    };
    const code = source('src/frontend/services/notificationBadge.js')
        .replace(/export const /g, 'const ')
        .replace(/export async function /g, 'async function ')
        .replace(/export function /g, 'function ')
        .concat('\nglobalThis.__badge = { applyAppBadge, normalizeNotificationCount, publishNotificationBadge };\n');

    vm.runInNewContext(code, context, { filename: 'src/frontend/services/notificationBadge.js' });
    return { badge: context.__badge, events };
}

describe('frontend navigation routes', () => {
    it('locks the overseas domains to English independently of the build flag', () => {
        assert.equal(loadSiteVariant({ hostname: 'tsukuyomi-space.com' }).isEnglishSite(), true);
        assert.equal(loadSiteVariant({ hostname: 'www.tsukuyomi-space.com' }).forcedSiteLanguage(), 'en');
        assert.equal(loadSiteVariant({ hostname: 'yachiyo.hk' }).isEnglishSite(), false);
        assert.equal(loadSiteVariant({ compiledEnglish: true, hostname: 'localhost' }).isEnglishSite(), true);
    });

    it('switches between Chinese and Japanese and supports a forced English build', () => {
        const app = source('src/frontend/App.vue');
        const shell = source('src/frontend/layouts/AppShell.vue');
        const messages = source('src/frontend/i18n/messages.js');
        const i18nModule = source('src/frontend/i18n/index.js');
        const icons = source('src/frontend/components/TsIcon.vue');
        const seo = source('src/frontend/utils/seo.js');
        const client = source('src/frontend/api/client.js');
        const staticInterface = source('src/frontend/i18n/englishStaticInterface.js');
        const gallery = source('src/frontend/pages/GalleryPage.vue');
        const viteConfig = source('vite.frontend.config.js');
        const packageJson = JSON.parse(source('package.json'));
        const overseasEnv = source('.env.overseas');

        assert.match(shell, /class="rail-link rail-language"/);
        assert.match(shell, /<TsIcon name="languages"/);
        assert.match(shell, /\$emit\('set-lang', alternateLanguage\(lang\)\)/);
        assert.match(shell, /class="lang-switcher" :aria-label="t\.language"/);
        assert.match(app, /normalizeLanguage\(localStorage\.getItem\('lang'\)\)/);
        assert.match(app, /documentLanguage\(lang\.value\)/);
        assert.match(i18nModule, /SUPPORTED_LANGUAGES = Object\.freeze\(\['zh', 'ja', 'en'\]\)/);
        for (const content of [app, client, staticInterface, seo, gallery]) {
            assert.match(content, /isEnglishSite|forcedSiteLanguage/);
        }
        assert.match(messages, /import \{ en \} from '\.\/messages\.en\.js'/);
        assert.match(i18nModule, /export function alternateLanguage/);
        assert.match(messages, /switchToJapanese: '切换为日语'/);
        assert.match(messages, /switchToChinese: '中国語に切り替え'/);
        assert.match(icons, /languages:\s*\[/);
        assert.match(seo, /documentLanguage\(localStorage\.getItem\('lang'\)\)/);
        assert.doesNotMatch(seo, /document\.documentElement\.lang = 'zh-CN'/);
        assert.equal(packageJson.scripts['build:web:overseas'], 'vite build --mode overseas --config vite.frontend.config.js');
        assert.match(overseasEnv, /^VITE_SITE_LANGUAGE=en\s*$/);
        assert.match(viteConfig, /loadEnv\(mode, projectRoot, ''\)/);
        assert.match(viteConfig, /englishSiteHtml\(englishSite\)/);
    });

    it('applies unique route keywords and dynamic SEO to every public page', () => {
        const router = source('src/frontend/router/index.js');
        const seo = source('src/frontend/utils/seo.js');
        const indexHtml = source('src/frontend/index.html');
        const wikiEntry = source('src/frontend/pages/WikiEntryPage.vue');
        const userProfile = source('src/frontend/pages/UserProfilePage.vue');

        assert.match(seo, /export function applySeo\(\{[\s\S]*keywords = DEFAULT_KEYWORDS/);
        assert.match(seo, /upsertMeta\('meta\[name="keywords"\]'[^}]*content: keywordContent/);
        assert.match(seo, /keywords: ENGLISH_SITE \? DEFAULT_KEYWORDS : \(meta\.keywords \|\| DEFAULT_KEYWORDS\)/);
        assert.match(seo, /keywords: tags\.length \? tags : \[title, article\?\.category/);
        assert.match(indexHtml, /<meta name="keywords" content="月读空间, Tsukuyomi Space, 超时空辉夜姬 Wiki/);
        assert.match(indexHtml, /<meta name="twitter:card" content="summary_large_image">/);

        const publicPaths = [
            '/', '/hub', '/stage', '/articles/:id/:slug?', '/article', '/wiki',
            '/wiki/characters/:slug', '/wiki/terms/:slug', '/room', '/plaza',
            '/friend-links', '/reality', '/gallery', '/users/:username', '/pixel', '/game'
        ];
        for (const routePath of publicPaths) {
            const escapedPath = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            assert.match(router, new RegExp(`path: '${escapedPath}'[\\s\\S]{0,700}?title:[\\s\\S]{0,300}?description:[\\s\\S]{0,350}?keywords:`), routePath);
        }

        const publicGallery = router.match(/path: '\/gallery',[\s\S]*?(?=\n\s*\},\n\s*\{\n\s*path: '\/gallery\/manage')/)?.[0] || '';
        assert.doesNotMatch(publicGallery, /noindex:\s*true/);
        assert.match(router, /path: '\/gallery\/manage'[\s\S]{0,300}?noindex:\s*true/);
        assert.match(wikiEntry, /applySeo\(\{[\s\S]*keywords,[\s\S]*wikiEntryPath/);
        assert.match(userProfile, /title: `\$\{publicUser\.username \|\| username\.value\}的公开主页`/);
    });

    it('loads every paginated article before applying local stage filters', () => {
        const stage = source('src/frontend/pages/StagePage.vue');

        assert.match(stage, /STAGE_FETCH_LIMIT = 100/);
        assert.match(stage, /\/api\/articles\?limit=\$\{STAGE_FETCH_LIMIT\}&page=\$\{page\}/);
        assert.match(stage, /result\.pagination\?\.totalPages/);
        assert.match(stage, /while \(page <= totalPages\)/);
    });

    it('shows the immutable article publication time to the minute on the stage', () => {
        const stage = source('src/frontend/pages/StagePage.vue');
        const article = source('src/frontend/pages/ArticlePage.vue');
        const routes = source('backend/routes/articles.js');
        const adminRepository = source('backend/repositories/admin-repository.js');
        const migration = source('backend/db/migrations/022_add_article_published_at.js');

        assert.match(routes, /const publishedAt = new Date\(\)\.toISOString\(\)/);
        assert.match(migration, /NULLIF\(created_at, ''\)/);
        assert.match(adminRepository, /COALESCE\(published_at, CURRENT_TIMESTAMP\)/);
        assert.match(stage, /formatDateMinute/);
        assert.match(stage, /article\?\.published_at \|\| article\?\.created_at \|\| article\?\.publish_date/);
        assert.match(stage, /<time class="stage-publish-time" :datetime="stagePublishedAt\(article\)">/);
        assert.match(stage, /TsIcon name="calendar"/);
        assert.match(article, /formatPublishedDate\(article\.published_at \|\| article\.created_at \|\| article\.publish_date\)/);
    });

    it('stores attachment-library article covers through the durable same-origin URL', () => {
        const editor = source('src/frontend/pages/EditorPage.vue');

        assert.match(editor, /const url = assetMarkdownUrl\(asset\);[\s\S]*?editor\.coverImageBase64 = url;/);
        assert.doesNotMatch(editor, /editor\.coverImageBase64 = assetUrl\(asset\)/);
    });

    it('separates the public friend-link directory from the application flow', () => {
        const router = source('src/frontend/router/index.js');
        const plaza = source('src/frontend/pages/PlazaPage.vue');
        const directory = source('src/frontend/pages/FriendLinksPage.vue');
        const application = source('src/frontend/pages/FriendLinkApplyPage.vue');

        assert.match(router, /path: '\/friend-links'/);
        assert.match(router, /name: 'friendLinks'/);
        assert.match(router, /path: '\/friend-links\/apply'/);
        assert.match(router, /name: 'friendLinkApply'/);
        assert.match(plaza, /url: '\/friend-links'/);
        assert.match(plaza, /url: '\/friend-links\/apply'/);
        assert.doesNotMatch(plaza, /approvedFriendLinks/);
        assert.match(directory, /apiFetch\(noStoreUrl\('\/api\/friend-links'\)/);
        assert.match(directory, /<StatusLoader/);
        assert.match(directory, /:aria-busy="state\.loading"/);
        assert.match(application, /\/api\/friend-links/);
        assert.match(application, /\/api\/friend-links\/discover-avatar/);
        assert.match(application, /avatar_url: form\.avatar_url\.trim\(\)/);
        assert.match(application, /copy\.autoAvatar/);
        assert.match(directory, /link\.avatar_url/);
        assert.match(directory, /referrerpolicy="no-referrer"/);
        assert.match(application, /go\('\/friend-links'\)/);
        assert.match(application, /TsIcon name="external"/);
    });

    it('supports direct friend-link creation alongside application review', () => {
        const terminal = source('src/frontend/pages/TerminalPage.vue');
        const statusAction = terminal.match(/async function updateLinkStatus[\s\S]*?\n}/)?.[0] || '';

        assert.match(terminal, /label: '友链审核'/);
        assert.match(terminal, /newLink: \{ name: '', url: '', description: '', avatar_url: '' \}/);
        assert.match(terminal, /async function createLink\(\)/);
        assert.match(terminal, /async function refreshLinkAvatar\(id\)/);
        assert.match(terminal, /站点描述/);
        assert.match(terminal, /头像链接/);
        assert.match(terminal, /@submit\.prevent="createLink"/);
        assert.match(terminal, /提交后直接公开/);
        assert.match(terminal, /linkReviewFilter: 'pending'/);
        assert.match(terminal, /linkStatusSaving: \{\}/);
        assert.match(terminal, /filteredReviewLinks/);
        assert.match(terminal, /友链审核状态/);
        assert.match(statusAction, /method: 'POST'/);
        assert.doesNotMatch(statusAction, /method: 'PATCH'/);
        assert.match(statusAction, /友链审核失败/);
    });

    it('keeps the QQ OAuth callback aligned with the production route', () => {
        const config = source('backend/config.js');
        const authRoutes = source('backend/routes/auth.js');

        assert.match(config, /\/api\/auth\/oauth\/qq\/callback/);
        assert.match(authRoutes, /router\.get\('\/oauth\/qq\/callback'/);
    });

    it('supports password setup during QQ email binding and email password recovery', () => {
        const login = source('src/frontend/pages/LoginPage.vue');
        const userCenter = source('src/frontend/pages/UserCenterPage.vue');
        const authRoutes = source('backend/routes/auth.js');

        assert.match(login, /openForgotPassword/);
        assert.match(login, /purpose: 'password_reset'/);
        assert.match(login, /\/api\/auth\/password\/reset/);
        assert.match(login, /newPassword: oauth\.newPassword/);
        assert.match(login, /t\.forgotPassword/);
        assert.match(login, /searchParams\.delete\('forgot'\)/);
        assert.match(userCenter, /forgot=1&redirect=%2Fuser-center/);
        assert.match(authRoutes, /router\.post\('\/password\/reset'/);
        assert.match(authRoutes, /consumeVerificationCode\(email, 'password_reset'/);
    });

    it('lets signed-in users unlink QQ with password confirmation', () => {
        const userCenter = source('src/frontend/pages/UserCenterPage.vue');
        const authRoutes = source('backend/routes/auth.js');

        assert.match(userCenter, /\/api\/auth\/oauth\/qq\/unlink/);
        assert.match(userCenter, /body: JSON\.stringify\(\{ currentPassword \}\)/);
        assert.match(authRoutes, /router\.post\('\/oauth\/qq\/unlink', authenticateToken/);
        assert.match(authRoutes, /deleteOAuthAccountForUser\(req\.user\.id, 'qq'\)/);
    });

    it('keeps mobile account security and the music playlist readable', () => {
        const userCenterCss = source('assets/css/vue/pages/user-center.css');
        const musicCss = source('assets/css/vue/music-player.css');

        assert.match(userCenterCss, /@media \(max-width: 720px\)[\s\S]*?\.uc-security-grid\s*{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
        assert.match(userCenterCss, /\.uc-security-grid > \*\s*{[\s\S]*?min-width: 0/);
        assert.match(musicCss, /\.site-music-playlist-drawer select\s*{[\s\S]*?color-scheme: dark/);
        assert.match(musicCss, /\.site-music-playlist-drawer select option\s*{[\s\S]*?background:/);
        assert.match(musicCss, /html\[data-theme="light"\] \.site-music-playlist-drawer select option/);
    });

    it('links the existing Agent OS app from the side navigation with a Lucide icon', () => {
        const shell = source('src/frontend/layouts/AppShell.vue');
        const icons = source('src/frontend/components/TsIcon.vue');

        assert.match(shell, /path: '\/agent-os'.+icon: 'bot'.+spa: false/);
        assert.match(icons, /bot:\s*\[/);
        assert.match(icons, /M12 8V4H8/);
    });

    it('loads the Kaguya game only on its isolated public route', () => {
        const router = source('src/frontend/router/index.js');
        const shell = source('src/frontend/layouts/AppShell.vue');
        const game = source('src/frontend/pages/GamePage.vue');
        const gameCss = source('src/frontend/styles/routes/game.css');
        const staticMiddleware = source('backend/middleware/static.js');

        assert.match(router, /path: '\/game',\s*name: 'game',\s*component: GamePage/);
        assert.match(shell, /path: '\/game'.+icon: 'gamepad'.+spa: true/);
        assert.match(game, /sandbox="allow-scripts allow-pointer-lock allow-downloads"/);
        assert.doesNotMatch(game, /allow-same-origin/);
        assert.match(game, /VITE_KAGUYA_GAME_URL/);
        assert.match(game, /kaguya-run-ef04c26b4900-r7\.html/);
        assert.match(game, /kaguya-run-ef04c26b4900-%72%33\.h%74%6dl/);
        assert.match(game, /:aria-busy="loading"/);
        assert.match(game, /https:\/\/www\.bilibili\.com\/video\/BV1Bmgx6aEvJ\//);
        assert.match(game, /rel="noopener noreferrer"/);
        assert.match(game, /event\.source !== frame\.value\?\.contentWindow/);
        assert.match(game, /tsukuyomi:kaguya-score/);
        assert.match(game, /loadKaguyaLeaderboard/);
        assert.match(game, /submitKaguyaScore/);
        assert.match(game, /LEADERBOARD_PAGE_SIZE = 50/);
        assert.match(game, /for \(let page = 2; page <= totalPages; page \+= 1\)/);
        assert.match(game, /loadKaguyaLeaderboard\(\{\s*page,\s*limit: LEADERBOARD_PAGE_SIZE\s*\}\)/);
        assert.match(game, /class="game-rank-list"[^>]+tabindex="0"/);
        assert.match(gameCss, /\.game-rank-list\s*\{[\s\S]*max-height:[\s\S]*overflow-y: auto;[\s\S]*touch-action: pan-y;/);
        assert.match(gameCss, /content-visibility: auto;/);
        assert.match(staticMiddleware, /'\/game'/);
    });

    it('credits the Agent OS music app source in the responsibility boundary and README', () => {
        const reality = source('src/frontend/pages/RealityPage.vue');
        const readme = source('README.md');

        for (const content of [reality, readme]) {
            assert.match(content, /https:\/\/github\.com\/firefly20041001\/yachiyo/);
            assert.match(content, /Apache-2\.0/);
        }
        assert.match(reality, /Agent OS 音乐 App 技术来源/);
        assert.match(reality, /Agent OS 音楽 App の技術出典/);
        assert.match(readme, /\| Pixel \|[^\n]+`\/pixel`/);
        assert.doesNotMatch(readme, /独立 Arena/);
    });

    it('uses /pixel everywhere while retaining only the explicit /arena redirect', () => {
        const router = source('src/frontend/router/index.js');
        const shell = source('src/frontend/layouts/AppShell.vue');
        const hub = source('src/frontend/pages/HubPage.vue');
        const userCenter = source('src/frontend/pages/UserCenterPage.vue');
        const notifications = source('backend/routes/pixel-art.js');
        const messages = source('src/frontend/i18n/messages.js');

        assert.match(router, /path: '\/pixel',\s*name: 'pixel'/);
        assert.match(router, /path: '\/arena\/:pathMatch\(\.\*\)\*'/);
        assert.match(messages, /arena: '像素画'/);
        assert.match(messages, /arena: 'ピクセルアート'/);
        assert.doesNotMatch(messages, /arena: '竞技场'|arena: 'アリーナ'/);
        for (const content of [shell, hub, userCenter, notifications]) {
            assert.doesNotMatch(content, /\/arena(?:[/?#'"`]|$)/);
        }
    });

    it('keeps the pixel gallery and home preview on separate CDN cache paths', () => {
        const arena = source('src/frontend/pages/ArenaPage.vue');
        const hub = source('src/frontend/pages/HubPage.vue');

        assert.match(arena, /\/api\/pixel-art\/gallery\?sort=/);
        assert.match(arena, /limit=\$\{PIXEL_GALLERY_PAGE_SIZE\}/);
        assert.match(arena, /pixels_base64/);
        assert.match(arena, /await loadFullArtwork\(artwork\)/);
        assert.match(hub, /\/api\/hub-preview/);
        assert.match(hub, /pixels_base64/);
        assert.doesNotMatch(arena, /\/api\/pixel-art\?sort=.*limit=36/);
    });

    it('previews native color-picker input without filling the saved palette', () => {
        const arena = source('src/frontend/pages/ArenaPage.vue');
        const pixelApi = source('backend/routes/pixel-art.js');

        assert.match(arena, /const MAX_CUSTOM_COLORS = 52/);
        assert.match(arena, /function previewCustomColor\(event\)/);
        assert.match(arena, /type="color" @input="previewCustomColor"/);
        assert.doesNotMatch(arena, /type="color" @input="selectCustomColor"/);
        assert.match(arena, /@click="selectCustomColor"/);
        assert.match(pixelApi, /const MAX_PALETTE_COLORS = 64/);
    });

    it('shows each gallery image uploader on cards, features, and the lightbox', () => {
        const gallery = source('src/frontend/pages/GalleryPage.vue');
        const repository = source('backend/repositories/asset-repository.js');

        assert.match(repository, /owner\.username AS owner_username/);
        assert.match(repository, /owner_has_avatar/);
        assert.match(repository, /http:\/\/thirdqq\.qlogo\.cn/);
        assert.match(repository, /'https:\/\/' \|\| substr\(owner\.avatar, 8\)/);
        assert.doesNotMatch(repository, /owner\.avatar AS owner_avatar/);
        assert.match(gallery, /function uploaderName\(asset\)/);
        assert.match(gallery, /function uploaderAvatarUrl\(asset\)/);
        assert.match(gallery, /`\/users\/\$\{encodeURIComponent\(username\)\}`/);
        assert.match(gallery, /class="gallery-uploader-avatar"/);
        assert.match(gallery, /@error="markUploaderAvatarFailed\(asset\)"/);
        assert.match(gallery, /class="gallery-uploader"/);
        assert.match(gallery, /class="gallery-uploader gallery-feature-uploader"/);
        assert.match(gallery, /class="gallery-uploader gallery-lightbox-uploader"/);
        assert.match(gallery, /<time :datetime="imageDate\(asset\)">/);
        assert.match(gallery, /asset\?\.preview_url \|\| asset\?\.access_url/);
        assert.match(gallery, /function handleImageError\(/);
        assert.match(gallery, /limit: '12'/);
    });

    it('fixes new pixel canvases at 192x108 and gives every like button a persistent red-heart state', () => {
        const arena = source('src/frontend/pages/ArenaPage.vue');
        const article = source('src/frontend/pages/ArticlePage.vue');
        const plaza = source('src/frontend/pages/PlazaPage.vue');
        const polish = source('assets/css/vue/product-polish.css');

        assert.match(arena, /DEFAULT_CANVAS_PRESET = CANVAS_PRESETS\[CANVAS_PRESETS\.length - 1\]/);
        assert.doesNotMatch(arena, /class="arena-size-options"|setCanvasPreset\(/);
        for (const page of [arena, article, plaza]) {
            assert.match(page, /class="[^"]*like-btn[^"]*"/);
            assert.match(page, /:aria-pressed=/);
        }
        assert.match(polish, /\.like-btn\.liked \.ts-icon\s*\{[\s\S]*color: #ff5f73;[\s\S]*fill: currentColor;/);
        assert.doesNotMatch(`${arena}\n${article}\n${plaza}`, /localStorage\.(?:getItem|setItem)\(`(?:pixel_art_)?liked_/);
        assert.match(arena, /Boolean\(artwork\?\.viewer_liked\)/);
        assert.match(article, /viewer_liked/);
        assert.match(plaza, /viewer_liked/);
    });

    it('keeps the Hub hero light in light mode while preserving the dark theme artwork', () => {
        const hub = source('assets/css/vue/pages/hub.css');
        const polish = source('assets/css/vue/product-polish.css');

        assert.match(hub, /html\[data-theme="light"\] body \.page\.hub \.hub-hero-panel::before\s*\{[\s\S]*rgba\(250, 253, 255, 0\.94\)/);
        assert.match(polish, /html:not\(\[data-theme="light"\]\) body \.page\.hub \.hub-hero-panel::before/);
    });

    it('uses path-level cache busting for every mutable public content read', () => {
        const client = source('src/frontend/api/client.js');
        const app = source('backend/app.js');

        assert.match(client, /function liveContentUrl\(/);
        assert.match(client, /articles\|messages\|assets\\\/gallery\|pixel-art\|friend-links/);
        assert.match(client, /`\/api\/live\/\$\{nonce\}/);
        assert.match(client, /function englishContentUrl\(/);
        assert.match(client, /`\/en-api\$\{value\.slice\('\/api'\.length\)\}`/);
        assert.match(client, /fetch\(apiUrl\(englishContentUrl\(url, options\)\)/);
        assert.match(app, /app\.use\('\/api\/live\/:nonce', liveContentRoutes\)/);
        assert.match(app, /\['GET', 'HEAD'\]/);
    });

    it('records one successful site visit per account and Hong Kong day', () => {
        const app = source('src/frontend/App.vue');

        assert.match(app, /timeZone: 'Asia\/Hong_Kong'/);
        assert.match(app, /authFetch\('\/api\/stats\/view'/);
        assert.match(app, /localStorage\.setItem\(VIEW_RECORDED_KEY, marker\)/);
        assert.match(app, /STATS_UPDATED_EVENT/);
        assert.doesNotMatch(app, /localStorage\.setItem\(VIEW_RECORDED_KEY, '1'\)/);
        assert.doesNotMatch(app, /apiBeacon\('\/api\/stats\/view'/);
    });
});

describe('notification dock badge', () => {
    it('sets a numeric app badge and clears it when unread reaches zero', async () => {
        const calls = [];
        const { badge, events } = loadNotificationBadge({
            async setAppBadge(count) {
                calls.push(['set', count]);
            },
            async clearAppBadge() {
                calls.push(['clear']);
            }
        });

        assert.equal(await badge.applyAppBadge(7), 7);
        assert.equal(await badge.applyAppBadge(0), 0);
        assert.deepEqual(calls, [['set', 7], ['clear']]);
        assert.equal(badge.publishNotificationBadge(3), 3);
        await Promise.resolve();
        assert.equal(events.at(-1).type, 'tsukuyomi:notification-badge');
        assert.equal(events.at(-1).detail.count, 3);
    });

    it('keeps app badging separate from attention and synchronizes every inbox surface', () => {
        const badge = source('src/frontend/services/notificationBadge.js');
        const shell = source('src/frontend/layouts/AppShell.vue');
        const inbox = source('src/frontend/pages/NotificationsPage.vue');

        assert.doesNotMatch(badge, /requestUserAttention|requestPermission|new Notification/);
        assert.match(shell, /NOTIFICATION_BADGE_EVENT/);
        assert.match(shell, /UNREAD_POLL_INTERVAL_MS = 60000/);
        assert.match(shell, /response\.status === 401[\s\S]*publishNotificationBadge\(0\)/);
        assert.match(inbox, /setUnreadCount\(result\.unread/);
        assert.match(inbox, /setUnreadCount\(result\.data\?\.count\)/);
    });
});

describe('platform material surfaces', () => {
    it('maps native material roles without changing control semantics', () => {
        const appStyles = source('assets/css/vue-app.css');
        const materials = source('src/frontend/styles/materials.css');
        const shell = source('src/frontend/layouts/AppShell.vue');
        const main = source('src/frontend/main.js');

        assert.match(appStyles, /materials\.css/);
        assert.match(shell, /class="site-rail" data-material="sidebar"/);
        assert.match(shell, /class="topbar site-commandbar" data-material="header"/);
        assert.match(shell, /data-material="popover" role="dialog"/);
        assert.match(materials, /\[data-material="hud"\]/);
        assert.match(materials, /html\[data-window-active="false"\] \[data-material\]/);
        assert.match(main, /document\.documentElement\.dataset\.windowActive/);
        assert.doesNotMatch(shell, /role="button"[^>]*data-material/);
    });

    it('degrades safely for narrow screens and reduced transparency', () => {
        const materials = source('src/frontend/styles/materials.css');

        assert.match(materials, /@media \(max-width: 860px\)/);
        assert.match(materials, /\.room-shell \[data-material\]:not\(\[data-material="hud"\]\)[\s\S]*--ts-current-material-filter: none/);
        assert.match(materials, /\.room-shell \.status-layer\.active[\s\S]*backdrop-filter: none/);
        assert.match(materials, /prefers-reduced-transparency: reduce/);
        assert.match(materials, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
        assert.match(materials, /overflow-wrap: anywhere/);
        assert.match(materials, /\[role="dialog"\]\[data-material="popover"\][\s\S]*max-height/);
    });
});

describe('unified async loading states', () => {
    it('registers shared skeleton and status-loader primitives with resilient geometry', () => {
        const main = source('src/frontend/main.js');
        const styles = source('src/frontend/styles/loading-states.css');
        const appStyles = source('assets/css/vue-app.css');
        const skeleton = source('src/frontend/components/LoadingSkeleton.vue');
        const statusLoader = source('src/frontend/components/StatusLoader.vue');

        assert.match(main, /app\.component\('LoadingSkeleton', LoadingSkeleton\)/);
        assert.match(main, /app\.component\('StatusLoader', StatusLoader\)/);
        assert.match(appStyles, /loading-states\.css/);
        assert.doesNotMatch(skeleton, /role="status"/);
        assert.match(statusLoader, /role="status" aria-live="polite"/);
        assert.match(statusLoader, /role="progressbar"/);
        assert.doesNotMatch(statusLoader, /<TsIcon/);
        assert.doesNotMatch(statusLoader, /ts-status-loader-copy/);
        assert.match(statusLoader, /indeterminate: progressValue === null/);
        assert.match(styles, /width: min\(100%, 8rem\)/);
        assert.match(styles, /width: min\(100%, 20rem\)/);
        assert.match(styles, /height: 2px/);
        assert.match(styles, /@keyframes ts-loader-progress/);
        assert.match(styles, /\.ts-loader-region[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
        assert.doesNotMatch(styles, /div\.ts-status-loader-progress\s*\{[^}]*background:/s);
        assert.doesNotMatch(styles, /\.ts-status-loader-progress > span\s*\{[^}]*box-shadow:/s);
        assert.doesNotMatch(styles, /width: min\(100%, 34rem\)/);
        assert.match(styles, /data-skeleton-variant="gallery"/);
        assert.match(styles, /data-skeleton-variant="list"[^}]*grid-template-columns: 1fr/s);
        assert.match(styles, /data-skeleton-variant="article"/);
        assert.match(styles, /data-skeleton-variant="hub"/);
        assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
    });

    it('marks known content regions busy and replaces skeletons with errors or results', () => {
        const gallery = source('src/frontend/pages/GalleryPage.vue');
        const stage = source('src/frontend/pages/StagePage.vue');
        const notifications = source('src/frontend/pages/NotificationsPage.vue');
        const plaza = source('src/frontend/pages/PlazaPage.vue');
        const userCenter = source('src/frontend/pages/UserCenterPage.vue');
        const hub = source('src/frontend/pages/HubPage.vue');

        assert.match(gallery, /:aria-busy="state\.loading \|\| state\.uploading"/);
        assert.match(gallery, /LoadingSkeleton v-if="state\.loading"[\s\S]*v-else-if="state\.loadError"[^>]*role="alert"[\s\S]*v-else-if="!shownImages\.length"/);
        assert.match(stage, /LoadingSkeleton v-if="articlesLoading"[\s\S]*v-else-if="articlesError"[^>]*role="alert"[\s\S]*v-else-if="!filteredArticles\.length"/);
        assert.match(notifications, /LoadingSkeleton v-if="inbox\.loading"[\s\S]*v-else-if="inbox\.message"[^>]*role="alert"[\s\S]*v-else-if="!inbox\.items\.length"/);
        assert.match(plaza, /LoadingSkeleton v-if="plaza\.loading"[\s\S]*v-else-if="plaza\.loadError"[^>]*role="alert"[\s\S]*v-else-if="!plazaMessages\.length"/);
        assert.match(userCenter, /LoadingSkeleton v-if="uc\.articleLoading"[\s\S]*v-else-if="uc\.articleError"[^>]*role="alert"/);
        assert.match(hub, /LoadingSkeleton v-if="previewLoading" variant="hub"[\s\S]*v-else-if="previewError"[^>]*role="alert"/);
    });

    it('loads the notification inbox in bounded server-side pages', () => {
        const notifications = source('src/frontend/pages/NotificationsPage.vue');
        const styles = source('assets/css/vue/pages/notifications.css');

        assert.match(notifications, /NOTIFICATIONS_PAGE_SIZE = 12/);
        assert.match(notifications, /page: String\(requestedPage\)[\s\S]*limit: String\(NOTIFICATIONS_PAGE_SIZE\)/);
        assert.match(notifications, /result\.pagination\?\.totalPages/);
        assert.match(notifications, /class="notifications-pagination"/);
        assert.match(notifications, /aria-current="item === inbox\.page \? 'page' : undefined"/);
        assert.match(styles, /\.notifications-page-controls/);
        assert.match(styles, /\.notifications-page-button:focus-visible/);
    });

    it('uses status loaders for unknown work and exposes a persistent Room error state', () => {
        const access = source('src/frontend/pages/AccessPage.vue');
        const login = source('src/frontend/pages/LoginPage.vue');
        const terminal = source('src/frontend/pages/TerminalPage.vue');
        const roomOverlay = source('src/frontend/components/room/RoomLoadingOverlay.vue');
        const roomState = source('src/frontend/composables/room/useRoomState.js');

        for (const content of [access, login, terminal, roomOverlay]) {
            assert.match(content, /<StatusLoader/);
            assert.match(content, /aria-busy/);
        }
        assert.match(roomState, /error: false/);
        assert.match(roomState, /loading\.error = true/);
        assert.doesNotMatch(roomOverlay, /status-progress/);
        assert.match(roomOverlay, /class="ts-loader-region"[\s\S]*<StatusLoader/);
        assert.match(roomOverlay, /v-if="active"[\s\S]*v-else-if="error"[\s\S]*role="alert"/);
    });
});

describe('terminal privilege boundaries', () => {
    it('hides infrastructure settings and submits only site settings for ordinary admins', () => {
        const terminal = source('src/frontend/pages/TerminalPage.vue');

        assert.match(terminal, /v-if="canManageAccounts" class="terminal-settings-block terminal-oss-settings"/);
        assert.match(terminal, /Object\.fromEntries\(SITE_SETTING_KEYS\.map/);
    });

    it('keeps message moderation actions visible and exposes the banned role', () => {
        const terminal = source('src/frontend/pages/TerminalPage.vue');
        const terminalCss = source('assets/css/vue/pages/terminal.css');

        assert.match(terminal, /terminal-message-actions/);
        assert.match(terminal, /approveMessage\(item\)/);
        assert.match(terminal, /deleteMessage\(item\.id\)/);
        assert.match(terminal, /reviewDigest: item\.moderation\?\.reviewDigest/);
        assert.match(terminal, /confirmExternalLink: externalHosts\.length > 0/);
        assert.match(terminal, /class="terminal-message-risk" role="alert"/);
        assert.match(terminal, /<option value="banned">banned<\/option>/);
        assert.match(terminalCss, /terminal-message-table th:last-child[\s\S]*position: sticky/);
    });

    it('keeps user role saves visible and reports failures in place', () => {
        const terminal = source('src/frontend/pages/TerminalPage.vue');

        assert.match(terminal, /method: 'POST'/);
        assert.match(terminal, /userRoleSaving: \{\}/);
        assert.match(terminal, /user\.role = result\?\.role \|\| role/);
        assert.match(terminal, /showMessage\(error\.message \|\| '用户角色保存失败', 'error'\)/);
        assert.match(terminal, /:aria-busy="Boolean\(terminal\.userRoleSaving\[item\.id\]\)"/);
        assert.match(terminal, /terminal\.userRoleSaving\[item\.id\] \? '保存中' : '保存'/);
    });

    it('uses a compact Ant-style workspace with bounded tables and the existing icon system', () => {
        const terminal = source('src/frontend/pages/TerminalPage.vue');
        const pagination = source('src/frontend/components/terminal/TerminalPagination.vue');
        const styles = source('assets/css/vue/pages/terminal-ant.css');
        const packageJson = source('package.json');

        assert.match(terminal, /import TerminalPagination/);
        assert.match(terminal, /articleStatusFilter: 'all'/);
        assert.match(terminal, /messageStatusFilter: 'all'/);
        assert.match(terminal, /const pagedArticles = computed/);
        assert.match(terminal, /const pagedMessages = computed/);
        assert.match(terminal, /<TsIcon :name="panel\.icon"/);
        assert.match(pagination, /pageItems = computed/);
        assert.match(styles, /--terminal-ant-primary: #1677ff/);
        assert.match(styles, /backdrop-filter: none/);
        assert.doesNotMatch(packageJson, /"antd"\s*:/);
    });
});

describe('content administration workspace', () => {
    it('keeps the private admin route available without exposing it in site navigation', () => {
        const router = source('src/frontend/router/index.js');
        const shell = source('src/frontend/layouts/AppShell.vue');
        const staticMiddleware = source('backend/middleware/static.js');

        assert.match(router, /path: '\/admin'/);
        assert.match(router, /name: 'admin'/);
        assert.match(router, /component: AdminPage/);
        assert.match(router, /noindex: true/);
        assert.doesNotMatch(shell, /path: '\/admin'/);
        assert.doesNotMatch(shell, /key: 'admin'/);
        assert.match(staticMiddleware, /'Disallow: \/admin'/);
        assert.match(staticMiddleware, /'\/admin'/);
    });

    it('uses the restricted moderation API for articles and messages', () => {
        const page = source('src/frontend/pages/AdminPage.vue');
        const pageCss = source('assets/css/vue/pages/admin.css');
        const editor = source('src/frontend/pages/EditorPage.vue');
        const routes = source('backend/routes/moderation.js');
        const assets = source('backend/routes/assets.js');

        assert.match(page, /\/api\/moderation\/me/);
        assert.match(page, /\/api\/moderation\/articles/);
        assert.match(page, /\/api\/moderation\/messages/);
        assert.match(page, /query\.set\('scope', 'all'\)/);
        assert.match(page, /query\.set\('collection', 'attachments'\)/);
        assert.match(page, /messageFilter: 'all'/);
        assert.match(page, /\{ id: 'all', label: '全部' \}/);
        assert.match(page, /\{ id: 'pending', label: '待审核' \}/);
        assert.match(page, /\{ id: 'approved', label: '已通过' \}/);
        assert.match(page, /currentPagination\.totalPages > 1/);
        assert.match(page, /function goToPage\(page\)/);
        assert.match(page, /function loadActivePage\(\)/);
        assert.doesNotMatch(page, /Promise\.all\(\[\s*adminApi\(noStoreUrl\('\/api\/moderation\/articles'/);
        assert.match(pageCss, /\.admin-pagination/);
        assert.match(page, /reviewDigest: item\.moderation\?\.reviewDigest/);
        assert.match(page, /confirmExternalLink: externalHosts\.length > 0/);
        assert.match(page, /method: 'POST'/);
        assert.match(editor, /\/api\/moderation\/articles\/\$\{id\}\/save/);
        assert.match(routes, /router\.use\(authenticateToken, requireAdmin\)/);
        assert.match(routes, /function pageQuery\(req, defaultLimit = 12\)/);
        assert.match(routes, /status = \['pending', 'approved'\]\.includes\(req\.query\.status\)/);
        assert.match(assets, /router\.post\('\/:id\/delete', authenticateToken, requireAdmin, deleteAsset\)/);
        assert.match(assets, /collection \|\| ''\).*=== 'attachments'/);
    });
});

describe('user center message management', () => {
    it('loads, edits, and deletes only the signed-in users messages', () => {
        const userCenter = source('src/frontend/pages/UserCenterPage.vue');

        assert.match(userCenter, /authFetch\(`\/api\/messages\/mine\?limit=100/);
        assert.match(userCenter, /method: 'PATCH'/);
        assert.match(userCenter, /ucSaveMessage\(message\)/);
        assert.match(userCenter, /ucDeleteMessage\(message\)/);
        assert.match(userCenter, /<TsIcon name="trash"/);
    });
});
