function jsonParseError(err, req, res, next) {
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ success: false, message: '请求 JSON 格式无效' });
    }
    next(err);
}

function notFound(req, res) {
    res.status(404).json({ success: false, message: '接口不存在' });
}

function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);
    console.error('Unhandled API error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || '服务器错误'
    });
}

module.exports = {
    jsonParseError,
    notFound,
    errorHandler
};
