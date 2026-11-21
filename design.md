# 月读空间界面设计规范

月白纸面、深墨正文、樱粉支付入口构成默认配色。图库和 Hub 用现有八千代与四季插画承载叙事，文章、广场、支付和设置页用衬线标题、留白和细分隔线组织内容。桌面和手机共用颜色、控件状态和组件。

## 预览与维护

运行 `npm run preview:design`，英文发行版加 `-- --overseas`。打开终端地址下的 `/design-system` 可切换季节、夜间模式、示例语言、窄栏与加载状态，也可输入自定义长标签。图库和广场的预览入口使用真实路由。开发预览使用本地测试数据。海外预览为演示用文章、图片和留言提供预写的英文版本，切换原文可以对照。线上翻译服务独立运行。

| 维护位置 | 内容 |
| --- | --- |
| `src/frontend/styles/jingyue/tokens.css` | 春夏秋冬、明暗主题、语义颜色、字体、圆角与旧变量映射 |
| `src/frontend/styles/jingyue/system.css` | 操作、表单、标题区和组合布局 |
| `src/frontend/components/` | TsPageHeader、TsButton、TsButtonLink、TsIconButton、TsToggle、TsFilterChip、TsField |
| `src/frontend/pages/DesignSystemPage.vue` | 引用相同组件的交互样例 |
| `npm run check:ui` | Vue 模板和普通操作控件样式检查，两种发行构建及预览构建均运行 |

## 配色与版式

| 用途 | 春季日间 | 春季夜间 |
| --- | --- | --- |
| 页面 `--paper` | #F7F9FC | #151923 |
| 卡片与输入 `--surface` | #FFFFFF | #222836 |
| 正文 `--ink` | #202B46 | #EDF0F7 |
| 辅助文字 `--muted` | #626E84 | #B5BCCB |
| 当季强调 `--accent` | #AC4D6D | #E5A4BC |
| 实底上的文字 `--on-accent` | #FFFFFF | #151923 |

春夏秋冬共用同一套材质。主要按钮以 `--control-ink` 混合当季色与正文墨色，支付中心以 `--accent-ink` 实底突出。次要操作使用月白表面与细边，选中项使用浅染表面、季节色文字和下沿。危险操作使用 `--danger`。常规文字的对比度目标为 4.5:1。

## 按钮的轮廓与动效

所有操作按钮都使用 `--r-button`，即两端全圆的胶囊。文字按钮按内容伸展，等宽高的图标按钮呈圆形；按钮换行增高时，两端仍为半圆。主操作、支付、次操作、筛选与图标按钮通过填色、边界与选中状态区分用途。棋盘格、画布和原生开关保留其交互几何。

| 状态 | 控件的表现 |
| --- | --- |
| 静止 | 主操作的圆角边缘反光，标签位于清楚平稳的中央。次要按钮有较浅的釉面。 |
| 悬停 | 高光跟随指针左右移动。轮廓在键盘聚焦时保持稳定，并显示可见的焦点环。 |
| 激活 | 65ms 内轻压，松开时三圈水纹从真实点击位置扩散。键盘从中心激活。 |
| 选中 | 筛选与收藏以实际状态着色。日夜开关的小圆珠随当前主题移动。 |
| 加载、禁用 | 加载保留文本和尺寸，底部点列提示忙碌。禁用按钮静止。 |
| 减少动态效果 | 去除跟随、位移和水纹，保留静态形状、状态颜色和焦点环。 |

在 `styles/jingyue/tokens.css` 维护轮廓，`styles/jingyue/motion.css` 维护表面与时序。`runtime/controlMotion.js` 监听原生输入，只在指针移动时更新高光，滚动或切换页面时回收水纹。日夜切换的外观使用 `ThemeLens.vue`，沿用现有主题操作。季节展示页保留点阵转场。搜索用插画入口和文字索引分组，账号菜单从头像处展开。两处的排版与搜索字段由 `styles/jingyue/shelf.css` 维护，参考 [Desk Shelf 的分区与点阵](https://uberdesigner.ai/t/desk-shelf/dots)。动效参考 [Ferrofluid Button 的边缘反光与液面波纹](https://uberdesigner.ai/t/ferrofluid-button) 和 [Dots 的逐列切换](https://uberdesigner.ai/t/voice-to-text/dots)。

## 操作与表单

| 用户意图 | 组件和写法 |
| --- | --- |
| 保存、发布、提交 | `TsButton variant="primary"`，同组优先突出一个 |
| 查看详情、取消编辑 | 默认 `secondary`，中性描边 |
| 展开、更多、上下文操作 | `variant="ghost"`，已有 `quiet` 使用同一渲染规则 |
| 删除有价值的内容 | `variant="danger"`，文案列明对象 |
| 打开页面、下载文件 | `TsButtonLink`，站内用 `to`，文件和外站用 `href` |
| 点赞或收藏、筛选、纯图标 | `TsToggle :pressed`、`TsFilterChip :selected`、`TsIconButton :label :icon` |
| 单行输入、提示与错误 | `TsField v-model :label :hint :error`，支持原生表单属性 |

桌面密集工具栏用 `size="sm"`（36px），日常操作用 `md`（44px），大入口用 `lg`（48px）。触屏上的标准控件至少 44 × 44 CSS px。尺寸是下限。操作组先换行，标签可换行，按钮随内容增高。加载时保持动作文字，底部点列和 `aria-busy` 反馈状态，禁用重复提交。

```vue
<TsPageHeader title="房间设置" description="管理房间的对话、语音与显示偏好。" />
<form class="ui-panel ui-stack" @submit.prevent="save">
  <TsField v-model="name" label="房间名称" required />
  <div class="ui-actions">
    <TsButton type="submit" variant="primary" :loading="saving">保存设置</TsButton>
    <TsButtonLink to="/room" variant="ghost">返回房间</TsButtonLink>
  </div>
</form>
```

在 `<script setup>` 中从 `components` 导入组件。新页面根元素声明 `data-ui-layout="content"`、`workspace` 或 `scene`。页宽和间距用 `ui-page`、`ui-stack`。操作组、工具栏、内容卡片、弹窗底部、空状态和行内反馈分别使用 `ui-actions`、`ui-toolbar`、`ui-panel`、`ui-modal-footer`、`ui-empty` 和 `ui-inline-message`。需要焦点约束、关闭及焦点归还的弹窗复用 `useModalDialog` 或 `MobileSheet`。棋盘、画布、媒体轨道等专用控件通过 `data-ui-part` 保留原有几何和触控行为。

## 迁移与验收

新业务页面选择组件的用途、尺寸和状态。视觉需求进入公共样式，页面样式负责网格、位置和换行。历史样式登记在 `tests/fixtures/ui-style-exceptions.txt`，记录文件、选择器、属性和值。普通页面中已有的字面颜色、圆角和字号另记在同目录的 `ui-legacy-scales.json`，新值应加入公共语义变量。清理旧覆盖时删除相应登记。新写的普通按钮颜色、字号、圆角、内边距等覆盖会被构建检查指出。已有 CSS 类、数据属性和链接仍可接入同一套样式。

运行 Playwright 的 `tests/e2e/design-system.spec.js`。分别验证 320px 重排与固定视口 200% 文字放大，再检查长中文、日文、英文、连续字符串、八套主题的对比度、鼠标和键盘、触屏尺寸，以及加载前后文字和尺寸。发布前同时走一次登录、图库操作和支付中心的真实页面路径。

按钮的尺寸与加载处理参考 [Radix Themes](https://www.radix-ui.com/themes/docs/components/button)，操作层级和标签换行参考 [Carbon](https://carbondesignsystem.com/components/button/usage/)，语义色组织参考 [GitHub Primer](https://primer.style/product/getting-started/foundations/color-usage/)。

## 弹出菜单

菜单从触发控件的实际位置展开。按参考录屏，表面先扩展、背景柔化，内容从约 250ms 起分组显现，在约 700ms 内稳定。关闭按相反顺序用约 450ms 折回原入口。控件文字以原大小绘制。

由 `MobileSheet` 承载原生模态菜单；条件挂载的上下文菜单使用 `MenuTransition`；原生折叠菜单使用 `v-menu-details`。菜单若有多层容器，在主要内容组标注 `data-menu-item`。选定目标后立即导航。减少动态效果时直接显示最终状态。
