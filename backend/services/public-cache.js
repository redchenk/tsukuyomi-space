function setPrivateNoStore(res, { vary = 'Origin, Cookie, Authorization, Accept-Encoding' } = {}) {
    res.set({
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Surrogate-Control': 'no-store',
        Vary: vary
    });
}

function setPublicReadCache(res, { vary = 'Origin, Cookie, Authorization, Accept-Encoding' } = {}) {
    // Public content APIs are mutable. Shared CDN caching made newly published data stale for days.
    setPrivateNoStore(res, { vary });
}

module.exports = {
    setPublicReadCache,
    setPrivateNoStore
};
