<script setup>
import { computed } from 'vue';

const props = defineProps({
  lang: { type: String, required: true },
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);

const isJa = computed(() => props.lang === 'ja');

const privacyHeaders = computed(() => isJa.value
  ? ['\u30c7\u30fc\u30bf\u7a2e\u5225', '\u5229\u7528\u76ee\u7684', '\u4fdd\u5b58\u5834\u6240\u3068\u8aac\u660e']
  : ['\u6570\u636e\u7c7b\u578b', '\u4f7f\u7528\u76ee\u7684', '\u4fdd\u5b58\u4f4d\u7f6e\u4e0e\u8bf4\u660e']);

const privacyRows = computed(() => isJa.value ? [
  {
    type: '\u30a2\u30ab\u30a6\u30f3\u30c8\u60c5\u5831',
    purpose: '\u767b\u9332\u3001\u30ed\u30b0\u30a4\u30f3\u3001\u30e6\u30fc\u30b6\u30fc\u30bb\u30f3\u30bf\u30fc\u8868\u793a\u3001\u6a29\u9650\u5224\u5b9a\u306b\u4f7f\u7528\u3057\u307e\u3059\u3002',
    storage: '\u30e6\u30fc\u30b6\u30fc\u540d\u3001\u30e1\u30fc\u30eb\u3001\u6697\u53f7\u5316\u3055\u308c\u305f\u30d1\u30b9\u30ef\u30fc\u30c9\u3001\u30ed\u30fc\u30eb\u3001\u4f5c\u6210\u65e5\u6642\u3092\u542b\u307f\u307e\u3059\u3002\u30d1\u30b9\u30ef\u30fc\u30c9\u306f\u5e73\u6587\u3067\u4fdd\u5b58\u3057\u307e\u305b\u3093\u3002'
  },
  {
    type: '\u8a18\u4e8b\u3068\u30e1\u30c3\u30bb\u30fc\u30b8',
    purpose: '\u6295\u7a3f\u3001\u30b3\u30e1\u30f3\u30c8\u3001\u30e1\u30c3\u30bb\u30fc\u30b8\u5be9\u67fb\u3001\u30b5\u30a4\u30c8\u5185\u4ea4\u6d41\u306e\u8868\u793a\u306b\u4f7f\u7528\u3057\u307e\u3059\u3002',
    storage: '\u516c\u958b\u30b3\u30f3\u30c6\u30f3\u30c4\u306f\u4ed6\u306e\u8a2a\u554f\u8005\u306b\u898b\u3048\u308b\u5834\u5408\u304c\u3042\u308a\u307e\u3059\u3002\u7ba1\u7406\u8005\u306f\u5be9\u67fb\u3001\u7ba1\u7406\u3001\u524a\u9664\u6a29\u9650\u3092\u4fdd\u6301\u3057\u307e\u3059\u3002'
  },
  {
    type: '\u30a2\u30af\u30bb\u30b9\u7d71\u8a08',
    purpose: '\u30da\u30fc\u30b8\u306e\u30a2\u30af\u30bb\u30b9\u50be\u5411\u3092\u628a\u63e1\u3057\u3001\u30b5\u30a4\u30c8\u306e\u5b89\u5b9a\u6027\u3092\u7dad\u6301\u3059\u308b\u305f\u3081\u306b\u4f7f\u7528\u3057\u307e\u3059\u3002',
    storage: '\u30b5\u30a4\u30c8\u7d71\u8a08\u30c7\u30fc\u30bf\u304c\u4e2d\u5fc3\u3067\u3001\u5e83\u544a\u30d7\u30ed\u30d5\u30a1\u30a4\u30ea\u30f3\u30b0\u3084\u30af\u30ed\u30b9\u30b5\u30a4\u30c8\u30c8\u30e9\u30c3\u30ad\u30f3\u30b0\u306b\u306f\u4f7f\u7528\u3057\u307e\u305b\u3093\u3002'
  },
  {
    type: '\u30eb\u30fc\u30e0\u306e\u30ed\u30fc\u30ab\u30eb\u8a2d\u5b9a',
    purpose: 'Live2D \u30eb\u30fc\u30e0\u306e\u30e2\u30c7\u30eb\u4f4d\u7f6e\u3001\u30c1\u30e3\u30c3\u30c8\u5c65\u6b74\u3001LLM/TTS \u8a2d\u5b9a\u306a\u3069\u306e\u500b\u4eba\u4f53\u9a13\u8a2d\u5b9a\u306e\u4fdd\u5b58\u306b\u4f7f\u7528\u3057\u307e\u3059\u3002',
    storage: '\u3053\u308c\u3089\u306e\u30c7\u30fc\u30bf\u306f\u4e3b\u306b\u30d6\u30e9\u30a6\u30b6\u306e localStorage \u306b\u4fdd\u5b58\u3055\u308c\u307e\u3059\u3002\u30d6\u30e9\u30a6\u30b6\u306e\u30b5\u30a4\u30c8\u30c7\u30fc\u30bf\u3092\u524a\u9664\u3059\u308b\u3068\u524a\u9664\u3055\u308c\u307e\u3059\u3002'
  },
  {
    type: '\u30b5\u30fc\u30c9\u30d1\u30fc\u30c6\u30a3 API \u8a2d\u5b9a',
    purpose: '\u30e6\u30fc\u30b6\u30fc\u304c\u30eb\u30fc\u30e0\u306e\u30c1\u30e3\u30c3\u30c8\u3084\u97f3\u58f0\u30b5\u30fc\u30d3\u30b9\u3092\u81ea\u5206\u3067\u8a2d\u5b9a\u3059\u308b\u305f\u3081\u306b\u4f7f\u7528\u3057\u307e\u3059\u3002',
    storage: '\u516c\u5171\u7aef\u672b\u306b API Key \u3092\u4fdd\u5b58\u3057\u306a\u3044\u3067\u304f\u3060\u3055\u3044\u3002\u30b5\u30a4\u30c8\u304c\u3042\u306a\u305f\u306e\u30ad\u30fc\u3092\u516c\u958b\u30da\u30fc\u30b8\u306b\u66f8\u304d\u8fbc\u3080\u3053\u3068\u306f\u3042\u308a\u307e\u305b\u3093\u3002'
  }
] : [
  {
    type: '\u8d26\u53f7\u4fe1\u606f',
    purpose: '\u7528\u4e8e\u6ce8\u518c\u3001\u767b\u5f55\u3001\u7528\u6237\u4e2d\u5fc3\u5c55\u793a\u4e0e\u6743\u9650\u5224\u65ad\u3002',
    storage: '\u5305\u62ec\u7528\u6237\u540d\u3001\u90ae\u7bb1\u3001\u52a0\u5bc6\u540e\u7684\u5bc6\u7801\u3001\u89d2\u8272\u4e0e\u521b\u5efa\u65f6\u95f4\u3002\u5bc6\u7801\u4e0d\u4f1a\u4ee5\u660e\u6587\u4fdd\u5b58\u3002'
  },
  {
    type: '\u6587\u7ae0\u4e0e\u7559\u8a00',
    purpose: '\u7528\u4e8e\u5c55\u793a\u6295\u7a3f\u3001\u8bc4\u8bba\u3001\u7559\u8a00\u5ba1\u6838\u548c\u7ad9\u5185\u4e92\u52a8\u3002',
    storage: '\u516c\u5f00\u53d1\u5e03\u7684\u5185\u5bb9\u53ef\u80fd\u88ab\u5176\u4ed6\u8bbf\u5ba2\u770b\u5230\uff1b\u540e\u53f0\u4fdd\u7559\u5ba1\u6838\u3001\u7ba1\u7406\u548c\u5220\u9664\u80fd\u529b\u3002'
  },
  {
    type: '\u8bbf\u95ee\u7edf\u8ba1',
    purpose: '\u7528\u4e8e\u4e86\u89e3\u9875\u9762\u8bbf\u95ee\u8d8b\u52bf\u3001\u7ef4\u62a4\u7ad9\u70b9\u7a33\u5b9a\u6027\u3002',
    storage: '\u4ee5\u7ad9\u70b9\u7edf\u8ba1\u6570\u636e\u4e3a\u4e3b\uff0c\u4e0d\u7528\u4e8e\u5e7f\u544a\u753b\u50cf\u6216\u8de8\u7ad9\u8ffd\u8e2a\u3002'
  },
  {
    type: '\u623f\u95f4\u672c\u5730\u8bbe\u7f6e',
    purpose: '\u7528\u4e8e\u4fdd\u5b58 Live2D \u623f\u95f4\u7684\u6a21\u578b\u4f4d\u7f6e\u3001\u804a\u5929\u5386\u53f2\u3001LLM/TTS \u914d\u7f6e\u7b49\u4e2a\u4eba\u4f53\u9a8c\u8bbe\u7f6e\u3002',
    storage: '\u8fd9\u7c7b\u6570\u636e\u4e3b\u8981\u4fdd\u5b58\u5728\u4f60\u7684\u6d4f\u89c8\u5668 localStorage \u4e2d\u3002\u6e05\u7406\u6d4f\u89c8\u5668\u7ad9\u70b9\u6570\u636e\u4f1a\u5220\u9664\u5b83\u4eec\u3002'
  },
  {
    type: '\u7b2c\u4e09\u65b9\u63a5\u53e3\u914d\u7f6e',
    purpose: '\u7528\u4e8e\u7528\u6237\u81ea\u884c\u914d\u7f6e\u623f\u95f4\u804a\u5929\u6216\u8bed\u97f3\u670d\u52a1\u3002',
    storage: '\u8bf7\u4e0d\u8981\u5728\u516c\u5171\u8bbe\u5907\u4fdd\u5b58 API Key\u3002\u7ad9\u70b9\u4e0d\u4f1a\u4e3b\u52a8\u5c06\u4f60\u7684\u5bc6\u94a5\u5199\u5165\u516c\u5f00\u9875\u9762\u3002'
  }
]);

const rightsCards = computed(() => isJa.value ? [
  {
    title: props.t.realityRightsAccess,
    items: [
      '\u30ed\u30b0\u30a4\u30f3\u5f8c\u3001\u30e6\u30fc\u30b6\u30fc\u30bb\u30f3\u30bf\u30fc\u3067\u57fa\u672c\u30a2\u30ab\u30a6\u30f3\u30c8\u60c5\u5831\u3092\u78ba\u8a8d\u3067\u304d\u307e\u3059\u3002',
      '\u516c\u958b\u30b3\u30f3\u30c6\u30f3\u30c4\u306b\u8aa4\u308a\u3092\u898b\u3064\u3051\u305f\u5834\u5408\u3001\u30ea\u30f3\u30af\u3092\u63d0\u4f9b\u3057\u3066\u4fee\u6b63\u3092\u7533\u8acb\u3067\u304d\u307e\u3059\u3002'
    ]
  },
  {
    title: props.t.realityRightsDelete,
    items: [
      '\u81ea\u5206\u304c\u6295\u7a3f\u3057\u305f\u30e1\u30c3\u30bb\u30fc\u30b8\u3001\u8a18\u4e8b\u3001\u30a2\u30ab\u30a6\u30f3\u30c8\u95a2\u9023\u30c7\u30fc\u30bf\u306e\u524a\u9664\u3092\u7533\u8acb\u3067\u304d\u307e\u3059\u3002',
      '\u30d6\u30e9\u30a6\u30b6\u306e\u30ed\u30fc\u30ab\u30eb\u30eb\u30fc\u30e0\u8a2d\u5b9a\u306f\u3001\u30b5\u30a4\u30c8\u30c7\u30fc\u30bf\u3092\u6d88\u53bb\u3059\u308b\u3053\u3068\u3067\u81ea\u5206\u3067\u524a\u9664\u3067\u304d\u307e\u3059\u3002'
    ]
  },
  {
    title: props.t.realityRightsSecurity,
    items: [
      'XSS\u3001\u6a29\u9650\u30d0\u30a4\u30d1\u30b9\u3001\u6a5f\u5bc6\u60c5\u5831\u6f0f\u6d29\u306a\u3069\u306e\u30ea\u30b9\u30af\u3092\u767a\u898b\u3057\u305f\u5834\u5408\u306f\u3001GitHub Issues \u307e\u305f\u306f\u30ea\u30dd\u30b8\u30c8\u30ea\u306e\u9023\u7d61\u5148\u304b\u3089\u5831\u544a\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
      '\u5831\u544a\u6642\u306b\u5b9f\u969b\u306e\u30ad\u30fc\u3001\u30d1\u30b9\u30ef\u30fc\u30c9\u3001\u30c8\u30fc\u30af\u30f3\u3001\u4ed6\u4eba\u306e\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u3092\u516c\u958b\u3057\u306a\u3044\u3067\u304f\u3060\u3055\u3044\u3002'
    ]
  }
] : [
  {
    title: props.t.realityRightsAccess,
    items: [
      '\u767b\u5f55\u540e\u53ef\u5728\u7528\u6237\u4e2d\u5fc3\u67e5\u770b\u57fa\u7840\u8d26\u53f7\u4fe1\u606f\u3002',
      '\u53d1\u73b0\u516c\u5f00\u5185\u5bb9\u6709\u8bef\u65f6\uff0c\u53ef\u4ee5\u63d0\u4f9b\u94fe\u63a5\u7533\u8bf7\u66f4\u6b63\u3002'
    ]
  },
  {
    title: props.t.realityRightsDelete,
    items: [
      '\u4f60\u53ef\u4ee5\u7533\u8bf7\u5220\u9664\u81ea\u5df1\u53d1\u5e03\u7684\u7559\u8a00\u3001\u6295\u7a3f\u6216\u8d26\u53f7\u76f8\u5173\u6570\u636e\u3002',
      '\u6d4f\u89c8\u5668\u672c\u5730\u623f\u95f4\u8bbe\u7f6e\u53ef\u901a\u8fc7\u6e05\u7406\u7ad9\u70b9\u6570\u636e\u81ea\u884c\u5220\u9664\u3002'
    ]
  },
  {
    title: props.t.realityRightsSecurity,
    items: [
      '\u5982\u53d1\u73b0 XSS\u3001\u8d8a\u6743\u3001\u654f\u611f\u4fe1\u606f\u6cc4\u9732\u7b49\u98ce\u9669\uff0c\u8bf7\u901a\u8fc7 GitHub Issues \u6216\u4ed3\u5e93\u8054\u7cfb\u65b9\u5f0f\u62a5\u544a\u3002',
      '\u62a5\u544a\u65f6\u8bf7\u907f\u514d\u516c\u5f00\u771f\u5b9e\u5bc6\u94a5\u3001\u5bc6\u7801\u3001\u4ee4\u724c\u548c\u4ed6\u4eba\u9690\u79c1\u3002'
    ]
  }
]);

const noticePrefixes = computed(() => isJa.value
  ? {
      virtual: '\u30d0\u30fc\u30c1\u30e3\u30eb\u30ad\u30e3\u30e9\u30af\u30bf\u30fc\u30b3\u30f3\u30c6\u30f3\u30c4\uff1a',
      links: '\u5916\u90e8\u30ea\u30f3\u30af\uff1a',
      update: '\u58f0\u660e\u306e\u66f4\u65b0\uff1a'
    }
  : {
      virtual: '\u865a\u62df\u89d2\u8272\u5185\u5bb9\uff1a',
      links: '\u5916\u90e8\u94fe\u63a5\uff1a',
      update: '\u58f0\u660e\u66f4\u65b0\uff1a'
    });

function go(path) {
  emit('go', path);
}
</script>

<template>
  <main class="page reality-page">
    <div class="reality-container">
      <section class="reality-hero">
        <div class="reality-hero-kicker">{{ t.realityEyebrow }}</div>
        <h1>{{ t.realityTitle }}</h1>
        <p class="reality-hero-copy">{{ t.realitySubtitle }}</p>
        <div class="reality-hero-actions">
          <a class="reality-btn" href="#contact">{{ t.realityContactTitle }}</a>
          <a class="reality-btn secondary" href="#privacy">{{ t.realityPrivacyTitle }}</a>
        </div>
      </section>

      <section id="contact" class="reality-section">
        <div class="reality-section-head">
          <div class="reality-eyebrow">Contact</div>
          <div>
            <h2>{{ t.realityContactTitle }}</h2>
            <p class="reality-section-lead">{{ t.realityContactLead }}</p>
          </div>
        </div>
        <div class="reality-card-grid reality-3col">
          <article class="reality-card">
            <h3>{{ t.realityContactRepo }}</h3>
            <p>{{ t.realityContactRepoDesc }}</p>
          </article>
          <article class="reality-card">
            <h3>{{ t.realityContactIssues }}</h3>
            <p>{{ t.realityContactIssuesDesc }}</p>
          </article>
          <article class="reality-card">
            <h3>{{ t.realityContactPlaza }}</h3>
            <p>{{ t.realityContactPlazaDesc }}</p>
          </article>
        </div>
      </section>

      <section id="privacy" class="reality-section">
        <div class="reality-section-head">
          <div class="reality-eyebrow">Privacy</div>
          <div>
            <h2>{{ t.realityPrivacyTitle }}</h2>
            <p class="reality-section-lead">{{ t.realityPrivacyLead }}</p>
          </div>
        </div>
        <table class="reality-data-table">
          <thead>
            <tr>
              <th v-for="header in privacyHeaders" :key="header">{{ header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in privacyRows" :key="row.type">
              <td>{{ row.type }}</td>
              <td>{{ row.purpose }}</td>
              <td>{{ row.storage }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="reality-section">
        <div class="reality-section-head">
          <div class="reality-eyebrow">Rights</div>
          <div>
            <h2>{{ t.realityRightsTitle }}</h2>
            <p class="reality-section-lead">{{ t.realityRightsLead }}</p>
          </div>
        </div>
        <div class="reality-card-grid reality-3col">
          <article v-for="card in rightsCards" :key="card.title" class="reality-card">
            <h3>{{ card.title }}</h3>
            <ul class="reality-policy-list">
              <li v-for="item in card.items" :key="item">{{ item }}</li>
            </ul>
          </article>
        </div>
      </section>

      <section class="reality-section">
        <div class="reality-section-head">
          <div class="reality-eyebrow">Notice</div>
          <div>
            <h2>{{ t.realityNoticeTitle }}</h2>
            <p class="reality-section-lead">{{ t.realityNoticeLead }}</p>
          </div>
        </div>
        <div class="reality-statement">
          <p><strong>{{ noticePrefixes.virtual }}</strong>{{ t.realityNoticeVirtual }}</p>
          <p><strong>{{ noticePrefixes.links }}</strong>{{ t.realityNoticeLinks }}</p>
          <p><strong>{{ noticePrefixes.update }}</strong>{{ t.realityNoticeUpdate }}</p>
        </div>
      </section>

      <div class="reality-footer">
        <span>{{ t.realityFooterBrand }}</span>
        <span>
          <a class="reality-btn secondary" href="/hub" @click.prevent="go('/hub')">{{ t.realityFooterBack }}</a>
        </span>
      </div>
    </div>
  </main>
</template>
