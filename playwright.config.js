const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    // Shared CI runners need time for browser setup and multi-page journeys.
    // Individual UI assertions keep their independent 8-second deadline.
    timeout: (process.env.CI ? 90 : 30) * 1000,
    expect: { timeout: 8 * 1000 },
    // Preserve the first failure trace, then retry once in a fresh worker on
    // shared CI runners. Persistent failures still block deployment.
    retries: process.env.CI ? 1 : 0,
    fullyParallel: false,
    reporter: [['list']],
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4174',
        trace: 'on-first-retry'
    },
    projects: [
        {
            name: 'webkit-iphone11',
            testMatch: /(?:room-memory-414|official-tts|room-official-images)\.spec\.js/,
            use: { ...devices['iPhone 11'] }
        },
        {
            name: 'chromium',
            // PW_CHANNEL lets local runs borrow a system browser (e.g. msedge)
            // when the Playwright browser download is unavailable; CI leaves it unset.
            use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined }
        },
        {
            name: 'chromium-mobile',
            testMatch: /(?:terminal-official-usage|room-dialogue-architecture|room-affection|drift-keyboard|drift-themes|drift-daily|scroll-motion|access-transition|room-entry|site-knowledge|article-sharing|pixel-mobile-canvas|room-feedback|game-center|kaguya-ride|upload-ui|attachment-upload)\.spec\.js/,
            use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL || undefined }
        },
        {
            name: 'webkit-mobile',
            testMatch: /(?:terminal-official-usage|room-dialogue-architecture|room-affection|drift-keyboard|drift-themes|drift-daily|scroll-motion|access-transition|room-entry|site-knowledge|github-oauth|qq-binding|partner-oauth|route-return|access-i18n|gallery-liked-feedback|room-oneclick-tts|room-gpt-sovits-remote|room-mobile-(?:keyboard|scene)|room-season-scene|room-settings-redesign|room-model-catalog|room-model-runtime|room-reading-recording|room-images-article-replies|room-feedback|game-center|kaguya-ride|upload-ui|attachment-upload|article-loading|article-jump|article-sharing|pixel-mobile-canvas|unified-navigation|directed-replies|user-nickname|search-password-forms|netease-music)\.spec\.js/,
            use: { ...devices['iPhone 13'] }
        }
    ],
    webServer: process.env.E2E_BASE_URL ? undefined : {
        command: 'node tests/e2e-server.cjs',
        url: 'http://127.0.0.1:4174/api/health',
        reuseExistingServer: false,
        timeout: 30 * 1000
    }
});
