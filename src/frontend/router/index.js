import { createRouter, createWebHistory } from 'vue-router';
import AccessPage from '../pages/AccessPage.vue';
import HubPage from '../pages/HubPage.vue';
import LoginPage from '../pages/LoginPage.vue';
import RegisterPage from '../pages/RegisterPage.vue';
import StagePage from '../pages/StagePage.vue';
import PlazaPage from '../pages/PlazaPage.vue';
import RealityPage from '../pages/RealityPage.vue';
import EditorPage from '../pages/EditorPage.vue';
import UserCenterPage from '../pages/UserCenterPage.vue';
import NotificationsPage from '../pages/NotificationsPage.vue';
import RoomPage from '../pages/RoomPage.vue';
import RoomSettingsPage from '../pages/RoomSettingsPage.vue';
import ArticlePage from '../pages/ArticlePage.vue';
import TerminalPage from '../pages/TerminalPage.vue';
import ArenaPage from '../pages/ArenaPage.vue';
import { applyRouteSeo } from '../utils/seo';

export const routes = [
  { path: '/', name: 'access', component: AccessPage, meta: { title: '月读空间', description: '进入月读空间，抵达文章、广场、Live2D 房间与互动体验的入口。' } },
  { path: '/access', name: 'accessAlias', redirect: '/' },
  { path: '/hub', name: 'hub', component: HubPage, meta: { title: '中枢大厅', description: '月读空间的中枢大厅，通往阅读广场、主舞台、私人居所与站点数据。' } },
  { path: '/login', name: 'login', component: LoginPage, meta: { title: '登录', description: '登录月读空间账号。', noindex: true } },
  { path: '/register', name: 'register', component: RegisterPage, meta: { title: '注册', description: '注册月读空间账号。', noindex: true } },
  { path: '/stage', name: 'stage', component: StagePage, meta: { title: '主舞台', description: '阅读月读空间的文章、公告、传说与技术记录。' } },
  { path: '/articles/:id/:slug?', name: 'articleDetail', component: ArticlePage, meta: { title: '文章', description: '月读空间文章正文与评论。' } },
  { path: '/article', name: 'article', component: ArticlePage, meta: { title: '文章', description: '月读空间文章正文与评论。' } },
  { path: '/room', name: 'room', component: RoomPage, meta: { title: '八千代的房间', description: '与八千代对话，使用 Live2D、长记忆、TTS 与音乐卡片的互动房间。' } },
  { path: '/room/settings', name: 'roomSettings', component: RoomSettingsPage, alias: '/room-settings', meta: { title: '房间设置', description: '配置房间中的 LLM、TTS、MCP、知识库与长记忆。', noindex: true } },
  { path: '/plaza', name: 'plaza', component: PlazaPage, meta: { title: '月读广场', description: '在月读广场留言、回复、点赞，和来访者交换片刻心情。' } },
  { path: '/reality', name: 'reality', component: RealityPage, meta: { title: '现实锚点', description: '记录现实世界中的锚点、灵感与日常片段。' } },
  { path: '/editor', name: 'editor', component: EditorPage, meta: { title: '文章编辑', description: '编辑和发布月读空间文章。', noindex: true } },
  { path: '/user-center', name: 'userCenter', component: UserCenterPage, meta: { title: '用户中心', description: '管理月读空间账号资料。', noindex: true } },
  { path: '/notifications', name: 'notifications', component: NotificationsPage, meta: { title: '站内信', description: '查看回复、点赞与站内通知。', noindex: true } },
  { path: '/terminal', name: 'terminal', component: TerminalPage, meta: { title: '终端管理', description: '月读空间后台管理终端。', noindex: true } },
  { path: '/arena', name: 'arena', component: ArenaPage, alias: '/arena/', meta: { title: '超时空辉夜姬竞技场', description: '进入超时空辉夜姬竞技场网页游戏。' } }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});

router.afterEach((to) => {
  applyRouteSeo(to);
});
