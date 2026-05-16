function createSlug(input, fallback = 'article') {
    const source = String(input || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase();
    const slug = source
        .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/g, '');
    return slug || fallback;
}

module.exports = {
    createSlug
};
