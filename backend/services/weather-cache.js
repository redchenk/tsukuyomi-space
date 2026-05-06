const crypto = require('crypto');
const config = require('../config');
const store = require('./redis-store');

function keyForLocation({ lat, lon, timezone, city }) {
    const hash = crypto.createHash('sha1')
        .update(JSON.stringify({ lat, lon, timezone, city }))
        .digest('hex');
    return `weather:room-world:${hash}`;
}

async function getWorld(location) {
    return store.getJson(keyForLocation(location));
}

async function setWorld(location, data) {
    return store.setJson(keyForLocation(location), data, config.weatherCacheSeconds);
}

module.exports = {
    getWorld,
    setWorld
};
