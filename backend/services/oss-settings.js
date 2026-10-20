// Credentials are changed separately from ordinary settings, so an autofilled
// password in an old settings form cannot silently replace the storage key.
function invalid(message) {
    return Object.assign(new Error(message), { status: 400, code: 'OSS_CREDENTIAL_UPDATE_INVALID' });
}
function prepareOssSettingsUpdate(input, saved = {}) {
    const next = { ...input };
    const intent = next.ossUpdateCredentials;
    delete next.ossUpdateCredentials;
    if (intent !== undefined && typeof intent !== 'boolean') throw invalid('更换 OSS 访问密钥的选项无效');
    for (const key of ['ossAccessKeyId', 'ossAccessKeySecret']) {
        if (next[key] !== undefined && typeof next[key] !== 'string') throw invalid('OSS 访问密钥格式无效');
        if (next[key] !== undefined) next[key] = next[key].trim();
        if (!next[key] || next[key] === saved[key]) delete next[key];
    }
    const changed = Object.hasOwn(next, 'ossAccessKeyId') || Object.hasOwn(next, 'ossAccessKeySecret');
    if (!changed) return next;
    if (intent !== true) throw invalid('更换 OSS 访问密钥前，请勾选“更换访问密钥”并重新填写；原密钥未修改');
    if (next.ossAccessKeyId && !next.ossAccessKeySecret) throw invalid('更换 AccessKey ID 时必须同时填写对应的 AccessKey Secret');
    const combined = { ...saved, ...next };
    if (!combined.ossAccessKeyId || !combined.ossAccessKeySecret) throw invalid('请完整填写 OSS AccessKey ID 和 AccessKey Secret');
    if (String(combined.ossProvider).toLowerCase() === 'aliyun' || /aliyuncs\.com/.test(combined.ossEndpoint || '')) {
        if (!/^[A-Za-z0-9]{20,128}$/.test(combined.ossAccessKeyId) || !/^[A-Za-z0-9]{20,128}$/.test(combined.ossAccessKeySecret))
            throw invalid('阿里云访问密钥格式无效，请复制 AccessKey，不要填写网站登录密码；原密钥未修改');
    }
    return next;
}
module.exports = { prepareOssSettingsUpdate };
