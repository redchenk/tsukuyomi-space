// The local design preview has no translation sidecar. Supply both editions of its authored sample content.
const express = require('express');
const article = require('./editorial-article.cjs');

const copy = new Map([
  [article.title, 'Notes on creating by moonlight'],
  ['在秋天的湖畔，给自己留一盏灯', 'A lantern beside the autumn lake'],
  ['等一场樱花，也等一个好故事', 'Waiting for cherry blossoms and a good story'],
  ['冬日来信：慢一点，也没关系', 'A winter letter about taking your time'],
  ['月下散步，拾起生活里的微光', 'Little lights on a moonlit walk'],
  ['夏夜的声音，有风也有你', 'The sound of a summer night'],
  ['把月色写进一封很长的信', 'A long letter filled with moonlight'],
  ['用像素搭建一个小小的世界', 'Building a tiny world in pixels'],
  ['下雪的时候，想起那些温暖的事', 'Warm memories on a snowy day'],
  ['在平凡的日子里收集光与声音。这里记录创作的片刻、偶然的相遇，以及那些值得慢慢读完的故事。', 'Collecting light and sound from ordinary days. A journal of making things, chance encounters and stories worth reading slowly.'],
  ['本地设计预览 · 站内原有季节插画', 'Local design preview with the original seasonal illustrations'],
  ['今天也给日常留一点月光。', 'A little moonlight for an ordinary day.'],
  ['一起分享喜欢的作品，期待下一次相遇。', 'Share a work you love. See you again soon.'],
  ['浅色与深色主题都应该清楚易读。', 'Reading should feel comfortable in both light and dark mode.'],
  ['二创','Fan works'],['其他','Other'],['技术','Technology'],['风景','Landscape'],['月读空间','Tsukuyomi Space'],
  [article.content, [
    '## Begin with a small idea',
    'When the evening quiets down, leave a corner free for making things. Write a story, draw a pixel or share a thought with a friend.',
    'A good space invites you to stay and makes it easy to find what you came for. Stories, art and conversations sit together here.',
    '## Keep the story',
    'Write down the sentence you read, the detail you noticed while debugging, or the person you met. Over time they become a record of your work.',
    '### The rhythm of reading',
    'Headings give the reader direction. Space lets the eye rest. A picture begins a story and words carry it forward.',
    '> Leave a little moonlight for the everyday, and a little patience for creating.',
    '## Meet under the moon',
    ...Array(4).fill('Every work begins with curiosity. People who try and share bring warmth to this place. A line of text or a single pixel can begin a story.'),
    '## Until next time',
    'Return to the journal for another story, or leave a greeting on the plaza.'
  ].join('\n\n')]
]);
const publicRead = /^\/en-api\/(?:live\/[a-z0-9-]{1,80}\/)?(?:settings|hub-preview|articles(?:\/(?:\d+|categories|featured|daily)(?:\/(?:messages|live\/[a-z0-9-]{1,80}))?)?|messages(?:\/(?:topics|plaza\/latest))?|assets\/gallery(?:\/public)?|pixel-art(?:\/(?:preview|gallery|[a-z0-9_-]+))?|friend-links)\/?$/i;
const textKeys = new Set(['title','content','excerpt','category','caption','name','label','tags','site_name','alt','description','text']);
function englishCopy(value, key) {
  if (typeof value === 'string') return textKeys.has(key) ? copy.get(value) || value : value;
  if (Array.isArray(value)) return value.map(item => englishCopy(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, englishCopy(v,k)]));
  return value;
}
module.exports = function withEnglishSamples(app) {
  const preview = express();
  preview.use((req, res, next) => {
    if (!['GET','HEAD'].includes(req.method) || !publicRead.test(req.path)) return next();
    req.url = req.url.replace(/^\/en-api\//, '/api/');
    delete req.headers.cookie;
    delete req.headers.authorization;
    const json = res.json.bind(res);
    res.json = document => json(englishCopy(document));
    next();
  });
  preview.use(app);
  return preview;
};
