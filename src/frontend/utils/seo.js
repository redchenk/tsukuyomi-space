import { documentLanguage } from '../i18n';

const ENGLISH_SITE = import.meta.env.VITE_SITE_LANGUAGE === 'en';
const SITE_NAME = ENGLISH_SITE ? 'Tsukuyomi Space' : '月读空间';
const SITE_URL = ENGLISH_SITE ? 'https://tsukuyomi-space.com' : 'https://yachiyo.hk';
const DEFAULT_DESCRIPTION = ENGLISH_SITE
  ? 'Explore the Cosmic Princess Kaguya fan wiki, Tsukimi Yachiyo Live2D AI room, translated articles, fan art, pixel art and community posts.'
  : '月读空间是一个融合文章、留言广场、Live2D 房间与互动工具的二次元个人站。';
const DEFAULT_IMAGE = `${SITE_URL}/assets/icons/icon-512.png`;
const DEFAULT_KEYWORDS = ENGLISH_SITE
  ? ['Tsukuyomi Space', 'Cosmic Princess Kaguya wiki', 'Tsukimi Yachiyo', 'Live2D AI', 'anime fan wiki', 'fan art gallery', 'pixel art community']
  : ['月读空间', 'Tsukuyomi Space', '超时空辉夜姬', 'Live2D', '二次元个人站'];

const ENGLISH_ROUTE_SEO = Object.freeze({
  access: ['Tsukuyomi Space | Live2D, Wiki and Creative Community', 'Enter Tsukuyomi Space and explore its Live2D room, creative wiki, articles, public gallery and pixel-art community.'],
  accessAlias: ['Tsukuyomi Space | Live2D, Wiki and Creative Community', 'Enter Tsukuyomi Space and explore its Live2D room, creative wiki, articles, public gallery and pixel-art community.'],
  hub: ['Central Hub', 'Browse the latest articles, gallery images, plaza messages, pixel art and updates from Yachiyo’s room.'],
  login: ['Sign in', 'Sign in to your Tsukuyomi Space account.'],
  register: ['Create account', 'Create a Tsukuyomi Space account.'],
  stage: ['Main Stage Articles', 'Browse public announcements, technical notes, fan works, translations and creative journals.'],
  article: ['Article', 'Read a public Tsukuyomi Space article and its comments.'],
  articleDetail: ['Article', 'Read a public Tsukuyomi Space article and its comments.'],
  wiki: ['Cosmic Princess Kaguya Wiki', 'Explore an unofficial fan archive of characters, music, releases and the world of Tsukuyomi.'],
  wikiCharacter: ['Character Entry', 'Read a character profile with history, relationships, music, images and sources.'],
  wikiTerm: ['World and Lore Entry', 'Explore terms, music and lore from the world of Tsukuyomi.'],
  room: ['Tsukimi Yachiyo Live2D AI Room', 'Enter Yachiyo’s Live2D room for AI chat, voice, long-term memory and character knowledge.'],
  roomSettings: ['Room Settings', 'Configure the room’s LLM, TTS, MCP tools, knowledge base and long-term memory.'],
  live2d: ['Live2D Preview', 'Hidden Live2D preview page.'],
  plaza: ['Tsukuyomi Plaza', 'Browse public messages, join conversations and meet visitors and creators.'],
  friendLinks: ['Partner Sites', 'Discover approved independent sites, blogs and creative partners.'],
  friendLinkApply: ['Apply for a Link Exchange', 'Submit a partner-site application and check its review status.'],
  reality: ['Reality Anchor and Project Notes', 'Learn about the project’s sources, open-source work, privacy and limits of responsibility.'],
  editor: ['Article Editor', 'Edit and publish a Tsukuyomi Space article.'],
  attachments: ['Attachments', 'Manage article images and personal uploads.'],
  gallery: ['Public Gallery', 'Browse public illustrations, fan art, site images and other creative media.'],
  galleryManage: ['Manage Gallery', 'Manage images you uploaded to the public gallery.'],
  userCenter: ['User Center', 'Manage your Tsukuyomi Space account and profile.'],
  userProfile: ['Creator Profile', 'View a creator’s public profile, articles and connections.'],
  notifications: ['Notifications', 'View replies, likes and account notifications.'],
  admin: ['Content Management', 'Review articles, messages, gallery images and attachments.'],
  terminal: ['Administration Terminal', 'Tsukuyomi Space administration terminal.'],
  pixel: ['192 × 108 Moonlit Pixel Workshop', 'Create, publish, browse, like and export fixed-size pixel artwork.'],
  game: ['Kaguya Run Rhythm Game', 'Play Kaguya Run with desktop keyboard, mobile touch and fullscreen controls.']
});

function absoluteUrl(path = '/') {
  try {
    return new URL(path || '/', SITE_URL).toString();
  } catch (_) {
    return SITE_URL;
  }
}

function upsertMeta(selector, attrs) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement('meta');
    document.head.appendChild(node);
  }
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
}

function upsertLink(rel, href) {
  let node = document.head.querySelector(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', rel);
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
}

function upsertAlternate(language, href) {
  let node = document.head.querySelector(`link[rel="alternate"][hreflang="${language}"]`);
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', 'alternate');
    node.setAttribute('hreflang', language);
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
}

function removeStructuredData(id) {
  document.head.querySelector(`script[data-seo-json="${id}"]`)?.remove();
}

function upsertStructuredData(id, payload) {
  removeStructuredData(id);
  if (!payload) return;
  const node = document.createElement('script');
  node.type = 'application/ld+json';
  node.dataset.seoJson = id;
  node.textContent = JSON.stringify(payload);
  document.head.appendChild(node);
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
  } catch (_) {
    // Support older comma-separated tag values.
  }
  return String(value).split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
}

function normalizeKeywords(value) {
  const keywords = normalizeTags(value)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  return [...new Set(keywords)].slice(0, 32).join(', ');
}

function activeDocumentLanguage() {
  if (ENGLISH_SITE) return 'en';
  try {
    return documentLanguage(localStorage.getItem('lang'));
  } catch (_) {
    return documentLanguage(document.documentElement.lang);
  }
}

export function applySeo({
  title = SITE_NAME,
  description = DEFAULT_DESCRIPTION,
  keywords = DEFAULT_KEYWORDS,
  path = window.location.pathname + window.location.search,
  image = DEFAULT_IMAGE,
  type = 'website',
  noindex = false,
  structuredData = null,
  language = activeDocumentLanguage()
} = {}) {
  const pageTitle = String(title || SITE_NAME).trim() || SITE_NAME;
  const pageDescription = String(description || DEFAULT_DESCRIPTION).trim() || DEFAULT_DESCRIPTION;
  const fullTitle = pageTitle.includes(SITE_NAME) ? pageTitle : `${pageTitle} | ${SITE_NAME}`;
  const keywordContent = normalizeKeywords(keywords) || normalizeKeywords(DEFAULT_KEYWORDS);
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);

  document.title = fullTitle;
  document.documentElement.lang = documentLanguage(language);
  upsertMeta('meta[name="description"]', { name: 'description', content: pageDescription });
  upsertMeta('meta[name="keywords"]', { name: 'keywords', content: keywordContent });
  upsertMeta('meta[name="robots"]', { name: 'robots', content: noindex ? 'noindex,nofollow' : 'index,follow' });
  upsertLink('canonical', url);

  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE_NAME });
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle });
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: pageDescription });
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url });
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: imageUrl });
  upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: ENGLISH_SITE ? 'en_US' : 'zh_CN' });

  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: fullTitle });
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: pageDescription });
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl });

  if (ENGLISH_SITE) {
    const languagePath = String(path || '/').split('#', 1)[0];
    upsertAlternate('en', absoluteUrl(languagePath));
    upsertAlternate('zh-Hans', new URL(languagePath, 'https://yachiyo.hk').toString());
    upsertAlternate('x-default', absoluteUrl(languagePath));
  }

  upsertStructuredData('page', structuredData);
}

export function applyRouteSeo(route) {
  const meta = route.meta || {};
  const english = ENGLISH_SITE ? ENGLISH_ROUTE_SEO[route.name] : null;
  applySeo({
    title: english?.[0] || meta.title || SITE_NAME,
    description: english?.[1] || meta.description || DEFAULT_DESCRIPTION,
    keywords: ENGLISH_SITE ? DEFAULT_KEYWORDS : (meta.keywords || DEFAULT_KEYWORDS),
    path: route.path || route.fullPath || '/',
    noindex: Boolean(meta.noindex)
  });
}

export function articleSeo(article, path) {
  const title = String(article?.title || '文章').trim();
  const description = String(article?.excerpt || article?.content || DEFAULT_DESCRIPTION)
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/[#>*_`~\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || DEFAULT_DESCRIPTION;
  const image = article?.cover_image || DEFAULT_IMAGE;
  const url = absoluteUrl(path);
  const tags = normalizeTags(article?.tags);
  return {
    title,
    description,
    keywords: tags.length ? tags : [title, article?.category, ENGLISH_SITE ? 'Tsukuyomi Space article' : '月读空间文章'].filter(Boolean),
    path,
    image,
    type: 'article',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description,
      image: [absoluteUrl(image)],
      datePublished: article?.published_at || article?.created_at || article?.publish_date,
      dateModified: article?.updated_at || article?.created_at || article?.publish_date,
      author: {
        '@type': 'Person',
        name: article?.author_username || 'redchenk'
      },
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        logo: {
          '@type': 'ImageObject',
          url: DEFAULT_IMAGE
        }
      },
      mainEntityOfPage: url,
      inLanguage: ENGLISH_SITE ? 'en' : 'zh-CN',
      keywords: tags.join(','),
      articleSection: article?.category || ''
    }
  };
}
