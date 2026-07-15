function jsonParseError(err, req, res, next) {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
        return res.status(413).json({ success: false, message: '请求内容过大' });
    }
    if (err?.code === 'DUPLICATE_JSON_KEY') {
        return res.status(400).json({
            success: false,
            message: '请求 JSON 包含重复键',
            code: 'DUPLICATE_JSON_KEY'
        });
    }
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
    const requestedStatus = Number(err.status || err.statusCode || 500);
    const status = requestedStatus >= 400 && requestedStatus < 500 ? requestedStatus : 500;
    console.error('Unhandled API error', {
        name: String(err?.name || 'Error').slice(0, 80),
        status
    });
    res.status(status).json({
        success: false,
        message: status < 500 && err?.expose === true ? err.message : (status < 500 ? '请求处理失败' : '服务器错误')
    });
}

module.exports = {
    jsonParseError,
    notFound,
    errorHandler
};
