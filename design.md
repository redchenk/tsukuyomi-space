# 月读空间界面设计规范

月白纸面、深墨正文、樱粉主操作构成默认配色。图库和 Hub 用现有八千代与四季插画承载叙事，文章、广场、支付和设置页用衬线标题、留白和细分隔线组织内容。桌面和手机共用颜色、控件状态和组件。

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
| 当季强调与支付入口 `--accent` | #AC4D6D | #E5A4BC |
| 实底上的文字 `--on-accent` | #FFFFFF | #151923 |

夏、秋、冬复用同一批语义变量，随现有插画切换。主操作和选中的筛选项使用正文墨色与季节色调合的 `--control-ink`，支付中心保留当季实色和完整的文字入口。危险操作使用独立的 `--danger`。状态文字和常规字号的对比度目标为 4.5:1。

普通按钮和输入框使用 12px 圆角，内容卡片和图像使用 20px，弹层使用 28px，筛选标签与状态胶囊使用 999px。页面标题使用衬线，控件使用无衬线。按钮默认 14px、500 字重，表单文字默认 16px。颜色反馈 160ms，结构过渡参考 240ms，减少动态效果时使用静态反馈。

## 点阵交互
按 [Dots 参考](https://uberdesigner.ai/t/voice-to-text/dots) 的逐列点亮节奏制作。公共材质与时序在 `styles/jingyue/motion.css`，原生激活反馈由 `runtime/controlMotion.js` 接管。新页面使用现成组件即可继承以下反馈。

| 状态 | 显示与时序 |
| --- | --- |
| 悬停或键盘焦点 | 点列顺次亮起。桌面标准按钮微抬，键盘保留独立焦点环。 |
| 按住与激活 | 普通按钮在 55ms 内压下，松开回弹。触摸和鼠标从落点展开九列点阵，键盘从中心展开。 |
| 选中 | 筛选用实底墨色。选择与收藏状态由实际的 `aria-pressed` 或 `aria-selected` 驱动。 |
| 加载与禁用 | 公共按钮保留标签和尺寸。加载呈虚线边框与循环明暗点列，禁用控件静止。 |
| 减少动态效果 | 即时颜色、固定选中面和焦点环反馈状态，暂停点阵和位移。 |

点阵层跟随原生事件，忽略命中测试，并在滚动、路由切换和动画结束时回收。画布、媒体、棋盘等控件保留专用几何。动画只表达输入反馈，提交、支付和收藏结果由原有业务逻辑确认。组件页的点阵图随真实季节偏好更新。

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
