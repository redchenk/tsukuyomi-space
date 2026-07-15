const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
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
    it('routes the Plaza friend-link card to the dedicated application page', () => {
        const router = source('src/frontend/router/index.js');
        const plaza = source('src/frontend/pages/PlazaPage.vue');
        const application = source('src/frontend/pages/FriendLinkApplyPage.vue');

        assert.match(router, /path: '\/friend-links\/apply'/);
        assert.match(router, /name: 'friendLinkApply'/);
        assert.match(plaza, /url: '\/friend-links\/apply'/);
        assert.match(application, /\/api\/friend-links/);
        assert.match(application, /TsIcon name="external"/);
    });

    it('links the existing Agent OS app from the side navigation with a Lucide icon', () => {
        const shell = source('src/frontend/layouts/AppShell.vue');
        const icons = source('src/frontend/components/TsIcon.vue');

        assert.match(shell, /path: '\/agent-os'.+icon: 'bot'.+spa: false/);
        assert.match(icons, /bot:\s*\[/);
        assert.match(icons, /M12 8V4H8/);
    });

    it('uses /pixel everywhere while retaining only the explicit /arena redirect', () => {
        const router = source('src/frontend/router/index.js');
        const shell = source('src/frontend/layouts/AppShell.vue');
        const hub = source('src/frontend/pages/HubPage.vue');
        const userCenter = source('src/frontend/pages/UserCenterPage.vue');
        const notifications = source('backend/routes/pixel-art.js');

        assert.match(router, /path: '\/pixel',\s*name: 'pixel'/);
        assert.match(router, /path: '\/arena\/:pathMatch\(\.\*\)\*'/);
        for (const content of [shell, hub, userCenter, notifications]) {
            assert.doesNotMatch(content, /\/arena(?:[/?#'"`]|$)/);
        }
    });

    it('keeps the pixel gallery and home preview on separate CDN cache paths', () => {
        const arena = source('src/frontend/pages/ArenaPage.vue');
        const hub = source('src/frontend/pages/HubPage.vue');

        assert.match(arena, /\/api\/pixel-art\/gallery\?sort=/);
        assert.match(hub, /\/api\/pixel-art\/preview\?sort=latest/);
        assert.doesNotMatch(arena, /\/api\/pixel-art\?sort=.*limit=36/);
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
        assert.match(terminal, /approveMessage\(item\.id\)/);
        assert.match(terminal, /deleteMessage\(item\.id\)/);
        assert.match(terminal, /<option value="banned">banned<\/option>/);
        assert.match(terminalCss, /terminal-message-table th:last-child[\s\S]*position: sticky/);
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
