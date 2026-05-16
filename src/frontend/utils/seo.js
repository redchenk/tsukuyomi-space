const SITE_NAME = '月读空间';
const SITE_URL = 'https://yachiyo.hk';
const DEFAULT_DESCRIPTION = '月读空间是一个融合文章、留言广场、Live2D 房间与互动工具的二次元个人站。';
const DEFAULT_IMAGE = `${SITE_URL}/assets/icons/icon-512.png`;

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

export function applySeo({
  title = SITE_NAME,
  description = DEFAULT_DESCRIPTION,
  path = window.location.pathname + window.location.search,
  image = DEFAULT_IMAGE,
  type = 'website',
  noindex = false,
  structuredData = null
} = {}) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);

  document.title = fullTitle;
  document.documentElement.lang = 'zh-CN';
  upsertMeta('meta[name="description"]', { name: 'description', content: description || DEFAULT_DESCRIPTION });
  upsertMeta('meta[name="robots"]', { name: 'robots', content: noindex ? 'noindex,nofollow' : 'index,follow' });
  upsertLink('canonical', url);

  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE_NAME });
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle });
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description || DEFAULT_DESCRIPTION });
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url });
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: imageUrl });

  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary' });
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: fullTitle });
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description || DEFAULT_DESCRIPTION });
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl });

  upsertStructuredData('page', structuredData);
}

export function applyRouteSeo(route) {
  const meta = route.meta || {};
  applySeo({
    title: meta.title || SITE_NAME,
    description: meta.description || DEFAULT_DESCRIPTION,
    path: route.fullPath || '/',
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
    path,
    image,
    type: 'article',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description,
      image: [absoluteUrl(image)],
      datePublished: article?.publish_date || article?.created_at,
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
      inLanguage: 'zh-CN',
      keywords: tags.join(','),
      articleSection: article?.category || ''
    }
  };
}
