const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('official API entitlement follows verified database roles and linked credentials', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE users(id TEXT,username TEXT,password_hash TEXT,role TEXT);
        CREATE TABLE admins(username TEXT,password_hash TEXT,role TEXT);
        INSERT INTO users VALUES('legacy','owner','same-hash','admin'),
        ('normal','normal','n','user'),('direct','direct','d','super_admin'),
        ('mismatch','other-owner','new-hash','admin'),('banned','banned','b','banned');
        INSERT INTO admins VALUES('owner','same-hash','super_admin'),
        ('other-owner','old-hash','super_admin'),('banned','b','super_admin');`);
    const module = { exports: {} };
    new vm.Script(readFileSync(require.resolve('../backend/repositories/auth-repository'), 'utf8'))
        .runInNewContext({ module, exports: module.exports, require: name => {
            assert.equal(name, '../db'); return { prepare: db.prepare.bind(db), transaction: fn => fn };
        } });
    const check = module.exports.hasOfficialApiUnlimited;
    assert.equal(check('legacy'), true);
    assert.equal(check('direct'), true);
    for (const id of ['normal','mismatch','banned','missing']) assert.equal(check(id), false);
    db.exec("UPDATE admins SET role='admin' WHERE username='owner'");
    assert.equal(check('legacy'), false);
    db.close();
});
