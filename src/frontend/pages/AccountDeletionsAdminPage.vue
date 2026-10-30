<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { deletionRequest } from '../services/account-deletion';
const state = reactive({ items: [], page: 1, totalPages: 1, total: 0 });
const status = ref('pending'), busy = ref(false), error = ref(''), drafts = reactive({});
let epoch = 0;
const labels = { pending: '待核验', processing: '处理中', completed: '已完成', cancelled: '已撤回' };
const checks = { identity: '已通过绑定邮箱核验身份和范围', balance: '已核对余额、订单、退款或法定留存', content: '已清理公开文章、评论、作品与关联', privateData: '已清理聊天、记忆、日记、登录绑定及账号', storage: '已清理附件、对象版本及 CDN 缓存', processors: '已处理向量库、独立 API 服务及第三方副本', backups: '已清理或隔离备份，并登记恢复后重新删除安排', notification: '已向核验邮箱发送完成回执及必要留存范围、依据和期限' };
async function load(page = 1) {
  const current = ++epoch; busy.value = true; error.value = ''; state.items = [];
  try { const data = await deletionRequest(`/api/admin/account-deletions?status=${status.value}&page=${page}`); if (current === epoch) Object.assign(state, data); }
  catch (cause) { if (current === epoch) error.value = cause.message; }
  finally { if (current === epoch) busy.value = false; }
}
function draft(id) { return drafts[id] ||= { checklist: {}, resolution: '' }; }
async function update(item, next) {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try { await deletionRequest(`/api/admin/account-deletions/${item.id}/status`, { status: next, ...draft(item.id) }); await load(state.page); }
  catch (cause) { error.value = cause.message; }
  finally { busy.value = false; }
}
onMounted(() => load()); onUnmounted(() => { epoch++; });
</script>
<template>
  <main class="page privacy-page">
    <header class="privacy-heading"><span class="eyebrow">TSUKUYOMI · PRIVATE REQUESTS</span><h1>注销申请工作台</h1><p>仅超级管理员可查看。核验后按清单处理；“开始处理”不会删除用户，“完成”也不会代替实际清理。</p><RouterLink to="/admin">返回管理中心</RouterLink></header>
    <div class="privacy-actions"><label>申请状态 <select v-model="status" :disabled="busy" @change="load(1)"><option v-for="(label, value) in labels" :key="value" :value="value">{{ $ui(label) }}</option></select></label><button class="ghost-btn" :disabled="busy" @click="load(state.page)">刷新</button><span>共 {{ state.total }} 条</span></div>
    <p v-if="error" class="form-message error" role="alert">{{ error }}</p><p v-if="busy" role="status">正在处理…</p><p v-else-if="!state.items.length && !error">暂无此状态的申请。</p>
    <section v-for="item in state.items" :key="item.id" class="panel privacy-section">
      <h2>{{ item.username || '账号已移除' }} · {{ $ui(labels[item.status]) }}</h2><p>编号：<code>{{ item.id }}</code></p><p>核验邮箱：{{ item.email || '请查阅受控处理回执' }}</p><p>收到：{{ item.requested_at.slice(0, 10) }} · 预计处理：{{ item.due_at.slice(0, 10) }} <strong v-if="['pending','processing'].includes(item.status) && Date.parse(item.due_at) < Date.now()">（已逾期，请优先联系）</strong></p>
      <button v-if="item.status === 'pending'" class="primary-btn" :disabled="busy" @click="update(item, 'processing')">开始核验处理</button>
      <template v-if="item.status === 'processing'">
        <p>先保存受控的数据清理清单，再删除账号；原有“删除用户”操作不代表关联内容、存储及备份已清理。不要在下方填写密码、密钥、身份证或聊天内容。</p>
        <label v-for="(label, key) in checks" :key="key" class="privacy-confirm"><input v-model="draft(item.id).checklist[key]" type="checkbox" :disabled="busy"><span>{{ $ui(label) }}</span></label>
        <label :for="`resolution-${item.id}`">处理回执摘要（至少 10 字，保留依据与期限，不含敏感原文）</label><textarea :id="`resolution-${item.id}`" v-model="draft(item.id).resolution" maxlength="2000" :disabled="busy" />
        <p v-if="item.user_id">账号仍存在，清理前无法登记完成。</p><button class="primary-btn" :disabled="busy || !!item.user_id || !Object.keys(checks).every(k => draft(item.id).checklist[k]) || draft(item.id).resolution.trim().length < 10" @click="update(item, 'completed')">登记已核验完成</button>
      </template><p v-else-if="item.resolution">{{ item.resolution }}</p>
    </section>
    <nav class="privacy-actions" aria-label="分页"><button class="ghost-btn" :disabled="busy || state.page <= 1" @click="load(state.page - 1)">上一页</button><span>{{ state.page }} / {{ state.totalPages }}</span><button class="ghost-btn" :disabled="busy || state.page >= state.totalPages" @click="load(state.page + 1)">下一页</button></nav>
  </main>
</template>
