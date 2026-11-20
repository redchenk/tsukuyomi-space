function profileDescription(user, articles) {
    const name = user.nickname || user.username;
    const titles = articles.slice(0, 2).map(article => article.title).filter(Boolean);
    const introduction = `${name}在月读空间的公开创作者主页。`;
    const works = titles.length ? `公开作品包括${titles.map(title => `《${title}》`).join('、')}。` : '';
    return Array.from([introduction, user.bio?.trim(), works].filter(Boolean).join(' ')).slice(0, 170).join('');
}
module.exports = { profileDescription };
