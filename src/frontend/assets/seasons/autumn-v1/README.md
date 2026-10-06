# 红叶月夜 · 秋季素材 v1

2026-10-06 使用内置 imagegen，根据用户秋季参考先生成素材，再接入季节主题并本地验证。采用轻量双站发布。使用方式见 [四季主题](../../../../../docs/season-themes.md)。

红枫、金色满月、灯笼与湖面倒影，保留八千代银白长发、粉色发梢、双环发饰与红纸伞。枫叶纹红／深蓝和服属于季节美术设计。

| 文件 | 用途 |
| --- | --- |
| background-light.webp | 浅色全局背景、图库缺省封面 |
| background-dark.webp | 同场景暗色全局背景 |
| hero-scene.webp | 大厅 Hero 场景 |
| hero-cutout.webp | 完整人物与纸伞的真实透明备用素材；不引入应用构建 |
| article-cover.webp | 文章缺省封面与导航预览 |
| pixel-workshop.webp | 像素工坊缺省封面；栅格插画，不是可编辑像素作品 |

六张 WebP 合计 2,983,004 字节，应用使用的五张合计 2,098,326 字节。原始 PNG 在工作区 `output/imagegen/autumn-v1/`，完整提示词见 `prompts.json`，尺寸、用途、Alpha 和 SHA-256 见 `manifest.json`。透明图保留全部原始 Alpha 字节。

背景遮罩、页面布局、配色与圆角沿用网站；浅暗素材不会更改按钮或文字颜色。Hero 裁切桌面 72% top、手机 75% center，复用夏季的既有框架。
