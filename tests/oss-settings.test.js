const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepareOssSettingsUpdate } = require('../backend/services/oss-settings');
const saved = { ossProvider: 'aliyun', ossAccessKeyId: 'LTAI' + 'a'.repeat(20), ossAccessKeySecret: 's'.repeat(30) };

test('ordinary settings and empty or unchanged credential fields preserve existing credentials', () => {
  for (const input of [{ siteTitle: 'new' }, { ossAccessKeyId: saved.ossAccessKeyId, ossAccessKeySecret: '' }, { ...saved }]) {
    const result = prepareOssSettingsUpdate(input, saved);
    assert.equal(Object.hasOwn(result, 'ossAccessKeyId'), false);
    assert.equal(Object.hasOwn(result, 'ossAccessKeySecret'), false);
  }
});
test('autofilled passwords and changed keys are rejected before any setting is saved', () => {
  for (const input of [{ ossAccessKeySecret: 'password9' }, { ossAccessKeySecret: 'x'.repeat(30) }, { ossAccessKeyId: 'LTAI' + 'b'.repeat(20) }, { ossUpdateCredentials: 'true', ossAccessKeySecret: 'x'.repeat(30) }])
    assert.throws(() => prepareOssSettingsUpdate(input, saved), { code: 'OSS_CREDENTIAL_UPDATE_INVALID', status: 400 });
  assert.throws(() => prepareOssSettingsUpdate({ ossUpdateCredentials: true, ossAccessKeySecret: 'password9' }, saved), /不要填写网站登录密码/);
  assert.throws(() => prepareOssSettingsUpdate({ ossUpdateCredentials: true, ossAccessKeyId: 'LTAI' + 'b'.repeat(20) }, saved), /同时填写/);
});
test('explicit valid replacements support rotating the secret and migrating generic S3 credentials', () => {
  assert.deepEqual(prepareOssSettingsUpdate({ ossUpdateCredentials: true, ossAccessKeySecret: 'x'.repeat(30) }, saved), { ossAccessKeySecret: 'x'.repeat(30) });
  const replacement = { ossUpdateCredentials: true, ossProvider: 's3', ossEndpoint: 'https://storage.example.test', ossAccessKeyId: 's3-key', ossAccessKeySecret: 'test-secret' };
  assert.equal(prepareOssSettingsUpdate(replacement, saved).ossAccessKeySecret, 'test-secret');
  assert.equal(Object.hasOwn(prepareOssSettingsUpdate(replacement, saved), 'ossUpdateCredentials'), false);
});
test('frontend omits even autofilled credentials until the explicit replacement toggle is enabled', async () => {
  const { terminalSettingsPayload } = await import('../src/frontend/services/terminalSettings.mjs');
  const form = { ...saved, ossAccessKeySecret: 'password9', siteTitle: 'new' };
  assert.deepEqual(terminalSettingsPayload(form), { ossProvider: 'aliyun', siteTitle: 'new', ossUpdateCredentials: false });
  assert.equal(form.ossAccessKeySecret, 'password9');
  assert.throws(() => terminalSettingsPayload({ ...form, ossAccessKeySecret: '' }, true), /完整填写/);
  assert.equal(terminalSettingsPayload(saved, true).ossAccessKeySecret, saved.ossAccessKeySecret);
});
