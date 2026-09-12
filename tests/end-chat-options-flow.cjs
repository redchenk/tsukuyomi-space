/**
 * Verifies the "结束但不保存" path and the diary-text dismiss control:
 *   - ending without a diary writes NO diary entry
 *   - it deletes the memory records the session produced
 *   - it clears the transcript
 *   - opening the dialog is unaffected by the dismiss button
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const src = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const chat = src('src/frontend/composables/room/useRoomChat.js');
const panel = src('src/frontend/components/room/RoomChatPanel.vue');

let failures = 0;
function check(name, fn) {
    try { fn(); console.log('  PASS  ' + name); }
    catch (e) { failures += 1; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}

console.log('=== end without diary ===');

check('a dedicated no-diary action exists and is exported', () => {
    assert.match(chat, /function confirmEndChatWithoutDiary\(\)/);
    assert.match(chat, /confirmEndChatWithoutDiary,/);
});

check('the no-diary path never touches the diary archive', () => {
    const start = chat.indexOf('function confirmEndChatWithoutDiary()');
    const end = chat.indexOf('function closeEndChatDialog()');
    const body = chat.slice(start, end);
    assert.ok(body.length > 0, 'function body must be locatable');
    assert.doesNotMatch(body, /appendDiaryEntry/);
    assert.doesNotMatch(body, /generateDiaryEntry/);
    assert.doesNotMatch(body, /writeDiaryArchive/);
});

check('memory is only discarded on the no-diary path', () => {
    // confirmEndChat (with diary) keeps memories: startNewSession() default.
    const withDiary = chat.slice(chat.indexOf('async function confirmEndChat()'), chat.indexOf('function endChatErrorMessage'));
    assert.match(withDiary, /startNewSession\(\);/);
    assert.doesNotMatch(withDiary, /keepMemories: false/);

    const noDiary = chat.slice(chat.indexOf('function confirmEndChatWithoutDiary()'), chat.indexOf('function closeEndChatDialog()'));
    assert.match(noDiary, /startNewSession\(\{ keepMemories: false \}\)/);
});

check('discarding memories deletes the tracked records', () => {
    assert.match(chat, /const sessionMemoryIds = new Set\(\);/);
    assert.match(chat, /sessionMemoryIds\.add\(String\(result\.data\.id\)\)/);
    assert.match(chat, /async function discardSessionMemories\(\)/);
    assert.match(chat, /method: 'DELETE'/);
    assert.match(chat, /\/api\/room\/memory\/\$\{encodeURIComponent\(id\)\}/);
});

check('discarding tolerates a user with no server memory', () => {
    const start = chat.indexOf('async function discardSessionMemories()');
    const body = chat.slice(start, start + 900);
    assert.match(body, /try \{/);
    assert.match(body, /catch \(error\)/);
    assert.match(body, /return removed;/);
});

check('the transcript is cleared on both end paths', () => {
    const startNew = chat.slice(chat.indexOf('function startNewSession('), chat.indexOf('function openEndChatDialog()'));
    assert.match(startNew, /messages\.value = \[\];/);
    assert.match(startNew, /writeRoomConversation\(\[\]\);/);
});

check('a cancelled dialog saves nothing', () => {
    const body = chat.slice(chat.indexOf('function closeEndChatDialog()'), chat.indexOf('/** Dismisses only the generated diary text'));
    assert.doesNotMatch(body, /appendDiaryEntry|startNewSession|discardSessionMemories/);
});

console.log('\n=== dismiss the diary text ===');

check('a dismiss action exists and only clears the entry', () => {
    assert.match(chat, /function dismissDiaryText\(\)/);
    assert.match(chat, /dismissDiaryText,/);
    const body = chat.slice(chat.indexOf('function dismissDiaryText()'), chat.indexOf('function dismissDiaryText()') + 200);
    assert.match(body, /entry: null/);
    assert.doesNotMatch(body, /visible: false/);
    assert.doesNotMatch(body, /status: 'idle'/);
});

check('the x button lives on the centred overlay', () => {
    assert.match(panel, /class="diary-preview-close"/);
    assert.match(panel, /@click="chat\.dismissDiaryText\(\)"/);
    assert.match(panel, /aria-label="关闭日记"/);
    assert.match(panel, /class="diary-preview-card"/);
});

check('the dialog is still closable and offers both endings', () => {
    assert.match(panel, /chat\.closeEndChatDialog\(\)/);
    assert.match(panel, /结束但不保存/);
    assert.match(panel, /chat\.confirmEndChatWithoutDiary\(\)/);
});

console.log('\n=== fresh diary overlay ===');
const roomCss = src('assets/css/vue/pages/room.css');

check('the overlay is fixed, centred and above the room', () => {
    const block = roomCss.slice(roomCss.indexOf('.diary-preview-backdrop {'), roomCss.indexOf('.diary-preview-backdrop {') + 320);
    assert.match(block, /position: fixed;/);
    assert.match(block, /inset: 0;/);
    assert.match(block, /place-items: center;/);
    assert.match(block, /z-index: 120;/);
});

check('the card uses a comfortable reading width', () => {
    const block = roomCss.slice(roomCss.indexOf('.diary-preview-card {'), roomCss.indexOf('.diary-preview-card {') + 420);
    assert.match(block, /width: min\(46rem, 92vw\)/);
    assert.match(block, /max-height: min\(80vh, 46rem\)/);
});

check('the overlay is teleported out of the chat panel', () => {
    assert.match(panel, /<Teleport to="body">/);
    assert.match(panel, /v-if="diaryPreviewOpen"/);
});

check('only a finished entry opens the overlay', () => {
    assert.match(panel, /const diaryPreviewOpen = computed\(\(\) => Boolean\(endChat\.value\.entry\) && endChat\.value\.status === 'done'\)/);
    // Confirm/progress/error must render inside the panel instead.
    assert.match(panel, /v-if="endChat\.visible && !diaryPreviewOpen"/);
});

check('the overlay header shows the date, so the body strips it', () => {
    assert.match(panel, /const diaryPreviewText = computed/);
    assert.match(panel, /replace\(\/\^\\s\*【日记】\\s\*\/u, ''\)/);
    assert.match(panel, /replace\(\/\\s\*【日记书写时间为\[\^】\]\*】\\s\*\$\/u, ''\)/);
});

check('escape and the backdrop both close the overlay', () => {
    assert.match(panel, /function closePreviewOnEscape\(event\)/);
    assert.match(panel, /addEventListener\('keydown', closePreviewOnEscape\)/);
    assert.match(panel, /removeEventListener\('keydown', closePreviewOnEscape\)/);
    assert.match(panel, /@click\.self="chat\.dismissDiaryText\(\)"/);
});

check('the overlay can reopen the diary book', () => {
    assert.match(panel, /function openDiaryPanel\(\)/);
    assert.match(panel, /emit\('open-diary'\)/);
    assert.match(panel, /打开日记本/);
    const page = src('src/frontend/pages/RoomPage.vue');
    assert.match(page, /@open-diary="room\.panels\.openPanel\('diaryPanel'\)"/);
    const panels = src('src/frontend/composables/useRoomPanels.js');
    assert.match(panels, /function openPanel\(panelId\)/);
    assert.match(panels, /openPanel,/);
});

check('narrow screens make the overlay near full-screen', () => {
    const responsive = src('src/frontend/styles/responsive.css');
    const idx = responsive.indexOf('.diary-preview-card {', responsive.indexOf('.room-diary-panel {'));
    assert.ok(idx > -1, 'mobile overlay rule must exist');
    assert.match(responsive.slice(idx, idx + 220), /width: min\(100%, 46rem\)/);
});

console.log('\n=== panel sizing ===');

check('chat panel is one third of the page', () => {
    const block = roomCss.slice(roomCss.indexOf('.room-chat-panel {'), roomCss.indexOf('.room-chat-panel {') + 220);
    assert.match(block, /width: min\(33\.333vw/);
});
check('diary panel matches the chat panel', () => {
    const block = roomCss.slice(roomCss.indexOf('.room-diary-panel {'), roomCss.indexOf('.room-diary-panel {') + 260);
    assert.match(block, /width: min\(33\.333vw/);
});
check('diary body uses the extra space with a two-column layout', () => {
    const block = roomCss.slice(roomCss.indexOf('.diary-body {'), roomCss.indexOf('.diary-body {') + 400);
    assert.match(block, /grid-template-columns: minmax\(0, 0\.85fr\) minmax\(0, 1\.15fr\)/);
});
check('narrow screens collapse the diary to one column', () => {
    const responsive = src('src/frontend/styles/responsive.css');
    const block = responsive.slice(responsive.indexOf('.diary-body {', responsive.indexOf('.room-diary-panel {')));
    assert.match(block.slice(0, 300), /grid-template-columns: minmax\(0, 1fr\)/);
});

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
