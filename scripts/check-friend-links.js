const fs = require('fs');
const path = require('path');
const { checkFriendLink } = require('../backend/services/friend-link-monitor');

const SOURCE_MAX_ATTEMPTS = 3;
const SOURCE_REQUEST_TIMEOUT_MS = 12000;
const SOURCE_RETRY_DELAY_MS = 1000;

function readArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (!value.startsWith('--')) continue;
        const nextValue = argv[index + 1];
        const hasValue = nextValue !== undefined && !nextValue.startsWith('--');
        args[value.slice(2)] = hasValue ? nextValue : 'true';
        if (hasValue) index += 1;
    }
    return args;
}

async function mapWithConcurrency(items, limit, worker) {
    const output = new Array(items.length);
    let cursor = 0;
    async function run() {
        while (cursor < items.length) {
            const index = cursor++;
            output[index] = await worker(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return output;
}

function matchesTarget(link, target) {
    if (!target) return true;
    const needles = String(target).split(/[|,]/).map(value => value.trim().toLowerCase()).filter(Boolean);
    const haystack = `${link.id} ${link.name} ${link.link}`.toLowerCase();
    return needles.some(needle => haystack.includes(needle));
}

function wait(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

function normalizeSourceUrl(sourceUrl) {
    const parsed = new URL(String(sourceUrl || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('友链源地址协议无效');
    parsed.username = '';
    parsed.password = '';
    return parsed;
}

function sourceAttemptUrl(sourceUrl, attempt) {
    const parsed = normalizeSourceUrl(sourceUrl);
    parsed.searchParams.set('_monitor_attempt', String(attempt));
    return parsed.toString();
}

async function cancelBody(response) {
    try {
        await response?.body?.cancel();
    } catch (_) {
        // The failed response may already be closed.
    }
}

async function loadSource(sourceUrl, {
    fetchUrl = fetch,
    attempts = SOURCE_MAX_ATTEMPTS,
    timeoutMs = SOURCE_REQUEST_TIMEOUT_MS,
    retryDelayMs = SOURCE_RETRY_DELAY_MS,
    sleep = wait,
    log = message => process.stderr.write(`${message}\n`)
} = {}) {
    const normalizedSourceUrl = normalizeSourceUrl(sourceUrl).toString();
    const safeAttempts = Math.max(1, Math.min(5, Number.parseInt(attempts, 10) || SOURCE_MAX_ATTEMPTS));
    let lastError = null;

    for (let attempt = 1; attempt <= safeAttempts; attempt += 1) {
        try {
            const response = await fetchUrl(sourceAttemptUrl(normalizedSourceUrl, attempt), {
                headers: {
                    Accept: 'application/json',
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                    'User-Agent': 'TsukuyomiSpace-FriendLinkAction/1.0'
                },
                redirect: 'error',
                signal: AbortSignal.timeout(timeoutMs)
            });
            if (!response.ok) {
                await cancelBody(response);
                throw new Error(`HTTP ${response.status}`);
            }
            const declaredLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
            if (declaredLength > 2 * 1024 * 1024) {
                await cancelBody(response);
                throw new Error('数据过大');
            }
            const payload = await response.json();
            if (!payload?.success || !Array.isArray(payload?.data?.link_list)) {
                throw new Error('数据格式无效');
            }
            return payload.data;
        } catch (error) {
            lastError = error;
            if (attempt >= safeAttempts) break;
            const delayMs = retryDelayMs * (2 ** (attempt - 1));
            log(`Friend link source ${normalizedSourceUrl} attempt ${attempt}/${safeAttempts} failed: ${error?.message || error}; retrying in ${delayMs}ms`);
            await sleep(delayMs);
        }
    }

    throw new Error(`友链源 ${normalizedSourceUrl} 连续 ${safeAttempts} 次请求失败: ${lastError?.message || lastError}`);
}

async function loadSourceCandidates(sourceUrls, options = {}) {
    const candidates = [...new Set(sourceUrls.map(value => String(value || '').trim()).filter(Boolean))];
    if (!candidates.length) throw new Error('没有配置友链数据源');
    const errors = [];

    for (const sourceUrl of candidates) {
        try {
            return {
                data: await loadSource(sourceUrl, options),
                sourceUrl: normalizeSourceUrl(sourceUrl).toString()
            };
        } catch (error) {
            errors.push(error);
            options.log?.(`Friend link source unavailable, trying fallback: ${error.message}`);
        }
    }

    throw new AggregateError(errors, `所有友链数据源均不可用: ${errors.map(error => error.message).join(' | ')}`);
}

async function main() {
    const args = readArgs(process.argv.slice(2));
    const sourceUrl = args.source || process.env.FRIEND_LINK_SOURCE_URL || 'https://yachiyo.hk/api/friend-links/source';
    const fallbackSourceUrl = args['fallback-source'] || process.env.FRIEND_LINK_FALLBACK_SOURCE_URL || '';
    const outputPath = path.resolve(args.output || 'friend-link-results/result.json');
    const loadedSource = await loadSourceCandidates([sourceUrl, fallbackSourceUrl], {
        log: message => process.stderr.write(`${message}\n`)
    });
    const source = loadedSource.data;
    const sourceLinkCount = source.link_list.length;
    const links = source.link_list.filter(link => matchesTarget(link, args.target || ''));
    const reuseStatus = ['1', 'true', 'yes'].includes(String(args['reuse-status'] || '').toLowerCase());
    if (!args.target && sourceLinkCount > 0 && links.length === 0) {
        throw new Error('未指定目标时不得生成空的友链监测结果');
    }
    const authorHosts = Array.isArray(source.author_hosts) && source.author_hosts.length
        ? source.author_hosts
        : [source.author_url || 'https://yachiyo.hk'];

    const results = reuseStatus ? links.map(link => ({
        id: link.id,
        name: link.name,
        url: link.link,
        status: ['online', 'slow', 'restricted', 'offline'].includes(link.monitor_status)
            ? link.monitor_status
            : 'unchecked',
        responseTimeMs: Number(link.response_time_ms) || 0,
        httpStatus: Number(link.http_status) || 0,
        failCount: Number(link.fail_count) || 0,
        hasBacklink: link.has_backlink === true,
        checkedAt: link.last_checked_at || null,
        apply_status: false
    })) : await mapWithConcurrency(links, 4, async link => {
        const result = await checkFriendLink({
            id: link.id,
            url: link.link,
            backlink_url: link.linkpage,
            fail_count: link.fail_count
        }, { authorHosts });
        process.stdout.write(`${link.name}: ${result.status} ${result.responseTimeMs}ms backlink=${result.hasBacklink}\n`);
        return { ...result, name: link.name };
    });

    const payload = {
        generated_at: new Date().toISOString(),
        source_url: loadedSource.sourceUrl,
        mode: reuseStatus ? 'screenshots_only' : 'status_only',
        target: String(args.target || ''),
        total_count: sourceLinkCount,
        checked_count: results.length,
        links: results
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    process.stdout.write(`Saved ${results.length} ${reuseStatus ? 'screenshot source' : 'monitor result'}(s) to ${outputPath}\n`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}

module.exports = {
    SOURCE_MAX_ATTEMPTS,
    SOURCE_REQUEST_TIMEOUT_MS,
    loadSource,
    loadSourceCandidates,
    matchesTarget,
    readArgs,
    sourceAttemptUrl
};
