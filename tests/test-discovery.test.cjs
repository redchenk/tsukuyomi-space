const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverTests } = require('../scripts/run-tests.cjs');

test('test discovery includes new top-level tests once and leaves E2E and live scripts separate', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'test-discovery-'));
    try {
        for (const name of ['new.test.js', 'frontend-new.test.mjs', 'pixel-color.test.js',
            'official-api-entitlement.test.js', 'other.test.cjs', 'browser.spec.js', 'live-check.js', 'example_test.py']) {
            fs.writeFileSync(path.join(directory, name), '');
        }
        fs.mkdirSync(path.join(directory, 'nested.test.js'));
        fs.writeFileSync(path.join(directory, 'nested.test.js', 'private.test.js'), '');
        const names = group => discoverTests(group, directory).map(file => path.basename(file));
        assert.deepEqual(names('all'), ['frontend-new.test.mjs', 'new.test.js',
            'official-api-entitlement.test.js', 'other.test.cjs', 'pixel-color.test.js']);
        assert.deepEqual(names('frontend'), ['frontend-new.test.mjs', 'pixel-color.test.js']);
        assert.throws(() => discoverTests('unknown', directory), /Unknown test group/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
