# 超辉夜姬！Wiki 开发与交付说明

本文档只描述 `Tsukuyomi Space` 中新增的“超辉夜姬！Wiki”功能，供继续开发、独立打包、交给原项目作者集成以及出现问题时回滚使用。

最后验收日期：2026-07-19

## 1. 功能范围

Wiki 是原站视觉体系下的一组 Vue 3 页面，不需要数据库，也没有新增 API、运行时服务或第三方依赖。

当前内容规模：

- 1 个 Wiki 总览页。
- 12 个角色二级页。
- 7 个名词二级页。
- 8 份由用户提供网页源文件整理的角色长条目。
- 59 张正文插图、24 张角色页图片、7 张名词页图片，以及 6 张 Wiki 公共图片。
- 角色筛选、剧透展开、词条速览弹窗、图片形态切换、目录锚点和站内词条链接等交互。
- 8 个主要角色的独立萌娘百科跳转入口；其余角色跳转至作品角色目录。

全部路由：

| 类型 | 路由 |
| --- | --- |
| 总览 | `/wiki` |
| 角色 | `/wiki/characters/kaguya`、`iroha`、`yachiyo`、`akira`、`rai`、`noi`、`roka`、`mami`、`fushi`、`doge`、`otako`、`terukoto` |
| 名词 | `/wiki/terms/tsukuyomi`、`yachiyo-cup`、`kassen`、`black-onyx`、`remember`、`reply`、`taketori` |

## 2. 代码结构

| 路径 | 作用 |
| --- | --- |
| `src/frontend/pages/WikiPage.vue` | Wiki 总览页、角色筛选、剧透、词条速览等交互 |
| `src/frontend/pages/WikiEntryPage.vue` | 角色和名词共用的二级页面 |
| `src/frontend/components/KaguyaSourceArticle.vue` | 长条目源文件加载与渲染适配 |
| `src/frontend/data/cosmicKaguyaWiki.js` | 总览页资料、角色、词条、音乐、时间线等数据 |
| `src/frontend/data/cosmicKaguyaWikiEntries.js` | 二级页资料、图片形态、萌娘百科链接与条目结构 |
| `src/frontend/data/sourceMediaAssets.js` | 中文源文件名到安全静态资源名的映射表 |
| `src/frontend/data/wiki-sources/*.mediawiki` | 8 个主要角色的长条目源内容 |
| `src/frontend/utils/mediaWikiArticle.js` | MediaWiki 子集解析、站内链接、黑幕和图片槽渲染 |
| `assets/css/vue/pages/wiki.css` | 总览页样式及响应式规则 |
| `assets/css/vue/pages/wiki-entry.css` | 二级页样式、图文环绕、图片槽和响应式规则 |
| `src/frontend/styles/routes/wiki.css` | 按路由懒加载两组 Wiki 样式 |
| `assets/images/wiki/content/` | 正文插图，文件名固定为 `source-001.webp` 至 `source-059.webp` |
| `assets/images/wiki/entries/characters/` | 角色主图、现实/月读形态图 |
| `assets/images/wiki/entries/terms/` | 名词主图 |
| `assets/images/wiki/` | Wiki 头图、背景等公共素材 |
| `tests/frontend-wiki.test.js` | 路由、数据、素材映射和交付边界的静态回归测试 |
| `tests/e2e/wiki-page.spec.js` | 桌面端、二级页和移动端的真实浏览器测试 |

### 页面数据流

```text
cosmicKaguyaWiki.js ───────────────> WikiPage.vue
cosmicKaguyaWikiEntries.js ────────> WikiEntryPage.vue
wiki-sources/*.mediawiki ──────────> KaguyaSourceArticle.vue
sourceMediaAssets.js ──────────────> mediaWikiArticle.js ──> 正文图片槽
```

解析器只实现当前内容需要的 MediaWiki 子集，不是通用 MediaWiki 引擎。加入新模板或复杂表格前，应先为解析器补测试。

## 3. 原项目集成点

为了让独立 Wiki 能被原站访问，以下原项目文件存在小范围集成修改。交付给原作者时必须单独合并这些位置：

| 原项目文件 | 必要修改 |
| --- | --- |
| `src/frontend/router/index.js` | 懒加载两个 Wiki 页面，并注册总览、角色、名词三组路由 |
| `src/frontend/layouts/AppShell.vue` | 在统一侧栏中增加显示名为 `Wiki` 的入口，并让三个 Wiki 路由共享激活状态 |
| `backend/middleware/static.js` | 把 `/wiki` 加入站点地图，并把 `/wiki/characters/*`、`/wiki/terms/*` 纳入生产 SPA 回退 |
| `package.json` | 在 `test:frontend` 中加入 `tests/frontend-wiki.test.js`；没有增加依赖 |
| `README.md` | 只增加本独立说明的入口链接 |

Wiki 功能没有修改数据库、迁移、认证、用户数据、部署密钥或 API 协议。

## 4. 素材映射规则

### 4.1 正文插图

正文源文件仍保留中文图片名，例如：

```mediawiki
[[File:辉夜姬-两根牙刷.webp|thumb|说明文字]]
```

浏览器实际请求使用安全的连续文件名：

```text
/assets/images/wiki/content/source-039.webp
```

两者由 `src/frontend/data/sourceMediaAssets.js` 按数组顺序映射。维护时务必遵守：

1. 不要在现有 `sourceMediaFileNames` 数组中间插入、删除或调整顺序。
2. 新图片名称追加到数组末尾。
3. 新资源按数组最终序号命名为 `source-NNN.webp`，放入 `assets/images/wiki/content/`。
4. 运行 `npm run test:frontend`，确认映射条目数、文件数和连续编号一致。

如果重排数组，后续所有编号都会错位，页面可能仍能显示图片，但图文对应关系会悄悄出错。

### 4.2 角色与名词主图

二级页主图在 `cosmicKaguyaWikiEntries.js` 中显式设置路径、宽高比、`object-fit` 和焦点位置。不同图片可以采用不同裁切方式，不要求统一比例。

新增主图时建议：

- 透明立绘使用 `fit: 'contain'` 和 `mode: 'subject'`。
- 场景图使用 `fit: 'cover'` 和 `mode: 'scene'`。
- 拼接型长图使用 `mode: 'collage'`。
- 同时填写明确的 `imageAlt` 和 `imageSource`。

### 4.3 当前资源体量

| 目录 | 数量 | 体积 |
| --- | ---: | ---: |
| `assets/images/wiki/` 根目录 | 1 | 128,762 B |
| `assets/images/wiki/content/` | 59 | 4,979,924 B |
| `assets/images/wiki/entries/characters/` | 24 | 3,898,232 B |
| `assets/images/wiki/entries/terms/` | 7 | 282,412 B |
| 合计 | 91 | 9,289,330 B（约 8.86 MiB） |

所有正文插图使用延迟加载。`source-018.webp` 是 102 帧动画 WebP，约 1.65 MB，是当前单个正文素材中最重的一张；以后如需优化首屏以外的滚动流畅度，可在不改变路径的前提下压缩此文件。

### 4.4 安全边界

- 原始 ZIP 的 SHA-256 为 `068C4637EE3595C58899DBC62D0D589F791EE70E21828C53A8F90EBDF1FDDECE`，包内 125 个文件全部与 `SHA256SUMS.txt` 一致。
- 压缩包无路径穿越、绝对路径、软链接、重复路径或异常压缩比；Windows Defender 自定义扫描未发现威胁。
- MediaWiki 是构建时内置的静态文本，不接收网络输入。解析器先转义文本，再只生成限定标签、站内 Wiki 路径、萌娘百科 HTTPS 链接和固定图片路径。
- `tests/frontend-wiki.test.js` 会用恶意标签、事件属性和危险 URL 协议回归测试 `v-html` 前的生成结果，并校验全部内置条目的标签、`href`、`src` 和行内样式白名单。
- 所有外链使用 HTTPS，新标签链接保留 `rel="noopener noreferrer"`。Wiki 不新增 API、上传入口、数据库权限或运行时第三方请求。

## 5. 安装与运行

环境要求：Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

开发地址：

- 前端：`http://127.0.0.1:5173/wiki`
- API 健康检查：`http://127.0.0.1:3000/api/health`

完整调试必须使用 `npm run dev` 同时启动 Express 与 Vite。不要只运行 `npm run dev:web`：Vite 会把 `/assets` 等路径代理到 3000 端口，后端未启动时页面骨架仍可打开，但图片会返回 502。这是此前“页面正常而 Wiki 图片不加载”的实际原因，与 WebP、中文文件名或图片损坏无关。

生产构建：

```bash
npm run build:web
npm start
```

生产环境直接访问任意角色或名词 URL 时，由 `backend/middleware/static.js` 返回 Vue 构建入口。

## 6. 测试与验收

建议按以下顺序执行：

```bash
npm run test:frontend
npm run build:web
npx playwright test wiki-page.spec.js --project=chromium
npm test
```

Windows 下 Playwright 测试参数使用文件名 `wiki-page.spec.js` 即可；测试目录已经由配置指定。若受限沙箱禁止创建浏览器进程并报 `spawn EPERM`，应在具备浏览器启动权限的本地终端运行，不应把它判断成页面失败。

### 2026-07-19 验收结果

| 角度 | 结果 |
| --- | --- |
| 全量项目回归 | `npm test` 通过；API/安全等 111 项、前端 60 项，共 171 项通过 |
| Wiki 端到端 | Playwright Chromium 3/3 通过 |
| 生产构建 | `npm run build:web` 成功，157 个模块完成转换 |
| 路由请求 | 20/20 个 Wiki URL 返回 HTTP 200 |
| 图片请求 | 91/91 个运行时 Wiki 图片返回 HTTP 200 和正确图片 MIME 类型 |
| 图片解码 | 91/91 个图片文件可正常解码；81 WebP、10 PNG |
| 内容映射 | 59/59 个映射文件存在，连续编号完整，无重复归一化键 |
| 桌面端 | 1280×720 下无水平溢出；总览、辉夜、彩叶、八千代和代表名词页正常 |
| 移动端 | 390×844 下无水平溢出；移动导航、目录、图片和长条目正常 |
| 交互 | 角色筛选、剧透、词条弹窗、图片切换、目录与卡片跳转均可用 |
| 基础无障碍 | 无重复 ID；图片均有替代文本；按钮有可访问名称；外链安全属性正常 |
| 浏览器控制台 | 已验收页面没有错误或警告 |
| 外部入口 | 8 个主要角色独立萌娘百科 URL 均可访问 |

基础无障碍检查不等同于完整 WCAG 认证。本轮未运行 Axe、Lighthouse 或屏幕阅读器人工测试；如进入正式公共发布阶段，建议补做这三项。

构建时仍会看到原项目已有的 `tsukuyomi-bg.webp` 与 `room-bg.webp` 运行时解析提示；它们不属于 Wiki 资源，也没有影响本轮构建成功。

## 7. 已知缺口

### 7.1 正文图片已补齐

此前 `酒寄彩叶` 长条目中的 `辉夜姬-八千年份的思念.png` 预留位已经补齐。实际 WebP 文件映射为 `assets/images/wiki/content/source-059.webp`，当前 8 份长条目不再显示缺图预留卡片。

### 7.2 源文件中存在、但不需要补的 12 个旧主图名

以下名称来自源网页信息框。当前页面已使用公式书或用户提供的高清角色图替代，因此解析器不再把它们显示成正文预留位：

- `超时空辉夜姬辉夜现实.png`
- `超时空辉夜姬辉夜月读.png`
- `超时空辉夜姬酒寄彩叶现实.png`
- `超时空辉夜姬酒寄彩叶月读.png`
- `超时空辉夜姬帝明.webp`
- `辉夜姬-酒寄朝日设定稿.png`
- `超时空辉夜姬谏山真实.webp`
- `超时空辉夜姬谏山真实现实.webp`
- `超时空辉夜姬驹泽乃依.webp`
- `超时空辉夜姬驹泽雷.webp`
- `超时空辉夜姬绫䌷芦花.webp`
- `超时空辉夜姬绫䌷芦花现实.webp`

### 7.3 内容与版权边界

这是非官方粉丝 Wiki。文字结构参考用户提供的网页源文件，部分图片来自用户提供的高清资料和公式书截图。原项目的 MIT 许可不应被理解为自动覆盖这些文字、图片、角色设计或第三方页面内容。公开发布、再次分发或商业使用前，应由发布者确认授权、署名和引用要求。

## 8. 独立打包与交付

推荐把以下新增内容作为 Wiki 功能包：

```text
src/frontend/pages/WikiPage.vue
src/frontend/pages/WikiEntryPage.vue
src/frontend/components/KaguyaSourceArticle.vue
src/frontend/data/cosmicKaguyaWiki.js
src/frontend/data/cosmicKaguyaWikiEntries.js
src/frontend/data/sourceMediaAssets.js
src/frontend/data/wiki-sources/
src/frontend/utils/mediaWikiArticle.js
assets/css/vue/pages/wiki.css
assets/css/vue/pages/wiki-entry.css
src/frontend/styles/routes/wiki.css
assets/images/wiki/
tests/frontend-wiki.test.js
tests/e2e/wiki-page.spec.js
docs/WIKI.md
```

然后单独提供四个原项目集成补丁：

```text
src/frontend/router/index.js
src/frontend/layouts/AppShell.vue
backend/middleware/static.js
package.json
```

集成步骤：

1. 把新增目录和文件复制到相同路径。
2. 合并路由、侧栏、生产 SPA 回退和测试脚本四个集成点。
3. 使用原项目锁文件执行 `npm install`；本功能不需要新增依赖。
4. 运行 `npm run test:frontend`、`npm run build:web` 和 Wiki Playwright 用例。
5. 同时启动前后端，逐项访问总览、一个长角色页和一个名词页。

项目开发过程中可以使用外部辅助工具，但最终代码没有 OpenClaw 的软件、运行时、配置、调用链或部署依赖。

制作 Wiki 独立功能包时，不要把开发工作区中的 `openclaw-workspace-state.json`、`BOOTSTRAP.md`、`SOUL.md`、`IDENTITY.md`、`USER.md`、`HEARTBEAT.md` 或同类代理工作区元数据打入交付包；它们不属于 Wiki 功能，也不是运行条件。

## 9. 回滚

Wiki 不涉及数据迁移，回滚不需要处理数据库。

1. 从 `src/frontend/router/index.js` 删除两个 Wiki 懒加载和三组 Wiki 路由。
2. 从 `src/frontend/layouts/AppShell.vue` 删除 Wiki 侧栏项。
3. 从 `backend/middleware/static.js` 删除 Wiki 站点地图项和两组动态路由回退。
4. 从 `package.json` 的 `test:frontend` 移除 `tests/frontend-wiki.test.js`。
5. 删除第 8 节列出的 Wiki 新增文件和 `assets/images/wiki/`。
6. 重新执行 `npm run build:web`。

回滚不会影响原站账号、文章、留言、Room、图库或像素画数据。
