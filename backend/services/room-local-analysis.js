const crypto = require('node:crypto');
const db = require('../db');
const local = require('./room-local-client');
const VERSION = 'bge-small-zh-v1.5:semantic-evidence-v2';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const parse = (value, fallback = {}) => { try { return JSON.parse(value); } catch { return fallback; } };
const ATTRIBUTES = new Set(['name', 'birthday', 'preference', 'health', 'plan', 'project', 'other']);
const MODALITIES = new Set(['explicit', 'tentative', 'hypothetical', 'quoted', 'correction']);
const IMPORTANCE = { identity: 0.8, safety: 0.95, preference: 0.72, commitment: 0.78, temporary: 0.35, casual: 0.2 };
const CONFIDENCE = { explicit: 0.88, correction: 0.92, tentative: 0.45, hypothetical: 0.15, quoted: 0.2 };
const RELATIONSHIP = { gratitude: 1, care: 1, shared_activity: 2, trust: 2, none: 0 };
const SCORE_COMMAND = /假如|假设|扮演|他说|她说|好感|加分|涨分|系统提示|忽略.*指令|system prompt/i;
const fingerprintFor = text => hash(String(text).normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase());

// Award only after a complete turn is durably saved, in that same transaction.
// Basic progress must not depend on memory opt-in or the semantic worker.
function recordConversation(userId, turn, { replace = false } = {}) {
    if (turn.opener || !turn.userMessage || !turn.assistantMessage?.trim()) return null;
    return db.transaction(() => {
        const previous = db.prepare('SELECT * FROM room_relationship_events WHERE user_id=? AND turn_id=?').get(userId, turn.turnId);
        if (replace && !previous) return null; // Never backfill old/imported conversations on edit.
        const fingerprint = fingerprintFor(turn.userMessage);
        if (previous && (!replace || previous.fingerprint === fingerprint))
            return { turnId: turn.turnId, delta: 0, reason: '本轮已记录，不重复加分' };
        const day = previous?.day || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        const duplicate = db.prepare('SELECT 1 FROM room_relationship_events WHERE user_id=? AND fingerprint=? AND turn_id<>?').get(userId, fingerprint, turn.turnId);
        const today = db.prepare('SELECT COALESCE(SUM(delta),0) AS n FROM room_relationship_events WHERE user_id=? AND day=? AND turn_id<>?').get(userId, day, turn.turnId).n;
        const total = db.prepare('SELECT COALESCE(SUM(delta),0) AS n FROM room_relationship_events WHERE user_id=? AND turn_id<>?').get(userId, turn.turnId).n;
        const valid = turn.userMessage.replace(/[\s\p{P}\p{S}]/gu, '').length >= 2
            && !/好感|加分|涨分|系统提示|忽略.*指令|system prompt/i.test(turn.userMessage);
        const delta = !valid || duplicate ? 0 : Math.max(0, Math.min(1, 10 - today, 1000 - total));
        const reason = !valid ? '本轮未计分' : duplicate ? '重复互动' : total >= 1000 ? '好感度已满' : today >= 10 ? '今日已达加分上限' : '日常交流';
        db.prepare(`INSERT INTO room_relationship_events(user_id,turn_id,revision,delta,reason,evidence,fingerprint,day)
            VALUES(?,?,?,?,?,'',?,?) ON CONFLICT(user_id,turn_id) DO UPDATE SET
            revision=excluded.revision,delta=excluded.delta,reason=excluded.reason,evidence='',fingerprint=excluded.fingerprint`)
            .run(userId, turn.turnId, hash(JSON.stringify([turn.userMessage, turn.assistantMessage])), delta, reason, fingerprint, day);
        return { turnId: turn.turnId, delta: delta - (previous?.delta || 0), reason };
    })();
}
const SCHEMA = { type: 'object', additionalProperties: false, required: ['facts', 'relationship', 'relationshipQuote'], properties: {
    facts: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false,
        required: ['quote', 'attribute', 'modality', 'importance'], properties: {
            quote: { type: 'string', maxLength: 400 }, attribute: { type: 'string', enum: [...ATTRIBUTES] },
            modality: { type: 'string', enum: [...MODALITIES] }, importance: { type: 'string', enum: Object.keys(IMPORTANCE) }
        } } }, relationship: { type: 'string', enum: Object.keys(RELATIONSHIP) }, relationshipQuote: { type: 'string', maxLength: 400 }
} };

function enqueueTurn(userId, turn, sourceIds) {
    if (!local.enabled || !sourceIds.length) return;
    const revision = hash(JSON.stringify([turn.userMessage, turn.assistantMessage]));
    db.prepare(`INSERT INTO room_turn_analysis(user_id,turn_id,revision,user_text,source_ids)
        VALUES(?,?,?,?,?) ON CONFLICT(user_id,turn_id) DO UPDATE SET
        revision=excluded.revision,user_text=excluded.user_text,source_ids=excluded.source_ids,
        state='pending',window_cursor=0,attempts=0,available_at=0,evidence='[]',updated_at=CURRENT_TIMESTAMP
        WHERE room_turn_analysis.revision<>excluded.revision`).run(userId, turn.turnId, revision, turn.userMessage, JSON.stringify(sourceIds));
}

function validateEvidence(output, userText) {
    const facts = (Array.isArray(output?.facts) ? output.facts : []).slice(0, 3).flatMap(fact => {
        const quote = String(fact.quote || '').trim();
        if (quote.length < 4 || quote.length > 400 || !userText.includes(quote)
            || !ATTRIBUTES.has(fact.attribute) || !MODALITIES.has(fact.modality) || !(fact.importance in IMPORTANCE)) return [];
        // Model labels are not sufficient to turn a roleplay/instruction into a
        // reliable fact. Keep original evidence, with conservative confidence.
        const uncertain = /假如|假设|如果|开玩笑|小说|角色扮演|扮演|他说|她说|听说|据说|忽略.*指令|置信度|重要度|好感度|系统提示|system prompt/i.test(userText);
        const modality = uncertain ? 'hypothetical' : fact.modality;
        const strength = Number.isFinite(fact.similarity) ? Math.max(0, Math.min(1, fact.similarity)) : 0.5;
        return [{ quote, attribute: fact.attribute, modality, confidence: CONFIDENCE[modality],
            importance: Math.min(1, Number((IMPORTANCE[fact.importance] * 0.9 + strength * 0.1).toFixed(2))),
            reason: fact.importance, similarity: strength }];
    });
    let relationship = output?.relationship in RELATIONSHIP ? output.relationship : 'none';
    const quote = String(output?.relationshipQuote || '').trim();
    if (!quote || quote.length > 400 || !userText.includes(quote) || SCORE_COMMAND.test(userText)
        || /如果|开玩笑|不信任|不喜欢你|不相信你|不要.*(一起|约)|不想.*(一起|约)/.test(quote)) relationship = 'none';
    return { facts, relationship, relationshipQuote: relationship === 'none' ? '' : quote };
}

async function analyze(userText) {
    return validateEvidence(await local.request('/analyze', { text: userText }, 10000), userText);
}

function relationship(userId, before = '') {
    return db.transaction(() => {
        const stats = db.prepare('SELECT COALESCE(SUM(delta),0) AS score,COUNT(*) AS totalRecords FROM room_relationship_events WHERE user_id=?').get(userId);
        const sum = stats.score;
        const score = Math.max(0, Math.min(1000, sum));
        const stages = [[0, '初次相识'], [30, '渐渐熟悉'], [120, '月下同行'], [300, '相知相伴'], [600, '月之眷属']];
        const stage = stages.filter(([min]) => score >= min).at(-1)[1];
        const boundary = before ? db.prepare('SELECT rowid AS position FROM room_relationship_events WHERE user_id=? AND turn_id=?').get(userId, before)?.position : Number.MAX_SAFE_INTEGER;
        if (boundary == null) throw Object.assign(new Error('互动分页位置无效，请刷新'), { statusCode: 400 });
        const rows = db.prepare(`SELECT * FROM (
            SELECT rowid AS position,turn_id AS turnId,delta,reason,created_at AS createdAt,
                SUM(delta) OVER (ORDER BY rowid) AS cumulative
            FROM room_relationship_events WHERE user_id=?
        ) ledger WHERE position<? ORDER BY position DESC LIMIT 13`).all(userId, boundary);
        const records = rows.slice(0, 12).map(({ position, cumulative, ...record }) => ({ ...record,
            scoreBefore: Math.max(0, Math.min(1000, cumulative - record.delta)), scoreAfter: Math.max(0, Math.min(1000, cumulative)) }));
        const pending = db.prepare("SELECT COUNT(*) AS count FROM room_turn_analysis WHERE user_id=? AND state IN ('pending','running')").get(userId).count;
        const failed = db.prepare("SELECT COUNT(*) AS count FROM room_turn_analysis WHERE user_id=? AND state='failed'").get(userId).count;
        const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        const todayDelta = db.prepare('SELECT COALESCE(SUM(delta),0) AS n FROM room_relationship_events WHERE user_id=? AND day=?').get(userId, day).n;
        const recentDelta = records.reduce((n, record) => n + record.delta, 0);
        const ledger = crypto.createHash('sha256');
        for (const row of db.prepare('SELECT turn_id,revision,delta,reason FROM room_relationship_events WHERE user_id=? ORDER BY rowid').iterate(userId))
            ledger.update(JSON.stringify(row));
        const nextStage = stages.find(([min]) => min > score);
        return { enabled: true, semanticEnabled: local.enabled, score, max: 1000, stage, pending, failed, records, totalRecords: stats.totalRecords,
            nextStage: nextStage ? { score: nextStage[0], name: nextStage[1], remaining: nextStage[0] - score } : null,
            totalDelta: sum, recentDelta, earlierDelta: sum - recentDelta, todayDelta, ledgerRevision: ledger.digest('hex'),
            nextCursor: rows.length > 12 ? records.at(-1).turnId : null,
            rules: { dailyLimit: 10, conversation: 1, dailySharingLimit: 3, gratitude: 1, care: 1, shared_activity: 2, trust: 2, dailySharing: 1 },
            source: 'server-local-evidence', version: VERSION, description: '角色互动进度，不代表真人感情；重复刷屏不加分，缺席和负面情绪不扣分。' };
    })();
}

function apply(job, evidence) {
    return db.transaction(() => {
        const current = db.prepare('SELECT * FROM room_turn_analysis WHERE user_id=? AND turn_id=? AND revision=?').get(job.user_id, job.turn_id, job.revision);
        if (!current || current.state === 'complete' || current.state === 'cancelled') return false;
        const sourceIds = parse(current.source_ids, []);
        const rows = sourceIds.map(id => db.prepare('SELECT rowid AS source_order,* FROM room_memories WHERE id=? AND user_id=?').get(id, job.user_id)).filter(Boolean);
        // Deleted or manually edited sources are never recreated by old work.
        const owned = rows.filter(row => { const m = parse(row.metadata); return m.sourceKind === 'chat-turn-auto' && m.sourceRevision === job.revision; });
        if (!owned.length) { db.prepare("UPDATE room_turn_analysis SET state='cancelled',user_text='' WHERE user_id=? AND turn_id=? AND revision=?").run(job.user_id, job.turn_id, job.revision); return false; }
        const all = [...parse(current.evidence, []), evidence];
        const facts = all.flatMap(item => item.facts).map(fact => job.origin === 'archive'
            ? { ...fact, confidence: Math.min(0.72, fact.confidence), provenance: 'legacy-role-boundary' } : fact);
        for (const row of owned) {
            const meta = parse(row.metadata);
            const matching = facts.filter(fact => row.content.includes(fact.quote));
            meta.analysis = { version: VERSION, state: 'complete', evidence: matching, analyzedAt: new Date().toISOString() };
            // Manual edits have already removed sourceKind. Never overwrite
            // scores the user intentionally supplied.
            meta.confidence = matching.length ? Math.min(...matching.map(fact => fact.confidence)) : 0.65;
            const importance = matching.length ? Math.max(...matching.map(fact => fact.importance)) : 0.2;
            db.prepare('UPDATE room_memories SET importance=?,metadata=? WHERE id=? AND user_id=?').run(importance, JSON.stringify(meta), row.id, job.user_id);
            for (const fact of matching.filter(item => item.confidence >= 0.8)) {
                const id = hash(JSON.stringify([job.user_id, row.id, fact.quote]));
                let active = 1;
                if (['name', 'birthday'].includes(fact.attribute)) {
                    db.prepare('UPDATE room_memory_facts SET active=0 WHERE user_id=? AND attribute=? AND turn_id<>? AND source_order<?').run(job.user_id, fact.attribute, job.turn_id, row.source_order);
                    if (db.prepare('SELECT 1 FROM room_memory_facts WHERE user_id=? AND attribute=? AND source_order>? AND active=1').get(job.user_id, fact.attribute, row.source_order)) active = 0;
                }
                db.prepare('INSERT OR IGNORE INTO room_memory_facts(id,user_id,memory_id,turn_id,attribute,value,quote,confidence,importance,source_order,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
                    .run(id, job.user_id, row.id, job.turn_id, fact.attribute, fact.quote, fact.quote, fact.confidence, fact.importance, row.source_order, active, row.created_at);
            }
        }
        const special = all.find(item => item.relationship !== 'none');
        // Normal, concrete sharing can progress too. Require an original,
        // confident semantic fact rather than rewarding every hello or emoji.
        const sharing = facts.find(fact => fact.confidence >= 0.8 && fact.quote.replace(/[\s\p{P}\p{S}]/gu, '').length >= 8
            && current.user_text.includes(fact.quote) && !SCORE_COMMAND.test(current.user_text)
            && !/不想聊天|不要聊天|不想说|结束聊天/.test(fact.quote));
        const signal = special || (sharing ? { relationship: 'daily_sharing', relationshipQuote: sharing.quote } : { relationship: 'none', relationshipQuote: '' });
        const fingerprint = fingerprintFor(current.user_text);
        const day = new Date(new Date(current.created_at + (current.created_at.endsWith('Z') ? '' : 'Z')).getTime() + 8 * 3600000).toISOString().slice(0, 10);
        const duplicate = db.prepare('SELECT 1 FROM room_relationship_events WHERE user_id=? AND fingerprint=? AND turn_id<>?').get(job.user_id, fingerprint, job.turn_id);
        const today = db.prepare('SELECT COALESCE(SUM(delta),0) AS total FROM room_relationship_events WHERE user_id=? AND day=? AND turn_id<>?').get(job.user_id, day, job.turn_id).total;
        const shares = db.prepare("SELECT COUNT(*) AS n FROM room_relationship_events WHERE user_id=? AND day=? AND turn_id<>? AND reason='日常分享' AND delta>0").get(job.user_id, day, job.turn_id).n;
        const sharingCapped = signal.relationship === 'daily_sharing' && shares >= 3;
        const previous = db.prepare('SELECT delta,reason,fingerprint FROM room_relationship_events WHERE user_id=? AND turn_id=?').get(job.user_id, job.turn_id);
        const base = previous?.fingerprint === fingerprint ? previous.delta : 0;
        const semanticAward = sharingCapped ? 0 : signal.relationship === 'daily_sharing' ? 1 : RELATIONSHIP[signal.relationship] || 0;
        const award = Math.max(base, semanticAward);
        const total = db.prepare('SELECT COALESCE(SUM(delta),0) AS n FROM room_relationship_events WHERE user_id=? AND turn_id<>?').get(job.user_id, job.turn_id).n;
        // Later duplicate turns must never revoke the original turn's saved points.
        const blockedDuplicate = duplicate && !base;
        const delta = blockedDuplicate ? 0 : Math.max(0, Math.min(award, 10 - today, 1000 - total));
        const reason = blockedDuplicate ? '重复互动' : base >= semanticAward && base > 0 ? previous.reason : total >= 1000 ? '好感度已满' : sharingCapped ? '今日分享已达上限' : !award ? '未发现可计分互动' : today >= 10 ? '今日已达加分上限'
            : ({ gratitude: '真诚感谢', care: '主动关心', shared_activity: '共同约定', trust: '表达信任', daily_sharing: '日常分享' }[signal.relationship]);
        if (job.origin !== 'archive') db.prepare(`INSERT INTO room_relationship_events(user_id,turn_id,revision,delta,reason,evidence,fingerprint,day)
            VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,turn_id) DO UPDATE SET revision=excluded.revision,delta=excluded.delta,
            reason=excluded.reason,evidence=excluded.evidence,fingerprint=excluded.fingerprint,day=excluded.day`)
            .run(job.user_id, job.turn_id, job.revision, delta, reason, signal.relationshipQuote, fingerprint, day);
        db.prepare("UPDATE room_turn_analysis SET state='complete',evidence=?,user_text='',lease_until=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND turn_id=? AND revision=?")
            .run(JSON.stringify(all), job.user_id, job.turn_id, job.revision);
        return true;
    })();
}

module.exports = { enqueueTurn, analyze, apply, validateEvidence, relationship, recordConversation, VERSION, SCHEMA };
