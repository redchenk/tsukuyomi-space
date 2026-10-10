const zh = {
  eyebrow: '月读空间 · 原生应用', title: '把月读空间，\n带到你的设备上。',
  intro: '打开就是八千代的房间。聊天、阅读与创作，延续你熟悉的月读空间。',
  features: ['启动即 Room', '原生文章与预览', '桌面 Agent'], app: '月读空间', native: 'Flutter 原生应用',
  release: '当前发行版', stable: '正式版', preview: '测试版', previewNote: '目前提供测试版，功能仍在持续完善。',
  verified: '已验证版本', latest: '已从 GitHub 检查版本', cached: '最近检查的版本', checking: '正在检查更新…',
  check: '检查更新', checkFailed: '暂时无法检查 GitHub 更新，以下已验证版本仍可直接下载。',
  checkFailedCached: '暂时无法检查更新，保留上次获取的发行版。', published: '发布时间', recommended: '当前设备建议',
  primary: '下载', choose: '选择你的安装包', other: '查看所有平台', versionNotes: '版本说明', history: '历史版本',
  platforms: '你的设备，应该下载哪个？', platformIntro: '普通用户选择每个平台的主下载按钮。模拟器、便携包和自签包已单独标明。',
  direct: '安装包由 GitHub 提供，点击后直接下载，本站不转存或代理安装包。',
  alternative: '其他安装方式', unavailable: '该版本暂未提供此文件', file: '文件', guide: '完整安装说明', checksum: '下载 SHA-256 清单', source: '项目源码',
  stepsTitle: '安装之后，三步开始', steps: [
    ['进入房间', '打开应用直接进入 Room，无需观看开屏动画。'],
    ['连接自己的模型', '首次在聊天区填写模型接口、模型名称和 API Key；已有配置可以继续使用。应用不提供共享模型密钥。'],
    ['按需登录与同步', '使用网站账号访问创作与社区，按现有设置同步账号数据。桌面 Agent 已附带运行时，无需预装命令行工具。']
  ], helpTitle: '下载与安装小提示', help: [
    ['下载没有开始？', '请确认网络可以访问 GitHub，也可以打开版本说明页面，从 Assets 中选择相同文件。下载不经过网站服务器。'],
    ['升级会丢失配置吗？', '建议先备份重要内容，再覆盖安装同一平台的新版本。Android 沿用发行签名；不要为了升级先卸载应用。'],
    ['不方便安装？', '可以继续使用网页房间。iOS 当前没有 App Store 或 TestFlight 安装通道，需要自行签名。']
  ], web: '继续使用网页房间',
  platformsCopy: {
    windows: { name: 'Windows', target: 'Windows 10 / 11 · x64', format: '安装器 EXE', action: '下载 Windows 安装器', note: '运行安装器，按当前用户安装。已包含 Visual C++ 运行库与 WebView2 引导程序。', extra: '便携 ZIP', extraNote: '解压完整目录后运行；第三方登录需要 WebView2。当前发行商未签名，首次启动可能出现 SmartScreen 提示。' },
    macos: { name: 'macOS', target: 'Apple Silicon 与 Intel', format: '通用 DMG', action: '下载 macOS 通用版', note: '同一个文件支持 M 系列与 Intel Mac。打开 DMG，将应用拖入 Applications。', extraNote: '当前未进行 Developer ID 公证，首次启动可能需在系统设置的“隐私与安全性”中允许打开。无需关闭系统安全功能。' },
    android: { name: 'Android', target: '绝大多数安卓手机 · ARM64', format: '手机 APK', action: '下载 Android 手机版', note: '普通安卓手机选择 ARM64 APK；安装时允许浏览器或文件管理器安装应用。', extra: 'x86_64 模拟器 APK', extraNote: 'x86_64 文件用于对应架构的模拟器，不是常见手机版本。目前不提供 32 位 ARM 安装包。' },
    linux: { name: 'Linux', target: 'Ubuntu 22.04 · x64', format: 'DEB 安装包', action: '下载 Linux DEB', note: 'Ubuntu / 兼容 Debian 环境推荐 DEB，可通过系统包管理器安装所需运行库。', extra: '便携 tar.gz', extraNote: '便携包需要相同运行库 ABI。其他发行版请先查看安装说明；ARM Linux 暂无安装包。密钥保存需要桌面 Secret Service。' },
    ios: { name: 'iPhone / iPad', target: 'iOS / iPadOS · ARM64', format: '需自签 IPA', action: '下载 iOS 自签包', note: '这是未签名的真机 IPA，不能直接点击安装。需要自己的 Apple 账号或证书进行签名。', extraNote: '签名时需处理应用及内嵌 Framework。请先阅读安装说明，当前没有 App Store / TestFlight 版本。' }
  }
};
const en = {
  eyebrow: 'Tsukuyomi Space · Native app', title: 'Bring Tsukuyomi Space\nto your device.',
  intro: 'Open straight into Yachiyo’s room. Chat, read and create in the space you already know.',
  features: ['Open into Room', 'Native articles & preview', 'Desktop Agent'], app: 'Tsukuyomi Space', native: 'Native Flutter app',
  release: 'Current release', stable: 'Stable', preview: 'Beta', previewNote: 'The app is currently in beta and continues to improve.',
  verified: 'Verified release', latest: 'Checked on GitHub', cached: 'Recently checked release', checking: 'Checking for updates…',
  check: 'Check for updates', checkFailed: 'GitHub updates are unavailable. You can still download the verified release below.',
  checkFailedCached: 'Updates are unavailable. Keeping the last retrieved release.', published: 'Published', recommended: 'Suggested for this device',
  primary: 'Download', choose: 'Choose your installer', other: 'View all platforms', versionNotes: 'Release notes', history: 'Previous releases',
  platforms: 'Which download fits your device?', platformIntro: 'Choose the main download for everyday use. Emulator, portable and self-signing packages are labeled separately.',
  direct: 'Installers download directly from GitHub. This site does not store or proxy them.',
  alternative: 'Other installation options', unavailable: 'This file is not available in this release', file: 'File', guide: 'Full installation guide', checksum: 'Download SHA-256 list', source: 'Source code',
  stepsTitle: 'Three steps to get started', steps: [
    ['Enter Room', 'The app opens directly into Room, without an opening animation.'],
    ['Connect your model', 'Enter your model endpoint, model ID and API key in chat on first use. Existing settings remain available. No shared model key is included.'],
    ['Sign in when needed', 'Use your website account for creation and community, with account sync following your settings. Desktop Agent includes its runtime; no CLI installation is needed.']
  ], helpTitle: 'Download & installation tips', help: [
    ['The download did not start?', 'Check that you can access GitHub, or open the release page and choose the same file under Assets. Downloads do not pass through this site.'],
    ['Will an update remove my settings?', 'Back up important content, then install the new version for the same platform over the existing app. Android uses the same release signing key. Do not uninstall first.'],
    ['Prefer not to install?', 'You can keep using the web room. iOS currently requires self-signing; there is no App Store or TestFlight distribution.']
  ], web: 'Continue in the web room',
  platformsCopy: {
    windows: { name: 'Windows', target: 'Windows 10 / 11 · x64', format: 'EXE installer', action: 'Download Windows installer', note: 'Run the per-user installer. Visual C++ libraries and the WebView2 bootstrapper are included.', extra: 'Portable ZIP', extraNote: 'Extract the entire folder. Third-party login needs WebView2. The publisher is currently unsigned, so SmartScreen may appear on first launch.' },
    macos: { name: 'macOS', target: 'Apple Silicon & Intel', format: 'Universal DMG', action: 'Download macOS universal', note: 'One file for M-series and Intel Macs. Open the DMG and drag the app into Applications.', extraNote: 'The app is not Developer ID notarized. First launch may require approval in Privacy & Security. You do not need to disable system security.' },
    android: { name: 'Android', target: 'Most Android phones · ARM64', format: 'Phone APK', action: 'Download Android phone APK', note: 'Choose ARM64 for most phones. Allow your browser or file manager to install the app.', extra: 'x86_64 emulator APK', extraNote: 'The x86_64 file is for matching emulators, not most phones. No 32-bit ARM package is available.' },
    linux: { name: 'Linux', target: 'Ubuntu 22.04 · x64', format: 'DEB package', action: 'Download Linux DEB', note: 'DEB is recommended for Ubuntu or compatible Debian systems and installs dependencies through your package manager.', extra: 'Portable tar.gz', extraNote: 'The portable package needs compatible library ABIs. Read the guide for other distributions. ARM Linux is not available. Key storage needs a desktop Secret Service.' },
    ios: { name: 'iPhone / iPad', target: 'iOS / iPadOS · ARM64', format: 'Self-signing IPA', action: 'Download iOS unsigned IPA', note: 'This is an unsigned device IPA and cannot be installed with a tap. Sign it with your own Apple account or certificate.', extraNote: 'The app and embedded frameworks must be signed. Read the guide first. No App Store or TestFlight version is available.' }
  }
};
const ja = {
  eyebrow: '月読空間 · ネイティブアプリ', title: '月読空間を、\nあなたの手もとへ。',
  intro: '起動すると、すぐ八千代の部屋へ。いつもの空間で会話・閲覧・創作を楽しめます。',
  features: ['起動してすぐ Room', '記事とプレビュー', 'デスクトップ Agent'], app: '月読空間', native: 'Flutter ネイティブアプリ',
  release: '現在のリリース', stable: '安定版', preview: 'ベータ版', previewNote: '現在はベータ版です。引き続き改善しています。',
  verified: '確認済みのバージョン', latest: 'GitHub で確認済み', cached: '最近確認したバージョン', checking: '更新を確認中…',
  check: '更新を確認', checkFailed: 'GitHub の更新を確認できません。以下の確認済みバージョンはダウンロードできます。',
  checkFailedCached: '更新を確認できません。前回取得したリリースを表示しています。', published: '公開日', recommended: 'このデバイスの候補',
  primary: 'ダウンロード', choose: 'インストーラーを選ぶ', other: 'すべてのプラットフォーム', versionNotes: 'リリースノート', history: '過去のリリース',
  platforms: 'どのファイルを選べばよい？', platformIntro: '通常は各プラットフォームのメインボタンを選んでください。エミュレーター・ポータブル版・自己署名用は別に表示しています。',
  direct: 'インストーラーは GitHub から直接ダウンロードします。このサイトでは保存・中継しません。',
  alternative: 'ほかのインストール方法', unavailable: 'このリリースにはこのファイルがありません', file: 'ファイル', guide: 'インストールガイド', checksum: 'SHA-256 一覧をダウンロード', source: 'ソースコード',
  stepsTitle: 'インストール後の三つのステップ', steps: [
    ['部屋に入る', 'オープニングアニメーションなしで、すぐ Room に入れます。'],
    ['自分のモデルを接続', '初回はチャット欄で API の URL・モデル名・API Key を設定します。既存設定は引き続き利用できます。共有キーは含まれません。'],
    ['必要に応じてログイン', 'サイトのアカウントで創作とコミュニティを利用し、設定に従って同期できます。デスクトップ Agent のランタイムは同梱済みです。']
  ], helpTitle: 'ダウンロードとインストールのヒント', help: [
    ['ダウンロードが始まらない場合', 'GitHub にアクセスできるか確認してください。リリースページの Assets から同じファイルを選ぶこともできます。サイトのサーバーは経由しません。'],
    ['更新で設定が消えますか？', '重要な内容をバックアップして、同じプラットフォームの新しい版を上書きインストールしてください。Android は同じリリース署名を使います。先にアンインストールしないでください。'],
    ['インストールが難しい場合', 'Web の部屋も引き続き利用できます。iOS は現在、自己署名が必要で、App Store や TestFlight では配布していません。']
  ], web: 'Web の部屋を使う',
  platformsCopy: {
    windows: { name: 'Windows', target: 'Windows 10 / 11 · x64', format: 'EXE インストーラー', action: 'Windows インストーラー', note: 'ユーザー単位でインストールします。Visual C++ ライブラリと WebView2 ブートストラッパーを同梱しています。', extra: 'ポータブル ZIP', extraNote: 'フォルダー全体を展開してください。外部ログインには WebView2 が必要です。発行元は未署名のため、初回に SmartScreen が表示される場合があります。' },
    macos: { name: 'macOS', target: 'Apple Silicon と Intel', format: 'Universal DMG', action: 'macOS Universal 版', note: 'M シリーズと Intel Mac は同じファイルです。DMG を開き、Applications にドラッグしてください。', extraNote: 'Developer ID の公証は未実施です。初回は「プライバシーとセキュリティ」で許可が必要な場合があります。システムの安全機能を無効にする必要はありません。' },
    android: { name: 'Android', target: '一般的なスマートフォン · ARM64', format: 'スマートフォン APK', action: 'Android スマートフォン版', note: '多くのスマートフォンは ARM64 APK を選んでください。ブラウザーやファイル管理アプリからのインストールを許可します。', extra: 'x86_64 エミュレーター APK', extraNote: 'x86_64 は対応エミュレーター用です。一般的なスマートフォン向けではありません。32 ビット ARM 版はありません。' },
    linux: { name: 'Linux', target: 'Ubuntu 22.04 · x64', format: 'DEB パッケージ', action: 'Linux DEB をダウンロード', note: 'Ubuntu や互換 Debian 環境では、依存ライブラリをパッケージ管理で導入できる DEB を推奨します。', extra: 'ポータブル tar.gz', extraNote: 'ポータブル版は互換ライブラリ ABI が必要です。他のディストリビューションはガイドを確認してください。ARM Linux 版はありません。キー保存にはデスクトップ Secret Service が必要です。' },
    ios: { name: 'iPhone / iPad', target: 'iOS / iPadOS · ARM64', format: '自己署名用 IPA', action: 'iOS 自己署名用 IPA', note: '未署名の実機用 IPA です。タップだけではインストールできません。自分の Apple アカウントや証明書で署名してください。', extraNote: 'アプリと内蔵 Framework の署名が必要です。先にガイドを確認してください。App Store / TestFlight 版はありません。' }
  }
};
export function nativeAppCopy(language) { return ({ zh, en, ja })[language] || zh; }
