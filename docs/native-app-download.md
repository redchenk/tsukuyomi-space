# Native app download page

- Public route: `/download`; reachable from the Space navigation group and navigation search.
- The page uses the existing seasonal theme, shared navigation and Chinese, English and Japanese copy. It suggests the current device's platform and labels CPU architecture, portable packages and unsigned iOS explicitly.
- Installer links go directly to `github.com/redchenk/tsukuyomi-space-app/releases/download/...`. There is no download API, CDN mirror, blob fetch or backend installer proxy.
- Only public release metadata is fetched from GitHub, with a 6-second timeout, 1 MiB response limit and 15-minute in-memory cache. Download links are checked against the official repository, tag and expected asset filename. Drafts and incomplete releases are ignored.
- Stable releases are preferred when available, with a separate beta selector. If GitHub is unavailable, `shared/native-app-release.json` supplies the last verified complete release immediately; the page explains that update checking failed.
- After publishing a new app release, run `npm run sync:app-release`, review and commit the small fallback snapshot. The script does not download installers. Browser metadata checks discover newer complete releases without a website rebuild.
- The backend renders public installation guidance and direct download links without JavaScript. The overseas public-route allowlist and SEO copy include `/download`.

Validation: `tests/frontend-native-download.test.cjs` covers release selection, link validation, platform suggestions, metadata limits/cache/cancellation and locale coverage. `tests/seo-geo.test.js` checks the actual public HTML, direct GitHub assets and sitemap entry.
