#!/usr/bin/env node
// Server operator only. Never print client secrets or accept them as arguments.
const fs = require('node:fs');
const path = require('node:path');

function run() {
    const [command, ...args] = process.argv.slice(2);
    if (!['create', 'rotate', 'enable', 'disable', 'redirects', 'list'].includes(command)) {
        throw new Error('Usage: partner-oauth-client.cjs create|rotate|enable|disable|redirects|list --id ID [--name NAME --redirect HTTPS_URL --output PRIVATE_FILE]');
    }
    if (!process.env.DB_PATH) throw new Error('Set DB_PATH explicitly to the intended database; automatic database creation is disabled.');
    const options = { redirects: [] };
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i], value = args[i + 1];
        if (!['--id', '--name', '--redirect', '--output'].includes(key) || !value || value.startsWith('--')) throw new Error('Invalid argument');
        if (key === '--redirect') options.redirects.push(value);
        else {
            if (options[key.slice(2)] !== undefined) throw new Error('Duplicate argument');
            options[key.slice(2)] = value;
        }
    }
    if (!fs.existsSync(process.env.DB_PATH)) throw new Error('Database does not exist. Deploy and run migration 044 first.');
    const db = require('../backend/db');
    try {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='partner_oauth_clients'").get()) throw new Error('Migration 044 is required.');
        const oauth = require('../backend/services/partner-oauth');
        const issuer = oauth.issuer();
        if (command === 'list') {
            console.log(JSON.stringify(db.prepare('SELECT id,name,enabled,redirect_uris,version FROM partner_oauth_clients ORDER BY id').all(), null, 2));
            return;
        }
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(options.id || '')) throw new Error('A valid --id is required');
        const existing = db.prepare('SELECT * FROM partner_oauth_clients WHERE id=?').get(options.id);
        if ((command === 'create') === Boolean(existing)) throw new Error(command === 'create' ? 'Client already exists; use rotate or redirects.' : 'Client does not exist.');
        const now = Date.now();
        if (command === 'create') oauth.validateRegistration({ id: options.id, name: options.name, redirectUris: options.redirects });
        if (command === 'redirects') {
            oauth.validateRegistration({ id: existing.id, name: existing.name, redirectUris: options.redirects });
            db.prepare('UPDATE partner_oauth_clients SET redirect_uris=?,version=version+1,updated_at=? WHERE id=?')
                .run(JSON.stringify([...new Set(options.redirects)]), now, existing.id);
        } else if (command === 'enable' || command === 'disable') {
            db.prepare('UPDATE partner_oauth_clients SET enabled=?,version=version+1,updated_at=? WHERE id=?')
                .run(command === 'enable' ? 1 : 0, now, existing.id);
        } else {
            if (!options.output || !path.isAbsolute(options.output)) throw new Error('--output must be an absolute path to a NEW private file');
            const secret = oauth.random();
            const credentials = { issuer, client_id: options.id, client_secret: secret,
                redirect_uris: command === 'create' ? options.redirects : JSON.parse(existing.redirect_uris),
                authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/api/partner/oauth/token`,
                userinfo_endpoint: `${issuer}/api/partner/oauth/userinfo`, revocation_endpoint: `${issuer}/api/partner/oauth/revoke`,
                scope: oauth.SCOPE, token_endpoint_auth_method: 'client_secret_basic' };
            // Exclusive creation refuses existing paths and symlinks; retain the
            // delivery copy only if its matching database transaction succeeds.
            const fd = fs.openSync(options.output, 'wx', 0o600);
            try {
                fs.writeFileSync(fd, JSON.stringify(credentials, null, 2) + '\n');
                fs.fsyncSync(fd);
                db.transaction(() => {
                    if (command === 'create') oauth.registerClient({ id: options.id, name: options.name, redirectUris: options.redirects, secret }, now);
                    else db.prepare('UPDATE partner_oauth_clients SET secret_hash=?,version=version+1,updated_at=? WHERE id=?')
                        .run(oauth.hash(secret), now, existing.id);
                })();
            } catch (error) { fs.unlinkSync(options.output); throw error; }
            finally { fs.closeSync(fd); }
        }
        console.log(`Client ${options.id}: ${command} completed. Secret values are never printed.`);
    } finally { db.close(); }
}
try { run(); } catch (error) {
    console.error(error.oauthError ? 'Invalid client registration parameters.' : error.message);
    process.exitCode = 1;
}
