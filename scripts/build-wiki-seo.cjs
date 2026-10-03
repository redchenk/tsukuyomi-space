// Build public Wiki summaries from the exact sources used by Vue. Generated
// metadata is checked in so production needs neither a compiler nor new RAM.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const root = path.join(__dirname, '..');
const result = buildSync({ stdin: { contents: "import {characterEntries,termEntries} from './src/frontend/data/cosmicKaguyaWikiEntries.js'; import {parseMediaWikiArticle} from './src/frontend/utils/mediaWikiArticle.js'; export {characterEntries,termEntries,parseMediaWikiArticle};", resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', write: false });
const compiled = new Module(path.join(root, '.wiki-seo-build.cjs'), module);
compiled.filename = path.join(root, '.wiki-seo-build.cjs'); compiled.paths = module.paths;
compiled._compile(result.outputFiles[0].text, compiled.filename);
const { characterEntries, termEntries, parseMediaWikiArticle } = compiled.exports;
const documents = {};
for (const entry of [...characterEntries, ...termEntries]) {
    let sections = entry.sections.map(([title, paragraphs]) => ({ title, paragraphs }));
    if (entry.sourceArticle) {
        const source = fs.readFileSync(path.join(root, 'src/frontend/data/wiki-sources', `${entry.sourceArticle}.mediawiki`), 'utf8');
        sections = parseMediaWikiArticle(source).sections.filter(s => ['source-lead', 'source-intro'].includes(s.id)).map(s => ({ title: s.title, html: s.html }));
    }
    documents[`${entry.kind}/${entry.slug}`] = { facts: entry.facts, sections, sources: entry.sourceLinks, verifiedAt: entry.verifiedAt };
}
const output = JSON.stringify(documents, null, 2) + '\n';
const target = path.join(root, 'backend/seo/wiki-documents.json');
if (process.argv.includes('--check')) {
    if (fs.readFileSync(target, 'utf8') !== output) throw new Error('Wiki SEO snapshot is stale; run npm run build:wiki-seo');
} else fs.writeFileSync(target, output);
