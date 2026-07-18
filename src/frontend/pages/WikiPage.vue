<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import TsIcon from '../components/TsIcon.vue';
import { wikiEntryPath } from '../data/cosmicKaguyaWikiEntries';
import {
  boxOfficeMilestones,
  cast,
  characterGroups,
  characters,
  derivativeWorks,
  findTerm,
  infoRows,
  music,
  musicGroups,
  navigationGroups,
  quickEntries,
  references,
  spoilerSteps,
  staff,
  terms,
  timeline,
  tocEntries,
  verifiedAt
} from '../data/cosmicKaguyaWiki';

const activeSection = ref('overview');
const router = useRouter();
const searchQuery = ref('');
const activeCharacterGroup = ref('all');
const activeMusicGroup = ref('all');
const activeTerm = ref(null);
const topSentinel = ref(null);
const mobileToc = ref(null);
const showBackToTop = ref(false);
const termCloseButton = ref(null);
const termDrawer = ref(null);
let sectionObserver = null;
let topObserver = null;
let lastTermTrigger = null;
let previousBodyOverflow = '';

const normalizedSearch = computed(() => searchQuery.value.trim().toLocaleLowerCase());
const searchResults = computed(() => {
  const query = normalizedSearch.value;
  if (!query) return quickEntries.slice(0, 7);
  return quickEntries.filter((entry) => [entry.label, entry.meta, ...entry.keywords]
    .join(' ')
    .toLocaleLowerCase()
    .includes(query)).slice(0, 10);
});
const filteredCharacters = computed(() => activeCharacterGroup.value === 'all'
  ? characters
  : characters.filter((character) => character.groups.includes(activeCharacterGroup.value)));
const filteredMusic = computed(() => activeMusicGroup.value === 'all'
  ? music
  : music.filter((song) => song.category === activeMusicGroup.value));

function setActiveSection(id) {
  activeSection.value = id;
}

function openTerm(id, event) {
  const entry = findTerm(id);
  if (!entry) return;
  lastTermTrigger = event?.currentTarget || document.activeElement;
  activeTerm.value = entry;
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  nextTick(() => termCloseButton.value?.focus());
}

function closeTerm() {
  activeTerm.value = null;
  document.body.style.overflow = previousBodyOverflow;
  nextTick(() => lastTermTrigger?.focus?.());
}

function closeTermAndGo(event) {
  event?.preventDefault();
  const targetId = activeTerm.value?.target;
  activeTerm.value = null;
  document.body.style.overflow = previousBodyOverflow;
  if (targetId) nextTick(() => goToEntry(targetId));
}

function handleKeydown(event) {
  if (event.key === 'Escape' && activeTerm.value) closeTerm();
  if (event.key !== 'Tab' || !activeTerm.value || !termDrawer.value) return;
  const focusable = Array.from(termDrawer.value.querySelectorAll('a[href], button:not([disabled])'));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function goToEntry(targetId, event) {
  event?.preventDefault();
  const target = document.getElementById(targetId);
  if (!target) return;
  if (mobileToc.value) mobileToc.value.open = false;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.history.replaceState(null, '', `#${encodeURIComponent(targetId)}`);
  target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  nextTick(() => target.focus({ preventScroll: true }));
}

function scrollToTop() {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}

function openCharacterEntry(character, event) {
  if (event?.target?.closest?.('a, button')) return;
  router.push(wikiEntryPath('character', character.id.replace(/^entry-/, '')));
}

function scrollToInitialHash() {
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}

onMounted(() => {
  const sections = Array.from(document.querySelectorAll('[data-wiki-section]'));
  sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (visible[0]?.target?.id) activeSection.value = visible[0].target.id;
  }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.08, 0.25] });
  sections.forEach((section) => sectionObserver.observe(section));

  if (topSentinel.value) {
    topObserver = new IntersectionObserver(([entry]) => {
      showBackToTop.value = !entry.isIntersecting;
    }, { threshold: 0 });
    topObserver.observe(topSentinel.value);
  }

  document.addEventListener('keydown', handleKeydown);
  scrollToInitialHash();
});

onBeforeUnmount(() => {
  sectionObserver?.disconnect();
  topObserver?.disconnect();
  document.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <main id="wiki-main" class="page wiki-page">
    <a class="wiki-skip-link" href="#wiki-article">跳至 Wiki 正文</a>
    <span ref="topSentinel" class="wiki-top-sentinel" aria-hidden="true"></span>

    <div class="wiki-shell" :inert="activeTerm ? true : undefined">
      <header class="wiki-hero" data-material="content">
        <img
          class="wiki-hero-image"
          :src="'/assets/images/wiki/wiki-hero-original.webp'"
          width="1200"
          height="630"
          alt="原创月夜虚拟舞台插画：新月传送门与星空城市"
          fetchpriority="high"
          decoding="async"
        >
        <div class="wiki-hero-shade" aria-hidden="true"></div>
        <div class="wiki-hero-content">
          <p class="wiki-kicker">TSUKUYOMI ARCHIVE / FAN WIKI</p>
          <div class="wiki-title-row">
            <div>
              <h1>超辉夜姬！Wiki</h1>
              <p class="wiki-original-title">超かぐや姫！ · Cosmic Princess Kaguya!</p>
            </div>
            <span class="wiki-unofficial-badge">非官方粉丝整理</span>
          </div>
          <p class="wiki-hero-lead">从虹色电线杆到虚拟空间“月读”，在歌声、直播与跨越时间的回应中，重新阅读一则属于网络时代的辉夜姬传说。</p>
          <div class="wiki-hero-chips" aria-label="作品摘要">
            <span>原创动画电影</span>
            <span>2026</span>
            <span>音乐 × 科幻 × 青春</span>
          </div>
        </div>
      </header>

      <div class="wiki-layout">
        <aside class="wiki-left-column">
          <details ref="mobileToc" class="wiki-mobile-toc" data-material="content">
            <summary><TsIcon name="list" :size="18" /> 页面目录</summary>
            <nav aria-label="超辉夜姬 Wiki 移动目录">
              <a
                v-for="entry in tocEntries"
                :key="`mobile-${entry.id}`"
                :href="`#${entry.id}`"
                :aria-current="activeSection === entry.id ? 'location' : undefined"
                @click="setActiveSection(entry.id); mobileToc.open = false"
              >{{ entry.index }} {{ entry.label }}</a>
            </nav>
            <div class="wiki-mobile-search">
              <label for="wiki-mobile-search"><TsIcon name="search" :size="15" /> 词条速查</label>
              <input id="wiki-mobile-search" v-model="searchQuery" type="search" placeholder="角色、歌曲、术语…" autocomplete="off">
              <span class="wiki-search-status" aria-live="polite">{{ normalizedSearch ? `找到 ${searchResults.length} 个词条` : '输入关键词开始查找' }}</span>
              <div v-if="normalizedSearch" class="wiki-search-results">
                <RouterLink v-for="entry in searchResults.slice(0, 6)" :key="`mobile-search-${entry.id}`" :to="entry.route" @click="mobileToc.open = false">
                  <strong>{{ entry.label }}</strong>
                  <small>{{ entry.meta }}</small>
                </RouterLink>
                <p v-if="!searchResults.length">未找到匹配词条</p>
              </div>
            </div>
          </details>

          <div class="wiki-toc-panel" data-material="sidebar">
            <div class="wiki-panel-heading">
              <span>CONTENTS</span>
              <strong>词条目录</strong>
            </div>
            <nav class="wiki-toc" aria-label="超辉夜姬 Wiki 目录">
              <a
                v-for="entry in tocEntries"
                :key="entry.id"
                :href="`#${entry.id}`"
                :class="{ active: activeSection === entry.id }"
                :aria-current="activeSection === entry.id ? 'location' : undefined"
                @click="setActiveSection(entry.id)"
              ><span>{{ entry.index }}</span>{{ entry.label }}</a>
            </nav>

            <div class="wiki-quick-search">
              <label for="wiki-search"><TsIcon name="search" :size="15" /> 词条速查</label>
              <input id="wiki-search" v-model="searchQuery" type="search" placeholder="角色、歌曲、术语…" autocomplete="off">
              <span class="wiki-search-status" aria-live="polite">{{ normalizedSearch ? `找到 ${searchResults.length} 个词条` : '显示推荐词条' }}</span>
              <div class="wiki-search-results">
                <RouterLink v-for="entry in searchResults" :key="entry.id" :to="entry.route">
                  <strong>{{ entry.label }}</strong>
                  <small>{{ entry.meta }}</small>
                </RouterLink>
                <p v-if="!searchResults.length" role="status">未找到匹配词条</p>
              </div>
            </div>
          </div>
        </aside>

        <article id="wiki-article" class="wiki-article" data-material="content">
          <div class="wiki-notice" role="note">
            <div><span>粉丝整理</span><strong>非官方网站</strong></div>
            <p>正文为依据公开资料重新撰写的中文摘要，包含轻度剧透；完整结局默认折叠。页面标题依用户指定，角色中文名为本站通行译法，日文原名为准。资料核验至 {{ verifiedAt }}。</p>
            <a href="https://www.cho-kaguyahime.com/" target="_blank" rel="noopener noreferrer">官方网站 <TsIcon name="external" :size="15" /></a>
          </div>

          <section id="overview" class="wiki-section" data-wiki-section tabindex="-1">
            <div class="wiki-section-heading"><span>01</span><div><small>OVERVIEW</small><h2>本作介绍</h2></div></div>
            <p>《超かぐや姫！》是一部长篇原创动画电影，以古典<a class="wiki-text-link" href="#term-taketori">《竹取物语》</a>为母题，把“竹中诞生、迅速成长、月之迎接”移入稍近未来。17 岁的酒寄彩叶遇见从虹光电线杆中出现的辉夜，两人在<button class="wiki-term-link" type="button" @click="openTerm('tsukuyomi', $event)">虚拟空间“月读”</button>组成创作搭档：辉夜站上镜头前唱歌，彩叶则以制作人的身份写下旋律。</p>
            <p>作品将网络直播、虚拟偶像与 VOCALOID 创作文化写进人物关系，让“相遇与离别”不只发生在月球和地球之间，也发生在创作者与观众、现实身份与虚拟人格之间。动画由 STUDIO COLORIDO 与 STUDIO CHROMATO 制作，山下清悟执导。<sup><a href="#ref-official">[1]</a></sup></p>
            <p>本作于 2025 年 11 月首次公开预告与视觉图，2026 年 1 月由 Netflix 全球上线，并在同年 2 月进入日本院线、3 月扩大至全国上映。音乐创作阵容汇集 ryo（supercell）、kz（livetune）、40mP、HoneyWorks、Aqu3ra 与 yuigot，让网络音乐本身成为剧情推进的一部分。</p>
            <div class="wiki-work-highlights" aria-label="作品亮点">
              <div><span>叙事母题</span><strong>《竹取物语》的网络时代改写</strong></div>
              <div><span>核心舞台</span><strong>现实东京 × 虚拟空间“月读”</strong></div>
              <div><span>音乐阵容</span><strong>六组 VOCALOID 创作者参与</strong></div>
            </div>
            <ol class="wiki-timeline" aria-label="作品时间线">
              <li v-for="item in timeline" :key="item.date"><time>{{ item.date }}</time><div><strong>{{ item.label }}</strong><span>{{ item.detail }}</span></div></li>
            </ol>
          </section>

          <section id="story" class="wiki-section" data-wiki-section tabindex="-1">
            <div class="wiki-section-heading"><span>02</span><div><small>STORY</small><h2>故事简介</h2></div></div>
            <blockquote class="wiki-story-lede">梦与希望汇聚的虚拟空间“月读”。少女们的相遇，以及为离别而设的舞台，就此拉开序幕。</blockquote>
            <p>酒寄彩叶一边读书，一边打工负担自己的生活。她最放松的时刻，是进入月读观看月见八千代的直播，或在游戏中赚取一点收入。一次夜归，她遇见散发虹光的奇异电线杆，其中出现的婴儿转眼成长为与她年纪相仿的少女。</p>
            <p>彩叶称她为“辉夜”。向往好玩事物的辉夜决定成为主播，彩叶也重拾搁置的音乐才能。她们参加<button class="wiki-term-link" type="button" @click="openTerm('yachiyo-cup', $event)">八千代杯</button>、挑战<button class="wiki-term-link" type="button" @click="openTerm('black-onyx', $event)">Black onyX</button>，逐渐成为彼此不可替代的人。然而辉夜姬的故事始终绕不开回月之日：一首歌，能否抵达无法相见的时间？</p>

            <details class="wiki-spoiler">
              <summary><span><TsIcon name="shield" :size="19" /> 展开完整剧情与结局剧透</span><TsIcon class="wiki-spoiler-chevron" name="chevronDown" :size="18" /></summary>
              <div class="wiki-spoiler-warning"><strong>严重剧透警告</strong><span>以下内容揭示角色身份、离别、时间循环与最终结局。</span></div>
              <ol class="wiki-spoiler-steps">
                <li v-for="([title, detail], index) in spoilerSteps" :key="title"><span>{{ index + 1 }}</span><div><strong>{{ title }}</strong><p>{{ detail }}</p></div></li>
              </ol>
              <p class="wiki-analysis-note"><strong>考察边界：</strong>最后舞台中实体辉夜与虚拟八千代同时出现的机制存在不同理解，本页只描述演出表现，不将人格副本等二手推测写成官方设定。</p>
            </details>
          </section>

          <section id="characters" class="wiki-section" data-wiki-section tabindex="-1">
            <div class="wiki-section-heading"><span>03</span><div><small>CHARACTERS</small><h2>登场人物</h2></div></div>
            <div class="wiki-filter-bar" aria-label="角色筛选">
              <button
                v-for="group in characterGroups"
                :key="group.id"
                type="button"
                :aria-pressed="activeCharacterGroup === group.id"
                @click="activeCharacterGroup = group.id"
              >{{ group.label }}</button>
            </div>
            <p class="wiki-result-count" aria-live="polite">显示 {{ filteredCharacters.length }} 位角色</p>
            <div class="wiki-character-grid">
              <article
                v-for="character in filteredCharacters"
                :id="character.id"
                :key="character.id"
                class="wiki-character-card"
                role="link"
                tabindex="0"
                :aria-label="`查看${character.name}角色词条`"
                @click="openCharacterEntry(character, $event)"
                @keydown.enter.prevent="openCharacterEntry(character, $event)"
              >
                <img v-if="character.image" :src="character.image" width="160" height="160" :alt="character.imageAlt" loading="lazy" decoding="async">
                <div v-else class="wiki-character-placeholder" aria-hidden="true">{{ character.name.slice(0, 1) }}</div>
                <div class="wiki-character-copy">
                  <div class="wiki-character-title"><div><h3>{{ character.name }}</h3><span>{{ character.original }}</span></div><small>CV {{ character.cv }}</small></div>
                  <div class="wiki-tag-row"><span v-for="tag in character.tags" :key="tag">{{ tag }}</span></div>
                  <p>{{ character.description }}</p>
                  <div v-if="character.relatedTerms.length" class="wiki-related-links">
                    <span>相关：</span>
                    <button v-for="termId in character.relatedTerms" :key="termId" type="button" @click="openTerm(termId, $event)">{{ findTerm(termId)?.label }}</button>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section id="world" class="wiki-section" data-wiki-section tabindex="-1">
            <div class="wiki-section-heading"><span>04</span><div><small>GLOSSARY</small><h2>世界观与术语</h2></div></div>
            <p>点击正文中的蓝紫色词条可快速查看解释；这里保留完整词条位置，方便复制链接和交叉阅读。</p>
            <div class="wiki-term-grid">
              <article v-for="term in terms.filter((entry) => !entry.id.match(/remember|reply/))" :id="term.target" :key="term.id" class="wiki-term-card" tabindex="-1">
                <h3>{{ term.label }}</h3>
                <p>{{ term.summary }}</p>
                <div><span v-for="alias in term.aliases" :key="alias">{{ alias }}</span></div>
                <RouterLink class="wiki-entry-card-link" :to="wikiEntryPath('term', term.id)">查看独立词条 <TsIcon name="arrowRight" :size="14" /></RouterLink>
              </article>
            </div>
          </section>

          <section id="music" class="wiki-section" data-wiki-section tabindex="-1">
            <div class="wiki-section-heading"><span>05</span><div><small>MUSIC</small><h2>相关音乐</h2></div></div>
            <p>电影把网络音乐文化直接写入叙事。这里仅整理歌名、创作者、演唱角色与剧情位置，不提供音频或歌词全文；官方试听请前往作品 Music 页面。<sup><a href="#ref-music">[2]</a></sup></p>
            <div class="wiki-filter-bar" aria-label="音乐筛选">
              <button
                v-for="group in musicGroups"
                :key="group.id"
                type="button"
                :aria-pressed="activeMusicGroup === group.id"
                @click="activeMusicGroup = group.id"
              >{{ group.label }}</button>
            </div>
            <p class="wiki-result-count" aria-live="polite">显示 {{ filteredMusic.length }} 首曲目</p>
            <div class="wiki-music-list">
              <article v-for="song in filteredMusic" :id="song.id" :key="song.id" class="wiki-music-row" tabindex="-1">
                <div><span>{{ song.type }} · {{ song.category === 'cover' ? 'COVER' : song.category === 'remix' ? 'REMIX' : 'ORIGINAL' }}</span><h3>{{ song.title }}</h3></div>
                <dl><div><dt>创作</dt><dd>{{ song.creator }}</dd></div><div><dt>演唱</dt><dd>{{ song.performer }}</dd></div></dl>
                <p>{{ song.note }}</p>
              </article>
            </div>
            <a class="wiki-external-button" href="https://www.cho-kaguyahime.com/music/" target="_blank" rel="noopener noreferrer">前往官方 Music <TsIcon name="external" :size="16" /></a>
          </section>

          <section id="staff-cast" class="wiki-section" data-wiki-section tabindex="-1">
            <div class="wiki-section-heading"><span>06</span><div><small>CREDITS</small><h2>制作与配音</h2></div></div>
            <div class="wiki-credit-grid">
              <div><h3>STAFF</h3><dl><div v-for="([role, person]) in staff" :key="role"><dt>{{ role }}</dt><dd>{{ person }}</dd></div></dl></div>
              <div><h3>CAST</h3><dl><div v-for="([role, person]) in cast" :key="role"><dt>{{ role }}</dt><dd>{{ person }}</dd></div></dl></div>
            </div>
          </section>

          <section id="release" class="wiki-section" data-wiki-section tabindex="-1">
            <div class="wiki-section-heading"><span>07</span><div><small>RELEASE &amp; MEDIA</small><h2>上映、票房与衍生作品</h2></div></div>
            <p>网络上线后，作品从日本限定上映逐步扩大至全国院线，并陆续推出漫画、小说、公式指南书及动画 BD。以下节点依据用户提供的主条目源文件整理，金额为累计票房。</p>
            <div class="wiki-release-grid">
              <div class="wiki-box-office-card">
                <div class="wiki-subsection-title"><span>BOX OFFICE</span><h3>日本院线票房节点</h3></div>
                <ol>
                  <li v-for="milestone in boxOfficeMilestones" :key="milestone.day"><span>{{ milestone.day }}</span><strong>{{ milestone.gross }}</strong></li>
                </ol>
              </div>
              <div class="wiki-release-note">
                <span>HOME VIDEO</span>
                <strong>动画 BD</strong>
                <time datetime="2026-09-09">2026 年 9 月 9 日</time>
                <p>收录电影正片的实体影像版本预定于该日发售。</p>
              </div>
            </div>
            <div class="wiki-derivative-grid" aria-label="衍生作品">
              <article v-for="work in derivativeWorks" :key="work.type" class="wiki-derivative-card">
                <img :src="work.image" :alt="work.imageAlt" loading="lazy" decoding="async">
                <span>{{ work.type }}</span>
                <h3>{{ work.title }}</h3>
                <p>{{ work.detail }}</p>
                <dl>
                  <div><dt>制作</dt><dd>{{ work.credits }}</dd></div>
                  <div><dt>出版</dt><dd>{{ work.publisher }}</dd></div>
                  <div><dt>发行</dt><dd>{{ work.release }}</dd></div>
                  <div><dt>ISBN</dt><dd>{{ work.isbn }}</dd></div>
                </dl>
              </article>
            </div>
          </section>

          <section id="references" class="wiki-section" data-wiki-section tabindex="-1">
            <div class="wiki-section-heading"><span>08</span><div><small>SOURCES</small><h2>资料与版权说明</h2></div></div>
            <div class="wiki-copyright-note">
              <TsIcon name="shield" :size="22" />
              <div><strong>非官方网站／非官方百科</strong><p>本页为粉丝制作的资料导航，正文为原创归纳，不代表 Netflix、Colorido、Twin Engine 或作品权利方立场。页面主视觉为本站原创生成插画，不含官方角色图、截图、Logo 或商品扫描；作品名称与资料仅用于介绍和评论。</p></div>
            </div>
            <ol class="wiki-reference-list">
              <li v-for="(reference, index) in references" :id="reference.id" :key="reference.id">
                <span>[{{ index + 1 }}]</span>
                <div><a :href="reference.url" target="_blank" rel="noopener noreferrer">{{ reference.label }} <TsIcon name="external" :size="14" /></a><p>{{ reference.scope }}（核验：{{ verifiedAt }}）</p></div>
              </li>
            </ol>
            <p class="wiki-image-credit">视觉说明：主视觉为本站为本页面制作的原创环境插画；公开素材不等于自由许可，因此交付包不包含官方角色图、动画截图、Logo 或商品扫描。请勿将本站页面误认为官方产品。</p>
          </section>

          <nav class="wiki-navigation-template" aria-label="相关词条导航">
            <div class="wiki-template-title"><span>超辉夜姬！Wiki</span><strong>相关词条索引</strong></div>
            <div v-for="group in navigationGroups" :key="group.title" class="wiki-template-group">
              <strong>{{ group.title }}</strong>
              <div>
                <RouterLink v-for="link in group.links.filter((item) => item.route)" :key="link.target" :to="link.route">{{ link.label }}</RouterLink>
                <a v-for="link in group.links.filter((item) => !item.route)" :key="link.target" :href="`#${link.target}`">{{ link.label }}</a>
              </div>
            </div>
          </nav>
        </article>

        <aside class="wiki-info-panel" data-material="sidebar" aria-label="作品信息">
          <div class="wiki-info-head"><span>作品档案</span><strong>超かぐや姫！</strong></div>
          <dl><div v-for="([label, value]) in infoRows" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl>
          <a href="https://www.netflix.com/sg-zh/title/81756595" target="_blank" rel="noopener noreferrer">Netflix 作品页 <TsIcon name="external" :size="15" /></a>
          <small>资料核验至 {{ verifiedAt }}</small>
        </aside>
      </div>
    </div>

    <button v-if="showBackToTop" class="wiki-back-to-top" type="button" aria-label="返回页面顶部" @click="scrollToTop"><TsIcon name="chevronUp" :size="20" /></button>

    <button v-if="activeTerm" class="wiki-term-scrim" type="button" aria-label="关闭词条速览" @click="closeTerm"></button>
    <aside v-if="activeTerm" ref="termDrawer" class="wiki-term-drawer" data-material="popover" role="dialog" aria-modal="true" :aria-labelledby="`term-title-${activeTerm.id}`">
      <div class="wiki-term-drawer-head"><span>词条速览</span><button ref="termCloseButton" type="button" aria-label="关闭词条速览" @click="closeTerm"><TsIcon name="x" :size="18" /></button></div>
      <h2 :id="`term-title-${activeTerm.id}`">{{ activeTerm.label }}</h2>
      <p>{{ activeTerm.summary }}</p>
      <div class="wiki-tag-row"><span v-for="alias in activeTerm.aliases" :key="alias">{{ alias }}</span></div>
      <RouterLink :to="wikiEntryPath('term', activeTerm.id)" @click="closeTerm">打开独立词条 <TsIcon name="arrowRight" :size="15" /></RouterLink>
    </aside>
  </main>
</template>
