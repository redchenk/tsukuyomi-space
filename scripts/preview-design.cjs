// Build the real app with its development catalogue, then serve the existing isolated fixture.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--overseas')) throw new Error('Use --overseas for the English edition.');
const mode = args.includes('--overseas') ? 'overseas' : 'production';
const vite = path.resolve(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const artifact = path.join(root, 'dist/design-preview');
const build = spawnSync(process.execPath, [vite, 'build', '--config', 'vite.frontend.config.js', '--mode', mode, '--outDir', artifact], {
  cwd: root, env: { ...process.env, VITE_DESIGN_PREVIEW: '1' }, stdio: 'inherit'
});
if (build.status !== 0) process.exit(build.status || 1);
process.env.E2E_FRONTEND_ARTIFACT = artifact;
process.env.JINGYUE_DESIGN_PREVIEW = '1';
process.env.JINGYUE_PREVIEW_ENGLISH = mode === 'overseas' ? '1' : '0';
require('./preview-ui.cjs');
