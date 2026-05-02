export const routes = {
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

export function normalizePath(pathname) {
    return pathname.replace(/\/+$/, '') || '/';
}

export function pushRoute(path) {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}
