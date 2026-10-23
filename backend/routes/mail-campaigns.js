const router = require('express').Router();
const { requireSuperAdmin } = require('../middleware/auth');
const campaigns = require('../services/mail-campaigns');
router.use(requireSuperAdmin);
router.use((_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
const handle = fn => (req,res) => {
    try { res.json({ success: true, data: fn(req) }); }
    catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : '邮件操作失败，请稍后重试' }); }
};
router.get('/',handle(() => ({ configured: campaigns.configured(), campaigns: campaigns.list() })));
router.get('/recipients',handle(req => campaigns.listRecipients(req.query)));
router.post('/preview',handle(req => campaigns.prepare(req.user.id,req.body)));
router.get('/:id',handle(req => ({ campaign: campaigns.getCampaign(req.params.id), recipients: campaigns.campaignRecipients(req.params.id,req.query.page) })));
router.post('/:id/send',handle(req => campaigns.enqueue(req.params.id,req.user.id)));
router.post('/:id/cancel',handle(req => campaigns.cancel(req.params.id,req.user.id)));
module.exports = router;
