// Local test content only; tests/e2e-server.cjs always uses a disposable database.
module.exports = {
    id: '3', title: '月下的创作手记', category: '技术', author_username: 'admin',
    content_format: 'markdown', published_at: '2026-09-13T08:00:00Z', read_time: null,
    cover_image: '/assets/images/tsukuyomi-bg.webp',
    content: [
        '## 从一个小小的想法开始',
        '夜晚安静下来时，给自己留一小块可以自由创作的地方。它可以是一篇文章、一幅像素画，也可以是与朋友分享的一个念头。',
        '好的空间让人愿意停留，也让人容易找到想看的内容。我们把故事、作品和交流放在一起，让每一次来访都有新的发现。',
        '## 把故事留下',
        '记录不必等待灵感完整。把今天读到的句子、调试时的发现和偶然的相遇写下来，它们会慢慢成为自己的创作档案。',
        '### 阅读的节奏',
        '标题帮助读者辨认方向，留白让眼睛有时间休息。图片可以讲述故事，文字则把故事延续下去。',
        '> 给日常留一点月光，也给创作留一点耐心。',
        '## 在月光下相遇',
        ...Array(4).fill('每一份作品都从好奇开始。愿意尝试、愿意分享的人，让这个小小的空间变得有温度。写下一句话，画下一个像素，都是故事的开始。'),
        '## 下一次见',
        '读完之后，可以回到主舞台继续探索，也可以到广场留下今天的问候。期待下一次相遇。'
    ].join('\n\n')
};
