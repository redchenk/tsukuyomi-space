const express = require('express');
const { requireSuperAdmin } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/security');
const service = require('../services/play-testing');
const invitations = require('../services/play-test-invitations');
const invitationSettings = require('../services/play-test-invitation-settings');
const router = express.Router(), adminRouter = express.Router();
const noStore = (_req,res,next) => { res.set('Cache-Control','private, no-store'); next(); };
const handle = (fn, status = 200) => async (req,res) => {
    try { res.status(status).json({ success: true, data: await fn(req) }); }
    catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : '暂时无法处理，请稍后重试' }); }
};
router.use(noStore);
router.get('/',handle(() => service.settings()));
router.post('/',createRateLimiter({ windowMs: 3600000, max: 12, keyPrefix: 'play-application' }),handle(req => service.apply(req.body),202));
// Mounted beneath the existing, separately authenticated admin router.
adminRouter.use(requireSuperAdmin, noStore);
adminRouter.get('/',handle(req => service.list(req.query)));
adminRouter.get('/settings',handle(() => service.settings()));
adminRouter.post('/settings',handle(req => service.saveSettings(req.body)));
adminRouter.get('/invitation-settings',handle(() => invitationSettings.get()));
adminRouter.post('/invitation-settings',handle(req => invitationSettings.save(req.body)));
adminRouter.get('/export', (req,res) => {
    try { res.type('text/csv').attachment('google-play-testers.csv').send(service.csv(req.query)); }
    catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : '导出失败，请稍后重试' }); }
});
adminRouter.post('/:id/status',handle(req => service.update(req.params.id,req.body)));
adminRouter.get('/:id/invitation-preview',handle(req => invitations.preview(req.params.id)));
adminRouter.post('/:id/invite',createRateLimiter({ windowMs: 60000, max: 12, keyPrefix: 'play-invitation' }),handle(req => invitations.send(req.params.id,req.body,req.user.adminId)));
adminRouter.delete('/:id',handle(req => service.remove(req.params.id,req.body)));
module.exports = { router, adminRouter };
