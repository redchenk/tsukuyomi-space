'use strict';

// Pure, provider-independent policy. State is rebuilt from completed turns, so
// retries, edits, account isolation and persistence follow the chat source.
const policy = require('./room-dialogue-policy.json');
const matches = (pattern, text) => new RegExp(pattern, 'iu').test(text);
const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
const bounded = value => clean(value).slice(0, policy.maxTextChars);

function signals(value) {
    const text = bounded(value);
    const result = Object.fromEntries(Object.entries(policy.signals).map(([key, pattern]) => [key, matches(pattern, text)]));
    if (result.statement && !matches('[?？]', text)) result.question = false;
    // Quoted, hypothetical and role-play text is not evidence about the user.
    if (result.quoted) for (const key of Object.keys(result)) if (key !== 'quoted') result[key] = false;
    result.topic = result.quoted ? '' : policy.topics.find(topic => matches(topic.pattern, text))?.id || '';
    return result;
}

function evaluateReply(value) {
    const text = bounded(value);
    // Ignore URLs/code while counting visible question turns; this is a style
    // signal, not semantic proof that a question was appropriate.
    const speech = text.replace(/```[\s\S]*?```|`[^`]*`|https?:\/\/\S+/giu, '');
    return {
        question: matches('[?？]', speech),
        opening: policy.openings.find(opening => text.toLowerCase().startsWith(opening.toLowerCase())) || '',
        patterns: Object.keys(policy.patterns).filter(key => matches(policy.patterns[key], speech))
    };
}

function completedTurns(history = []) {
    const rows = (Array.isArray(history) ? history : []).slice(-policy.maxMessages)
        .filter(row => row && !row.pending && !row.failed && ['user', 'assistant'].includes(row.role) && typeof row.content === 'string' && row.content.trim());
    const turns = new Map();
    for (let i = 0; i < rows.length; i++) {
        const user = rows[i], assistant = rows[i + 1];
        const paired = user.role === 'user' && assistant?.role === 'assistant'
            && (!user.turnId || !assistant.turnId || user.turnId === assistant.turnId
                || (String(user.turnId).startsWith('import-') && String(assistant.turnId).startsWith('import-')));
        if (paired) {
            const id = String(user.turnId || assistant.turnId || `row-${i}`).slice(0, 160);
            turns.set(id, { id, user: bounded(user.content), assistant: bounded(assistant.content), createdAt: assistant.createdAt || user.createdAt || '' });
            i++;
        } else if (user.role === 'assistant' && (user.opener === true || i === 0)) {
            const id = String(user.turnId || `row-${i}`).slice(0, 160);
            turns.set(id, { id, user: '', assistant: bounded(user.content), createdAt: user.createdAt || '' });
        }
    }
    return [...turns.values()];
}

function advicePreference(signal, previous = 'unknown') {
    if (signal.noAdvice) return 'no';
    if (signal.allowAdvice || signal.help) return 'yes';
    return previous;
}

function actFor(signal) {
    if (signal.close && !signal.help && !signal.question) return 'close';
    if (signal.repair) return 'repair';
    if (signal.help || (signal.question && signal.topic === 'debug')) return 'answer';
    if (signal.close) return 'close';
    if (signal.serious || signal.distress) return 'acknowledge';
    if (signal.recall) return 'recall';
    if (signal.affection) return 'affection';
    if (signal.praise) return 'receivePraise';
    if (signal.opinion) return 'opinion';
    if (signal.question) return 'answer';
    if (signal.positive) return 'celebrate';
    if (signal.play) return 'banter';
    return 'natural';
}

function toneFor(signal, previous = 'neutral') {
    if (signal.serious || signal.noBanter || signal.repair) return 'serious';
    if (signal.distress) return 'quiet';
    if (signal.positive || signal.play || signal.allowBanter) return 'light';
    return previous;
}

function deriveState(history = [], now = Date.now()) {
    const turns = completedTurns(history);
    let advice = 'unknown', noQuestions = false, noBanter = false;
    let tone = 'neutral', topic = '', questionStreak = 0, lastAct = 'natural';
    const pending = new Map(), openings = [], patterns = [];
    for (const turn of turns) {
        const signal = signals(turn.user), reply = evaluateReply(turn.assistant);
        // "yes" applies to the current request; only an explicit refusal is a
        // continuing boundary. A past request for help is not blanket consent.
        advice = advicePreference(signal, advice === 'no' ? 'no' : 'unknown');
        if (signal.noQuestions) noQuestions = true;
        else if (signal.allowQuestions) noQuestions = false;
        if (signal.noBanter) noBanter = true;
        else if (signal.allowBanter) noBanter = false;
        tone = toneFor(signal, signal.close || (signal.topic && topic && signal.topic !== topic) ? 'neutral' : tone);
        if (signal.close) { topic = ''; pending.clear(); }
        if (signal.topic) topic = signal.topic;
        if (signal.resolved) pending.delete(topic);
        else if (topic && signal.pending) pending.set(topic, { topic, sourceTurnId: turn.id });
        questionStreak = reply.question ? questionStreak + 1 : 0;
        lastAct = reply.question ? 'ask' : actFor(signal);
        openings.push(reply.opening);
        patterns.push(reply.patterns);
    }
    const last = turns.at(-1);
    // SQLite timestamps are UTC; Date.parse otherwise uses the host timezone.
    const date = String(last?.createdAt || '');
    const timestamp = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(date) ? date.replace(' ', 'T') + 'Z' : date);
    if (Number.isFinite(timestamp) && now - timestamp > policy.toneTtlMs) tone = 'neutral';
    const recentOpenings = openings.slice(-4).filter(Boolean);
    return { version: policy.version, completedTurns: turns.length, lastAct, questionStreak,
        tone, topic, advice: advice === 'no' ? 'no' : 'unknown', noQuestions, noBanter,
        recentOpenings, repeatedOpening: recentOpenings.some(value => recentOpenings.filter(item => item === value).length > 1),
        recentPatterns: [...new Set(patterns.slice(-4).flat())], pendingTopics: [...pending.values()].slice(-3) };
}

function plan({ message = '', history = [], now = Date.now(), opener = false } = {}) {
    const state = deriveState(history, now), signal = signals(message);
    const advice = advicePreference(signal, state.advice);
    const noQuestions = signal.noQuestions || (state.noQuestions && !signal.allowQuestions);
    const noBanter = signal.noBanter || (state.noBanter && !signal.allowBanter);
    let act = opener ? 'natural' : actFor(signal);
    const previousTone = signal.close || (signal.topic && state.topic && signal.topic !== state.topic) ? 'neutral' : state.tone;
    const tone = noBanter ? 'serious' : toneFor(signal, previousTone);
    if (act === 'banter' && (noBanter || ['quiet', 'serious'].includes(tone))) act = 'natural';
    const keys = [
        ...(advice === 'no' ? ['noAdvice'] : []),
        ...(noQuestions ? ['noQuestions'] : state.questionStreak ? ['questionCooldown'] : []),
        ...(noBanter ? ['noBanter'] : []),
        ...(['light', 'quiet', 'serious'].includes(tone) ? [tone] : []),
        ...(signal.brief ? ['brief'] : signal.detail ? ['detail'] : []),
        ...(state.repeatedOpening ? ['repeatOpening'] : []),
        ...(state.recentPatterns.length ? ['repeatPattern'] : []),
        ...(state.completedTurns ? ['continuity'] : [])
    ];
    // Only application-owned text reaches the instruction block. Raw history,
    // topic text, opening strings and model-generated labels are never spliced.
    const prompt = [policy.notes.intro, policy.acts[act], ...keys.map(key => policy.notes[key])].join('\n');
    return { version: policy.version, act, tone, advice, noQuestions, noBanter,
        topic: signal.topic || (signal.close ? '' : state.topic), state, prompt };
}

module.exports = { policy, signals, completedTurns, evaluateReply, deriveState, plan };
