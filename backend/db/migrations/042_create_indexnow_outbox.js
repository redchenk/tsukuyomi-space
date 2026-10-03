module.exports = {
    version: '042', name: 'create_indexnow_outbox',
    up(db) {
        db.exec(`CREATE TABLE seo_indexnow_outbox (
            path TEXT NOT NULL, host TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
            available_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, http_status INTEGER,
            PRIMARY KEY(path, host)
        ); CREATE INDEX seo_indexnow_due ON seo_indexnow_outbox(status, available_at);`);
        const enqueue = (path, condition = '1') => ['yachiyo.hk', 'tsukuyomi-space.com'].map(host => `
            INSERT INTO seo_indexnow_outbox(path, host, available_at, updated_at) SELECT ${path}, '${host}', unixepoch()*1000+60000, unixepoch()*1000 WHERE ${condition}
            ON CONFLICT(path,host) DO UPDATE SET revision=revision+1, status='pending', attempts=0,
                available_at=excluded.available_at, updated_at=excluded.updated_at;`).join('\n');
        const articlePath = prefix => `'\/articles/' || ${prefix}.id || CASE WHEN ${prefix}.slug IS NOT NULL AND ${prefix}.slug != '' THEN '/' || ${prefix}.slug ELSE '' END`;
        db.exec(`
            CREATE TRIGGER seo_article_insert AFTER INSERT ON articles WHEN COALESCE(NEW.status,'published')='published' BEGIN
                ${enqueue(articlePath('NEW'))} ${enqueue("'/stage'")} ${enqueue("'/hub'")}
            END;
            CREATE TRIGGER seo_article_update AFTER UPDATE OF title, slug, excerpt, content, content_format, cover_image, category, status ON articles
                WHEN COALESCE(NEW.status,'published')='published' OR COALESCE(OLD.status,'published')='published' BEGIN
                ${enqueue(articlePath('OLD'), "COALESCE(OLD.status,'published')='published'")} ${enqueue(articlePath('NEW'), "COALESCE(NEW.status,'published')='published'")} ${enqueue("'/stage'")} ${enqueue("'/hub'")}
            END;
            CREATE TRIGGER seo_article_delete AFTER DELETE ON articles WHEN COALESCE(OLD.status,'published')='published' BEGIN
                ${enqueue(articlePath('OLD'))} ${enqueue("'/stage'")} ${enqueue("'/hub'")}
            END;
            CREATE TRIGGER seo_pixel_insert AFTER INSERT ON pixel_artworks BEGIN ${enqueue("'/pixel?art=' || NEW.id")} ${enqueue("'/pixel'")} END;
            CREATE TRIGGER seo_pixel_update AFTER UPDATE OF title, description, pixels, width, height ON pixel_artworks BEGIN ${enqueue("'/pixel?art=' || NEW.id")} ${enqueue("'/pixel'")} END;
            CREATE TRIGGER seo_pixel_delete AFTER DELETE ON pixel_artworks BEGIN ${enqueue("'/pixel?art=' || OLD.id")} ${enqueue("'/pixel'")} END;
            CREATE TRIGGER seo_plaza_insert AFTER INSERT ON messages WHEN NEW.article_id IS NULL AND COALESCE(NEW.status,'approved')='approved' BEGIN ${enqueue("'/plaza'")} END;
            CREATE TRIGGER seo_plaza_update AFTER UPDATE OF status, content ON messages WHEN NEW.article_id IS NULL AND (COALESCE(NEW.status,'approved')='approved' OR COALESCE(OLD.status,'approved')='approved') BEGIN ${enqueue("'/plaza'")} END;
            CREATE TRIGGER seo_plaza_delete AFTER DELETE ON messages WHEN OLD.article_id IS NULL AND COALESCE(OLD.status,'approved')='approved' BEGIN ${enqueue("'/plaza'")} END;
            CREATE TRIGGER seo_gallery_insert AFTER INSERT ON article_assets WHEN NEW.metadata LIKE '%"collection":"gallery"%' OR NEW.metadata LIKE '%"collection": "gallery"%' OR NEW.metadata LIKE '%"gallery":true%' OR NEW.metadata LIKE '%"gallery": true%' BEGIN ${enqueue("'/gallery'")} END;
            CREATE TRIGGER seo_gallery_update AFTER UPDATE OF metadata, url ON article_assets WHEN NEW.metadata LIKE '%"gallery"%' OR OLD.metadata LIKE '%"gallery"%' BEGIN ${enqueue("'/gallery'")} END;
            CREATE TRIGGER seo_gallery_delete AFTER DELETE ON article_assets WHEN OLD.metadata LIKE '%"gallery"%' BEGIN ${enqueue("'/gallery'")} END;
            CREATE TRIGGER seo_friend_insert AFTER INSERT ON friend_links WHEN NEW.status='active' BEGIN ${enqueue("'/friend-links'")} END;
            CREATE TRIGGER seo_friend_update AFTER UPDATE OF name, url, description, status ON friend_links WHEN NEW.status='active' OR OLD.status='active' BEGIN ${enqueue("'/friend-links'")} END;
            CREATE TRIGGER seo_friend_delete AFTER DELETE ON friend_links WHEN OLD.status='active' BEGIN ${enqueue("'/friend-links'")} END;
        `);
        // Initial metadata-only inventory. It runs once, without article bodies
        // or pixel grids; writes and notifications stay in separate phases.
        for (const row of db.prepare("SELECT id, slug FROM articles WHERE COALESCE(status,'published')='published'").all()) {
            db.exec(enqueue(`'${(`/articles/${row.id}/${row.slug || ''}`).replace(/'/g, "''")}'`));
        }
        for (const row of db.prepare('SELECT id FROM pixel_artworks').all()) db.exec(enqueue(`'/pixel?art=${row.id}'`));
        for (const path of Object.keys(require('../../../shared/seo-pages.json'))) db.exec(enqueue(`'${path}'`));
        for (const entry of require('../../seo/wiki-content').WIKI_ENTRIES) {
            const segment = entry.kind === 'character' ? 'characters' : 'terms';
            db.exec(enqueue(`'/wiki/${segment}/${entry.slug}'`));
        }
        for (const slug of ['chou-kaguya-hime', 'yachiyo-live2d', 'ai-character-room', 'kaguya-yachiyo', 'cosmic-princess-kaguya-wiki', 'pixel-art-community']) db.exec(enqueue(`'/topics/${slug}'`));
    }
};
