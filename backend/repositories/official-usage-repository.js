const db = require('../db');

const DAY = 86400000, OFFSET = 8 * 3600000;
const day = time => new Date(time + OFFSET).toISOString().slice(0, 10);
const empty = () => ({ total: 0, completed: 0, incomplete: 0, pending: 0 });
const pair = () => ({ llm: empty(), tts: empty() });
const invalid = () => { throw Object.assign(new Error('请选择 7、30 或 90 天，以及不晚于今天的有效日期'), { status: 400 }); };

// Both the official LLM gateway and TTS reserve a durable site-wallet request.
// Count its identity once, including sponsored calls, without touching balances,
// triggering TTS readiness probes, or reading any conversation/audio content.
function dailyUsage({ days = '30', end, now = Date.now() } = {}) {
    if (typeof days !== 'string' || !['7', '30', '90'].includes(days)) invalid();
    const today = day(now);
    end ??= today;
    if (typeof end !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(end)) invalid();
    const midnight = Date.parse(`${end}T00:00:00.000Z`);
    if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== end || end > today) invalid();
    const count = Number(days), start = midnight - OFFSET - (count - 1) * DAY;
    const finish = midnight - OFFSET + DAY;
    const query = db.prepare(`
        SELECT date(r.created_at, '+8 hours') AS day,
            CASE WHEN json_extract(r.pricing_snapshot_json, '$.unit') = 'voice' THEN 'tts' ELSE 'llm' END AS kind,
            r.state, count(*) AS calls
        FROM billing_requests r JOIN site_wallet_admissions a ON a.request_id = r.request_id
        WHERE r.created_at >= ? AND r.created_at < ?
        GROUP BY day, kind, r.state`);
    const buckets = (from, to) => query.all(new Date(from).toISOString(), new Date(to).toISOString());
    const add = (target, row) => {
        target[row.kind].total += row.calls;
        const state = row.state === 'settled' ? 'completed' : row.state === 'released' ? 'incomplete' : 'pending';
        target[row.kind][state] += row.calls;
    };
    return db.transaction(() => {
        const rows = Array.from({ length: count }, (_, i) => ({ date: day(finish - (i + 1) * DAY), ...pair() }));
        const byDate = new Map(rows.map(row => [row.date, row])), total = pair();
        for (const row of buckets(start, finish)) { add(byDate.get(row.day), row); add(total, row); }
        const current = { date: today, ...pair() };
        if (end === today) Object.assign(current, rows[0]);
        else {
            const currentStart = Date.parse(`${today}T00:00:00Z`) - OFFSET;
            for (const row of buckets(currentStart, currentStart + DAY)) add(current, row);
        }
        const first = db.prepare(`SELECT date(r.created_at, '+8 hours') AS day FROM billing_requests r
            JOIN site_wallet_admissions a ON a.request_id = r.request_id ORDER BY r.created_at LIMIT 1`).get();
        return { timezone: 'Asia/Shanghai', from: day(start), to: end, days: count,
            today: current, total, rows, firstRecordedDate: first?.day || null, generatedAt: new Date(now).toISOString() };
    }).deferred();
}

module.exports = { dailyUsage };
