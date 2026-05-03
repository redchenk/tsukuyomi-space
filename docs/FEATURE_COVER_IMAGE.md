# 文章封面图片功能文档

## 📖 功能说明

v2.0.0 新增文章封面图片上传和显示功能，支持用户在投稿时上传封面图片，并在文章列表中展示。

---

## 🎨 功能特点

### 前端特性

1. **封面上传**
   - 支持点击或拖拽上传
   - 自动压缩到 1200x630px（JPEG 70% 质量）
   - 实时预览上传效果
   - 一键删除已上传的封面

2. **封面显示**
   - 文章列表右侧显示封面（45% 宽度）
   - 固定卡片高度 160px
   - 图片左右两侧渐变虚化（各 100px）
   - 悬停时图片放大效果
   - 箭头显示在封面上

3. **响应式设计**
   - 桌面端：封面在右侧
   - 移动端：封面在顶部（100% 宽度）

---

## 🔧 技术实现

### 前端实现

**src/frontend/pages/EditorPage.vue - 封面上传**
```javascript
// 压缩图片函数
function compressImage(file, maxWidth = 1200, maxHeight = 630, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                // 计算缩放比例并绘制
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
```

**src/frontend/pages/StagePage.vue - 封面显示**
```html
<div class="article-item">
    <div class="article-content">
        <!-- 文章内容 -->
    </div>
    ${article.cover_image ? `
        <div class="article-cover-wrapper">
            <img src="${article.cover_image}" alt="封面" class="article-cover">
            <span class="arrow-overlay">→</span>
        </div>
    ` : ''}
</div>
```

### 后端实现

**server.js - API 修改**
```javascript
// 增加请求体限制
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 投稿 API 支持封面
app.post('/api/articles', authenticateToken, (req, res) => {
    const { title, excerpt, content, category, tags, read_time, cover_image } = req.body;
    
    db.prepare(`
        INSERT INTO articles (title, excerpt, content, category, tags, author_id, publish_date, read_time, cover_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, excerpt, content, category, tagsJson, req.user.id, publishDate, read_time, cover_image);
});
```

### 数据库修改

```sql
-- 添加 cover_image 字段
ALTER TABLE articles ADD COLUMN cover_image TEXT;
```

---

## 📊 数据格式

### API 请求格式

```json
POST /api/articles
Authorization: Bearer <token>

{
    "title": "文章标题",
    "category": "技术",
    "read_time": "5 min",
    "excerpt": "文章摘要",
    "content": "文章内容",
    "cover_image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

### 封面图片规格

| 参数 | 要求 |
|------|------|
| 格式 | JPG, PNG, GIF, WebP |
| 最大文件大小 | 5MB |
| 推荐尺寸 | 1200x630px |
| 压缩质量 | 70% JPEG |
| 存储格式 | Base64 Data URL |

---

## 🎯 使用流程

### 1. 上传封面

1. 访问 `/editor`
2. 点击封面上传区域
3. 选择图片文件
4. 自动压缩并预览
5. 可点击 × 删除重新上传

### 2. 填写文章信息

- 标题（必填）
- 分类（必填）
- 阅读时间（必填）
- 摘要（必填，200 字以内）
- 正文（必填）

### 3. 提交投稿

点击"投稿"按钮，成功后跳转到文章列表。

---

## 🎨 CSS 样式

### 封面容器
```css
.article-cover-wrapper {
    width: 45%;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
}
```

### 渐变遮罩
```css
.article-cover-wrapper::before {
    content: '';
    position: absolute;
    left: 0;
    width: 100px;
    background: linear-gradient(90deg, 
        rgba(26,16,37,0.9) 0%,
        rgba(26,16,37,0.6) 30%,
        rgba(26,16,37,0.3) 50%,
        rgba(26,16,37,0.1) 70%,
        transparent 100%
    );
}
```

### 悬停动画
```css
.article-item:hover .article-cover {
    transform: scale(1.05);
}

.article-item:hover .arrow-overlay {
    color: rgba(255,107,157,0.9);
    transform: translateX(4px);
}
```

---

## ⚠️ 注意事项

1. **性能优化**
   - 图片自动压缩减少传输大小
   - Base64 编码会增加约 33% 体积
   - 建议上传前手动压缩到 500KB 以下

2. **浏览器兼容**
   - 需要支持 FileReader API
   - 需要支持 Canvas API
   - 现代浏览器均可正常使用

3. **存储限制**
   - SQLite 数据库大小限制
   - 建议定期清理旧文章
   - 大量图片可考虑使用对象存储

---

## 📝 更新日志

### v2.0.0 (2026-03-30)
- ✅ 新增封面上传功能
- ✅ 新增封面显示功能
- ✅ 自动压缩图片
- ✅ 渐变遮罩效果
- ✅ 悬停动画
- ✅ 响应式布局

---

## 🔗 相关文件

- `src/frontend/pages/EditorPage.vue` - 编辑器页面
- `src/frontend/pages/StagePage.vue` - 文章列表页面
- `backend/routes/articles.js` - 文章 API
- `docs/FEATURE_COVER_IMAGE.md` - 本文档

---

## 📞 技术支持

如有问题，请提交 Issue 或联系 [@redchenk](https://github.com/redchenk)
