const crypto = require('crypto');
const config = require('../config');
const store = require('./redis-store');

function keyForLocation({ lat, lon, timezone, city }) {
    const hash = crypto.createHash('sha1')
        .update(JSON.stringify({ lat, lon, timezone, city }))
        .digest('hex');
    return `weather:room-world:${hash}`;
}

function keyForIp(ip) {
    const hash = crypto.createHash('sha1')
        .update(String(ip || ''))
        .digest('hex');
    return `weather:ip-location:${hash}`;
}

async function getWorld(location) {
    return store.getJson(keyForLocation(location));
}

async function setWorld(location, data) {
    return store.setJson(keyForLocation(location), data, config.weatherCacheSeconds);
}

async function getIpLocation(ip) {
    return store.getJson(keyForIp(ip));
}

async function setIpLocation(ip, data) {
    return store.setJson(keyForIp(ip), data, config.weatherCacheSeconds * 6);
}

module.exports = {
    getWorld,
    setWorld,
    getIpLocation,
    setIpLocation
};
