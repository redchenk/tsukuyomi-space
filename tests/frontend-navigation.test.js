const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
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
