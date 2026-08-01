const fs = require('fs');
const path = require('path');
const { checkFriendLink } = require('../backend/services/friend-link-monitor');

function readArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (!value.startsWith('--')) continue;
        args[value.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--')
            ? argv[++index]
            : 'true';
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

async function loadSource(sourceUrl) {
    const response = await fetch(sourceUrl, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'TsukuyomiSpace-FriendLinkAction/1.0'
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`友链源返回 HTTP ${response.status}`);
    const declaredLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
    if (declaredLength > 2 * 1024 * 1024) throw new Error('友链源数据过大');
    const payload = await response.json();
    if (!payload?.success || !Array.isArray(payload?.data?.link_list)) {
        throw new Error('友链源数据格式无效');
    }
    return payload.data;
}

async function main() {
    const args = readArgs(process.argv.slice(2));
    const sourceUrl = args.source || process.env.FRIEND_LINK_SOURCE_URL || 'https://yachiyo.hk/api/friend-links/source';
    const outputPath = path.resolve(args.output || 'friend-link-results/result.json');
    const source = await loadSource(sourceUrl);
    const links = source.link_list.filter(link => matchesTarget(link, args.target || ''));
    const reuseStatus = ['1', 'true', 'yes'].includes(String(args['reuse-status'] || '').toLowerCase());
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
        source_url: sourceUrl,
        total_count: source.length,
        checked_count: results.length,
        links: results
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    process.stdout.write(`Saved ${results.length} ${reuseStatus ? 'screenshot source' : 'monitor result'}(s) to ${outputPath}\n`);
}

main().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
});
