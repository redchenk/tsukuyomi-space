// Express 4 only catches synchronous throws. Install after all routes are
// mounted so rejected middleware/route promises reach the normal error handler.
const wrappers = new WeakMap();

function forwardAsyncErrors(router, visited = new Set()) {
    if (!router || visited.has(router)) return;
    visited.add(router);
    for (const layer of router.stack || router._router?.stack || []) {
        if (layer.route) {
            forwardAsyncErrors(layer.route, visited);
        } else if (layer.handle?.stack) {
            forwardAsyncErrors(layer.handle, visited);
        } else if (typeof layer.handle === 'function' && layer.handle.length < 4) {
            const handler = layer.handle;
            if (!wrappers.has(handler)) {
                const wrapped = function (req, res, next) {
                    const result = handler.call(this, req, res, next);
                    if (result && typeof result.then === 'function') {
                        return Promise.resolve(result).catch(next);
                    }
                    return result;
                };
                wrappers.set(handler, wrapped);
                wrappers.set(wrapped, wrapped);
            }
            layer.handle = wrappers.get(handler);
        }
    }
}

module.exports = { forwardAsyncErrors };
