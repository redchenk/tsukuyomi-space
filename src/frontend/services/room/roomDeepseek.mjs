import deepseek from '../../../../shared/deepseek-chat.cjs';
import { getSession } from '../../api/client';

export { deepseek };

// The overseas Room uses the applications transport when advertised by the site catalog.
export async function requestDeepseekReply(args) {
  const owner = getSession()?.user?.id;
  const url = deepseek.endpoint(args.settings);
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    signal: args.signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Official-Expected-Account': args.dashboard.me.account_id,
      'Idempotency-Key': crypto.randomUUID()
    },
    body: JSON.stringify(deepseek.buildRequest(args))
  });
  if (getSession()?.user?.id !== owner) {
    await response.body?.cancel();
    throw new Error('Your account changed. Please resend your message.');
  }
  return deepseek.readReply(response, { signal: args.signal, onDelta: args.onDelta, target: url });
}
