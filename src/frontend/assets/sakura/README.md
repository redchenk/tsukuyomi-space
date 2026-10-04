# 月白樱粉素材

来源：用户提供的 `归档.zip`，2026-10-04 配色设计。沿用提供的作品，不重新生成或改变角色。

| 原始文件 | 项目文件 | 尺寸 | 用途 |
| --- | --- | --- | --- |
| 樱花湖畔的月白春景-1.png | moonwhite-lake.webp | 1672 × 941 | 浅色全局背景，中央叠加月白遮罩 |
| 月下樱花少女-2.png | yachiyo-lake.webp | 1672 × 941 | 大厅桌面与手机主视觉 |
| 白发少女与绛红纸伞-3.png | yachiyo-cutout.webp | 1487 × 1058 | 保留为备用原作素材，不参与当前构建 |
| 月下樱花神社-4.png | moonlit-shrine.webp | 1672 × 941 | 暗色全局背景与文章缺省封面 |
| 樱伞下的白发少女-5.png | yachiyo-portrait.webp | 1672 × 941 | 图库缺省封面与网站图标来源 |
| 樱花海滨铁路站-6.png | sakura-station.webp | 1672 × 941 | 尚无像素作品时的缺省封面 |

WebP 使用 Pillow、quality=88、method=6，保留原始尺寸及透明通道。
六张图合计 1,692,432 字节；原始 PNG 合计 13,504,011 字节，缩减约 87.5%。
图片由 Vite 导入并生成带哈希的资源文件；真实用户封面和像素画优先于缺省图。

图标取第 5 张的 `(360, 20, 1160, 820)` 正方形区域，使用 LANCZOS 缩放。
生成 `assets/icons/icon-{32,180,192,512}.png` 和 16/32/48/64 像素的 `favicon.ico`。
构建时从这五个图标生成带内容指纹的资源，并生成引用对应资源的 manifest。
HTML 指向这些不可变资源，不依赖 CDN 是否保留 `v=sakura-20261004` 查询参数。

本轮只移除已被该背景替代、且不再被构建引用的
`src/frontend/assets/moonlit-lake.png`。`yachiyo-hub-stand.png` 仍用于房间分享，
`tsukuyomi-bg.webp` 仍用于现有页面，均保留。Live2D、音乐、模型、上传文件与
Wiki 动态图片不属于本轮清理范围。
