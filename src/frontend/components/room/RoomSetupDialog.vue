<script setup>
import { useModalDialog } from '../../composables/useModalDialog';
import TsIcon from '../TsIcon.vue';
const props = defineProps({ open: Boolean });
const emit = defineEmits(['close', 'configure']);
const modal = useModalDialog(() => props.open);
</script>

<template>
  <Teleport to="body">
    <dialog v-if="open" ref="modal" class="room-setup-dialog" aria-labelledby="room-setup-title" aria-describedby="room-setup-description" @cancel.prevent="emit('close')" @click.self="emit('close')">
      <div class="room-setup-content">
        <TsIcon name="message" :size="32" />
        <h2 id="room-setup-title">先为八千代选择一个聊天模型</h2>
        <p id="room-setup-description">还没有配置聊天 API。前往房间设置，选择「站内直供」即可使用网站账号和余额，也可以连接自己的云端 API 或本机 Ollama。</p>
        <p class="room-setup-hint">完成配置前不会发送聊天请求或产生模型费用。</p>
        <div class="room-setup-actions">
          <button type="button" class="primary-btn" @click="emit('configure')">去配置聊天模型 <TsIcon name="arrowRight" :size="16" /></button>
          <button type="button" class="ghost-btn" @click="emit('close')">稍后设置</button>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.room-setup-dialog { width: min(480px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); padding: 0; border: 1px solid var(--line, #d8cfe4); border-radius: 24px; color: var(--text, #342a42); background: var(--surface, #fffafc); box-shadow: 0 24px 80px #26143538; }
.room-setup-dialog::backdrop { background: #21132c70; backdrop-filter: blur(6px); }
.room-setup-content { padding: 30px; }
h2 { margin: 16px 0 12px; font-size: 21px; line-height: 1.5; }
p { margin: 0; line-height: 1.85; overflow-wrap: anywhere; }
.room-setup-hint { margin-top: 10px; color: var(--muted, #786783); font-size: 13px; }
.room-setup-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.room-setup-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; }
@media (max-width: 480px) { .room-setup-content { padding: 24px; } .room-setup-actions { flex-direction: column; } }
</style>
