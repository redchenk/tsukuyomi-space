const express = require('express');
const { getAppReleaseService } = require('../services/native-app-release');

function createAppReleaseRouter(service = null) {
    const router = express.Router();
    router.get('/releases', async (_req, res) => {
        // Cache/coalescing is server-side; visitors cannot bypass it with query
        // parameters or ask this endpoint to fetch arbitrary URLs/installers.
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data: await (service || getAppReleaseService()).get() });
    });
    return router;
}
module.exports = { createAppReleaseRouter };
