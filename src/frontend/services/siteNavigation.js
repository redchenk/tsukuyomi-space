const copy = {
  zh: {
    search: '搜索月读空间', searchHint: '搜索页面、文章…', account: '账号菜单', enterRoom: '进入房间',
    explore: '探索', exploreTitle: '还有一些值得逛逛的地方', discover: '阅读与发现', create: '创作与游玩', spaces: '更多空间', friendLinks: '友情链接',
    shortcuts: '页面入口', articles: '公开文章', searchTitle: '想找些什么？', close: '关闭搜索',
    loading: '正在查找文章…', empty: '没有找到匹配内容，换个关键词试试。', failed: '文章暂时加载失败，页面入口仍可使用。',
    allArticles: '查看全部文章结果', retry: '重试', searchHelp: '搜索公开文章或快速前往页面',
    shortLabels: { hub: '中枢', room: '房间', plaza: '广场', stage: '舞台' },
    descriptions: { wiki: '角色、音乐与月读世界', gallery: '收集与分享喜欢的创作', pixel: '把灵感画进小小像素', game: '跟着节拍，轻松玩一局', agentOs: '打开你的智能工作空间', reality: '关于本站与开源项目', friendLinks: '去看看同频的小站' }
  },
  en: {
    search: 'Search Tsukuyomi', searchHint: 'Search pages and articles…', account: 'Account menu', enterRoom: 'Enter room',
    explore: 'Explore', exploreTitle: 'A little more to discover', discover: 'Read & discover', create: 'Create & play', spaces: 'More spaces', friendLinks: 'Friend links',
    shortcuts: 'Pages', articles: 'Public articles', searchTitle: 'What are you looking for?', close: 'Close search',
    loading: 'Searching articles…', empty: 'No matches. Try another keyword.', failed: 'Articles could not be loaded. Page shortcuts are still available.',
    allArticles: 'View all article results', retry: 'Retry', searchHelp: 'Find public articles or jump to a page',
    shortLabels: { hub: 'Hub', room: 'Room', plaza: 'Plaza', stage: 'Stage' },
    descriptions: { wiki: 'Characters, music and worlds', gallery: 'Discover and share artwork', pixel: 'Turn ideas into tiny pixels', game: 'Play along with the rhythm', agentOs: 'Your intelligent workspace', reality: 'About this site and its sources', friendLinks: 'Visit neighboring spaces' }
  },
  ja: {
    search: '月読空間を検索', searchHint: 'ページ・記事を検索…', account: 'アカウント', enterRoom: '部屋に入る',
    explore: '探索', exploreTitle: 'まだ知らない場所へ', discover: '読む・見つける', create: 'つくる・遊ぶ', spaces: 'ほかの空間', friendLinks: 'リンク集',
    shortcuts: 'ページ', articles: '公開記事', searchTitle: '何を探していますか？', close: '検索を閉じる',
    loading: '記事を検索中…', empty: '見つかりませんでした。別の言葉で検索してください。', failed: '記事を読み込めません。ページへの移動は利用できます。',
    allArticles: '記事の検索結果をすべて見る', retry: '再試行', searchHelp: '公開記事を検索、またはページへ移動',
    shortLabels: { hub: 'ホーム', room: '部屋', plaza: '広場', stage: '舞台' },
    descriptions: { wiki: 'キャラクター・音楽・世界観', gallery: '好きな作品を見つけて共有', pixel: '小さなピクセルで描こう', game: 'リズムに合わせて遊ぼう', agentOs: 'インテリジェントな作業空間', reality: 'このサイトとオープンソース', friendLinks: 'つながるサイトを訪ねよう' }
  }
};

const aliases = {
  hub: '中枢 大厅 首页 home hub', room: '房间 私人居所 八千代 yachiyo chat room',
  stage: '文章 主舞台 创作 article stage', plaza: '广场 留言 评论 community plaza',
  wiki: '百科 角色 音乐 wiki', gallery: '图库 图片 插画 gallery', pixel: '像素 工坊 pixel arena',
  game: '游戏 辉夜快跑 game', friendLinks: '友链 友情链接 friends', reality: '现实 关于 感谢 about',
  notifications: '通知 站内信 inbox notifications', account: '用户 个人中心 account profile',
  growth: '成长 月契 bond growth', attachments: '附件 上传 attachment', agentOs: 'agent os 智能 工作空间'
};

export function navigationCopy(lang) { return copy[lang] || copy.zh; }

export function filterNavigationItems(items, query) {
  const terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    const haystack = `${item.label} ${item.path} ${aliases[item.key] || ''}`.toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}
