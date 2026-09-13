/** Use the complete rendered text when available; never infer a duration from an excerpt. */
export function readingTimeLabel(article, lang = 'zh', text) {
  let minutes;
  if (typeof text === 'string' && text.trim()) {
    const cjk = text.match(/[\u3040-\u30ff\u3400-\u9fff]/g)?.length || 0;
    const words = text.replace(/[\u3040-\u30ff\u3400-\u9fff]/g, ' ').match(/[\p{L}\p{N}]+/gu)?.length || 0;
    minutes = Math.max(1, Math.ceil(cjk / 350 + words / 220));
  } else {
    const supplied = String(article?.read_time || '').trim();
    const match = supplied.match(/^(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?|分钟|分)?$/i);
    if (!match || Number(match[1]) <= 0) return '';
    minutes = Math.max(1, Math.ceil(Number(match[1])));
  }
  return lang === 'en' ? `${minutes} min read` : lang === 'ja' ? `約 ${minutes} 分` : `约 ${minutes} 分钟`;
}
