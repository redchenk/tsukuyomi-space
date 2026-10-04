# Tsukuyomi Space 设计规范

本文档总结当前站点的统一视觉风格。新增页面和组件应优先使用 `src/frontend/styles/tokens.css` 与 `src/frontend/styles/themes.css` 中的 `--ts-*` 变量；历史 `--pink`、`--cyan`、`--panel` 等变量仅作为兼容层使用。

## 1. 配色（2026-10-04：月白樱粉）

沿用现有主题和颜色变量，主色改为低饱和樱粉。颜色角色以 `src/frontend/styles/editorial.css` 的最终映射为准，避免历史样式层重新引入紫色主按钮。圆角与导航、表单交互保持既有体系。

| 用途 | Light | Dark |
| --- | --- | --- |
| 页面背景 | `#F7F8FA` | `#141B26` |
| 卡片、阅读面 | `#FFFFFF` | `#1E2836` |
| 次级表面 | `#E8EFF5` | `#293647` |
| 主文字 | `#253046` | `#EDF1F6` |
| 次级文字 | `#626E80` | `#B3BECD` |
| 链接、选中强调 | `#AC4D6D` | `#E5A4BC` |
| 选中底色 | `#F4E6EC` | `#3A2B39` |
| 细边框 | `#E0E5EC` | `#3A4759` |
| 辅助雾蓝 | `#386C85` | `#A9CADC` |

主按钮在两个主题都用 `#AC4D6D` 白字，悬停用 `#923D5B`。历史 `--ts-gradient-brand` 名称继续兼容原组件，但其值为纯色背景。小字链接与焦点在深色模式改用浅樱粉，而不是把浅色链接颜色直接照搬。

背景复用现有月光湖畔素材，以浅色遮罩降低装饰图的干扰；保留八千代原插画和用户上传作品的色彩，不给内容图片整体改色。首页内容卡片将图片与文字分离，文字使用主题底面。状态成功、失败、危险操作仍保持语义色，不把所有状态都改成樱粉。

新用户默认浅色主题，已保存的主题偏好继续生效。主按钮和导航不添加彩色光晕，普通表面只用轻微中性阴影。新样式优先消费 `--ts-*` 语义变量，不新增互相覆盖的主题补丁层。

## 2. 字体

### 字体族

| 用途 | 字体 |
| --- | --- |
| 正文 / UI | `"Microsoft YaHei", "Noto Sans SC", "Segoe UI", Arial, sans-serif` |
| 大标题 / 品牌标题 | `"Source Han Serif SC", "Noto Serif SC", "Microsoft YaHei", serif` |
| 英文装饰标题 | `Georgia, "Times New Roman", serif` |

### 字号、字重、行高

| 层级 | 字号 | 字重 | 行高 | 用法 |
| --- | --- | --- | --- | --- |
| Hero H1 | `clamp(2.7rem, 6.8vw, 5.3rem)`，Hub 强视觉版可到 `clamp(3rem, 6.6vw, 5.85rem)` | `520-560` | `1.02-1.08` | 首页、Hub、Arena 主标题 |
| 页面标题 | `clamp(1.7rem, 4vw, 3.4rem)` | `600-700` | `1.15` | 标准页面标题 |
| 卡片标题 | `1.08rem-1.36rem` | `700-800` | `1.25-1.38` | 面板、列表卡片标题 |
| 正文 | `0.94rem` | `400-500` | `1.6` | 常规正文、表单说明 |
| 长文本 | `1rem` | `400-500` | `1.75-1.85` | 文章、说明文案 |
| 辅助文字 | `0.72rem-0.82rem` | `700-900` | `1.3-1.5` | kicker、标签、状态文字 |
| 按钮文字 | `0.82rem-0.86rem` | `700-800` | `1` 或继承 | 导航、操作按钮 |

字号 token：

```css
--ts-font-size-xs: 0.72rem;
--ts-font-size-sm: 0.82rem;
--ts-font-size-md: 0.94rem;
--ts-font-size-lg: 1.08rem;
--ts-font-size-xl: 1.36rem;
--ts-font-size-2xl: clamp(1.7rem, 4vw, 3.4rem);
--ts-line-tight: 1.15;
--ts-line-normal: 1.6;
--ts-line-loose: 1.85;
```

## 3. 间距

### 基础间距 token

| Token | 值 | 常见用途 |
| --- | --- | --- |
| `--ts-space-1` | `0.25rem` / 4px | 图标与文字的细小间隔 |
| `--ts-space-2` | `0.5rem` / 8px | 紧凑按钮组、导航组 |
| `--ts-space-3` | `0.75rem` / 12px | 卡片内部小间距 |
| `--ts-space-4` | `1rem` / 16px | 标准模块间距 |
| `--ts-space-5` | `1.25rem` / 20px | 表单段落、卡片分组 |
| `--ts-space-6` | `1.5rem` / 24px | 区块内 padding |
| `--ts-space-8` | `2rem` / 32px | 页面区块间距 |
| `--ts-space-10` | `2.5rem` / 40px | 大区块间距 |

### 页面和模块布局

| 场景 | 推荐值 |
| --- | --- |
| 桌面页面左边距 | `padding-left: max(clamp(1rem, 4vw, 2rem), 6.2rem)`，给左侧 rail 预留空间 |
| 桌面页面右边距 | `clamp(1rem, 3vw, 2rem)` |
| 移动端页面边距 | `padding: 5.2rem 0.9rem max(6.4rem, env(safe-area-inset-bottom) + 5.6rem)` |
| 顶部 commandbar | `top: 1rem; left: calc(5rem + clamp(1rem, 3vw, 2rem)); right: clamp(1rem, 3vw, 2rem)` |
| 卡片内边距 | `clamp(1.1rem, 2.6vw, 1.8rem)`；复杂 Hero 可用 `clamp(1.35rem, 4vw, 4.8rem)` |
| 卡片/栏间距 | `0.85rem-1.15rem` |
| 按钮组间距 | `0.42rem-0.72rem` |
| 表单字段间距 | `0.55rem-1rem` |
| 列表卡片间距 | `0.8rem-1rem` |

原则：普通运营/管理类页面保持紧凑、可扫描；Hero 和视觉展示页允许更大的 `clamp()` 间距，但不要让首屏只有装饰内容。

## 4. 组件样式

### 圆角

| Token / 场景 | 值 |
| --- | --- |
| `--ts-radius-xs` | `6px` |
| `--ts-radius-sm` | `8px` |
| `--ts-radius-md` | `12px` |
| `--ts-radius-lg` | `18px` |
| `--ts-radius-xl` | `22px` |
| `--ts-radius-pill` | `999px` |
| 主导航 rail 图标按钮 | `12px` |
| 顶部 commandbar / 侧边 rail | `18px` |
| 大玻璃卡片 / Hub 面板 | `20px-22px` |
| 管理类小卡片 | `8px-14px` |
| 标签、胶囊按钮 | `999px` |

### 阴影和玻璃效果

| Token | 值 | 用途 |
| --- | --- | --- |
| `--ts-shadow-sm` | `0 10px 28px rgba(86,112,160,0.12)` | 轻卡片、按钮 |
| `--ts-shadow-md` | `0 18px 48px rgba(86,112,160,0.16)` | 标准玻璃卡片 |
| `--ts-shadow-lg` | `0 24px 76px rgba(0,0,0,0.28)` | 浮层、抽屉 |
| `--ts-shadow-accent` | `0 14px 38px rgba(123,140,246,0.28)` | 主按钮 |
| `--ts-blur-md` | `blur(18px) saturate(1.12)` | 常规玻璃 |
| `--ts-blur-lg` | `blur(22px) saturate(1.18)` | 强视觉浮层 |

卡片、导航栏、浮层的默认玻璃规则：

```css
border: 1px solid var(--ts-border);
background:
  linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.07)),
  var(--ts-glass);
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.18),
  inset 0 -1px 0 rgba(255,255,255,0.06),
  var(--ts-shadow-md);
backdrop-filter: blur(18px) saturate(1.12);
```

### 按钮

通用按钮包括 `.nav-link`、`.ghost-btn`、`.lang-btn`、`.theme-toggle`、`.panel-btn`、`.filter-btn`、`.chip`、`.icon-btn`、`.mode-btn`、`.code-btn`。

| 属性 | 规则 |
| --- | --- |
| 最小高度 | `36px`；重要 CTA 可用 `42px` |
| 默认圆角 | `12px`，导航兼容层可为 `999px` |
| 默认边框 | `1px solid var(--ts-border)` |
| 默认背景 | 深色 `rgba(255,255,255,0.07)`；浅色 `rgba(255,255,255,0.68)` |
| 默认文字 | `var(--ts-text)` |
| 水平 padding | `0.72rem`，紧凑按钮可 `0.58rem-0.65rem` |
| hover | `transform: translateY(-1px)`，边框改为 `var(--ts-border-strong)`，背景改为 `var(--ts-card-hover)` |

主按钮：

```css
.primary-btn {
  color: #fff;
  border-color: rgba(174, 242, 255, 0.22);
  background: linear-gradient(135deg, #7b8cf6, #a481ff);
  box-shadow: 0 14px 38px rgba(123, 140, 246, 0.28);
}
```

危险按钮：

```css
.danger-btn {
  color: #fff;
  border-color: rgba(255, 95, 150, 0.32);
  background: rgba(255, 95, 150, 0.18);
}
```

### 卡片

标准卡片用于 `.panel`、`.stage-card`、`.scene-card`、`.uc-card`、`.plaza-*`、`.room-panel` 等。

| 属性 | 规则 |
| --- | --- |
| 边框 | `1px solid var(--ts-border)` |
| 背景 | `var(--ts-surface)` 或 `rgba(255,255,255,0.88-0.92)` |
| 圆角 | 标准 `18px-22px`；管理类密集卡片可 `8px-14px` |
| 阴影 | `var(--ts-shadow-md)`；列表子卡片可 `var(--ts-shadow-sm)` 或无阴影 |
| 玻璃 | `backdrop-filter: var(--ts-blur-md)` |
| hover | 轻微上浮 `translateY(-1px~-3px)`，边框增强，背景变为 `var(--ts-card-hover)` |

大视觉卡片，如 Hub hero：

```css
border: 1px solid rgba(231, 249, 255, 0.16);
border-radius: 22px;
background: rgba(10, 16, 32, 0.66);
box-shadow: 0 26px 80px rgba(0, 0, 0, 0.32);
backdrop-filter: blur(18px) saturate(1.12);
```

### 导航栏

桌面端采用左侧 rail + 顶部 commandbar 的组合。

| 组件 | 规则 |
| --- | --- |
| 顶部 commandbar | 固定定位，最小高度 `62px`，圆角 `18px`，玻璃背景，`var(--ts-shadow-md)` |
| 左侧 rail | 宽 `4rem`，上下左右 `1rem-clamp(1rem,3vw,2rem)`，圆角 `18px`，内部 gap `1rem` |
| rail 图标按钮 | `2.35rem x 2.35rem`，圆角 `12px`，hover 上浮 `-1px` |
| 品牌图标 | `2.35rem` 或 `2.5rem` 圆形，主色渐变 |
| 移动端 commandbar | `top/left/right: 0.7rem`，最小高度 `58px`，圆角 `16px` |
| 移动端底部/弹出导航 | 使用玻璃强背景 `var(--ts-glass-strong)`，圆角 `18px` |

导航激活态：

```css
.nav-link.router-link-active,
.terminal-nav-btn.active {
  color: #fff;
  border-color: rgba(174, 242, 255, 0.34);
  background: linear-gradient(135deg, rgba(123, 140, 246, 0.92), rgba(164, 129, 255, 0.82));
}
```

## 设计使用原则

1. 新组件优先使用 `--ts-*` token，避免继续新增只服务单页的颜色变量。
2. 视觉核心是“月夜、玻璃、浅蓝紫、樱粉点缀”，不使用大面积单一紫色或深蓝。
3. 管理/工具页面要密集、清晰、可扫描；展示页面可以使用更强的图片背景、玻璃卡片和大标题。
4. 按钮优先使用 lucide 图标加短文本；纯文本按钮只用于明确命令。
5. 卡片不要嵌套卡片；页面区块应以全宽布局或单层玻璃容器组织。

## 移动端交互约定

- 共用视口规则集中在 `src/frontend/styles/mobile-experience.css` 的 `ts-mobile` 层，不再分散追加到历史页面样式中。
- 导航和常用表单操作至少提供 44px 触控高度，文本输入使用 16px 字号，顶部和底部留白包含安全区域。
- “更多”使用原生 `dialog`，支持 Escape、焦点循环与恢复、背景滚动锁定；切换页面或进入桌面宽度后自动关闭。
- 文章与留言优先于辅助说明和统计；次要说明可折叠，空状态只有一个容器，标题与说明不重复套框。
- Room 的软键盘适配由 `useMobileKeyboard` 提供视口变量，保留原来的 Live2D 分辨率、绘画精度和业务功能。
- 验证包括 360px、390px、768px、横屏和桌面布局，以及深浅主题、中日英菜单和登录后的常用页面。
