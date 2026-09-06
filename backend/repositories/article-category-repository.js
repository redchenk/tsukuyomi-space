const db = require('../db');

function categoryError(message, status = 400) {
    return Object.assign(new Error(message), { status });
}

function list() {
    return db.prepare('SELECT id, name, protected FROM article_categories ORDER BY id').all();
}

function resolveCategory(name, fallback = '其他') {
    const value = name === undefined || name === null || name === '' ? fallback : name;
    if (typeof value !== 'string') throw categoryError('分类名称无效');
    const category = db.prepare('SELECT name FROM article_categories WHERE name = ?').get(value.trim().normalize('NFC'));
    if (!category) throw categoryError('分类已删除或不存在，请重新选择分类', 409);
    return category.name;
}

function validateForUser(name, user, fallback = '其他') {
    const category = resolveCategory(name, fallback);
    if (category === '公告' && !['admin', 'super_admin'].includes(user?.role)) {
        throw categoryError('只有管理员可以发布公告', 403);
    }
    return category;
}

const create = db.transaction((input) => {
    if (typeof input !== 'string') throw categoryError('请输入分类名称');
    const name = input.trim().normalize('NFC');
    if (!name || [...name].length > 32 || /[<>\p{Cc}\p{Cf}]/u.test(name) || name.toLowerCase() === 'all') {
        throw categoryError('分类名称须为 1–32 个字符，不能包含控制字符或尖括号');
    }
    if (db.prepare('SELECT 1 FROM article_categories WHERE name = ?').get(name)) {
        throw categoryError('分类已存在', 409);
    }
    if (list().length >= 100) throw categoryError('最多保留 100 个分类');
    const result = db.prepare('INSERT INTO article_categories (name) VALUES (?)').run(name);
    db.prepare('UPDATE article_category_revision SET version = version + 1 WHERE id = 1').run();
    return { id: Number(result.lastInsertRowid), name, protected: 0 };
});

const remove = db.transaction((id) => {
    if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) throw categoryError('分类 ID 无效');
    const category = db.prepare('SELECT * FROM article_categories WHERE id = ?').get(id);
    if (!category) throw categoryError('分类不存在', 404);
    if (category.protected) throw categoryError('“其他”用于接收未分类文章，不能删除', 409);
    const moved = db.prepare("UPDATE articles SET category = '其他', updated_at = CURRENT_TIMESTAMP WHERE category = ? COLLATE NOCASE")
        .run(category.name).changes;
    db.prepare('DELETE FROM article_categories WHERE id = ?').run(id);
    db.prepare('UPDATE article_category_revision SET version = version + 1 WHERE id = 1').run();
    return { removed: category.name, moved, fallback: '其他' };
});

function revision() {
    return String(db.prepare('SELECT version FROM article_category_revision WHERE id = 1').get().version);
}

module.exports = { list, create, remove, resolveCategory, validateForUser, revision };
