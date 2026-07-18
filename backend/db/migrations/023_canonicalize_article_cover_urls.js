module.exports = {
    version: '023',
    name: 'canonicalize_article_cover_urls',
    up(db) {
        db.exec(`
            UPDATE articles
            SET cover_image = '/api/assets/proxy/' || cover_image_asset_id
            WHERE cover_image_asset_id IS NOT NULL
              AND trim(cover_image_asset_id) != ''
              AND EXISTS (
                  SELECT 1
                  FROM article_assets
                  WHERE article_assets.id = articles.cover_image_asset_id
              );
        `);
    }
};
