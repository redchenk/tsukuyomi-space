<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { authFetch, parseResponse } from '../api/client';
const state = reactive({ items: [], total: 0, page: 1, totalPages: 1 });
const filter = reactive({ status: 'pending', search: '' });
const settings = reactive({ registrationOpen: true, joinUrl: '', confirmPublished: false });
const loading = ref(true), busy = ref(false), authorized = ref(false), error = ref(''), message = ref('');
let disposed = false;
const labels = { pending: '待处理', invited: '已发邀请' };
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
    const [list, config] = await Promise.all([request(`?${query(page)}`), request('/settings')]);
    if (!disposed) { Object.assign(state,list); Object.assign(settings,config,{ confirmPublished:false }); authorized.value = true; }
  } catch (cause) { if (!disposed) { error.value = cause.message; state.items = []; authorized.value = false; } }
  finally { if (!disposed) { busy.value = false; loading.value = false; } }
}
async function action(fn, success) {
  if (busy.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try { await fn(); if (!disposed) { message.value = success; busy.value = false; await load(state.page); } }
  catch (cause) { if (!disposed) error.value = cause.message; }
  finally { if (!disposed) busy.value = false; }
}
function mark(item, status) {
  if (status === 'invited' && !window.confirm(`确认已向 ${item.email} 实际发送测试邀请？这不会把对方标为已加入 Google 测试。`)) return;
  return action(() => request(`/${item.id}/status`, { status, confirmSent: status === 'invited' }), '邀请处理状态已更新');
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
    const blob = await response.blob();
    if (disposed) return;
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
    <header><p class="apply-eyebrow">TSUKUYOMI · TEST APPLICATIONS</p><h1>Google Play 测试申请</h1><p class="apply-lead">只有超级管理员可以查看邮箱。此处管理报名与邀请记录，实际测试资格和连续天数以 Play Console 为准。</p><RouterLink to="/terminal">返回数据终端</RouterLink> · <RouterLink to="/apply">打开公开报名页</RouterLink></header>
    <p v-if="loading" role="status">正在读取申请…</p><p v-if="error" class="apply-error" role="alert">{{ error }}</p><p v-if="message" class="apply-note" role="status">{{ message }}</p>
    <p v-if="!loading && !authorized">请先在<RouterLink to="/terminal">数据终端</RouterLink>登录超级管理员账号，再返回本页。<button class="apply-button" :disabled="busy" @click="load()">重试</button></p>
    <template v-if="authorized">
      <details class="play-admin-config"><summary>报名开关与测试链接</summary><form @submit.prevent="action(() => request('/settings', settings), '报名设置已保存')"><label class="apply-check"><input v-model="settings.registrationOpen" type="checkbox" :disabled="busy"><span>开放报名</span></label><label for="join-url">Google Play 封闭测试加入链接（未就绪时留空）</label><input id="join-url" v-model="settings.joinUrl" type="url" maxlength="300" :disabled="busy" placeholder="https://play.google.com/apps/testing/…"><label v-if="settings.joinUrl" class="apply-check"><input v-model="settings.confirmPublished" type="checkbox" :disabled="busy" required><span>我已在 Play Console 确认封闭测试版本发布、测试名单已配置，并验证此链接可用。</span></label><p class="apply-hint">保存链接后，公开教程会显示“已收到邀请？打开加入页”。它不会自动把报名者加进 Google 名单。</p><button class="apply-button" :disabled="busy" type="submit">保存设置</button></form></details>
      <form class="play-admin-actions" @submit.prevent="load(1)"><label>状态<select v-model="filter.status" :disabled="busy"><option value="pending">待处理</option><option value="invited">已发邀请</option><option value="all">全部</option></select></label><label>邮箱 / 设备<input v-model="filter.search" maxlength="100" :disabled="busy" type="search"></label><button class="apply-button" :disabled="busy" type="submit">查询</button><button class="apply-button" :disabled="busy" type="button" @click="download">导出筛选邮箱</button><span>共 {{ state.total }} 条</span></form>
      <p class="apply-hint">先导入 Google Play 封闭测试名单、确认链接可用，再通过邮件发送邀请。本站“已发邀请”仅为人工记录，不代表对方已加入测试。删除资料时，还需核对并清理已导出的 CSV、Google 名单及留存副本。</p>
      <div class="play-admin-list"><p v-if="!state.items.length && !busy">暂无此条件的申请。</p><article v-for="item in state.items" :key="item.id"><h2>{{ item.email }} · {{ labels[item.status] }}</h2><p>{{ item.device || '未填写设备' }} · {{ item.android_version || '未填写 Android 版本' }}</p><p>申请时间：{{ new Date(item.created_at).toLocaleString('zh-CN') }} · 同意说明版本：{{ item.consent_version }}</p><div class="play-admin-actions"><button class="apply-button" :disabled="busy" @click="mark(item, item.status === 'pending' ? 'invited' : 'pending')">{{ item.status === 'pending' ? '登记已发邀请' : '改回待处理' }}</button><button class="apply-button" :disabled="busy" @click="remove(item)">删除申请资料</button></div></article></div>
      <nav class="play-admin-actions" aria-label="申请分页"><button class="apply-button" :disabled="busy || state.page <= 1" @click="load(state.page - 1)">上一页</button><span>{{ state.page }} / {{ state.totalPages }}</span><button class="apply-button" :disabled="busy || state.page >= state.totalPages" @click="load(state.page + 1)">下一页</button></nav>
    </template>
  </div></main>
</template>
