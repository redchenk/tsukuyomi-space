# 雪夜灯语 · 冬季素材 v1

2026-10-06，在秋季制作并本地接入后，使用内置 imagegen 根据用户冬季参考生成、接入并验证。采用轻量双站发布。使用方式见 [四季主题](../../../../../docs/season-themes.md)。

雪覆梅枝、冷蓝月夜、暖灯笼、湖畔小镇。八千代保留银白长发、粉色发梢、双环发饰、金色发簪和红纸伞，穿深蓝／绯红冬季和服与白色绒边披肩。服饰属于本次季节美术设计。

| 文件 | 用途 |
| --- | --- |
| background-light.webp | 浅色全局背景、图库缺省封面 |
| background-dark.webp | 同构图暗色全局背景 |
| hero-scene.webp | 大厅 Hero 场景，手机与桌面使用同一角色图 |
| hero-cutout.webp | 完整人物与纸伞的真实透明备用素材；不引入应用构建 |
| article-cover.webp | 冬夜暖茶文章缺省封面与导航预览 |
| pixel-workshop.webp | 雪夜像素工坊缺省封面；栅格插画，不是可编辑像素作品 |

六张 WebP 合计 3,366,656 字节，应用使用的五张合计 2,287,344 字节。原始 PNG 在工作区 `output/imagegen/winter-v1/`，完整提示词与留白修正见 `prompts.json`，尺寸、用途、Alpha 和 SHA-256 见 `manifest.json`。

透明图无损保存所有 Alpha。原始图包含少量 Alpha=1 的极淡边缘噪点，未删除或重绘；可见人物轮廓边界记录为 `visible_alpha_bbox`（仅测量 Alpha>16），完整人物和伞都在画布内。

深色背景保持浅色背景的位置与场景，仅改变照明。页面遮罩、布局、配色、按钮与圆角不变；Hero 裁切桌面 72% top、手机 75% center。
