import { createRouter, createWebHistory } from 'vue-router';
import { applyRouteSeo } from '../utils/seo';
import { isReducedPerformance, scheduleIdleTask } from '../utils/performance';

const AccessPage = () => import('../pages/AccessPage.vue');
const HubPage = () => import('../pages/HubPage.vue');
const LoginPage = () => import('../pages/LoginPage.vue');
const RegisterPage = () => import('../pages/RegisterPage.vue');
const StagePage = () => import('../pages/StagePage.vue');
const PlazaPage = () => import('../pages/PlazaPage.vue');
const FriendLinksPage = () => import('../pages/FriendLinksPage.vue');
const FriendLinkApplyPage = () => import('../pages/FriendLinkApplyPage.vue');
const RealityPage = () => import('../pages/RealityPage.vue');
const EditorPage = () => import('../pages/EditorPage.vue');
const AttachmentsPage = () => import('../pages/AttachmentsPage.vue');
const GalleryPage = () => import('../pages/GalleryPage.vue');
const UserCenterPage = () => import('../pages/UserCenterPage.vue');
const UserProfilePage = () => import('../pages/UserProfilePage.vue');
const NotificationsPage = () => import('../pages/NotificationsPage.vue');
const RoomPage = () => import('../pages/RoomPage.vue');
const RoomSettingsPage = () => import('../pages/RoomSettingsPage.vue');
const Live2DPage = () => import('../pages/Live2DPage.vue');
const ArticlePage = () => import('../pages/ArticlePage.vue');
const TerminalPage = () => import('../pages/TerminalPage.vue');
const AdminPage = () => import('../pages/AdminPage.vue');
const ArenaPage = () => import('../pages/ArenaPage.vue');

export const routes = [
  {
    path: '/',
    name: 'access',
    component: AccessPage,
    meta: {
      title: '月读空间',
      description: '进入月读空间，抵达文章、广场、Live2D 房间与互动体验的入口。'
    }
  },
  { path: '/access', name: 'accessAlias', redirect: '/' },
  {
    path: '/hub',
    name: 'hub',
    component: HubPage,
    meta: {
      title: '中枢大厅',
      description: '月读空间的中枢大厅，通往月读广场、主舞台、私人居所与站点数据。'
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
      title: '主舞台',
      description: '浏览月读空间的文章、公告、技术记录、二创作品与创作日志。'
    }
  },
  {
    path: '/articles/:id/:slug?',
    name: 'articleDetail',
    component: ArticlePage,
    meta: { title: '文章', description: '月读空间文章正文与评论。' }
  },
  {
    path: '/article',
    name: 'article',
    component: ArticlePage,
    meta: { title: '文章', description: '月读空间文章正文与评论。' }
  },
  {
    path: '/room',
    name: 'room',
    component: RoomPage,
    meta: {
      title: '八千代的房间',
      description: '体验 Live2D 角色互动、AI 聊天、TTS 语音、长期记忆、角色知识库与 MCP 工具接入。'
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
      title: '月读广场',
      description: '在月读广场留言、回复、点赞，和来访者交换片刻心情。'
    }
  },
  {
    path: '/friend-links',
    name: 'friendLinks',
    component: FriendLinksPage,
    meta: {
      title: '友链',
      description: '浏览月读空间收录的友好站点。'
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
      title: '现实锚点',
      description: '记录现实世界中的锚点、灵感与日常片段。'
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
    meta: { title: '图库', description: '上传、浏览和管理月读空间图库图片。', noindex: true }
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
    path: '/users/:username',
    name: 'userProfile',
    component: UserProfilePage,
    meta: { title: '个人主页', description: '查看月读空间公开个人主页。' }
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
      title: '月光像素工坊',
      description: '在月读空间画像素画、公开分享作品，并浏览和点赞其他用户的像素创作。'
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
  userCenter: [NotificationsPage, UserProfilePage],
  terminal: [EditorPage, AttachmentsPage],
  admin: [EditorPage, GalleryPage, AttachmentsPage],
  pixel: [UserCenterPage]
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
