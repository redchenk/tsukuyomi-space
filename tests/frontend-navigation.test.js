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
