// Built from the same editorial entries for direct visits and client navigation.
function wikiSearch(entry, language = 'zh-CN') {
    const english = language === 'en';
    const japanese = language === 'ja';
    const work = english ? 'Cosmic Princess Kaguya!' : japanese ? '超かぐや姫！' : '超时空辉夜姬';
    const title = english
        ? `${entry.title} – ${entry.kindLabel} | ${work} Wiki`
        : `${entry.title} - ${entry.kindLabel}｜${work} Wiki`;
    const introduction = english
        ? `${entry.title} in ${work}. `
        : japanese ? `『${work}』の${entry.title}。` : `《${work}！》${entry.kindLabel}「${entry.title}」。`;
    const summary = entry.summary || entry.headline;
    const firstParagraph = entry.sections?.[0]?.[1]?.[0];
    const parts = [summary, firstParagraph].filter((value, i) => value && (i === 0 || !summary?.includes(value)));
    const full = introduction + parts.join(' ');
    if (Array.from(full).length <= 170) return { title, description: full };
    const text = Array.from(full).slice(0, 169).join('');
    const end = Math.max(text.lastIndexOf('。'), text.lastIndexOf('. '));
    return { title, description: end >= 65 ? text.slice(0, end + 1) : text.trimEnd() + '…' };
}

module.exports = { wikiSearch };
