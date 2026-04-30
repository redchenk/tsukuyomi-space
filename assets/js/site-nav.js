(function () {
    const NAV_ITEMS = [
        { key: 'hub', label: '中枢大厅' },
        { key: 'stage', label: '主舞台' },
        { key: 'arena', label: '竞技场' },
        { key: 'room', label: '私人居所' },
        { key: 'plaza', label: '月读广场' },
        { key: 'reality', label: '现实锚点' }
    ];

    const HIDDEN_NAV_PAGES = new Set(['access']);
    const ROUTE_KEYS = new Set(NAV_ITEMS.map((item) => item.key));
    const ACTIVE_ALIASES = {
        article: 'stage',
        editor: 'stage',
        'room-live2d': 'room',
        'room-live2d-simple': 'room'
    };

    function pagePrefix() {
        return location.pathname.includes('/pages/') ? '' : 'pages/';
    }

    function currentKey() {
        const file = location.pathname.split('/').pop() || 'index';
        const key = file.replace(/\.html$/i, '') || 'index';
        return ACTIVE_ALIASES[key] || (ROUTE_KEYS.has(key) ? key : '');
    }

    function currentPage() {
        const file = location.pathname.split('/').pop() || 'index';
        return file.replace(/\.html$/i, '') || 'index';
    }

    function routeKeyFromHref(href) {
        if (!href || href === '#') return '';
        const clean = href.split('#')[0].split('?')[0].replace(/\/+$/g, '');
        const part = clean.split('/').pop().replace(/\.html$/i, '');
        return ROUTE_KEYS.has(part) ? part : '';
    }

    function createLogo(nav, prefix) {
        const logo = nav.querySelector('.logo, .room-logo') || document.createElement('a');
        logo.className = 'logo';
        logo.href = `${prefix}hub`;
        logo.textContent = '月读空间';
        if (!logo.parentElement) nav.prepend(logo);
        return logo;
    }

    function createNavRight(nav) {
        let navRight = nav.querySelector('.nav-right, .room-links');
        const oldList = nav.querySelector('ul');

        if (!navRight && oldList) {
            navRight = document.createElement('div');
            navRight.className = 'nav-right';
            Array.from(oldList.children).forEach((item) => {
                while (item.firstChild) navRight.appendChild(item.firstChild);
            });
            oldList.replaceWith(navRight);
        }

        if (!navRight) {
            navRight = document.createElement('div');
            nav.appendChild(navRight);
        }

        navRight.className = 'nav-right';
        return navRight;
    }

    function shouldPreserve(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.matches('[data-site-nav]')) return false;
        if (!node.matches('a')) return true;
        if (node.id || node.classList.contains('login-btn')) return true;
        return false;
    }

    function ensureNav() {
        if (HIDDEN_NAV_PAGES.has(currentPage())) return;

        let nav = document.querySelector('nav');
        if (!nav) {
            nav = document.createElement('nav');
            document.body.prepend(nav);
        }

        nav.classList.add('site-nav');
        const prefix = pagePrefix();
        const active = currentKey();
        createLogo(nav, prefix);

        const navRight = createNavRight(nav);
        const preserved = Array.from(navRight.childNodes).filter(shouldPreserve);
        navRight.textContent = '';

        NAV_ITEMS.forEach((item) => {
            const link = document.createElement('a');
            link.href = `${prefix}${item.key}`;
            link.textContent = item.label;
            link.dataset.siteNav = item.key;
            if (item.key === active) link.className = 'active';
            navRight.appendChild(link);
        });

        preserved.forEach((node) => navRight.appendChild(node));
        document.body.classList.add('has-site-nav');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureNav);
    } else {
        ensureNav();
    }
})();
