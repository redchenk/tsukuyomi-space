# Mobile QQ JavaScript SDK

This is the unmodified SDK served by Tencent at
https://open.mobile.qq.com/sdk/qqapi.js, retrieved on 2026-10-11.

SHA-256: `5ed54a54236d12b838952a5875652bb376a2bf54e127a6b30112760bdfcb030a`

It is loaded as a same-origin classic script only when sharing inside mobile QQ.
The SDK implements `mqq.ui.shareMessage` on Android and iOS and normalizes
Android callbacks to `retCode`. Keeping it local preserves the existing
`script-src 'self'` Content Security Policy and avoids a third-party script
request at runtime. Reload and verify the upstream source before updating it.
