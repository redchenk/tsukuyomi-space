# 文章 Markdown 写作指南

编辑器的「插入内容块」菜单可以插入以下语法。桌面端默认分栏预览，手机端默认撰写，可随时切换视图。预览、文章页与服务端正文共用同一解析器。

## 日常排版

支持 H1–H6 标题、粗体、斜体、删除线、引用、嵌套列表、链接及引用式链接、图片、分隔线和转义字符。工具栏快捷键为 Ctrl／⌘ + B（粗体）、I（斜体）、K（链接）、Shift + C（代码块）。列表按 Enter 自动续写，空列表项再按 Enter 退出。工具栏插入保留浏览器撤销历史。

```markdown
## 标题
**粗体**、*斜体*、~~删除线~~、`行内代码`

- 第一项
  - 嵌套项目

1. 第一项
2. 第二项

[主舞台](/stage)
![图片说明](/assets/example.webp)
```

## 表格与任务清单

宽表格可横向滚动，避免撑开手机页面。任务标记在文章中作为只读完成状态显示。

```markdown
| 项目 | 进度 |
| :--- | ---: |
| 写作 | 80% |
| 校对 | 20% |

- [x] 完成初稿
- [ ] 检查图片
```

## 高亮与防剧透

```markdown
==重点内容==
==提示=={.tip}
==需要注意=={.error}

答案是 :spoiler[点击后才会显示的内容]。
```

高亮变体支持 `primary`、`secondary`、`tertiary`、`tip`、`error`，颜色跟随主题。防剧透支持点击、Enter 和空格键切换；自动摘要会跳过隐藏内容。

## 提示框与折叠正文

```markdown
::: tip 自定义标题
可以放 **粗体**、链接、列表和代码。
:::

::: warning[请留意]
需要注意的内容。
:::

> [!IMPORTANT]
> GitHub 风格的提示也可以使用。

::: details 点击展开
折叠起来的补充正文。
:::
```

提示类型支持 `note`、`info`、`tip`、`important`、`warning`、`caution`。嵌套容器可使用不同数量的冒号，让结束位置清楚。

## 代码与公式

代码块支持语言高亮、文件标题和一键复制。例如使用四个反引号围住包含三个反引号的示例：

````markdown
```javascript title="example.js"
const message = "Hello, Tsukuyomi!";
console.log(message);
```

行内公式 $E = mc^2$。

$$
\frac{1}{2} + \frac{1}{3} = \frac{5}{6}
$$
````

代码高亮支持 JavaScript、TypeScript、Python、JSON、Bash、CSS、HTML/XML、SQL、Java、C++、YAML、Markdown 和 Diff；其他语言保留可读源码。公式由 KaTeX 转为原生 MathML，错误公式保留源码方便修正。

## 脚注、上下标与缩写

```markdown
这里是一条补充说明[^note]。

[^note]: 资料来源或补充内容。

H~2~O 和 x^2^

*[SSR]: Server-Side Rendering

SSR 是文章的服务端呈现方式。
```

## 图片画廊与媒体

```markdown
::: gallery
![第一张图片](https://example.com/image-1.jpg)

![第二张图片](https://example.com/image-2.jpg)
:::

::bilibili[视频标题](BV12345)
::media[音频标题](/assets/example.mp3 "audio")
::media[视频标题](/assets/example.mp4 "video")
::media[链接标题](https://example.com "链接简介")
::iframe[嵌入标题](https://example.com "420")
```

通过附件库插入会自动生成对应的图片、音视频或文件链接。画廊图片之间保留空行。iframe 高度范围为 220–900。

## 实现与参考

交互和语法参考 [Shirone](https://github.com/LyraVoid/Shirone) 的写作体验。本站通过 Markdown-it 解析 CommonMark 及扩展，并用同一模块为编辑预览、文章阅读和服务端输出提供内容。原始 HTML 显示为文本；已有 iframe 写法通过专用渲染器处理。
