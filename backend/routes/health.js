const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Tsukuyomi Space API is running',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
