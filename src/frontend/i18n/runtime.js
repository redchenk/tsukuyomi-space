import { ref } from 'vue';
import { forcedSiteLanguage } from '../utils/siteVariant';
const catalogs = {};
const loads = {};
const dictionaryRevision = ref(0);

function normalize(value) {
  const language = String(value || '').trim().toLowerCase().split('-')[0];
  return ['zh', 'ja', 'en'].includes(language) ? language : 'zh';
}
function initialLanguage() {
  const forced = forcedSiteLanguage();
  if (forced) return forced;
  try { return normalize(localStorage.getItem('lang')); } catch (_) { return 'zh'; }
}
export const interfaceLanguage = ref(initialLanguage());
export async function prepareInterfaceLanguage(language = interfaceLanguage.value) {
  const next = forcedSiteLanguage() || normalize(language);
  if (next === 'zh' || catalogs[next]) return;
  loads[next] ||= (next === 'ja' ? import('virtual:tsukuyomi-interface-ja') : import('virtual:tsukuyomi-interface-en'))
    .then(module => { catalogs[next] = module.default; dictionaryRevision.value++; })
    .catch(error => { delete loads[next]; throw error; });
  await loads[next];
}
let revision = 0;
export async function setInterfaceLanguage(language) {
  const next = forcedSiteLanguage() || normalize(language), current = ++revision;
  await prepareInterfaceLanguage(next);
  if (current === revision) interfaceLanguage.value = next;
  return interfaceLanguage.value;
}
export function uiText(source, parameters = []) {
  const text = String(source ?? '');
  const key = text.trim().replace(/\s+/g, ' ');
  const language = interfaceLanguage.value;
  dictionaryRevision.value; // React to a late locale load without remounting the page.
  const translated = language === 'zh' ? null : catalogs[language]?.[key];
  const replacement = translated ? (text.match(/^\s*/)[0] + translated + text.match(/\s*$/)[0]) : text;
  // Positional parameters are substituted once; user values can never become
  // translation keys, HTML, or new template expressions.
  return replacement.replace(/\{(\d+)\}/g, (match, index) => index < parameters.length ? String(parameters[index] ?? '') : match);
}

// Known API feedback is localized in memory. Private data is never sent to a
// remote translator, and unknown messages retain their original meaning.
export function translateFeedback(value) {
  const text = String(value || '');
  const direct = uiText(text);
  if (direct !== text) return direct;
  const retry = /^请 (\d+) 秒后再发送验证码$/.exec(text);
  if (retry) return uiText('请 {0} 秒后再发送验证码', [retry[1]]);
  for (const prefix of ['请求失败：', '请求失败: ', '网络请求失败：', '连接失败：', '保存失败：', '加载失败：']) {
    if (text.startsWith(prefix)) return uiText(prefix) + text.slice(prefix.length);
  }
  return text;
}
