import { createApp, computed, nextTick, onMounted, reactive, ref, watch } from '/assets/vendor/vue.esm-browser.prod.js';

const routes = {
    '/': 'access',
    '/access': 'access',
    '/hub': 'hub',
    '/login': 'login',
    '/register': 'register',
    '/stage': 'stage'
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
        unknown: '未知错误',
        failedPrefix: '请求失败：'
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
        loginRequired: '投稿するにはログインしてください！'
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

const App = {
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
            { href: '/pages/plaza', icon: '◎', name: t.value.plaza, desc: t.value.plazaDesc },
            { href: '/stage', icon: '▣', name: t.value.stage, desc: t.value.stageDesc },
            { href: '/pages/arena', icon: '△', name: t.value.arena, desc: t.value.arenaDesc },
            { href: '/pages/reality', icon: '◌', name: t.value.reality, desc: t.value.realityDesc }
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

        function initAmbient() {
            nextTick(() => {
                window.initTsukuyomiAmbientFish?.({ containerId: 'ambientLayer', density: 0.58 });
            });
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
            if (route.value !== 'access') initAmbient();
            if (route.value === 'stage') loadArticles();
        });

        watch(route, (nextRoute) => {
            syncBodyRouteClass(nextRoute);
            if (nextRoute !== 'access') initAmbient();
            if (nextRoute === 'stage') loadArticles();
        });

        return {
            accessLoading,
            articles,
            articlesLoading,
            categories,
            checkEditorAuth,
            filteredArticles,
            go,
            isAuthed,
            lang,
            loadArticles,
            login,
            loginPlaceholder,
            logout,
            register,
            route,
            sceneLinks,
            setLang,
            stageCategory,
            stageCategoryLabel,
            stageSearch,
            startAccess,
            submitLogin,
            submitRegister,
            sendCode,
            t,
            user
        };
    },
    template: `
        <div class="app-shell">
            <div v-if="route !== 'access'" id="ambientLayer" class="ambient"></div>
            <div v-if="route !== 'access'" class="moon" aria-hidden="true"></div>
            <header v-if="route !== 'access'" class="topbar">
                <a href="/access" class="brand" @click.prevent="go('/access')">{{ t.brand }}</a>
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
                    <a href="/pages/editor" class="btn stage-new-btn" @click="checkEditorAuth">{{ t.newPost }}</a>
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
        </div>
    `
};

createApp(App).mount('#app');
