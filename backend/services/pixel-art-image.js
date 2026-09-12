const zlib = require('zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    return crc >>> 0;
});

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
    return Buffer.concat([length, typeBuffer, data, checksum]);
}

function parseColor(value, fallback = [11, 16, 32, 255]) {
    const match = String(value || '').match(/^#([0-9a-f]{6})$/i);
    if (!match) return fallback;
    const number = Number.parseInt(match[1], 16);
    return [(number >>> 16) & 255, (number >>> 8) & 255, number & 255, 255];
}

function renderPixelArtworkPng(artwork) {
    const sourceWidth = Math.max(1, Math.min(192, Number(artwork?.width || artwork?.size || 1)));
    const sourceHeight = Math.max(1, Math.min(108, Number(artwork?.height || artwork?.size || 1)));
    const scale = Math.max(1, Math.min(8, Math.floor(Math.min(1200 / sourceWidth, 630 / sourceHeight))));
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const palette = Array.isArray(artwork?.palette) ? artwork.palette.map(color => parseColor(color)) : [];
    const background = parseColor(artwork?.background_color);
    const pixels = Array.isArray(artwork?.pixels) ? artwork.pixels : [];
    const raw = Buffer.alloc((width * 4 + 1) * height);

    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * (width * 4 + 1);
        raw[rowOffset] = 0;
        const sourceY = Math.min(sourceHeight - 1, Math.floor(y / scale));
        for (let x = 0; x < width; x += 1) {
            const sourceX = Math.min(sourceWidth - 1, Math.floor(x / scale));
            const colorIndex = Number(pixels[sourceY * sourceWidth + sourceX]);
            const color = colorIndex >= 0 && palette[colorIndex] ? palette[colorIndex] : background;
            const offset = rowOffset + 1 + x * 4;
            raw[offset] = color[0];
            raw[offset + 1] = color[1];
            raw[offset + 2] = color[2];
            raw[offset + 3] = color[3];
        }
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
        PNG_SIGNATURE,
        pngChunk('IHDR', header),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

module.exports = { renderPixelArtworkPng };
