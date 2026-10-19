import { authFetch, parseResponse } from '../api/client';
import { uiText } from '../i18n/runtime';

export async function paymentRequest(path, options = {}) {
  const response = await authFetch(path, { cache: 'no-store', ...options,
    headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return result.data;
}

export function checkoutDestination(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash
      || !['https://openapi.alipay.com', 'https://openapi-sandbox.dl.alipaydev.com'].includes(url.origin)
      || url.pathname !== '/gateway.do') throw new Error('支付链接无效');
  return url.href;
}

export function paymentStatus(order) {
  if (order.status === 'paid') return uiText('已支付');
  if (order.status === 'closed') return uiText('已关闭');
  return uiText(order.expired ? '已到期，待确认' : '待支付');
}
