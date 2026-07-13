const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');
const { Readable } = require('stream');
const ipaddr = require('ipaddr.js');

function isPrivateAddress(value = '') {
    const address = String(value || '').toLowerCase().split('%')[0];
    if (!net.isIP(address)) return true;
    try {
        const parsed = ipaddr.parse(address);
        if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
            return parsed.toIPv4Address().range() !== 'unicast';
        }
        return parsed.range() !== 'unicast';
    } catch (_) {
        return true;
    }
}

async function resolvePublicUrl(value, { protocols = ['https:'], allowedHostnames = [] } = {}) {
    let url;
    try {
        url = new URL(String(value || ''));
    } catch (_) {
        throw new Error('不支持的外部地址');
    }
    if (!protocols.includes(url.protocol) || url.username || url.password) throw new Error('不支持的外部地址');
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (allowedHostnames.length && !allowedHostnames.includes(hostname)) throw new Error('外部地址不在允许列表中');

    const records = net.isIP(hostname)
        ? [{ address: hostname, family: net.isIP(hostname) }]
        : await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some(record => isPrivateAddress(record.address))) {
        throw new Error('禁止访问本机、内网或保留地址');
    }
    return { url, records };
}

function pinnedLookup(records = []) {
    const safeRecords = records.map(record => ({ address: record.address, family: record.family }));
    return (_hostname, options, callback) => {
        if (!safeRecords.length) return callback(new Error('No validated DNS address'));
        if (options?.all) return callback(null, safeRecords);
        callback(null, safeRecords[0].address, safeRecords[0].family);
    };
}

async function fetchPinnedUrl(value, {
    method = 'GET',
    headers = {},
    body,
    signal,
    timeoutMs = 30000,
    redirect = 'error',
    protocols = ['https:'],
    allowedHostnames = []
} = {}) {
    const { url, records } = await resolvePublicUrl(value, { protocols, allowedHostnames });
    const transport = url.protocol === 'https:' ? https : http;
    const payload = body === undefined || body === null
        ? null
        : (Buffer.isBuffer(body) ? body : Buffer.from(body));
    const requestHeaders = { 'Accept-Encoding': 'identity', ...headers };
    if (payload && !Object.keys(requestHeaders).some(key => key.toLowerCase() === 'content-length')) {
        requestHeaders['Content-Length'] = String(payload.length);
    }

    return new Promise((resolve, reject) => {
        const request = transport.request(url, {
            method,
            headers: requestHeaders,
            lookup: pinnedLookup(records),
            signal
        }, (incoming) => {
            const status = incoming.statusCode || 502;
            if (redirect === 'error' && status >= 300 && status < 400) {
                incoming.resume();
                reject(new Error('外部地址不允许重定向'));
                return;
            }

            const responseHeaders = new Headers();
            for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
                responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
            }
            const noBody = method.toUpperCase() === 'HEAD' || status === 204 || status === 304;
            resolve(new Response(noBody ? null : Readable.toWeb(incoming), {
                status,
                statusText: incoming.statusMessage || '',
                headers: responseHeaders
            }));
        });
        request.setTimeout(timeoutMs, () => request.destroy(new Error('外部请求超时')));
        request.on('error', reject);
        if (payload) request.write(payload);
        request.end();
    });
}

module.exports = {
    fetchPinnedUrl,
    isPrivateAddress,
    pinnedLookup,
    resolvePublicUrl
};
