<script setup>
import { useModalDialog } from '../../composables/useModalDialog';
import TsIcon from '../TsIcon.vue';
const props = defineProps({ open: Boolean, configured: Boolean, completed: Boolean });
const emit = defineEmits(['close', 'go', 'chat', 'diary']);
const modal = useModalDialog(() => props.open);
const features = [
  { path: '/game', title: '游戏中心', icon: 'play', description: '和八千代下一局五子棋，或挑战辉夜快跑。' },
  { path: '/live2d', title: 'Live2D 舞台', icon: 'sparkles', description: '先试表情和动作，无需聊天模型；AI 演出与语音另行配置。' },
  { path: '/plaza', title: '月读广场', icon: 'message', description: '看看同好在聊什么，登录后留言、回复或参与话题。' },
  { path: '/wiki', title: '作品百科', icon: 'book', description: '查找角色、故事与音乐，继续回味作品。' },
  { path: '/gallery', title: '公开图库', icon: 'image', description: '浏览大家分享的图片，找到喜欢的作品。' },
  { path: '/growth', title: '月契成长', icon: 'heart', description: '查看签到、任务与等级；这里的等级与日记好感度分开记录。' }
];
</script>

<template>
  <Teleport to="body">
    <dialog v-if="open" ref="modal" class="room-help-dialog" aria-labelledby="room-help-title" @cancel.prevent="emit('close')" @click.self="emit('close')">
      <header><div><small>月读空间 · 随时可以回来看看</small><h2 id="room-help-title">开始使用与发现功能</h2></div><button type="button" class="ghost-btn" aria-label="关闭使用指南" @click="emit('close')"><TsIcon name="x" :size="20" /></button></header>
      <section aria-labelledby="room-first-chat-title">
        <h3 id="room-first-chat-title">先和八千代说句话</h3>
        <ol>
          <li><strong>选择聊天服务</strong><span>使用站内账号与可用余额，或连接自己的云端／本机模型。</span></li>
          <li><strong>测试连接并保存</strong><span>测试通过后保存。测试会调用所选服务，可能产生用量；语音和其他设置可以稍后再做。</span></li>
          <li><strong>回到聊天，发送一句话</strong><span>收到完整回复，才算完成首次对话。没有声音时也可以继续文字聊天。</span></li>
        </ol>
        <p class="room-help-status" role="status">{{ completed ? '你已完成一轮对话，可以继续聊天或探索下面的功能。' : configured ? '聊天设置已填写，接下来发送一句话，确认能收到回复。' : '还没有完成聊天设置，先跟着步骤连接一个模型。' }}</p>
        <div class="room-help-actions"><button class="primary-btn" type="button" @click="configured ? emit('chat') : emit('go', '/room/settings?setup=1')">{{ configured ? '去说第一句话' : '开始分步配置' }}</button><button class="ghost-btn" type="button" @click="emit('go', '/room/settings?setup=1')">查看配置步骤</button></div>
      </section>
      <section aria-labelledby="room-discover-title"><h3 id="room-discover-title">还可以做这些</h3>
        <div class="room-help-features"><a v-for="feature in features" :key="feature.path" :href="feature.path" @click.prevent="emit('go', feature.path)"><TsIcon :name="feature.icon" :size="20" /><strong>{{ feature.title }}</strong><span>{{ feature.description }}</span></a></div>
      </section>
      <details><summary>好感度为什么没有变化？</summary><p>好感度来自当前日记存档，不按发消息条数或点击角色次数自动增加。结束聊天并成功生成、保存日记后，会记录本次好感度；数值也可能保持不变。导入或同步其他存档后，显示值可能改变。</p><button class="ghost-btn" type="button" @click="emit('diary')">查看日记与当前存档</button></details>
      <details><summary>有文字，但角色没有反应？</summary><p>文字回复、角色动作和语音是分别运行的。先等角色加载完成，在舞台试一次“点头”；仍无反应时查看角色加载提示。只有开启并配置语音后才会发声，不是每条文字都会带动作。</p><a href="/live2d" @click.prevent="emit('go', '/live2d')">去舞台检查</a></details>
    </dialog>
  </Teleport>
</template>

<style scoped>
.room-help-dialog{width:min(680px,calc(100vw - 24px));max-height:calc(100dvh - 32px);box-sizing:border-box;overflow:auto;padding:24px;border:1px solid var(--line);border-radius:24px;background:var(--surface,#fffafc);color:var(--text,#342a42);box-shadow:0 24px 80px #26143538}
.room-help-dialog::backdrop{background:#21132c70;backdrop-filter:blur(6px)}
header{position:sticky;top:-24px;z-index:2;background:var(--surface,#fffafc);padding:12px 0;display:flex;align-items:start;justify-content:space-between;gap:12px}h2{font-size:21px;margin:6px 0 0}h3{font-size:16px;margin:0 0 12px}small,li span,.room-help-features span{color:var(--muted,#786783)}section{margin-top:24px}ol{padding-left:22px}li{padding:0 0 12px 4px}li strong,li span{display:block}p,li span{line-height:1.7;font-size:14px}.room-help-status{padding:12px;border-radius:12px;background:var(--surface-soft,#eee8f018)}.room-help-actions{display:flex;gap:10px;flex-wrap:wrap}.room-help-features{display:grid;grid-template-columns:1fr 1fr;gap:10px}.room-help-features a{display:grid;grid-template-columns:24px 1fr;gap:6px 10px;padding:14px;border:1px solid var(--line);border-radius:14px;color:inherit;text-decoration:none}.room-help-features span{grid-column:2;font-size:13px;line-height:1.6}details{margin-top:16px;padding:12px;border:1px solid var(--line);border-radius:12px}summary{cursor:pointer;line-height:1.6}button{min-height:44px}a:focus-visible,summary:focus-visible{outline:2px solid currentColor;outline-offset:3px}@media(max-width:480px){.room-help-dialog{padding:18px}.room-help-features{grid-template-columns:1fr}}
</style>
