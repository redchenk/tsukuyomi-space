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
import RoomPage from '../pages/RoomPage.vue';
import ArticlePage from '../pages/ArticlePage.vue';
import TerminalPage from '../pages/TerminalPage.vue';
import ArenaPage from '../pages/ArenaPage.vue';

const keepQueryRedirect = (path) => (to) => ({ path, query: to.query });

export const routes = [
  { path: '/', name: 'access', component: AccessPage },
  { path: '/access', name: 'accessAlias', redirect: '/' },
  { path: '/hub', name: 'hub', component: HubPage },
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/register', name: 'register', component: RegisterPage },
  { path: '/stage', name: 'stage', component: StagePage },
  { path: '/article', name: 'article', component: ArticlePage },
  { path: '/room', name: 'room', component: RoomPage },
  { path: '/plaza', name: 'plaza', component: PlazaPage },
  { path: '/reality', name: 'reality', component: RealityPage },
  { path: '/editor', name: 'editor', component: EditorPage },
  { path: '/user-center', name: 'userCenter', component: UserCenterPage },
  { path: '/terminal', name: 'terminal', component: TerminalPage },
  { path: '/arena', name: 'arena', component: ArenaPage },
  { path: '/index.html', redirect: '/' },
  { path: '/access.html', redirect: '/' },
  { path: '/hub.html', redirect: '/hub' },
  { path: '/login.html', redirect: '/login' },
  { path: '/register.html', redirect: '/register' },
  { path: '/stage.html', redirect: '/stage' },
  { path: '/room.html', redirect: '/room' },
  { path: '/plaza.html', redirect: '/plaza' },
  { path: '/reality.html', redirect: '/reality' },
  { path: '/editor.html', redirect: keepQueryRedirect('/editor') },
  { path: '/user-center.html', redirect: '/user-center' },
  { path: '/article.html', redirect: keepQueryRedirect('/article') },
  { path: '/terminal.html', redirect: '/terminal' },
  { path: '/arena.html', redirect: '/arena' },
  { path: '/pages/index', redirect: '/' },
  { path: '/pages/index.html', redirect: '/' },
  { path: '/pages/access', redirect: '/' },
  { path: '/pages/access.html', redirect: '/' },
  { path: '/pages/hub', redirect: '/hub' },
  { path: '/pages/hub.html', redirect: '/hub' },
  { path: '/pages/login', redirect: '/login' },
  { path: '/pages/login.html', redirect: '/login' },
  { path: '/pages/register', redirect: '/register' },
  { path: '/pages/register.html', redirect: '/register' },
  { path: '/pages/stage', redirect: '/stage' },
  { path: '/pages/stage.html', redirect: '/stage' },
  { path: '/pages/room', redirect: '/room' },
  { path: '/pages/room.html', redirect: '/room' },
  { path: '/pages/plaza', redirect: '/plaza' },
  { path: '/pages/plaza.html', redirect: '/plaza' },
  { path: '/pages/reality', redirect: '/reality' },
  { path: '/pages/reality.html', redirect: '/reality' },
  { path: '/pages/editor', redirect: keepQueryRedirect('/editor') },
  { path: '/pages/editor.html', redirect: keepQueryRedirect('/editor') },
  { path: '/pages/user-center', redirect: '/user-center' },
  { path: '/pages/user-center.html', redirect: '/user-center' },
  { path: '/pages/article', redirect: keepQueryRedirect('/article') },
  { path: '/pages/article.html', redirect: keepQueryRedirect('/article') },
  { path: '/pages/terminal', redirect: '/terminal' },
  { path: '/pages/terminal.html', redirect: '/terminal' },
  { path: '/pages/arena', redirect: '/arena' },
  { path: '/pages/arena.html', redirect: '/arena' }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});
