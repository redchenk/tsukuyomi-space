# Vue Frontend Modules

This directory is the browser-native Vue module layer for the migrated pages.

- `router.js` owns route names and history navigation helpers.
- `api.js` owns response parsing, auth headers, and small API utilities.
- `App.js` owns the current SPA shell, route switching, and page state while page components are being extracted.
- `i18n.js` owns the browser-side zh/ja copy map.
- `components/` contains reusable Vue components that are shared across pages.

`/assets/js/vue-app.js` is now the thin mount entry. Keep `room` on its existing runtime until its Live2D flow is migrated deliberately.

Styles for the migrated SPA are split under `/assets/css/vue/`, with `/assets/css/vue-app.css` acting as the ordered import entry. This keeps the current browser-native Vue layer stable while preparing the pages for Vite + Vue SFC migration.

The Vite + Vue SFC migration scaffold now lives in `/src/frontend/` and uses `vite.frontend.config.js`. Use `npm run dev:web` for the frontend dev server and `npm run build:web` to build it into `/dist/frontend/`. The production site still uses the browser-native entry until pages are migrated deliberately.

Migration progress: `AccessPage.vue`, `HubPage.vue`, `LoginPage.vue`, `RegisterPage.vue`, `StagePage.vue`, `PlazaPage.vue`, `RealityPage.vue`, `EditorPage.vue`, and `UserCenterPage.vue` now carry their page-specific behavior in SFC form. Continue moving pages from the legacy `App.js` one at a time, keeping production on the browser-native entry until the SFC pages reach parity.

Shared SFC utilities now live under `/src/frontend/api/` and `/src/frontend/utils/`; keep new auth/session helpers and browser utilities there instead of reintroducing page-local copies.
