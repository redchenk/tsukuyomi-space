const express = require('express');
const adminRepository = require('../repositories/admin-repository');

const router = express.Router();

function parseSettingValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
}

router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Tsukuyomi Space API is running',
        timestamp: new Date().toISOString()
    });
});

router.get('/settings', (req, res) => {
    const settings = Object.fromEntries(
        adminRepository.listSettings().map(row => [row.key, parseSettingValue(row.value)])
    );
    res.json({
        success: true,
        data: {
            siteTitle: settings.siteTitle || '月读空间',
            siteAnnouncement: settings.siteAnnouncement || '',
            visitPopupEnabled: settings.visitPopupEnabled === true,
            visitPopupTitle: settings.visitPopupTitle || '欢迎来到月读空间',
            visitPopupContent: settings.visitPopupContent || '',
            visitPopupButton: settings.visitPopupButton || '我知道了'
        }
    });
});

module.exports = router;
