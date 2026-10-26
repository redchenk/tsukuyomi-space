const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test: base, expect } = require('./e2e-fixtures.cjs');

// Picking is random across the whole ocean, even for independent accounts.
// Serialize these scenarios across files and browser projects sharing a server.
const test = base.extend({
    sharedOcean: [async ({ baseURL }, use) => {
        const key = createHash('sha256').update(baseURL).digest('hex').slice(0, 16);
        const lock = path.join(os.tmpdir(), `tsukuyomi-e2e-drift-${key}.lock`);
        let handle;
        while (!handle) {
            try {
                handle = await fs.open(lock, 'wx');
            } catch (error) {
                if (error.code !== 'EEXIST') throw error;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        try { await use(); }
        finally {
            await handle.close();
            await fs.unlink(lock);
        }
    }, { auto: true, timeout: 120_000 }]
});

module.exports = { test, expect };
