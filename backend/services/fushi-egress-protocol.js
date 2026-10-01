const { validatePublicRecords } = require('./outbound-url-security');
const codes = new Set(['URL_REJECTED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNREFUSED', 'ECONNRESET']);
function failure(code = 'NETWORK_ERROR') {
    return Object.assign(new Error('Fushi egress unavailable'), { code: codes.has(code) ? code : 'NETWORK_ERROR' });
}
function readFrame(stream, { signal, maxBytes = 8192 } = {}) {
    return new Promise((resolve, reject) => {
        let buffer = Buffer.alloc(0);
        const clean = () => { stream.pause(); stream.off('data', data); stream.off('error', failed); stream.off('end', ended); stream.off('close', ended); signal?.removeEventListener('abort', aborted); };
        const failed = error => { clean(); reject(error); };
        const ended = () => failed(failure());
        const aborted = () => failed(signal.reason || failure());
        const data = chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            const end = buffer.indexOf(10);
            if ((end < 0 && buffer.length > maxBytes) || end > maxBytes) return failed(failure());
            if (end < 0) return;
            clean();
            if (buffer.length > end + 1) stream.unshift(buffer.subarray(end + 1));
            try { resolve(JSON.parse(buffer.subarray(0, end).toString('utf8'))); } catch (_) { reject(failure()); }
        };
        if (signal?.aborted) return aborted();
        if (stream.destroyed || stream.readableEnded) return ended();
        stream.on('data', data); stream.once('error', failed); stream.once('end', ended); stream.once('close', ended);
        signal?.addEventListener('abort', aborted, { once: true }); stream.resume();
    });
}
function recordFrame(frame) {
    if (frame?.type === 'error') throw failure(frame.code);
    if (frame?.type !== 'resolved' || Object.keys(frame).some(key => !['type', 'records'].includes(key))
        || !Array.isArray(frame.records) || frame.records.length > 16) throw failure();
    return validatePublicRecords(frame.records);
}
function connectedFrame(frame, records) {
    if (frame?.type === 'error') throw failure(frame.code);
    if (frame?.type !== 'connected' || Object.keys(frame).some(key => !['type', 'address', 'family'].includes(key))
        || !records.some(record => record.address === frame.address && record.family === frame.family)) throw failure();
    return frame;
}
const writeFrame = (stream, value) => stream.write(`${JSON.stringify(value)}\n`);
module.exports = { failure, readFrame, recordFrame, connectedFrame, writeFrame };
