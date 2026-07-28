import { isEnglishSite } from '../utils/siteVariant';

const TEXT = Object.freeze({
  '本站使用《超时空辉夜姬》相关素材版权归原著所有，本站为非盈利性质。': 'Materials related to Cosmic Princess Kaguya belong to their respective rights holders. This is a non-commercial fan site.',

  '图库管理': 'Gallery Management',
  '公开图库无需登录即可查看。上传图片入口在图库管理页，登录后可以上传、管理并复制图片 Markdown。': 'The public gallery is open to everyone. Sign in to upload, manage and copy Markdown for your images.',
  '去登录': 'Sign in', '查看公开图库': 'View public gallery', '首页 / 图库': 'Home / Gallery', '图库': 'Gallery',
  '管理模式': 'Manage', '管理你上传到图库的图片。管理员可管理全站图库图片。': 'Manage images you uploaded. Administrators can manage the entire gallery.',
  '收藏插画、截图、设定图与站点视觉记录。': 'A collection of illustrations, screenshots, concept art and visual records.',
  '搜索标签、描述或路径...': 'Search tags, descriptions or paths...', '全站图库': 'Entire gallery', '重置': 'Reset', '查看图库': 'View gallery',
  '上传图片': 'Upload image', '登录后上传': 'Sign in to upload', '上传中...': 'Uploading...', '正在上传...': 'Uploading...',
  '管理范围': 'Management scope', '当前图片': 'Images', '本页展示': 'Shown on this page',
  '正在上传图片': 'Uploading image', '拖拽图片到这里上传': 'Drop an image here to upload',
  '支持常见图片格式，存储位置跟随管理员设置': 'Common image formats are supported. Storage follows the administrator’s configuration.',
  '随机影像': 'Random image', '由注册用户上传并加入图库的公开图片，不包含普通附件库图片。': 'Public gallery images uploaded by registered users; ordinary attachments are not included.',
  '复制 Markdown': 'Copy Markdown', '打开': 'Open', '下载': 'Download', '正在读取图库': 'Loading gallery',
  '还没有图片': 'No images yet', '只有选择“上传到图库”的图片会出现在这里，普通附件库图片不会自动展示。': 'Only images explicitly added to the gallery appear here. Ordinary attachments are not shown automatically.',
  '上一页': 'Previous', '下一页': 'Next', '图库概览': 'Gallery overview', '张': 'images', '快速筛选': 'Quick filters',
  '全部图片': 'All images', '壁纸': 'Wallpapers', '截图': 'Screenshots', '图库上传入口': 'Gallery upload',
  '登录后进入「图库管理」页面上传图片；上传到图库的公开图片会显示在当前页面。': 'Sign in and open Gallery Management to upload. Public gallery images will appear on this page.',
  '进入图库管理': 'Open Gallery Management', '常用标签': 'Common tags', '月读': 'Tsukuyomi', '星空': 'Starry sky', '夜景': 'Night scenes', '角色': 'Characters',
  '删除': 'Delete', '删除图片': 'Delete image', '打开图片': 'Open image', '下载图片': 'Download image',

  '数据类型': 'Data type', '使用目的': 'Purpose', '保存位置与说明': 'Storage and notes',
  '账号信息': 'Account information', '用于注册、登录、用户中心展示与权限判断。': 'Used for registration, sign-in, profile display and authorization.',
  '包括用户名、邮箱、加密后的密码、角色与创建时间。密码不会以明文保存。': 'Includes username, email, a password hash, role and creation time. Passwords are never stored in plain text.',
  '文章与留言': 'Articles and messages', '用于展示投稿、评论、留言审核和站内互动。': 'Used for publishing, comments, moderation and on-site interaction.',
  '公开发布的内容可能被其他访客看到；后台保留审核、管理和删除能力。': 'Public content can be seen by other visitors. Moderators can review, manage and delete it.',
  '访问统计': 'Visit statistics', '用于了解页面访问趋势、维护站点稳定性。': 'Used to understand traffic trends and maintain site reliability.',
  '以站点统计数据为主，不用于广告画像或跨站追踪。': 'Used for aggregate site statistics, not advertising profiles or cross-site tracking.',
  '房间本地设置': 'Local room settings', '用于保存 Live2D 房间的模型位置、聊天历史、LLM/TTS 配置等个人体验设置。': 'Stores personal Live2D room settings such as model location, chat history and LLM/TTS configuration.',
  '这类数据主要保存在你的浏览器 localStorage 中。清理浏览器站点数据会删除它们。': 'This data is mainly stored in your browser’s localStorage and is removed when you clear site data.',
  '第三方接口配置': 'Third-party service configuration', '用于用户自行配置房间聊天或语音服务。': 'Lets you configure your own chat or voice services for the room.',
  '请不要在公共设备保存 API Key。站点不会主动将你的密钥写入公开页面。': 'Do not save API keys on shared devices. The site does not intentionally expose your keys on public pages.',
  '登录后可在用户中心查看基础账号信息。': 'Sign in to view basic account information in the User Center.',
  '发现公开内容有误时，可以提供链接申请更正。': 'If public content is inaccurate, provide its link when requesting a correction.',
  '你可以申请删除自己发布的留言、投稿或账号相关数据。': 'You can request deletion of your messages, submissions or account-related data.',
  '浏览器本地房间设置可通过清理站点数据自行删除。': 'Delete local room settings by clearing this site’s browser data.',
  '如发现 XSS、越权、敏感信息泄露等风险，请通过 GitHub Issues 或仓库联系方式报告。': 'Report XSS, authorization flaws or sensitive-data exposure through GitHub Issues or the repository contact details.',
  '报告时请避免公开真实密钥、密码、令牌和他人隐私。': 'Do not publicly disclose real keys, passwords, tokens or another person’s private information.',
  '虚拟角色内容：': 'Virtual character content: ', '外部链接：': 'External links: ', '声明更新：': 'Notice updates: ',
  '素材与版权：': 'Materials and copyright: ', 'Live2D 模型来源：': 'Live2D model source: ', '网页宠物来源：': 'Web pet source: ',
  'Agent OS 音乐 App 技术来源：': 'Agent OS music app technology: ', '图标来源：': 'Icon source: ',
  '本站使用《超时空辉夜姬》相关视觉、角色与音乐素材，版权归原著及相关权利方所有；本站为非盈利性质，仅用于个人兴趣展示与交流。': 'Visuals, characters and music related to Cosmic Princess Kaguya belong to their respective rights holders. This non-commercial site exists for personal interest and community exchange.',
  '站内 Live2D 模型来自 B 站 雪熊企划，模型版权归原作者及相关权利方所有。': 'The Live2D model comes from the Xuexiong Project on Bilibili and remains the property of its creators and rights holders.',
  '右下角 Yachiyo 宠物来自 Petdex / Yachiyo，请以 Petdex 页面标注的来源与使用说明为准。': 'The Yachiyo pet in the lower-right corner comes from Petdex / Yachiyo. Refer to its Petdex page for attribution and usage terms.',
  'Agent OS 页面中的音乐 App 技术实现来源于 firefly20041001/Yachiyo。原项目基于 Electron、React 与 TypeScript，支持 QQ 音乐、网易云音乐及本地播放，并采用 Apache-2.0 许可证。': 'The Agent OS music app is based on firefly20041001/Yachiyo, an Electron, React and TypeScript project supporting QQ Music, NetEase Cloud Music and local playback under the Apache-2.0 license.',
  '站内部分界面图标使用 Lucide 开源图标集，遵循其开源许可证。': 'Some interface icons use the open-source Lucide icon set under its license.',

  '跳至 Wiki 正文': 'Skip to Wiki content', '超辉夜姬！Wiki': 'Cosmic Princess Kaguya! Wiki', '非官方粉丝整理': 'Unofficial fan archive',
  '原创动画电影': 'Original animated film', '音乐 × 科幻 × 青春': 'Music × Science Fiction × Youth', '词条目录': 'Contents',
  '本作介绍': 'About the film', '故事简介': 'Story', '登场人物': 'Characters', '世界观与术语': 'World and terminology',
  '相关音乐': 'Music', '制作与配音': 'Production and cast', '发行与衍生': 'Release and related works', '资料与版权': 'Sources and copyright',
  '词条速查': 'Quick index', '显示推荐词条': 'Show recommended entries', '粉丝整理': 'Fan archive', '非官方网站': 'Unofficial site',
  '叙事母题': 'Narrative motif', '核心舞台': 'Main setting', '音乐阵容': 'Music team', '首次公开': 'First announcement',
  '全球上线': 'Global release', '日本限定上映': 'Limited Japanese screening', '日本全国上映': 'Nationwide Japanese release', '动画 BD': 'Animation Blu-ray',
  '展开完整剧情与结局剧透': 'Show full plot and ending spoilers', '全部': 'All',

  '八千代辉夜姬正在房间里等你': 'Yachiyo is waiting for you in the room', '月读空间': 'Tsukuyomi Space',
  '晴朗': 'Clear', '聊天': 'Chat', '资料': 'Profile', '便签': 'Notes', '设置': 'Settings',
  '与辉夜姬聊天': 'Chat with Yachiyo', '系统': 'System', 'Live2D 已就绪': 'Live2D is ready', '图片': 'Image', '发送': 'Send',
  '房间设置': 'Room Settings', '三步完成基础配置': 'Complete the basic setup in three steps', '重新读取': 'Reload', '返回房间': 'Back to room',
  '聊天模型': 'Chat model', '语音': 'Voice', '记忆': 'Memory', '第 1 步，共 3 步': 'Step 1 of 3', '第 2 步，共 3 步': 'Step 2 of 3', '第 3 步，共 3 步': 'Step 3 of 3',
  '选择聊天模型': 'Choose a chat model', '这是必填项，配置完成后八千代才能回复你。': 'Required before Yachiyo can reply.',
  '本机 Ollama 推荐': 'Local Ollama (recommended)', '无需密钥，数据留在设备上': 'No API key; data stays on your device',
  '云端 API': 'Cloud API', '无需安装，填写密钥即可使用': 'No installation; enter an API key to begin', '提供方': 'Provider',
  'OpenAI · 通用稳定': 'OpenAI · General and reliable', 'DeepSeek · 中文友好': 'DeepSeek · Strong multilingual support', 'Kimi · 长文本': 'Kimi · Long context',
  'OpenRouter · 模型丰富': 'OpenRouter · Broad model selection', '智谱 GLM · 国内服务': 'Zhipu GLM · China-based service',
  '只保存在当前浏览器': 'Stored only in this browser', '模型': 'Model', '高级设置': 'Advanced settings',
  '端点、模型目录、视觉与代理': 'Endpoint, model catalog, vision and proxy', '测试连接': 'Test connection', '保存并继续': 'Save and continue',
  '当前设置': 'Current settings', '待完成': 'Incomplete', '暂不开启': 'Not now', '本地浏览器记忆': 'Local browser memory',
  '不知道怎么选？': 'Not sure what to choose?', '电脑已安装 Ollama 就选本机；否则选常用的云端服务。': 'Choose local if Ollama is installed; otherwise use a cloud provider you trust.',
  '模型位置、代理、视觉策略、知识库、MCP 与 Live2D 调试': 'Model location, proxy, vision strategy, knowledge base, MCP and Live2D diagnostics',
  '下一步': 'Next', '上一步': 'Back', '完成': 'Finish', '保存设置': 'Save settings', '连接成功': 'Connection successful', '连接失败': 'Connection failed'
});

const INLINE_TEXT = Object.freeze({
  '晴朗': 'Clear',
  '本机': 'Local',
  '推荐': 'Recommended'
});

function translated(value) {
  const source = String(value ?? '');
  const trimmed = source.trim();
  if (!trimmed) return source;
  if (TEXT[trimmed]) {
    const offset = source.indexOf(trimmed);
    return source.slice(0, offset) + TEXT[trimmed] + source.slice(offset + trimmed.length);
  }
  if (source.length > 80) return source;
  return Object.entries(INLINE_TEXT).reduce((result, [key, replacement]) => result.replaceAll(key, replacement), source);
}

const CJK_TEXT = /[\u3400-\u9fff\u3040-\u30ff]/u;
const REMOTE_EXCLUDED_SELECTOR = [
  'script', 'style', 'code', 'pre', 'textarea', 'input', 'select', 'option',
  '[contenteditable="true"]', 'a[href^="/users/"]',
  '[class*="author"]', '[class*="username"]', '[class*="user-name"]', '[class*="uploader"]'
].join(',');
const pendingRemote = new Map();
let remoteTimer = 0;
let remoteBusy = false;

function remoteEligible(element) {
  return element instanceof Element && !element.closest(REMOTE_EXCLUDED_SELECTOR);
}

function queueRemoteTranslation(value, target) {
  const source = String(value || '');
  if (!CJK_TEXT.test(source) || source.length > 8000) return;
  if (!pendingRemote.has(source)) pendingRemote.set(source, []);
  pendingRemote.get(source).push(target);
  if (!remoteTimer && !remoteBusy) remoteTimer = window.setTimeout(flushRemoteTranslations, 80);
}

async function flushRemoteTranslations() {
  remoteTimer = 0;
  if (remoteBusy || !pendingRemote.size) return;
  remoteBusy = true;
  const texts = [];
  let total = 0;
  for (const source of pendingRemote.keys()) {
    if (texts.length >= 50 || total + source.length > 20000) break;
    texts.push(source);
    total += source.length;
  }
  const targets = texts.map((source) => pendingRemote.get(source) || []);
  texts.forEach((source) => pendingRemote.delete(source));
  try {
    const response = await fetch('/en-translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    texts.forEach((source, index) => {
      const replacement = String(payload?.translations?.[index] || '').trim();
      if (!replacement || replacement === source) return;
      for (const target of targets[index]) {
        if (target.type === 'text' && target.node.nodeValue === source) target.node.nodeValue = replacement;
        if (target.type === 'attribute' && target.node.getAttribute(target.name) === source) {
          target.node.setAttribute(target.name, replacement);
        }
      }
    });
  } catch (_) {
    // Static translations remain usable while the offline translator restarts or warms its cache.
  } finally {
    remoteBusy = false;
    if (pendingRemote.size && !remoteTimer) remoteTimer = window.setTimeout(flushRemoteTranslations, 120);
  }
}

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const next = translated(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    if (remoteEligible(node.parentElement)) {
      queueRemoteTranslation(node.nodeValue, { type: 'text', node });
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE'].includes(node.tagName)) return;
  for (const name of ['aria-label', 'aria-description', 'placeholder', 'title', 'alt']) {
    if (!node.hasAttribute(name)) continue;
    const current = node.getAttribute(name);
    const next = translated(current);
    if (next !== current) node.setAttribute(name, next);
    if (remoteEligible(node)) {
      queueRemoteTranslation(node.getAttribute(name), { type: 'attribute', node, name });
    }
  }
  for (const child of node.childNodes) translateNode(child);
}

export function enableEnglishStaticInterface() {
  if (!isEnglishSite()) return;
  translateNode(document.documentElement);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateNode(mutation.target);
      for (const node of mutation.addedNodes) translateNode(node);
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
}
