export function terminalSettingsPayload(settings, updateCredentials = false) {
  const payload = { ...settings };
  delete payload.ossAccessKeyId;
  delete payload.ossAccessKeySecret;
  payload.ossUpdateCredentials = updateCredentials === true;
  if (updateCredentials) {
    if (!String(settings.ossAccessKeyId || '').trim() || !String(settings.ossAccessKeySecret || '').trim()) throw new Error('更换访问密钥时，请完整填写 AccessKey ID 和 AccessKey Secret');
    payload.ossAccessKeyId = settings.ossAccessKeyId.trim();
    payload.ossAccessKeySecret = settings.ossAccessKeySecret.trim();
  }
  return payload;
}
