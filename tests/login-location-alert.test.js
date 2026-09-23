const assert = require('node:assert/strict');
const { test } = require('node:test');

process.env.NODE_ENV = 'test';
const { publicIp, locationChanged, lookupIpLocation, recordSuccessfulLogin } = require('../backend/services/login-location-alert');

test('only public, trusted request IPs are eligible for location checks', () => {
    assert.equal(publicIp('8.8.8.8'), '8.8.8.8');
    assert.equal(publicIp('::ffff:8.8.8.8'), '8.8.8.8');
    assert.equal(publicIp('127.0.0.1'), '');
    assert.equal(publicIp('192.168.1.1'), '');
    assert.equal(publicIp('not-an-ip'), '');
    assert.equal(publicIp('8.8.8.8,1.1.1.1'), '');
});

test('change detection uses country then city, and ignores incomplete location data', () => {
    const suzhou = { country_code: 'CN', region: '江苏', city: '苏州' };
    assert.equal(locationChanged(null, suzhou), false);
    assert.equal(locationChanged(suzhou, suzhou), false);
    assert.equal(locationChanged(suzhou, { ...suzhou, city: '上海' }), true);
    assert.equal(locationChanged(suzhou, { country_code: 'JP', region: '东京', city: '东京' }), true);
    assert.equal(locationChanged(suzhou, { country_code: 'CN', region: '', city: '' }), false);
});

test('location lookup uses HTTPS and rejects provider errors', async () => {
    const previousFetch = global.fetch;
    try {
        global.fetch = async (url, options) => {
            assert.equal(url, 'https://ipwho.is/8.8.8.8');
            assert.equal(options.redirect, 'error');
            return { ok: true, json: async () => ({ success: true, country_code: 'US', region: 'California', city: 'Mountain View' }) };
        };
        assert.deepEqual(await lookupIpLocation('8.8.8.8'), {
            country_code: 'US', region: 'California', city: 'Mountain View'
        });
        global.fetch = async () => ({ ok: true, json: async () => ({ success: false, country_code: 'US' }) });
        assert.equal(await lookupIpLocation('8.8.8.8'), null);
    } finally {
        global.fetch = previousFetch;
    }
});

test('first login establishes baseline; same place and same IP stay quiet; new place sends once', async () => {
    const state = new Map();
    const sent = [];
    let lookupCount = 0;
    const deps = {
        enabled: () => true,
        load: id => state.get(id),
        save: (id, ip_fingerprint, location) => state.set(id, { ip_fingerprint, ...location }),
        lookup: async ip => {
            lookupCount += 1;
            return ip === '8.8.8.8'
                ? { country_code: 'CN', region: '江苏', city: '苏州' }
                : ip === '1.1.1.1'
                    ? { country_code: 'CN', region: '江苏', city: '苏州' }
                    : { country_code: 'JP', region: '东京', city: '东京' };
        },
        mail: async (to, payload) => sent.push({ to, payload })
    };
    const user = { id: 'user-1', email: 'reader@example.com' };
    assert.equal(await recordSuccessfulLogin({ user, ip: '8.8.8.8' }, deps), false);
    assert.equal(await recordSuccessfulLogin({ user, ip: '8.8.8.8' }, deps), false);
    assert.equal(lookupCount, 1);
    assert.equal(await recordSuccessfulLogin({ user, ip: '1.1.1.1' }, deps), false);
    assert.equal(await recordSuccessfulLogin({ user, ip: '9.9.9.9', userAgent: 'Safari' }, deps), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'reader@example.com');
    assert.equal(sent[0].payload.type, 'login_alert');
    assert.match(sent[0].payload.location, /东京/);
});

test('disabled alerts, placeholders, and unknown locations do not send or update baseline', async () => {
    let saves = 0;
    let lookups = 0;
    const deps = {
        enabled: () => false,
        load: () => null,
        save: () => { saves += 1; },
        lookup: async () => { lookups += 1; return null; },
        mail: async () => assert.fail('mail should not be sent')
    };
    const user = { id: 'user-1', email: 'reader@example.com' };
    assert.equal(await recordSuccessfulLogin({ user, ip: '8.8.8.8' }, deps), false);
    assert.equal(lookups, 0);
    deps.enabled = () => true;
    assert.equal(await recordSuccessfulLogin({ user: { ...user, email: 'x@oauth.yachiyo.local' }, ip: '8.8.8.8' }, deps), false);
    assert.equal(await recordSuccessfulLogin({ user, ip: '8.8.8.8' }, deps), false);
    assert.equal(saves, 0);
});
