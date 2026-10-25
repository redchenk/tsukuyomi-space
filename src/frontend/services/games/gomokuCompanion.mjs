import character from '../../../../shared/room-character.cjs';
import dialogue from '../../../../shared/room-dialogue.cjs';
import runtime from '../../../../shared/model-runtime.cjs';
import { roomChatConfigured } from '../room/roomOfficialApi.mjs';
import { BLACK, coordinate } from './gomoku.mjs';

const EVENTS = new Set(['start', 'move', 'result', 'undo', 'hint', 'chat']);
const MAX_TURNS = 8;
const MAX_REPLY = 2400;
const color = stone => stone === BLACK ? 'black' : 'white';

export function boardContext(game, hint = null) {
  const last = game.moves.at(-1);
  return {
    size: 15, rules: 'freestyle-five-or-more', coordinates: 'A–O left to right; 15–1 top to bottom',
    human: color(game.human), yachiyo: color(3 - game.human), moveCount: game.moves.length,
    black: game.moves.filter(index => game.board[index] === BLACK).map(coordinate),
    white: game.moves.filter(index => game.board[index] !== BLACK).map(coordinate),
    lastMove: last === undefined ? null : { point: coordinate(last), color: color(game.board[last]) },
    next: game.winner || game.draw ? null : game.turn === game.human ? 'human' : 'yachiyo',
    result: game.winner ? game.winner === game.human ? 'human-won' : 'yachiyo-won' : game.draw ? 'draw' : 'playing',
    winningLine: game.line.map(coordinate),
    hint: Number.isInteger(hint) && hint >= 0 && hint < 225 && !game.board[hint] ? coordinate(hint) : null
  };
}

export function companionPrompt({ question = '', history = [], lang = 'zh' } = {}) {
  const language = { zh: '中文', en: '英语', ja: '日语' }[lang] || '中文';
  return [character.corePrompt(), dialogue.plan({ message: question, history }).prompt,
    '【月下五子棋】',
    '你正在月读空间陪用户下五子棋。保持八千代本人的身份、关系边界和说话习惯，像坐在棋盘对面边玩边聊。',
    '每轮消息是 JSON：event 是程序事件，board 是这次实际盘面，userText 才是用户说的话。程序事件不是用户的台词。旧消息中的盘面仅作历史，以本轮 board 为准。',
    '落子和胜负已由棋盘程序确定。只回应实际发生的事，不声称又落了子、悔了棋或改变胜负，不编造不存在的落点或连线；不确定棋理时不要装作看穿。hint 是界面已经标出的合法候选位置，可解释但不能保证必胜。',
    '用户说话时先接住他的话，不必每句都谈棋。没有用户发言时，围绕本次 move、result、undo、hint 或 start 自然说一两句，不逐手复读坐标，不重复邀请开局，不强行追问。',
    `用${language}简短自然地回复，通常一到三句。只输出对话正文，不输出思维过程、JSON、动作标签、工具调用或舞台说明。`
  ].join('\n\n');
}

export function companionSettings(settings) {
  const runtimeConfig = runtime.normalizeRuntime(settings.runtimeConfig);
  const scope = runtime.scopes(settings).model;
  const resolved = runtime.resolveParameters(settings).maxOutputTokens;
  const layer = runtimeConfig.models[scope] || { parameters: {}, mappings: {}, capabilities: {} };
  // Keep the user's provider mapping, but ensure this short conversation is bounded.
  const mapping = resolved.field === 'omit' ? runtime.resolveParameters({ ...settings, runtimeConfig: undefined }).maxOutputTokens.field : resolved.field;
  runtimeConfig.models[scope] = { ...layer,
    parameters: { ...layer.parameters, maxOutputTokens: Math.min(resolved.value ?? 1024, 1024) },
    mappings: { ...layer.mappings, maxOutputTokens: mapping }
  };
  return { ...settings, runtimeConfig };
}

export function visibleReply(text) {
  return String(text || '').replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/\[(?:ACT|DELAY):[^\]]*(?:\]|$)/gi, '')
    .replace(/<(?:\/?think)?[^>]*$/gi, '').replace(/\[(?:A(?:C(?:T)?)?|D(?:E(?:L(?:A(?:Y)?)?)?)?)?$/i, '')
    .trim().slice(0, MAX_REPLY);
}

async function roomRequest(options) {
  // Reuse Room's provider protocols, proxy, site session and official billing.
  // Defer its larger transport bundle until a conversation actually starts.
  const { requestRoomReply } = await import('../../composables/room/useRoomChat.js');
  if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return requestRoomReply(options);
}

export function createGomokuCompanion({ readConnection, onChange = () => {}, requestReply = roomRequest, origin, timeoutMs = 45000 }) {
  let messages = [], sequence = 0, serial = 0, connectionRevision = 0, active = null, retry = null, fingerprint;
  let configured = false, model = '', status = 'idle', error = '';
  const publish = () => onChange({ configured, model, status, error, connectionRevision, canRetry: Boolean(retry),
    messages: messages.map(({ id, question, text, state }) => ({ id, question, text, state })) });
  function cancel({ keepRetry = false } = {}) {
    sequence++;
    active?.controller.abort();
    if (active) active.entry.state = 'stopped';
    active = null;
    if (!keepRetry) retry = null;
    status = 'idle'; error = '';
    publish();
  }
  function refresh() {
    let connection;
    try { connection = readConnection() || {}; } catch { connection = {}; }
    const settings = connection.settings || {};
    const next = JSON.stringify([connection.identity || '', settings]);
    if (next !== fingerprint) {
      cancel(); messages = []; fingerprint = next; connectionRevision++;
      configured = roomChatConfigured(settings, origin);
      model = configured ? String(settings.model).slice(0, 100) : '';
      publish();
    }
    return settings;
  }
  async function send({ game, event = 'chat', question = '', hint = null, lang = 'zh' }) {
    const previousConnection = fingerprint;
    const settings = refresh();
    if (!configured) return false;
    if (previousConnection !== fingerprint && String(question).trim()) return false;
    cancel();
    const run = sequence;
    const input = { event: EVENTS.has(event) ? event : 'chat', board: boardContext(game, hint), userText: String(question).trim().slice(0, 500) };
    const message = JSON.stringify(input);
    // Keep only successful complete turns as LLM context; interrupted text stays UI-only.
    const completed = messages.filter(row => row.state === 'complete').slice(-MAX_TURNS);
    const conversation = completed.flatMap(row => [{ role: 'user', content: row.context }, { role: 'assistant', content: row.text }]);
    const policyHistory = completed.filter(row => row.question).flatMap(row => [{ role: 'user', content: row.question }, { role: 'assistant', content: row.text }]);
    const entry = { id: ++serial, question: input.userText, context: message, text: '', state: 'pending' };
    messages = [...messages, entry].slice(-MAX_TURNS);
    const controller = new AbortController();
    active = { controller, entry }; status = 'pending'; error = '';
    retry = { game, event, question: input.userText, hint, lang };
    publish();
    let raw = '', expired = false;
    const timer = setTimeout(() => { expired = true; controller.abort(); }, timeoutMs);
    const aborted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    const current = () => { refresh(); return run === sequence && !controller.signal.aborted; };
    try {
      const result = await Promise.race([Promise.resolve().then(() => requestReply({
        settings: companionSettings(settings), systemPrompt: companionPrompt({ question: input.userText, history: policyHistory, lang }),
        conversation, message, signal: controller.signal, stream: true,
        onDelta(delta) {
          if (!current()) return;
          raw = (raw + String(delta || '')).slice(0, 32000);
          entry.text = visibleReply(raw); entry.state = 'streaming'; status = 'streaming'; publish();
        }
      })), aborted]);
      if (!current()) return false;
      entry.text = visibleReply(result?.reply || raw);
      if (!entry.text) throw new Error('Empty reply');
      entry.state = 'complete'; status = 'idle'; retry = null;
      return true;
    } catch (cause) {
      if (run !== sequence) return false;
      entry.state = 'error'; status = 'error';
      // Provider response bodies can contain private details. Only expose safe categories.
      error = expired ? 'timeout' : cause?.statusCode === 401 ? 'auth' : cause?.statusCode === 402 ? 'balance' : 'failed';
      return false;
    } finally {
      clearTimeout(timer);
      if (run === sequence) { active = null; publish(); }
    }
  }
  function reset() { cancel(); messages = []; publish(); }
  refresh();
  return { send, refresh, reset, cancel,
    stop: () => cancel({ keepRetry: true }),
    retry: () => { refresh(); const input = retry; if (input) { messages = messages.filter(row => !['error', 'stopped'].includes(row.state)); return send(input); } }
  };
}
