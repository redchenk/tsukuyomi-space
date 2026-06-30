function setPublicReadCache(res, { maxAge = 10, stale = 30, vary = 'Origin, Accept-Encoding' } = {}) {
    res.set({
        'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${stale}`,
        Vary: vary
    });
    res.removeHeader('Pragma');
    res.removeHeader('Expires');
    res.removeHeader('Surrogate-Control');
}

function setPrivateNoStore(res, { vary = 'Origin, Cookie, Authorization, Accept-Encoding' } = {}) {
    res.set({
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Surrogate-Control': 'no-store',
        Vary: vary
    });
}

module.exports = {
    setPublicReadCache,
    setPrivateNoStore
};
