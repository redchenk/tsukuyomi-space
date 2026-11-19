// Runs as the site account. Only encrypted backup objects in this prefix are accepted.
'use strict';
const { createRequire } = require('node:module');
const { pipeline } = require('node:stream/promises');
// The storage client uses OSS credentials from site_settings. It never signs site sessions.
process.env.JWT_SECRET ||= require('node:crypto').randomBytes(32).toString('hex');
const site = createRequire('/var/www/tsukuyomi-space/backend/app.js');
const storage = site('./services/object-storage');
const prefix = 'ops-archive/domestic-v1';

async function main() {
    const [action, id, file] = process.argv.slice(2);
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid archive ID');
    const settings = { ...storage.getSettings(), ossPrefix: '', ossFileNameMode: 'uuid' };
    if (!storage.isConfigured(settings)) throw new Error('Object storage is unavailable');
    const key = prefix + '/' + id + '.cms';
    if (action === 'put') {
        const result = await storage.putObject({ filePath: file, mimeType: 'application/octet-stream',
            ext: 'cms', id, uploadPath: prefix, privateRead: true, infrequentAccess: true, cacheControl: 'private, no-store', settings });
        if (result?.key !== key) throw new Error('Unexpected archive destination');
        const publicCheck = await storage.fetchOutbound(storage.buildRequestUrl(settings, key),
            { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(20000) });
        if (![401,403,404].includes(publicCheck.status)) throw new Error('Could not confirm private object access');
    } else if (action === 'read' || action === 'verify-read') {
        const object = await storage.getObject(key, {stream: true, settings});
        if (object?.status !== 200) throw new Error('Archive could not be read');
        if (action === 'verify-read' && object.expiration) {
            await object.body.cancel();
            throw new Error('Object is scheduled to expire');
        }
        await pipeline(object.body, process.stdout);
    } else throw new Error('Unknown archive operation');
}
main().catch(err => {
    // Provider error bodies and signed URLs must never enter service logs.
    console.error('Archive transport failed', err.code || err.name, err.providerStatus || '', err.ossCode || '');
    process.exitCode = 1;
});
