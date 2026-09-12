const express = require('express');
const categories = require('../repositories/article-category-repository');
const updates = require('../services/article-category-updates');
const { setPrivateNoStore } = require('../services/public-cache');
const { createRateLimiter } = require('../middleware/security');

const publicRouter = express.Router();
publicRouter.use((req, res, next) => { setPrivateNoStore(res); next(); });
publicRouter.use(createRateLimiter({ windowMs: 60000, max: 120, keyPrefix: 'article-categories' }));
publicRouter.get('/', (req, res) => res.json(updates.snapshot()));
publicRouter.get('/changes', updates.waitForChange);

// Mounted only after the existing admin authentication and role guards.
const managementRouter = express.Router();
managementRouter.get('/', (req, res) => res.json(updates.snapshot()));
managementRouter.post('/', (req, res) => {
    try {
        categories.create(req.body?.name);
        res.status(201).json(updates.publish());
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.status ? error.message : '无法添加分类' });
    }
});
managementRouter.delete('/:id', (req, res) => {
    try {
        const result = categories.remove(req.params.id);
        res.json({ ...updates.publish(), ...result });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.status ? error.message : '无法删除分类' });
    }
});

module.exports = { publicRouter, managementRouter };
