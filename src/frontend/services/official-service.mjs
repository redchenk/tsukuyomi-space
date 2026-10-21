export function moneyAtoms(value) {
  const amount = BigInt(value ?? '0');
  const absolute = amount < 0n ? -amount : amount;
  const fraction = String(absolute % 1000000000n).padStart(9, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${amount < 0n ? '-' : ''}${absolute / 1000000000n}.${fraction}`;
}

export function rateAtoms(value) {
  if (!/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,9})?$/.test(String(value))) throw new Error('单价最多支持 9 位小数。');
  const [whole, fraction = ''] = String(value).split('.');
  return (BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, '0'))).toString();
}

// Keep Cookie authentication separate from the legacy admin-token API client.
// An account-bound request must never fall back to a cached identity or balance.
export async function officialRequest(path, { method = 'GET', body, account, signal, request = globalThis.fetch } = {}) {
  if (!/^\/api\/[a-z0-9/?=&%_.-]+$/i.test(path)) throw new Error('服务请求地址无效。');
  if (method !== 'GET' && !account) throw new Error('请刷新支付中心，确认当前账号后重试。');
  const response = await request(`/official-api${path}`, {
    method, credentials: 'same-origin', cache: 'no-store', signal: signal ?? AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(account ? { 'X-Official-Expected-Account': account } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || '站内直供暂时无法读取，请稍后刷新。'), { code: data?.error?.code, status: response.status });
  return data;
}

export function assertDashboardAccount(data, siteUserId) {
  if (!siteUserId || data?.me?.site_user_id !== siteUserId || !data.me.account_id || !Array.isArray(data.models)) {
    throw new Error('登录账号已变化，请刷新支付中心后重试。');
  }
  return data;
}

export function usageStatus(status) {
  return ({ reserved: '处理中', settled: '已结算', released: '未消费，已释放', unknown: '待核对', needs_review: '待人工核对' })[status] || '待核对';
}
