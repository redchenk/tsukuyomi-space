<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { authFetch, parseResponse } from '../api/client';
import { useModalDialog } from '../composables/useModalDialog';
import { uiText } from '../i18n/runtime';
const state = reactive({ items: [], total: 0, page: 1, totalPages: 1 });
const filter = reactive({ status: 'all', search: '' });
const settings = reactive({ registrationOpen: true, joinUrl: '', confirmPublished: false });
const loading = ref(true), busy = ref(false), authorized = ref(false), error = ref(''), message = ref('');
const invitation = ref(null), confirmed = ref(false), sending = ref(false), inviteError = ref('');
const invitationUrl = ref(''), savedInvitationUrl = ref(''), previewUrl = ref(''), savingLink = ref(false);
const previewChanged = computed(() => previewUrl.value.trim() !== invitation.value?.actionUrl);
const dialog = useModalDialog(() => Boolean(invitation.value));
let disposed = false;
const labels = { pending: '待处理', invited: '已发邀请' };
const deliveryLabels = { sending: '正在发送', sent: '邮件服务已接收', failed: '发送失败', unknown: '发送结果待核实' };
async function request(path = '', data, method = 'POST') {
  const response = await authFetch(`/api/admin/play-testing${path}`, { cache: 'no-store', ...(data === undefined ? {} : { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(data) }) });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || '操作失败，请重试');
  return result.data;
}
function query(page = state.page) { return new URLSearchParams({ ...filter, search: filter.search.trim(), page }); }
async function load(page = 1) {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try {
    const [list, config, mailSettings] = await Promise.all([request(`?${query(page)}`), request('/settings'), request('/invitation-settings')]);
    if (!disposed) { Object.assign(state,list); Object.assign(settings,config,{ confirmPublished:false }); invitationUrl.value = savedInvitationUrl.value = mailSettings.actionUrl; authorized.value = true; }
  } catch (cause) { if (!disposed) { error.value = cause.message; state.items = []; authorized.value = false; } }
  finally { if (!disposed) { busy.value = false; loading.value = false; } }
}
async function action(fn, success) {
  if (busy.value || sending.value || savingLink.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try { await fn(); if (!disposed) { message.value = success; busy.value = false; await load(state.page); } }
  catch (cause) { if (!disposed) error.value = cause.message; }
  finally { if (!disposed) busy.value = false; }
}
async function preview(item) {
  if (busy.value || sending.value || savingLink.value) return;
  busy.value = true; error.value = ''; inviteError.value = ''; confirmed.value = false;
  try { const value = await request(`/${item.id}/invitation-preview`); if (!disposed) { invitation.value = value; previewUrl.value = value.actionUrl; } }
  catch (cause) { if (!disposed) error.value = cause.message; }
  finally { if (!disposed) busy.value = false; }
}
function closePreview() { if (!sending.value && !savingLink.value) invitation.value = null; }
async function saveInvitationLink(fromPreview = false) {
  if (busy.value || sending.value || savingLink.value) return;
  savingLink.value = true; error.value = ''; inviteError.value = ''; confirmed.value = false;
  try {
    await request('/invitation-settings', { actionUrl: fromPreview ? previewUrl.value : invitationUrl.value, previousActionUrl: fromPreview ? invitation.value.actionUrl : savedInvitationUrl.value });
    if (disposed) return;
    if (fromPreview) {
      const value = await request(`/${invitation.value.applicationId}/invitation-preview`);
      if (disposed) return;
      invitation.value = value; previewUrl.value = value.actionUrl;
    }
    message.value = uiText('邀请邮件链接已保存，后续邀请将使用此链接。');
    await load(state.page);
  } catch (cause) { if (!disposed) { if (fromPreview) inviteError.value = cause.message; else error.value = cause.message; } }
  finally { if (!disposed) savingLink.value = false; }
}
async function sendInvitation() {
  if (!invitation.value || !confirmed.value || sending.value || savingLink.value || previewChanged.value) return;
  const value = invitation.value;
  sending.value = true; inviteError.value = ''; message.value = '';
  try {
    const result = await request(`/${value.applicationId}/invite`, { confirmation: 'SEND_PLAY_INVITATION', confirmTesterAdded: true, email: value.email, version: value.version, attemptId: value.attemptId, previousAttemptId: value.previousAttemptId });
    if (!disposed) {
      invitation.value = null;
      message.value = result.alreadySent ? uiText('这封邀请已经发送，本次未重复发送。') : result.delivery.result;
      await load(state.page);
    }
  } catch (cause) {
    if (!disposed) {
      // The HTTP reply can be lost after SMTP accepted the message. Consult
      // the durable delivery state before making another send available.
      inviteError.value = cause.message;
      try { invitation.value = await request(`/${value.applicationId}/invitation-preview`); previewUrl.value = invitation.value.actionUrl; confirmed.value = false; }
      catch { invitation.value = null; error.value = cause.message; }
      await load(state.page);
    }
  } finally { if (!disposed) sending.value = false; }
}
function remove(item) {
  if (!window.confirm(`永久删除 ${item.email} 的申请及设备信息？请先核验申请人的删除请求，或确认这是无效记录。此操作不会退出 Google Play。`)) return;
  return action(() => request(`/${item.id}`, { confirmation:'DELETE_APPLICATION' }, 'DELETE'), '申请资料已删除；已导出的名单与 Google Play 名单请同步处理');
}
async function download() {
  if (busy.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try {
    const response = await authFetch(`/api/admin/play-testing/export?${query()}`, { cache:'no-store' });
    if (!response.ok) throw new Error((await parseResponse(response)).message || '导出失败');
    const blob = await response.blob(); if (disposed) return;
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'google-play-testers.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.value = '已导出当前筛选的邮箱（无表头、无 BOM）。导入 Play Console 会覆盖所选名单，操作前请检查是否包含已有测试者。';
  } catch (cause) { if (!disposed) error.value = cause.message; }
  finally { if (!disposed) busy.value = false; }
}
onMounted(() => load()); onUnmounted(() => { disposed = true; });
</script>
<template>
  <main class="page apply-page"><div class="apply-container">
    <header><p class="apply-eyebrow">TSUKUYOMI · TEST APPLICATIONS</p><h1>Google Play 测试申请</h1><p class="apply-lead">只有超级管理员可以查看邮箱。发送邀请邮件后自动登记；Google 实际测试资格以 Play Console 为准。</p><RouterLink to="/terminal">返回数据终端</RouterLink> · <RouterLink to="/apply">打开公开报名页</RouterLink></header>
    <p v-if="loading" role="status">正在读取申请…</p><p v-if="error" class="apply-error" role="alert">{{ error }}</p><p v-if="message" class="apply-note" role="status">{{ message }}</p>
    <p v-if="!loading && !authorized">请先在<RouterLink to="/terminal">数据终端</RouterLink>登录超级管理员账号，再返回本页。<button class="apply-button" :disabled="busy" @click="load()">重试</button></p>
    <template v-if="authorized">
      <form class="play-invitation-settings" @submit.prevent="saveInvitationLink()">
        <label for="invitation-url">邀请邮件链接</label>
        <input id="invitation-url" v-model="invitationUrl" type="url" maxlength="300" required :disabled="busy || savingLink" placeholder="https://play.google.com/apps/testing/…">
        <p class="apply-hint">支持 Google Play 内部测试链接或本应用的封闭测试加入链接。保存后用于后续邀请，邮件文案会同步切换；保存本身不会发送邮件。</p>
        <button class="apply-button" type="submit" :disabled="busy || savingLink || invitationUrl.trim() === savedInvitationUrl">{{ savingLink ? '正在保存…' : '保存邀请链接' }}</button>
      </form>
      <p class="apply-note play-invitation-note">发送前请将收件邮箱加入该链接对应的 Google Play 测试名单，并确认版本已发布、链接可用。内部测试不计入封闭测试的连续 14 天。</p>
      <details class="play-admin-config"><summary>报名开关与封闭测试公开链接</summary><form @submit.prevent="action(() => request('/settings', settings), '报名设置已保存')"><label class="apply-check"><input v-model="settings.registrationOpen" type="checkbox" :disabled="busy"><span>开放报名</span></label><label for="join-url">Google Play 封闭测试加入链接（未就绪时留空）</label><input id="join-url" v-model="settings.joinUrl" type="url" maxlength="300" :disabled="busy" placeholder="https://play.google.com/apps/testing/…"><label v-if="settings.joinUrl" class="apply-check"><input v-model="settings.confirmPublished" type="checkbox" :disabled="busy" required><span>我已在 Play Console 确认封闭测试版本发布、测试名单已配置，并验证此链接可用。</span></label><p class="apply-hint">此设置只控制公开报名页的封闭测试入口，邀请邮件链接请在上方单独设置。</p><button class="apply-button" :disabled="busy" type="submit">保存设置</button></form></details>
      <form class="play-admin-actions" @submit.prevent="load(1)"><label>状态<select v-model="filter.status" :disabled="busy"><option value="pending">待处理</option><option value="invited">已发邀请</option><option value="all">全部</option></select></label><label>邮箱 / 设备<input v-model="filter.search" maxlength="100" :disabled="busy" type="search"></label><button class="apply-button" :disabled="busy" type="submit">查询</button><button class="apply-button" :disabled="busy" type="button" @click="download">导出筛选邮箱</button><span>共 {{ state.total }} 条</span></form>
      <div class="play-admin-list"><p v-if="!state.items.length && !busy">暂无此条件的申请。</p><article v-for="item in state.items" :key="item.id">
        <h2>{{ item.email }} · {{ uiText(labels[item.status]) }}</h2><p>{{ item.device || '未填写设备' }} · {{ item.android_version || '未填写 Android 版本' }}</p><p>申请时间：{{ new Date(item.created_at).toLocaleString('zh-CN') }} · 同意说明版本：{{ item.consent_version }}</p>
        <p v-if="item.delivery" class="play-delivery-state">{{ uiText(deliveryLabels[item.delivery.status]) }} · {{ item.delivery.result }}<template v-if="item.delivery.sent_at"> · {{ new Date(item.delivery.sent_at).toLocaleString('zh-CN') }}</template></p>
        <p v-else-if="item.previousDelivery" class="apply-hint">此前邀请使用其他链接：<a :href="item.previousDelivery.action_url" target="_blank" rel="noopener noreferrer">{{ item.previousDelivery.action_url }}</a> · {{ uiText(deliveryLabels[item.previousDelivery.status]) }}</p>
        <p v-else-if="item.status === 'invited'" class="apply-hint">此前仅登记了邀请状态，本站没有这封邀请的发送记录。</p>
        <div class="play-admin-actions"><button class="apply-button" :disabled="busy || sending || savingLink || ['sending','unknown'].includes(item.delivery?.status)" @click="preview(item)">{{ item.delivery?.status === 'sent' ? '查看已发送邀请' : item.delivery?.status === 'failed' ? '重试发送邀请' : item.previousDelivery ? '发送当前链接邀请' : item.status === 'invited' ? '补发邀请邮件' : '发送邀请邮件并登记' }}</button><button class="apply-button" :disabled="busy || sending || savingLink || item.delivery?.status === 'sending'" @click="remove(item)">删除申请资料</button></div>
      </article></div>
      <nav class="play-admin-actions" aria-label="申请分页"><button class="apply-button" :disabled="busy || state.page <= 1" @click="load(state.page - 1)">上一页</button><span>{{ state.page }} / {{ state.totalPages }}</span><button class="apply-button" :disabled="busy || state.page >= state.totalPages" @click="load(state.page + 1)">下一页</button></nav>
    </template>
  </div></main>
  <Teleport to="body"><dialog v-if="invitation" ref="dialog" class="play-invitation-dialog apply-page" aria-labelledby="invite-title" @cancel.prevent="closePreview">
    <div class="play-invitation-heading"><h2 id="invite-title">确认测试邀请邮件</h2><button data-modal-close class="apply-button" :disabled="sending || savingLink" @click="closePreview">关闭</button></div>
    <p>收件邮箱：<strong>{{ invitation.email }}</strong></p><p>主题：{{ invitation.subject }}</p>
    <form class="play-invitation-settings" @submit.prevent="saveInvitationLink(true)">
      <label for="preview-invitation-url">邀请链接</label>
      <input id="preview-invitation-url" v-model="previewUrl" type="url" maxlength="300" required :disabled="sending || savingLink" @input="confirmed = false; inviteError = ''">
      <p class="apply-hint">保存后会更新当前预览，并用于后续邀请邮件。已发送的邮件保持原链接。</p>
      <button class="apply-button" type="submit" :disabled="sending || savingLink || !previewChanged">保存链接并更新预览</button>
    </form>
    <p v-if="previewChanged" class="apply-note" role="status">链接尚未保存，请先保存并检查更新后的邮件预览。</p>
    <p class="apply-note">{{ invitation.track === 'internal' ? '内部测试邀请 · 不计入封闭测试的连续 14 天' : '封闭测试邀请 · 曾加入内部测试的用户需先退出内部测试' }}</p>
    <p><a :href="invitation.actionUrl" target="_blank" rel="noopener noreferrer">{{ invitation.actionUrl }}</a></p>
    <iframe title="测试邀请邮件预览" :srcdoc="invitation.html" sandbox="" referrerpolicy="no-referrer"></iframe>
    <p v-if="inviteError" role="alert" class="apply-error">{{ inviteError }}</p>
    <p v-if="invitation.delivery && ['sent','sending','unknown'].includes(invitation.delivery.status)" role="status" class="apply-note">{{ uiText(deliveryLabels[invitation.delivery.status]) }} · {{ invitation.delivery.result }}。不会重复发送。</p>
    <template v-else>
      <p v-if="!invitation.configured" role="alert" class="apply-error">邮件通道未配置，暂时无法发送。</p>
      <label class="apply-check"><input v-model="confirmed" type="checkbox" :disabled="sending || savingLink || previewChanged || !invitation.configured"><span>我已将此邮箱加入该链接对应的 Google Play 测试名单，确认向该邮箱发送以上邀请。</span></label>
      <button class="apply-button" :disabled="sending || savingLink || previewChanged || !confirmed || !invitation.configured" @click="sendInvitation">{{ sending ? '正在发送邀请…' : '确认发送邀请邮件' }}</button>
      <p class="apply-fine">邮件服务接收后自动登记为已发邀请，不代表用户已读或已加入测试。</p>
    </template>
  </dialog></Teleport>
</template>
