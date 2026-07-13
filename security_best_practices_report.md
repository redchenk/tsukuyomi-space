# Tsukuyomi Space Security Review

Audit date: 2026-07-13

Scope: Node.js/Express API, Vue frontend, SQLite repositories, file uploads, MCP/TTS integrations, Nginx, PM2, CI/CD, and the production upload inventory.

Baseline: `891e31b` plus the hardening changes documented here.

## Executive summary

The review found several high-impact weaknesses in the upload and deployment boundaries. The most important issues were trusting client-provided file metadata, serving files from the repository root, accepting attacker-selected outbound destinations, and exposing an MCP subprocess to unnecessary environment secrets and local file paths. These paths have been closed in the current change set.

The production upload inventory was preserved before remediation using a consistent SQLite backup, database metadata export, MIME inspection, and SHA-256 manifest. The inventory contained 612 files and 611 database records. The inspected files were 607 JPEG images, two WAV files, one MP4, one MP3, and one PDF; no executable or active-content extension was found. This does not replace future malware scanning, but there was no confirmed malicious binary in the retained inventory.

No exploitable SQL injection, XXE, or JSONP endpoint was found. Existing XSS defenses were retained and extended by removing active file formats from the same-origin upload surface. Remaining operational work is listed at the end, especially credential rotation and removal of the shared parent-domain session cookie when cross-subdomain login is no longer required.

## Findings

### SEC-01: Unrestricted same-origin file upload

Severity: Critical

Status: Fixed

The previous upload path allowed file metadata supplied by the browser to influence storage and response behavior, and administrators could bypass the validation path. An active file stored below the website root could become a persistent XSS or malware delivery primitive.

Remediation:

- Enforce a 20 MB decoded-file limit before storage.
- Detect JPEG, PNG, GIF, WebP, selected audio/video formats, PDF, and text from file signatures or constrained text inspection.
- Require the filename extension, claimed MIME, and detected MIME to agree; unknown binary data is always `application/octet-stream` and rejected.
- Reject SVG, HTML, JavaScript, PHP, archives, JSON, and unsupported formats for all users, including administrators.
- Bound base64 input before decoding and use the same validator for local and OSS storage.
- Serve non-preview attachments with `Content-Disposition: attachment`, `nosniff`, and safe filename encoding.
- Open local files with `O_NOFOLLOW` and verify the descriptor is a regular file.

Evidence: `backend/services/file-security.js:3`, `backend/services/file-security.js:64`, `backend/services/file-security.js:98`, `backend/routes/assets.js:147`, `backend/routes/assets.js:241`, `backend/routes/assets.js:254`, `backend/routes/assets.js:514`, `backend/services/article-media.js:283`, `tests/security-hardening.test.js:15`.

Reference: [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

### SEC-02: Repository files exposed by the SPA fallback

Severity: High

Status: Fixed

The Nginx SPA fallback previously attempted `$uri` under `/var/www/tsukuyomi-space` before returning the frontend entry point. Because the repository itself is the document root, paths such as backend source, deployment scripts, package metadata, and Git metadata could be downloaded when the corresponding file existed.

Remediation:

- The generic SPA location now returns only the built frontend entry point.
- Public access is limited to the built frontend assets, intended media/model directories, two required Live2D runtime bundles, the favicon, and the web manifest.
- Backend, data, backup, deployment, documentation, dependency, source, test, and Git paths are explicitly rejected.

Evidence: `deploy/nginx.conf:185`, `deploy/nginx.conf:219`, `deploy/nginx.conf:247`, `deploy/nginx.conf:251`, `deploy/nginx.conf:277`, `tests/security-hardening.test.js:79`.

### SEC-03: MCP local file disclosure and subprocess secret exposure

Severity: High

Status: Fixed

The MCP bridge could receive a caller-selected local image path and the spawned process inherited the full Node.js environment. This could expose readable server files or unrelated production secrets to the MCP child process. The route also needed explicit authentication and concurrency control on a 2 GB host.

Remediation:

- Require an authenticated account for `/api/mcp/token-plan`.
- Accept only bounded raster image data or validated public HTTPS image URLs; caller-provided local paths are no longer used.
- Pin validated DNS answers for image downloads, revalidate each redirect, reject non-public address ranges, cap images at 5 MB, and create mode `0700` temporary directories with mode `0600` files.
- Spawn a fixed server-configured command with `shell: false`, a minimal environment, bounded stdout/stderr, a timeout, and process-group termination.
- Limit the bridge to one active process and a small route-specific rate limit.

Evidence: `backend/routes/mcp.js:12`, `backend/routes/mcp.js:13`, `backend/routes/mcp.js:107`, `backend/routes/mcp.js:163`, `backend/routes/mcp.js:188`, `backend/services/mcp-stdio.js:40`, `backend/services/mcp-stdio.js:46`, `backend/app.js:58`.

### SEC-04: Downstream GPT-SoVITS path traversal and unsafe model-loading boundary

Severity: High

Status: Fixed

GPT-SoVITS weight and reference-audio paths cross into a local model service that loads files and deserializes model weights. Allowing arbitrary absolute or traversing paths could expose local files or reach dangerous model-loading behavior if another write primitive existed.

Remediation:

- Allow only relative managed GPT `.ckpt`, SoVITS `.pth`, and audio resource paths.
- Reject absolute paths, schemes, empty components, traversal, unsupported roots, and unsupported extensions before contacting the model service.
- Serialize weight loading and synthesis, cap the queue, and clear cached weight state after an error so the next request reloads the service correctly.
- Bound TTS request text and response audio, reject redirects, and enforce timeouts.

Evidence: `backend/services/tts.js:12`, `backend/services/tts.js:88`, `backend/services/tts.js:115`, `backend/services/tts.js:129`, `backend/services/tts.js:235`, `backend/services/tts.js:292`, `backend/services/tts.js:330`, `tests/api.test.js:582`.

### SEC-05: SSRF through object-storage settings and MCP images

Severity: High

Status: Fixed with one low residual risk

Administrator-supplied object-storage endpoints and MCP image URLs could cause the server to contact attacker-selected destinations. That creates access to loopback services, cloud metadata endpoints, and internal networks.

Remediation:

- Require HTTPS in production unless a deliberate environment override is set.
- Reject credentials in URLs and block loopback, private, link-local, carrier-grade NAT, multicast, documentation, mapped IPv4, NAT64, 6to4, Teredo, and other non-unicast ranges.
- Resolve every DNS answer and reject the host if any answer is non-public.
- Restrict MiniMax API hosts to an exact allowlist and pin validated image-download DNS answers.
- Disable automatic redirects and bound object-storage list/proxy responses.

Evidence: `backend/services/outbound-url-security.js:5`, `backend/services/outbound-url-security.js:19`, `backend/services/outbound-url-security.js:39`, `backend/services/object-storage.js:67`, `backend/services/object-storage.js:83`, `backend/services/object-storage.js:417`, `backend/admin-routes.js:79`, `backend/admin-routes.js:556`, `backend/routes/mcp.js:55`, `tests/security-hardening.test.js:50`.

Residual risk: Node's object-storage `fetch` validates DNS immediately before the request but does not pin the validated answer. A hostile authoritative DNS server may attempt a narrow rebinding race. The MCP image downloader does pin DNS and is not affected. Replacing the object-storage transport with a pinned connection dispatcher would remove this residual risk.

Reference: [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

### SEC-06: CSRF and overly broad cross-origin trust

Severity: High

Status: Fixed

Cookie-authenticated write endpoints needed a uniform anti-CSRF boundary, and trusting arbitrary subdomains would let a compromised sibling origin make credentialed API calls.

Remediation:

- Build an exact origin allowlist from the configured public and OAuth origins; arbitrary `*.yachiyo.hk` origins are not trusted.
- Require `X-Requested-With: XMLHttpRequest` for unsafe cookie-authenticated or anonymous API writes.
- Reject cross-site Fetch Metadata and untrusted `Origin` headers.
- Keep bearer-token API clients exempt because possession of the token is the authorization proof.
- Add the required header to shared frontend requests and upload XHR clients.

Evidence: `backend/middleware/security.js:40`, `backend/middleware/security.js:55`, `backend/middleware/security.js:66`, `backend/app.js:41`, `src/frontend/api/client.js:120`, `src/frontend/pages/AttachmentsPage.vue:50`, `src/frontend/pages/EditorPage.vue:276`, `src/frontend/pages/GalleryPage.vue:82`, `tests/api.test.js:560`.

Reference: [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

### SEC-07: Memory exhaustion on the 2 GB host

Severity: High

Status: Fixed

Large JSON bodies, base64 expansion, unbounded upstream response buffering, and concurrent local model/MCP execution could exhaust the production host.

Remediation:

- Keep ordinary JSON at 1 MB and assign bounded limits only to media-aware routes.
- Check encoded and decoded upload sizes before allocation.
- Stream and cancel oversized object-storage and TTS responses instead of calling an unbounded `arrayBuffer()`.
- Bound MCP output, image size, tool concurrency, and request rate.
- Set a 300 MB PM2 restart ceiling and keep one forked API instance.

Evidence: `backend/app.js:23`, `backend/app.js:65`, `backend/app.js:69`, `backend/services/object-storage.js:6`, `backend/services/object-storage.js:417`, `backend/services/tts.js:12`, `backend/services/tts.js:95`, `backend/routes/mcp.js:188`, `deploy/ecosystem.config.cjs:26`.

### SEC-08: Overprivileged production process and public inner proxy

Severity: High

Status: Fixed in deployment configuration

The Node.js process previously ran as root, and the inner Nginx listener was reachable on all interfaces. An application-level compromise would therefore have had unnecessary host privileges and an alternate path around the public reverse proxy.

Remediation:

- Run the API as the system account `tsukuyomi` with group `www-data`.
- Grant write access only to the database/data, log, MCP home, and upload directories.
- Bind the inner Nginx listener to `127.0.0.1:3280` and preserve only the trusted outer proxy's client IP/protocol values.
- Build in CI or locally and deploy prebuilt artifacts; server-side dependency installation and builds are opt-in.
- Back up SQLite before each deployment and validate Nginx before replacing the live configuration.

Evidence: `deploy/ecosystem.config.cjs:23`, `deploy/deploy.sh:31`, `deploy/deploy.sh:59`, `deploy/deploy.sh:62`, `deploy/deploy.sh:66`, `deploy/deploy.sh:70`, `deploy/deploy.sh:80`, `deploy/deploy.sh:83`, `deploy/nginx.conf:2`, `.github/workflows/deploy.yml:19`, `.github/workflows/deploy.yml:27`.

Reference: [Express production performance and reliability](https://expressjs.com/en/advanced/best-practice-performance/)

### SEC-09: Stored XSS and active profile content

Severity: High

Status: Fixed by the baseline XSS hardening and extended here

The baseline hardening sanitizes rendered article HTML, safely serializes SSR JSON-LD, moderates malicious messages, and applies a restrictive CSP. This review additionally blocks SVG and other active upload formats, constrains avatars to small raster data URLs or short HTTPS URLs, and serves user uploads with `nosniff` and a sandbox CSP.

Evidence: `backend/utils/avatar.js:12`, `backend/user-routes.js:253`, `backend/user-routes.js:272`, `backend/services/file-security.js:98`, `deploy/nginx.conf:172`, `tests/html-sanitizer.test.js:1`, `tests/api.test.js:573`.

### SEC-10: SQL injection review

Severity: Informational

Status: No exploitable injection found

Request-derived values are passed through `better-sqlite3` placeholders. Dynamic query fragments are fixed server-side clauses, enum-selected sort expressions, or placeholder lists whose values remain bound parameters. Migration interpolation uses hard-coded table and column definitions rather than request data.

Representative evidence: `backend/repositories/article-repository.js:40`, `backend/repositories/asset-repository.js:32`, `backend/repositories/pixel-art-repository.js:53`, `backend/repositories/admin-repository.js:104`, `backend/db/migrations/007_add_article_content_metadata.js:1`.

Reference: [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)

### SEC-11: Race-condition review

Severity: Informational

Status: No cross-account race found; model race fixed

Likes and destructive multi-table operations use SQLite transactions, ownership is checked in every modifying query, and uploaded filenames use UUIDs. Local reads use no-follow file descriptors. The confirmed GPT-SoVITS shared-weight race is fixed by serializing weight loading and synthesis. A simultaneous double-delete can still cause one request to receive an error, but it does not cross an authorization boundary or delete an attacker-selected path.

### SEC-12: XXE and XML parsing review

Severity: Informational

Status: Not applicable to current request parsing

The application does not accept XML request bodies and has no XML parser configured for user input. OSS list responses are read with a 2 MB cap and extracted as text without entity resolution, so external entities are not evaluated. The regular-expression extraction is intentionally limited to the provider response schema and should be replaced by a hardened parser if richer XML handling is added later.

Reference: [OWASP XML External Entity Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html)

### SEC-13: JSONP review

Severity: Informational

Status: No JSONP endpoint found

No API reads a callback parameter or emits executable JavaScript responses. API responses remain JSON and CORS is handled centrally with an exact origin policy.

## Remaining operational actions

1. Rotate the JWT signing secret, administrator credentials, OAuth/SMTP credentials, Redis credentials, and external provider keys in a coordinated maintenance window. Secret values are intentionally omitted from this report. Rotating the JWT secret signs out all current sessions.
2. Remove `AUTH_COOKIE_DOMAIN=.yachiyo.hk` and use host-only cookies when cross-subdomain sessions are no longer required. A shared parent-domain cookie increases the impact of any future sibling-subdomain compromise.
3. Add asynchronous antivirus or content-disarm scanning if uploads expand beyond the current allowlist or become publicly writable at higher volume.
4. Add a pinned DNS dispatcher for object-storage requests to eliminate the remaining DNS rebinding window.
5. Keep the forensic upload snapshot and SQLite backup under root-only permissions according to the retention policy; do not publish the contained user metadata.

## Verification completed before release

- API/security suite: 55 tests passed in the final full run.
- Frontend suite: 12 tests passed.
- Playwright end-to-end suite: 5 user, article, plaza, pixel-art, and administrator flows passed.
- Dedicated upload/SSRF/Nginx tests: 6 tests passed.
- Root production dependency audit: 0 known vulnerabilities using the official npm registry.
- Backend production dependency audit: 0 known vulnerabilities using the official npm registry.
- Web, Live2D room bundle, and Live2D Studio production builds succeeded.
- `deploy/deploy.sh` passed `bash -n` under Git Bash.
- `git diff --check` passed.

Reference: [Express security best practices](https://expressjs.com/en/advanced/best-practice-security.html)
