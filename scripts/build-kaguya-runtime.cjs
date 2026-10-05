'use strict';
// Input is the existing, operator-supplied game export; no media is added to Git.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const zlib = require('node:zlib');
const patch = require('../shared/kaguya-project-patch.cjs');
const [input, destination] = process.argv.slice(2);
if (!input || !destination) throw new Error('Usage: node scripts/build-kaguya-runtime.cjs <existing-r7.html> <output-directory>');
let html = fs.readFileSync(input, 'utf8');
if (crypto.createHash('sha256').update(html).digest('hex') !== '65e9088158219516cfb851ee196304d3a8e2aada4844e95870ab27b765539639') throw new Error('Unexpected source game digest');
const scripts = [...html.matchAll(/<script([^>]*)>(.*?)<\/script>/gs)];
const doc = { currentScript: null };
const context = vm.createContext({ document: doc, setProgress() {}, interpolate() {}, handleError(error) { throw error; } });
vm.runInContext(scripts[2][2], context);
for (const match of html.matchAll(/<script data="([^"]*)">decodeChunk\((\d+)\)<\/script>/g)) {
  doc.currentScript = { tagName: 'SCRIPT', getAttribute: () => match[1], remove() {} };
  vm.runInContext(`decodeChunk(${Number(match[2])})`, context);
}
const project = Buffer.from(vm.runInContext('projectDecodeBuffer', context)).subarray(0, 73620642);
const directory = path.resolve(destination); fs.mkdirSync(directory, { recursive: true });
const stem = 'kaguya-run-ef04c26b4900-r8';
fs.writeFileSync(path.join(directory, stem + '.sb3.gz'), zlib.gzipSync(project, { level: 6 }));
// Remove the 92 MB inline encoded archive. A public, anonymous binary fetch avoids its text/DOM overhead.
html = html.replace(scripts[2][0], '').replace(/<script data="[^"]*">decodeChunk\(\d+\)<\/script>\s*/g, '');
const patchSource = patch.toString();
const loader = `const patchGameProject = ${patchSource};\n` + scripts.at(-2)[2].slice(scripts.at(-2)[2].indexOf('const getProjectData ='));
const oldDecode = /return \(\) => \(\(\) => \{[\s\S]*?\}\)\(\)\.then\(async \(data\) => \{/;
if (!oldDecode.test(loader)) throw new Error('Missing archive loader');
const newLoader = loader.replace(oldDecode, `return () => fetch(new URL('/game-runtime/${stem}.sb3', location.href), { credentials: 'omit', mode: 'cors' }).then(async (response) => {
          if (!response.ok) throw new Error('Game archive HTTP ' + response.status);
          return new Uint8Array(await response.arrayBuffer());
        }).then(async (data) => {`);
html = html.replace(scripts.at(-2)[0], '<script>\n' + newLoader + '\n</script>');
let run = scripts.at(-1)[2];
const start = run.indexOf('      const stageTarget =');
const end = run.indexOf('      setProgress(1);', start);
run = run.slice(0, start) + `      const stability = TsukuyomiKaguyaRuntime.attach(vm, {
        report: (score) => window.parent.postMessage({ type: 'tsukuyomi:kaguya-score', score }, '*')
      });
      window.__kaguyaStability = stability;
      window.addEventListener('pagehide', () => { stability.dispose(); vm.stopAll(); }, { once: true });
` + run.slice(end);
run = run.replace('      setProgress(1);', `      window.parent.postMessage({ type: 'tsukuyomi:kaguya-status', status: 'ready' }, '*');\n      setProgress(1);`).replace('run().catch(handleError);', `run().catch((error) => { handleError(error); window.parent.postMessage({ type: 'tsukuyomi:kaguya-status', status: 'error' }, '*'); });`);
html = html.replace(scripts.at(-1)[0], '<script>\n' + fs.readFileSync(path.join(__dirname, '../shared/kaguya-runtime.cjs'), 'utf8') + '\n' + run + '\n</script>');
html = html.replace('maxClones: 9999999999', 'maxClones: 300').replace('warpTimer: false', 'warpTimer: true');
fs.writeFileSync(path.join(directory, stem + '.html.gz'), zlib.gzipSync(html, { level: 6 }));
fs.writeFileSync(path.join(directory, stem + '.html'), html);
console.log(JSON.stringify({ htmlBytes: Buffer.byteLength(html), archiveBytes: project.length, files: [stem + '.html.gz', stem + '.sb3.gz'] }));
