// A complete local UI backed by an isolated, temporary fixture database.
// Uses the same compiled frontend and API routes as production, with no real accounts.
process.env.PORT ||= '4173';
process.env.UI_PREVIEW_FIXTURES = 'true';
process.env.JINGYUE_PREVIEW = 'true';
console.log(`静月本地预览（Access 水镜入场）：http://127.0.0.1:${process.env.PORT}/`);
require('../tests/e2e-server.cjs');
