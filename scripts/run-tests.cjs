const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const frontendShared = new Set(['markdown', 'notice-markdown', 'pixel-color', 'room-dialogue']);

// Only top-level unit/integration tests belong here. E2E, Python and live-service
// verification retain their own entry points and environment requirements.
function discoverTests(group = 'all', directory = path.join(root, 'tests')) {
    if (!['all', 'frontend'].includes(group)) throw new Error(`Unknown test group: ${group}`);
    return fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.test\.(?:js|cjs|mjs)$/.test(entry.name))
        .map(entry => entry.name)
        .filter(name => group === 'all' || name.startsWith('frontend-')
            || frontendShared.has(name.replace(/\.test\.(?:js|cjs|mjs)$/, '')))
        .sort()
        .map(name => path.join(directory, name));
}

if (require.main === module) {
    const files = discoverTests(process.argv[2] || 'all');
    if (!files.length) throw new Error('No tests discovered');
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...files], {
        cwd: root, env: process.env, stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.signal) process.kill(process.pid, result.signal);
    else process.exitCode = result.status ?? 1;
}

module.exports = { discoverTests };
