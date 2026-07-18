<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import KaguyaSourceArticle from '../components/KaguyaSourceArticle.vue';
import TsIcon from '../components/TsIcon.vue';
import {
  entrySongs,
  getWikiEntry,
  relatedWikiEntries,
  wikiEntryPath
} from '../data/cosmicKaguyaWikiEntries';

const props = defineProps({
  kind: { type: String, required: true },
  slug: { type: String, required: true }
});

const entry = computed(() => getWikiEntry(props.kind, props.slug));
const related = computed(() => relatedWikiEntries(entry.value));
const songs = computed(() => entrySongs(entry.value));
const activeImageVariantId = ref(null);
const imageVariants = computed(() => entry.value?.imageVariants || []);
const activeImage = computed(() => {
  if (!entry.value) return null;
  const variant = imageVariants.value.find((item) => item.id === activeImageVariantId.value) || imageVariants.value[0];
  return variant || {
    image: entry.value.image,
    imageAlt: entry.value.imageAlt,
    imageLayout: entry.value.imageLayout,
    imageSource: entry.value.imageSource
  };
});
const sectionLinks = computed(() => {
  if (!entry.value) return [];
  const links = entry.value.sourceSectionLinks
    ? [...entry.value.sourceSectionLinks]
    : entry.value.sections.map((section, index) => ({ id: `section-${index + 1}`, label: section[0] }));
  if (!entry.value.sourceArticle && entry.value.spoiler.length) links.push({ id: 'spoiler', label: '剧透经历' });
  if (related.value.length) links.push({ id: 'related', label: '关联词条' });
  if (entry.value.kind === 'character') links.push({ id: 'moegirl', label: '萌娘百科' });
  else links.push({ id: 'gallery', label: '图片资料' });
  links.push({ id: 'sources', label: '资料来源' });
  return links;
});

function applyEntrySeo() {
  if (!entry.value) {
    document.title = '词条未找到 | 超辉夜姬！Wiki';
    return;
  }
  document.title = `${entry.value.title} - ${entry.value.kindLabel} | 超辉夜姬！Wiki`;
  const description = document.querySelector('meta[name="description"]');
  description?.setAttribute('content', entry.value.headline);
}

function scrollToSection(id, event) {
  event?.preventDefault();
  const target = document.getElementById(id);
  if (!target) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.history.replaceState(null, '', `#${id}`);
  target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  nextTick(() => target.focus({ preventScroll: true }));
}

function focusInitialHash() {
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  if (!id) return;
  const target = document.getElementById(id);
  if (target) window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}

watch(entry, () => {
  activeImageVariantId.value = entry.value?.imageVariants?.[0]?.id || null;
  applyEntrySeo();
  nextTick(focusInitialHash);
}, { immediate: true });

onMounted(() => {
  document.body.classList.add('wiki-entry-open');
  focusInitialHash();
});

onUnmounted(() => document.body.classList.remove('wiki-entry-open'));
</script>

<template>
  <main class="page wiki-entry-page">
    <div v-if="entry" class="wiki-entry-shell">
      <nav class="wiki-entry-breadcrumb" aria-label="面包屑导航">
        <RouterLink to="/wiki">超辉夜姬！Wiki</RouterLink>
        <TsIcon name="arrowRight" :size="14" />
        <span>{{ entry.kindLabel }}</span>
        <TsIcon name="arrowRight" :size="14" />
        <strong>{{ entry.title }}</strong>
      </nav>

      <header class="wiki-entry-hero" data-material="content">
        <div class="wiki-entry-hero-copy">
          <p>{{ entry.kind === 'character' ? 'CHARACTER ARCHIVE' : 'TSUKUYOMI GLOSSARY' }}</p>
          <span v-if="!entry.sourceArticle">{{ entry.kindLabel }}</span>
          <h1>{{ entry.title }}</h1>
          <div class="wiki-entry-original">{{ entry.original }}</div>
          <p class="wiki-entry-headline">{{ entry.headline }}</p>
          <div class="wiki-entry-tags"><span v-for="tag in entry.tags" :key="tag">{{ tag }}</span></div>
        </div>
        <figure
          class="wiki-entry-hero-visual"
          :class="`wiki-entry-image-${activeImage?.imageLayout?.mode || 'placeholder'}`"
          :style="{
            '--entry-image-ratio': activeImage?.imageLayout?.ratio || '4 / 5',
            '--entry-image-fit': activeImage?.imageLayout?.fit || 'cover',
            '--entry-image-position': activeImage?.imageLayout?.position || 'center center'
          }"
        >
          <div v-if="imageVariants.length > 1" class="wiki-entry-image-variants" role="group" aria-label="辉夜形象切换">
            <button
              v-for="variant in imageVariants"
              :key="variant.id"
              type="button"
              :aria-pressed="activeImageVariantId === variant.id"
              @click="activeImageVariantId = variant.id"
            >
              {{ variant.label }}
            </button>
          </div>
          <div class="wiki-entry-image-frame">
            <img v-if="activeImage?.image" :key="activeImage.image" :src="activeImage.image" :alt="activeImage.imageAlt">
            <div v-else class="wiki-entry-image-placeholder" role="img" :aria-label="`${entry.title}图片预留位置`">
              <TsIcon :name="entry.kind === 'character' ? 'user' : 'image'" :size="38" />
              <strong>{{ entry.title }} · 图片预留</strong>
              <span>{{ entry.imageSuggestion }}</span>
              <code>{{ entry.imageTarget }}</code>
            </div>
          </div>
          <figcaption v-if="activeImage?.imageSource && !entry.sourceArticle">
            图源：{{ activeImage.imageSource.title }}<template v-if="activeImage.imageSource.page"> 第 {{ activeImage.imageSource.page }} 页</template>
          </figcaption>
        </figure>
      </header>

      <div class="wiki-entry-layout" :class="{ 'wiki-entry-layout-source': entry.sourceArticle }">
        <aside class="wiki-entry-toc" data-material="sidebar">
          <strong>本页目录</strong>
          <nav aria-label="词条目录">
            <a v-for="(link, index) in sectionLinks" :key="link.id" :href="`#${link.id}`" @click="scrollToSection(link.id, $event)">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>{{ link.label }}
            </a>
          </nav>
          <RouterLink class="wiki-entry-back" to="/wiki"><TsIcon name="arrowLeft" :size="15" /> 返回 Wiki 总览</RouterLink>
        </aside>

        <article class="wiki-entry-article" data-material="content">
          <div v-if="!entry.sourceArticle" class="wiki-entry-notice" role="note">
            <TsIcon name="note" :size="20" />
            <p>本页参考官方资料与萌娘百科式信息结构重新撰写，不复制原条目文案。中文译名和社区资料均以来源说明为准。</p>
          </div>

          <KaguyaSourceArticle v-if="entry.sourceArticle" :source-key="entry.sourceArticle" />
          <template v-else>
            <section
              v-for="([title, paragraphs], index) in entry.sections"
              :id="`section-${index + 1}`"
              :key="title"
              class="wiki-entry-section"
              tabindex="-1"
            >
              <div class="wiki-entry-section-title"><span>{{ String(index + 1).padStart(2, '0') }}</span><h2>{{ title }}</h2></div>
              <p v-for="paragraph in paragraphs" :key="paragraph">{{ paragraph }}</p>
            </section>

            <section v-if="entry.spoiler.length" id="spoiler" class="wiki-entry-section" tabindex="-1">
              <div class="wiki-entry-section-title"><span>!</span><h2>剧透经历</h2></div>
              <details class="wiki-entry-spoiler">
                <summary><TsIcon name="shield" :size="18" /> 展开身份与结局相关内容</summary>
                <div><strong>严重剧透警告</strong><p v-for="paragraph in entry.spoiler" :key="paragraph">{{ paragraph }}</p></div>
              </details>
            </section>
          </template>

          <section v-if="related.length || songs.length" id="related" class="wiki-entry-section" tabindex="-1">
            <div class="wiki-entry-section-title"><span>∞</span><h2>关联词条</h2></div>
            <div class="wiki-entry-related-grid">
              <RouterLink v-for="item in related" :key="`${item.kind}-${item.slug}`" :to="wikiEntryPath(item.kind, item.slug)">
                <small>{{ item.kind === 'character' ? '角色' : '名词' }}</small>
                <strong>{{ item.label }}</strong>
                <TsIcon name="arrowRight" :size="15" />
              </RouterLink>
            </div>
            <div v-if="songs.length" class="wiki-entry-song-list">
              <h3>关联音乐</h3>
              <div v-for="song in songs" :key="song.id"><strong>{{ song.title }}</strong><span>{{ song.creator }}</span></div>
            </div>
          </section>

          <section v-if="entry.kind === 'character'" id="moegirl" class="wiki-entry-section wiki-entry-moegirl-section" tabindex="-1">
            <div class="wiki-entry-section-title"><span>↗</span><h2>外部百科</h2></div>
            <a
              class="wiki-entry-moegirl-card"
              :href="entry.moegirl.url"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`跳转至萌娘百科：${entry.title}`"
            >
              <span class="wiki-entry-moegirl-icon"><TsIcon name="book" :size="32" /></span>
              <span class="wiki-entry-moegirl-copy">
                <small>MOEGIRL ENCYCLOPEDIA</small>
                <strong>跳转至萌娘百科</strong>
                <span>{{ entry.moegirl.standalone ? `打开${entry.title}的独立角色词条` : '该角色暂无独立词条，打开作品“主要角色”目录' }}</span>
              </span>
              <span class="wiki-entry-moegirl-action">新标签打开 <TsIcon name="external" :size="17" /></span>
            </a>
          </section>

          <section v-else id="gallery" class="wiki-entry-section" tabindex="-1">
            <div class="wiki-entry-section-title"><span>▣</span><h2>图片资料</h2></div>
            <p class="wiki-entry-gallery-intro">以下位置为图片资料槽。没有权利清晰素材时保留占位，后续只需替换文件并在数据中填写路径。</p>
            <div class="wiki-entry-gallery">
              <div v-for="slot in entry.gallerySlots" :key="slot.label" class="wiki-entry-gallery-slot">
                <TsIcon name="image" :size="28" />
                <strong>{{ slot.label }}</strong>
                <span>{{ slot.suggestion }}</span>
                <small>等待补充授权清晰的图片</small>
              </div>
            </div>
          </section>

          <section id="sources" class="wiki-entry-section" tabindex="-1">
            <div class="wiki-entry-section-title"><span>※</span><h2>资料来源与编辑说明</h2></div>
            <ul class="wiki-entry-sources">
              <li v-for="source in entry.sourceLinks" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.label }} <TsIcon name="external" :size="14" /></a></li>
            </ul>
            <p class="wiki-entry-source-note">核验日期：{{ entry.verifiedAt }}。图片、截图与角色立绘的著作权归原权利方；上传替换素材前需确认使用条件并补充逐图来源。</p>
          </section>
        </article>

        <aside v-if="!entry.sourceArticle" class="wiki-entry-infobox" data-material="sidebar" aria-label="词条基本资料">
          <div><small>BASIC PROFILE</small><strong>基本资料</strong></div>
          <dl>
            <div><dt>名称</dt><dd>{{ entry.title }}</dd></div>
            <div><dt>原名／别名</dt><dd>{{ entry.aliases.join('／') }}</dd></div>
            <div v-for="([label, value]) in entry.facts" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
          </dl>
          <span>非官方粉丝整理</span>
        </aside>
      </div>
    </div>

    <section v-else class="wiki-entry-not-found" data-material="content">
      <TsIcon name="search" :size="42" />
      <h1>没有找到这个词条</h1>
      <p>链接可能已更名，或者词条仍在整理中。</p>
      <RouterLink to="/wiki">返回超辉夜姬！Wiki</RouterLink>
    </section>
  </main>
</template>
