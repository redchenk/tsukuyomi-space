const dns = require('dns').promises;
const net = require('net');
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

module.exports = {
    isPrivateAddress,
    pinnedLookup,
    resolvePublicUrl
};
