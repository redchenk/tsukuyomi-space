const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

process.env.ROOM_MEMORY_VECTOR_BACKEND = process.env.ROOM_MEMORY_VECTOR_BACKEND || 'milvus';
process.env.MILVUS_ADDRESS = process.env.MILVUS_ADDRESS || '127.0.0.1:19530';

const { createMemoryEmbedding } = require('../backend/services/room-embedding');
const milvusStore = require('../backend/services/room-milvus-store');

const DEFAULT_CORPUS_PATH = 'E:\\visualstudio\\yachiyo_novel_detailed_corpus.txt';
const SOURCE_TYPE = 'yachiyo_corpus';

function argValue(name) {
    const prefix = `${name}=`;
    const match = process.argv.find(item => item.startsWith(prefix));
    if (match) return match.slice(prefix.length);
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}

function compactText(value, limit = 8000) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function chunkCorpus(text, targetSize = 900, maxSize = 1400) {
    const paragraphs = String(text || '')
        .split(/\n\s*\n+/)
        .map(item => compactText(item, maxSize))
        .filter(item => item.length >= 24);
    const chunks = [];
    let current = '';
    for (const paragraph of paragraphs) {
        if (current && `${current}\n${paragraph}`.length > maxSize) {
            chunks.push(current);
            current = '';
        }
        current = current ? `${current}\n${paragraph}` : paragraph;
        if (current.length >= targetSize) {
            chunks.push(current);
            current = '';
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

function stableId(sourcePath, index, content) {
    const hash = crypto.createHash('sha256')
        .update(`${path.resolve(sourcePath)}\n${index}\n${content}`)
        .digest('hex')
        .slice(0, 40);
    return `persona_${hash}`;
}

async function main() {
    const corpusPath = path.resolve(argValue('--file') || process.argv[2] || process.env.ROOM_PERSONA_CORPUS_PATH || DEFAULT_CORPUS_PATH);
    if (!fs.existsSync(corpusPath)) {
        throw new Error(`Corpus file not found: ${corpusPath}`);
    }

    await milvusStore.ensureCollection();
    if (process.argv.includes('--clear')) {
        await milvusStore.clearPersonaMemories(SOURCE_TYPE);
    }

    const raw = fs.readFileSync(corpusPath, 'utf8');
    const chunks = chunkCorpus(raw);
    let imported = 0;
    for (let index = 0; index < chunks.length; index += 1) {
        const content = chunks[index];
        const summary = compactText(content, 360);
        const vector = await createMemoryEmbedding(content);
        const ok = await milvusStore.upsertPersonaMemory({
            id: stableId(corpusPath, index, content),
            type: SOURCE_TYPE,
            summary,
            content,
            importance: 0.72,
            vector
        });
        if (ok) imported += 1;
        if ((index + 1) % 20 === 0) {
            console.log(`Imported ${index + 1}/${chunks.length} chunks...`);
        }
    }

    console.log(`Imported ${imported}/${chunks.length} Yachiyo corpus chunks into ${milvusStore.COLLECTION_NAME}.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
