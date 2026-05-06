# Live2D CDN assets

Live2D model assets can be served from Cloudflare first, with the local
`/models/` directory kept as a fallback.

## Upload layout

Upload the contents of the repository `models/` directory to Cloudflare with
the same relative paths. For the current room model, these URLs must exist:

```text
https://source.redchenk.com/tsukimi-yachiyo/tsukimi-yachiyo.model3.json
https://source.redchenk.com/tsukimi-yachiyo/tsukimi-yachiyo.moc3
https://source.redchenk.com/tsukimi-yachiyo/textures/texture_00.webp
https://source.redchenk.com/tsukimi-yachiyo/textures/texture_01.webp
```

The base URL should point at the directory that contains `tsukimi-yachiyo/`.

## Environment

Set this before building the frontend:

```bash
VITE_LIVE2D_RESOURCE_BASE=https://source.redchenk.com/
npm run build:web
npm run build:live2d
```

If the value is empty, the app uses local `/models/` only.

## Fallback behavior

The Vue bridge checks the CDN `model3.json` and `moc3` before loading the
Live2D runtime. If either check fails, it uses local `/models/`.

The Live2D runtime also retries individual model files and textures from
local `/models/` when a CDN request fails.

Cloudflare must return CORS headers for browser/WebGL loading. A permissive
static-asset setup is:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD
```

The current Cloudflare R2 S3 API endpoint for uploads is:

```text
https://8a13512ba59c4f149b5a286a6c82001f.r2.cloudflarestorage.com/yachiyo
```
