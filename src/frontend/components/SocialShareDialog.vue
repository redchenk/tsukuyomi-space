<script setup>
import MobileSheet from './MobileSheet.vue';
import SocialShareActions from './SocialShareActions.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  returnFocus: Object,
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  url: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  downloadUrl: { type: String, default: '' },
  downloadName: { type: String, default: 'tsukuyomi-share.png' },
  lang: { type: String, default: 'zh' }
});

const emit = defineEmits(['close']);
const heading = () => props.lang === 'en' ? 'Share' : props.lang === 'ja' ? '共有' : '分享';

</script>

<template>
  <Teleport to="body">
    <MobileSheet :open="open" :return-focus="returnFocus" class="social-share-sheet" :title="heading()" @close="emit('close')">
      <section class="social-share-dialog">
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
    </MobileSheet>
  </Teleport>
</template>

<style scoped>
.social-share-dialog { display: grid; gap: 16px; color: var(--ink); }
.social-share-preview { display: block; width: 100%; height: 160px; object-fit: contain; border-radius: 12px; background: var(--soft); }
.social-share-copy { min-width: 0; display: grid; gap: 6px; }
.social-share-copy strong, .social-share-copy p { overflow-wrap: anywhere; }
.social-share-copy p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.65; }
@media (max-width: 480px) {
  .social-share-preview { height: 120px; }
  .social-share-copy p { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
}
</style>
