// 月読空間 - 国际化和语言配置（最终版本）
const i18n = {
    zh: {
        'space_name': '月读空间',
        'nav_hub': '中枢大厅',
        'nav_stage': '主舞台',
        'nav_arena': '竞技场',
        'stage_title': '主舞台',
        'stage_subtitle': '演唱会场馆 | 博客文章',
        'search_placeholder': '搜索文章...',
        'new_post': '✏️ 新建投稿',
        'filter_all': '全部',
        'filter_announcement': '公告',
        'filter_legend': '传说',
        'filter_technology': '技术',
        'filter_other': '其他',
        'loading': '加载中...',
        'load_failed': '加载失败',
        'no_articles': '暂无文章',
        'footer': '© 超かぐや姫！風',
        'login': '登录',
        'logout': '退出',
        'return': '返回',
        'access_btn': 'アクセス 接入',
        'hub_title': '中枢大厅',
        'hub_subtitle': '梦想与希望交汇之地',
        'scene_main_stage': '主舞台',
        'scene_main_stage_desc': '演唱会场馆\n博客文章',
        'scene_arena': '竞技场',
        'scene_arena_desc': '格斗游戏区\n项目展示',
        'scene_room': '私人居所',
        'scene_room_desc': '个人虚拟房间\n关于我/技能树',
        'scene_plaza': '月读广场',
        'scene_plaza_desc': '公共社交区\n留言板/访客互动',
        'scene_terminal': '数据终端',
        'scene_terminal_desc': '后台管理系统\n仅管理员可见',
        'scene_reality': '现实锚点',
        'scene_reality_desc': '返回现实世界\n联系方式',
        'editor_title': '新建投稿',
        'editor_subtitle': '创建新文章',
        'field_title': '标题',
        'field_title_placeholder': '输入文章标题',
        'field_cover': '文章封面图片',
        'field_cover_select': '选择文件',
        'field_cover_remove': '删除',
        'field_cover_hint': '推荐：1200x630px，JPG 或 PNG 格式',
        'field_category': '分类',
        'field_category_select': '请选择分类',
        'field_category_announcement': '公告（仅管理员）',
        'field_category_legend': '传说',
        'field_category_technology': '技术',
        'field_category_other': '其他',
        'field_category_hint': '※ 公告仅管理员可发布',
        'field_read_time': '阅读时间',
        'field_read_time_placeholder': '例：5 min',
        'field_excerpt': '摘要',
        'field_excerpt_placeholder': '文章摘要（200 字以内）',
        'field_excerpt_hint': '请输入文章摘要',
        'field_content': '正文',
        'field_content_placeholder': '输入文章内容...',
        'field_content_hint': '格式支持：## 标题 1 / ### 标题 2 / - 列表项 / > 引用 / `代码`',
        'btn_submit': '投稿',
        'cancel': '取消',
        'login_title': '登录',
        'login_subtitle': '月读空间欢迎您',
        'register_title': '注册',
        'register_subtitle': '创建新账号',
        'field_username': '用户名',
        'field_username_placeholder': '请输入用户名',
        'field_email': '邮箱',
        'field_email_placeholder': 'your@email.com',
        'field_password': '密码',
        'field_password_placeholder': '请输入密码',
        'field_password_confirm': '确认密码',
        'field_password_confirm_placeholder': '再次输入密码',
        'btn_login': '登录',
        'btn_register': '注册',
        'back_to_hub': '跳过',
        'back_to_login': '已有账号？登录',
        'login_success': '登录成功！正在跳转...',
        'register_success': '注册成功！正在跳转...',
        'password_mismatch': '两次输入的密码不一致',
        'error_network': '网络错误，请检查连接',
        'error_server': '服务器错误',
        'error_unauthorized': '未授权，请先登录',
        'error_forbidden': '权限不足',
        'error_not_found': '资源不存在',
        'submit_success': '投稿成功！正在跳转...',
        'submit_error': '投稿失败',
        'required_fields': '请填写所有必填项',
        'image_error_type': '请选择图片文件',
        'image_error_size': '图片大小请不超过 5MB'
    },
    ja: {
        'space_name': '月読空間',
        'nav_hub': '中枢大厅',
        'nav_stage': 'メインステージ',
        'nav_arena': 'アリーナ',
        'stage_title': 'メインステージ',
        'stage_subtitle': 'ライブ・ブログ',
        'search_placeholder': '記事を検索...',
        'new_post': '✏️ 新規投稿',
        'filter_all': 'すべて',
        'filter_announcement': '公告',
        'filter_legend': '伝説',
        'filter_technology': '技術',
        'filter_other': 'その他',
        'loading': '読み込み中...',
        'load_failed': '読み込み失敗',
        'no_articles': '記事がありません',
        'footer': '© 超かぐや姫！風',
        'login': 'ログイン',
        'logout': '終了',
        'return': '戻る',
        'access_btn': 'アクセス',
        'hub_title': '中枢大厅',
        'hub_subtitle': '夢と希望が交わる場所',
        'scene_main_stage': 'メインステージ',
        'scene_main_stage_desc': 'ライブ会場\nブログ記事',
        'scene_arena': 'アリーナ',
        'scene_arena_desc': 'バトルアリーナ\nプロジェクト',
        'scene_room': 'プライベートルーム',
        'scene_room_desc': 'パーソナルルーム\nプロフィール',
        'scene_plaza': '月読プラザ',
        'scene_plaza_desc': 'コミュニティ\nメッセージ',
        'scene_terminal': 'ターミナル',
        'scene_terminal_desc': '管理システム\n管理者限定',
        'scene_reality': 'リアルワールド',
        'scene_reality_desc': 'リアルワールド\n連絡先',
        'editor_title': '新規投稿',
        'editor_subtitle': '新しい記事を作成',
        'field_title': 'タイトル',
        'field_title_placeholder': '記事のタイトルを入力',
        'field_cover': '記事カバー画像',
        'field_cover_select': '選択',
        'field_cover_remove': '削除',
        'field_cover_hint': '推奨：1200x630px、JPG または PNG 形式',
        'field_category': 'カテゴリー',
        'field_category_select': '選択してください',
        'field_category_announcement': '公告（管理者限定）',
        'field_category_legend': '伝説',
        'field_category_technology': '技術',
        'field_category_other': 'その他',
        'field_category_hint': '※ 公告は管理者のみ投稿できます',
        'field_read_time': '閱讀時間',
        'field_read_time_placeholder': '例：5 min',
        'field_excerpt': '抜粋',
        'field_excerpt_placeholder': '記事の概要（200 文字以内）',
        'field_excerpt_hint': '記事の概要を入力してください',
        'field_content': '本文',
        'field_content_placeholder': '記事の内容を入力...',
        'field_content_hint': '書式サポート：## 見出し 1 / ### 見出し 2 / - リスト項目 / > 引用 / `コード`',
        'btn_submit': '投稿する',
        'cancel': 'キャンセル',
        'login_title': 'ログイン',
        'login_subtitle': '月読空間にようこそ',
        'register_title': '新規登録',
        'register_subtitle': 'アカウントを作成',
        'field_username': 'ユーザー名 / メール',
        'field_username_placeholder': 'ユーザー名またはメールアドレス',
        'field_email': 'メールアドレス',
        'field_email_placeholder': 'your@email.com',
        'field_password': 'パスワード',
        'field_password_placeholder': 'パスワード',
        'field_password_confirm': 'パスワード（確認）',
        'field_password_confirm_placeholder': 'もう一度入力',
        'btn_login': 'ログイン',
        'btn_register': '登録する',
        'back_to_hub': 'スキップ',
        'back_to_login': '既にアカウントをお持ちの方？ログイン',
        'login_success': 'ログイン成功！リダイレクト中...',
        'register_success': '登録完了！リダイレクト中...',
        'password_mismatch': 'パスワードが一致しません',
        'error_network': 'ネットワークエラー、接続を確認してください',
        'error_server': 'サーバーエラー',
        'error_unauthorized': '未認証です。ログインしてください',
        'error_forbidden': '権限が不足しています',
        'error_not_found': 'リソースが見つかりません',
        'submit_success': '投稿が完了しました！ステージへ戻ります...',
        'submit_error': 'エラーが発生しました',
        'required_fields': 'すべての必須項目を入力してください',
        'image_error_type': '画像ファイルを選択してください',
        'image_error_size': '画像サイズは 5MB 以下にしてください'
    }
};

// 语言切换函数 - 确保全局同步
function setLanguage(lang) {
    if (!i18n[lang]) {
        console.error('Language not found:', lang);
        lang = 'zh';
    }

    // 保存到 localStorage - 全局同步的关键
    localStorage.setItem('tsukuyomi_lang', lang);
    document.documentElement.lang = lang;

    console.log('[i18n] 切换到语言:', lang);

    // 更新所有带有 data-i18n 属性的元素
    const elements = document.querySelectorAll('[data-i18n]');
    console.log('[i18n] 找到', elements.length, '个需要翻译的元素');

    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = i18n[lang][key];

        if (text) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (key.includes('placeholder')) {
                    el.placeholder = text;
                    console.log('[i18n] 更新 placeholder:', key, '=', text);
                }
            } else if (el.tagName === 'BUTTON' || el.tagName === 'A') {
                // 保留 emoji 图标 - 从原始 HTML 获取，而不是当前文本
                const originalText = el.getAttribute('data-original-text');
                if (!originalText) {
                    // 首次调用时保存原始文本
                    el.setAttribute('data-original-text', el.textContent);
                }
                const emoji = el.getAttribute('data-original-text').match(/^[^\u4e00-\u9fa5a-zA-Z]*/);
                if (emoji) {
                    el.textContent = emoji[0] + ' ' + text;
                } else {
                    el.textContent = text;
                }
                console.log('[i18n] 更新按钮/链接:', key, '=', el.textContent);
            } else {
                el.textContent = text;
                console.log('[i18n] 更新文本:', key, '=', text);
            }
        } else {
            console.warn('[i18n] 未找到翻译键:', key);
        }
    });

    // 更新按钮状态
    document.querySelectorAll('.lang-btn').forEach(btn => {
        const isActive = btn.dataset.lang === lang;
        btn.classList.toggle('active', isActive);
        console.log('[i18n] 按钮状态:', btn.dataset.lang, 'active =', isActive);
    });

    console.log('[i18n] 语言切换完成');
}

// 获取当前语言 - 从 localStorage 读取
function getCurrentLang() {
    const lang = localStorage.getItem('tsukuyomi_lang');
    console.log('[i18n] 当前语言:', lang || 'zh (默认)');
    return lang || 'zh';
}

// 初始化语言 - 页面加载时自动调用
function initLanguage() {
    console.log('[i18n] === 初始化语言系统 ===');
    const lang = getCurrentLang();
    setLanguage(lang);
    console.log('[i18n] === 初始化完成 ===');
}

// 自动初始化（当 DOM 加载完成时）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguage);
    console.log('[i18n] DOM 加载中，注册初始化事件');
} else {
    console.log('[i18n] DOM 已加载，立即初始化');
    initLanguage();
}

// 导出函数（供其他脚本使用）
window.i18n = i18n;
window.setLanguage = setLanguage;
window.getCurrentLang = getCurrentLang;
window.initLanguage = initLanguage;

console.log('[i18n] i18n.js 加载完成');
