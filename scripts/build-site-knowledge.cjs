// Build from the same Wiki sources as Vue; production never bundles or parses MediaWiki.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const { plainHtml } = require('../backend/services/site-knowledge-corpus');
const root = path.join(__dirname, '..');
const result = buildSync({ stdin: { contents: "export {characterEntries,termEntries} from './src/frontend/data/cosmicKaguyaWikiEntries.js'; export {parseMediaWikiArticle} from './src/frontend/utils/mediaWikiArticle.js';", resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', write: false });
const compiled = new Module(path.join(root, '.site-knowledge-build.cjs'), module);
compiled.filename = path.join(root, '.site-knowledge-build.cjs'); compiled.paths = module.paths;
compiled._compile(result.outputFiles[0].text, compiled.filename);
const { characterEntries, termEntries, parseMediaWikiArticle } = compiled.exports;
const documents = require('../backend/data/site-knowledge-guides.json').map(doc => ({ ...doc, updatedAt: '2026-10-15' }));
for (const entry of [...characterEntries, ...termEntries]) {
    const title = entry.title || entry.name || entry.slug;
    let sections = entry.sections.map(([heading, paragraphs]) => ({ title: heading, text: paragraphs.join('\n'), spoiler: /经历|剧情|关系|结局|真相|身世|伏笔/.test(heading) }));
    if (entry.sourceArticle) {
        const raw = fs.readFileSync(path.join(root, 'src/frontend/data/wiki-sources', `${entry.sourceArticle}.mediawiki`), 'utf8');
        sections = parseMediaWikiArticle(raw).sections.map(section => ({ title: section.title, text: plainHtml(section.html),
            spoiler: !['source-lead', 'source-intro'].includes(section.id) || /wiki-source-blackout|剧透提醒/.test(section.html) }));
    }
    const facts = (entry.facts || []).map(fact => fact.join('：')).join('\n');
    documents.push({ id: `wiki:${entry.kind}/${entry.slug}`, title, kind: 'wiki',
        url: `/wiki/${entry.kind === 'character' ? 'characters' : 'terms'}/${entry.slug}`, updatedAt: entry.verifiedAt || '',
        sections: [{ title: '基本资料', text: facts, spoiler: /真名|身世|结局/.test(facts) }, ...sections] });
}
const output = JSON.stringify(documents, null, 2) + '\n';
const target = path.join(root, 'backend/data/site-knowledge.json');
if (process.argv.includes('--check')) {
    if (fs.readFileSync(target, 'utf8') !== output) throw new Error('Public knowledge snapshot is stale; run npm run build:knowledge');
} else fs.writeFileSync(target, output);
