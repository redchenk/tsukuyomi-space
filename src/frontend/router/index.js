import { createRouter, createWebHistory } from 'vue-router';
import { applyRouteSeo } from '../utils/seo';
import { isReducedPerformance, scheduleIdleTask } from '../utils/performance';

function loadRoute(componentLoader, styleLoader) {
  let routePromise = null;
  return () => {
    if (!routePromise) {
      routePromise = Promise.all([componentLoader(), styleLoader()])
        .then(([component]) => component)
        .catch((error) => {
          routePromise = null;
          throw error;
        });
    }
    return routePromise;
  };
}

const AccessPage = loadRoute(() => import('../pages/AccessPage.vue'), () => import('../styles/routes/access.css'));
const HubPage = loadRoute(() => import('../pages/HubPage.vue'), () => import('../styles/routes/hub.css'));
const LoginPage = loadRoute(() => import('../pages/LoginPage.vue'), () => import('../styles/routes/access.css'));
const RegisterPage = loadRoute(() => import('../pages/RegisterPage.vue'), () => import('../styles/routes/access.css'));
const StagePage = loadRoute(() => import('../pages/StagePage.vue'), () => import('../styles/routes/stage.css'));
const PlazaPage = loadRoute(() => import('../pages/PlazaPage.vue'), () => import('../styles/routes/plaza.css'));
const FriendLinksPage = loadRoute(() => import('../pages/FriendLinksPage.vue'), () => import('../styles/routes/friend-links.css'));
const FriendLinkApplyPage = loadRoute(() => import('../pages/FriendLinkApplyPage.vue'), () => import('../styles/routes/friend-links.css'));
const RealityPage = loadRoute(() => import('../pages/RealityPage.vue'), () => import('../styles/routes/reality.css'));
const EditorPage = loadRoute(() => import('../pages/EditorPage.vue'), () => import('../styles/routes/editor.css'));
const AttachmentsPage = loadRoute(() => import('../pages/AttachmentsPage.vue'), () => import('../styles/routes/attachments.css'));
const GalleryPage = loadRoute(() => import('../pages/GalleryPage.vue'), () => import('../styles/routes/gallery.css'));
const UserCenterPage = loadRoute(() => import('../pages/UserCenterPage.vue'), () => import('../styles/routes/user-center.css'));
const GrowthPage = loadRoute(() => import('../pages/GrowthPage.vue'), () => import('../styles/routes/growth.css'));
const UserProfilePage = loadRoute(() => import('../pages/UserProfilePage.vue'), () => import('../styles/routes/user-profile.css'));
const NotificationsPage = loadRoute(() => import('../pages/NotificationsPage.vue'), () => import('../styles/routes/notifications.css'));
const RoomPage = loadRoute(() => import('../pages/RoomPage.vue'), () => import('../styles/routes/room.css'));
const RoomSettingsPage = loadRoute(() => import('../pages/RoomSettingsPage.vue'), () => import('../styles/routes/room-settings.css'));
const Live2DPage = loadRoute(() => import('../pages/Live2DPage.vue'), () => import('../styles/routes/live2d.css'));
const ArticlePage = loadRoute(() => import('../pages/ArticlePage.vue'), () => import('../styles/routes/article.css'));
const TerminalPage = loadRoute(() => import('../pages/TerminalPage.vue'), () => import('../styles/routes/terminal.css'));
const AdminPage = loadRoute(() => import('../pages/AdminPage.vue'), () => import('../styles/routes/admin.css'));
const ArenaPage = loadRoute(() => import('../pages/ArenaPage.vue'), () => import('../styles/routes/arena.css'));
const WikiPage = loadRoute(() => import('../pages/WikiPage.vue'), () => import('../styles/routes/wiki.css'));
const WikiEntryPage = loadRoute(() => import('../pages/WikiEntryPage.vue'), () => import('../styles/routes/wiki.css'));

export const routes = [
  {
    path: '/',
    name: 'access',
    component: AccessPage,
    meta: {
      title: '月读空间｜超时空辉夜姬 Wiki、Live2D 与创作社区',
      description: '月读空间汇集超时空辉夜姬 Wiki、文章、公开图库、192×108 像素画与月见八千代 Live2D AI 房间。',
      keywords: ['月读空间', 'Tsukuyomi Space', '超时空辉夜姬 Wiki', '月见八千代 Live2D', '二次元创作社区']
    }
  },
  { path: '/access', name: 'accessAlias', redirect: '/' },
  {
    path: '/hub',
    name: 'hub',
    component: HubPage,
    meta: {
      title: '月读空间中枢大厅',
      description: '从中枢大厅快速浏览主舞台文章、公开图库、月读广场、最新像素画和八千代房间动态。',
      keywords: ['月读空间首页', '月读空间中枢大厅', '主舞台文章', '月读广场', '最新像素画']
    }
  },
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: { title: '登录', description: '登录月读空间账号。', noindex: true }
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterPage,
    meta: { title: '注册', description: '注册月读空间账号。', noindex: true }
  },
  {
    path: '/stage',
    name: 'stage',
    component: StagePage,
    meta: {
      title: '主舞台文章与创作档案',
      description: '浏览月读空间公开发布的公告、技术记录、超时空辉夜姬二创文章、翻译与创作日志。',
      keywords: ['月读空间文章', '主舞台', '超时空辉夜姬二创', 'Live2D 技术', '创作日志']
    }
  },
  {
    path: '/articles/:id/:slug?',
    name: 'articleDetail',
    component: ArticlePage,
    meta: {
      title: '月读空间文章',
      description: '阅读月读空间公开文章正文、作者资料与相关评论。',
      keywords: ['月读空间文章', '月读空间主舞台', '公开文章', '创作记录']
    }
  },
  {
    path: '/article',
    name: 'article',
    component: ArticlePage,
    meta: {
      title: '月读空间文章入口',
      description: '通过文章编号访问月读空间公开文章正文、作者资料与相关评论。',
      keywords: ['月读空间文章入口', '文章正文', '主舞台文章', '月读空间评论']
    }
  },
  {
    path: '/wiki',
    name: 'wiki',
    component: WikiPage,
    meta: {
      title: '超时空辉夜姬角色与世界观 Wiki',
      description: '非官方粉丝资料库，完整整理超时空辉夜姬作品概览、角色、月读世界观、音乐、发行与衍生词条。',
      keywords: ['超时空辉夜姬 Wiki', '超かぐや姫', 'Cosmic Princess Kaguya', '超时空辉夜姬角色', '月读世界观']
    }
  },
  {
    path: '/wiki/characters/:slug',
    name: 'wikiCharacter',
    component: WikiEntryPage,
    props: route => ({ kind: 'character', slug: route.params.slug }),
    meta: {
      title: '超时空辉夜姬角色词条',
      description: '查看超时空辉夜姬角色的基本资料、人物经历、关系、关联音乐、清晰角色图与参考来源。',
      keywords: ['超时空辉夜姬角色', '超かぐや姫角色', '辉夜', '酒寄彩叶', '月见八千代']
    }
  },
  {
    path: '/wiki/terms/:slug',
    name: 'wikiTerm',
    component: WikiEntryPage,
    props: route => ({ kind: 'term', slug: route.params.slug }),
    meta: {
      title: '超时空辉夜姬世界观词条',
      description: '查看超时空辉夜姬的月读世界观、八千代杯、KASSEN、角色音乐与《竹取物语》母题词条。',
      keywords: ['超时空辉夜姬世界观', '月读 TSUKUYOMI', '八千代杯', 'KASSEN', '竹取物语']
    }
  },
  {
    path: '/room',
    name: 'room',
    component: RoomPage,
    meta: {
      title: '月见八千代 Live2D AI 房间',
      description: '进入月见八千代 Live2D 房间，体验高清角色互动、AI 聊天、TTS 语音、长期记忆与角色知识库。',
      keywords: ['月见八千代 Live2D', '八千代 AI 聊天', 'Live2D 房间', 'GPT-SoVITS', '角色长期记忆']
    }
  },
  {
    path: '/room/shared/:shareId',
    name: 'roomShared',
    component: RoomPage,
    props: true,
    meta: {
      title: '与八千代的公开对话',
      description: '进入月读空间八千代房间，查看并继续一段公开分享的对话。',
      noindex: true
    }
  },
  {
    path: '/room/settings',
    name: 'roomSettings',
    component: RoomSettingsPage,
    alias: '/room-settings',
    meta: {
      title: '房间设置',
      description: '配置房间中的 LLM、TTS、MCP、知识库与长记忆。',
      noindex: true
    }
  },
  {
    path: '/live2d',
    name: 'live2d',
    component: Live2DPage,
    meta: {
      title: 'Live2D Preview',
      description: 'Hidden Live2D preview page.',
      noindex: true
    }
  },
  {
    path: '/plaza',
    name: 'plaza',
    component: PlazaPage,
    meta: {
      title: '月读广场留言社区',
      description: '在月读广场浏览公开留言、参与回复和点赞，与月读空间的来访者和创作者交流。',
      keywords: ['月读广场', '月读空间留言', '二次元留言板', '创作者交流', '公开留言社区']
    }
  },
  {
    path: '/friend-links',
    name: 'friendLinks',
    component: FriendLinksPage,
    meta: {
      title: '月读空间友链导航',
      description: '浏览月读空间审核收录的公开友好站点、独立博客和创作伙伴，发现更多值得访问的网站。',
      keywords: ['月读空间友链', '独立博客友链', '二次元个人站', '友好网站', '网站导航']
    }
  },
  {
    path: '/friend-links/apply',
    name: 'friendLinkApply',
    component: FriendLinkApplyPage,
    meta: {
      title: '友链申请',
      description: '向月读空间提交友链申请并查看审核状态。',
      noindex: true
    }
  },
  {
    path: '/reality',
    name: 'reality',
    component: RealityPage,
    meta: {
      title: '现实锚点与项目说明',
      description: '了解月读空间、八千代 Live2D、Agent OS 音乐应用与相关开源项目的技术来源、责任边界和现实记录。',
      keywords: ['月读空间项目说明', '八千代 Live2D 来源', 'Agent OS 音乐应用', '开源责任边界', '现实锚点']
    }
  },
  {
    path: '/editor',
    name: 'editor',
    component: EditorPage,
    meta: { title: '文章编辑', description: '编辑和发布月读空间文章。', noindex: true }
  },
  {
    path: '/attachments',
    name: 'attachments',
    component: AttachmentsPage,
    meta: { title: '附件库', description: '管理文章图片和个人上传附件。', noindex: true }
  },
  {
    path: '/gallery',
    name: 'gallery',
    component: GalleryPage,
    meta: {
      title: '月读空间公开图库',
      description: '浏览月读空间用户公开上传的插画、超时空辉夜姬二创图片、站点影像与创作素材，并查看上传者信息。',
      keywords: ['月读空间图库', '超时空辉夜姬图片', '二次元插画', '公开图片画廊', '用户创作图片']
    }
  },
  {
    path: '/gallery/manage',
    name: 'galleryManage',
    component: GalleryPage,
    meta: { title: '图库管理', description: '管理自己上传到图库的图片。', noindex: true }
  },
  {
    path: '/user-center',
    name: 'userCenter',
    component: UserCenterPage,
    meta: { title: '用户中心', description: '管理月读空间账号资料。', noindex: true }
  },
  {
    path: '/growth',
    name: 'growth',
    component: GrowthPage,
    meta: { title: '月契成长', description: '查看每日约定、等级、连续相伴记录与邀请进度。', noindex: true }
  },
  {
    path: '/users/:username',
    name: 'userProfile',
    component: UserProfilePage,
    meta: {
      title: '月读空间创作者主页',
      description: '查看月读空间创作者的公开资料、文章、关注关系与创作动态。',
      keywords: ['月读空间创作者', '公开个人主页', '作者文章', '二次元创作者']
    }
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: NotificationsPage,
    meta: { title: '站内信', description: '查看回复、点赞与站内通知。', noindex: true }
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminPage,
    meta: { title: '内容管理', description: '文章、留言、图库和附件审核工作台。', noindex: true }
  },
  {
    path: '/terminal',
    name: 'terminal',
    component: TerminalPage,
    meta: { title: '终端管理', description: '月读空间后台管理终端。', noindex: true }
  },
  {
    path: '/pixel',
    name: 'pixel',
    component: ArenaPage,
    alias: '/pixel/',
    meta: {
      title: '192×108 月光像素画工坊',
      description: '使用月读空间在线像素画工具创作固定 192×108 画布，公开分享、浏览、点赞并导出其他用户的像素作品。',
      keywords: ['在线像素画', '192×108 像素画', '月光像素工坊', '像素画社区', 'Pixel Art 编辑器']
    }
  },
  {
    path: '/arena/:pathMatch(.*)*',
    redirect: to => ({ path: '/pixel', query: to.query, hash: to.hash })
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});

const routeWarmups = {
  access: [HubPage],
  accessAlias: [HubPage],
  hub: [StagePage, PlazaPage],
  plaza: [FriendLinksPage, StagePage],
  friendLinks: [FriendLinkApplyPage],
  friendLinkApply: [FriendLinksPage],
  stage: [ArticlePage],
  article: [StagePage],
  articleDetail: [StagePage],
  roomSettings: [RoomPage],
  gallery: [AttachmentsPage],
  galleryManage: [GalleryPage],
  userCenter: [NotificationsPage, UserProfilePage, GrowthPage],
  growth: [RoomPage, UserCenterPage],
  terminal: [EditorPage, AttachmentsPage],
  admin: [EditorPage, GalleryPage, AttachmentsPage],
  pixel: [UserCenterPage],
  wiki: [WikiEntryPage],
  wikiCharacter: [WikiPage],
  wikiTerm: [WikiPage]
};
const defaultRouteWarmups = [HubPage];
const warmedRouteComponents = new WeakSet();
let cancelPendingRouteWarmup = null;

function warmRouteComponent(loader) {
  if (typeof loader !== 'function' || warmedRouteComponents.has(loader)) return;
  warmedRouteComponents.add(loader);
  loader().catch(() => {
    warmedRouteComponents.delete(loader);
  });
}

export function warmRoutePath(path) {
  if (typeof window === 'undefined' || document.visibilityState === 'hidden') return;
  const connection = window.navigator?.connection;
  if (connection?.saveData || isReducedPerformance()) return;
  try {
    const resolved = router.resolve(path);
    resolved.matched.forEach((record) => {
      Object.values(record.components || {}).forEach(warmRouteComponent);
    });
  } catch (_) {
    // Navigation remains available when an optional intent prefetch cannot resolve.
  }
}

function scheduleRouteWarmup(to) {
  if (typeof window === 'undefined') return;
  cancelPendingRouteWarmup?.();
  cancelPendingRouteWarmup = null;
  const connection = window.navigator?.connection;
  if (connection?.saveData || isReducedPerformance() || document.visibilityState === 'hidden') return;

  const loaders = routeWarmups[to.name] || defaultRouteWarmups;
  if (!loaders.length || to.name === 'room') return;
  cancelPendingRouteWarmup = scheduleIdleTask(() => {
    cancelPendingRouteWarmup = null;
    if (router.currentRoute.value.name !== to.name || isReducedPerformance()) return;
    loaders.forEach(warmRouteComponent);
  }, {
    delay: to.name === 'access' || to.name === 'accessAlias' ? 1600 : 900,
    timeout: 4000
  });
}

router.afterEach((to) => {
  applyRouteSeo(to);
  scheduleRouteWarmup(to);
});
