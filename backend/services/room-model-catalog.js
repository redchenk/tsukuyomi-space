const { catalogPlan, normalizePage, statusError, MAX_PAGE_BYTES } = require('../../shared/model-catalog.cjs');
const { fetchPinnedUrl, classifyError } = require('./outbound-url-security');

function createModelCatalogService({ fetch = fetchPinnedUrl, timeoutMs = 10000, maxActive = 4 } = {}) {
    let active = 0;
    let publicCache = null;
    let publicRequest = null;
    async function page(input, { signal } = {}) {
        const plan = catalogPlan(input);
        if (active >= maxActive) throw Object.assign(new Error('模型目录服务繁忙，请稍后刷新。'), { code: 'BUSY', statusCode: 429 });
        const controller = new AbortController();
        const abort = () => controller.abort(Object.assign(new Error('模型列表请求超时，请稍后刷新。'), { code: 'TIMEOUT' }));
        if (signal?.aborted) abort();
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, timeoutMs);
        let rejectDeadline;
        const deadline = new Promise((_, reject) => { rejectDeadline = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', rejectDeadline, { once: true }); });
        const bounded = value => Promise.race([value, deadline]);
        let response, reader;
        active++;
        try {
            if (controller.signal.aborted) throw controller.signal.reason;
            // No caller-selected methods, headers or targets. TLS and DNS are
            // checked at connection time; redirects may never forward secrets.
            response = await bounded(fetch(plan.url, { method: 'GET', headers: plan.headers, signal: controller.signal, timeoutMs,
                protocols: ['https:'], allowedHostnames: [new URL(plan.url).hostname], redirect: 'error' }));
            if (!response.ok) throw statusError(response.status);
            if (Number(response.headers.get('content-length')) > MAX_PAGE_BYTES) throw Object.assign(new Error('模型列表响应过大。'), { code: 'RESPONSE_TOO_LARGE' });
            reader = response.body?.getReader();
            if (!reader) throw Object.assign(new Error('模型列表响应无效。'), { code: 'INVALID_RESPONSE' });
            const chunks = []; let size = 0;
            for (;;) {
                const { done, value } = await bounded(reader.read());
                if (done) break;
                size += value.byteLength;
                if (size > MAX_PAGE_BYTES) throw Object.assign(new Error('模型列表响应过大。'), { code: 'RESPONSE_TOO_LARGE' });
                chunks.push(Buffer.from(value));
            }
            let payload;
            try { payload = JSON.parse(Buffer.concat(chunks, size).toString('utf8')); }
            catch (_) { throw Object.assign(new Error('服务商没有返回有效的 JSON 模型列表。'), { code: 'INVALID_RESPONSE' }); }
            return { ...normalizePage(payload, plan, input.cursor), provider: plan.provider, updatedAt: new Date().toISOString() };
        } catch (error) {
            if (controller.signal.aborted) throw controller.signal.reason;
            if (classifyError(error).reason === 'timeout') throw Object.assign(new Error('模型列表请求超时，请稍后刷新。'), { code: 'TIMEOUT' });
            // Never echo upstream bodies, raw socket errors, URLs or keys.
            const known = ['BUSY', 'TIMEOUT', 'AUTH_FAILED', 'ACCESS_DENIED', 'NOT_SUPPORTED', 'RATE_LIMIT', 'UPSTREAM_FAILED', 'INVALID_RESPONSE', 'RESPONSE_TOO_LARGE'];
            if (known.includes(error.code)) throw error;
            throw Object.assign(new Error('无法连接模型列表服务；请检查连接或稍后重试。'), { code: 'NETWORK_FAILED' });
        } finally {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', rejectDeadline);
            signal?.removeEventListener('abort', abort);
            if (reader) reader.cancel().catch(() => {}); else response?.body?.cancel().catch(() => {});
            controller.abort(); active--;
        }
    }
    async function publicOpenRouter() {
        if (publicCache && Date.now() - publicCache.at < 10 * 60 * 1000) return publicCache.value;
        if (!publicRequest) publicRequest = page({ apiUrl: 'https://openrouter.ai/api/v1/chat/completions' })
            .then(value => { publicCache = { at: Date.now(), value }; return value; }).finally(() => { publicRequest = null; });
        return publicRequest;
    }
    return { page, publicOpenRouter };
}
module.exports = { createModelCatalogService, ...createModelCatalogService() };
