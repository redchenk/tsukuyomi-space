const copy = require('../../shared/seo-pages.json');
const articles = require('../repositories/article-repository');
const messages = require('../repositories/message-repository');
const social = require('../repositories/social-repository');
const { articlePath } = require('./render-article');
const { renderSeoCollectionPage } = require('./render-pages');

const destinations = Object.entries(copy).filter(([path]) => path !== '/').map(([href, value]) => ({ href, title: value.title, description: value.description }));
function articleItems(rows) { return rows.map(a => ({ href: articlePath(a), title: a.title, description: a.excerpt, meta: `${a.author_nickname || a.author_username || '月读空间'} · ${a.published_at || a.created_at || a.publish_date || ''}`, image: a.cover_image })); }
function renderPublicPage(path) {
    let items = destinations;
    if (path === '/hub' || path === '/') items = [...destinations, ...articleItems(articles.listRecentPublishedArticles(8))];
    if (path === '/plaza') items = messages.listRecentPublicMessages(12).map(m => ({ href: `/plaza#message-${m.id}`, title: `${m.author_nickname || m.author}的公开留言`, description: m.content, meta: m.created_at }));
    if (path === '/room') items = [
        { href: '/room/settings', title: '连接聊天模型与语音', description: '选择模型服务商、配置 API 端点与密钥，并测试连接。语音可按需开启，未配置时仍可使用文字聊天。' },
        { href: '/wiki/characters/yachiyo', title: '了解月见八千代', description: '查看原作角色资料与来源。房间中的八千代属于 AI 角色体验，生成回复可能存在错误。' },
        { href: '/reality', title: '记忆、日记与隐私', description: '长期记忆支持本地语义检索和重要度、置信度管理。日记记录对话；登录后可以同步账号数据，私人内容不会进入公开页面。' }
    ];
    if (path === '/reality') items = [
        { href: 'https://github.com/redchenk/tsukuyomi-space', title: '项目源码与说明', description: '月读空间网站的开源仓库，包含使用说明、部署方式与项目致谢。' },
        { href: 'https://github.com/astrbotdevs/astrbot', title: 'AstrBot', description: '感谢 AstrBot 的聊天与 Agent 协议设计参考。' },
        { href: 'https://github.com/mem0ai/mem0', title: 'Mem0', description: '感谢 Mem0 的长期记忆设计参考与开源贡献。' },
        { href: '/wiki', title: '作品资料与版权', description: '本站是非官方粉丝项目，角色与作品版权归原作者和权利人所有。公开创作请注明来源与授权；AI 输出需自行判断。' }
    ];
    if (path === '/download') {
        const release = require('../../shared/native-app-release.json');
        const version = release.tag_name.match(/^v(\d+\.\d+\.\d+)/)[1];
        const packages = [
            ['windows-x64-setup.exe', 'Windows 10 / 11 x64', '普通用户选择 EXE 安装器。便携 ZIP 用于解压运行。'],
            ['macos-universal.dmg', 'macOS 通用版', '同一个 DMG 支持 Apple Silicon 与 Intel，将应用拖入 Applications。'],
            ['android-arm64-v8a.apk', 'Android 常见手机', 'ARM64 APK 适合绝大多数手机；x86_64 文件用于对应模拟器。'],
            ['linux-x64.deb', 'Linux x64', 'Ubuntu 22.04 / 兼容 Debian 环境推荐 DEB 安装包。'],
            ['ios-arm64-unsigned.ipa', 'iPhone / iPad 自签包', '未签名 IPA 需要自己的 Apple 账号或证书签名，不能直接安装。']
        ];
        items = packages.map(([suffix, title, description]) => ({
            title, description, meta: release.tag_name,
            href: `https://github.com/redchenk/tsukuyomi-space-app/releases/download/${release.tag_name}/tsukuyomi-space-${version}-${suffix}`
        }));
        return renderSeoCollectionPage({ path, ...copy[path], items,
            facts: [['已验证版本', release.tag_name], ['下载来源', '安装包直接由 GitHub 提供，本站不转存或代理。']],
            actions: [
                { href: release.html_url, label: 'GitHub 版本说明' },
                { href: `https://github.com/redchenk/tsukuyomi-space-app/blob/${release.tag_name}/docs/release-guide.md`, label: '安装说明' },
                { href: `https://github.com/redchenk/tsukuyomi-space-app/releases/download/${release.tag_name}/SHA256SUMS.txt`, label: 'SHA-256 校验清单' }
            ] });
    }
    return renderSeoCollectionPage({ path, ...copy[path], items });
}
function renderStagePage(query = {}) {
    const page = Math.min(10000, Math.max(1, Number.parseInt(query.page, 10) || 1));
    const params = new URLSearchParams();
    if (page > 1) params.set('page', page);
    const sort = ['latest', 'pinned', 'featured', 'daily'].includes(query.sort) ? query.sort : 'latest';
    const category = typeof query.category === 'string' ? query.category.slice(0, 80) : '';
    const search = typeof query.q === 'string' ? query.q.slice(0, 120) : '';
    const result = articles.listArticles({ limit: 6, offset: (page - 1) * 6, sort, category, query: search });
    const noindex = Boolean(search || category || sort !== 'latest' || (page > 1 && !result.articles.length));
    const actions = [{ href: '/stage', label: '最新文章首页' }, ...(page > 1 ? [{ href: page === 2 ? '/stage' : `/stage?page=${page - 1}`, label: '上一页' }] : []), ...(result.total > page * 6 ? [{ href: `/stage?page=${page + 1}`, label: '下一页' }] : [])];
    let html = renderSeoCollectionPage({ path: `/stage${params.size ? `?${params}` : ''}`, ...copy['/stage'], title: copy['/stage'].title + (page > 1 ? `｜第 ${page} 页` : ''), items: articleItems(result.articles), actions });
    if (noindex) html = html.replace(/content="index,follow[^"]*"/, 'content="noindex,follow"');
    return { html, noindex };
}
function renderProfilePage(username) {
    const user = social.findUserByUsername(username);
    if (!user) return null;
    const name = user.nickname || user.username;
    return renderSeoCollectionPage({
        path: `/users/${encodeURIComponent(user.username)}`, title: `${name}的公开创作者主页｜月读空间`,
        description: `${name}在月读空间的公开主页。${user.bio || '浏览这位创作者公开发布的文章与作品，了解创作内容、阅读正文并参与讨论。'}这里仅展示公开资料与已发布文章，登录后可通过现有关注和互动功能与创作者交流。`.slice(0, 170),
        heading: `${name}的公开主页`, items: articleItems(social.listPublicArticlesByAuthor(user.id, { limit: 12 })),
        actions: [{ href: '/stage', label: '浏览主舞台' }]
    });
}
module.exports = { renderPublicPage, renderStagePage, renderProfilePage };
