# 浏览器兼容策略

更新：2026-11-16。基于 fd19c418 的最新发布前端修改，用户原工作区中的未提交重构不参与本次变更。

## 支持范围

- 基础界面：Chromium / Edge 99+、Firefox 102+、Safari / iOS 15.4+。这是构建和回退目标，不是对所有厂商浏览器的真机认证。
- 较新浏览器保留原有四季主题、背景、字体、Seedance 入场、Room 过渡和 Drift 发送动画。默认仍为春日樱花；不强制厂商夜间模式、不禁止用户缩放、不加入私有 UA 判断。
- 缺少 CSS 级联层的更旧内核显示独立升级说明，仍可使用 `/compat/` 检测页。没有给未验证旧内核承诺完整界面。
- UA 声明的 Chrome 版本不能证明实际内核、视频解码器、软键盘或厂商深色模式行为；功能探测与实际交互测试分别记录。

## 实现

| 范围 | 处理 |
| --- | --- |
| CSS 构建 | Vite 的 JS / CSS 目标显式固定在上述版本，避免随工具升级悄悄提高最低要求。 |
| 颜色 | `browser-css-compat.mjs` 在构建期将本站的 sRGB `color-mix()` 编译为 RGB 通道和数值运算，保留透明度、嵌套混合及主题级联；没有浏览器端全量扫描样式。 |
| 视口 | dvh/svh/lvh 使用共用变量。现代浏览器采用原生单位；旧浏览器在独立启动脚本中按窗口高度回退，窗口旋转时重建范围。Room 的可视高度在未聚焦时也存在，Pixel 使用同一高度。 |
| 输入法 | 保留 Visual Viewport 缩放、偏移和 Android 布局缩小处理；增加可选 Virtual Keyboard 几何事件，不设置 `overlaysContent`，不改变浏览器原有键盘策略。 |
| 交互阻塞 | 缺少原生 inert 时提供属性反射与输入/焦点保护，避免 Vue 写出 `inert="false"` 后整页无法点击。 |
| 路由状态 | Drift 影片 / 弹窗、Pixel 专注模式、Room 编辑 / 消息菜单使用明确状态类，不依赖 `:has()`。 |
| 动画位置 | 使用传统 transform 或布局居中；旧内核的滚动装饰动画可只淡入，避免覆盖已有 transform。 |
| 请求 | 官方服务、模型设置和 TTS 使用可清理的 AbortController 超时封装，覆盖响应体读取；取消保留调用方原因，完成后移除监听和定时器。 |
| 手机操作 | Room 附件图标预留独立一行；Pixel 主工具、缩放、面板按钮、色板和笔刷尺寸提供实际 44px 点击区域，避免重叠扩大热区。输入字号至少 16px。 |
| 外观 | 浏览器 theme-color 跟随当前四季与明暗主题；偏好存储失败时仍可使用内存中的语言和主题。 |
| 视频 | 支持 MP4/H.264 的浏览器保留 Seedance；缺少解码能力、播放拒绝或网络错误走同一海报及可进入回退。点击进入不会主动播放背景音乐。 |

颜色编译器有意只接受本站已有的 sRGB、HEX、RGB、变量及嵌套混合。新增 HSL、OKLCH、currentColor 或动态混合权重时，构建会明确失败，需要补上经过验证的转换，不能静默输出错误颜色。变量的源值与兼容通道由同一声明生成；如果未来通过运行时 JS 修改这些颜色变量，必须同时维护通道，或改用 CSS 主题选择器。新增变量后重启 Vite 以刷新全局依赖索引。

`text-wrap: pretty` 等排版增强仍可自然降级。关键表单与操作状态改用普通选择器，翻译开关用 `:focus-within` 提供焦点反馈。现有弹层滚动锁保留，没有采用需要更高内核版本的替代方案。

## 本机检测页

`/compat/` 作为独立 Vite 页面构建，HTML / JS / CSS 一起产出，无缺失的 probe.js。页面展示 CSS、dialog、inert、取消接口、视口及视频声明能力。键盘测试不提交文本；仅用户点击时复制报告；没有遥测、账号读取、权限请求或后台上传。

## 验证方式

```sh
node scripts/run-tests.cjs frontend
node node_modules/vite/bin/vite.js build --config vite.frontend.config.js
node node_modules/@playwright/test/cli.js test tests/e2e/vendor-browser-compat.spec.js --project=chromium-mobile --project=webkit-mobile
# 在支持旧 Chromium 的本机，用独立二进制运行同一组用例；修改 UA 不算旧内核验证。
PW_EXECUTABLE_PATH=/absolute/path/to/Chromium node node_modules/@playwright/test/cli.js test tests/e2e/vendor-browser-compat.spec.js --project=chromium-mobile
```

另覆盖 Access 原动画/无音乐/失败恢复、Room 键盘和附件菜单、Pixel 手势/草稿/缩放、Drift 发送、导航底栏和弹层、四季明暗配色及 320px 窄屏。旧 Chromium 的开源发行包不含 H.264：电影播放专用用例按实际解码能力跳过，必须通过海报可进入回退；这不等于手机上的视频播放验收。

最终仍需在实际夸克及目标厂商手机浏览器上检查：地址栏伸缩、输入法展开/收起和旋转、字体放大、系统深色模式、文件选择/麦克风权限、视频/音频实际播放及前后台切换。完全覆盖式键盘若不报告 Visual Viewport 或 Virtual Keyboard 几何变化，网页不能可靠推断其遮挡高度。

## 参考

- [GoogleChrome modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance)：响应式、形态适配、CSS 布局；采用触摸尺寸、安全区和渐进增强原则，具体特性服从本站最低版本。
- [Vite build options](https://vite.dev/config/build-options)：构建目标与 CSS 目标。
- [Chrome 移动视口与软键盘行为](https://developer.chrome.com/blog/viewport-resize-behavior)：布局视口、可视视口和键盘遮挡的区别。
- 用户的 `vendor-browser-compat-静月.md` 和检测页样例作为建议来源；其中旧发布号、viewport-fit 缺失判断及 UA 推断没有直接照搬。

## 旧内核验证边界

使用微软 Playwright 历史构建 956323（实际 Chromium 99.0.4812.0）检查基础界面。当前 Playwright 与此历史内核组合的手机模拟会把 CDP 触摸坐标错误缩小为 412/980；改用相同窄屏尺寸、真实触摸事件和桌面视口后，绘画、缩放、双指撤销及拖拽检查通过。该结果不能当作 Android 真机认证。

在这套旧版本自动化环境中，启用缓存后的完整重载 / 资源失败后重试仍出现超时；禁用缓存可通过。已单独复核浏览器驱动和普通 HTTP 路径，尚未把原因归属到厂商手机浏览器。现代 Chromium / WebKit 的同一重试用例通过。此项保留为旧内核真机验收项，不宣称所有厂商浏览器已全面验收。

## 本次本地验证结果

- 前端单元及集成测试：530 通过。
- 当前 Chromium / WebKit 移动端：84 通过，4 项仅 Chromium CDP 的触摸检查在 WebKit 跳过。
- 官方 TTS 离线处理、请求幂等及 Fish 模型传递：6 通过（测试服务，不是真实付费合成）。
- Chromium 99 窄屏触摸、Pixel 手势、Room 键盘、主题回退及检测页：14 通过。缓存重载问题见上节，未计入通过数。
- 正式构建产物：CSS 不再残留 color-mix、相对 RGB、独立 translate 或 :has；遮罩保留 WebKit 前缀。
- 本地预览使用隔离测试数据，地址 `http://127.0.0.1:4181/`；检测页 `http://127.0.0.1:4181/compat/`。本次没有部署线上服务。
