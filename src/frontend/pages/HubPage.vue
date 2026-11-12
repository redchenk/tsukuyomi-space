<script setup>
import { RouterLink } from 'vue-router';
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { apiFetch, loadPublicSettings, parseResponse } from '../api/client';
import { loadStageArticles } from '../services/stageArticles';
import { announcementContent, noticeSummary } from '../../../shared/notice-markdown.mjs';
import { siteArt } from '../data/siteArt';
import { activeSeason } from '../composables/useSeasonTheme';
import { storeRoomEntryDraft } from '../services/roomEntryDraft.mjs';
import TsIcon from '../components/TsIcon.vue';
import NoticeMarkdown from '../components/NoticeMarkdown.vue';
import wikiArt from '../assets/navigation/wiki-study.webp';
import gameArt from '../assets/navigation/kaguya-run.webp';
import driftArt from '../assets/drift/lantern/lake-wide.webp';
const props = defineProps({ lang: { type: String, default: 'zh' }, t: Object });
const emit = defineEmits(['go']);
const tr = (zh, en, ja = zh) => props.lang === 'en' ? en : props.lang === 'ja' ? ja : zh;
const draft = ref(''), draftError = ref(''), content = ref(null), articles = ref([]), notice = ref(null), loading = ref(true), error = ref('');
const suggestions = computed(() => [tr('今天过得怎么样？', 'How was your day?', '今日はどうだった？'), tr('想和你聊聊天', 'I just want to talk', 'お話ししたい'), tr('给我一点鼓励', 'A little encouragement', '少し励まして')]);
const season = computed(() => ({ spring: ['春日来信', 'SPRING'], summer: ['夏夜晚风', 'SUMMER'], autumn: ['秋月来信', 'AUTUMN'], winter: ['冬日灯火', 'WINTER'] }[activeSeason.value]));
const featured = computed(() => content.value?.article || articles.value[0]);
const latest = computed(() => articles.value.filter(article => article.id !== featured.value?.id).slice(0, 4));
const places = computed(() => [
  { path: '/gallery', title: tr('光影收藏', 'Collected light'), label: tr('图库', 'GALLERY'), desc: tr('收藏那些让人停留的瞬间。', 'A place for images that stay with you.'), image: content.value?.gallery?.url || siteArt.galleryCover },
  { path: '/pixel', title: tr('像素里的宇宙', 'Little pixel worlds'), label: tr('像素画工坊', 'PIXEL STUDIO'), desc: tr('一格一格，把想象画成真。', 'Give your imagination a little room.'), image: siteArt.pixelCover },
  { path: '/wiki', title: tr('走进月读世界', 'The world of Tsukuyomi'), label: tr('百科', 'WIKI'), desc: tr('人物、音乐，还有故事的另一面。', 'Characters, music and untold stories.'), image: wikiArt },
  { path: '/game', title: tr('一起玩一会儿', 'A little time to play'), label: tr('游戏中心', 'PLAY'), desc: tr('暂时放下忙碌，来一局吧。', 'Take a break. Share a game.'), image: gameArt }
]);
const articlePath = article => article?.id ? `/articles/${encodeURIComponent(article.id)}${article.slug ? `/${encodeURIComponent(article.slug)}` : ''}` : '/stage';
const date = value => String(value || '').slice(0, 10).replaceAll('-', '.');
const author = article => article?.author_nickname || article?.author_username || article?.author || tr('月下旅人', 'Moonlit traveler');
let loadedAt = 0, requestId = 0;
async function load() {
  const run = ++requestId;
  loading.value = !content.value; error.value = '';
  const results = await Promise.allSettled([
    apiFetch('/api/hub-preview', { headers: { Accept: 'application/json' } }).then(parseResponse),
    loadStageArticles({ sort: 'latest', limit: 6 }),
    loadPublicSettings()
  ]);
  if (run !== requestId) return;
  if (results[0].status === 'fulfilled' && results[0].value.success) content.value = results[0].value.data;
  else error.value = tr('最新内容暂时未能加载。', 'The latest content could not be loaded.');
  if (results[1].status === 'fulfilled') articles.value = results[1].value.articles;
  if (results[2].status === 'fulfilled') {
    const settings = results[2].value, text = announcementContent(settings);
    notice.value = text ? { content: text, title: noticeSummary(text) } : null;
  }
  loading.value = false; loadedAt = Date.now();
}
function enterRoom(text = draft.value) {
  draftError.value = '';
  if (!storeRoomEntryDraft(text)) { draftError.value = tr('浏览器暂时无法保存草稿，请进入房间后输入。', 'Draft storage is unavailable. Please type in the room.'); return; }
  emit('go', '/room');
}
onMounted(load);
onActivated(() => { if (loadedAt && Date.now() - loadedAt > 30000) load(); });
onBeforeUnmount(() => { requestId++; });
watch(() => props.lang, load);
</script>

<template>
  <main class="hub" :aria-busy="loading">
    <section class="home-hero" aria-labelledby="home-title">
      <img class="home-hero-art" :src="siteArt.hero" :alt="tr('月光湖畔的八千代', 'Yachiyo by the moonlit lake')" width="1672" height="941" fetchpriority="high">
      <div class="hero-shade" aria-hidden="true"></div>
      <div class="home-hero-content">
        <p class="hero-eyebrow"><span></span> {{ tr('留一点月光，给自己', 'A LITTLE MOONLIGHT, JUST FOR YOU', 'あなたのための月明かり') }}</p>
        <h1 id="home-title">{{ tr('给日常', 'A little light,', '日々に、') }}<br>{{ tr('留一点月光。', 'a little closer.', '月明かりを。') }}</h1>
        <p class="hero-description">{{ tr('故事、灵感，还有一直等你的八千代。', 'Stories, little discoveries, and Yachiyo waiting for you.', '物語とひらめき、そしてあなたを待つ八千代。') }}<br>{{ tr('在这里，慢一点也没关系。', 'There’s no hurry here.', 'ここでは、ゆっくりでいい。') }}</p>
        <form class="hero-composer" @submit.prevent="enterRoom()">
          <TsIcon name="message" :size="21" />
          <label class="sr-only" for="home-chat">{{ tr('和八千代说点什么', 'Say something to Yachiyo') }}</label>
          <input id="home-chat" v-model="draft" maxlength="2000" autocomplete="off" :placeholder="tr('和八千代说点什么…', 'Say something to Yachiyo…', '八千代に話しかけて…')">
          <button type="submit" :aria-label="tr('带着这句话进入房间', 'Enter the room with your message')"><TsIcon name="arrowRight" :size="22" /></button>
        </form>
        <p v-if="draftError" class="hero-draft-error" role="alert">{{ draftError }}</p>
        <div class="hero-suggestions"><button v-for="text in suggestions" :key="text" @click="enterRoom(text)">{{ text }}<TsIcon name="arrowUpRight" :size="13" /></button></div>
      </div>
      <div class="hero-footnote"><span>{{ lang === 'en' ? season[1] : season[0] }} <i></i> {{ tr('月见八千代', 'TSUKIMI YACHIYO') }}</span><a href="#under-the-moon">{{ tr('向下，发现更多', 'A little more to discover') }}<TsIcon name="chevronDown" :size="17" /></a></div>
    </section>

    <div class="home-content">
      <details v-if="notice" class="home-notice"><summary><span class="notice-label"><TsIcon name="bell" :size="16" />{{ tr('月读公告', 'NOTICE') }}</span><span class="notice-title">{{ notice.title }}</span><span class="notice-more">{{ tr('展开', 'Read') }}<TsIcon name="chevronDown" :size="16" /></span></summary><NoticeMarkdown class="home-notice-content" :content="notice.content" /></details>
      <section id="under-the-moon" class="home-section home-journal" aria-labelledby="journal-title">
        <header class="home-section-heading"><div><span class="eyebrow">01 — UNDER THE MOON</span><h2 id="journal-title">{{ tr('月下新鲜事', 'Under the moon', '月の下の新着') }}</h2><p>{{ tr('把值得记录的日常，变成值得阅读的故事。', 'Everyday moments, made into stories worth keeping.') }}</p></div><RouterLink to="/stage" class="ghost-btn">{{ tr('全部文章', 'All stories') }}<TsIcon name="arrowRight" :size="18" /></RouterLink></header>
        <LoadingSkeleton v-if="loading" variant="hub" :count="2" :label="t.loading" />
        <div v-else-if="error && !content" class="home-error" role="alert">{{ error }}<button class="ghost-btn" @click="load">{{ tr('重试', 'Try again') }}</button></div>
        <div v-else class="home-stories">
          <RouterLink class="featured-story" :to="articlePath(featured)"><div class="media-frame"><img :src="featured?.cover_image || siteArt.articleCover" alt="" loading="lazy" width="960" height="540"></div><span class="story-category">{{ featured?.category || tr('月读手记', 'JOURNAL') }}</span><h3>{{ featured?.title || tr('每一个故事，都值得被看见。', 'Every story deserves a little light.') }}</h3><p>{{ featured?.excerpt || tr('在主舞台，读故事、分享创作与生活中的发现。', 'Stories, creations and discoveries from our community.') }}</p><div class="story-byline"><span>{{ author(featured) }}</span><i>·</i><time>{{ date(featured?.published_at || featured?.created_at) }}</time></div></RouterLink>
          <div class="latest-stories"><div class="latest-label"><span>{{ tr('最近写下', 'RECENT STORIES') }}</span><span>JOURNAL ↗</span></div><RouterLink v-for="(article, index) in latest" :key="article.id" class="latest-story" :to="articlePath(article)"><span class="story-number">0{{ index + 1 }}</span><div><span class="story-category">{{ article.category }}</span><h3>{{ article.title }}</h3><p>{{ author(article) }} <i>·</i> {{ date(article.published_at || article.created_at) }}</p></div><TsIcon name="arrowUpRight" :size="18" /></RouterLink><RouterLink v-if="!latest.length" to="/stage" class="text-link">{{ tr('去主舞台发现更多故事', 'Discover more stories') }}<TsIcon name="arrowRight" :size="18" /></RouterLink></div>
        </div>
      </section>
      <section class="home-section home-discover" aria-labelledby="discover-title">
        <header class="home-section-heading"><div><span class="eyebrow">02 — WANDER A LITTLE</span><h2 id="discover-title">{{ tr('随心逛逛', 'Follow your curiosity', '気ままに歩こう') }}</h2></div><p>{{ tr('喜欢的事，都能在这里找到一席之地。', 'A little space for everything you love.') }}</p></header>
        <div class="discovery-grid"><RouterLink v-for="place in places" :key="place.path" :to="place.path" class="discovery-item"><div class="media-frame"><img :src="place.image" alt="" loading="lazy" width="480" height="600"><span>{{ place.label }}</span></div><div class="discovery-title"><h3>{{ place.title }}</h3><TsIcon name="arrowUpRight" :size="19" /></div><p>{{ place.desc }}</p></RouterLink></div>
      </section>
      <section class="home-section home-community" aria-labelledby="community-title">
        <div class="community-intro"><span class="eyebrow">03 — SMALL MOMENTS, SHARED</span><h2 id="community-title">{{ tr('月光下的声音', 'Meet under the moon') }}</h2><p>{{ tr('今天的小事、想分享的心情，', 'Small moments, little thoughts,') }}<br>{{ tr('总有人愿意听。', 'and someone who’s here to listen.') }}</p><RouterLink to="/plaza" class="primary-btn">{{ tr('去广场坐坐', 'Visit the plaza') }}<TsIcon name="arrowRight" :size="16" /></RouterLink></div>
        <div class="home-messages"><RouterLink v-for="message in (content?.messages || []).slice(0, 3)" :key="message.id" to="/plaza" class="home-message"><span class="message-avatar"><img v-if="message.avatar" :src="message.avatar" alt="" loading="lazy"><span v-else>{{ [...(message.author_nickname || message.author || '月')][0] }}</span></span><div><div class="message-byline"><strong>{{ message.author_nickname || message.author }}</strong><time>{{ date(message.created_at) }}</time></div><p>{{ message.content }}</p></div></RouterLink><p v-if="!content?.messages?.length" class="empty-state">{{ tr('安静的广场，等你留下第一句问候。', 'A quiet plaza, waiting for your first hello.') }}</p></div>
      </section>
      <RouterLink to="/drift" class="home-letter"><img :src="driftArt" alt="" loading="lazy"><div><span class="eyebrow">{{ tr('写给远方的某个人', 'A LETTER TO SOMEONE, SOMEWHERE', 'どこかの誰かへの手紙') }}</span><h2>{{ tr('把心事，交给星海。', 'Let a little thought drift away.') }}</h2><p>{{ tr('写一封信，让月光带它去遇见一个陌生人。', 'Write a letter. Let the moon find someone to read it.') }}</p></div><span class="letter-arrow"><TsIcon name="arrowUpRight" :size="28" /></span></RouterLink>
    </div>
  </main>
</template>
