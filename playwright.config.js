const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 30 * 1000,
    expect: { timeout: 8 * 1000 },
    fullyParallel: false,
    reporter: [['list']],
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4174',
        trace: 'on-first-retry'
    },
    projects: [
        {
            name: 'chromium',
            // PW_CHANNEL lets local runs borrow a system browser (e.g. msedge)
            // when the Playwright browser download is unavailable; CI leaves it unset.
            use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined }
        }
    ],
    webServer: process.env.E2E_BASE_URL ? undefined : {
        command: 'node tests/e2e-server.cjs',
        url: 'http://127.0.0.1:4174/api/health',
        reuseExistingServer: false,
        timeout: 30 * 1000
    }
});
