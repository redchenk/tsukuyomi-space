const { createHash } = require('node:crypto');
const { test: base, expect } = require('@playwright/test');

// Independent browser sessions should not exhaust a shared localhost API quota.
// Use documentation-only IPs through the existing loopback proxy path. External
// test targets keep their normal headers and production limits stay unchanged.
const test = base.extend({
    extraHTTPHeaders: async ({ extraHTTPHeaders, baseURL }, use, testInfo) => {
        const hostname = new URL(baseURL || 'http://127.0.0.1:4174').hostname;
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
            await use(extraHTTPHeaders);
            return;
        }
        const identity = createHash('sha256').update(testInfo.testId).digest('hex');
        const ip = `2001:db8:${identity.slice(0, 4)}:${identity.slice(4, 8)}::1`;
        await use({ ...extraHTTPHeaders, 'X-Real-IP': ip });
    }
});

module.exports = { test, expect };
