<script setup>
import { useContentTranslationRefresh } from '../composables/useContentTranslationRefresh';
import { nameInitial } from '../utils/userName.mjs';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { apiFetch, authFetch, authHeaders, getSession, parseResponse } from '../api/client';
import PixelCanvasCells from '../components/PixelCanvasCells.vue';
import PixelColorPicker from '../components/PixelColorPicker.vue';
import moonHouseUrl from '../assets/pixel/moon-house.png';
import SocialShareDialog from '../components/SocialShareDialog.vue';
import TsIcon from '../components/TsIcon.vue';
import UserLevelBadge from '../components/UserLevelBadge.vue';
import { useUserLevels } from '../composables/useUserLevels';
import { formatDateTime } from '../utils/time';
import { applyGrowthResult } from '../services/userGrowth';

const props = defineProps({
  lang: { type: String, required: true },
  t: { type: Object, required: true }
});

const emit = defineEmits(['go']);

const CANVAS_PRESETS = [
  { width: 32, height: 18 },
  { width: 48, height: 27 },
  { width: 64, height: 36 },
  { width: 96, height: 54 },
  { width: 128, height: 72 },
  { width: 160, height: 90 },
  { width: 192, height: 108 }
];
const DEFAULT_CANVAS_PRESET = CANVAS_PRESETS[CANVAS_PRESETS.length - 1];
const PIXEL_GALLERY_PAGE_SIZE = 12;
const DISPLAY_CELL_SIZE = 6;
const EXPORT_CELL_SIZE = 8;
const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 20;
const MAX_ZOOM = 1200;
// Photoshop-style zoom stops for the +/- buttons and shortcuts.
const ZOOM_STOPS = [20, 25, 33, 50, 67, 100, 150, 200, 300, 400, 600, 800, 1200];
const MAX_BRUSH_SIZE = 8;
const MAX_CUSTOM_COLORS = 52;
const MAX_IMAGE_COLORS = 32;
const SIGN_IN_DRAFT_KEY = 'tsukuyomi-pixel-sign-in-draft-v1';
const PANEL_STATE_KEY = 'tsukuyomi-pixel-panels-v1';
const GESTURE_HINT_KEY = 'tsukuyomi-pixel-gesture-hint-v1';
// A second finger this soon after a touch stroke starts means "gesture", so
// the stroke is withdrawn instead of leaving a stray dot (Procreate-style).
const TOUCH_STROKE_GRACE_MS = 420;
const TWO_FINGER_TAP_MS = 280;
const PAINT_TOOLS = ['brush', 'eraser', 'fill'];
const presetPalette = [
  '#0b1020',
  '#ffffff',
  '#aef2ff',
  '#7b8cf6',
  '#a481ff',
  '#ff9aba',
  '#f1d98e',
  '#9ee2cf',
  '#263044',
  '#e85f9b',
  '#56bfe8',
  '#647086'
];
const studioColors = ['#273e61', '#496985', '#648da1', '#87a17b', '#cfb991', '#ffd286', '#172d41', '#31576b', '#7fa6ac', '#c99595', '#e6d79c', '#fff5cf'];
const backgroundPresets = ['#ffffff', '#f4f1ea', '#edf8ff', '#ffd1e8', '#172033', '#0b1020'];
const decodedArtworkPreviews = new WeakMap();
const fullArtworkCache = new Map();

const copy = computed(() => props.lang === 'en' ? {
  appName: 'Pixel Studio', pageTitle: 'Moonlit Pixel Workshop',
  draftTitle: 'Untitled artwork', renameArtwork: 'Rename and publish details',
  tools: 'Tools', toolOptions: 'Tool options',
  brush: 'Brush', eraser: 'Eraser', fill: 'Fill', picker: 'Eyedropper', move: 'Hand',
  brushSize: 'Size', pressure: 'Pen pressure', stabilizer: 'Smoothing',
  undo: 'Undo', redo: 'Redo', gallery: 'Community', newCanvas: 'New', imageImport: 'Import image', uploadImage: 'Convert an image to pixel art',
  download: 'Export PNG', share: 'Publish', saveUpdate: 'Save update', loginToShare: 'Sign in to publish', more: 'More',
  panels: 'Panels', showPanels: 'Show panels', hidePanels: 'Hide panels',
  colorPanel: 'Color', swatchesPanel: 'Swatches', brushPanel: 'Brush', navigatorPanel: 'Navigator', canvasPanel: 'Canvas', notesPanel: 'Notes', filePanel: 'File',
  presets: 'Preset colors', studioSet: 'Moonlit set', recent: 'Recent', savedColors: 'My colors', addColor: 'Add to swatches',
  colorLimit: 'The 64-color palette is full', freeColor: 'Custom color', currentColor: 'Foreground (brush color)', background: 'Background color',
  brushHint: 'Drag to paint · Alt to sample a color · [ ] change size', eraserHint: 'Drag to erase pixels. Undo restores mistakes.',
  fillHint: 'Click to fill the connected area of one color.', pickerHint: 'Click the canvas to sample a color, then return to your last tool.',
  moveHint: 'Drag to look around · hold Space anytime', gestureHint: 'One finger paints · two fingers zoom and pan · two-finger tap undoes',
  zoom: 'Zoom', fitCanvas: 'Fit on screen', actualPixels: '100%', grid: 'Pixel grid', focus: 'Focus mode', exitFocus: 'Exit focus mode',
  saving: 'Saving…', saved: 'Saved on this device', saveFailed: 'Not saved — export a backup', savedLocal: 'Draft saved on this device',
  canvasSize: 'Canvas size', newCanvasAction: 'New canvas…', example: 'Load moonlit house example', clear: 'Clear canvas',
  newTitle: 'New canvas', newHint: 'Your current drawing will be replaced. Export it first, or use Undo to restore it.', create: 'Create',
  publishDetails: 'Artwork details', draftPlaceholder: 'Artwork title', descPlaceholder: 'Leave a short note about this piece',
  exportHint: 'The PNG is generated on your device. On mobile, you can also long-press the preview to save it.', saveImage: 'Save PNG',
  latest: 'Latest', hot: 'Popular', refresh: 'Refresh', emptyGallery: 'No public artwork yet. The first moonlit piece can begin here.',
  loading: 'Syncing…', like: 'Like', liked: 'Liked', shareLink: 'Share', by: 'by', pager: 'Artwork pages', prevPage: 'Previous page', nextPage: 'Next page',
  close: 'Close', cancel: 'Cancel', publishOk: 'Artwork shared', updateOk: 'Artwork updated', publishFailed: 'Unable to share artwork',
  titleRequired: 'Give your artwork a title first', blankCanvas: 'The canvas is still empty', likedToast: 'Artwork liked', alreadyLiked: 'You already liked this artwork',
  imageConverted: 'Image converted to pixel art', imageLoadFailed: 'Unable to load image', imageTypeInvalid: 'Choose an image file',
  draftRestored: 'Your drawing is ready to continue.', editLoaded: 'Artwork loaded for editing', exampleTitle: 'Moonlit house',
  notesEmpty: 'Jot down ideas while you draw. Notes disappear when you leave this page.', messagePlaceholder: 'Write down an idea…', sendMessage: 'Add',
  shortcuts: 'Shortcuts & gestures', pixels: 'px'
} : props.lang === 'ja' ? {
  appName: 'ピクセルスタジオ', pageTitle: '月光ピクセル工房',
  draftTitle: '無題の作品', renameArtwork: '作品名と投稿情報',
  tools: 'ツール', toolOptions: 'ツールオプション',
  brush: 'ブラシ', eraser: '消しゴム', fill: '塗りつぶし', picker: 'スポイト', move: '手のひら',
  brushSize: 'サイズ', pressure: '筆圧', stabilizer: '手ぶれ補正',
  undo: '戻す', redo: '進む', gallery: 'みんなの作品', newCanvas: '新規', imageImport: '画像を読み込む', uploadImage: '画像をピクセル化',
  download: 'PNG書き出し', share: '投稿する', saveUpdate: '更新を保存', loginToShare: 'ログインして投稿', more: 'その他',
  panels: 'パネル', showPanels: 'パネルを表示', hidePanels: 'パネルを隠す',
  colorPanel: 'カラー', swatchesPanel: 'スウォッチ', brushPanel: 'ブラシ', navigatorPanel: 'ナビゲーター', canvasPanel: 'キャンバス', notesPanel: 'メモ', filePanel: 'ファイル',
  presets: 'プリセット', studioSet: '月光セット', recent: '最近の色', savedColors: 'マイカラー', addColor: 'スウォッチに追加',
  colorLimit: '64色パレットがいっぱいです', freeColor: '自由色', currentColor: '描画色（ブラシの色）', background: '背景色',
  brushHint: 'ドラッグで描画 · Alt でスポイト · [ ] でサイズ変更', eraserHint: 'ドラッグで消します。元に戻すで復元できます。',
  fillHint: 'クリックでつながった同じ色の範囲を塗ります。', pickerHint: 'キャンバスをクリックして色を取得し、前のツールに戻ります。',
  moveHint: 'ドラッグで表示を移動 · Space で一時切り替え', gestureHint: '1本指で描画 · 2本指で拡大と移動 · 2本指タップで戻す',
  zoom: 'ズーム', fitCanvas: '画面に合わせる', actualPixels: '100%', grid: 'ピクセルグリッド', focus: '集中モード', exitFocus: '集中モードを終了',
  saving: '保存中…', saved: 'この端末に保存済み', saveFailed: '保存できません。書き出して保管してください', savedLocal: '下書きをこの端末に保存しました',
  canvasSize: 'キャンバスサイズ', newCanvasAction: '新しいキャンバス…', example: '月光の家の見本を読み込む', clear: 'キャンバスを消去',
  newTitle: '新しいキャンバス', newHint: '現在の作品を置き換えます。先に書き出すか、元に戻すで復元できます。', create: '作成',
  publishDetails: '作品情報', draftPlaceholder: '作品名', descPlaceholder: 'ひとことメモ',
  exportHint: '画像はこの端末で生成されます。スマートフォンでは長押しでも保存できます。', saveImage: 'PNGを保存',
  latest: '新着', hot: '人気', refresh: '更新', emptyGallery: 'まだ作品はありません。最初の一枚を置いていきましょう。',
  loading: '同期中…', like: 'いいね', liked: 'いいね済み', shareLink: '共有', by: 'by', pager: '作品ページ', prevPage: '前のページ', nextPage: '次のページ',
  close: '閉じる', cancel: 'キャンセル', publishOk: '作品を共有しました', updateOk: '作品を更新しました', publishFailed: '共有に失敗しました',
  titleRequired: '作品名を入れてください', blankCanvas: 'キャンバスはまだ空です', likedToast: 'いいねしました', alreadyLiked: 'すでにいいねしています',
  imageConverted: '画像をピクセル画に変換しました', imageLoadFailed: '画像を読み込めませんでした', imageTypeInvalid: '画像ファイルを選んでください',
  draftRestored: '描きかけの作品を復元しました。', editLoaded: '編集用に読み込みました', exampleTitle: '月光の家',
  notesEmpty: '描きながらアイデアをメモできます。この画面を離れると消えます。', messagePlaceholder: 'アイデアをメモする…', sendMessage: '追加',
  shortcuts: 'ショートカットとジェスチャー', pixels: 'px'
} : {
  appName: '像素工坊', pageTitle: '月光像素工坊',
  draftTitle: '未命名作品', renameArtwork: '修改作品名和发布信息',
  tools: '工具', toolOptions: '工具选项',
  brush: '画笔', eraser: '橡皮', fill: '填充', picker: '吸管', move: '移动',
  brushSize: '大小', pressure: '笔压', stabilizer: '防抖',
  undo: '撤销', redo: '重做', gallery: '大家的作品', newCanvas: '新建', imageImport: '导入图片', uploadImage: '上传图片转像素画',
  download: '导出 PNG', share: '发布作品', saveUpdate: '保存更新', loginToShare: '登录后发布', more: '更多',
  panels: '面板', showPanels: '显示面板', hidePanels: '隐藏面板',
  colorPanel: '颜色', swatchesPanel: '色板', brushPanel: '画笔', navigatorPanel: '导航器', canvasPanel: '画布', notesPanel: '便签', filePanel: '文件',
  presets: '预设色', studioSet: '月光色组', recent: '最近使用', savedColors: '我的颜色', addColor: '存入色板',
  colorLimit: '64 色调色板已满', freeColor: '自由颜色', currentColor: '前景色（画笔颜色）', background: '背景色',
  brushHint: '拖动绘制 · 按住 Alt 临时吸色 · [ ] 调整大小', eraserHint: '拖动擦除像素，擦错可以撤销。',
  fillHint: '点一下，填充相连的同色区域。', pickerHint: '点画布吸取颜色，取完自动回到上一个工具。',
  moveHint: '拖动查看画布 · 随时按住空格临时切换', gestureHint: '单指绘画 · 双指缩放和移动 · 双指轻点撤销',
  zoom: '缩放', fitCanvas: '适应屏幕', actualPixels: '100%', grid: '像素网格', focus: '专注模式', exitFocus: '退出专注',
  saving: '正在保存…', saved: '已保存在本机', saveFailed: '草稿未保存，请导出备份', savedLocal: '草稿已保存到本机',
  canvasSize: '画布尺寸', newCanvasAction: '新建画布…', example: '载入月光小屋示例', clear: '清空画布',
  newTitle: '新建画布', newHint: '新建将替换当前画面，请先导出保存；也可通过撤销找回。', create: '创建',
  publishDetails: '作品信息', draftPlaceholder: '作品名', descPlaceholder: '给这幅画留一句话',
  exportHint: 'PNG 已在当前设备生成，手机也可长按预览保存图片。', saveImage: '保存 PNG',
  latest: '最新', hot: '热门', refresh: '刷新', emptyGallery: '还没有公开作品。第一幅月光像素画可以从这里开始。',
  loading: '同步中…', like: '点赞', liked: '已赞', shareLink: '分享', by: 'by', pager: '作品分页', prevPage: '上一页', nextPage: '下一页',
  close: '关闭', cancel: '取消', publishOk: '作品已分享', updateOk: '作品已更新', publishFailed: '分享失败',
  titleRequired: '请先给作品取个名字', blankCanvas: '画布还是空的', likedToast: '已点赞', alreadyLiked: '已经点过赞了',
  imageConverted: '图片已转换为像素画', imageLoadFailed: '图片读取失败', imageTypeInvalid: '请上传图片文件',
  draftRestored: '已恢复画画草稿，可以继续创作。', editLoaded: '已载入像素画，可以继续编辑', exampleTitle: '月光小屋',
  notesEmpty: '可以临时记下灵感；离开页面后便签会消失。', messagePlaceholder: '记下这幅画的灵感…', sendMessage: '添加',
  shortcuts: '快捷键与手势', pixels: 'px'
});

const shortcutRows = computed(() => {
  const c = copy.value;
  return [
    [c.brush, 'B'], [c.eraser, 'E'], [c.fill, 'G'], [c.picker, 'I · Alt'], [c.move, 'H · Space'],
    [c.brushSize, '[  ]'], [c.undo, 'Ctrl Z'], [c.redo, 'Ctrl Shift Z'],
    [c.fitCanvas, 'Ctrl 0'], [c.actualPixels, 'Ctrl 1'], [c.zoom, 'Ctrl + / −'], [c.grid, "'"], [c.focus, 'F']
  ];
});

const session = ref(getSession());
const selectedColor = ref(presetPalette[3]);
const customColor = ref('#ff5f96');
const customColors = ref([]);
const backgroundColor = ref('#ffffff');
const tool = ref('brush');
const previousPaintTool = ref('brush');
const isDrawing = ref(false);
const canvasWidth = ref(DEFAULT_CANVAS_PRESET.width);
const canvasHeight = ref(DEFAULT_CANVAS_PRESET.height);
const pixels = ref(blankPixels(DEFAULT_CANVAS_PRESET.width, DEFAULT_CANVAS_PRESET.height));
const brushSize = ref(1);
const pressureEnabled = ref(true);
const stabilizerEnabled = ref(true);
const zoom = ref(DEFAULT_ZOOM);
const canvasViewportRef = ref(null);
const canvasWorldRef = ref(null);
const canvasSurfaceRef = ref(null);
const navigatorRef = ref(null);
const isCanvasZoomManual = ref(false);
const isSpacePanning = ref(false);
const isAltPicking = ref(false);
const isPanningView = ref(false);
const panelsOpen = ref(typeof window !== 'undefined' && window.matchMedia('(min-width: 1101px)').matches);
const isMobileLayout = ref(typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
const sheet = ref('');
// Keeps the last sheet's content rendered while the sheet slides away.
const sheetPanel = ref('color');
const sheetDragOffset = ref(0);
// Lifts the artwork above an open phone sheet so color and brush changes stay visible.
const sheetShift = ref(0);
const galleryOpen = ref(false);
const isPublishing = ref(false);
const showGrid = ref(false);
const focusMode = ref(false);
watch(focusMode, value => { document.documentElement.classList.toggle('pixel-focus-mode', value); });
onBeforeUnmount(() => document.documentElement.classList.remove('pixel-focus-mode'));
const pickPulse = ref(0);
const gestureHintVisible = ref(false);
const collapsedPanels = reactive({ color: false, swatches: false, brush: false, navigator: false, canvas: true, notes: true });
const viewRect = reactive({ left: 0, top: 0, width: 1, height: 1 });
const publishDialogRef = ref(null);
const galleryDialogRef = ref(null);
const newDialogRef = ref(null);
const exportDialogRef = ref(null);
const shortcutsDialogRef = ref(null);
const exportPreview = ref('');
const exportFilename = ref('');
const newSize = ref('192x108');
const coordinates = ref(null);
const hoverPointerType = ref('mouse');
const recentColors = ref([]);
const draftSaved = ref(false);
const draftSaveFailed = ref(false);
const draftOwner = session.value?.user?.id || 'guest';
const localDraftKey = `tsukuyomi-pixel-draft-v2:${draftOwner}`;
let draftTimer = 0;
let previewFromGallery = false;

const toolOptions = computed(() => [
  { key: 'brush', icon: 'brush', label: copy.value.brush, shortcut: 'B' },
  { key: 'eraser', icon: 'eraser', label: copy.value.eraser, shortcut: 'E' },
  { key: 'fill', icon: 'paintBucket', label: copy.value.fill, shortcut: 'G' },
  { key: 'picker', icon: 'pipette', label: copy.value.picker, shortcut: 'I' },
  { key: 'move', icon: 'hand', label: copy.value.move, shortcut: 'H' }
]);
const sheetTabs = computed(() => [
  { key: 'color', icon: 'palette', label: copy.value.colorPanel },
  { key: 'brush', icon: 'sliders', label: copy.value.brushPanel },
  { key: 'canvas', icon: 'grid', label: copy.value.canvasPanel },
  { key: 'file', icon: 'layers', label: copy.value.filePanel }
]);
const chatMessage = ref('');
const chatMessages = ref([]);
const undoStack = ref([]);
const redoStack = ref([]);
const form = reactive({
  title: '',
  description: ''
});
const gallery = reactive({
  items: [],
  loading: true,
  error: '',
  sort: 'latest',
  page: 1,
  total: 0,
  totalPages: 1
});
const editingArtwork = ref(null);
const previewArtwork = ref(null);
const artworkShareOpen = ref(false);
const artworkSharePayload = ref({ title: '', text: '', url: '', imageUrl: '', downloadUrl: '', downloadName: '' });
const { hydrateUserLevels, userLevel } = useUserLevels();
const toast = reactive({
  text: '',
  type: 'success',
  visible: false
});
const pixelCanvasRef = ref(null);
const titleInputRef = ref(null);
const customColorInputRef = ref(null);

let toastTimer = 0;
let activePaintColorIndex = -1;
let canvasPanState = null;
let viewportPan = null;
let canvasFitObserver = null;
let canvasFitFrame = 0;
let viewRectFrame = 0;
let strokePixels = null;
let isPicking = false;
let touchStrokeGuard = null;
let pinch = null;
let sheetDrag = null;
let navigatorDrag = false;
let gestureHintTimer = 0;
const touchPoints = new Map();
const mediaQueries = [];

const isAuthed = computed(() => Boolean(session.value));
const activeTool = computed(() => {
  if (isSpacePanning.value) return 'move';
  if (isAltPicking.value && PAINT_TOOLS.includes(tool.value)) return 'picker';
  return tool.value;
});
const activeToolOption = computed(() => toolOptions.value.find(item => item.key === activeTool.value) || toolOptions.value[0]);
const activePalette = computed(() => [...presetPalette, ...customColors.value]);
const paintedCount = computed(() => pixels.value.filter(index => index >= 0).length);
const hasUndo = computed(() => undoStack.value.length > 0);
const hasRedo = computed(() => redoStack.value.length > 0);
const canvasBaseWidth = computed(() => canvasWidth.value * DISPLAY_CELL_SIZE);
const canvasBaseHeight = computed(() => canvasHeight.value * DISPLAY_CELL_SIZE);
const canvasZoomScale = computed(() => zoom.value / 100);
const canvasZoomWidth = computed(() => Math.round(canvasBaseWidth.value * canvasZoomScale.value));
const canvasZoomHeight = computed(() => Math.round(canvasBaseHeight.value * canvasZoomScale.value));
const cellScreenSize = computed(() => canvasZoomWidth.value / canvasWidth.value);
const canvasSurfaceStyle = computed(() => ({
  width: `${canvasZoomWidth.value}px`,
  height: `${canvasZoomHeight.value}px`
}));
const canvasStyle = computed(() => ({
  width: `${canvasZoomWidth.value}px`,
  height: `${canvasZoomHeight.value}px`,
  backgroundColor: backgroundColor.value
}));
const gridVisible = computed(() => showGrid.value && cellScreenSize.value >= 4);
const gridStyle = computed(() => ({ '--ps-cell': `${cellScreenSize.value}px` }));
const brushCursorStyle = computed(() => {
  if (!coordinates.value || hoverPointerType.value === 'touch' || isPanningView.value) return null;
  if (!['brush', 'eraser'].includes(activeTool.value)) return null;
  const size = Math.max(1, Math.min(MAX_BRUSH_SIZE, brushSize.value));
  const start = Math.floor((size - 1) / 2);
  const cell = cellScreenSize.value;
  return {
    left: `${(coordinates.value.x - start) * cell}px`,
    top: `${(coordinates.value.y - start) * cell}px`,
    width: `${size * cell}px`,
    height: `${size * cell}px`
  };
});
const brushDotStyle = computed(() => ({ '--ps-dot': `${brushSize.value * DISPLAY_CELL_SIZE}px`, '--ps-dock-dot': `${4 + brushSize.value * 2}px` }));
const publishButtonText = computed(() => {
  if (!isAuthed.value) return copy.value.loginToShare;
  return editingArtwork.value ? copy.value.saveUpdate : copy.value.share;
});
const toolHint = computed(() => ({
  brush: copy.value.brushHint,
  eraser: copy.value.eraserHint,
  fill: copy.value.fillHint,
  picker: copy.value.pickerHint,
  move: copy.value.moveHint
})[activeTool.value] || copy.value.brushHint);
const saveStateText = computed(() => draftSaveFailed.value ? copy.value.saveFailed : draftSaved.value ? copy.value.saved : copy.value.saving);
const saveState = computed(() => draftSaveFailed.value ? 'is-failed' : draftSaved.value ? 'is-saved' : 'is-saving');
const panelsVisible = computed(() => isMobileLayout.value ? Boolean(sheet.value) : panelsOpen.value && !focusMode.value);
const navigatorStyle = computed(() => ({
  left: `${viewRect.left * 100}%`,
  top: `${viewRect.top * 100}%`,
  width: `${viewRect.width * 100}%`,
  height: `${viewRect.height * 100}%`
}));
const studioClasses = computed(() => ({
  'is-panels-open': panelsOpen.value && !focusMode.value,
  'is-focus-mode': focusMode.value,
  'is-sheet-open': isMobileLayout.value && Boolean(sheet.value),
  'is-panning': isPanningView.value,
  [`is-tool-${activeTool.value}`]: true
}));
const sheetStyle = computed(() => sheetDragOffset.value ? { transform: `translateY(${sheetDragOffset.value}px)`, transition: 'none' } : null);
const worldStyle = computed(() => sheetShift.value ? { transform: `translateY(${-sheetShift.value}px)` } : null);

function go(path) {
  emit('go', path);
}

function setTool(key) {
  if (!toolOptions.value.some(item => item.key === key)) return;
  if (PAINT_TOOLS.includes(key)) previousPaintTool.value = key;
  tool.value = key;
}

function togglePanels() {
  if (focusMode.value) focusMode.value = false;
  panelsOpen.value = !panelsOpen.value;
}

function openSheet(name) {
  if (!isMobileLayout.value) {
    panelsOpen.value = true;
    focusMode.value = false;
    return;
  }
  sheet.value = sheet.value === name ? '' : name;
}

function closeSheet() {
  sheet.value = '';
  sheetDragOffset.value = 0;
}

async function revealPanel(name) {
  if (isMobileLayout.value) {
    sheet.value = name === 'swatches' ? 'color' : name === 'navigator' ? 'canvas' : name;
    return;
  }
  focusMode.value = false;
  panelsOpen.value = true;
  collapsedPanels[name] = false;
  await nextTick();
  document.getElementById(`ps-panel-${name}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function updateSheetShift() {
  const panel = document.getElementById('arena-controls-panel');
  const surface = canvasSurfaceRef.value;
  const viewport = canvasViewportRef.value;
  if (!isMobileLayout.value || !sheet.value || !panel || !surface || !viewport) { sheetShift.value = 0; return; }
  const viewRect = viewport.getBoundingClientRect();
  // Measure from the sheet's resting position: it may still be sliding in.
  const host = panel.offsetParent || panel.parentElement;
  const sheetTop = host.getBoundingClientRect().bottom - panel.offsetHeight;
  const surfaceRect = surface.getBoundingClientRect();
  const restingTop = surfaceRect.top + sheetShift.value;
  const height = Math.min(surfaceRect.height, viewRect.height);
  const visibleTop = viewRect.top + 10;
  const available = sheetTop - 14 - visibleTop;
  const targetTop = available >= height ? visibleTop + (available - height) / 2 : visibleTop;
  sheetShift.value = Math.max(0, Math.round(restingTop - targetTop));
}

function toggleCollapsed(name) {
  collapsedPanels[name] = !collapsedPanels[name];
  try { localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(collapsedPanels)); } catch (_) { /* Storage can be unavailable. */ }
}

function restorePanelState() {
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_STATE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return;
    for (const key of Object.keys(collapsedPanels)) if (typeof saved[key] === 'boolean') collapsedPanels[key] = saved[key];
  } catch (_) { /* Ignore damaged panel preferences. */ }
}

function startSheetDrag(event) {
  if (event.target.closest('button')) return;
  sheetDrag = { id: event.pointerId, y: event.clientY };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function moveSheetDrag(event) {
  if (!sheetDrag || sheetDrag.id !== event.pointerId) return;
  sheetDragOffset.value = Math.max(0, event.clientY - sheetDrag.y);
}

function endSheetDrag(event) {
  if (!sheetDrag || sheetDrag.id !== event.pointerId) return;
  const offset = sheetDragOffset.value;
  sheetDrag = null;
  sheetDragOffset.value = 0;
  if (offset > 72) closeSheet();
}

function toggleGalleryPanel() {
  if (galleryDialogRef.value?.open) galleryDialogRef.value.close();
  else { closeSheet(); galleryOpen.value = true; galleryDialogRef.value?.showModal(); }
}

async function preparePublish() {
  closeSheet();
  publishDialogRef.value?.showModal();
  await nextTick();
  titleInputRef.value?.focus({ preventScroll: true });
}

function openNewDialog() {
  closeSheet();
  newSize.value = canvasPresetKey(canvasWidth.value, canvasHeight.value);
  newDialogRef.value?.showModal();
}

function openShortcuts() {
  shortcutsDialogRef.value?.showModal();
}

function toggleFocus() {
  focusMode.value = !focusMode.value;
  closeSheet();
  scheduleCanvasFit();
}

function chooseColor(color) {
  if (!/^#[\da-f]{6}$/i.test(color)) return;
  const normalized = color.toLowerCase();
  selectedColor.value = normalized;
  customColor.value = normalized;
  recentColors.value = [normalized, ...recentColors.value.filter(c => c !== normalized)].slice(0, 8);
}

function saveSelectedColor() {
  addCustomColor(selectedColor.value);
}

function trackCoordinates(event) {
  const canvas = pixelCanvasRef.value?.$el;
  if (!canvas) return;
  hoverPointerType.value = event.pointerType || 'mouse';
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / rect.width * canvasWidth.value);
  const y = Math.floor((event.clientY - rect.top) / rect.height * canvasHeight.value);
  const inside = x >= 0 && x < canvasWidth.value && y >= 0 && y < canvasHeight.value;
  if (!inside) { coordinates.value = null; return; }
  if (coordinates.value?.x !== x || coordinates.value?.y !== y) coordinates.value = { x, y };
}

function clearHover() {
  coordinates.value = null;
}

function createCanvas() {
  const [width, height] = newSize.value.split('x').map(Number);
  if (!findCanvasPreset(width, height)) return;
  endPaint();
  pushHistory();
  canvasWidth.value = width;
  canvasHeight.value = height;
  pixels.value = blankPixels(width, height);
  editingArtwork.value = null;
  form.title = ''; form.description = '';
  setTool('brush');
  newDialogRef.value?.close();
  resetCanvasZoom();
}

function saveLocalDraft() {
  clearTimeout(draftTimer);
  // Never move another signed-in user's draft into the current account.
  if ((getSession()?.user?.id || 'guest') !== draftOwner) return;
  try {
    localStorage.setItem(localDraftKey, JSON.stringify({ snapshot: currentSnapshot(), title: form.title,
      description: form.description, brushSize: brushSize.value, artworkId: editingArtwork.value?.id || null }));
    draftSaved.value = true; draftSaveFailed.value = false;
  } catch (_) { draftSaved.value = false; draftSaveFailed.value = true; }
}

function restoreLocalDraft() {
  if (new URLSearchParams(location.search).has('edit')) return;
  try {
    const raw = localStorage.getItem(localDraftKey);
    if (!raw || raw.length > 400000) return;
    const draft = JSON.parse(raw), snapshot = draft?.snapshot;
    if (!findCanvasPreset(snapshot?.width, snapshot?.height)
      || !Array.isArray(snapshot.pixels) || snapshot.pixels.length !== snapshot.width * snapshot.height
      || !Array.isArray(snapshot.customColors) || snapshot.customColors.length > MAX_CUSTOM_COLORS
      || snapshot.customColors.some(c => !/^#[\da-f]{6}$/i.test(c))
      || snapshot.pixels.some(i => !Number.isInteger(i) || i < -1 || i >= presetPalette.length + snapshot.customColors.length)) return;
    restoreSnapshot(snapshot);
    form.title = String(draft.title || '').slice(0, 40);
    form.description = String(draft.description || '').slice(0, 120);
    brushSize.value = clampBrushSize(draft.brushSize);
    // A local drawing is a draft, not authorization to update an existing post.
    editingArtwork.value = null;
    draftSaved.value = true;
  } catch (_) { /* Ignore damaged or unavailable browser storage. */ }
}

function showToast(text, type = 'success') {
  toast.text = text;
  toast.type = type;
  toast.visible = true;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.visible = false;
  }, 2200);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(props.lang === 'en' ? 'en-US' : (props.lang === 'ja' ? 'ja-JP' : 'zh-CN'));
}

function formatDate(value) {
  if (!value) return '';
  return formatDateTime(value, props.lang === 'en' ? 'en-US' : (props.lang === 'ja' ? 'ja-JP' : 'zh-CN'));
}

function normalizeHexColor(value, fallback = '#0b1020') {
  const color = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function clampBrushSize(value) {
  return Math.max(1, Math.min(MAX_BRUSH_SIZE, Math.round(Number(value) || 1)));
}

function setBrushSize(value) {
  brushSize.value = clampBrushSize(value);
}

function addCustomColor(color = customColor.value) {
  const normalized = normalizeHexColor(color, customColor.value);
  selectedColor.value = normalized;
  customColor.value = normalized;
  if (presetPalette.includes(normalized) || customColors.value.includes(normalized)) {
    return activePalette.value.indexOf(normalized);
  }
  if (customColors.value.length >= MAX_CUSTOM_COLORS) {
    const fallbackColor = activePalette.value[activePalette.value.length - 1] || presetPalette[3];
    selectedColor.value = fallbackColor;
    customColor.value = fallbackColor;
    showToast(copy.value.colorLimit, 'error');
    return activePalette.value.indexOf(fallbackColor);
  }
  customColors.value = [...customColors.value, normalized];
  return activePalette.value.indexOf(normalized);
}

function ensurePaletteColor(color) {
  const normalized = normalizeHexColor(color, presetPalette[3]);
  const existing = activePalette.value.indexOf(normalized);
  return existing >= 0 ? existing : addCustomColor(normalized);
}

function setBackgroundColor(color) {
  const nextColor = normalizeHexColor(color, '#ffffff');
  if (nextColor === backgroundColor.value) return;
  endPaint();
  pushHistory();
  backgroundColor.value = nextColor;
}

function sendLocalMessage() {
  const text = chatMessage.value.trim();
  if (!text) return;
  chatMessages.value.push({
    id: Date.now(),
    time: new Date().toLocaleTimeString(props.lang === 'en' ? 'en-US' : (props.lang === 'ja' ? 'ja-JP' : 'zh-CN'), { hour: '2-digit', minute: '2-digit' }),
    text
  });
  chatMessage.value = '';
}

function canvasPresetKey(width, height) {
  return `${Number(width)}x${Number(height)}`;
}

function findCanvasPreset(width, height) {
  const key = canvasPresetKey(width, height);
  return CANVAS_PRESETS.find(preset => canvasPresetKey(preset.width, preset.height) === key) || null;
}

function artworkDimension(value, fallback) {
  const dimension = Number.parseInt(value, 10);
  return Number.isFinite(dimension) && dimension > 0 ? dimension : fallback;
}

function artworkWidth(artwork) {
  return artworkDimension(artwork?.width || artwork?.size, DEFAULT_CANVAS_PRESET.width);
}

function artworkHeight(artwork) {
  return artworkDimension(artwork?.height || artwork?.size, DEFAULT_CANVAS_PRESET.height);
}

function artworkPreviewWidth(artwork) {
  return artworkDimension(artwork?.preview_width, artworkWidth(artwork));
}

function artworkPreviewHeight(artwork) {
  return artworkDimension(artwork?.preview_height, artworkHeight(artwork));
}

function blankPixels(width = canvasWidth.value, height = canvasHeight.value) {
  return Array(width * height).fill(-1);
}

function commitStrokePixels() {
  if (!strokePixels) return;
  pixels.value = [...strokePixels];
}

function flushStrokeCommit() {
  commitStrokePixels();
}

function discardStrokeBuffer() {
  strokePixels = null;
}

function draftPixelsSnapshot() {
  return strokePixels ? [...strokePixels] : [...pixels.value];
}

function currentSnapshot() {
  return {
    width: canvasWidth.value,
    height: canvasHeight.value,
    pixels: draftPixelsSnapshot(),
    customColors: [...customColors.value],
    selectedColor: selectedColor.value,
    customColor: customColor.value,
    backgroundColor: backgroundColor.value
  };
}

function saveDraftForSignIn() {
  try {
    window.sessionStorage.setItem(SIGN_IN_DRAFT_KEY, JSON.stringify({
      snapshot: currentSnapshot(),
      title: form.title,
      description: form.description,
      brushSize: brushSize.value
    }));
  } catch (_) {
    // Browsers can disable session storage; painting still works in this tab.
  }
}

function restoreDraftAfterSignIn() {
  if (new URLSearchParams(location.search).has('edit')) return;
  try {
    const saved = window.sessionStorage.getItem(SIGN_IN_DRAFT_KEY);
    if (!saved) return;
    const draft = JSON.parse(saved);
    const snapshot = draft?.snapshot;
    const width = Number(snapshot?.width);
    const height = Number(snapshot?.height);
    if (!findCanvasPreset(width, height) || !Array.isArray(snapshot?.pixels)
      || snapshot.pixels.length !== width * height) {
      window.sessionStorage.removeItem(SIGN_IN_DRAFT_KEY);
      return;
    }
    restoreSnapshot(snapshot);
    form.title = String(draft.title || '').slice(0, 40);
    form.description = String(draft.description || '').slice(0, 120);
    brushSize.value = clampBrushSize(draft.brushSize);
    window.sessionStorage.removeItem(SIGN_IN_DRAFT_KEY);
    showToast(copy.value.draftRestored);
  } catch (_) {
    // Ignore damaged drafts instead of blocking the workspace.
  }
}

function restoreSnapshot(snapshot) {
  if (!snapshot) return;
  discardStrokeBuffer();
  const nextPreset = findCanvasPreset(snapshot.width || snapshot.size, snapshot.height || snapshot.size) || DEFAULT_CANVAS_PRESET;
  canvasWidth.value = nextPreset.width;
  canvasHeight.value = nextPreset.height;
  customColors.value = Array.isArray(snapshot.customColors) ? [...snapshot.customColors] : [];
  selectedColor.value = normalizeHexColor(snapshot.selectedColor, presetPalette[3]);
  customColor.value = normalizeHexColor(snapshot.customColor, selectedColor.value);
  backgroundColor.value = normalizeHexColor(snapshot.backgroundColor, '#ffffff');
  pixels.value = Array.isArray(snapshot.pixels) && snapshot.pixels.length === nextPreset.width * nextPreset.height
    ? [...snapshot.pixels]
    : blankPixels(nextPreset.width, nextPreset.height);
}

function loadArtworkIntoDraft(artwork) {
  discardStrokeBuffer();
  const width = artworkWidth(artwork);
  const height = artworkHeight(artwork);
  const nextPreset = findCanvasPreset(width, height) || DEFAULT_CANVAS_PRESET;
  const palette = Array.isArray(artwork.palette) && artwork.palette.length ? artwork.palette.map(color => normalizeHexColor(color, presetPalette[3])) : presetPalette;
  const nextCustomColors = [...new Set(palette.filter(color => !presetPalette.includes(color)))].slice(0, MAX_CUSTOM_COLORS);
  const nextPalette = [...presetPalette, ...nextCustomColors];
  const sourcePixels = Array.isArray(artwork.pixels) && artwork.pixels.length === nextPreset.width * nextPreset.height
    ? artwork.pixels
    : blankPixels(nextPreset.width, nextPreset.height);
  const remappedPixels = sourcePixels.map((colorIndex) => {
    const sourceIndex = Number(colorIndex);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) return -1;
    const color = palette[sourceIndex];
    if (!color) return -1;
    const exactIndex = nextPalette.indexOf(color);
    return exactIndex >= 0 ? exactIndex : nearestPaletteIndex(color, nextPalette);
  });
  canvasWidth.value = nextPreset.width;
  canvasHeight.value = nextPreset.height;
  backgroundColor.value = normalizeHexColor(artwork.background_color || artwork.backgroundColor, '#ffffff');
  customColors.value = nextCustomColors;
  selectedColor.value = nextPalette.find(color => color !== presetPalette[0]) || presetPalette[3];
  customColor.value = selectedColor.value;
  pixels.value = remappedPixels;
  form.title = artwork.title || '';
  form.description = artwork.description || '';
  undoStack.value = [];
  redoStack.value = [];
  editingArtwork.value = artwork;
}

function pushHistory() {
  undoStack.value.push(currentSnapshot());
  if (undoStack.value.length > 50) undoStack.value.shift();
  redoStack.value = [];
}

/* ---------- View: zoom, fit, pan and navigator ---------- */

function clampZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value)));
}

function worldPadding() {
  const world = canvasWorldRef.value;
  if (!world) return { x: 0, y: 0 };
  const style = window.getComputedStyle(world);
  return {
    x: (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0),
    y: (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
  };
}

function fitCanvasToViewport(force = false) {
  if (!force && isCanvasZoomManual.value) return;
  const viewport = canvasViewportRef.value;
  if (!viewport || !canvasBaseWidth.value || !canvasBaseHeight.value) return;
  const padding = worldPadding();
  const width = viewport.clientWidth - padding.x;
  const height = viewport.clientHeight - padding.y;
  if (width <= 0 || height <= 0) return;
  const scale = Math.min(width / canvasBaseWidth.value, height / canvasBaseHeight.value);
  const fittedZoom = clampZoom(Math.floor((scale * 100) / 5) * 5);
  if (Number.isFinite(fittedZoom) && Math.abs(fittedZoom - zoom.value) >= 1) {
    zoom.value = fittedZoom;
  }
  nextTick(() => {
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
    updateViewRect();
  });
}

function scheduleCanvasFit(force = false) {
  if (canvasFitFrame) window.cancelAnimationFrame(canvasFitFrame);
  canvasFitFrame = window.requestAnimationFrame(() => {
    canvasFitFrame = 0;
    fitCanvasToViewport(force);
  });
}

function handleCanvasViewportResize() {
  scheduleCanvasFit();
  scheduleViewRect();
}

function surfaceFraction(clientX, clientY) {
  const surface = canvasSurfaceRef.value;
  if (!surface) return null;
  const rect = surface.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return { fx: (clientX - rect.left) / rect.width, fy: (clientY - rect.top) / rect.height };
}

// Scroll so that a point of the artwork (as a fraction of its size) sits under a screen point.
function placeFraction(fx, fy, clientX, clientY) {
  const viewport = canvasViewportRef.value;
  const surface = canvasSurfaceRef.value;
  if (!viewport || !surface) return;
  const rect = surface.getBoundingClientRect();
  viewport.scrollLeft += rect.left + fx * rect.width - clientX;
  viewport.scrollTop += rect.top + fy * rect.height - clientY;
  scheduleViewRect();
}

function viewportCenter() {
  const rect = canvasViewportRef.value?.getBoundingClientRect();
  return rect ? { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 } : { clientX: 0, clientY: 0 };
}

function zoomTo(value, anchor = null) {
  const next = clampZoom(value);
  isCanvasZoomManual.value = true;
  if (next === zoom.value) return;
  const point = anchor || viewportCenter();
  const fraction = surfaceFraction(point.clientX, point.clientY);
  zoom.value = next;
  if (fraction) nextTick(() => placeFraction(fraction.fx, fraction.fy, point.clientX, point.clientY));
}

function stepZoom(direction, anchor = null) {
  const current = zoom.value;
  const next = direction > 0
    ? ZOOM_STOPS.find(stop => stop > current + 0.5) ?? MAX_ZOOM
    : [...ZOOM_STOPS].reverse().find(stop => stop < current - 0.5) ?? MIN_ZOOM;
  zoomTo(next, anchor);
}

// The navigator slider is logarithmic so 20%–400% gets most of its travel, like Photoshop.
const zoomSliderValue = computed(() => Math.round(Math.log(zoom.value / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM) * 1000));

function zoomFromSlider(value) {
  zoomTo(MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** (Number(value) / 1000));
}

function resetCanvasZoom() {
  isCanvasZoomManual.value = false;
  scheduleCanvasFit(true);
}

function handleViewportWheel(event) {
  if (!(event.ctrlKey || event.metaKey || event.altKey)) return;
  event.preventDefault();
  // Mouse notches zoom in comfortable steps; trackpad pinches (ctrl + small deltas) stay smooth.
  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  const factor = Math.exp(-Math.max(-120, Math.min(120, delta)) * 0.0028);
  zoomTo(zoom.value * factor, { clientX: event.clientX, clientY: event.clientY });
}

function updateViewRect() {
  viewRectFrame = 0;
  const viewport = canvasViewportRef.value;
  const surface = canvasSurfaceRef.value;
  if (!viewport || !surface) return;
  const v = viewport.getBoundingClientRect();
  const s = surface.getBoundingClientRect();
  if (!s.width || !s.height) return;
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const left = clamp01((v.left - s.left) / s.width);
  const top = clamp01((v.top - s.top) / s.height);
  const right = clamp01((v.right - s.left) / s.width);
  const bottom = clamp01((v.bottom - s.top) / s.height);
  viewRect.left = left;
  viewRect.top = top;
  viewRect.width = Math.max(0, right - left);
  viewRect.height = Math.max(0, bottom - top);
}

function scheduleViewRect() {
  if (viewRectFrame) return;
  viewRectFrame = window.requestAnimationFrame(updateViewRect);
}

function centerViewOnNavigator(event) {
  const frame = navigatorRef.value;
  const surface = canvasSurfaceRef.value;
  if (!frame || !surface) return;
  const rect = frame.getBoundingClientRect();
  const fx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const fy = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  const center = viewportCenter();
  placeFraction(fx, fy, center.clientX, center.clientY);
}

function startNavigatorDrag(event) {
  navigatorDrag = true;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  centerViewOnNavigator(event);
}

function moveNavigatorDrag(event) {
  if (navigatorDrag) centerViewOnNavigator(event);
}

function endNavigatorDrag() {
  navigatorDrag = false;
}

/* ---------- Painting ---------- */

function fillPixelsFrom(index, colorIndex) {
  const targetColor = pixels.value[index];
  if (targetColor === colorIndex) return;
  const width = canvasWidth.value;
  const height = canvasHeight.value;
  const next = [...pixels.value];
  const queue = [index];
  const visited = new Set();

  while (queue.length) {
    const current = queue.pop();
    if (visited.has(current) || next[current] !== targetColor) continue;
    visited.add(current);
    next[current] = colorIndex;
    const x = current % width;
    const y = Math.floor(current / width);
    if (x > 0) queue.push(current - 1);
    if (x < width - 1) queue.push(current + 1);
    if (y > 0) queue.push(current - width);
    if (y < height - 1) queue.push(current + width);
  }

  pixels.value = next;
}

function brushTargetIndices(index, diameter = brushSize.value) {
  const width = canvasWidth.value;
  const height = canvasHeight.value;
  const x = index % width;
  const y = Math.floor(index / width);
  const normalizedDiameter = Math.max(1, Math.min(MAX_BRUSH_SIZE + 2, Math.round(Number(diameter) || 1)));
  const start = Math.floor((normalizedDiameter - 1) / 2);
  const result = [];

  for (let offsetY = 0; offsetY < normalizedDiameter; offsetY += 1) {
    for (let offsetX = 0; offsetX < normalizedDiameter; offsetX += 1) {
      const targetX = x + offsetX - start;
      const targetY = y + offsetY - start;
      if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue;
      result.push(targetY * width + targetX);
    }
  }

  return result;
}

function normalizePaintSamples(payload) {
  if (payload == null) return [];
  const source = Array.isArray(payload?.points)
    ? payload.points
    : Array.isArray(payload)
      ? payload
      : [payload];
  const limit = canvasWidth.value * canvasHeight.value;
  return source
    .map((item) => {
      if (item && typeof item === 'object') {
        return {
          index: Number(item.index),
          pressure: Number.isFinite(Number(item.pressure)) ? Number(item.pressure) : 0.5,
          pointerType: item.pointerType || payload?.pointerType || 'mouse'
        };
      }
      return {
        index: Number(item),
        pressure: 0.5,
        pointerType: payload?.pointerType || 'mouse'
      };
    })
    .filter(sample => Number.isInteger(sample.index) && sample.index >= 0 && sample.index < limit);
}

function pressureBrushSize(sample) {
  const baseSize = Math.max(1, Number(brushSize.value) || 1);
  if (!pressureEnabled.value || sample.pointerType !== 'pen') return baseSize;
  const rawPressure = Number(sample.pressure);
  const pressure = Math.max(0, Math.min(1, Number.isFinite(rawPressure) ? rawPressure : 0.5));
  return Math.min(MAX_BRUSH_SIZE + 2, baseSize + Math.max(0, Math.round((pressure - 0.45) * 3)));
}

function paintBrushPath(payload, colorIndex) {
  const source = normalizePaintSamples(payload);
  if (!source.length) return;

  const next = strokePixels || [...pixels.value];
  let changed = false;
  const pixelChanges = [];
  for (const sample of source) {
    for (const targetIndex of brushTargetIndices(sample.index, pressureBrushSize(sample))) {
      if (next[targetIndex] === colorIndex) continue;
      next[targetIndex] = colorIndex;
      pixelChanges.push({ index: targetIndex, colorIndex });
      changed = true;
    }
  }

  if (!changed) return;
  if (strokePixels) {
    pixelCanvasRef.value?.renderPixelChanges(pixelChanges);
  } else {
    pixels.value = next;
  }
}

function pickColorAt(index) {
  const source = strokePixels || pixels.value;
  const colorIndex = source[index];
  const color = colorIndex >= 0 ? activePalette.value[colorIndex] : backgroundColor.value;
  if (!color) return;
  if (color !== selectedColor.value) {
    chooseColor(color);
    pickPulse.value += 1;
  }
}

function beginPaint(payload) {
  const source = normalizePaintSamples(payload);
  if (!source.length || activeTool.value === 'move') return;
  if (isMobileLayout.value && sheet.value) closeSheet();
  hideGestureHint();
  if (activeTool.value === 'picker') {
    isPicking = true;
    pickColorAt(source[0].index);
    return;
  }
  pushHistory();
  const currentTool = tool.value;
  touchStrokeGuard = source[0].pointerType === 'touch'
    ? { at: performance.now(), undoLength: undoStack.value.length }
    : null;
  const nextColor = currentTool === 'eraser' ? -1 : ensurePaletteColor(selectedColor.value);
  if (currentTool === 'fill') {
    fillPixelsFrom(source[0].index, nextColor);
    isDrawing.value = false;
    return;
  }

  activePaintColorIndex = nextColor;
  isDrawing.value = true;
  strokePixels = [...pixels.value];
  paintBrushPath(source, activePaintColorIndex);
}

function continuePaint(payload) {
  if (isPicking) {
    const samples = normalizePaintSamples(payload);
    if (samples.length) pickColorAt(samples[samples.length - 1].index);
    return;
  }
  if (!isDrawing.value) return;
  paintBrushPath(payload, activePaintColorIndex);
}

function endPaint() {
  if (isPicking) {
    isPicking = false;
    // The eyedropper is a one-shot tool: hand the brush back after sampling.
    if (tool.value === 'picker') tool.value = previousPaintTool.value || 'brush';
  }
  if (strokePixels) flushStrokeCommit();
  strokePixels = null;
  isDrawing.value = false;
  activePaintColorIndex = -1;
}

// Withdraw a finger stroke that turned out to be the start of a two-finger gesture.
function cancelTouchStroke() {
  const guard = touchStrokeGuard;
  touchStrokeGuard = null;
  if (isPicking) { isPicking = false; return; }
  const young = guard && performance.now() - guard.at < TOUCH_STROKE_GRACE_MS;
  if (young && undoStack.value.length === guard.undoLength) {
    discardStrokeBuffer();
    isDrawing.value = false;
    activePaintColorIndex = -1;
    restoreSnapshot(undoStack.value.pop());
    return;
  }
  if (isDrawing.value) endPaint();
}

function beginCanvasPan(sample) {
  const viewport = canvasViewportRef.value;
  if (!viewport || pinch) return;
  isPanningView.value = true;
  canvasPanState = {
    clientX: sample.clientX,
    clientY: sample.clientY,
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop
  };
}

function continueCanvasPan(sample) {
  const viewport = canvasViewportRef.value;
  if (!viewport || !canvasPanState || pinch) return;
  viewport.scrollLeft = canvasPanState.scrollLeft - (sample.clientX - canvasPanState.clientX);
  viewport.scrollTop = canvasPanState.scrollTop - (sample.clientY - canvasPanState.clientY);
}

function endCanvasPan() {
  canvasPanState = null;
  if (!viewportPan) isPanningView.value = false;
}

function endCanvasInteraction() {
  endPaint();
  endCanvasPan();
}

/* ---------- Viewport gestures: pasteboard pan, middle-button pan, pinch ---------- */

function touchPair() {
  const [a, b] = [...touchPoints.values()];
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
}

function beginPinch() {
  cancelTouchStroke();
  canvasPanState = null;
  viewportPan = null;
  isPanningView.value = false;
  const { mid, distance } = touchPair();
  const fraction = surfaceFraction(mid.x, mid.y) || { fx: 0.5, fy: 0.5 };
  pinch = { startDistance: Math.max(distance, 1), startZoom: zoom.value, ...fraction, startMid: mid, moved: 0, startedAt: performance.now(), fingers: 2 };
  hideGestureHint();
}

function handleViewportPointerDownCapture(event) {
  // Like a native popover, the first tap outside an open sheet only dismisses it.
  if (isMobileLayout.value && sheet.value && !touchPoints.size) {
    event.preventDefault();
    event.stopPropagation();
    closeSheet();
    return;
  }
  if (event.pointerType !== 'touch') return;
  touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touchPoints.size === 2 && !pinch) beginPinch();
  else if (pinch) pinch.fingers = Math.max(pinch.fingers, touchPoints.size);
}

function handleViewportPointerMoveCapture(event) {
  if (event.pointerType !== 'touch' || !touchPoints.has(event.pointerId)) return;
  touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!pinch || touchPoints.size < 2) return;
  event.preventDefault();
  const gesture = pinch;
  const { mid, distance } = touchPair();
  gesture.moved = Math.max(gesture.moved, Math.hypot(mid.x - gesture.startMid.x, mid.y - gesture.startMid.y), Math.abs(distance - gesture.startDistance));
  const nextZoom = clampZoom(gesture.startZoom * distance / gesture.startDistance);
  isCanvasZoomManual.value = true;
  if (nextZoom !== zoom.value) {
    zoom.value = nextZoom;
    nextTick(() => placeFraction(gesture.fx, gesture.fy, mid.x, mid.y));
  } else {
    placeFraction(gesture.fx, gesture.fy, mid.x, mid.y);
  }
}

function handleViewportPointerUpCapture(event) {
  if (event.pointerType !== 'touch') return;
  touchPoints.delete(event.pointerId);
  if (!pinch || touchPoints.size >= 2) return;
  const gesture = pinch;
  pinch = null;
  const isTap = performance.now() - gesture.startedAt < TWO_FINGER_TAP_MS && gesture.moved < 12;
  if (!isTap) return;
  if (gesture.fingers >= 3) redo();
  else undo();
}

function handleViewportPointerDown(event) {
  if (event.defaultPrevented || pinch || touchPoints.size > 1) return;
  const canvas = pixelCanvasRef.value?.$el;
  const isMiddle = event.pointerType === 'mouse' && event.button === 1;
  if (event.target === canvas && !isMiddle) return;
  if (!(isMiddle || event.pointerType === 'touch' || activeTool.value === 'move')) return;
  const viewport = canvasViewportRef.value;
  if (!viewport) return;
  event.preventDefault();
  viewportPan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  isPanningView.value = true;
  try { viewport.setPointerCapture(event.pointerId); } catch (_) { /* Synthetic pointers can lack capture support. */ }
}

function handleViewportPointerMove(event) {
  if (!viewportPan || viewportPan.id !== event.pointerId || pinch) return;
  const viewport = canvasViewportRef.value;
  viewport.scrollLeft = viewportPan.left - (event.clientX - viewportPan.x);
  viewport.scrollTop = viewportPan.top - (event.clientY - viewportPan.y);
}

function endViewportPan(event) {
  if (!viewportPan || (event && viewportPan.id !== event.pointerId)) return;
  viewportPan = null;
  if (!canvasPanState) isPanningView.value = false;
}

function preventMiddleAutoscroll(event) {
  if (event.button === 1) event.preventDefault();
}

function preventSafariGesture(event) {
  event.preventDefault();
}

function showGestureHint() {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  try {
    const seen = Number(localStorage.getItem(GESTURE_HINT_KEY) || 0);
    if (seen >= 3) return;
    localStorage.setItem(GESTURE_HINT_KEY, String(seen + 1));
  } catch (_) { /* Still show the hint once when storage is unavailable. */ }
  gestureHintVisible.value = true;
  gestureHintTimer = window.setTimeout(hideGestureHint, 6500);
}

function hideGestureHint() {
  clearTimeout(gestureHintTimer);
  gestureHintVisible.value = false;
}

/* ---------- History ---------- */

function undo() {
  endPaint();
  const previous = undoStack.value.pop();
  if (!previous) return;
  redoStack.value.push(currentSnapshot());
  restoreSnapshot(previous);
}

function redo() {
  endPaint();
  const next = redoStack.value.pop();
  if (!next) return;
  undoStack.value.push(currentSnapshot());
  restoreSnapshot(next);
}

function clearCanvas() {
  endPaint();
  if (!paintedCount.value) return;
  pushHistory();
  pixels.value = blankPixels();
}

async function applyMoonPattern() {
  try {
    const image = await new Promise((resolve, reject) => {
      const item = new Image(); item.onload = () => resolve(item); item.onerror = reject; item.src = moonHouseUrl;
    });
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, 192, 108).data;
    const colors = [...presetPalette], next = [];
    for (let i = 0; i < data.length; i += 4) {
      const color = rgbToHex({ r: data[i], g: data[i + 1], b: data[i + 2] });
      let index = colors.indexOf(color);
      if (index < 0) { index = colors.length; colors.push(color); }
      next.push(index);
    }
    endPaint(); pushHistory();
    canvasWidth.value = 192; canvasHeight.value = 108;
    customColors.value = colors.slice(presetPalette.length);
    pixels.value = next; form.title = copy.value.exampleTitle;
    setTool('brush'); closeSheet(); resetCanvasZoom();
  } catch (_) { showToast(copy.value.imageLoadFailed, 'error'); }
}

function makeCanvasFromPixels(sourcePixels, sourcePalette, sourceWidth, sourceHeight, canvasBackground, outputCellSize = EXPORT_CELL_SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth * outputCellSize;
  canvas.height = sourceHeight * outputCellSize;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = normalizeHexColor(canvasBackground, '#ffffff');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  sourcePixels.forEach((colorIndex, index) => {
    if (colorIndex < 0) return;
    ctx.fillStyle = sourcePalette[colorIndex] || '#ffffff';
    ctx.fillRect((index % sourceWidth) * outputCellSize, Math.floor(index / sourceWidth) * outputCellSize, outputCellSize, outputCellSize);
  });
  return canvas;
}

function hexToRgb(color) {
  const normalized = normalizeHexColor(color, '#0b1020');
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map(channel => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`;
}

function quantizeChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value / 32) * 32));
}

function quantizePixelColor(r, g, b, a) {
  const background = hexToRgb(backgroundColor.value);
  const alpha = a / 255;
  return rgbToHex({
    r: quantizeChannel(Math.round(r * alpha + background.r * (1 - alpha))),
    g: quantizeChannel(Math.round(g * alpha + background.g * (1 - alpha))),
    b: quantizeChannel(Math.round(b * alpha + background.b * (1 - alpha)))
  });
}

function nearestPaletteIndex(color, palette) {
  const source = hexToRgb(color);
  let bestIndex = 0;
  let bestDistance = Infinity;
  palette.forEach((paletteColor, index) => {
    const target = hexToRgb(paletteColor);
    const distance = ((source.r - target.r) ** 2) + ((source.g - target.g) ** 2) + ((source.b - target.b) ** 2);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    image.src = url;
  });
}

function convertImageToPixels(image, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const targetAspect = width / height;
  const sourceAspect = sourceWidth / sourceHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceCropWidth = sourceWidth;
  let sourceCropHeight = sourceHeight;
  if (sourceAspect > targetAspect) {
    sourceCropWidth = sourceHeight * targetAspect;
    sourceX = (sourceWidth - sourceCropWidth) / 2;
  } else {
    sourceCropHeight = sourceWidth / targetAspect;
    sourceY = (sourceHeight - sourceCropHeight) / 2;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, sourceX, sourceY, sourceCropWidth, sourceCropHeight, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height).data;
  const sourceColors = [];
  const colorCounts = new Map();
  for (let index = 0; index < imageData.length; index += 4) {
    const alpha = imageData[index + 3];
    if (alpha < 24) {
      sourceColors.push(null);
      continue;
    }
    const color = quantizePixelColor(imageData[index], imageData[index + 1], imageData[index + 2], alpha);
    sourceColors.push(color);
    colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
  }

  const imagePalette = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_IMAGE_COLORS)
    .map(([color]) => color);
  const customFromImage = imagePalette
    .filter(color => !presetPalette.includes(color))
    .slice(0, MAX_CUSTOM_COLORS);
  const nextPalette = [...presetPalette, ...customFromImage];
  const nextPixels = sourceColors.map((color) => {
    if (!color) return -1;
    const exactIndex = nextPalette.indexOf(color);
    return exactIndex >= 0 ? exactIndex : nearestPaletteIndex(color, nextPalette);
  });

  return {
    customFromImage,
    pixels: nextPixels,
    selected: imagePalette[0] || presetPalette[3]
  };
}

async function handleImageUpload(event) {
  endPaint();
  const input = event.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast(copy.value.imageTypeInvalid, 'error');
    return;
  }

  try {
    const image = await loadImageFromFile(file);
    const converted = convertImageToPixels(image, canvasWidth.value, canvasHeight.value);
    pushHistory();
    customColors.value = converted.customFromImage;
    selectedColor.value = normalizeHexColor(converted.selected, presetPalette[3]);
    customColor.value = selectedColor.value;
    pixels.value = converted.pixels;
    setTool('brush');
    closeSheet();
    if (!form.title.trim()) form.title = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
    showToast(copy.value.imageConverted);
  } catch (error) {
    showToast(copy.value.imageLoadFailed, 'error');
  }
}

function saveCanvasPng(canvas, filename) {
  exportPreview.value = canvas.toDataURL('image/png');
  exportFilename.value = filename;
  // Close gallery/preview first: the export dialog must own the top layer.
  galleryDialogRef.value?.close();
  previewArtwork.value = null;
  closeSheet();
  exportDialogRef.value?.showModal();
}

function downloadDraft() {
  flushStrokeCommit();
  const canvas = makeCanvasFromPixels(draftPixelsSnapshot(), activePalette.value, canvasWidth.value, canvasHeight.value, backgroundColor.value);
  saveCanvasPng(canvas, `${form.title.trim() || 'tsukuyomi-pixel-art'}.png`);
}

function artworkPalette(artwork) {
  return Array.isArray(artwork?.palette) && artwork.palette.length ? artwork.palette : presetPalette;
}

function artworkPixels(artwork) {
  if (Array.isArray(artwork?.pixels)) return artwork.pixels;
  if (!artwork || typeof artwork.pixels_base64 !== 'string' || !artwork.pixels_base64) return [];
  if (decodedArtworkPreviews.has(artwork)) return decodedArtworkPreviews.get(artwork);
  try {
    const bytes = atob(artwork.pixels_base64);
    const pixels = Array.from(bytes, value => value.charCodeAt(0) - 1);
    decodedArtworkPreviews.set(artwork, pixels);
    return pixels;
  } catch (_) {
    return [];
  }
}

function artworkBackground(artwork) {
  return artwork?.background_color || artwork?.backgroundColor || '#0b1020';
}

function artworkFileName(artwork) {
  const title = String(artwork?.title || 'tsukuyomi-pixel-art')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${title || 'tsukuyomi-pixel-art'}.png`;
}

async function loadFullArtwork(artwork) {
  if (!artwork?.id || Array.isArray(artwork.pixels)) return artwork;
  if (fullArtworkCache.has(artwork.id)) return fullArtworkCache.get(artwork.id);
  const response = isAuthed.value
    ? await authFetch(`/api/pixel-art/${encodeURIComponent(artwork.id)}`, {
      headers: authHeaders({ Accept: 'application/json' }),
      cache: 'no-store'
    })
    : await apiFetch(`/api/pixel-art/${encodeURIComponent(artwork.id)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
  const result = await parseResponse(response);
  if (!result.success || !result.data) throw new Error(result.message || copy.value.publishFailed);
  const fullArtwork = { ...artwork, ...result.data };
  fullArtworkCache.set(artwork.id, fullArtwork);
  return fullArtwork;
}

async function downloadArtwork(artwork) {
  if (!artwork) return;
  let fullArtwork;
  try {
    fullArtwork = await loadFullArtwork(artwork);
  } catch (error) {
    showToast(error.message || copy.value.publishFailed, 'error');
    return;
  }
  const canvas = makeCanvasFromPixels(
    artworkPixels(fullArtwork),
    artworkPalette(fullArtwork),
    artworkWidth(fullArtwork),
    artworkHeight(fullArtwork),
    artworkBackground(fullArtwork)
  );
  saveCanvasPng(canvas, artworkFileName(fullArtwork));
}

async function openArtworkPreview(artwork) {
  try {
    const full = await loadFullArtwork(artwork);
    previewFromGallery = Boolean(galleryDialogRef.value?.open);
    galleryDialogRef.value?.close();
    previewArtwork.value = full;
  } catch (error) {
    showToast(error.message || copy.value.publishFailed, 'error');
  }
}

async function openArtworkShare(artwork) {
  try {
    const fullArtwork = await loadFullArtwork(artwork);
    const id = encodeURIComponent(fullArtwork.id);
    const version = encodeURIComponent(String(fullArtwork.updated_at || fullArtwork.created_at || fullArtwork.id));
    const url = new URL(`/pixel?art=${id}#pixel-art-${id}`, location.origin).href;
    const imageUrl = new URL(`/api/pixel-art/${id}/image.png?v=${version}`, location.origin).href;
    artworkSharePayload.value = {
      title: fullArtwork.title || copy.value.gallery,
      text: fullArtwork.description || `${copy.value.by} ${fullArtwork.author_nickname || fullArtwork.author || props.t.brand}`,
      url,
      imageUrl,
      downloadUrl: imageUrl,
      downloadName: artworkFileName(fullArtwork)
    };
    galleryDialogRef.value?.close();
    artworkShareOpen.value = true;
  } catch (error) {
    showToast(error.message || copy.value.publishFailed, 'error');
  }
}

function closeArtworkPreview(event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  previewArtwork.value = null;
  if (previewFromGallery) { previewFromGallery = false; galleryOpen.value = true; galleryDialogRef.value?.showModal(); }
}

let artworkListRevision = 0;
async function loadArtworks(page = gallery.page) {
  const revision = ++artworkListRevision;
  gallery.loading = true;
  gallery.error = '';
  session.value = getSession();
  try {
    const nextPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const offset = (nextPage - 1) * PIXEL_GALLERY_PAGE_SIZE;
    const galleryUrl = `/api/pixel-art/gallery?sort=${gallery.sort}&limit=${PIXEL_GALLERY_PAGE_SIZE}&offset=${offset}`;
    const response = isAuthed.value
      ? await authFetch(galleryUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })
      : await apiFetch(galleryUrl, {
        headers: { Accept: 'application/json' }
      });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || 'Pixel art unavailable');
    if (revision !== artworkListRevision) return;
    gallery.items = Array.isArray(result.data) ? result.data : [];
    await hydrateUserLevels(gallery.items.map((artwork) => artwork.author_id)).catch(() => {});
    if (revision !== artworkListRevision) return;
    gallery.page = nextPage;
    gallery.total = Number(result.pagination?.total || gallery.items.length);
    gallery.totalPages = Math.max(1, Math.ceil(gallery.total / PIXEL_GALLERY_PAGE_SIZE));
    focusSharedArtwork();
  } catch (error) {
    if (revision !== artworkListRevision) return;
    gallery.items = [];
    gallery.error = error.message || copy.value.publishFailed;
  } finally {
    if (revision === artworkListRevision) gallery.loading = false;
  }
}

async function loadArtworkForEdit() {
  const id = new URLSearchParams(location.search).get('edit');
  if (!id) return;
  session.value = getSession();
  if (!isAuthed.value) {
    go('/login');
    return;
  }

  try {
    const response = await authFetch(`/api/pixel-art/manage/${encodeURIComponent(id)}?_=${Date.now()}`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || copy.value.publishFailed);
    loadArtworkIntoDraft(result.data);
    resetCanvasZoom();
    showToast(copy.value.editLoaded);
  } catch (error) {
    showToast(error.message || copy.value.publishFailed, 'error');
  }
}

function upsertArtwork(artwork) {
  if (!artwork?.id) return;
  const index = gallery.items.findIndex(item => item.id === artwork.id);
  if (index >= 0) {
    gallery.items.splice(index, 1, { ...gallery.items[index], ...artwork });
    return;
  }
  gallery.items.unshift(artwork);
}

async function shareArtwork() {
  if (isPublishing.value) return;
  flushStrokeCommit();
  session.value = getSession();
  if (!isAuthed.value) {
    saveDraftForSignIn();
    go('/login');
    return;
  }
  if (!form.title.trim()) {
    showToast(copy.value.titleRequired, 'error');
    await preparePublish();
    return;
  }
  if (!paintedCount.value) {
    showToast(copy.value.blankCanvas, 'error');
    return;
  }

  try {
    isPublishing.value = true;
    const wasEditing = Boolean(editingArtwork.value?.id);
    const targetUrl = wasEditing
      ? `/api/pixel-art/${encodeURIComponent(editingArtwork.value.id)}`
      : '/api/pixel-art';
    const response = await authFetch(targetUrl, {
      method: wasEditing ? 'PUT' : 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        size: canvasWidth.value,
        width: canvasWidth.value,
        height: canvasHeight.value,
        background_color: backgroundColor.value,
        palette: activePalette.value,
        pixels: draftPixelsSnapshot()
      })
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || copy.value.publishFailed);
    if (result.growth) applyGrowthResult(result.growth);
    upsertArtwork(result.data);
    publishDialogRef.value?.close();
    if (wasEditing) {
      editingArtwork.value = result.data;
      showToast(result.message || copy.value.updateOk);
    } else {
      showToast(result.message || copy.value.publishOk);
      form.title = '';
      form.description = '';
    }
  } catch (error) {
    showToast(error.message || copy.value.publishFailed, 'error');
  } finally {
    isPublishing.value = false;
  }
}

async function likeArtwork(artwork) {
  session.value = getSession();
  if (!isAuthed.value) {
    go('/login');
    return;
  }
  if (isArtworkLiked(artwork)) {
    showToast(copy.value.alreadyLiked, 'error');
    return;
  }

  try {
    const response = await authFetch(`/api/pixel-art/${artwork.id}/like`, {
      method: 'POST',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || copy.value.publishFailed);
    if (result.growth) applyGrowthResult(result.growth);
    upsertArtwork(result.data);
    showToast(result.message || copy.value.likedToast);
  } catch (error) {
    showToast(error.message || copy.value.publishFailed, 'error');
  }
}

function isArtworkLiked(artwork) {
  return Boolean(artwork?.viewer_liked);
}

async function focusSharedArtwork() {
  const id = new URLSearchParams(location.search).get('art');
  if (!id) return;
  const listed = gallery.items.find((item) => String(item.id) === String(id));
  if (listed) {
    await nextTick();
    document.getElementById(`pixel-art-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await openArtworkPreview(listed);
    return;
  }
  await openArtworkPreview({ id });
}

/* ---------- Keyboard ---------- */

function isTypingTarget(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
}

function anyDialogOpen() {
  return [publishDialogRef, galleryDialogRef, newDialogRef, exportDialogRef, shortcutsDialogRef].some(dialog => dialog.value?.open);
}

function handleArenaKeydown(event) {
  if (anyDialogOpen()) return;
  if (event.key === 'Escape') {
    if (previewArtwork.value) { closeArtworkPreview(); return; }
    if (sheet.value) { closeSheet(); return; }
    if (focusMode.value) { toggleFocus(); return; }
    return;
  }
  if (isTypingTarget(event.target) && event.target.type !== 'range' && event.target.type !== 'checkbox') return;
  const key = event.key.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;
  if (event.key === 'Alt') {
    event.preventDefault();
    isAltPicking.value = true;
    return;
  }
  if (modifier) {
    if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (key === 'y') { event.preventDefault(); redo(); return; }
    if (key === '0') { event.preventDefault(); resetCanvasZoom(); return; }
    if (key === '1') { event.preventDefault(); zoomTo(100); return; }
    if (key === '=' || key === '+') { event.preventDefault(); stepZoom(1); return; }
    if (key === '-' || key === '_') { event.preventDefault(); stepZoom(-1); return; }
    if (key === 's') { event.preventDefault(); saveLocalDraft(); showToast(copy.value.savedLocal); return; }
    if (key === "'") { event.preventDefault(); showGrid.value = !showGrid.value; }
    return;
  }
  if (event.altKey) return;
  if (event.key === ' ') {
    event.preventDefault();
    isSpacePanning.value = true;
    return;
  }
  if (key === 'b') setTool('brush');
  else if (key === 'e') setTool('eraser');
  else if (key === 'g') setTool('fill');
  else if (key === 'i') setTool('picker');
  else if (key === 'v' || key === 'h') setTool('move');
  else if (key === 'f') toggleFocus();
  else if (event.key === "'") showGrid.value = !showGrid.value;
  else if (event.key === '[') setBrushSize(brushSize.value - 1);
  else if (event.key === ']') setBrushSize(brushSize.value + 1);
  else if (event.key === '-' || event.key === '_') stepZoom(-1);
  else if (event.key === '=' || event.key === '+') stepZoom(1);
}

function handleArenaKeyup(event) {
  if (event.key === ' ') isSpacePanning.value = false;
  if (event.key === 'Alt') isAltPicking.value = false;
}

function resetModifiers() {
  isSpacePanning.value = false;
  isAltPicking.value = false;
}

function artworkInitial(name) {
  return nameInitial(name, props.t.brand || '月');
}

function watchMedia(query, handler) {
  const media = window.matchMedia(query);
  const listener = () => handler(media.matches);
  media.addEventListener?.('change', listener);
  mediaQueries.push(() => media.removeEventListener?.('change', listener));
}

watch([pixels, () => form.title, () => form.description, backgroundColor, customColors, brushSize, selectedColor], () => {
  draftSaved.value = false;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveLocalDraft, 700);
});
watch(() => gallery.sort, () => loadArtworks(1));
watch([canvasBaseWidth, canvasBaseHeight], () => scheduleCanvasFit());
watch(zoom, () => scheduleViewRect());
watch(sheet, async (value) => {
  if (value) { sheetPanel.value = value; hideGestureHint(); }
  await nextTick();
  updateSheetShift();
});
watch([panelsVisible, focusMode], () => scheduleCanvasFit());

onMounted(async () => {
  window.addEventListener('pointerup', endCanvasInteraction);
  window.addEventListener('pointercancel', endCanvasInteraction);
  window.addEventListener('keydown', handleArenaKeydown);
  window.addEventListener('keyup', handleArenaKeyup);
  window.addEventListener('blur', resetModifiers);
  window.addEventListener('resize', handleCanvasViewportResize);
  watchMedia('(max-width: 760px)', (matches) => { isMobileLayout.value = matches; if (!matches) closeSheet(); });
  watchMedia('(min-width: 1101px)', (matches) => { panelsOpen.value = matches; });
  restorePanelState();
  // Nothing is unsaved until the first edit (or a restored draft) changes the canvas.
  draftSaved.value = true;
  restoreLocalDraft();
  restoreDraftAfterSignIn();
  window.addEventListener('pagehide', saveLocalDraft);
  await nextTick();
  const viewport = canvasViewportRef.value;
  if (viewport) {
    viewport.addEventListener('gesturestart', preventSafariGesture);
    viewport.addEventListener('gesturechange', preventSafariGesture);
  }
  if (typeof ResizeObserver !== 'undefined' && viewport) {
    canvasFitObserver = new ResizeObserver(handleCanvasViewportResize);
    canvasFitObserver.observe(viewport);
  }
  scheduleCanvasFit(true);
  showGestureHint();
  loadArtworks();
  loadArtworkForEdit();
});

onBeforeUnmount(() => {
  saveLocalDraft();
  window.removeEventListener('pagehide', saveLocalDraft);
  [publishDialogRef, galleryDialogRef, newDialogRef, exportDialogRef, shortcutsDialogRef].forEach(dialog => dialog.value?.close());
  window.removeEventListener('pointerup', endCanvasInteraction);
  window.removeEventListener('pointercancel', endCanvasInteraction);
  window.removeEventListener('keydown', handleArenaKeydown);
  window.removeEventListener('keyup', handleArenaKeyup);
  window.removeEventListener('blur', resetModifiers);
  window.removeEventListener('resize', handleCanvasViewportResize);
  mediaQueries.splice(0).forEach(dispose => dispose());
  const viewport = canvasViewportRef.value;
  viewport?.removeEventListener('gesturestart', preventSafariGesture);
  viewport?.removeEventListener('gesturechange', preventSafariGesture);
  canvasFitObserver?.disconnect();
  canvasFitObserver = null;
  if (canvasFitFrame) window.cancelAnimationFrame(canvasFitFrame);
  if (viewRectFrame) window.cancelAnimationFrame(viewRectFrame);
  clearTimeout(toastTimer);
  clearTimeout(gestureHintTimer);
});
useContentTranslationRefresh(() => loadArtworks(gallery.page));
</script>

<template>
  <main data-ui-layout="workspace" class="page arena-page pixel-workspace pixel-studio ps-theme" :class="studioClasses">
    <h1 class="ps-visually-hidden">{{ copy.pageTitle }}</h1>
    <section class="ps-app" :aria-label="copy.pageTitle">
      <header class="ps-bar">
        <div class="ps-brand" aria-hidden="true"><span class="ps-brand-mark"><TsIcon name="moon" :size="15" /></span><span>{{ copy.appName }}</span></div>
        <button data-ui-part="canvas" class="ps-doc-button" type="button" :aria-label="copy.renameArtwork" @click="preparePublish">
          <span class="ps-doc-name">{{ form.title || copy.draftTitle }}</span>
          <span class="ps-save-dot" :class="saveState" :title="saveStateText"></span>
        </button>
        <div class="ps-options" role="toolbar" :aria-label="copy.toolOptions">
          <span class="ps-options-tool"><TsIcon :name="activeToolOption.icon" :size="16" /><span>{{ activeToolOption.label }}</span></span>
          <template v-if="activeTool === 'brush' || activeTool === 'eraser'">
            <div class="ps-size-control">
              <span class="ps-field-name">{{ copy.brushSize }}</span>
              <button data-ui-part="canvas" class="ps-icon-btn is-small" type="button" :disabled="brushSize <= 1" :aria-label="`${copy.brushSize} -`" @click="setBrushSize(brushSize - 1)"><TsIcon name="minus" :size="13" /></button>
              <input class="ps-range" :value="brushSize" type="range" min="1" :max="MAX_BRUSH_SIZE" step="1" :aria-label="copy.brushSize" @input="setBrushSize($event.target.value)">
              <button data-ui-part="canvas" class="ps-icon-btn is-small" type="button" :disabled="brushSize >= MAX_BRUSH_SIZE" :aria-label="`${copy.brushSize} +`" @click="setBrushSize(brushSize + 1)"><TsIcon name="plus" :size="13" /></button>
              <output class="ps-value">{{ brushSize }} {{ copy.pixels }}</output>
            </div>
            <label class="ps-check"><input v-model="pressureEnabled" type="checkbox"><span>{{ copy.pressure }}</span></label>
            <label class="ps-check"><input v-model="stabilizerEnabled" type="checkbox"><span>{{ copy.stabilizer }}</span></label>
          </template>
          <span class="ps-options-hint">{{ toolHint }}</span>
        </div>
        <div class="ps-bar-actions">
          <div class="ps-history" role="group" :aria-label="copy.undo">
            <button data-ui-part="canvas" class="ps-icon-btn" type="button" :disabled="!hasUndo" :aria-label="copy.undo" :data-tip="`${copy.undo} · Ctrl Z`" @click="undo"><TsIcon name="undo" :size="18" /></button>
            <button data-ui-part="canvas" class="ps-icon-btn" type="button" :disabled="!hasRedo" :aria-label="copy.redo" :data-tip="`${copy.redo} · Ctrl Shift Z`" @click="redo"><TsIcon name="redo" :size="18" /></button>
          </div>
          <span class="ps-bar-sep ps-hide-mobile" aria-hidden="true"></span>
          <button data-ui="secondary" data-size="compact" class="ps-btn ps-hide-mobile" type="button" aria-controls="arena-gallery-panel" :aria-expanded="galleryOpen" @click="toggleGalleryPanel"><TsIcon name="image" :size="16" /><span>{{ copy.gallery }}</span></button>
          <button data-ui="secondary" data-size="compact" class="ps-btn ps-hide-mobile ps-hide-compact" type="button" @click="openNewDialog"><TsIcon name="plus" :size="16" /><span>{{ copy.newCanvas }}</span></button>
          <label data-ui="secondary" data-size="compact" class="ps-btn ps-hide-mobile ps-hide-compact"><TsIcon name="upload" :size="16" /><span>{{ copy.imageImport }}</span><input class="ps-visually-hidden" type="file" accept="image/*" :aria-label="copy.uploadImage" @change="handleImageUpload"></label>
          <button data-ui="secondary" data-size="compact" class="ps-btn ps-hide-mobile" type="button" @click="downloadDraft"><TsIcon name="download" :size="16" /><span>{{ copy.download }}</span></button>
          <button data-ui-part="canvas" class="ps-icon-btn ps-show-mobile" type="button" :aria-label="copy.more" :aria-expanded="sheet === 'file'" aria-controls="arena-controls-panel" @click="openSheet('file')"><TsIcon name="ellipsis" :size="20" /></button>
          <button data-ui="primary" data-size="compact" class="ps-btn ps-btn-primary" type="button" @click="preparePublish"><TsIcon name="send" :size="15" /><span>{{ editingArtwork ? copy.saveUpdate : copy.share }}</span></button>
        </div>
      </header>

      <div class="ps-body">
        <nav class="ps-toolbar" :aria-label="copy.tools">
          <div class="ps-tool-group" role="group" :aria-label="copy.tools">
            <button data-ui-part="canvas" v-for="item in toolOptions" :key="item.key" class="ps-tool" :class="{ active: activeTool === item.key }" type="button" :aria-pressed="activeTool === item.key" :aria-label="item.label" :data-tip="`${item.label} · ${item.shortcut}`" @click="setTool(item.key)"><TsIcon :name="item.icon" :size="20" /></button>
          </div>
          <span class="ps-toolbar-sep" aria-hidden="true"></span>
          <button data-ui-part="canvas" class="ps-dock-size ps-show-mobile" type="button" :aria-label="`${copy.brushSize} ${brushSize} ${copy.pixels}`" :aria-expanded="sheet === 'brush'" aria-controls="arena-controls-panel" :style="brushDotStyle" @click="openSheet('brush')"><span class="ps-dot"></span><small>{{ brushSize }}</small></button>
          <div class="ps-color-chips">
            <button data-ui-part="canvas" :key="pickPulse" class="ps-chip-fg" :class="{ 'is-picked': pickPulse }" type="button" :style="{ '--chip': selectedColor }" :aria-label="copy.currentColor" :data-tip="copy.currentColor" :aria-expanded="sheet === 'color'" @click="revealPanel('color')"></button>
            <button data-ui-part="canvas" class="ps-chip-bg" type="button" :style="{ '--chip': backgroundColor }" :aria-label="copy.background" :data-tip="copy.background" @click="revealPanel('canvas')"></button>
          </div>
          <div class="ps-toolbar-end">
            <button data-ui-part="canvas" class="ps-tool" :class="{ active: showGrid }" type="button" :aria-pressed="showGrid" :aria-label="copy.grid" :data-tip="`${copy.grid} · '`" @click="showGrid = !showGrid"><TsIcon name="grid" :size="18" /></button>
            <button data-ui-part="canvas" class="ps-tool" :class="{ active: focusMode }" type="button" :aria-pressed="focusMode" :aria-label="focusMode ? copy.exitFocus : copy.focus" :data-tip="`${focusMode ? copy.exitFocus : copy.focus} · F`" @click="toggleFocus"><TsIcon :name="focusMode ? 'minimize' : 'maximize'" :size="18" /></button>
            <button data-ui-part="canvas" class="ps-tool" type="button" :aria-label="copy.shortcuts" :data-tip="copy.shortcuts" @click="openShortcuts"><TsIcon name="helpCircle" :size="18" /></button>
          </div>
        </nav>

        <div class="ps-stage arena-canvas-panel">
          <div class="ps-doc-tabs">
            <button data-ui-part="canvas" class="ps-doc-tab" type="button" :aria-label="copy.renameArtwork" @click="preparePublish">
              <TsIcon name="image" :size="13" /><span class="ps-doc-name">{{ form.title || copy.draftTitle }}</span><small>@ {{ zoom }}%</small>
            </button>
            <span class="ps-doc-status"><span class="ps-save-dot" :class="saveState"></span>{{ saveStateText }}</span>
            <button data-ui-part="canvas" class="ps-icon-btn is-small ps-panels-toggle" type="button" :aria-expanded="panelsOpen && !focusMode" aria-controls="arena-controls-panel" :aria-label="panelsOpen ? copy.hidePanels : copy.showPanels" :data-tip="panelsOpen ? copy.hidePanels : copy.showPanels" @click="togglePanels"><TsIcon name="panelRight" :size="16" /></button>
          </div>
          <div
            ref="canvasViewportRef"
            class="arena-canvas-viewport ps-viewport"
            @wheel="handleViewportWheel"
            @pointerdown.capture="handleViewportPointerDownCapture"
            @pointermove.capture="handleViewportPointerMoveCapture"
            @pointerup.capture="handleViewportPointerUpCapture"
            @pointercancel.capture="handleViewportPointerUpCapture"
            @pointerdown="handleViewportPointerDown"
            @pointermove="handleViewportPointerMove"
            @pointerup="endViewportPan"
            @pointercancel="endViewportPan"
            @mousedown="preventMiddleAutoscroll"
            @contextmenu.prevent
            @scroll.passive="scheduleViewRect"
          >
            <div ref="canvasWorldRef" class="ps-world" :style="worldStyle">
              <div ref="canvasSurfaceRef" class="ps-surface" :style="canvasSurfaceStyle">
                <div class="pixel-canvas" :style="canvasStyle" @dragstart.prevent @pointermove="trackCoordinates" @pointerdown="trackCoordinates" @pointerleave="clearHover">
                  <PixelCanvasCells ref="pixelCanvasRef" :pixels="pixels" :palette="activePalette" :width="canvasWidth" :height="canvasHeight" :cell-size="DISPLAY_CELL_SIZE" :tool="activeTool" :show-grid="false" :stabilizer="stabilizerEnabled" @begin-paint="beginPaint" @continue-paint="continuePaint" @end-paint="endPaint" @begin-pan="beginCanvasPan" @continue-pan="continueCanvasPan" @end-pan="endCanvasPan" />
                </div>
                <div v-if="gridVisible" class="ps-grid-overlay" :style="gridStyle" aria-hidden="true"></div>
                <div v-if="brushCursorStyle" class="ps-brush-cursor" :class="{ 'is-eraser': activeTool === 'eraser' }" :style="brushCursorStyle" aria-hidden="true"></div>
              </div>
            </div>
          </div>
          <Transition name="ps-fade">
            <p v-if="gestureHintVisible" class="ps-gesture-hint" role="status" @click="hideGestureHint"><TsIcon name="sparkles" :size="14" />{{ copy.gestureHint }}</p>
          </Transition>
          <Transition name="ps-fade">
            <div v-if="toast.visible" class="ps-toast" :class="toast.type" :role="toast.type === 'error' ? 'alert' : 'status'">{{ toast.text }}</div>
          </Transition>
          <footer class="ps-statusbar">
            <span class="ps-status-item">{{ canvasWidth }} × {{ canvasHeight }} {{ copy.pixels }}</span>
            <span class="ps-status-item ps-coords">X {{ coordinates?.x ?? '–' }}<span>Y {{ coordinates?.y ?? '–' }}</span></span>
            <span class="ps-status-item ps-status-color"><i :style="{ backgroundColor: selectedColor }"></i>{{ selectedColor.toUpperCase() }}</span>
            <span class="ps-status-hint">{{ toolHint }}</span>
            <div class="arena-zoom-controls ps-zoom" role="group" :aria-label="copy.zoom">
              <button data-ui-part="canvas" class="ps-icon-btn is-small" type="button" :aria-label="`${copy.zoom} -`" @click="stepZoom(-1)"><TsIcon name="minus" :size="14" /></button>
              <button data-ui-part="canvas" class="ps-zoom-value" type="button" :aria-label="copy.fitCanvas" :data-tip="`${copy.fitCanvas} · Ctrl 0`" @click="resetCanvasZoom"><strong>{{ zoom }}%</strong></button>
              <button data-ui-part="canvas" class="ps-icon-btn is-small" type="button" :aria-label="`${copy.zoom} +`" @click="stepZoom(1)"><TsIcon name="plus" :size="14" /></button>
              <button data-ui-part="canvas" class="ps-text-btn" type="button" :data-tip="`${copy.actualPixels} · Ctrl 1`" @click="zoomTo(100)">1:1</button>
              <button data-ui-part="canvas" class="ps-icon-btn is-small" type="button" :aria-label="copy.fitCanvas" :data-tip="`${copy.fitCanvas} · Ctrl 0`" @click="resetCanvasZoom"><TsIcon name="scan" :size="14" /></button>
            </div>
          </footer>
        </div>

        <button data-ui-part="canvas" v-if="panelsOpen && !focusMode && !isMobileLayout" class="ps-panels-scrim" type="button" tabindex="-1" :aria-label="copy.hidePanels" @click="panelsOpen = false"></button>
        <aside id="arena-controls-panel" class="ps-panels arena-controls" :data-sheet="sheetPanel" :style="sheetStyle" :aria-label="copy.panels" :inert="!panelsVisible">
          <div class="ps-sheet-head" @pointerdown="startSheetDrag" @pointermove="moveSheetDrag" @pointerup="endSheetDrag" @pointercancel="endSheetDrag">
            <span class="ps-sheet-grip" aria-hidden="true"></span>
            <div class="ps-sheet-tabs" role="tablist" :aria-label="copy.panels">
              <button data-ui-part="canvas" v-for="tab in sheetTabs" :key="tab.key" type="button" role="tab" :aria-selected="sheet === tab.key" @click="sheet = tab.key"><TsIcon :name="tab.icon" :size="16" /><span>{{ tab.label }}</span></button>
            </div>
            <button data-ui-part="canvas" class="ps-icon-btn" type="button" :aria-label="copy.close" @click="closeSheet"><TsIcon name="x" :size="18" /></button>
          </div>
          <div class="ps-panels-scroll" data-lenis-prevent>
            <section id="ps-panel-color" class="ps-panel" data-panel="color" :class="{ 'is-collapsed': collapsedPanels.color }">
              <h2 class="ps-panel-head"><button data-ui-part="canvas" type="button" :aria-expanded="!collapsedPanels.color" @click="toggleCollapsed('color')"><TsIcon name="chevronDown" :size="13" />{{ copy.colorPanel }}</button><span class="ps-panel-meta">{{ selectedColor.toUpperCase() }}</span></h2>
              <div class="ps-panel-body">
                <PixelColorPicker ref="customColorInputRef" :model-value="selectedColor" :label="copy.freeColor" @update:model-value="chooseColor" />
              </div>
            </section>
            <section id="ps-panel-swatches" class="ps-panel" data-panel="swatches" :class="{ 'is-collapsed': collapsedPanels.swatches }">
              <h2 class="ps-panel-head"><button data-ui-part="canvas" type="button" :aria-expanded="!collapsedPanels.swatches" @click="toggleCollapsed('swatches')"><TsIcon name="chevronDown" :size="13" />{{ copy.swatchesPanel }}</button><button data-ui-part="canvas" class="ps-icon-btn is-small" type="button" :aria-label="copy.addColor" :data-tip="copy.addColor" @click="saveSelectedColor"><TsIcon name="plus" :size="14" /></button></h2>
              <div class="ps-panel-body">
                <div class="ps-swatch-grid" role="group" :aria-label="copy.presets">
                  <button data-ui-part="canvas" v-for="color in [...presetPalette, ...studioColors]" :key="color" class="ps-swatch" :class="{ active: selectedColor === color }" type="button" :style="{ '--swatch': color }" :aria-label="`${copy.presets} ${color}`" :aria-pressed="selectedColor === color" @click="chooseColor(color)"></button>
                </div>
                <template v-if="customColors.length">
                  <p class="ps-panel-label">{{ copy.savedColors }} <span>{{ customColors.length }}</span></p>
                  <div class="ps-swatch-grid" role="group" :aria-label="copy.savedColors">
                    <button data-ui-part="canvas" v-for="color in customColors" :key="color" class="ps-swatch" :class="{ active: selectedColor === color }" type="button" :style="{ '--swatch': color }" :aria-label="`${copy.savedColors} ${color}`" :aria-pressed="selectedColor === color" @click="chooseColor(color)"></button>
                  </div>
                </template>
                <template v-if="recentColors.length">
                  <p class="ps-panel-label">{{ copy.recent }}</p>
                  <div class="ps-swatch-grid is-recent" role="group" :aria-label="copy.recent">
                    <button data-ui-part="canvas" v-for="color in recentColors" :key="color" class="ps-swatch" type="button" :style="{ '--swatch': color }" :aria-label="`${copy.recent} ${color}`" @click="chooseColor(color)"></button>
                  </div>
                </template>
              </div>
            </section>
            <section id="ps-panel-brush" class="ps-panel" data-panel="brush" :class="{ 'is-collapsed': collapsedPanels.brush }">
              <h2 class="ps-panel-head"><button data-ui-part="canvas" type="button" :aria-expanded="!collapsedPanels.brush" @click="toggleCollapsed('brush')"><TsIcon name="chevronDown" :size="13" />{{ copy.brushPanel }}</button><span class="ps-panel-meta">{{ brushSize }} {{ copy.pixels }}</span></h2>
              <div class="ps-panel-body">
                <div class="ps-brush-preview" :style="brushDotStyle"><span class="ps-dot" :style="{ backgroundColor: selectedColor }"></span></div>
                <div class="ps-brush-sizes" role="group" :aria-label="copy.brushSize">
                  <button data-ui-part="canvas" v-for="size in MAX_BRUSH_SIZE" :key="size" type="button" :class="{ active: brushSize === size }" :aria-pressed="brushSize === size" :aria-label="`${copy.brushSize} ${size} ${copy.pixels}`" @click="setBrushSize(size)">{{ size }}</button>
                </div>
                <label class="ps-switch-row"><span>{{ copy.pressure }}</span><input v-model="pressureEnabled" class="ps-switch" type="checkbox"></label>
                <label class="ps-switch-row"><span>{{ copy.stabilizer }}</span><input v-model="stabilizerEnabled" class="ps-switch" type="checkbox"></label>
                <p class="ps-panel-note">{{ toolHint }}</p>
              </div>
            </section>
            <section id="ps-panel-navigator" class="ps-panel" data-panel="navigator" :class="{ 'is-collapsed': collapsedPanels.navigator }">
              <h2 class="ps-panel-head"><button data-ui-part="canvas" type="button" :aria-expanded="!collapsedPanels.navigator" @click="toggleCollapsed('navigator')"><TsIcon name="chevronDown" :size="13" />{{ copy.navigatorPanel }}</button><span class="ps-panel-meta">{{ zoom }}%</span></h2>
              <div class="ps-panel-body">
                <div ref="navigatorRef" class="ps-navigator" :style="{ aspectRatio: `${canvasWidth} / ${canvasHeight}`, backgroundColor }" @pointerdown="startNavigatorDrag" @pointermove="moveNavigatorDrag" @pointerup="endNavigatorDrag" @pointercancel="endNavigatorDrag">
                  <PixelCanvasCells :pixels="pixels" :palette="activePalette" :width="canvasWidth" :height="canvasHeight" :cell-size="1" :background-color="backgroundColor" :show-grid="false" :interactive="false" :aria-label="copy.navigatorPanel" />
                  <span class="ps-navigator-view" :style="navigatorStyle" aria-hidden="true"></span>
                </div>
                <div class="ps-navigator-zoom">
                  <button data-ui-part="canvas" class="ps-icon-btn is-small" type="button" :aria-label="`${copy.zoom} -`" @click="stepZoom(-1)"><TsIcon name="zoomOut" :size="14" /></button>
                  <input class="ps-range" type="range" min="0" max="1000" :value="zoomSliderValue" :aria-label="copy.zoom" :aria-valuetext="`${zoom}%`" @input="zoomFromSlider($event.target.value)">
                  <button data-ui-part="canvas" class="ps-icon-btn is-small" type="button" :aria-label="`${copy.zoom} +`" @click="stepZoom(1)"><TsIcon name="zoomIn" :size="14" /></button>
                </div>
              </div>
            </section>
            <section id="ps-panel-canvas" class="ps-panel" data-panel="canvas" :class="{ 'is-collapsed': collapsedPanels.canvas }">
              <h2 class="ps-panel-head"><button data-ui-part="canvas" type="button" :aria-expanded="!collapsedPanels.canvas" @click="toggleCollapsed('canvas')"><TsIcon name="chevronDown" :size="13" />{{ copy.canvasPanel }}</button><span class="ps-panel-meta">{{ canvasWidth }} × {{ canvasHeight }}</span></h2>
              <div class="ps-panel-body">
                <p class="ps-panel-label">{{ copy.background }}</p>
                <div class="ps-bg-row">
                  <label class="ps-bg-picker" :style="{ '--swatch': backgroundColor }"><input :value="backgroundColor" type="color" :aria-label="copy.background" @change="setBackgroundColor($event.target.value)"></label>
                  <button data-ui-part="canvas" v-for="color in backgroundPresets" :key="color" class="ps-swatch" :class="{ active: backgroundColor === color }" type="button" :style="{ '--swatch': color }" :aria-label="`${copy.background} ${color}`" :aria-pressed="backgroundColor === color" @click="setBackgroundColor(color)"></button>
                </div>
                <label class="ps-switch-row ps-show-mobile"><span>{{ copy.grid }}</span><input v-model="showGrid" class="ps-switch" type="checkbox"></label>
                <div class="ps-action-list">
                  <button data-ui-part="canvas" type="button" @click="openNewDialog"><TsIcon name="plus" :size="16" /><span>{{ copy.newCanvasAction }}</span><small>{{ canvasWidth }} × {{ canvasHeight }}</small></button>
                  <button data-ui-part="canvas" type="button" @click="applyMoonPattern"><TsIcon name="moon" :size="16" /><span>{{ copy.example }}</span></button>
                  <button data-ui-part="canvas" type="button" class="is-danger" :disabled="!paintedCount" @click="clearCanvas"><TsIcon name="trash" :size="16" /><span>{{ copy.clear }}</span></button>
                </div>
              </div>
            </section>
            <section id="ps-panel-file" class="ps-panel" data-panel="file">
              <div class="ps-panel-body">
                <div class="ps-action-list is-large">
                  <button data-ui-part="canvas" type="button" aria-controls="arena-gallery-panel" :aria-expanded="galleryOpen" @click="toggleGalleryPanel"><TsIcon name="image" :size="18" /><span>{{ copy.gallery }}</span><TsIcon name="chevronRight" :size="14" /></button>
                  <label><TsIcon name="upload" :size="18" /><span>{{ copy.imageImport }}</span><input class="ps-visually-hidden" type="file" accept="image/*" :aria-label="copy.uploadImage" @change="handleImageUpload"><TsIcon name="chevronRight" :size="14" /></label>
                  <button data-ui-part="canvas" type="button" @click="downloadDraft"><TsIcon name="download" :size="18" /><span>{{ copy.download }}</span><TsIcon name="chevronRight" :size="14" /></button>
                  <button data-ui-part="canvas" type="button" @click="preparePublish"><TsIcon name="penLine" :size="18" /><span>{{ copy.publishDetails }}</span><TsIcon name="chevronRight" :size="14" /></button>
                </div>
                <p class="ps-panel-note"><span class="ps-save-dot" :class="saveState"></span>{{ saveStateText }}</p>
              </div>
            </section>
            <section id="ps-panel-notes" class="ps-panel" data-panel="notes" :class="{ 'is-collapsed': collapsedPanels.notes }">
              <h2 class="ps-panel-head"><button data-ui-part="canvas" type="button" :aria-expanded="!collapsedPanels.notes" @click="toggleCollapsed('notes')"><TsIcon name="chevronDown" :size="13" />{{ copy.notesPanel }}</button><span class="ps-panel-meta">{{ chatMessages.length }}</span></h2>
              <div class="ps-panel-body">
                <p v-if="!chatMessages.length" class="ps-panel-note">{{ copy.notesEmpty }}</p>
                <div v-for="message in chatMessages" :key="message.id" class="ps-note"><time>{{ message.time }}</time><p>{{ message.text }}</p></div>
                <form class="ps-note-form" @submit.prevent="sendLocalMessage"><input v-model="chatMessage" type="text" maxlength="200" autocomplete="off" :aria-label="copy.messagePlaceholder" :placeholder="copy.messagePlaceholder"><button data-ui="secondary" data-size="compact" class="ps-btn" type="submit">{{ copy.sendMessage }}</button></form>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </section>

    <Teleport to="body">
      <dialog ref="galleryDialogRef" class="ps-dialog ps-theme ps-gallery-dialog" :aria-label="copy.gallery" @close="galleryOpen = false" @click.self="galleryDialogRef.close()">
        <section id="arena-gallery-panel" class="ps-gallery" :aria-busy="gallery.loading">
          <header class="ps-dialog-head">
            <h2>{{ copy.gallery }}</h2>
            <div class="ps-segmented" role="group" :aria-label="copy.gallery">
              <button data-ui-part="canvas" :class="{ active: gallery.sort === 'latest' }" :aria-pressed="gallery.sort === 'latest'" type="button" @click="gallery.sort = 'latest'">{{ copy.latest }}</button>
              <button data-ui-part="canvas" :class="{ active: gallery.sort === 'hot' }" :aria-pressed="gallery.sort === 'hot'" type="button" @click="gallery.sort = 'hot'">{{ copy.hot }}</button>
            </div>
            <button data-ui-part="canvas" class="ps-icon-btn" type="button" :disabled="gallery.loading" :aria-busy="gallery.loading" :aria-label="copy.refresh" :data-tip="copy.refresh" @click="loadArtworks()"><TsIcon name="refresh" :size="17" /></button>
            <button data-ui-part="canvas" class="ps-icon-btn" type="button" :aria-label="copy.close" @click="galleryDialogRef.close()"><TsIcon name="x" :size="19" /></button>
          </header>
          <div class="ps-gallery-scroll" data-lenis-prevent>
            <LoadingSkeleton v-if="gallery.loading" variant="pixel" :count="4" :label="copy.loading" />
            <div v-else-if="gallery.error" class="ps-gallery-empty is-error" role="alert">{{ gallery.error }}</div>
            <div v-else-if="!gallery.items.length" class="ps-gallery-empty">{{ copy.emptyGallery }}</div>
            <div v-else class="pixel-gallery-grid">
              <article v-for="artwork in gallery.items" :id="'pixel-art-' + artwork.id" :key="artwork.id" class="pixel-art-card">
                <button data-ui-part="canvas"
                  class="pixel-art-preview"
                  type="button"
                  :aria-label="artwork.title || copy.gallery"
                  :style="{ '--grid-width': artworkPreviewWidth(artwork), '--grid-height': artworkPreviewHeight(artwork), backgroundColor: artworkBackground(artwork) }"
                  @click="openArtworkPreview(artwork)"
                >
                  <PixelCanvasCells
                    :pixels="artworkPixels(artwork)"
                    :palette="artworkPalette(artwork)"
                    :width="artworkPreviewWidth(artwork)"
                    :height="artworkPreviewHeight(artwork)"
                    :cell-size="1"
                    :background-color="artworkBackground(artwork)"
                    :show-grid="false"
                    :interactive="false"
                    defer-offscreen
                    :aria-label="artwork.title || copy.gallery"
                  />
                </button>
                <div class="pixel-art-body">
                  <div class="pixel-art-title-row"><h3>{{ artwork.title }}</h3><span>#{{ artwork.id }}</span></div>
                  <p v-if="artwork.description">{{ artwork.description }}</p>
                  <div class="pixel-art-author">
                    <span class="pixel-art-avatar">
                      <img v-if="artwork.avatar" :src="artwork.avatar" :alt="artwork.author_nickname || artwork.author" loading="lazy" decoding="async">
                      <span v-else>{{ artworkInitial(artwork.author_nickname || artwork.author) }}</span>
                    </span>
                    <span class="pixel-art-author-name">{{ artwork.author_nickname || artwork.author || props.t.brand }}</span>
                    <UserLevelBadge v-if="artwork.author_id" :level="userLevel(artwork.author_id)" :lang="lang" compact :show-title="false" />
                    <time>{{ formatDate(artwork.created_at) }}</time>
                  </div>
                </div>
                <div class="pixel-art-actions">
                  <button data-ui="quiet" data-size="compact" class="ps-chip-btn like-btn" :class="{ liked: isArtworkLiked(artwork) }" :aria-pressed="isArtworkLiked(artwork)" :aria-label="`${isArtworkLiked(artwork) ? copy.liked : copy.like} ${formatNumber(artwork.like_count)}`" type="button" @click="likeArtwork(artwork)"><TsIcon name="heart" :size="15" /><span>{{ formatNumber(artwork.like_count) }}</span></button>
                  <button data-ui="quiet" data-size="compact" class="ps-chip-btn" type="button" :aria-label="copy.download" @click="downloadArtwork(artwork)"><TsIcon name="download" :size="15" /><span>PNG</span></button>
                  <button data-ui="quiet" data-size="compact" class="ps-chip-btn" type="button" :aria-label="copy.shareLink" @click="openArtworkShare(artwork)"><TsIcon name="external" :size="15" /><span>{{ copy.shareLink }}</span></button>
                </div>
              </article>
            </div>
            <nav v-if="!gallery.loading && gallery.totalPages > 1" class="ps-pager" :aria-label="copy.pager">
              <button data-ui-part="canvas" class="ps-icon-btn" type="button" :disabled="gallery.page <= 1" :aria-label="copy.prevPage" @click="loadArtworks(gallery.page - 1)"><TsIcon name="arrowLeft" :size="16" /></button>
              <span>{{ gallery.page }} / {{ gallery.totalPages }}</span>
              <button data-ui-part="canvas" class="ps-icon-btn" type="button" :disabled="gallery.page >= gallery.totalPages" :aria-label="copy.nextPage" @click="loadArtworks(gallery.page + 1)"><TsIcon name="arrowRight" :size="16" /></button>
            </nav>
          </div>
        </section>
      </dialog>

      <dialog ref="publishDialogRef" class="ps-dialog ps-theme ps-form-dialog" :aria-label="copy.publishDetails" @click.self="publishDialogRef.close()">
        <header class="ps-dialog-head"><h2>{{ copy.publishDetails }}</h2><button data-ui-part="canvas" class="ps-icon-btn" type="button" :aria-label="copy.close" @click="publishDialogRef.close()"><TsIcon name="x" :size="19" /></button></header>
        <div class="ps-dialog-preview" :style="{ backgroundColor }"><PixelCanvasCells :pixels="pixels" :palette="activePalette" :width="canvasWidth" :height="canvasHeight" :cell-size="1" :background-color="backgroundColor" :show-grid="false" :interactive="false" :aria-label="copy.navigatorPanel" /></div>
        <form @submit.prevent="shareArtwork">
          <label class="ps-input-field"><span>{{ copy.draftPlaceholder }}</span><input ref="titleInputRef" v-model="form.title" maxlength="40" type="text" autocomplete="off" required :placeholder="copy.draftPlaceholder"><small>{{ form.title.length }}/40</small></label>
          <label class="ps-input-field"><span>{{ copy.descPlaceholder }}</span><textarea v-model="form.description" maxlength="120" rows="3" :placeholder="copy.descPlaceholder"></textarea><small>{{ form.description.length }}/120</small></label>
          <footer class="ps-dialog-foot"><button data-ui="secondary" data-size="compact" class="ps-btn" type="button" @click="publishDialogRef.close()">{{ copy.cancel }}</button><button data-ui="primary" data-size="compact" class="ps-btn ps-btn-primary" type="submit" :disabled="isPublishing"><TsIcon name="send" :size="15" />{{ publishButtonText }}</button></footer>
        </form>
      </dialog>

      <dialog ref="exportDialogRef" class="ps-dialog ps-theme ps-form-dialog" :aria-label="copy.download" @click.self="exportDialogRef.close()" @close="exportPreview = ''">
        <header class="ps-dialog-head"><h2>{{ copy.download }}</h2><button data-ui-part="canvas" class="ps-icon-btn" type="button" :aria-label="copy.close" @click="exportDialogRef.close()"><TsIcon name="x" :size="19" /></button></header>
        <img v-if="exportPreview" class="ps-export-preview" :src="exportPreview" :alt="exportFilename">
        <p class="ps-dialog-text">{{ copy.exportHint }}</p>
        <footer class="ps-dialog-foot"><button data-ui="secondary" data-size="compact" class="ps-btn" type="button" @click="exportDialogRef.close()">{{ copy.close }}</button><a class="ps-btn ps-btn-primary" :href="exportPreview" :download="exportFilename"><TsIcon name="download" :size="15" />{{ copy.saveImage }}</a></footer>
      </dialog>

      <dialog ref="newDialogRef" class="ps-dialog ps-theme ps-form-dialog" :aria-label="copy.newTitle" @click.self="newDialogRef.close()">
        <header class="ps-dialog-head"><h2>{{ copy.newTitle }}</h2><button data-ui-part="canvas" class="ps-icon-btn" type="button" :aria-label="copy.close" @click="newDialogRef.close()"><TsIcon name="x" :size="19" /></button></header>
        <form @submit.prevent="createCanvas">
          <fieldset class="ps-preset-grid">
            <legend>{{ copy.canvasSize }}</legend>
            <label v-for="preset in CANVAS_PRESETS" :key="preset.width" :class="{ active: newSize === `${preset.width}x${preset.height}` }">
              <input v-model="newSize" class="ps-visually-hidden" type="radio" name="pixel-canvas-size" :value="`${preset.width}x${preset.height}`">
              <span class="ps-preset-shape" :style="{ '--w': preset.width / 192 }"></span>
              <strong>{{ preset.width }} × {{ preset.height }}</strong>
            </label>
          </fieldset>
          <p class="ps-dialog-text">{{ copy.newHint }}</p>
          <footer class="ps-dialog-foot"><button data-ui="secondary" data-size="compact" class="ps-btn" type="button" @click="newDialogRef.close()">{{ copy.cancel }}</button><button data-ui="primary" data-size="compact" class="ps-btn ps-btn-primary" type="submit">{{ copy.create }}</button></footer>
        </form>
      </dialog>

      <dialog ref="shortcutsDialogRef" class="ps-dialog ps-theme ps-form-dialog" :aria-label="copy.shortcuts" @click.self="shortcutsDialogRef.close()">
        <header class="ps-dialog-head"><h2>{{ copy.shortcuts }}</h2><button data-ui-part="canvas" class="ps-icon-btn" type="button" :aria-label="copy.close" @click="shortcutsDialogRef.close()"><TsIcon name="x" :size="19" /></button></header>
        <dl class="ps-shortcuts">
          <div v-for="row in shortcutRows" :key="row[0]"><dt>{{ row[0] }}</dt><dd><kbd>{{ row[1] }}</kbd></dd></div>
        </dl>
        <p class="ps-dialog-text"><TsIcon name="smartphone" :size="14" /> {{ copy.gestureHint }}</p>
      </dialog>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="previewArtwork"
        class="arena-art-lightbox ps-theme"
        role="presentation"
        @pointerdown.self="closeArtworkPreview"
        @click.self="closeArtworkPreview"
      >
        <section class="arena-art-lightbox-card" role="dialog" aria-modal="true" :aria-label="previewArtwork.title || copy.gallery">
          <button data-ui-part="canvas" class="arena-art-lightbox-close ps-icon-btn" type="button" :aria-label="copy.close" @click.stop.prevent="closeArtworkPreview">
            <TsIcon name="x" :size="18" />
          </button>
          <div class="arena-art-lightbox-canvas" :style="{ backgroundColor: artworkBackground(previewArtwork), aspectRatio: `${artworkWidth(previewArtwork)} / ${artworkHeight(previewArtwork)}` }">
            <PixelCanvasCells
              :pixels="artworkPixels(previewArtwork)"
              :palette="artworkPalette(previewArtwork)"
              :width="artworkWidth(previewArtwork)"
              :height="artworkHeight(previewArtwork)"
              :cell-size="4"
              :background-color="artworkBackground(previewArtwork)"
              :show-grid="false"
              :interactive="false"
              :aria-label="previewArtwork.title || copy.gallery"
            />
          </div>
          <footer class="arena-art-lightbox-footer">
            <div>
              <strong>{{ previewArtwork.title || copy.gallery }}</strong>
              <span>{{ copy.by }} {{ previewArtwork.author_nickname || previewArtwork.author || props.t.brand }} · {{ artworkWidth(previewArtwork) }} × {{ artworkHeight(previewArtwork) }}</span>
            </div>
            <div class="arena-art-lightbox-actions">
              <button data-ui="secondary" data-size="compact" class="ps-btn" type="button" @click="openArtworkShare(previewArtwork)"><TsIcon name="external" :size="16" /><span>{{ copy.shareLink }}</span></button>
              <button data-ui="primary" data-size="compact" class="ps-btn ps-btn-primary" type="button" @click="downloadArtwork(previewArtwork)"><TsIcon name="download" :size="16" /><span>{{ copy.download }}</span></button>
            </div>
          </footer>
        </section>
      </div>
    </Teleport>

    <SocialShareDialog
      :open="artworkShareOpen"
      :title="artworkSharePayload.title"
      :text="artworkSharePayload.text"
      :url="artworkSharePayload.url"
      :image-url="artworkSharePayload.imageUrl"
      :download-url="artworkSharePayload.downloadUrl"
      :download-name="artworkSharePayload.downloadName"
      :lang="lang"
      @close="artworkShareOpen = false"
    />
  </main>
</template>
