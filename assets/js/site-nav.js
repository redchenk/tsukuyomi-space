(function () {
    const MIN_LOADER_MS = 360;
    const NAV_ITEMS = [
        { key: 'hub', label: '中枢大厅' },
        { key: 'stage', label: '主舞台' },
        { key: 'arena', label: '竞技场' },
        { key: 'room', label: '私人居所' },
        { key: 'plaza', label: '月读广场' },
        { key: 'reality', label: '现实锚点' }
    ];

    const HIDDEN_NAV_PAGES = new Set(['access']);
    const DISABLE_PAGE_LOADER_PAGES = new Set(['access', 'hub', 'room', 'room-live2d', 'room-live2d-simple']);
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

    function pageLoaderEnabled() {
        return !DISABLE_PAGE_LOADER_PAGES.has(currentPage());
    }

    function createPageLoader() {
        if (document.querySelector('.tsuki-page-loader')) return;
        document.body.classList.add('tsuki-loader-active');
        document.body.classList.add('tsuki-is-loading');

        const loader = document.createElement('div');
        loader.className = 'tsuki-page-loader';
        loader.setAttribute('aria-hidden', 'true');
        loader.innerHTML = [
            '<div class="tsuki-page-loader__mark">',
            '  <div class="tsuki-page-loader__sigil"></div>',
            '  <div class="tsuki-page-loader__bar"><span></span></div>',
            '  <div class="tsuki-page-loader__text">TSUKUYOMI SPACE</div>',
            '</div>'
        ].join('');
        document.body.appendChild(loader);
    }

    function finishPageLoader() {
        const startedAt = Number(document.body.dataset.tsukiLoaderStarted || Date.now());
        const delay = Math.max(0, MIN_LOADER_MS - (Date.now() - startedAt));
        window.setTimeout(() => {
            document.body.classList.remove('tsuki-is-loading');
            document.body.classList.add('tsuki-ready');
        }, delay);
    }

    function shouldAnimateLink(event, link) {
        if (!link || event.defaultPrevented) return false;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
        if (link.target && link.target !== '_self') return false;
        if (link.hasAttribute('download')) return false;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
            return false;
        }

        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return false;
        return url.href !== window.location.href;
    }

    function installPageTransitions() {
        if (!pageLoaderEnabled()) {
            return;
        }

        document.body.dataset.tsukiLoaderStarted = String(Date.now());
        createPageLoader();
        document.addEventListener('DOMContentLoaded', finishPageLoader, { once: true });

        window.addEventListener('pageshow', () => {
            document.body.classList.remove('tsuki-is-leaving');
            if (document.readyState !== 'loading') finishPageLoader();
        });

        document.addEventListener('click', (event) => {
            const link = event.target.closest?.('a');
            if (!shouldAnimateLink(event, link)) return;
            event.preventDefault();
            document.body.classList.add('tsuki-is-leaving');
            window.setTimeout(() => {
                window.location.href = link.href;
            }, 140);
        });
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
        installPageTransitions();
        document.addEventListener('DOMContentLoaded', ensureNav);
    } else {
        installPageTransitions();
        ensureNav();
        finishPageLoader();
    }
})();
