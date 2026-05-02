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
  { path: '/arena', name: 'arena', component: ArenaPage }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});
