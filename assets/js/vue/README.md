# Vue Frontend Modules

This directory is the browser-native Vue module layer for the migrated pages.

- `router.js` owns route names and history navigation helpers.
- `api.js` owns response parsing, auth headers, and small API utilities.
- `components/` contains reusable Vue components that are shared across pages.

`/assets/js/vue-app.js` still hosts the large app shell and page templates while the migration is in progress. Keep `room` on its existing runtime until its Live2D flow is migrated deliberately.
