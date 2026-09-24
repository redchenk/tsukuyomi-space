/**
 * Weather / location context injection.
 *
 * The character shares the user's conditions, but must treat them as quiet
 * background rather than announcing them.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const source = (p) => fs.readFileSync(path.join(rootDir, p), 'utf8');
const chatSrc = () => source('src/frontend/composables/room/useRoomChat.js');

function loadEnv() {
    const code = chatSrc();
    const start = code.indexOf('const WEATHER_LABELS');
    const end = code.indexOf('async function buildRoomContext');
    assert.ok(start > 0 && end > start, 'environment helper must be locatable');
    const helpers = code.slice(start, end).replace(/^export function /gm, 'function ');
    const ctx = { String, Array, Object, JSON, Number, Math, Boolean, Date, RegExp, Set };
    vm.runInNewContext(
        `${helpers}\nglobalThis.__e = { roomEnvironmentContext };`,
        ctx,
        { filename: 'roomEnv.js' }
    );
    return ctx.__e.roomEnvironmentContext;
}

const full = {
    weather: 'rain',
    season: 'autumn',
    temperature: 18.4,
    windSpeed: 12.6,
    city: '杭州',
    address: '浙江省杭州市西湖区',
    source: 'open-meteo'
};

describe('room environment context', () => {
    it('reports location, weather, temperature, wind and season', () => {
        const text = loadEnv()(full);
        assert.match(text, /【当前环境】/);
        assert.match(text, /地点：浙江省杭州市西湖区/);
        assert.match(text, /天气：雨，18°C，风速 13 km\/h/);
        assert.match(text, /季节：秋/);
    });

    it('tells the model to keep it in the background', () => {
        const text = loadEnv()(full);
        assert.match(text, /这只是背景条件/);
        assert.match(text, /不要主动播报天气或地点/);
        assert.match(text, /也不要反复提起/);
        assert.match(text, /除非对方先说起/);
    });

    it('falls back to the city when there is no address', () => {
        const text = loadEnv()({ ...full, address: '' });
        assert.match(text, /地点：杭州/);
    });

    it('omits placeholders that carry no information', () => {
        const load = loadEnv();
        for (const placeholder of ['', '月读空间', '等待定位授权', '未知']) {
            const text = load({ ...full, city: placeholder, address: placeholder });
            assert.doesNotMatch(text, /地点：/, `"${placeholder}" must not be sent as a location`);
            // The rest of the environment still comes through.
            assert.match(text, /天气：雨/);
        }
    });

    it('omits unknown weather and season words instead of leaking raw ids', () => {
        const text = loadEnv()({ ...full, weather: 'meteor-shower', season: 'monsoon' });
        assert.doesNotMatch(text, /meteor-shower/);
        assert.doesNotMatch(text, /monsoon/);
        assert.doesNotMatch(text, /天气：/);
        assert.doesNotMatch(text, /季节：/);
        assert.match(text, /地点：浙江省杭州市西湖区/);
    });

    it('omits temperature and wind when they are unavailable', () => {
        const text = loadEnv()({ ...full, temperature: null, windSpeed: null });
        assert.match(text, /天气：雨$/m);
        assert.doesNotMatch(text, /°C/);
        assert.doesNotMatch(text, /km\/h/);
    });

    it('translates every weather and season id', () => {
        const load = loadEnv();
        const weathers = { clear: '晴朗', cloudy: '多云', rain: '雨', storm: '雷雨', snow: '雪', fog: '雾' };
        for (const [id, label] of Object.entries(weathers)) {
            assert.match(load({ ...full, weather: id }), new RegExp(`天气：${label}`), `weather ${id}`);
        }
        const seasons = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
        for (const [id, label] of Object.entries(seasons)) {
            assert.match(load({ ...full, season: id }), new RegExp(`季节：${label}`), `season ${id}`);
        }
    });

    it('sends nothing when there is no environment data at all', () => {
        const load = loadEnv();
        for (const empty of [undefined, null, {}, { weather: '', city: '', address: '' }]) {
            assert.equal(load(empty), '');
        }
    });

    it('accepts a ref as well as a plain state object', () => {
        const load = loadEnv();
        const viaRef = load({ value: full });
        assert.equal(viaRef, load(full));
        assert.match(viaRef, /地点：浙江省杭州市西湖区/);
    });
});

describe('environment wiring', () => {
    it('is injected into every room request', () => {
        const code = chatSrc();
        assert.match(code, /async function buildRoomContext\(message, image, llmSettings, environment = '', signal = null\)/);
        assert.match(code, /packRoomContext\(\{\s*time: currentTimeContext\(\),\s*environment,\s*knowledge:/);
        assert.match(code, /const environment = roomEnvironmentContext\(world\?\.world\?\.value\);/);
        assert.match(code, /await buildRoomContext\(message, image, settings, environment, operation\.controller\.signal\)/);
    });

    it('places the environment right after the time block', () => {
        const code = source('src/frontend/services/room/roomContext.mjs');
        const body = code.slice(code.indexOf('const SOURCES'));
        assert.ok(
            body.indexOf("key: 'time'") < body.indexOf("key: 'environment'"),
            'time must come before environment'
        );
        assert.ok(
            body.indexOf("key: 'environment'") < body.indexOf("key: 'knowledge'"),
            'environment must come before the knowledge block'
        );
    });
});
