const db = require('../db');
const assetRepository = require('../repositories/asset-repository');
const notificationRepository = require('../repositories/notification-repository');

function likeGalleryImage(assetId, actor) {
    return db.transaction(() => {
        const asset = assetRepository.findGalleryAssetById(assetId, actor.id);
        if (!asset) return null;
        const added = db.prepare(`
            INSERT INTO gallery_likes (user_id, asset_id) VALUES (?, ?)
            ON CONFLICT(user_id, asset_id) DO NOTHING
        `).run(actor.id, asset.id).changes > 0;
        // The like and inbox notification commit together. Duplicate retries
        // acknowledge the existing like without sending another notification.
        if (added && asset.owner_id && asset.owner_id !== actor.id) {
            const actorName = actor.nickname || actor.username || '用户';
            const imageName = String(asset.metadata?.title || asset.metadata?.fileName || '图库图片').slice(0, 180);
            notificationRepository.createNotification({
                userId: asset.owner_id,
                actorId: actor.id,
                type: 'like',
                title: `${actorName} 点赞了你的图库图片《${imageName}》`,
                content: '你的图库图片收到了一个赞。',
                link: `/gallery?image=${encodeURIComponent(asset.id)}`,
                metadata: { actorName, assetId: asset.id, kind: 'gallery' }
            });
        }
        return {
            id: asset.id,
            like_count: Number(asset.like_count || 0) + Number(added),
            viewer_liked: true
        };
    })();
}

module.exports = { likeGalleryImage };
