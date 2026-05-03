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
            use: { ...devices['Desktop Chrome'] }
        }
    ],
    webServer: process.env.E2E_BASE_URL ? undefined : {
        command: 'node tests/e2e-server.cjs',
        url: 'http://127.0.0.1:4174/api/health',
        reuseExistingServer: false,
        timeout: 30 * 1000
    }
});
