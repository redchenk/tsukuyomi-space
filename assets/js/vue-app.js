import { createApp, computed, nextTick, onMounted, reactive, ref, watch } from '/assets/vendor/vue.esm-browser.prod.js';

const routes = {
    '/': 'access',
    '/access': 'access',
    '/hub': 'hub',
    '/login': 'login',
    '/register': 'register',
    '/stage': 'stage',
    '/plaza': 'plaza',
    '/reality': 'reality',
    '/editor': 'editor',
    '/user-center': 'userCenter'
};

const i18n = {
    zh: {
        brand: '月读空间',
        access: '进入',
        hub: '大厅',
        login: '登录',
        register: '注册',
        logout: '退出',
        title: '月读空间',
        subtitle: '梦与希望相遇的地方',
        heroCopy: '欢迎来到 Tsukuyomi Space。这里连接 Live2D 私人房间、文章、留言广场与个人中心。',
        connecting: 'CONNECTING...',
        loading: 'LOADING...',
        sync: 'SYNCHRONIZING...',
        welcome: 'WELCOME!',
        hubTitle: '中枢大厅',
        hubSubtitle: '选择一个入口继续探索',
        room: '私人居所',
        roomDesc: 'Live2D 房间、聊天与语音',
        plaza: '月读广场',
        plazaDesc: '留言、点赞与访客互动',
        stage: '主舞台',
        stageDesc: '文章与内容展示',
        arena: '竞技场',
        arenaDesc: '项目与游戏原型',
        reality: '现实回廊',
        realityDesc: '现实世界连接入口',
        terminal: '数据终端',
        terminalDesc: '管理员控制台',
        account: '用户名或邮箱',
        accountPh: '请输入用户名或邮箱',
        emailPh: '请输入已注册邮箱',
        email: '邮箱',
        emailInputPh: '请输入邮箱',
        username: '用户名',
        usernamePh: '请输入用户名',
        password: '密码',
        passwordPh: '请输入密码',
        confirmPassword: '确认密码',
        confirmPh: '请再次输入密码',
        emailCode: '邮箱验证码',
        codePh: '请输入 6 位验证码',
        sendCode: '发送验证码',
        passwordLogin: '密码登录',
        codeLogin: '验证码登录',
        loginSubtitle: '欢迎回来，请登录你的账号',
        registerSubtitle: '创建新的月读空间账号',
        noAccount: '还没有账号？',
        haveAccount: '已有账号？',
        loginSuccess: '登录成功，正在跳转...',
        registerSuccess: '注册成功，正在跳转...',
        codeSent: '验证码已发送，请查看邮箱',
        passwordMismatch: '两次输入的密码不一致',
        stageTitle: '主舞台',
        stageSubtitle: '博客文章',
        searchPlaceholder: '搜索文章...',
        newPost: '✏️ 新建投稿',
        filterAll: '全部',
        filterAnnouncement: '公告',
        filterLegend: '传说',
        filterTechnology: '技术',
        filterOther: '其他',
        noArticles: '暂无文章',
        loadFailed: '加载失败',
        loginRequired: '请先登录后再投稿文章！',
        plazaTitle: '月读广场',
        plazaSubtitle: '访客、创作者和路过的观测者在这里交换留言。把它当作月读空间的公共频道：简短问候、友链申请、反馈和灵感都可以落在这里。',
        plazaEyebrow: 'Tsukuyomi Plaza',
        channelStatus: '当前频道',
        channelValue: '公共留言墙',
        plazaStatusLabel: '广场状态',
        online: '在线',
        syncing: '同步中',
        statsOffline: '统计不可用',
        statsArticles: '站内文章',
        statsArticlesNote: '主舞台内容池',
        statsUsers: '注册访客',
        statsUsersNote: '已接入月读空间',
        statsMessages: '广场留言',
        statsMessagesNote: '包含回复与互动',
        statsUptime: '服务运行',
        statsUptimeNote: '后端在线时长',
        wallTitle: '留言墙',
        refresh: '刷新',
        filterLatest: '最新',
        filterHot: '高赞',
        filterReplied: '有回复',
        filterMine: '我的',
        composerPlaceholder: '写下你的留言...',
        composerHint: 'Enter 换行，发布后会同步到广场。',
        publish: '发布留言',
        publishReply: '发布回复',
        cancel: '取消',
        reply: '回复',
        like: '喜欢',
        copyLink: '复制链接',
        linkCopied: '留言链接已复制',
        guestMode: '访客模式',
        guestDesc: '当前可以浏览留言。登录后可发布、回复与点赞。',
        goLogin: '去登录',
        loggedInDesc: '已接入广场频道。你可以发布留言、回复访客和为留言点赞。',
        loginToPost: '登录后开放留言终端',
        loginToPostDesc: '发布问候、反馈或友链申请都会出现在广场留言墙。',
        noMessages: '还没有匹配的留言',
        noMessagesHint: '换个筛选条件，或者发布第一条广场消息。',
        plazaConnecting: '正在连接广场频道...',
        plazaJustOpened: '广场刚刚开放，等待第一条动态。',
        msgPublished: '留言已发布',
        replyPublished: '回复已发布',
        alreadyLiked: '你已经喜欢过这条留言',
        likedToast: '已点亮留言',
        plazaLoadFailed: '留言加载失败，请稍后再试',
        publishFailed: '发布失败',
        replyFailed: '回复失败',
        likeFailed: '点赞失败',
        contentRequired: '留言内容不能为空',
        replyContentRequired: '回复内容不能为空',
        residents: '常驻访客',
        activity: '广场动态',
        rulesTitle: '留言约定',
        rule1: '保持友好，避免刷屏和敏感信息。',
        rule2: '友链申请请留下站点名、地址和简短介绍。',
        rule3: '反馈问题时尽量写清页面、操作和现象。',
        unknown: '未知错误',
        failedPrefix: '请求失败：',
        realityTitle: '现实锚点',
        realityEyebrow: 'Reality Anchor / 摘下眼镜',
        realitySubtitle: '当虚拟空间的光退到屏幕后，仍需要一个可以确认、联系、说明边界的现实入口。这里收纳月读空间的联系方式、隐私声明、用户数据说明与站点责任边界。',
        realityContactTitle: '联系方式',
        realityContactLead: '如果你需要反馈问题、申请删除内容、讨论友链或报告安全风险，请优先使用下面这些可追踪的渠道。',
        realityContactRepo: '项目仓库',
        realityContactRepoDesc: 'GitHub 仓库：适合提交功能建议、缺陷反馈和代码相关问题。',
        realityContactIssues: '问题反馈',
        realityContactIssuesDesc: '推荐通过 GitHub Issues 描述页面路径、复现步骤、浏览器环境和截图。',
        realityContactPlaza: '站内互动',
        realityContactPlazaDesc: '普通留言、友链交流和访客互动可前往月读广场。登录后的账号资料可在用户中心查看。',
        realityPrivacyTitle: '隐私声明',
        realityPrivacyLead: '月读空间是个人网站。站点只为注册、登录、内容发布、留言互动、访问统计和 Live2D 房间体验处理必要数据。',
        realityRightsTitle: '用户权利与处理方式',
        realityRightsLead: '如果你希望访问、更正或删除与自己相关的内容，请通过上方联系方式提交请求，并尽量说明账号、页面链接和需要处理的范围。',
        realityRightsAccess: '访问与更正',
        realityRightsDelete: '删除与撤回',
        realityRightsSecurity: '安全报告',
        realityNoticeTitle: '责任边界',
        realityNoticeLead: '月读空间包含虚拟角色、用户生成内容和可选第三方接口能力。现实边界写在这里，方便每位访客理解站点如何工作。',
        realityNoticeVirtual: 'Live2D 房间中的对话与语音体验可能来自用户配置的模型或第三方服务，内容仅用于互动体验，不构成专业建议。',
        realityNoticeLinks: '站点可能包含 GitHub、友链或用户提交链接。访问外部网站时，请阅读对方的隐私与安全政策。',
        realityNoticeUpdate: '本页会随着站点功能变化进行调整。最近更新日期：2026-04-29。',
        realityFooterBack: '返回中枢大厅',
        realityFooterBrand: '月读空间 Reality Anchor',
        editorTitle: '文章编辑器',
        editorSubtitle: '写下公告、传说或技术记录',
        editorFieldCover: '封面图片（可选）',
        editorCoverPick: '点击或拖入图片作为文章封面',
        editorCoverHint: '建议 1200 x 630px，支持 JPG / PNG',
        editorRemove: '×',
        editorFieldTitle: '标题',
        editorTitlePh: '请输入文章标题',
        editorFieldCategory: '分类',
        editorCategorySelect: '请选择分类',
        editorCatAnnouncement: '公告',
        editorCatLegend: '传说',
        editorCatTechnology: '技术',
        editorCatOther: '其他',
        editorFieldReadTime: '阅读时间',
        editorReadTimePh: '例如 5 min',
        editorFieldExcerpt: '摘要',
        editorExcerptPh: '用 200 字以内概括文章',
        editorExcerptHint: '摘要会显示在文章列表中',
        editorFieldContent: '正文',
        editorContentPh: '开始书写正文...',
        editorContentHint: '支持 Markdown：# 标题、- 列表、> 引用、\`代码\`',
        editorSubmit: '发布文章',
        editorUpdate: '保存修改',
        editorNeedLogin: '请先登录后再使用编辑器。',
        editorLogin: '前往登录',
        editorLoadFailed: '文章加载失败：',
        editorNetworkFailed: '网络请求失败',
        editorImageOnly: '请选择图片文件',
        editorImageFailed: '图片处理失败，请换一张图片重试',
        editorRequired: '请完整填写标题、分类、阅读时间、摘要和正文',
        editorPublishing: '发布中...',
        editorSaving: '保存中...',
        editorPublished: '文章发布成功，正在跳转...',
        editorSaved: '文章已更新，正在跳转...',
        editorSubmitFailed: '提交失败：',
        ucTitle: '用户中心',
        ucNeedLogin: '需要登录',
        ucLoginPrompt: '登录后可以管理头像、个人简介、投稿文章和账户安全设置。',
        ucGoLogin: '前往登录',
        ucNewPost: '新建投稿',
        ucViewStage: '查看主舞台',
        ucRefresh: '刷新资料',
        ucLogout: '退出登录',
        ucMyArticles: '我的文章',
        ucTotalViews: '累计阅读',
        ucAccountRole: '账户角色',
        ucJoinDate: '加入时间',
        ucPostsTotal: '投稿总数',
        ucArticleViews: '文章访问量',
        ucPermLevel: '权限等级',
        ucTsukuyomiJoin: '月读接入日',
        ucProfile: '个人资料',
        ucArticlesTab: '我的文章',
        ucSecurity: '账户安全',
        ucUsername: '用户名',
        ucUsernameHint: '用户名当前不可在前台修改。',
        ucEmail: '邮箱',
        ucBio: '个人简介',
        ucBioPlaceholder: '介绍一下自己、创作方向或正在做的项目。',
        ucSaveProfile: '保存资料',
        ucSearchArticles: '搜索标题或分类',
        ucWriteNew: '写新文章',
        ucNoArticles: '暂无投稿记录',
        ucNoArticlesHint: '写下第一篇文章，让主舞台亮起来。',
        ucArticleLoadFailed: '文章加载失败，请稍后重试。',
        ucProfileLoadFailed: '资料加载失败',
        ucProfileSaved: '资料已保存',
        ucProfileSaveFailed: '保存失败',
        ucAvatarUpdated: '头像已更新',
        ucAvatarUploadFailed: '头像上传失败',
        ucAvatarTooBig: '图片过大，请选择 6MB 以下文件',
        ucSelectImage: '请选择图片文件',
        ucCurrentPassword: '当前密码',
        ucCurrentPasswordPh: '请输入当前密码',
        ucNewPassword: '新密码',
        ucNewPasswordPh: '至少 6 位',
        ucConfirmNewPassword: '确认新密码',
        ucConfirmNewPasswordPh: '再次输入新密码',
        ucChangePassword: '修改密码',
        ucSecurityTip: '安全提示',
        ucSecurityTipText: '建议使用独立密码，并定期更换。退出公共设备前请点击"退出登录"。',
        ucExitLogin: '退出当前登录',
        ucPasswordChanged: '密码已修改',
        ucPasswordMismatch: '两次输入的新密码不一致',
        ucPasswordTooShort: '新密码长度至少 6 位',
        ucFillAllPasswordFields: '请填写所有密码字段',
        ucPasswordChangeFailed: '密码修改失败',
        ucArticleDeleted: '文章已删除',
        ucArticleDeleteFailed: '删除失败',
        ucDeleteConfirm: '确定删除这篇文章吗？此操作不可撤销。',
        ucView: '查看',
        ucEdit: '编辑',
        ucDelete: '删除',
        ucUntitled: '未命名文章',
        ucNoBio: '还没有个人简介。',
        ucUser: '普通用户',
        ucAdmin: '管理员',
        ucLoadingArticles: '正在读取投稿记录...',
        ucChangeAvatar: '更换头像',
        ucUploadAvatar: '上传头像',
        ucReading: '阅读'
    },
    ja: {
        brand: '月読空間',
        access: 'アクセス',
        hub: 'ホール',
        login: 'ログイン',
        register: '新規登録',
        logout: 'ログアウト',
        title: '月読空間',
        subtitle: '夢と希望が交わる場所',
        heroCopy: 'Tsukuyomi Space へようこそ。Live2D の私室、記事、メッセージ広場、ユーザーセンターへつながる場所です。',
        connecting: 'CONNECTING...',
        loading: 'LOADING...',
        sync: 'SYNCHRONIZING...',
        welcome: 'WELCOME!',
        hubTitle: '中枢ホール',
        hubSubtitle: '入口を選んで探索を続けましょう',
        room: 'プライベートルーム',
        roomDesc: 'Live2D ルーム、チャット、音声',
        plaza: '月読広場',
        plazaDesc: 'メッセージ、いいね、交流',
        stage: 'メインステージ',
        stageDesc: '記事とコンテンツ',
        arena: 'アリーナ',
        arenaDesc: 'プロジェクトとゲーム試作',
        reality: 'リアル回廊',
        realityDesc: '現実世界へのリンク',
        terminal: 'データ端末',
        terminalDesc: '管理者コンソール',
        account: 'ユーザー名またはメール',
        accountPh: 'ユーザー名またはメールを入力',
        emailPh: '登録済みメールを入力',
        email: 'メール',
        emailInputPh: 'メールを入力',
        username: 'ユーザー名',
        usernamePh: 'ユーザー名を入力',
        password: 'パスワード',
        passwordPh: 'パスワードを入力',
        confirmPassword: 'パスワード確認',
        confirmPh: 'もう一度入力してください',
        emailCode: 'メール認証コード',
        codePh: '6桁のコードを入力',
        sendCode: 'コード送信',
        passwordLogin: 'パスワード',
        codeLogin: '認証コード',
        loginSubtitle: 'おかえりなさい。アカウントにログインしてください',
        registerSubtitle: '月読空間のアカウントを作成',
        noAccount: 'アカウントをお持ちでないですか？',
        haveAccount: 'アカウントをお持ちですか？',
        loginSuccess: 'ログイン成功。移動しています...',
        registerSuccess: '登録成功。移動しています...',
        codeSent: '認証コードを送信しました',
        passwordMismatch: 'パスワードが一致しません',
        plazaTitle: '月読広場',
        plazaSubtitle: '訪問者、クリエイター、通りすがりの観測者がメッセージを交わす場所です。月読空間のパブリックチャンネルとしてお使いください。',
        plazaEyebrow: 'Tsukuyomi Plaza',
        channelStatus: '現在のチャンネル',
        channelValue: 'パブリック掲示板',
        plazaStatusLabel: '広場の状態',
        online: 'オンライン',
        syncing: '同期中',
        statsOffline: '統計オフライン',
        statsArticles: '記事数',
        statsArticlesNote: 'メインステージのコンテンツ',
        statsUsers: '登録ユーザー',
        statsUsersNote: '月読空間に接続済み',
        statsMessages: '広場のメッセージ',
        statsMessagesNote: '返信とリアクションを含む',
        statsUptime: '稼働時間',
        statsUptimeNote: 'バックエンドの稼働時間',
        wallTitle: 'メッセージウォール',
        refresh: '更新',
        filterLatest: '最新',
        filterHot: '人気',
        filterReplied: '返信あり',
        filterMine: '自分の',
        composerPlaceholder: 'メッセージを書く...',
        composerHint: 'Enterで改行、投稿後に広場に同期されます。',
        publish: '投稿する',
        publishReply: '返信する',
        cancel: 'キャンセル',
        reply: '返信',
        like: 'いいね',
        copyLink: 'リンクコピー',
        linkCopied: 'リンクをコピーしました',
        guestMode: 'ゲストモード',
        guestDesc: 'メッセージの閲覧が可能です。ログインすると投稿・返信・いいねができます。',
        goLogin: 'ログイン',
        loggedInDesc: '広場チャンネルに接続済みです。メッセージの投稿、返信、いいねができます。',
        loginToPost: 'ログインして投稿端末を開く',
        loginToPostDesc: '挨拶、フィードバック、友達リンク申請などが広場に表示されます。',
        noMessages: '一致するメッセージがありません',
        noMessagesHint: 'フィルターを変更するか、最初のメッセージを投稿してください。',
        plazaConnecting: '広場チャンネルに接続中...',
        plazaJustOpened: '広場は開設されたばかりです。最初の投稿をお待ちしています。',
        msgPublished: 'メッセージを投稿しました',
        replyPublished: '返信を投稿しました',
        alreadyLiked: 'すでにいいねしています',
        likedToast: 'いいねしました',
        plazaLoadFailed: 'メッセージの読み込みに失敗しました',
        publishFailed: '投稿に失敗しました',
        replyFailed: '返信に失敗しました',
        likeFailed: 'いいねに失敗しました',
        contentRequired: 'メッセージを入力してください',
        replyContentRequired: '返信内容を入力してください',
        residents: '常駐メンバー',
        activity: '広場の動き',
        rulesTitle: '広場のルール',
        rule1: '友好的に、スパムや機密情報の投稿はお控えください。',
        rule2: '友達リンク申請はサイト名、URL、簡単な紹介を添えてください。',
        rule3: 'フィードバックはページ、操作内容、現象を具体的にお書きください。',
        unknown: '不明なエラー',
        failedPrefix: 'リクエスト失敗：',
        stageTitle: 'メインステージ',
        stageSubtitle: 'ブログ記事',
        searchPlaceholder: '記事を検索...',
        newPost: '✏️ 新規投稿',
        filterAll: 'すべて',
        filterAnnouncement: 'お知らせ',
        filterLegend: '伝説',
        filterTechnology: '技術',
        filterOther: 'その他',
        noArticles: '記事がありません',
        loadFailed: '読み込み失敗',
        loginRequired: '投稿するにはログインしてください！',
        realityTitle: '現実アンカー',
        realityEyebrow: 'Reality Anchor / メガネを外す',
        realitySubtitle: 'バーチャル空間の光がスクリーンの後ろに退いても、確認し、連絡し、境界を説明するための現実の入り口は必要です。ここには月読空間の連絡先、プライバシーポリシー、データ説明、サイトの責任範囲をまとめています。',
        realityContactTitle: '連絡先',
        realityContactLead: '問題の報告、コンテンツ削除の申請、友達リンクの相談、セキュリティリスクの報告には、以下の追跡可能なチャンネルをご利用ください。',
        realityContactRepo: 'プロジェクトリポジトリ',
        realityContactRepoDesc: 'GitHub リポジトリ：機能提案、バグ報告、コード関連の問題に適しています。',
        realityContactIssues: '問題報告',
        realityContactIssuesDesc: 'GitHub Issues でページパス、再現手順、ブラウザ環境、スクリーンショットを説明してください。',
        realityContactPlaza: 'サイト内交流',
        realityContactPlazaDesc: '通常のメッセージ、友達リンクの交流、訪問者交流は月読広場へ。ログイン後のアカウント情報はユーザーセンターで確認できます。',
        realityPrivacyTitle: 'プライバシーポリシー',
        realityPrivacyLead: '月読空間は個人サイトです。登録、ログイン、コンテンツ公開、メッセージ交流、アクセス統計、Live2D ルーム体験に必要なデータのみを処理します。',
        realityRightsTitle: 'ユーザーの権利と対応方法',
        realityRightsLead: 'ご自身に関連するコンテンツのアクセス、修正、削除をご希望の場合は、上記の連絡先からリクエストを送信し、アカウント、ページリンク、対応範囲を明記してください。',
        realityRightsAccess: 'アクセスと修正',
        realityRightsDelete: '削除と取り消し',
        realityRightsSecurity: 'セキュリティ報告',
        realityNoticeTitle: '責任範囲',
        realityNoticeLead: '月読空間にはバーチャルキャラクター、ユーザー生成コンテンツ、オプションのサードパーティAPI機能が含まれます。現実の境界をここに記し、訪問者がサイトの仕組みを理解できるようにします。',
        realityNoticeVirtual: 'Live2D ルームでの会話や音声体験は、ユーザーが設定したモデルやサードパーティサービスによるものであり、インタラクティブ体験のためのものであり、専門的なアドバイスを構成するものではありません。',
        realityNoticeLinks: 'サイトには GitHub、友達リンク、ユーザー投稿リンクが含まれる場合があります。外部サイトにアクセスする際は、そのサイトのプライバシーとセキュリティポリシーをお読みください。',
        realityNoticeUpdate: 'このページはサイト機能の変更に伴い更新されます。最終更新日：2026-04-29。',
        realityFooterBack: '中枢ホールに戻る',
        realityFooterBrand: '月読空間 Reality Anchor',
        editorTitle: '記事エディター',
        editorSubtitle: 'お知らせ、伝説、技術記録を書く',
        editorFieldCover: 'カバー画像（任意）',
        editorCoverPick: 'クリックして記事カバーを選択',
        editorCoverHint: '推奨 1200 x 630px、JPG / PNG 対応',
        editorRemove: '×',
        editorFieldTitle: 'タイトル',
        editorTitlePh: '記事タイトルを入力',
        editorFieldCategory: 'カテゴリ',
        editorCategorySelect: 'カテゴリを選択',
        editorCatAnnouncement: 'お知らせ',
        editorCatLegend: '伝説',
        editorCatTechnology: '技術',
        editorCatOther: 'その他',
        editorFieldReadTime: '読了時間',
        editorReadTimePh: '例：5 min',
        editorFieldExcerpt: '概要',
        editorExcerptPh: '200字以内で概要を書く',
        editorExcerptHint: '一覧に表示されます',
        editorFieldContent: '本文',
        editorContentPh: '本文を書き始める...',
        editorContentHint: 'Markdown 対応：# 見出し、- リスト、> 引用、\`コード\`',
        editorSubmit: '記事を公開',
        editorUpdate: '変更を保存',
        editorNeedLogin: 'ログインしてからエディターを使用してください。',
        editorLogin: 'ログインへ',
        editorLoadFailed: '記事の読み込みに失敗：',
        editorNetworkFailed: 'ネットワークエラー',
        editorImageOnly: '画像ファイルを選択してください',
        editorImageFailed: '画像処理に失敗しました',
        editorRequired: '必須項目をすべて入力してください',
        editorPublishing: '公開中...',
        editorSaving: '保存中...',
        editorPublished: '公開しました。移動しています...',
        editorSaved: '保存しました。移動しています...',
        editorSubmitFailed: '送信失敗：',
        ucTitle: 'ユーザーセンター',
        ucNeedLogin: 'ログインが必要です',
        ucLoginPrompt: 'ログイン後、アバター、プロフィール、投稿記事、アカウントセキュリティを管理できます。',
        ucGoLogin: 'ログインへ',
        ucNewPost: '新規投稿',
        ucViewStage: 'ステージを見る',
        ucRefresh: '情報を更新',
        ucLogout: 'ログアウト',
        ucMyArticles: '自分の記事',
        ucTotalViews: '総閲覧数',
        ucAccountRole: 'アカウント権限',
        ucJoinDate: '参加日',
        ucPostsTotal: '投稿総数',
        ucArticleViews: '記事アクセス数',
        ucPermLevel: '権限レベル',
        ucTsukuyomiJoin: '月読参加日',
        ucProfile: 'プロフィール',
        ucArticlesTab: '自分の記事',
        ucSecurity: 'セキュリティ',
        ucUsername: 'ユーザー名',
        ucUsernameHint: 'ユーザー名は現在フロントエンドから変更できません。',
        ucEmail: 'メール',
        ucBio: '自己紹介',
        ucBioPlaceholder: '自己紹介、創作の方向性、取り組んでいるプロジェクトなど。',
        ucSaveProfile: 'プロフィールを保存',
        ucSearchArticles: 'タイトルまたはカテゴリで検索',
        ucWriteNew: '新規作成',
        ucNoArticles: '投稿記録がありません',
        ucNoArticlesHint: '最初の記事を書いて、メインステージを輝かせましょう。',
        ucArticleLoadFailed: '記事の読み込みに失敗しました',
        ucProfileLoadFailed: 'プロフィールの読み込みに失敗しました',
        ucProfileSaved: 'プロフィールを保存しました',
        ucProfileSaveFailed: '保存に失敗しました',
        ucAvatarUpdated: 'アバターを更新しました',
        ucAvatarUploadFailed: 'アバターのアップロードに失敗しました',
        ucAvatarTooBig: '画像が大きすぎます。6MB以下のファイルを選択してください',
        ucSelectImage: '画像ファイルを選択してください',
        ucCurrentPassword: '現在のパスワード',
        ucCurrentPasswordPh: '現在のパスワードを入力',
        ucNewPassword: '新しいパスワード',
        ucNewPasswordPh: '6文字以上',
        ucConfirmNewPassword: '新しいパスワード（確認）',
        ucConfirmNewPasswordPh: 'もう一度入力',
        ucChangePassword: 'パスワードを変更',
        ucSecurityTip: 'セキュリティのヒント',
        ucSecurityTipText: '独立したパスワードを使用し、定期的に変更することをお勧めします。公共の端末からは「ログアウト」してください。',
        ucExitLogin: 'ログアウト',
        ucPasswordChanged: 'パスワードを変更しました',
        ucPasswordMismatch: '新しいパスワードが一致しません',
        ucPasswordTooShort: 'パスワードは6文字以上必要です',
        ucFillAllPasswordFields: 'すべてのパスワード欄を入力してください',
        ucPasswordChangeFailed: 'パスワード変更に失敗しました',
        ucArticleDeleted: '記事を削除しました',
        ucArticleDeleteFailed: '削除に失敗しました',
        ucDeleteConfirm: 'この記事を削除してもよろしいですか？この操作は取り消せません。',
        ucView: '表示',
        ucEdit: '編集',
        ucDelete: '削除',
        ucUntitled: '無題の記事',
        ucNoBio: 'まだ自己紹介がありません。',
        ucUser: '一般ユーザー',
        ucAdmin: '管理者',
        ucLoadingArticles: '投稿記録を読み込み中...',
        ucChangeAvatar: 'アバター変更',
        ucUploadAvatar: 'アバターアップロード',
        ucReading: '閲覧'
    }
};

function normalizePath(pathname) {
    return pathname.replace(/\/+$/, '') || '/';
}

function pushRoute(path) {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

async function parseResponse(response) {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : { success: false, message: `HTTP ${response.status}` };
    } catch (_) {
        return {
            success: false,
            message: text.replace(/<[^>]*>/g, '').trim().slice(0, 120) || `HTTP ${response.status}`
        };
    }
}

function countdown(buttonState, label) {
    buttonState.seconds = 60;
    const timer = setInterval(() => {
        buttonState.seconds -= 1;
        if (buttonState.seconds <= 0) {
            clearInterval(timer);
            buttonState.loading = false;
            buttonState.seconds = 0;
            buttonState.label = label;
        } else {
            buttonState.label = `${buttonState.seconds}s`;
        }
    }, 1000);
}

const PlazaComposer = {
    props: ['t', 'onSubmit'],
    setup(props) {
        const text = ref('');
        const charCount = computed(() => `${text.value.length} / 300`);
        function insert(prefix) { text.value = `${prefix} ${text.value}`.slice(0, 300); }
        async function submit() {
            const ok = await props.onSubmit(text.value);
            if (ok) text.value = '';
        }
        return { text, charCount, insert, submit };
    },
    template: `
        <div>
            <div class="plaza-composer-top">
                <span>发布一条新的广场留言</span>
                <span class="plaza-char-count">{{ charCount }}</span>
            </div>
            <textarea class="plaza-textarea" v-model="text" maxlength="300" :placeholder="t.composerPlaceholder"></textarea>
            <div class="plaza-moods">
                <button class="chip" type="button" @click="insert('【问候】')">问候</button>
                <button class="chip" type="button" @click="insert('【反馈】')">反馈</button>
                <button class="chip" type="button" @click="insert('【友链】')">友链</button>
                <button class="chip" type="button" @click="insert('【灵感】')">灵感</button>
            </div>
            <div class="plaza-composer-actions">
                <span class="plaza-char-count">{{ t.composerHint }}</span>
                <button class="primary-btn" @click="submit">{{ t.publish }}</button>
            </div>
        </div>
    `
};

const PlazaReplyForm = {
    props: ['t', 'msgId', 'onSubmit'],
    emits: ['cancel'],
    setup(props, { emit }) {
        const text = ref('');
        async function submit() {
            const ok = await props.onSubmit(props.msgId, text.value);
            if (ok) text.value = '';
        }
        return { text, submit, emit };
    },
    template: `
        <div>
            <textarea class="plaza-textarea plaza-reply-textarea" v-model="text" maxlength="220" :placeholder="t.replyContentRequired"></textarea>
            <div class="plaza-msg-footer">
                <button class="primary-btn" @click="submit">{{ t.publishReply }}</button>
                <button class="ghost-btn" @click="emit('cancel')">{{ t.cancel }}</button>
            </div>
        </div>
    `
};

const App = {
    components: { PlazaComposer, PlazaReplyForm },
    setup() {
        const lang = ref(localStorage.getItem('lang') || 'zh');
        const path = ref(normalizePath(location.pathname));
        const user = ref(null);
        const accessLoading = reactive({ active: false, progress: 0, text: '' });
        const login = reactive({
            method: 'password',
            username: '',
            password: '',
            emailCode: '',
            message: '',
            type: 'error',
            sending: { loading: false, label: '' }
        });
        const register = reactive({
            username: '',
            email: '',
            emailCode: '',
            password: '',
            confirmPassword: '',
            message: '',
            type: 'error',
            sending: { loading: false, label: '' }
        });

        const t = computed(() => i18n[lang.value] || i18n.zh);
        const route = computed(() => routes[path.value] || 'access');
        const isAuthed = computed(() => Boolean(user.value));
        const loginPlaceholder = computed(() => login.method === 'code' ? t.value.emailPh : t.value.accountPh);
        const sceneLinks = computed(() => [
            { href: '/pages/room', icon: '◇', name: t.value.room, desc: t.value.roomDesc },
            { href: '/plaza', icon: '◎', name: t.value.plaza, desc: t.value.plazaDesc },
            { href: '/stage', icon: '▣', name: t.value.stage, desc: t.value.stageDesc },
            { href: '/pages/arena', icon: '△', name: t.value.arena, desc: t.value.arenaDesc },
            { href: '/reality', icon: '◌', name: t.value.reality, desc: t.value.realityDesc }
        ]);

        // --- stage page ---
        const articles = ref([]);
        const articlesLoading = ref(true);
        const stageCategory = ref('all');
        const stageSearch = ref('');
        const categories = ['all', '公告', '传说', '技术', '其他'];

        const filteredArticles = computed(() => {
            let list = articles.value;
            if (stageCategory.value !== 'all') {
                list = list.filter(a => a.category === stageCategory.value);
            }
            if (stageSearch.value) {
                const q = stageSearch.value.toLowerCase();
                list = list.filter(a =>
                    a.title.toLowerCase().includes(q) ||
                    (a.excerpt && a.excerpt.toLowerCase().includes(q))
                );
            }
            return list;
        });

        async function loadArticles() {
            articlesLoading.value = true;
            try {
                const res = await fetch('/api/articles');
                const result = await parseResponse(res);
                if (result.success) {
                    articles.value = result.data;
                } else {
                    articles.value = [];
                }
            } catch (_) {
                articles.value = [];
            } finally {
                articlesLoading.value = false;
            }
        }

        function checkEditorAuth(event) {
            if (!isAuthed.value) {
                event.preventDefault();
                alert(t.value.loginRequired);
                pushRoute('/login');
                return false;
            }
        }

        function stageCategoryLabel(cat) {
            const map = {
                all: t.value.filterAll,
                '公告': t.value.filterAnnouncement,
                '传说': t.value.filterLegend,
                '技术': t.value.filterTechnology,
                '其他': t.value.filterOther
            };
            return map[cat] || cat;
        }

        // --- plaza page ---
        const plaza = reactive({
            messages: [],
            stats: null,
            filter: 'latest',
            query: '',
            loading: false,
            replyOpen: {}
        });
        const plazaToast = reactive({ text: '', visible: false });
        let plazaToastTimer = 0;

        const friends = [
            { name: '月读空间官方', desc: '项目仓库与更新记录', url: 'https://github.com/redchenk/tsukuyomi-space', avatar: '月' },
            { name: '辉夜姬博客', desc: '文章、公告与创作札记', url: '/pages/stage', avatar: '文' },
            { name: 'KASSEN 竞技场', desc: '3v3 涨粉对抗原型', url: '/pages/arena', avatar: '战' },
            { name: '友链申请', desc: '留下站点信息等待审核', url: '/pages/terminal', avatar: '链' }
        ];

        const plazaMessages = computed(() => {
            const all = plaza.messages;
            const repliesByParent = {};
            all.forEach(item => {
                if (!item.parent_id) return;
                (repliesByParent[item.parent_id] = repliesByParent[item.parent_id] || []).push(item);
            });
            let top = all.filter(item => !item.parent_id).map(item => ({
                ...item,
                replies: (repliesByParent[item.id] || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            }));
            if (plaza.query) {
                const q = plaza.query.toLowerCase();
                top = top.filter(item => {
                    const haystack = `${item.author || ''} ${item.content || ''} ${item.replies.map(r => `${r.author || ''} ${r.content || ''}`).join(' ')}`.toLowerCase();
                    return haystack.includes(q);
                });
            }
            const currentUsername = user.value?.username;
            if (plaza.filter === 'hot') {
                top.sort((a, b) => (b.like_count || 0) - (a.like_count || 0) || new Date(b.created_at) - new Date(a.created_at));
            } else if (plaza.filter === 'replied') {
                top = top.filter(item => item.replies.length > 0);
                top.sort((a, b) => b.replies.length - a.replies.length || new Date(b.created_at) - new Date(a.created_at));
            } else if (plaza.filter === 'mine') {
                top = top.filter(item => currentUsername && item.author === currentUsername);
                top.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            } else {
                top.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
            return top;
        });

        const plazaActivity = computed(() => {
            return [...plaza.messages]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 6);
        });

        function showPlazaToast(text) {
            plazaToast.text = text;
            plazaToast.visible = true;
            clearTimeout(plazaToastTimer);
            plazaToastTimer = setTimeout(() => { plazaToast.visible = false; }, 2200);
        }

        async function loadPlazaStats() {
            try {
                const res = await fetch('/api/stats');
                const result = await parseResponse(res);
                if (result.success) plaza.stats = result.data || {};
            } catch (_) {}
        }

        async function loadPlazaMessages() {
            try {
                const res = await fetch('/api/messages');
                const result = await parseResponse(res);
                if (result.success) plaza.messages = Array.isArray(result.data) ? result.data : [];
            } catch (_) {
                showPlazaToast(t.value.plazaLoadFailed);
            }
        }

        async function refreshPlaza() {
            plaza.loading = true;
            try {
                await Promise.all([loadPlazaStats(), loadPlazaMessages()]);
            } finally {
                plaza.loading = false;
            }
        }

        async function plazaSubmitMessage(content) {
            if (!isAuthed.value) { pushRoute('/login'); return; }
            if (!content.trim()) { showPlazaToast(t.value.contentRequired); return; }
            try {
                const token = localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
                const res = await fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ content: content.trim() })
                });
                const result = await parseResponse(res);
                if (!result.success) throw new Error(result.message || t.value.publishFailed);
                showPlazaToast(t.value.msgPublished);
                await refreshPlaza();
                return true;
            } catch (e) {
                showPlazaToast(e.message || t.value.publishFailed);
                return false;
            }
        }

        async function plazaSubmitReply(parentId, content) {
            if (!isAuthed.value) { pushRoute('/login'); return; }
            if (!content.trim()) { showPlazaToast(t.value.replyContentRequired); return; }
            try {
                const token = localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
                const res = await fetch(`/api/messages/${parentId}/reply`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ content: content.trim() })
                });
                const result = await parseResponse(res);
                if (!result.success) throw new Error(result.message || t.value.replyFailed);
                showPlazaToast(t.value.replyPublished);
                await refreshPlaza();
                return true;
            } catch (e) {
                showPlazaToast(e.message || t.value.replyFailed);
                return false;
            }
        }

        async function plazaLikeMessage(id) {
            if (!isAuthed.value) { pushRoute('/login'); return; }
            if (localStorage.getItem('liked_' + id) === '1') { showPlazaToast(t.value.alreadyLiked); return; }
            try {
                const token = localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
                const res = await fetch(`/api/messages/${id}/like`, {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + token }
                });
                const result = await parseResponse(res);
                if (!result.success) throw new Error(result.message || t.value.likeFailed);
                localStorage.setItem('liked_' + id, '1');
                showPlazaToast(t.value.likedToast);
                await refreshPlaza();
            } catch (e) {
                showPlazaToast(e.message || t.value.likeFailed);
            }
        }

        async function plazaCopyLink(id) {
            const url = `${location.origin}/plaza#msg-${id}`;
            try {
                await navigator.clipboard.writeText(url);
                showPlazaToast(t.value.linkCopied);
            } catch (_) {
                location.hash = 'msg-' + id;
                showPlazaToast(t.value.linkCopied);
            }
        }

        function plazaToggleReply(id) {
            if (!isAuthed.value) { pushRoute('/login'); return; }
            plaza.replyOpen = { ...plaza.replyOpen, [id]: !plaza.replyOpen[id] };
        }

        function isPlazaMessageLiked(id) { try { return localStorage.getItem('liked_' + id) === '1'; } catch (_) { return false; } }
        function plazaInitial(name) { return String(name || '访客').trim().slice(0, 1).toUpperCase(); }

        function plazaFormatDate(value) {
            if (!value) return '—';
            return new Date(value).toLocaleString(lang.value === 'zh' ? 'zh-CN' : 'ja-JP', { hour12: false });
        }

        function plazaFormatRelative(value) {
            const diff = Math.max(0, Date.now() - new Date(value).getTime());
            const min = Math.floor(diff / 60000);
            if (min < 1) return lang.value === 'zh' ? '刚刚' : 'たった今';
            if (min < 60) return `${min} ${lang.value === 'zh' ? '分钟前' : '分前'}`;
            const hour = Math.floor(min / 60);
            if (hour < 24) return `${hour} ${lang.value === 'zh' ? '小时前' : '時間前'}`;
            return `${Math.floor(hour / 24)} ${lang.value === 'zh' ? '天前' : '日前'}`;
        }

        function plazaFormatNumber(v) { return Number(v || 0).toLocaleString(lang.value === 'zh' ? 'zh-CN' : 'ja-JP'); }

        // --- editor page ---
        const editor = reactive({
            coverImageBase64: null,
            coverImageSize: 0,
            currentArticle: null,
            message: '',
            messageType: 'error',
            submitting: false,
            loading: true
        });

        function editorShowMessage(type, msg) {
            editor.message = msg;
            editor.messageType = type;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function compressImage(file, maxWidth = 1200, maxHeight = 630, quality = 0.72) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => {
                    const img = new Image();
                    img.onload = () => {
                        let w = img.width, h = img.height;
                        if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; }
                        if (h > maxHeight) { w *= maxHeight / h; h = maxHeight; }
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.round(w);
                        canvas.height = Math.round(h);
                        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    };
                    img.onerror = reject;
                    img.src = e.target.result;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        async function handleEditorCoverUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) return editorShowMessage('error', t.value.editorImageOnly);
            try {
                editor.coverImageBase64 = await compressImage(file);
                editor.coverImageSize = Math.round(editor.coverImageBase64.length * 3 / 4);
                nextTick(() => {
                    const preview = document.getElementById('editorCoverPreview');
                    const placeholder = document.getElementById('editorCoverPlaceholder');
                    const upload = document.getElementById('editorCoverUpload');
                    if (preview) { preview.src = editor.coverImageBase64; preview.classList.add('show'); }
                    if (placeholder) placeholder.style.display = 'none';
                    if (upload) upload.classList.add('has-image');
                });
            } catch (_) {
                editorShowMessage('error', t.value.editorImageFailed);
            }
        }

        function removeEditorCover() {
            editor.coverImageBase64 = null;
            editor.coverImageSize = 0;
            const input = document.getElementById('editorCoverInput');
            if (input) input.value = '';
            const preview = document.getElementById('editorCoverPreview');
            const placeholder = document.getElementById('editorCoverPlaceholder');
            const upload = document.getElementById('editorCoverUpload');
            if (preview) { preview.src = ''; preview.classList.remove('show'); }
            if (placeholder) placeholder.style.display = 'block';
            if (upload) upload.classList.remove('has-image');
        }

        async function handleEditorSubmit(e) {
            e.preventDefault();
            const title = document.getElementById('editorTitle')?.value?.trim();
            const category = document.getElementById('editorCategory')?.value;
            const readTime = document.getElementById('editorReadTime')?.value?.trim();
            const excerpt = document.getElementById('editorExcerpt')?.value?.trim();
            const content = document.getElementById('editorContent')?.value?.trim();
            if (!title || !category || !readTime || !excerpt || !content) return editorShowMessage('error', t.value.editorRequired);

            editor.submitting = true;
            try {
                const body = { title, category, read_time: readTime, excerpt, content, cover_image: editor.coverImageBase64 };
                const id = new URLSearchParams(location.search).get('id');
                let url = '/api/articles', method = 'POST';
                if (id) {
                    const session = getSession();
                    url = (session?.admin) ? `/api/admin/articles/${id}` : `/api/user/articles/${id}`;
                    method = 'PUT';
                }
                const token = localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify(body)
                });
                const result = await parseResponse(res);
                if (!result.success) throw new Error(result.message || t.value.unknown);
                editorShowMessage('success', id ? t.value.editorSaved : t.value.editorPublished);
                setTimeout(() => pushRoute(id ? '/stage' : '/stage'), 1000);
            } catch (err) {
                editorShowMessage('error', t.value.editorSubmitFailed + (err.message || t.value.editorNetworkFailed));
            } finally {
                editor.submitting = false;
            }
        }

        async function initEditor() {
            const session = getSession();
            if (!session) {
                editor.loading = false;
                return;
            }
            const id = new URLSearchParams(location.search).get('id');
            if (id) {
                try {
                    const url = session.admin ? `/api/admin/articles/${id}` : `/api/user/articles/${id}`;
                    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + session.token } });
                    const result = await parseResponse(res);
                    if (!result.success) throw new Error(result.message || t.value.unknown);
                    editor.currentArticle = result.data;
                    if (result.data.cover_image) {
                        editor.coverImageBase64 = result.data.cover_image;
                    }
                    await nextTick();
                    const catEl = document.getElementById('editorCategory');
                    if (catEl && result.data.category) {
                        const validCats = ['公告', '传说', '技术', '其他'];
                        catEl.value = validCats.includes(result.data.category) ? result.data.category : '其他';
                    }
                } catch (e) {
                    editor.message = t.value.editorLoadFailed + (e.message || t.value.editorNetworkFailed);
                    editor.messageType = 'error';
                }
            } else {
                editor.currentArticle = null;
            }
            editor.loading = false;
        }

        // --- user-center page ---
        const uc = reactive({
            tab: 'profile',
            profileMsg: '',
            profileMsgType: 'error',
            passwordMsg: '',
            passwordMsgType: 'error',
            profileSaving: false,
            passwordChanging: false,
            articles: [],
            articleQuery: '',
            articleLoading: true,
            avatarUploading: false
        });

        const ucToast = reactive({ text: '', visible: false });
        let ucToastTimer = 0;

        function ucShowToast(text) {
            ucToast.text = text;
            ucToast.visible = true;
            clearTimeout(ucToastTimer);
            ucToastTimer = setTimeout(() => { ucToast.visible = false; }, 2200);
        }

        function ucShowMessage(target, type, msg) {
            target.msg = msg;
            target.msgType = type;
            clearTimeout(target._timer);
            target._timer = setTimeout(() => { target.msg = ''; target.msgType = 'error'; }, 3200);
        }

        function ucDefaultAvatar(name) {
            const initial = encodeURIComponent((name || '月').slice(0, 1));
            return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23ffb7c5'/%3E%3Cstop offset='1' stop-color='%23ff6b9d'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='50' fill='url(%23g)'/%3E%3Ctext x='50' y='62' text-anchor='middle' font-size='42' font-family='Arial' fill='%231a1025'%3E${initial}%3C/text%3E%3C/svg%3E`;
        }

        const ucUser = ref(null);
        const ucAvatarSrc = computed(() => ucUser.value?.avatar || ucDefaultAvatar(ucUser.value?.username));
        const ucRoleText = computed(() => {
            if (!ucUser.value) return '';
            return ucUser.value.role === 'admin' ? t.value.ucAdmin : t.value.ucUser;
        });
        const ucArticlesCount = computed(() => uc.articles.length.toLocaleString(lang.value === 'zh' ? 'zh-CN' : 'ja-JP'));
        const ucTotalViews = computed(() => {
            const total = uc.articles.reduce((sum, a) => sum + Number(a.view_count || 0), 0);
            return total.toLocaleString(lang.value === 'zh' ? 'zh-CN' : 'ja-JP');
        });
        const ucJoinDate = computed(() => {
            if (!ucUser.value?.created_at) return '-';
            return new Date(ucUser.value.created_at).toLocaleDateString(lang.value === 'zh' ? 'zh-CN' : 'ja-JP');
        });

        const ucFilteredArticles = computed(() => {
            if (!uc.articleQuery) return uc.articles;
            const q = uc.articleQuery.toLowerCase();
            return uc.articles.filter(a => `${a.title || ''} ${a.category || ''}`.toLowerCase().includes(q));
        });

        function ucFormatDate(value) {
            if (!value) return '-';
            return new Date(value).toLocaleDateString(lang.value === 'zh' ? 'zh-CN' : 'ja-JP');
        }

        async function ucLoadProfile() {
            const token = localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
            if (!token) return;
            try {
                const res = await fetch('/api/user/profile', { headers: { Authorization: 'Bearer ' + token } });
                const result = await parseResponse(res);
                if (!result.success) throw new Error(result.message || t.value.ucProfileLoadFailed);
                ucUser.value = result.data;
                localStorage.setItem('tsukuyomi_user', JSON.stringify(result.data));
            } catch (e) {
                ucShowToast(e.message || t.value.ucProfileLoadFailed);
            }
        }

        async function ucLoadArticles() {
            uc.articleLoading = true;
            const token = localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
            if (!token) { uc.articleLoading = false; return; }
            try {
                const res = await fetch('/api/user/articles', { headers: { Authorization: 'Bearer ' + token } });
                const result = await parseResponse(res);
                if (!result.success) throw new Error(result.message || t.value.ucArticleLoadFailed);
                uc.articles = result.data || [];
            } catch (e) {
                uc.articles = [];
                ucShowToast(e.message || t.value.ucArticleLoadFailed);
            } finally {
                uc.articleLoading = false;
            }
        }

        async function ucRefresh() {
            await Promise.all([ucLoadProfile(), ucLoadArticles()]);
        }

        async function ucSaveProfile() {
            const bioEl = document.getElementById('ucBioInput');
            const bio = bioEl?.value?.trim() || '';
            uc.profileSaving = true;
            try {
                const token = localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
                const res = await fetch('/api/user/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ bio })
                });
                const result = await parseResponse(res);
                if (!result.success) throw new Error(result.message || t.value.ucProfileSaveFailed);
                if (ucUser.value) ucUser.value.bio = bio;
                localStorage.setItem('tsukuyomi_user', JSON.stringify(ucUser.value));
                ucShowMessage(uc, 'profile', t.value.ucProfileSaved);
                ucShowToast(t.value.ucProfileSaved);
            } catch (e) {
                ucShowMessage(uc, 'profile', e.message || t.value.ucProfileSaveFailed);
            } finally {
                uc.profileSaving = false;
            }
        }

        async function ucUploadAvatar(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) return ucShowToast(t.value.ucSelectImage);
            if (file.size > 6 * 1024 * 1024) return ucShowToast(t.value.ucAvatarTooBig);
            uc.avatarUploading = true;
            try {
                const avatar = await compressImage(file, 420, 420, 0.82);
                const token = localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
                const res = await fetch('/api/user/avatar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ avatar })
                });
                const result = await parseResponse(res);
                if (!result.success) throw new Error(result.message || t.value.ucAvatarUploadFailed);
                if (ucUser.value) ucUser.value.avatar = avatar;
                localStorage.setItem('tsukuyomi_user', JSON.stringify(ucUser.value));
                ucShowToast(t.value.ucAvatarUpdated);
            } catch (err) {
                ucShowToast(err.message || t.value.ucAvatarUploadFailed);
            } finally {
                uc.avatarUploading = false;
                e.target.value = '';
            }
        }

        async function ucChangePassword() {
            const currentPassword = document.getElementById('ucCurrentPassword')?.value || '';
            const newPassword = document.getElementById('ucNewPassword')?.value || '';
            const confirmPassword = document.getElementById('ucConfirmPassword')?.value || '';
            if (!currentPassword || !newPassword || !confirmPassword) {
                return ucShowMessage(uc, 'password', t.value.ucFillAllPasswordFields);
            }
            if (newPassword !== confirmPassword) {
                return ucShowMessage(uc, 'password', t.value.ucPasswordMismatch);
            }
            if (newPassword.length < 6) {
                return ucShowMessage(uc, 'password', t.value.ucPasswordTooShort);
            }
            uc.passwordChanging = true;
            try {
                const token = localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
                const res = await fetch('/api/user/password', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ currentPassword, newPassword })
                });
                const result = await parseResponse(res);
                if (!result.success) throw new Error(result.message || t.value.ucPasswordChangeFailed);
                document.getElementById('ucCurrentPassword').value = '';
                document.getElementById('ucNewPassword').value = '';
                document.getElementById('ucConfirmPassword').value = '';
                ucShowMessage(uc, 'password', t.value.ucPasswordChanged);
                ucShowToast(t.value.ucPasswordChanged);
            } catch (err) {
                ucShowMessage(uc, 'password', err.message || t.value.ucPasswordChangeFailed);
            } finally {
                uc.passwordChanging = false;
            }
        }

        async function ucDeleteArticle(id) {
            if (!confirm(t.value.ucDeleteConfirm)) return;
            const token = localStorage.getItem('tsukuyomi_token') || localStorage.getItem('admin_token') || '';
            try {
                const res = await fetch(`/api/user/articles/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: 'Bearer ' + token }
                });
                const result = await parseResponse(res);
                if (!result.success) throw new Error(result.message || t.value.ucArticleDeleteFailed);
                ucShowToast(t.value.ucArticleDeleted);
                await ucLoadArticles();
            } catch (err) {
                ucShowToast(err.message || t.value.ucArticleDeleteFailed);
            }
        }

        function ucEditArticle(id) {
            pushRoute('/editor?id=' + id);
        }

        function initUserCenter() {
            if (isAuthed.value) {
                ucRefresh();
            }
        }

        function plazaFormatUptime(seconds) {
            const total = Math.floor(Number(seconds || 0));
            const days = Math.floor(total / 86400);
            const hours = Math.floor((total % 86400) / 3600);
            if (lang.value === 'zh') return days > 0 ? `${days}天${hours}时` : `${hours}时`;
            return days > 0 ? `${days}日${hours}時間` : `${hours}時間`;
        }

        function setLang(nextLang) {
            lang.value = i18n[nextLang] ? nextLang : 'zh';
            localStorage.setItem('lang', lang.value);
            document.documentElement.lang = lang.value === 'zh' ? 'zh-CN' : 'ja';
            login.sending.label = t.value.sendCode;
            register.sending.label = t.value.sendCode;
        }

        function loadUser() {
            const raw = localStorage.getItem('tsukuyomi_user');
            if (!raw) {
                user.value = null;
                return;
            }
            try {
                user.value = JSON.parse(raw);
            } catch (_) {
                user.value = null;
            }
        }

        function logout() {
            localStorage.removeItem('tsukuyomi_token');
            localStorage.removeItem('tsukuyomi_user');
            user.value = null;
            pushRoute('/access');
        }

        function go(nextPath) {
            pushRoute(nextPath);
        }

        function startAccess() {
            accessLoading.active = true;
            accessLoading.progress = 0;
            const labels = [t.value.connecting, t.value.loading, t.value.sync, t.value.welcome];
            let index = 0;
            accessLoading.text = labels[index];
            const tick = () => {
                accessLoading.progress = Math.min(100, accessLoading.progress + 1.35);
                const nextIndex = Math.min(labels.length - 1, Math.floor(accessLoading.progress / 25));
                if (nextIndex !== index) {
                    index = nextIndex;
                    accessLoading.text = labels[index];
                }
                if (accessLoading.progress >= 100) {
                    accessLoading.active = false;
                    pushRoute('/hub');
                    return;
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }

        function showMessage(target, type, message) {
            target.type = type;
            target.message = message;
        }

        async function sendCode(purpose) {
            const target = purpose === 'login' ? login : register;
            const email = purpose === 'login' ? login.username.trim() : register.email.trim();
            target.sending.loading = true;
            try {
                const response = await fetch('/api/auth/email-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, purpose })
                });
                const result = await parseResponse(response);
                if (!result.success) throw new Error(result.message || t.value.unknown);
                showMessage(target, 'success', t.value.codeSent);
                target.sending.label = '60s';
                countdown(target.sending, t.value.sendCode);
            } catch (error) {
                target.sending.loading = false;
                target.sending.label = t.value.sendCode;
                showMessage(target, 'error', t.value.failedPrefix + error.message);
            }
        }

        async function submitLogin() {
            login.message = '';
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: login.username.trim(),
                        password: login.password,
                        emailCode: login.emailCode.trim(),
                        loginMethod: login.method
                    })
                });
                const result = await parseResponse(response);
                if (!result.success) throw new Error(result.message || t.value.unknown);
                localStorage.removeItem('admin_token');
                localStorage.removeItem('admin_user');
                localStorage.setItem('tsukuyomi_token', result.data.token);
                localStorage.setItem('tsukuyomi_user', JSON.stringify(result.data.user));
                loadUser();
                showMessage(login, 'success', t.value.loginSuccess);
                setTimeout(() => pushRoute('/hub'), 700);
            } catch (error) {
                showMessage(login, 'error', t.value.failedPrefix + error.message);
            }
        }

        async function submitRegister() {
            register.message = '';
            if (register.password !== register.confirmPassword) {
                showMessage(register, 'error', t.value.passwordMismatch);
                return;
            }
            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: register.username.trim(),
                        email: register.email.trim(),
                        emailCode: register.emailCode.trim(),
                        password: register.password
                    })
                });
                const result = await parseResponse(response);
                if (!result.success) throw new Error(result.message || t.value.unknown);
                if (result.data?.token) {
                    localStorage.setItem('tsukuyomi_token', result.data.token);
                    localStorage.setItem('tsukuyomi_user', JSON.stringify(result.data.user));
                    loadUser();
                }
                showMessage(register, 'success', t.value.registerSuccess);
                setTimeout(() => pushRoute('/hub'), 800);
            } catch (error) {
                showMessage(register, 'error', t.value.failedPrefix + error.message);
            }
        }

        function getSession() {
            let token = localStorage.getItem('admin_token'), userStr = localStorage.getItem('admin_user'), admin = true;
            if (!token || !userStr) {
                token = localStorage.getItem('tsukuyomi_token');
                userStr = localStorage.getItem('tsukuyomi_user');
                admin = false;
            }
            if (!token || !userStr) return null;
            try { return { token, user: JSON.parse(userStr), admin }; } catch (_) { return null; }
        }

        function syncBodyRouteClass(nextRoute) {
            document.body.classList.toggle('vue-access-route', nextRoute === 'access');
        }

        onMounted(() => {
            setLang(lang.value);
            loadUser();
            syncBodyRouteClass(route.value);
            window.addEventListener('popstate', () => {
                path.value = normalizePath(location.pathname);
            });
            if (route.value === 'stage') loadArticles();
            if (route.value === 'plaza') refreshPlaza();
            if (route.value === 'editor') initEditor();
            if (route.value === 'userCenter') initUserCenter();
        });

        watch(route, (nextRoute) => {
            syncBodyRouteClass(nextRoute);
            if (nextRoute === 'stage') loadArticles();
            if (nextRoute === 'plaza') refreshPlaza();
            if (nextRoute === 'editor') initEditor();
            if (nextRoute === 'userCenter') initUserCenter();
        });

        return {
            accessLoading,
            articles,
            articlesLoading,
            categories,
            checkEditorAuth,
            filteredArticles,
            friends,
            go,
            isAuthed,
            lang,
            loadArticles,
            login,
            loginPlaceholder,
            logout,
            plaza,
            plazaActivity,
            plazaCopyLink,
            plazaFormatDate,
            plazaFormatNumber,
            plazaFormatRelative,
            plazaFormatUptime,
            isPlazaMessageLiked,
            plazaInitial,
            plazaLikeMessage,
            plazaMessages,
            plazaSubmitMessage,
            plazaSubmitReply,
            plazaToggleReply,
            plazaToast,
            refreshPlaza,
            register,
            route,
            sceneLinks,
            setLang,
            showPlazaToast,
            stageCategory,
            stageCategoryLabel,
            stageSearch,
            startAccess,
            submitLogin,
            submitRegister,
            sendCode,
            t,
            user,
            editor,
            handleEditorCoverUpload,
            removeEditorCover,
            handleEditorSubmit,
            uc,
            ucAvatarSrc,
            ucChangePassword,
            ucDeleteArticle,
            ucEditArticle,
            ucFilteredArticles,
            ucFormatDate,
            ucJoinDate,
            ucRoleText,
            ucSaveProfile,
            ucShowMessage,
            ucShowToast,
            ucToast,
            ucTotalViews,
            ucArticlesCount,
            ucUploadAvatar,
            ucUser
        };
    },
    template: `
        <div class="app-shell">
            <div v-if="route !== 'access'" class="moon" aria-hidden="true"></div>
            <header v-if="route !== 'access'" class="topbar">
                <a href="/hub" class="brand" @click.prevent="go('/hub')">{{ t.brand }}</a>
                <div class="nav-actions">
                    <a href="/hub" class="nav-link" :class="{ 'router-link-active': route === 'hub' }" @click.prevent="go('/hub')">{{ t.hub }}</a>
                    <a href="/stage" class="nav-link" :class="{ 'router-link-active': route === 'stage' }" @click.prevent="go('/stage')">{{ t.stage }}</a>
                    <a v-if="!isAuthed" href="/login" class="nav-link" :class="{ 'router-link-active': route === 'login' }" @click.prevent="go('/login')">{{ t.login }}</a>
                    <a v-if="!isAuthed" href="/register" class="nav-link" :class="{ 'router-link-active': route === 'register' }" @click.prevent="go('/register')">{{ t.register }}</a>
                    <span v-if="isAuthed" class="user-chip">{{ user.username || user.email }}</span>
                    <button v-if="isAuthed" class="ghost-btn" type="button" @click="logout">{{ t.logout }}</button>
                    <div class="lang-switcher" aria-label="Language">
                        <button class="lang-btn" :class="{ active: lang === 'zh' }" type="button" @click="setLang('zh')">中文</button>
                        <button class="lang-btn" :class="{ active: lang === 'ja' }" type="button" @click="setLang('ja')">日本語</button>
                    </div>
                </div>
            </header>

            <main v-if="route === 'access'" class="page center-page access-page">
                <video class="access-video" autoplay muted loop playsinline aria-hidden="true">
                    <source src="/assets/video/【4K⧸中日双语】超时空辉夜姬「ray 」官方MV.mp4" type="video/mp4">
                </video>
                <div class="access-overlay"></div>
                <section class="hero">
                    <h1 class="hero-title">{{ t.title }}</h1>
                    <p class="hero-kicker">TSUKUYOMI SPACE</p>
                    <p class="hero-copy">{{ t.heroCopy }}</p>
                    <button class="primary-btn" type="button" @click="startAccess">{{ t.access }}</button>
                </section>
                <div v-if="accessLoading.active" class="loading-layer">
                    <div class="loading-box">
                        <div class="loading-text">{{ accessLoading.text }}</div>
                        <div class="loading-bar"><div class="loading-progress" :style="{ width: accessLoading.progress + '%' }"></div></div>
                    </div>
                </div>
            </main>

            <main v-else-if="route === 'hub'" class="page hub">
                <h1 class="section-title">{{ t.hubTitle }}</h1>
                <p class="section-subtitle">{{ t.hubSubtitle }}</p>
                <div class="scene-grid">
                    <a v-for="scene in sceneLinks" :key="scene.href" class="scene-card" :href="scene.href">
                        <span class="scene-icon">{{ scene.icon }}</span>
                        <span>
                            <span class="scene-name">{{ scene.name }}</span>
                            <span class="scene-desc">{{ scene.desc }}</span>
                        </span>
                        <span class="scene-arrow">→</span>
                    </a>
                </div>
            </main>

            <main v-else-if="route === 'login'" class="page center-page">
                <section class="panel">
                    <h1>{{ t.login }}</h1>
                    <p class="panel-subtitle">{{ t.loginSubtitle }}</p>
                    <div v-if="login.message" class="form-message" :class="login.type">{{ login.message }}</div>
                    <form @submit.prevent="submitLogin">
                        <div class="mode-row">
                            <button class="mode-btn" :class="{ active: login.method === 'password' }" type="button" @click="login.method = 'password'; login.message = ''">{{ t.passwordLogin }}</button>
                            <button class="mode-btn" :class="{ active: login.method === 'code' }" type="button" @click="login.method = 'code'; login.message = ''">{{ t.codeLogin }}</button>
                        </div>
                        <div class="form-group">
                            <label for="loginAccount">{{ t.account }}</label>
                            <input id="loginAccount" v-model="login.username" required :placeholder="loginPlaceholder" autocomplete="username">
                        </div>
                        <div v-if="login.method === 'password'" class="form-group">
                            <label for="loginPassword">{{ t.password }}</label>
                            <input id="loginPassword" v-model="login.password" required type="password" :placeholder="t.passwordPh" autocomplete="current-password">
                        </div>
                        <div v-else class="form-group">
                            <label for="loginCode">{{ t.emailCode }}</label>
                            <div class="code-row">
                                <input id="loginCode" v-model="login.emailCode" required inputmode="numeric" maxlength="6" :placeholder="t.codePh">
                                <button class="code-btn" type="button" :disabled="login.sending.loading" @click="sendCode('login')">{{ login.sending.label || t.sendCode }}</button>
                            </div>
                        </div>
                        <button class="primary-btn" type="submit">{{ t.login }}</button>
                    </form>
                    <div class="panel-links">{{ t.noAccount }} <a href="/register" @click.prevent="go('/register')">{{ t.register }}</a></div>
                </section>
            </main>

            <main v-else-if="route === 'register'" class="page center-page">
                <section class="panel">
                    <h1>{{ t.register }}</h1>
                    <p class="panel-subtitle">{{ t.registerSubtitle }}</p>
                    <div v-if="register.message" class="form-message" :class="register.type">{{ register.message }}</div>
                    <form @submit.prevent="submitRegister">
                        <div class="form-group">
                            <label for="registerUsername">{{ t.username }}</label>
                            <input id="registerUsername" v-model="register.username" required :placeholder="t.usernamePh" autocomplete="username">
                        </div>
                        <div class="form-group">
                            <label for="registerEmail">{{ t.email }}</label>
                            <div class="code-row">
                                <input id="registerEmail" v-model="register.email" required type="email" :placeholder="t.emailInputPh" autocomplete="email">
                                <button class="code-btn" type="button" :disabled="register.sending.loading" @click="sendCode('register')">{{ register.sending.label || t.sendCode }}</button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="registerCode">{{ t.emailCode }}</label>
                            <input id="registerCode" v-model="register.emailCode" required inputmode="numeric" maxlength="6" :placeholder="t.codePh">
                        </div>
                        <div class="form-group">
                            <label for="registerPassword">{{ t.password }}</label>
                            <input id="registerPassword" v-model="register.password" required minlength="6" type="password" :placeholder="t.passwordPh" autocomplete="new-password">
                        </div>
                        <div class="form-group">
                            <label for="registerConfirm">{{ t.confirmPassword }}</label>
                            <input id="registerConfirm" v-model="register.confirmPassword" required minlength="6" type="password" :placeholder="t.confirmPh" autocomplete="new-password">
                        </div>
                        <button class="primary-btn" type="submit">{{ t.register }}</button>
                    </form>
                    <div class="panel-links">{{ t.haveAccount }} <a href="/login" @click.prevent="go('/login')">{{ t.login }}</a></div>
                </section>
            </main>

            <main v-else-if="route === 'stage'" class="page stage-page">
                <div class="stage-header">
                    <h1 class="section-title">{{ t.stageTitle }}</h1>
                    <p class="section-subtitle">{{ t.stageSubtitle }}</p>
                </div>
                <div class="stage-controls">
                    <div class="search-box">
                        <input type="text" v-model="stageSearch" :placeholder="t.searchPlaceholder">
                    </div>
                    <a href="/editor" class="btn stage-new-btn" @click="checkEditorAuth">{{ t.newPost }}</a>
                </div>
                <div class="stage-filters">
                    <button v-for="cat in categories" :key="cat" class="filter-btn" :class="{ active: stageCategory === cat }" @click="stageCategory = cat">{{ stageCategoryLabel(cat) }}</button>
                </div>
                <div v-if="articlesLoading" class="stage-status">{{ t.loading }}</div>
                <div v-else-if="!filteredArticles.length" class="stage-status">{{ t.noArticles }}</div>
                <div v-else class="stage-list">
                    <a v-for="article in filteredArticles" :key="article.id" :href="'/pages/article?id=' + article.id" class="stage-card">
                        <div class="stage-card-body">
                            <div class="stage-card-meta">
                                <span class="tag">{{ article.category }}</span>
                                <span class="tag tag-author">{{ article.author_username || 'admin' }}</span>
                            </div>
                            <h3 class="stage-card-title">{{ article.title }}</h3>
                            <p class="stage-card-excerpt">{{ article.excerpt }}</p>
                            <div class="stage-card-footer">
                                <span class="read-time">⏱️ {{ article.read_time }}</span>
                            </div>
                        </div>
                        <div v-if="article.cover_image" class="stage-card-cover">
                            <img :src="article.cover_image" alt="封面" class="stage-cover-img">
                        </div>
                    </a>
                </div>
            </main>

            <main v-else-if="route === 'plaza'" class="page plaza-page">
                <section class="plaza-hero">
                    <div class="plaza-hero-main">
                        <div class="plaza-eyebrow">{{ t.plazaEyebrow }}</div>
                        <h1 class="plaza-title">{{ t.plazaTitle }}</h1>
                        <p class="plaza-sub">{{ t.plazaSubtitle }}</p>
                    </div>
                    <aside class="plaza-status panel">
                        <div class="plaza-status-line"><span>{{ t.channelStatus }}</span><span class="plaza-status-value">{{ t.channelValue }}</span></div>
                        <div class="plaza-status-line"><span>{{ t.plazaStatusLabel }}</span><span class="plaza-status-value">{{ plaza.loading ? t.syncing : t.online }}</span></div>
                        <div v-if="isAuthed" class="plaza-login-card">
                            <strong>{{ user.username }}</strong>
                            <p>{{ t.loggedInDesc }}</p>
                        </div>
                        <div v-else class="plaza-login-card">
                            <strong>{{ t.guestMode }}</strong>
                            <p>{{ t.guestDesc }}</p>
                            <div style="margin-top:0.8rem;"><a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.goLogin }}</a></div>
                        </div>
                    </aside>
                </section>

                <section class="plaza-stats">
                    <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsArticles }}</div><div class="plaza-stat-value">{{ plazaFormatNumber(plaza.stats?.articles || 0) }}</div><div class="plaza-stat-note">{{ t.statsArticlesNote }}</div></div>
                    <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsUsers }}</div><div class="plaza-stat-value">{{ plazaFormatNumber(plaza.stats?.users || 0) }}</div><div class="plaza-stat-note">{{ t.statsUsersNote }}</div></div>
                    <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsMessages }}</div><div class="plaza-stat-value">{{ plazaFormatNumber(plaza.stats?.messages || 0) }}</div><div class="plaza-stat-note">{{ t.statsMessagesNote }}</div></div>
                    <div class="plaza-stat-card"><div class="plaza-stat-label">{{ t.statsUptime }}</div><div class="plaza-stat-value">{{ plazaFormatUptime(plaza.stats?.uptime || 0) }}</div><div class="plaza-stat-note">{{ t.statsUptimeNote }}</div></div>
                </section>

                <section class="plaza-layout">
                    <div class="panel plaza-wall">
                        <div class="plaza-section-head">
                            <h2 class="plaza-section-title"><span>01</span> {{ t.wallTitle }}</h2>
                            <div class="plaza-toolbar">
                                <input class="plaza-search" v-model="plaza.query" type="search" :placeholder="t.searchPlaceholder || '搜索...'">
                                <button class="ghost-btn" @click="refreshPlaza">{{ t.refresh }}</button>
                            </div>
                        </div>
                        <div class="plaza-filters">
                            <button class="chip" :class="{ active: plaza.filter === 'latest' }" @click="plaza.filter = 'latest'">{{ t.filterLatest }}</button>
                            <button class="chip" :class="{ active: plaza.filter === 'hot' }" @click="plaza.filter = 'hot'">{{ t.filterHot }}</button>
                            <button class="chip" :class="{ active: plaza.filter === 'replied' }" @click="plaza.filter = 'replied'">{{ t.filterReplied }}</button>
                            <button class="chip" :class="{ active: plaza.filter === 'mine' }" @click="plaza.filter = 'mine'">{{ t.filterMine }}</button>
                        </div>

                        <div v-if="!isAuthed" class="plaza-composer plaza-composer-locked">
                            <div class="plaza-empty">
                                <div style="font-weight:700;color:#fff;margin-bottom:0.45rem;">{{ t.loginToPost }}</div>
                                <div style="margin-bottom:1rem;">{{ t.loginToPostDesc }}</div>
                                <a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.goLogin }}</a>
                            </div>
                        </div>
                        <div v-else class="plaza-composer">
                            <PlazaComposer :t="t" :on-submit="plazaSubmitMessage" />
                        </div>

                        <div v-if="plaza.loading" class="plaza-empty">{{ t.plazaConnecting }}</div>
                        <div v-else-if="!plazaMessages.length" class="plaza-empty">
                            <div style="font-weight:700;color:#fff;margin-bottom:0.45rem;">{{ t.noMessages }}</div>
                            <div>{{ t.noMessagesHint }}</div>
                        </div>
                        <div v-else class="plaza-messages">
                            <article v-for="msg in plazaMessages" :key="msg.id" :id="'msg-' + msg.id" class="plaza-msg-card">
                                <div class="plaza-msg-meta">
                                    <div class="plaza-msg-author">
                                        <div class="plaza-avatar">{{ plazaInitial(msg.author) }}</div>
                                        <div>
                                            <div class="plaza-author-name">{{ msg.author || '匿名访客' }}</div>
                                            <div class="plaza-msg-date">{{ plazaFormatDate(msg.created_at) }}</div>
                                        </div>
                                    </div>
                                    <div class="plaza-msg-date">#{{ msg.id }}</div>
                                </div>
                                <div class="plaza-msg-content">{{ msg.content }}</div>
                                <div class="plaza-msg-footer">
                                    <button class="icon-btn" :class="{ liked: isPlazaMessageLiked(msg.id) }" @click="plazaLikeMessage(msg.id)">{{ t.like }} {{ msg.like_count || 0 }}</button>
                                    <button class="icon-btn" @click="plazaToggleReply(msg.id)">{{ t.reply }} {{ (msg.replies || []).length }}</button>
                                    <button class="icon-btn" @click="plazaCopyLink(msg.id)">{{ t.copyLink }}</button>
                                </div>
                                <div v-if="plaza.replyOpen[msg.id]" class="plaza-reply-form">
                                    <PlazaReplyForm :t="t" :msg-id="msg.id" :on-submit="plazaSubmitReply" @cancel="plazaToggleReply(msg.id)" />
                                </div>
                                <div v-if="(msg.replies || []).length" class="plaza-replies">
                                    <div v-for="reply in msg.replies" :key="reply.id" class="plaza-reply-card">
                                        <div class="plaza-msg-meta" style="margin-bottom:0.45rem;">
                                            <div class="plaza-msg-author">
                                                <div class="plaza-avatar" style="width:30px;height:30px;font-size:0.78rem;">{{ plazaInitial(reply.author) }}</div>
                                                <div>
                                                    <div class="plaza-author-name" style="font-size:0.82rem;">{{ reply.author || '匿名访客' }}</div>
                                                    <div class="plaza-msg-date">{{ plazaFormatDate(reply.created_at) }}</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="plaza-msg-content" style="margin-bottom:0;">{{ reply.content }}</div>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>

                    <aside class="plaza-side">
                        <div class="panel">
                            <div class="panel-title">{{ t.residents }} <span>{{ friends.length }}</span></div>
                            <div class="plaza-friends">
                                <a v-for="f in friends" :key="f.name" class="plaza-friend-card" :href="f.url">
                                    <div class="plaza-friend-avatar">{{ f.avatar }}</div>
                                    <div>
                                        <div class="plaza-friend-name">{{ f.name }}</div>
                                        <div class="plaza-friend-desc">{{ f.desc }}</div>
                                    </div>
                                    <div style="color:rgba(255,225,235,0.42);">↗</div>
                                </a>
                            </div>
                        </div>
                        <div class="panel">
                            <div class="panel-title">{{ t.activity }}</div>
                            <div class="plaza-activities">
                                <div v-if="!plazaActivity.length" class="plaza-activity-item"><span class="plaza-dot"></span><span>{{ t.plazaJustOpened }}</span></div>
                                <div v-for="item in plazaActivity" :key="item.id" class="plaza-activity-item">
                                    <span class="plaza-dot"></span>
                                    <span>{{ item.author || '访客' }} {{ item.parent_id ? '回复了留言' : '发布了留言' }} · {{ plazaFormatRelative(item.created_at) }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="panel">
                            <div class="panel-title">{{ t.rulesTitle }}</div>
                            <div class="plaza-rules">
                                <p>{{ t.rule1 }}</p>
                                <p>{{ t.rule2 }}</p>
                                <p>{{ t.rule3 }}</p>
                            </div>
                        </div>
                    </aside>
                </section>

                <div v-if="plazaToast.visible" class="plaza-toast show">{{ plazaToast.text }}</div>
            </main>

            <main v-else-if="route === 'reality'" class="page reality-page">
                <div class="reality-container">
                    <section class="reality-hero">
                        <div class="reality-hero-kicker">{{ t.realityEyebrow }}</div>
                        <h1>{{ t.realityTitle }}</h1>
                        <p class="reality-hero-copy">{{ t.realitySubtitle }}</p>
                        <div class="reality-hero-actions">
                            <a class="reality-btn" href="#contact">{{ t.realityContactTitle }}</a>
                            <a class="reality-btn secondary" href="#privacy">{{ t.realityPrivacyTitle }}</a>
                        </div>
                    </section>

                    <section class="reality-section" id="contact">
                        <div class="reality-section-head">
                            <div class="reality-eyebrow">Contact</div>
                            <div>
                                <h2>{{ t.realityContactTitle }}</h2>
                                <p class="reality-section-lead">{{ t.realityContactLead }}</p>
                            </div>
                        </div>
                        <div class="reality-card-grid reality-3col">
                            <article class="reality-card">
                                <h3>{{ t.realityContactRepo }}</h3>
                                <p>{{ t.realityContactRepoDesc }}</p>
                            </article>
                            <article class="reality-card">
                                <h3>{{ t.realityContactIssues }}</h3>
                                <p>{{ t.realityContactIssuesDesc }}</p>
                            </article>
                            <article class="reality-card">
                                <h3>{{ t.realityContactPlaza }}</h3>
                                <p>{{ t.realityContactPlazaDesc }}</p>
                            </article>
                        </div>
                    </section>

                    <section class="reality-section" id="privacy">
                        <div class="reality-section-head">
                            <div class="reality-eyebrow">Privacy</div>
                            <div>
                                <h2>{{ t.realityPrivacyTitle }}</h2>
                                <p class="reality-section-lead">{{ t.realityPrivacyLead }}</p>
                            </div>
                        </div>
                        <table class="reality-data-table">
                            <thead>
                                <tr>
                                    <th>{{ lang === 'ja' ? 'データ種類' : '数据类型' }}</th>
                                    <th>{{ lang === 'ja' ? '利用目的' : '使用目的' }}</th>
                                    <th>{{ lang === 'ja' ? '保存場所と説明' : '保存位置与说明' }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>{{ lang === 'ja' ? 'アカウント情報' : '账号信息' }}</td>
                                    <td>{{ lang === 'ja' ? '登録、ログイン、ユーザーセンター表示、権限制御に使用。' : '用于注册、登录、用户中心展示与权限判断。' }}</td>
                                    <td>{{ lang === 'ja' ? 'ユーザー名、メール、暗号化パスワード、ロール、作成日時を含みます。パスワードは平文で保存されません。' : '包括用户名、邮箱、加密后的密码、角色与创建时间。密码不会以明文保存。' }}</td>
                                </tr>
                                <tr>
                                    <td>{{ lang === 'ja' ? '記事とメッセージ' : '文章与留言' }}</td>
                                    <td>{{ lang === 'ja' ? '投稿、コメント、メッセージ審査、サイト内交流の表示に使用。' : '用于展示投稿、评论、留言审核和站内互动。' }}</td>
                                    <td>{{ lang === 'ja' ? '公開コンテンツは他の訪問者に見られる可能性があります。管理者は審査、管理、削除権限を保持します。' : '公开发布的内容可能被其他访客看到；后台保留审核、管理和删除能力。' }}</td>
                                </tr>
                                <tr>
                                    <td>{{ lang === 'ja' ? 'アクセス統計' : '访问统计' }}</td>
                                    <td>{{ lang === 'ja' ? 'ページのアクセス傾向を把握し、サイトの安定性を維持するために使用。' : '用于了解页面访问趋势、维护站点稳定性。' }}</td>
                                    <td>{{ lang === 'ja' ? 'サイト統計データが中心で、広告プロファイリングやクロスサイトトラッキングには使用しません。' : '以站点统计数据为主，不用于广告画像或跨站追踪。' }}</td>
                                </tr>
                                <tr>
                                    <td>{{ lang === 'ja' ? 'ルームローカル設定' : '房间本地设置' }}</td>
                                    <td>{{ lang === 'ja' ? 'Live2D ルームのモデル位置、チャット履歴、LLM/TTS 設定などの個人体験設定の保存に使用。' : '用于保存 Live2D 房间的模型位置、聊天历史、LLM/TTS 配置等个人体验设置。' }}</td>
                                    <td>{{ lang === 'ja' ? 'これらのデータは主にブラウザの localStorage に保存されます。ブラウザのサイトデータを消去すると削除されます。' : '这类数据主要保存在你的浏览器 localStorage 中。清理浏览器站点数据会删除它们。' }}</td>
                                </tr>
                                <tr>
                                    <td>{{ lang === 'ja' ? 'サードパーティAPI設定' : '第三方接口配置' }}</td>
                                    <td>{{ lang === 'ja' ? 'ユーザーがルームのチャットや音声サービスを自分で設定するために使用。' : '用于用户自行配置房间聊天或语音服务。' }}</td>
                                    <td>{{ lang === 'ja' ? '公共端末でAPIキーを保存しないでください。サイトがあなたのキーを公開ページに書き込むことはありません。' : '请不要在公共设备保存 API Key。站点不会主动将你的密钥写入公开页面。' }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </section>

                    <section class="reality-section">
                        <div class="reality-section-head">
                            <div class="reality-eyebrow">Rights</div>
                            <div>
                                <h2>{{ t.realityRightsTitle }}</h2>
                                <p class="reality-section-lead">{{ t.realityRightsLead }}</p>
                            </div>
                        </div>
                        <div class="reality-card-grid reality-3col">
                            <article class="reality-card">
                                <h3>{{ t.realityRightsAccess }}</h3>
                                <ul class="reality-policy-list">
                                    <li>{{ lang === 'ja' ? 'ログイン後、ユーザーセンターで基本アカウント情報を確認できます。' : '登录后可在用户中心查看基础账号信息。' }}</li>
                                    <li>{{ lang === 'ja' ? '公開コンテンツに誤りを見つけた場合、リンクを提供して修正を申請できます。' : '发现公开内容有误时，可以提供链接申请更正。' }}</li>
                                </ul>
                            </article>
                            <article class="reality-card">
                                <h3>{{ t.realityRightsDelete }}</h3>
                                <ul class="reality-policy-list">
                                    <li>{{ lang === 'ja' ? '自分が投稿したメッセージ、記事、アカウント関連データの削除を申請できます。' : '你可以申请删除自己发布的留言、投稿或账号相关数据。' }}</li>
                                    <li>{{ lang === 'ja' ? 'ブラウザのローカルルーム設定は、サイトデータを消去することで自分で削除できます。' : '浏览器本地房间设置可通过清理站点数据自行删除。' }}</li>
                                </ul>
                            </article>
                            <article class="reality-card">
                                <h3>{{ t.realityRightsSecurity }}</h3>
                                <ul class="reality-policy-list">
                                    <li>{{ lang === 'ja' ? 'XSS、権限バイパス、機密情報漏洩などのリスクを発見した場合は、GitHub Issues またはリポジトリの連絡先から報告してください。' : '如发现 XSS、越权、敏感信息泄露等风险，请通过 GitHub Issues 或仓库联系方式报告。' }}</li>
                                    <li>{{ lang === 'ja' ? '報告時に実際のキー、パスワード、トークン、他人のプライバシーを公開しないでください。' : '报告时请避免公开真实密钥、密码、令牌和他人隐私。' }}</li>
                                </ul>
                            </article>
                        </div>
                    </section>

                    <section class="reality-section">
                        <div class="reality-section-head">
                            <div class="reality-eyebrow">Notice</div>
                            <div>
                                <h2>{{ t.realityNoticeTitle }}</h2>
                                <p class="reality-section-lead">{{ t.realityNoticeLead }}</p>
                            </div>
                        </div>
                        <div class="reality-statement">
                            <p><strong>{{ lang === 'ja' ? 'バーチャルキャラクターコンテンツ：' : '虚拟角色内容：' }}</strong>{{ t.realityNoticeVirtual }}</p>
                            <p><strong>{{ lang === 'ja' ? '外部リンク：' : '外部链接：' }}</strong>{{ t.realityNoticeLinks }}</p>
                            <p><strong>{{ lang === 'ja' ? '声明の更新：' : '声明更新：' }}</strong>{{ t.realityNoticeUpdate }}</p>
                        </div>
                    </section>

                    <div class="reality-footer">
                        <span>{{ t.realityFooterBrand }}</span>
                        <span><a class="reality-btn secondary" href="/hub" @click.prevent="go('/hub')">{{ t.realityFooterBack }}</a></span>
                    </div>
                </div>
            </main>

            <main v-else-if="route === 'editor'" class="page editor-page">
                <div class="editor-container">
                    <div class="editor-header">
                        <h1 class="section-title">{{ t.editorTitle }}</h1>
                        <p class="section-subtitle">{{ t.editorSubtitle }}</p>
                    </div>

                    <div v-if="!isAuthed" class="panel editor-login-notice">
                        <p>{{ t.editorNeedLogin }}</p>
                        <a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.editorLogin }}</a>
                    </div>

                    <div v-else-if="editor.loading" class="editor-status">{{ t.loading }}</div>

                    <form v-else class="editor-form" @submit="handleEditorSubmit">
                        <div v-if="editor.message" class="form-message" :class="editor.messageType">{{ editor.message }}</div>

                        <div class="form-group">
                            <label>{{ t.editorFieldCover }}</label>
                            <div class="editor-cover-upload" id="editorCoverUpload" :class="{ 'has-image': editor.coverImageBase64 }">
                                <input type="file" id="editorCoverInput" accept="image/*" @change="handleEditorCoverUpload">
                                <div id="editorCoverPlaceholder">
                                    <strong>{{ t.editorCoverPick }}</strong>
                                    <div class="help-text">{{ t.editorCoverHint }}</div>
                                </div>
                                <img v-if="editor.coverImageBase64" class="editor-cover-preview show" id="editorCoverPreview" :src="editor.coverImageBase64" alt="">
                                <button v-if="editor.coverImageBase64" type="button" class="editor-cover-remove" id="editorCoverRemove" @click="removeEditorCover">{{ t.editorRemove }}</button>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="editorTitle">{{ t.editorFieldTitle }}</label>
                            <input type="text" id="editorTitle" required :placeholder="t.editorTitlePh" :value="editor.currentArticle?.title || ''">
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="editorCategory">{{ t.editorFieldCategory }}</label>
                                <select id="editorCategory" required>
                                    <option value="">{{ t.editorCategorySelect }}</option>
                                    <option value="公告">{{ t.editorCatAnnouncement }}</option>
                                    <option value="传说">{{ t.editorCatLegend }}</option>
                                    <option value="技术">{{ t.editorCatTechnology }}</option>
                                    <option value="其他">{{ t.editorCatOther }}</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="editorReadTime">{{ t.editorFieldReadTime }}</label>
                                <input type="text" id="editorReadTime" required :placeholder="t.editorReadTimePh" :value="editor.currentArticle?.read_time || '5 min'">
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="editorExcerpt">{{ t.editorFieldExcerpt }}</label>
                            <textarea id="editorExcerpt" maxlength="200" required :placeholder="t.editorExcerptPh">{{ editor.currentArticle?.excerpt || '' }}</textarea>
                            <div class="help-text">{{ t.editorExcerptHint }}</div>
                        </div>

                        <div class="form-group">
                            <label for="editorContent">{{ t.editorFieldContent }}</label>
                            <textarea id="editorContent" required style="min-height:400px" :placeholder="t.editorContentPh">{{ editor.currentArticle?.content || '' }}</textarea>
                            <div class="help-text">{{ t.editorContentHint }}</div>
                        </div>

                        <div class="btn-group">
                            <button type="submit" class="primary-btn" :disabled="editor.submitting">{{ editor.submitting ? (editor.currentArticle ? t.editorSaving : t.editorPublishing) : (editor.currentArticle ? t.editorUpdate : t.editorSubmit) }}</button>
                            <button type="button" class="ghost-btn" @click="history.back()">{{ t.cancel }}</button>
                        </div>
                    </form>
                </div>
            </main>

            <main v-else-if="route === 'userCenter'" class="page uc-page">
                <div v-if="!isAuthed" class="panel uc-login-notice">
                    <div style="text-align:center;">
                        <div class="uc-eyebrow">User Center</div>
                        <h1>{{ t.ucNeedLogin }}</h1>
                        <p>{{ t.ucLoginPrompt }}</p>
                        <a class="primary-btn" href="/login" @click.prevent="go('/login')">{{ t.ucGoLogin }}</a>
                    </div>
                </div>

                <template v-else>
                    <section class="uc-hero">
                        <div class="uc-avatar-block">
                            <div class="uc-avatar-upload" @click="document.getElementById('ucAvatarInput').click()" :title="t.ucChangeAvatar">
                                <img :src="ucAvatarSrc" alt="">
                            </div>
                            <input type="file" id="ucAvatarInput" accept="image/*" style="display:none;" @change="ucUploadAvatar">
                            <button class="ghost-btn" @click="document.getElementById('ucAvatarInput').click()">{{ t.ucUploadAvatar }}</button>
                        </div>
                        <div class="uc-hero-info">
                            <div class="uc-role-badge">{{ ucRoleText }}</div>
                            <h1 class="uc-username">{{ ucUser?.username || '-' }}</h1>
                            <div class="uc-email">{{ ucUser?.email || '-' }}</div>
                            <p class="uc-bio-preview">{{ ucUser?.bio || t.ucNoBio }}</p>
                        </div>
                        <div class="uc-hero-actions">
                            <a class="primary-btn" href="/editor" @click.prevent="go('/editor')">{{ t.ucNewPost }}</a>
                            <a class="ghost-btn" href="/stage" @click.prevent="go('/stage')">{{ t.ucViewStage }}</a>
                            <button class="ghost-btn" @click="ucRefresh">{{ t.ucRefresh }}</button>
                            <button class="danger-btn" @click="logout">{{ t.ucLogout }}</button>
                        </div>
                    </section>

                    <section class="uc-stats">
                        <div class="uc-stat-card"><div class="uc-stat-label">{{ t.ucMyArticles }}</div><div class="uc-stat-value">{{ ucArticlesCount }}</div><div class="uc-stat-note">{{ t.ucPostsTotal }}</div></div>
                        <div class="uc-stat-card"><div class="uc-stat-label">{{ t.ucTotalViews }}</div><div class="uc-stat-value">{{ ucTotalViews }}</div><div class="uc-stat-note">{{ t.ucArticleViews }}</div></div>
                        <div class="uc-stat-card"><div class="uc-stat-label">{{ t.ucAccountRole }}</div><div class="uc-stat-value">{{ ucRoleText }}</div><div class="uc-stat-note">{{ t.ucPermLevel }}</div></div>
                        <div class="uc-stat-card"><div class="uc-stat-label">{{ t.ucJoinDate }}</div><div class="uc-stat-value">{{ ucJoinDate }}</div><div class="uc-stat-note">{{ t.ucTsukuyomiJoin }}</div></div>
                    </section>

                    <section class="uc-layout">
                        <aside class="panel uc-tabs-panel">
                            <div class="uc-tabs">
                                <button class="tab-btn" :class="{ active: uc.tab === 'profile' }" @click="uc.tab = 'profile'">{{ t.ucProfile }} <small>Profile</small></button>
                                <button class="tab-btn" :class="{ active: uc.tab === 'articles' }" @click="uc.tab = 'articles'">{{ t.ucArticlesTab }} <small>Posts</small></button>
                                <button class="tab-btn" :class="{ active: uc.tab === 'security' }" @click="uc.tab = 'security'">{{ t.ucSecurity }} <small>Security</small></button>
                            </div>
                        </aside>

                        <section class="panel uc-content-panel">
                            <div v-if="uc.tab === 'profile'">
                                <div class="uc-section-head">
                                    <h2 class="uc-section-title"><span>01</span> {{ t.ucProfile }}</h2>
                                </div>
                                <div v-if="uc.profileMsg" class="form-message" :class="uc.profileMsgType">{{ uc.profileMsg }}</div>
                                <div class="form-grid">
                                    <div class="form-group">
                                        <label>{{ t.ucUsername }}</label>
                                        <input type="text" disabled :value="ucUser?.username || ''">
                                        <div class="help-text">{{ t.ucUsernameHint }}</div>
                                    </div>
                                    <div class="form-group">
                                        <label>{{ t.ucEmail }}</label>
                                        <input type="email" disabled :value="ucUser?.email || ''">
                                    </div>
                                    <div class="form-group">
                                        <label>{{ t.ucBio }}</label>
                                        <textarea id="ucBioInput" maxlength="300" :placeholder="t.ucBioPlaceholder">{{ ucUser?.bio || '' }}</textarea>
                                        <div class="help-text">{{ ucUser?.bio?.length || 0 }} / 300</div>
                                    </div>
                                    <div>
                                        <button class="primary-btn" :disabled="uc.profileSaving" @click="ucSaveProfile">{{ t.ucSaveProfile }}</button>
                                    </div>
                                </div>
                            </div>

                            <div v-if="uc.tab === 'articles'">
                                <div class="uc-section-head">
                                    <h2 class="uc-section-title"><span>02</span> {{ t.ucArticlesTab }}</h2>
                                    <div class="uc-article-tools">
                                        <input class="uc-search" v-model="uc.articleQuery" type="search" :placeholder="t.ucSearchArticles">
                                        <a class="primary-btn" href="/editor" @click.prevent="go('/editor')">{{ t.ucWriteNew }}</a>
                                    </div>
                                </div>
                                <div v-if="uc.articleLoading" class="uc-empty">{{ t.ucLoadingArticles }}</div>
                                <div v-else-if="!ucFilteredArticles.length" class="uc-empty">
                                    <div style="font-weight:700;color:#fff;margin-bottom:0.45rem;">{{ t.ucNoArticles }}</div>
                                    <div style="margin-bottom:1rem;">{{ t.ucNoArticlesHint }}</div>
                                    <a class="primary-btn" href="/editor" @click.prevent="go('/editor')">{{ t.ucNewPost }}</a>
                                </div>
                                <div v-else class="uc-article-list">
                                    <article v-for="a in ucFilteredArticles" :key="a.id" class="uc-article-item">
                                        <div>
                                            <div class="uc-article-title">{{ a.title || t.ucUntitled }}</div>
                                            <div class="uc-article-meta">
                                                <span class="uc-status-pill">{{ a.status || 'published' }}</span>
                                                <span>{{ a.category || '' }}</span>
                                                <span>{{ t.ucReading }} {{ (a.view_count || 0).toLocaleString() }}</span>
                                                <span>{{ ucFormatDate(a.created_at) }}</span>
                                            </div>
                                        </div>
                                        <div class="uc-article-actions">
                                            <a class="icon-btn" :href="'/pages/article?id=' + a.id" target="_blank">{{ t.ucView }}</a>
                                            <button class="icon-btn" @click="ucEditArticle(a.id)">{{ t.ucEdit }}</button>
                                            <button class="danger-btn" @click="ucDeleteArticle(a.id)">{{ t.ucDelete }}</button>
                                        </div>
                                    </article>
                                </div>
                            </div>

                            <div v-if="uc.tab === 'security'">
                                <div class="uc-section-head">
                                    <h2 class="uc-section-title"><span>03</span> {{ t.ucSecurity }}</h2>
                                </div>
                                <div v-if="uc.passwordMsg" class="form-message" :class="uc.passwordMsgType">{{ uc.passwordMsg }}</div>
                                <div class="uc-security-grid">
                                    <div>
                                        <div class="form-grid">
                                            <div class="form-group">
                                                <label>{{ t.ucCurrentPassword }}</label>
                                                <input type="password" id="ucCurrentPassword" autocomplete="current-password" :placeholder="t.ucCurrentPasswordPh">
                                            </div>
                                            <div class="form-group">
                                                <label>{{ t.ucNewPassword }}</label>
                                                <input type="password" id="ucNewPassword" autocomplete="new-password" :placeholder="t.ucNewPasswordPh">
                                            </div>
                                            <div class="form-group">
                                                <label>{{ t.ucConfirmNewPassword }}</label>
                                                <input type="password" id="ucConfirmPassword" autocomplete="new-password" :placeholder="t.ucConfirmNewPasswordPh">
                                            </div>
                                            <div>
                                                <button class="primary-btn" :disabled="uc.passwordChanging" @click="ucChangePassword">{{ t.ucChangePassword }}</button>
                                            </div>
                                        </div>
                                    </div>
                                    <aside class="uc-security-card">
                                        <h3>{{ t.ucSecurityTip }}</h3>
                                        <p>{{ t.ucSecurityTipText }}</p>
                                        <div style="margin-top:1rem;">
                                            <button class="danger-btn" @click="logout">{{ t.ucExitLogin }}</button>
                                        </div>
                                    </aside>
                                </div>
                            </div>
                        </section>
                    </section>
                </template>

                <div v-if="ucToast.visible" class="plaza-toast show">{{ ucToast.text }}</div>
            </main>
        </div>
    `
};

const app = createApp(App);
app.config.errorHandler = (err, vm, info) => {
    console.error('Vue error:', err, info);
};
app.config.warnHandler = (msg, vm, info) => {
    console.warn('Vue warn:', msg, info);
};
app.mount('#app');
