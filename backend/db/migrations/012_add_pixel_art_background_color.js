module.exports = {
    version: '012',
    name: 'add_pixel_art_background_color',
    up(db) {
        const columns = db.prepare('PRAGMA table_info(pixel_artworks)').all();
        const hasBackgroundColor = columns.some(column => column.name === 'background_color');
        if (!hasBackgroundColor) {
            db.exec(`
                ALTER TABLE pixel_artworks
                ADD COLUMN background_color TEXT NOT NULL DEFAULT '#0b1020';
            `);
        }
    }
};
