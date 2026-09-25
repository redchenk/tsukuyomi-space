<script setup>
defineProps({ feedback: { type: Object, default: null } });
</script>

<template>
  <div
    v-if="feedback && feedback.status !== 'approved'"
    class="moderation-notice"
    :class="{ 'is-rejected': feedback.status === 'rejected' }"
    :role="feedback.status === 'rejected' ? 'alert' : 'status'"
    aria-live="polite"
    aria-atomic="true"
  >
    <strong>{{ feedback.status === 'rejected' ? '未能提交' : '已提交，等待人工审核' }}</strong>
    <small v-if="feedback.basis">{{ feedback.basis }}</small>
    <ul v-if="feedback.reasons?.length">
      <li v-for="reason in feedback.reasons" :key="reason.code">{{ reason.message }}</li>
    </ul>
    <p>{{ feedback.nextStep }}</p>
    <RouterLink v-if="feedback.status === 'pending'" to="/user-center">查看我的留言与评论</RouterLink>
  </div>
</template>

<style scoped>
.moderation-notice {
  margin-block: 14px;
  padding: 14px 16px;
  border: 1px solid var(--ts-border, rgba(130, 110, 180, .25));
  border-inline-start: 3px solid var(--ts-accent, #8870c6);
  border-radius: 12px;
  background: var(--ts-editorial-surface-soft, rgba(130, 110, 180, .08));
  color: var(--ts-text, inherit);
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.moderation-notice strong, .moderation-notice small { display: block; }
.moderation-notice ul { margin: 8px 0; padding-inline-start: 20px; }
.moderation-notice p { margin: 6px 0; }
.moderation-notice a { color: var(--ts-accent, #8870c6); text-decoration: underline; }
.moderation-notice.is-rejected { border-inline-start-color: var(--ts-danger, #bd527e); }
</style>
