const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const modelDirectory = path.resolve(__dirname, '..', 'models', 'tsukimi-yachiyo');
const sourcePath = path.join(modelDirectory, 'tsukimi-yachiyo.moc3');
const outputPath = path.join(modelDirectory, 'tsukimi-yachiyo.moc3.gzip-r1');
const source = fs.readFileSync(sourcePath);
const compressed = zlib.gzipSync(source, { level: 9 });

if (!zlib.gunzipSync(compressed).equals(source)) {
  throw new Error('Compressed Live2D model verification failed');
}

fs.writeFileSync(outputPath, compressed);
console.log(`Compressed Live2D model: ${path.basename(outputPath)} (${source.length} -> ${compressed.length} bytes)`);
