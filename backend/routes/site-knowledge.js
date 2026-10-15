const express = require('express');
const knowledge = require('../services/site-knowledge');
const router = express.Router();
// POST prevents chat-derived questions appearing in URL/access logs. This is read-only.
router.post('/search', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const query = req.body?.query;
    if (typeof query !== 'string' || !query.trim() || query.length > 400) {
        return res.status(400).json({ success: false, message: 'Question must contain 1 to 400 characters.' });
    }
    const data = await knowledge.search(query, { allowSpoilers: req.body.allowSpoilers === true, scope: req.body.scope });
    return res.json({ success: true, data });
});
module.exports = router;
