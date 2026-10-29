'use strict';

// Deliberately narrow, evidence-only fast path. Semantic analysis still handles
// general preferences/plans; these explicit statements must survive a new chat
// even before its background worker finishes. Never read assistant assertions.
function extract(userText) {
    const source = String(userText || '').trim();
    if (!source || source.length > 2000 || /假如|假设|例如|举例|扮演|他说|她说|小说|剧本|系统提示|忽略.*指令/i.test(source)) return [];
    const facts = [];
    const name = source.match(/^(?:请记住[，,：: ]*)?(?:我的名字是|我叫|请叫我|以后(?:请)?叫我|叫我)\s*([^\s，。！？!?,;；:\n“”"'<>]{1,24})(?:[，。！!]|$)/u);
    if (name && !/^(?:你|他|她|它|不要|什么)/.test(name[1])) facts.push({ key: 'name', value: name[1], quote: name[0] });
    const stopName = source.match(/^(?:以后)?不要再叫我([^\s，。！？!?,;；:\n“”"'<>]{1,24})[。！!]?$/u);
    if (stopName) facts.push({ key: 'name', value: '', quote: source });
    const agreement = source.match(/^下(?:一)?次(?:如果)?我(?:会)?(?:说|说到)[“「"]([^”」"\n]{1,80})[”」"][，, ]*(?:请你|你就|请)(?:回答|回复|说)[“「"]([^”」"\n]{1,160})[”」"][。！!]?$/u);
    if (agreement) facts.push({ key: `cue:${agreement[1]}`, value: agreement[2], quote: source });
    return facts;
}

function fromRecord(row) {
    const content = String(row?.content || '');
    // Require an unambiguous saved user boundary, or an intentionally edited
    // standalone profile. No extraction from quoted assistant responses.
    const user = content.startsWith('用户：') ? content.slice(3).split('\n八千代：')[0]
        : row?.manuallyEdited || row?.type === 'profile' ? content : '';
    return extract(user).filter(fact => !(row.continuityRetired || []).includes(fact.key));
}

function selectLocal(records, excluded = new Set()) {
    const seen = new Set(), selected = [];
    for (const row of [...records].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id)))) {
        const facts = fromRecord(row).filter(fact => { if (seen.has(fact.key)) return false; seen.add(fact.key); return true; });
        // A newer fact in recent history retires older anchors too, even though
        // it does not need to be repeated in the retrieval block.
        if (excluded.has(row.sourceTurnId) || !facts.length) continue;
        selected.push({ ...row, continuity: true, context: facts.map(fact => fact.quote).join('\n') });
    }
    return selected.sort((a, b) => Number(fromRecord(b).some(f => f.key === 'name')) - Number(fromRecord(a).some(f => f.key === 'name'))).slice(0, 4);
}
module.exports = { extract, fromRecord, selectLocal };
