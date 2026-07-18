<script setup>
import { computed } from 'vue';
import akiraSource from '../data/wiki-sources/akira.mediawiki?raw';
import irohaSource from '../data/wiki-sources/iroha.mediawiki?raw';
import kaguyaSource from '../data/wiki-sources/kaguya.mediawiki?raw';
import mamiSource from '../data/wiki-sources/mami.mediawiki?raw';
import noiSource from '../data/wiki-sources/noi.mediawiki?raw';
import raiSource from '../data/wiki-sources/rai.mediawiki?raw';
import rokaSource from '../data/wiki-sources/roka.mediawiki?raw';
import yachiyoSource from '../data/wiki-sources/yachiyo.mediawiki?raw';
import { parseKaguyaMediaWiki, parseMediaWikiArticle } from '../utils/mediaWikiArticle';

const props = defineProps({
  sourceKey: { type: String, required: true }
});

const sourceMap = {
  akira: akiraSource,
  iroha: irohaSource,
  kaguya: kaguyaSource,
  mami: mamiSource,
  noi: noiSource,
  rai: raiSource,
  roka: rokaSource,
  yachiyo: yachiyoSource
};

const article = computed(() => props.sourceKey === 'kaguya'
  ? parseKaguyaMediaWiki(sourceMap[props.sourceKey])
  : parseMediaWikiArticle(sourceMap[props.sourceKey] || ''));
const visibleSections = computed(() => article.value.sections.filter((section) => section.id !== 'source-notes'));
</script>

<template>
  <section id="source-profile" class="wiki-entry-section wiki-source-profile" tabindex="-1">
    <div class="wiki-entry-section-title"><span>00</span><h2>基本资料（源条目）</h2></div>
    <dl>
      <template v-for="row in article.profileRows" :key="`${row.label}-${row.valueHtml}`">
        <div v-if="row.group" class="wiki-source-profile-group">{{ row.label }}</div>
        <div v-else class="wiki-source-profile-row">
          <dt>{{ row.label }}</dt>
          <dd v-html="row.valueHtml"></dd>
        </div>
      </template>
    </dl>
  </section>

  <section
    v-for="(section, index) in visibleSections"
    :id="section.id"
    :key="section.id"
    class="wiki-entry-section wiki-source-section"
    tabindex="-1"
  >
    <div class="wiki-entry-section-title"><span>{{ String(index + 1).padStart(2, '0') }}</span><h2>{{ section.title }}</h2></div>
    <div class="wiki-source-content" v-html="section.html"></div>
  </section>
</template>
