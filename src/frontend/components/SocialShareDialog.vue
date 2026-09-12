<script setup>
import { nextTick, ref, watch } from 'vue';
import SocialShareActions from './SocialShareActions.vue';
import TsIcon from './TsIcon.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  url: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  downloadUrl: { type: String, default: '' },
  downloadName: { type: String, default: 'tsukuyomi-share.png' },
  lang: { type: String, default: 'zh' }
});

const emit = defineEmits(['close']);
const closeButton = ref(null);
const heading = () => props.lang === 'en' ? 'Share' : props.lang === 'ja' ? '共有' : '分享';

watch(() => props.open, async (open) => {
  if (!open) return;
  await nextTick();
  closeButton.value?.focus();
});

function onKeydown(event) {
  if (event.key === 'Escape') emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="social-share-overlay" role="presentation" @click.self="emit('close')" @keydown="onKeydown">
      <section class="social-share-dialog" data-material="popover" role="dialog" aria-modal="true" :aria-labelledby="'social-share-title'">
        <header>
          <div>
            <span>TSUKUYOMI SHARE</span>
            <h2 id="social-share-title">{{ heading() }}</h2>
          </div>
          <button ref="closeButton" class="social-share-close" type="button" aria-label="关闭" @click="emit('close')">
            <TsIcon name="x" :size="18" />
          </button>
        </header>
        <img v-if="imageUrl" class="social-share-preview" :src="imageUrl" :alt="title" loading="eager" decoding="async">
        <div class="social-share-copy">
          <strong>{{ title }}</strong>
          <p v-if="text">{{ text }}</p>
        </div>
        <SocialShareActions
          :title="title"
          :text="text"
          :url="url"
          :image-url="imageUrl"
          :download-url="downloadUrl"
          :download-name="downloadName"
          :lang="lang"
        />
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.social-share-overlay {
  position: fixed;
  inset: 0;
  z-index: 1600;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(4, 10, 22, 0.62);
}

.social-share-dialog {
  width: min(560px, 100%);
  max-height: min(760px, calc(100dvh - 2rem));
  overflow: auto;
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid rgba(218, 239, 255, 0.18);
  border-radius: 18px;
  color: var(--ts-text, #eef7ff);
  background: rgba(20, 30, 54, 0.92);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(24px) saturate(1.15);
}

.social-share-dialog header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.social-share-dialog header span {
  color: rgba(174, 242, 255, 0.7);
  font-size: 0.7rem;
  font-weight: 900;
}

.social-share-dialog h2 { margin: 0.12rem 0 0; font-size: 1.18rem; }
.social-share-close { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid rgba(218, 239, 255, 0.16); border-radius: 14px; color: inherit; background: rgba(255, 255, 255, 0.07); cursor: pointer; }
.social-share-preview { display: block; width: 100%; max-height: 300px; object-fit: contain; border-radius: 12px; background: rgba(0, 0, 0, 0.18); }
.social-share-copy { min-width: 0; display: grid; gap: 0.3rem; }
.social-share-copy strong, .social-share-copy p { overflow-wrap: anywhere; }
.social-share-copy p { margin: 0; color: rgba(231, 249, 255, 0.68); font-size: 0.86rem; line-height: 1.55; }

@media (max-width: 480px) {
  .social-share-overlay { align-items: end; padding: 0; }
  .social-share-dialog { max-height: 88dvh; border-radius: 18px 18px 0 0; padding: 0.9rem; }
}
</style>
