# 月读空间设计系统

月白底面、深墨色正文、衬线标题和随季节切换的强调色构成全站的视觉基线。操作按用途选择组件，页面按内容决定布局。桌面与手机使用同一份语义色、字体、间距和控件规则。

## 开发与预览

使用 `npm run preview:design` 启动带测试数据的本地网站，打开终端所示地址的 `/design-system`。英文发行版使用 `npm run preview:design -- --overseas`。示例可以切换中、英、日文，检查窄栏、键盘焦点、选中与忙碌状态。开发服务器也提供这个路由。常规生产构建只包含业务组件。

| 维护入口 | 用途 |
| --- | --- |
| `src/frontend/styles/jingyue/tokens.css` | 四季和明暗主题、字体、语义色与圆角 |
| `src/frontend/styles/jingyue/system.css` | 控件外观、状态、排版和页面布局 |
| `src/frontend/components/TsButton.vue` | 业务操作按钮，保留原生键盘和表单行为 |
| `src/frontend/pages/DesignSystemPage.vue` | 可交互的用法示例 |
| `npm run check:ui` | 检查 Vue 模板的按钮契约；两种发行构建、本地设计预览和常规测试均执行 |

## 选什么控件

| 场景 | 写法与视觉 |
| --- | --- |
| 保存、提交、发布 | `variant="primary"`，强调色实底，一组操作优先突出一个 |
| 查看详情、刷新 | 默认 `secondary`，实色表面和中性描边 |
| 需要容易找到的入口 | `data-ui="accent"`，强调色描边；支付中心使用此样式 |
| 取消、行内操作 | `variant="quiet"`，文字和悬停反馈 |
| 删除、撤销授权 | `variant="danger"`，危险色与动作文字 |
| 筛选、切换 | `variant="choice"`，用 `aria-pressed` 或相应的选项语义表达状态 |
| 纯图标操作 | `variant="icon"`，提供描述动作的 `aria-label`；有可见文字时使用文字变体 |

```vue
<TsButton type="submit" variant="primary" :busy="saving">保存设置</TsButton>
<TsButton @click="cancel">取消</TsButton>
<RouterLink data-ui="accent" to="/payments">支付中心</RouterLink>
<a data-ui="secondary" :href="downloadUrl" download>下载安装包</a>
```

在页面的 `<script setup>` 中导入 `TsButton`。按钮默认类型为 `button`；表单提交显式指定 `submit`。忙碌态会禁用重复点击并设置 `aria-busy`，页面负责反馈结果。导航使用原生链接或 RouterLink，已有的 `primary-btn`、`ghost-btn`、`danger-btn` 等类共用同一套外观。

画板工具、棋盘交点、媒体轨道、整行选择、导航和抽屉把手需要专用几何形状。此类控件用 `data-ui-part` 标识真实用途（`canvas`、`media`、`row`、`navigation`、`tool`、`disclosure`、`overlay`），继续使用公共语义色和焦点规则。普通文字按钮选择上表的变体。

## 新页面

页面根元素声明 `data-ui-layout="content"`、`workspace` 或 `scene`，分别用于常规内容、工具工作区和沉浸场景。使用 `ui-page` 设定页面宽度和边距，`ui-stack` 管理纵向节奏，`ui-grid` 让卡片随可用宽度折行。常规页面以 `ui-heading` 包住标题和简介，现有标题可直接使用 `ui-page-title`。内容卡片用 `ui-panel`，同行动作用 `ui-actions`，表单使用有名称的原生输入框。

```vue
<main data-ui-layout="content" class="ui-page ui-stack">
  <header class="ui-heading"><h1>房间设置</h1></header>
  <form class="ui-panel ui-stack" @submit.prevent="save">
    <label class="ui-field-group">房间名称<input v-model="name" class="ui-field" required></label>
    <div class="ui-actions"><TsButton type="submit" variant="primary">保存设置</TsButton></div>
  </form>
</main>
```

常规按钮最小高度为 44px，精细指针的紧凑控件可以用 `data-size="compact"`。文字取自然宽度；空间不足时先让同组控件换行，再让标签换行，按钮随内容增高。图标独立且不压缩，避免给文字设定固定高度或用省略号藏掉动作。页面样式负责位置，公共系统负责按钮色彩、圆角和反馈。

普通操作和输入框使用 `--r-control`，筛选项允许胶囊形，内容表面用 `--r-media`，弹层用 `--r-panel`。表面、文字和强调分别取 `--surface`、`--ink`、`--muted`、`--accent`、`--on-accent`。游戏与房间可使用各自的场景美术。操作优先级、焦点和文字规则与内容页一致。

## 验证

运行 `npm run check:ui`、常规前端构建，以及 Playwright 的 `design-system.spec.js`。排版检查读取文字的实际行框和页面宽度。新增功能至少检查 320px 手机、平板、桌面、长英文与日文标签、明暗主题、键盘、禁用及忙碌状态。测试新按钮时应执行真实业务交互；测试支付请使用隔离的测试订单。

参考 [Paper Widgets](https://uberdesigner.ai/t/paper-widgets) 的共享表面与单一强调色层级。实现复用本项目的 Vue、TsIcon 和季节主题。
