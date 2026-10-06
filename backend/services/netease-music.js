// Narrow, read-only web adapter. Protocol reference: api-enhanced (MIT),
// 2db6684453297ee86dec0492842f2320b08182d9. No generic proxy or unlock API.
const crypto = require('node:crypto');
const { fetchPinnedUrl } = require('./outbound-url-security');

const HOSTS = ['music.163.com', 'interfacepc.music.163.com'];
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;
const COOKIE_NAMES = new Set(['MUSIC_U', 'MUSIC_A', '__csrf', 'NMTID', 'NETEASE_WDA_UID']);

function musicError(code, message, status = 502) {
    return Object.assign(new Error(message), { code, status });
}
function aes(text, key, iv = null) {
    const cipher = crypto.createCipheriv(iv ? 'aes-128-cbc' : 'aes-128-ecb', Buffer.from(key), iv ? Buffer.from(iv) : null);
    return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
}
function weapi(data) {
    const key = crypto.randomBytes(12).toString('base64').slice(0, 16);
    const block = Buffer.alloc(128);
    block.write(key.split('').reverse().join(''), 112);
    return { params: aes(aes(JSON.stringify(data), '0CoJUm6Qyw8W8jud', '0102030405060708').toString('base64'), key, '0102030405060708').toString('base64'),
        encSecKey: crypto.publicEncrypt({ key: PUBLIC_KEY, padding: crypto.constants.RSA_NO_PADDING }, block).toString('hex') };
}
function eapi(path, data) {
    const text = JSON.stringify(data);
    const digest = crypto.createHash('md5').update(`nobody${path}use${text}md5forencrypt`).digest('hex');
    return { params: aes(`${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`, 'e82ckenh8dichen8').toString('hex').toUpperCase() };
}
function cookies(value = '') {
    const result = {};
    const values = Array.isArray(value) ? value : [value];
    for (const line of values.filter(line => !/[\r\n]/.test(String(line)))) for (const match of String(line).matchAll(/(?:^|[;,]\s*)(MUSIC_U|MUSIC_A|__csrf|NMTID|NETEASE_WDA_UID)=([^;,\r\n]*)/g)) {
        if (COOKIE_NAMES.has(match[1]) && match[2].length <= 4096 && /^[\x21-\x7e]*$/.test(match[2])) result[match[1]] = match[2];
    }
    return Object.entries(result).map(([key, val]) => `${key}=${val}`).join('; ');
}
function mediaUrl(value) {
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return '';
        // Audio and artwork hosts only, never accept an arbitrary provider URL.
        if (!/^(?:[a-z0-9-]+\.)*(?:music\.126\.net|music\.163\.com)$/i.test(url.hostname)) return '';
        url.protocol = 'https:'; url.port = ''; url.hash = '';
        return url.href;
    } catch (_) { return ''; }
}
function track(song) {
    if (!Number.isSafeInteger(Number(song?.id)) || Number(song.id) <= 0) return null;
    const artists = song.ar || song.artists || [];
    const album = song.al || song.album || {};
    return { id: String(song.id), title: String(song.name || '未命名曲目').slice(0, 180),
        artist: artists.slice(0, 8).map(a => String(a.name || '').slice(0, 80)).join(' / '),
        album: String(album.name || '').slice(0, 180), cover: mediaUrl(album.picUrl),
        duration: Math.max(0, Number(song.dt || song.duration) || 0) / 1000, source: 'netease' };
}

function createNeteaseMusic({ transport = fetchPinnedUrl, timeoutMs = 10000 } = {}) {
    let active = 0;
    async function request(path, data, cookie = '', mode = 'eapi') {
        if (active >= 4) throw musicError('MUSIC_BUSY', '音乐服务繁忙，请稍后再试', 503);
        active++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
        let response;
        try {
            const safeCookie = cookies(cookie);
            const csrf = Object.fromEntries(safeCookie.split('; ').filter(Boolean).map(x => x.split('='))).__csrf || '';
            const header = { os: 'pc', appver: '3.0.18', deviceId: crypto.randomBytes(16).toString('hex'), __csrf: csrf,
                requestId: `${Date.now()}_${crypto.randomInt(1000)}`, ...Object.fromEntries(safeCookie.split('; ').filter(Boolean).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)])) };
            const payload = mode === 'weapi' ? weapi({ ...data, csrf_token: csrf }) : eapi(path, { ...data, header });
            const url = mode === 'weapi' ? `https://music.163.com/weapi/${path.slice(5)}` : `https://interfacepc.music.163.com/eapi/${path.slice(5)}`;
            response = await transport(url, { method: 'POST', body: new URLSearchParams(payload).toString(), signal: controller.signal,
                timeoutMs, allowedHostnames: HOSTS, connectStrategy: 'race-pinned', headers: {
                    'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://music.163.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                    Cookie: `${safeCookie}${safeCookie ? '; ' : ''}os=pc; appver=3.0.18`
                } });
            if (!response.ok) throw musicError('MUSIC_UPSTREAM_HTTP', '网易云暂时无法连接，请稍后再试');
            const reader = response.body.getReader();
            const chunks = []; let size = 0;
            try {
                while (true) {
                    let abort;
                    const stopped = new Promise((_, reject) => {
                        abort = () => reject(controller.signal.reason);
                        controller.signal.addEventListener('abort', abort, { once: true });
                        if (controller.signal.aborted) abort();
                    });
                    let part;
                    try { part = await Promise.race([reader.read(), stopped]); }
                    finally { controller.signal.removeEventListener('abort', abort); }
                    const { done, value } = part;
                    if (done) break;
                    size += value.byteLength;
                    if (size > 2 * 1024 * 1024) throw musicError('MUSIC_RESPONSE_TOO_LARGE', '歌单过大，请使用搜索点歌');
                    chunks.push(Buffer.from(value));
                }
            } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
            let body;
            try { body = JSON.parse(Buffer.concat(chunks, size).toString('utf8')); }
            catch (_) { throw musicError('MUSIC_INVALID_RESPONSE', '网易云返回数据异常，请稍后再试'); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) throw musicError('MUSIC_INVALID_RESPONSE', '网易云返回数据异常');
            if ([301, 302, 401].includes(body.code)) throw musicError('MUSIC_LOGIN_REQUIRED', '网易云登录已失效，请重新扫码', 401);
            return { body, cookie: cookies(response.headers.getSetCookie?.() || response.headers.get('set-cookie') || '') };
        } catch (error) {
            if (String(error.code || '').startsWith('MUSIC_')) throw error;
            throw musicError(controller.signal.aborted || ['TimeoutError', 'AbortError'].includes(error.name) || error.code === 'ETIMEDOUT'
                ? 'MUSIC_TIMEOUT' : 'MUSIC_NETWORK', '网易云连接暂时失败，可以继续听网站曲目');
        } finally { clearTimeout(timer); controller.abort(); active--; }
    }
    return {
        async qrKey() {
            const { body } = await request('/api/login/qrcode/unikey', { type: 3 });
            if (body.code !== 200 || !/^[A-Za-z0-9_-]{8,200}$/.test(body.unikey || '')) throw musicError('MUSIC_QR_INVALID', '暂时无法生成登录二维码');
            return body.unikey;
        },
        async qrCheck(key) { return request('/api/login/qrcode/client/login', { key, type: 3 }); },
        async profile(cookie) {
            const { body } = await request('/api/w/nuser/account/get', {}, cookie, 'weapi');
            if (body.code !== 200 || !Number.isSafeInteger(Number(body.profile?.userId)) || Number(body.profile.userId) <= 0) throw musicError('MUSIC_LOGIN_REQUIRED', '网易云登录已失效，请重新扫码', 401);
            return { id: String(body.profile.userId), nickname: String(body.profile.nickname || '网易云用户').slice(0, 80), avatar: mediaUrl(body.profile.avatarUrl) };
        },
        async search(cookie, keywords, offset) {
            const { body } = await request('/api/cloudsearch/pc', { s: keywords, type: 1, limit: 20, offset, total: true }, cookie);
            if (body.code !== 200) throw musicError('MUSIC_SEARCH_FAILED', '暂时无法搜索歌曲');
            return { tracks: (body.result?.songs || []).slice(0, 20).map(track).filter(Boolean), total: Number(body.result?.songCount) || 0, offset };
        },
        async playlists(cookie, uid, offset) {
            const { body } = await request('/api/user/playlist', { uid, limit: 20, offset, includeVideo: false }, cookie, 'weapi');
            if (body.code !== 200) throw musicError('MUSIC_PLAYLIST_FAILED', '暂时无法读取歌单');
            return { playlists: (body.playlist || []).slice(0, 20).map(p => ({ id: String(p.id), title: String(p.name || '').slice(0, 180), cover: mediaUrl(p.coverImgUrl), count: Number(p.trackCount) || 0 })), more: Boolean(body.more), offset };
        },
        async playlist(cookie, id, offset) {
            const { body } = await request('/api/v6/playlist/detail', { id, n: 20, s: 0 }, cookie);
            if (body.code !== 200 || !body.playlist) throw musicError('MUSIC_PLAYLIST_FAILED', '暂时无法读取歌单');
            const ids = (body.playlist.trackIds || []).slice(offset, offset + 20).map(t => Number(t.id)).filter(Number.isSafeInteger);
            if (!ids.length) return { tracks: [], total: Number(body.playlist.trackCount) || 0, offset };
            const songs = await request('/api/v3/song/detail', { c: JSON.stringify(ids.map(id => ({ id }))) }, cookie);
            if (songs.body.code !== 200) throw musicError('MUSIC_PLAYLIST_FAILED', '暂时无法读取歌单歌曲');
            return { tracks: (songs.body.songs || []).slice(0, 20).map(track).filter(Boolean), total: Number(body.playlist.trackCount) || 0, offset };
        },
        async playback(cookie, id) {
            const { body } = await request('/api/song/enhance/player/url/v1', { ids: JSON.stringify([Number(id)]), level: 'standard', encodeType: 'mp3' }, cookie);
            const item = body.data?.find(song => String(song.id) === id);
            const url = mediaUrl(item?.url);
            if (!url || item?.code !== 200) throw musicError('MUSIC_UNAVAILABLE', '这首歌暂时无法播放，可能需要会员或受地区限制', 422);
            return { url, expiresIn: Math.min(1200, Math.max(30, Number(item.expi) || 300)), preview: Boolean(item.freeTrialInfo) };
        }
    };
}
module.exports = { createNeteaseMusic, musicError, mediaUrl, track, cookies, weapi, eapi };
