// Synthetic preview content. Invoked only by the disposable UI preview server.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function seedJingyue({ db, sourceRoot, fixtureRoot }) {
  const images = [
    ['seasons/autumn-v2/hero-scene.webp', '在秋天的湖畔，给自己留一盏灯'],
    ['sakura/sakura-station.webp', '等一场樱花，也等一个好故事'],
    ['seasons/winter-v1/article-cover.webp', '冬日来信：慢一点，也没关系'],
    ['sakura/moonlit-shrine.webp', '月下散步，拾起生活里的微光'],
    ['seasons/summer-v1/sparkler-cover.webp', '夏夜的声音，有风也有你'],
    ['sakura/moonwhite-lake.webp', '把月色写进一封很长的信'],
    ['seasons/autumn-v2/pixel-workshop.webp', '用像素搭建一个小小的世界'],
    ['seasons/winter-v1/hero-scene.webp', '下雪的时候，想起那些温暖的事']
  ];
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run('月下旅人', 'e2e-user-001');
  db.prepare("UPDATE articles SET status = 'draft' WHERE id = 987601").run();
  const insert = db.prepare('INSERT INTO articles(id,title,excerpt,content,content_format,author_id,status,category,cover_image,created_at,updated_at,view_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  const insertImage = db.prepare('INSERT INTO article_assets(id,owner_id,asset_type,mime_type,url,storage_key,metadata,created_at) VALUES(?,?,?,?,?,?,?,?)');
  const content = require('./editorial-article.cjs').content;
  images.forEach(([source, title], index) => {
    const name = `jingyue-${index}.webp`;
    fs.copyFileSync(path.join(sourceRoot, 'src/frontend/assets', source), path.join(fixtureRoot, 'assets/uploads', name));
    const url = `/assets/uploads/${name}`;
    const date = `2026-11-${String(10 - index).padStart(2, '0')} 09:00:00`;
    insert.run(988000 + index, title, '在平凡的日子里收集光与声音。这里记录创作的片刻、偶然的相遇，以及那些值得慢慢读完的故事。', content, 'markdown', 'e2e-user-001', 'published', index % 2 ? '其他' : '二创', url, date, date, 128 + index * 93);
    insertImage.run(`jingyue-art-${index}`, 'e2e-user-001', 'image', 'image/webp', url, url.slice(1), JSON.stringify({ collection: 'gallery', visibility: 'public', title, caption: '本地设计预览 · 站内原有季节插画', tags: ['风景', '月读空间'] }), date);
  });
};
