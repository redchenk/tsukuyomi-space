module.exports = {
    version: '013',
    name: 'add_pixel_art_dimensions',
    up(db) {
        const columns = db.prepare('PRAGMA table_info(pixel_artworks)').all().map(column => column.name);
        if (!columns.includes('width')) {
            db.exec('ALTER TABLE pixel_artworks ADD COLUMN width INTEGER');
        }
        if (!columns.includes('height')) {
            db.exec('ALTER TABLE pixel_artworks ADD COLUMN height INTEGER');
        }
        db.exec(`
            UPDATE pixel_artworks
            SET width = COALESCE(width, size),
                height = COALESCE(height, size)
            WHERE width IS NULL OR height IS NULL;
        `);
    }
};
