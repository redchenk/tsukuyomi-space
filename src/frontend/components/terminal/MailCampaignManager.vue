<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import TerminalPagination from './TerminalPagination.vue';
import { formatDateTime } from '../../utils/time';

const props = defineProps({ request: { type: Function, required: true }, revision: { type: Number, default: 0 } });
const form = reactive({ subject: '', body: '', actionUrl: '', actionLabel: '查看详情' });
const filter = reactive({ search: '', role: 'all' });
const mode = ref('selected'), selected = ref({}), users = ref({ items: [], total: 0, page: 1, totalPages: 1 });
const configured = ref(false), loading = ref(true), searching = ref(false), preparing = ref(false), sending = ref(false);
const error = ref(''), message = ref(''), previewError = ref(''), preview = ref(null), dialog = ref(null);
const history = ref([]), detail = ref(null), detailPage = ref(1), historyError = ref('');
let searchTimer, pollTimer, sequence = 0, detailSequence = 0, disposed = false, polling = false, pendingPreview;
const request = (path = '', options) => props.request(`/mail-campaigns${path}`, options);
const selectedUsers = computed(() => Object.values(selected.value));
const count = computed(() => mode.value === 'filtered' ? users.value.total : selectedUsers.value.length);
const inProgress = campaign => ['queued', 'running'].includes(campaign.status) || campaign.counts.sending > 0;
const statusText = status => ({ draft: '待确认', queued: '排队中', running: '发送中', completed: '已结束', cancelled: '已取消', pending: '待发送', sending: '发送中', sent: '已提交邮件服务', failed: '发送失败', unknown: '待核实', skipped: '已跳过' }[status] || status);
const date = value => formatDateTime(new Date(value).toISOString(), 'zh-CN');
const completedCount = campaign => campaign.total - campaign.counts.pending - campaign.counts.sending;
const audienceText = campaign => campaign.audience.mode === 'selected' ? '手动勾选用户' : `匹配用户 · ${campaign.audience.search || '全部用户'} · ${{ all: '所有角色', user: '普通用户', admin: '管理员' }[campaign.audience.role]}`;

async function loadUsers(page = 1) {
  const current = ++sequence;
  searching.value = true;
  try {
    const result = await request(`/recipients?${new URLSearchParams({ ...filter, page })}`);
    if (!disposed && current === sequence) users.value = result;
  } catch (cause) { if (!disposed && current === sequence) error.value = cause.message; }
  finally { if (!disposed && current === sequence) searching.value = false; }
}
function toggleUser(user, checked) {
  const next = { ...selected.value };
  if (checked) next[user.id] = user; else delete next[user.id];
  selected.value = next;
}
async function loadHistory() {
  const result = await request();
  if (disposed) return;
  configured.value = result.configured;
  history.value = result.campaigns;
  historyError.value = '';
}
async function loadDetail(id, page = 1) {
  const current = ++detailSequence;
  try {
    const result = await request(`/${id}?page=${page}`);
    if (!disposed && current === detailSequence) { detail.value = result; detailPage.value = page; }
  } catch (cause) { if (!disposed && current === detailSequence) historyError.value = cause.message; }
}
async function refresh() {
  loading.value = true; error.value = '';
  try { await Promise.all([loadHistory(), loadUsers(users.value.page)]); }
  catch (cause) { if (!disposed) error.value = cause.message; }
  finally { if (!disposed) loading.value = false; }
}
async function prepare() {
  if (preparing.value || searching.value || !count.value) return;
  preparing.value = true; error.value = ''; previewError.value = ''; message.value = '';
  const audience = mode.value === 'filtered' ? { mode: mode.value, ...filter } : { mode: mode.value, userIds: Object.keys(selected.value) };
  const payload = { ...form, audience };
  const fingerprint = JSON.stringify(payload);
  if (pendingPreview?.fingerprint !== fingerprint) pendingPreview = { fingerprint, id: crypto.randomUUID() };
  try {
    const result = await request('/preview', { method: 'POST', body: JSON.stringify({ ...payload, id: pendingPreview.id }) });
    if (disposed) return;
    preview.value = result;
    await nextTick();
    dialog.value?.showModal();
  } catch (cause) { if (!disposed) error.value = cause.message; }
  finally { if (!disposed) preparing.value = false; }
}
function closePreview() {
  if (sending.value) return;
  dialog.value?.close(); preview.value = null; pendingPreview = null;
}
async function send() {
  if (sending.value || !preview.value) return;
  sending.value = true; previewError.value = '';
  try {
    const campaign = await request(`/${preview.value.campaign.id}/send`, { method: 'POST', body: '{}' });
    if (disposed) return;
    message.value = `已提交 ${campaign.total} 个邮箱，发送将在后台继续，可在下方查看进度。`;
    dialog.value?.close(); preview.value = null; pendingPreview = null;
    await loadDetail(campaign.id);
    try { await loadHistory(); } catch (cause) { historyError.value = cause.message; }
  } catch (cause) { if (!disposed) previewError.value = `${cause.message}。可再次点击确认，重复确认不会重复发送本批邮件。`; }
  finally { if (!disposed) sending.value = false; }
}
async function cancel(campaign) {
  try {
    await request(`/${campaign.id}/cancel`, { method: 'POST', body: '{}' });
    message.value = '已停止尚未开始的邮件，正在发送的邮件会记录最终结果。';
    await loadHistory();
    if (detail.value?.campaign.id === campaign.id) await loadDetail(campaign.id, detailPage.value);
  } catch (cause) { error.value = cause.message; }
}
watch(filter, () => {
  clearTimeout(searchTimer); sequence++; searching.value = true;
  searchTimer = setTimeout(() => loadUsers(1), 250);
});
watch(() => props.revision, refresh);
onMounted(() => {
  refresh();
  pollTimer = setInterval(async () => {
    if (polling || disposed || !(history.value.some(inProgress) || (detail.value && inProgress(detail.value.campaign)))) return;
    polling = true;
    try {
      await loadHistory();
      if (detail.value) await loadDetail(detail.value.campaign.id, detailPage.value);
    } catch (cause) { if (!disposed) historyError.value = `进度刷新失败：${cause.message}`; }
    finally { polling = false; }
  }, 4000);
});
onUnmounted(() => { disposed = true; sequence++; detailSequence++; clearTimeout(searchTimer); clearInterval(pollTimer); });
</script>

<template>
  <div class="terminal-mail" :aria-busy="loading">
    <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
    <p v-if="message" class="form-message success" role="status">{{ message }}</p>
    <p v-if="loading" role="status">正在读取邮件通道与用户…</p>
    <p v-else class="terminal-mail-channel" :class="{ missing: !configured }">{{ configured ? '邮件通道已就绪 · 使用网站统一邮件样式' : '邮件通道未配置，仍可编辑和预览，配置完成后才能发送。' }}</p>

    <form class="terminal-mail-compose" @submit.prevent="prepare">
      <fieldset class="terminal-mail-card" :disabled="preparing || sending">
        <legend>1 · 选择收件人</legend>
        <div class="terminal-mail-modes">
          <label><input v-model="mode" type="radio" value="selected" name="mail-audience">勾选用户</label>
          <label><input v-model="mode" type="radio" value="filtered" name="mail-audience">群发给全部匹配用户</label>
        </div>
        <div class="terminal-mail-filters">
          <label>搜索用户<input v-model="filter.search" type="search" maxlength="120" placeholder="昵称、用户名、邮箱或 ID"></label>
          <label>用户角色<select v-model="filter.role"><option value="all">所有角色</option><option value="user">普通用户</option><option value="admin">管理员</option></select></label>
        </div>
        <p class="terminal-mail-note">仅显示已绑定有效邮箱的用户；相同邮箱只发送一封。</p>
        <div class="terminal-mail-recipient-summary" role="status">
          <span>{{ searching ? '正在搜索…' : `匹配 ${users.total} 名用户` }} · {{ mode === 'selected' ? `已勾选 ${count} 人` : '将发送给全部匹配用户，包含其他分页' }}</span>
          <button v-if="mode === 'selected'" type="button" class="ghost-btn" :disabled="searching || !users.items.length" @click="users.items.forEach(user => toggleUser(user, true))">勾选本页</button>
        </div>
        <div class="terminal-mail-recipients" :aria-busy="searching">
          <label v-for="user in users.items" :key="user.id" class="terminal-mail-recipient">
            <input v-if="mode === 'selected'" type="checkbox" :checked="Boolean(selected[user.id])" :aria-label="`选择 ${user.email}`" :disabled="searching" @change="toggleUser(user, $event.target.checked)">
            <span><strong>{{ user.nickname || user.username }}</strong><small>{{ user.email }}</small></span><small>{{ user.role === 'admin' ? '管理员' : '用户' }}</small>
          </label>
          <p v-if="!searching && !users.items.length" class="terminal-empty">没有匹配的收件用户</p>
        </div>
        <TerminalPagination :current="users.page" :total-pages="users.totalPages" :total-items="users.total" :page-size="8" item-label="名用户" aria-label="收件用户分页" @change="loadUsers" />
        <details v-if="mode === 'selected' && selectedUsers.length" class="terminal-mail-selected">
          <summary>已勾选 {{ selectedUsers.length }} 人（跨页保留）</summary>
          <button type="button" class="ghost-btn" @click="selected = {}">清空选择</button>
          <div v-for="user in selectedUsers" :key="user.id"><span>{{ user.email }}</span><button type="button" class="ghost-btn" :aria-label="`移除 ${user.email}`" @click="toggleUser(user, false)">移除</button></div>
        </details>
      </fieldset>

      <fieldset class="terminal-mail-card terminal-mail-editor" :disabled="preparing || sending">
        <legend>2 · 撰写邮件</legend>
        <label>邮件主题<input v-model="form.subject" required maxlength="120" placeholder="例如：月读空间本周更新"></label>
        <label>邮件正文<textarea v-model="form.body" required maxlength="10000" rows="12" placeholder="写下想告诉用户的内容，支持分段与换行。"></textarea><small>{{ form.body.length }} / 10000</small></label>
        <div class="terminal-mail-filters">
          <label>按钮链接（选填）<input v-model="form.actionUrl" maxlength="1000" placeholder="本站路径，例如 /stage"></label>
          <label>按钮文字<input v-model="form.actionLabel" maxlength="30" placeholder="查看详情"></label>
        </div>
        <p class="terminal-mail-note">主题、正文和按钮均可自定义；正文按文本呈现，保留换行。邮件自动使用网站统一横幅和卡片样式。</p>
        <button class="primary-btn" type="submit" :disabled="loading || searching || !count || preparing || sending">{{ preparing ? '正在生成预览…' : '预览并确认收件人' }}</button>
      </fieldset>
    </form>

    <section class="terminal-mail-card terminal-mail-history" aria-labelledby="mail-history-title">
      <div class="terminal-mail-section-title"><h2 id="mail-history-title">发送记录</h2><button class="ghost-btn" type="button" @click="refresh">刷新记录</button></div>
      <p class="terminal-mail-note">显示最近 30 批邮件。“已提交”表示邮件服务接收，不代表已进入收件箱；结果待核实的邮件不会自动重发。</p>
      <p v-if="historyError" class="form-message error" role="alert">{{ historyError }}</p>
      <p v-if="!history.length" class="terminal-empty">还没有发送记录</p>
      <article v-for="campaign in history" :key="campaign.id" class="terminal-mail-history-row">
        <div><strong>{{ campaign.subject }}</strong><small>{{ date(campaign.createdAt) }} · {{ audienceText(campaign) }}</small><small>{{ statusText(campaign.status) }} · {{ completedCount(campaign) }}/{{ campaign.total }} · 已提交 {{ campaign.counts.sent }} · 失败 {{ campaign.counts.failed }} · 待核实 {{ campaign.counts.unknown }} · 跳过 {{ campaign.counts.skipped }} · 取消 {{ campaign.counts.cancelled }}</small><progress :max="campaign.total" :value="completedCount(campaign)">发送进度</progress></div>
        <div class="terminal-mail-row-actions"><button class="ghost-btn" type="button" @click="loadDetail(campaign.id)">查看明细</button><button v-if="['queued', 'running'].includes(campaign.status)" class="danger-btn" type="button" @click="cancel(campaign)">停止剩余发送</button></div>
      </article>
      <section v-if="detail" class="terminal-mail-detail" aria-label="发送明细">
        <div class="terminal-mail-section-title"><h3>{{ detail.campaign.subject }} · 发送明细</h3><button class="ghost-btn" type="button" @click="detailSequence++; detail = null">收起</button></div>
        <div v-for="recipient in detail.recipients" :key="recipient.email" class="terminal-mail-detail-row"><span>{{ recipient.email }}</span><span>{{ statusText(recipient.status) }}<small v-if="recipient.result">{{ recipient.result }}</small></span></div>
        <TerminalPagination :current="detailPage" :total-pages="Math.ceil(detail.campaign.total / 20)" :total-items="detail.campaign.total" :page-size="20" item-label="个邮箱" aria-label="发送明细分页" @change="loadDetail(detail.campaign.id, $event)" />
      </section>
    </section>

    <dialog v-if="preview" ref="dialog" class="terminal-mail-dialog" aria-labelledby="mail-preview-title" @cancel.prevent="closePreview">
      <div class="terminal-mail-section-title"><h2 id="mail-preview-title">确认邮件与收件人</h2><button class="ghost-btn" type="button" :disabled="sending" @click="closePreview">返回编辑</button></div>
      <p><strong>本批将发送给 {{ preview.campaign.total }} 个邮箱</strong> · {{ audienceText(preview.campaign) }}</p>
      <details><summary>查看收件邮箱{{ preview.campaign.total > 20 ? '（前 20 个）' : '' }}</summary><p v-for="recipient in preview.recipients" :key="recipient.email">{{ recipient.email }}</p></details>
      <iframe title="邮件样式预览" :srcdoc="preview.html" sandbox="" referrerpolicy="no-referrer"></iframe>
      <p class="terminal-mail-note">每位收件人收到独立邮件，不会看到其他人的邮箱。确认后后台继续发送，关闭页面不影响进度。</p>
      <p v-if="previewError" class="form-message error" role="alert">{{ previewError }}</p>
      <p v-if="!configured" class="form-message error">邮件通道未配置，暂时无法发送。</p>
      <button class="primary-btn" type="button" :disabled="sending || !configured" @click="send">{{ sending ? '正在提交…' : `确认发送给 ${preview.campaign.total} 个邮箱` }}</button>
    </dialog>
  </div>
</template>

<style scoped>
.terminal-mail { display:grid; gap:20px; min-width:0; }
.terminal-mail-compose { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:20px; align-items:start; }
.terminal-mail-card { min-width:0; margin:0; border:1px solid var(--ts-border-soft, #ddd); border-radius:18px; padding:20px; background:var(--ts-editorial-surface, #fff); }
.terminal-mail-card legend { padding:0 8px; font-weight:700; font-size:16px; }
.terminal-mail-modes,.terminal-mail-section-title,.terminal-mail-recipient-summary { display:flex; align-items:center; flex-wrap:wrap; gap:12px; justify-content:space-between; }
.terminal-mail-modes label { display:flex; align-items:center; gap:7px; }
.terminal-mail input[type=checkbox],.terminal-mail input[type=radio] { width:17px; height:17px; flex:none; accent-color:var(--ts-accent); }
.terminal-mail-filters { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr); gap:12px; margin:16px 0; }
.terminal-mail-editor,.terminal-mail-filters label { display:grid; gap:12px; }
.terminal-mail-editor>label { display:grid; gap:8px; }
.terminal-mail input:not([type=checkbox]):not([type=radio]),.terminal-mail textarea,.terminal-mail select { width:100%; min-width:0; box-sizing:border-box; padding:11px 12px; border:1px solid var(--ts-border-soft, #ddd); border-radius:10px; background:var(--ts-input-bg, #fff); color:inherit; font:inherit; }
.terminal-mail textarea { resize:vertical; line-height:1.7; }
body .page.terminal-page .terminal-mail textarea { border-radius:12px; font-weight:400; }
.terminal-mail-note,.terminal-mail small { color:var(--ts-text-secondary, #706b72); font-size:12px; line-height:1.7; }
.terminal-mail-channel { margin:0; font-size:13px; color:var(--ts-status-success); }
.terminal-mail-channel.missing { color:var(--ts-text-secondary); }
.terminal-mail-recipient-summary { font-size:12px; margin:14px 0 6px; }
.terminal-mail-recipient { display:flex; align-items:center; gap:10px; padding:11px 0; border-bottom:1px solid var(--ts-border-soft, #ddd); }
.terminal-mail-recipient>span { display:grid; min-width:0; flex:1; overflow-wrap:anywhere; }
.terminal-mail-recipient strong { font-size:13px; }
.terminal-mail-recipient small { overflow-wrap:anywhere; }
.terminal-mail-selected { margin-top:14px; }
.terminal-mail-selected>div { display:flex; justify-content:space-between; align-items:center; gap:8px; overflow-wrap:anywhere; font-size:12px; }
.terminal-mail-selected>div span { min-width:0; }
.terminal-mail-section-title h2,.terminal-mail-section-title h3 { margin:0; font-size:17px; overflow-wrap:anywhere; }
.terminal-mail-history-row { display:flex; justify-content:space-between; gap:16px; align-items:center; border-top:1px solid var(--ts-border-soft, #ddd); padding:18px 0; }
.terminal-mail-history-row>div:first-child { display:grid; gap:6px; min-width:0; flex:1; overflow-wrap:anywhere; }
.terminal-mail-row-actions { display:flex; gap:8px; flex-wrap:wrap; }
.terminal-mail progress { width:100%; height:6px; accent-color:var(--ts-accent); }
.terminal-mail-detail { margin-top:12px; border-top:1px solid var(--ts-border-soft, #ddd); padding-top:18px; }
.terminal-mail-detail-row { display:flex; gap:20px; justify-content:space-between; padding:12px 0; font-size:13px; border-bottom:1px solid var(--ts-border-soft, #ddd); overflow-wrap:anywhere; }
.terminal-mail-detail-row>span { min-width:0; }
.terminal-mail-detail-row small { display:block; }
.terminal-mail-dialog { box-sizing:border-box; width:min(780px, calc(100vw - 24px)); max-height:calc(100dvh - 32px); padding:24px; border:1px solid var(--ts-border-soft, #ddd); border-radius:20px; background:var(--ts-editorial-surface, #fff); color:var(--ts-text-primary, #25304a); overflow:auto; }
.terminal-mail-dialog::backdrop { background:rgba(20,27,39,.55); }
.terminal-mail-dialog p { line-height:1.7; overflow-wrap:anywhere; }
.terminal-mail-dialog iframe { width:100%; height:560px; border:0; margin:16px 0 0; background:#f7f9fc; border-radius:12px; }
.terminal-mail-dialog details { font-size:13px; }
@media(max-width:1100px) { .terminal-mail-compose { grid-template-columns:1fr; } }
@media(max-width:600px) { .terminal-mail-card { padding:14px; } .terminal-mail-filters { grid-template-columns:1fr; } .terminal-mail-history-row { align-items:stretch; flex-direction:column; } .terminal-mail-dialog { padding:16px; } .terminal-mail-detail-row { flex-direction:column; gap:4px; } }
</style>
