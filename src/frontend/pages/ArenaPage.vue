<script setup>
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
const MAX_ZOOM = 260;
const MAX_CUSTOM_COLORS = 52;
const MAX_IMAGE_COLORS = 32;
const SIGN_IN_DRAFT_KEY = 'tsukuyomi-pixel-sign-in-draft-v1';
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
const backgroundPresets = ['#ffffff', '#f7f7f7', '#edf8ff', '#ffd1e8', '#172033', '#0b1020'];
const decodedArtworkPreviews = new WeakMap();
const fullArtworkCache = new Map();

const copy = computed(() => props.lang === 'en' ? {
  kicker: 'Tsukuyomi Pixel Atelier',
  title: 'Moonlit Pixel Workshop',
  subtitle: 'Choose a tool and color, draw on the grid, then export or publish your piece.',
  channel: 'Drawing flow',
  channelValue: 'Choose · Draw · Save',
  onlineRoom: 'Drawing session notes',
  draftTitle: 'New artwork',
  draftPlaceholder: 'Artwork title',
  descPlaceholder: 'Leave a short note about this piece',
  share: 'Publish artwork',
  saveUpdate: 'Save update',
  loginToShare: 'Sign in to publish',
  clear: 'Clear canvas',
  undo: 'Undo',
  redo: 'Redo',
  sample: 'Load moon example',
  download: 'Export PNG',
  brush: 'Brush',
  eraser: 'Eraser',
  fill: 'Fill',
  move: 'Move',
  zoom: 'Zoom',
  layers: 'Layers',
  brushSize: 'Brush size',
  pressure: 'Pen pressure',
  stabilizer: 'Pen smoothing',
  chat: 'Session notes',
  connected: 'Only available in this session',
  messagePlaceholder: 'Write down an idea for this drawing...',
  sendMessage: 'Add note',
  palette: 'Colors & settings',
  openTools: 'Open colors and settings',
  closeTools: 'Close colors and settings',
  quickColors: 'Quick colors', currentColor: 'Current color', moreColors: 'More colors',
  finishArtwork: 'Finish artwork', publishDetails: 'Artwork details',
  fitCanvas: 'Fit canvas', drawingGuide: 'How to draw',
  moveHint: 'Move mode: drag the canvas to explore. Choose Brush to start drawing.',
  brushHint: 'Brush mode: drag to draw. Zoom in for finer details.',
  eraserHint: 'Eraser mode: drag to remove pixels. Undo restores a mistake.',
  fillHint: 'Fill mode: tap an area to color connected pixels.',
  guideSteps: ['Pick Brush and a color to draw.', 'Use Move to navigate, or zoom in for details.', 'Undo mistakes; export PNG anytime. Add a title to publish.'],
  notesEmpty: 'Keep a quick idea here while you draw. Notes disappear when you leave this page.',
  draftRestored: 'Your drawing is ready to continue.',
  presets: 'Preset colors',
  freeColor: 'Custom color',
  addColor: 'Save color',
  colorLimit: 'The 64-color palette is full',
  canvasSize: 'Rectangular grid',
  imageImport: 'Import image',
  uploadImage: 'Convert an image to pixel art',
  imageConverted: 'Image converted to pixel art',
  imageLoadFailed: 'Unable to load image',
  imageTypeInvalid: 'Choose an image file',
  background: 'Canvas background',
  colors: 'Colors',
  size: 'Grid',
  gallery: 'Community artwork',
  openGallery: 'Open community artwork',
  closeGallery: 'Close community artwork',
  latest: 'Latest',
  hot: 'Popular',
  refresh: 'Refresh',
  empty: 'No public artwork yet. The first moonlit piece can begin here.',
  loading: 'Syncing...',
  like: 'Like',
  liked: 'Liked',
  publishOk: 'Artwork shared',
  updateOk: 'Artwork updated',
  publishFailed: 'Unable to share artwork',
  titleRequired: 'Give your artwork a title first',
  blankCanvas: 'The canvas is still empty',
  likedToast: 'Artwork liked',
  alreadyLiked: 'You already liked this artwork',
  shareLink: 'Share',
  by: 'by'
} : props.lang === 'ja' ? {
  kicker: 'Tsukuyomi Pixel Atelier',
  title: '月光ピクセル工房',
  subtitle: '道具と色を選んで描き、PNGを書き出すか作品を投稿しましょう。',
  channel: '制作の流れ',
  channelValue: '選ぶ · 描く · 保存',
  onlineRoom: '制作メモ',
  draftTitle: '新しい作品',
  draftPlaceholder: '作品名',
  descPlaceholder: 'ひとことメモ',
  share: '投稿する',
  saveUpdate: '更新を保存',
  loginToShare: 'ログインして投稿',
  clear: '画布を消去',
  undo: '戻す',
  redo: '進む',
  sample: '月の見本を読み込む',
  download: 'PNG',
  brush: 'ブラシ',
  eraser: '消しゴム',
  fill: '塗りつぶし',
  move: '移動',
  zoom: 'ズーム',
  layers: 'レイヤー',
  brushSize: 'ブラシサイズ',
  pressure: 'ペンの筆圧',
  stabilizer: 'ペンの手ぶれ補正',
  chat: '制作メモ',
  connected: 'この画面でのみ表示',
  messagePlaceholder: 'アイデアをメモする...',
  sendMessage: 'メモを追加',
  palette: '色と設定',
  openTools: '色と設定を開く',
  closeTools: '色と設定を閉じる',
  quickColors: 'よく使う色', currentColor: '現在の色', moreColors: 'ほかの色',
  finishArtwork: '作品を仕上げる', publishDetails: '作品情報',
  fitCanvas: '全体を表示', drawingGuide: '描き方',
  moveHint: '移動モード：画布をドラッグできます。描くにはブラシを選んでください。',
  brushHint: 'ブラシモード：ドラッグして描けます。拡大すると細部を描きやすくなります。',
  eraserHint: '消しゴムモード：ドラッグして消します。元に戻すこともできます。',
  fillHint: '塗りつぶしモード：領域をタップして色を塗ります。',
  guideSteps: ['ブラシと色を選んで描きます。', '移動や拡大で細部を確認します。', '元に戻す、PNG書き出し、作品名を付けて投稿できます。'],
  notesEmpty: '描きながらアイデアをメモできます。この画面を離れると消えます。',
  draftRestored: '描きかけの作品を復元しました。',
  presets: 'プリセット',
  freeColor: '自由色',
  addColor: '色を保存',
  colorLimit: '64色パレットがいっぱいです',
  canvasSize: '矩形グリッド',
  imageImport: '画像から変換',
  uploadImage: '画像をピクセル化',
  imageConverted: '画像をピクセル画に変換しました',
  imageLoadFailed: '画像を読み込めませんでした',
  imageTypeInvalid: '画像ファイルを選んでください',
  background: '背景色',
  colors: '色',
  size: 'グリッド',
  gallery: 'みんなの作品',
  openGallery: 'みんなの作品を開く',
  closeGallery: 'みんなの作品を閉じる',
  latest: '新着',
  hot: '人気',
  refresh: '更新',
  empty: 'まだ作品はありません。最初の一枚を置いていきましょう。',
  loading: '同期中...',
  like: 'いいね',
  liked: 'いいね済み',
  publishOk: '作品を共有しました',
  updateOk: '作品を更新しました',
  publishFailed: '共有に失敗しました',
  titleRequired: '作品名を入れてください',
  blankCanvas: 'キャンバスはまだ空です',
  likedToast: 'いいねしました',
  alreadyLiked: 'すでにいいねしています',
  shareLink: '共有',
  by: 'by'
} : {
  kicker: 'Tsukuyomi Pixel Atelier',
  title: '月光像素工坊',
  subtitle: '选好工具和颜色，在网格上画画；完成后可导出 PNG 或发布作品。',
  channel: '画画步骤',
  channelValue: '选色 · 画画 · 保存',
  onlineRoom: '画画便签',
  draftTitle: '新作品',
  draftPlaceholder: '作品名',
  descPlaceholder: '给这幅画留一句话',
  share: '发布作品',
  saveUpdate: '保存更新',
  loginToShare: '登录后发布',
  clear: '清空画布',
  undo: '撤销',
  redo: '重做',
  sample: '载入月纹示例',
  download: '导出 PNG',
  brush: '画笔',
  eraser: '橡皮',
  fill: '填充',
  move: '移动',
  zoom: '缩放',
  layers: '图层',
  brushSize: '画笔大小',
  pressure: '触控笔笔压',
  stabilizer: '触控笔防抖',
  chat: '画画便签',
  connected: '仅在本次打开期间保留',
  messagePlaceholder: '记下这幅画的灵感...',
  sendMessage: '添加便签',
  palette: '颜色与设置',
  openTools: '展开颜色与设置',
  closeTools: '收起颜色与设置',
  quickColors: '常用颜色', currentColor: '当前颜色', moreColors: '更多颜色',
  finishArtwork: '完成作品', publishDetails: '作品信息',
  fitCanvas: '适应画布', drawingGuide: '怎么画',
  moveHint: '当前是移动模式：可以拖动画布。点「画笔」就能开始画。',
  brushHint: '拖动即可画画；放大后更容易画细节。',
  eraserHint: '拖动擦除像素，误删可点撤销。',
  fillHint: '点一下区域，就能填充相连的像素。',
  guideSteps: ['选画笔和颜色，再到画布上下笔。', '用移动工具查看画布，放大后画细节。', '画错可撤销；随时导出 PNG，填写作品名后可发布。'],
  notesEmpty: '可以临时记下灵感；离开页面后便签会消失。',
  draftRestored: '已恢复画画草稿，可以继续创作。',
  presets: '预设色',
  freeColor: '自由颜色',
  addColor: '保存颜色',
  colorLimit: '64 色调色板已满',
  canvasSize: '长方形网格',
  imageImport: '图片导入',
  uploadImage: '上传图片转像素画',
  imageConverted: '图片已转换为像素画',
  imageLoadFailed: '图片读取失败',
  imageTypeInvalid: '请上传图片文件',
  background: '画布背景',
  colors: '颜色',
  size: '网格',
  gallery: '大家的作品',
  openGallery: '展开大家的作品',
  closeGallery: '收起大家的作品',
  latest: '最新',
  hot: '热门',
  refresh: '刷新',
  empty: '还没有公开作品。第一幅月光像素画可以从这里开始。',
  loading: '同步中...',
  like: '点赞',
  liked: '已赞',
  publishOk: '作品已分享',
  updateOk: '作品已更新',
  publishFailed: '分享失败',
  titleRequired: '请先给作品取个名字',
  blankCanvas: '画布还是空的',
  likedToast: '已点赞',
  alreadyLiked: '已经点过赞了',
  shareLink: '分享',
  by: 'by'
});

function initialCanvasTool() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'brush';
  return window.matchMedia('(max-width: 760px) and (pointer: coarse)').matches ? 'move' : 'brush';
}

const session = ref(getSession());
const selectedColor = ref(presetPalette[3]);
const customColor = ref('#ff5f96');
const customColors = ref([]);
const backgroundColor = ref('#ffffff');
const tool = ref(initialCanvasTool());
const isDrawing = ref(false);
const canvasWidth = ref(DEFAULT_CANVAS_PRESET.width);
const canvasHeight = ref(DEFAULT_CANVAS_PRESET.height);
const pixels = ref(blankPixels(DEFAULT_CANVAS_PRESET.width, DEFAULT_CANVAS_PRESET.height));
const brushSize = ref(1);
const pressureEnabled = ref(true);
const stabilizerEnabled = ref(true);
const zoom = ref(DEFAULT_ZOOM);
const canvasViewportRef = ref(null);
const isCanvasZoomManual = ref(false);
const isSpacePanning = ref(false);
const sideTab = ref('gallery');
const controlsOpen = ref(typeof window !== 'undefined' && window.matchMedia('(min-width: 1101px)').matches);
const galleryOpen = ref(false);
const isPublishing = ref(false);
const showGrid = ref(false);
const focusMode = ref(false);
const publishDialogRef = ref(null);
const galleryDialogRef = ref(null);
const newDialogRef = ref(null);
const exportDialogRef = ref(null);
const exportPreview = ref('');
const exportFilename = ref('');
const penSettingsRef = ref(null);
const imageInputRef = ref(null);
const newSize = ref('192x108');
const coordinates = ref(null);
const recentColors = ref([]);
const draftSaved = ref(false);
const draftSaveFailed = ref(false);
const draftOwner = session.value?.user?.id || 'guest';
const localDraftKey = `tsukuyomi-pixel-draft-v2:${draftOwner}`;
let draftTimer = 0;
let previewFromGallery = false;
const workspaceCopy = computed(() => props.lang === 'en' ? {
  exportHint: 'The PNG is generated on your device. On mobile, you can also long-press the preview to save it.', saveImage: 'Save PNG', new: 'New', focus: 'Focus', exitFocus: 'Exit focus', grid: 'Grid', colors: 'Colors',
  canvasSettings: 'Canvas settings', penSettings: 'Pen settings', preview: 'Preview', recent: 'Recent colors',
  close: 'Close', cancel: 'Cancel', create: 'Create canvas', newHint: 'Your current drawing will be replaced. Export it first, or use Undo to restore it.',
  saving: 'Saving on this device…', example: 'Moonlit house example', draft: 'Local draft', saved: 'Saved on this device', saveFailed: 'Draft not saved; export a backup',
  drag: 'Space to pan · Ctrl + wheel to zoom', notes: 'Drawing notes'
} : props.lang === 'ja' ? {
  exportHint: '画像はこの端末で生成されます。スマートフォンでは長押しでも保存できます。', saveImage: 'PNGを保存', new: '新規', focus: '集中モード', exitFocus: '集中モードを終了', grid: 'グリッド', colors: '色',
  canvasSettings: '画布設定', penSettings: 'ペン設定', preview: 'プレビュー', recent: '最近の色',
  close: '閉じる', cancel: 'キャンセル', create: '画布を作成', newHint: '現在の作品を置き換えます。先に書き出すか、元に戻すで復元できます。',
  saving: 'この端末に保存中…', example: '月光の家の見本', draft: 'ローカル下書き', saved: 'この端末に保存済み', saveFailed: '保存できません。書き出して保管してください',
  drag: 'Space で移動 · Ctrl + ホイールで拡大', notes: '制作メモ'
} : {
  exportHint: 'PNG 已在当前设备生成，手机也可长按预览保存图片。', saveImage: '保存 PNG', new: '新建', focus: '专注绘画', exitFocus: '退出专注', grid: '网格', colors: '颜色',
  canvasSettings: '画布设置', penSettings: '触控笔设置', preview: '画面预览', recent: '最近使用',
  close: '关闭', cancel: '取消', create: '新建画布', newHint: '新建将替换当前画面，请先导出保存；也可通过撤销找回。',
  saving: '正在保存到当前设备…', example: '月光小屋示例', draft: '本地草稿', saved: '已保存在当前设备', saveFailed: '草稿未保存，请导出备份',
  drag: 'Space 拖动画布 · Ctrl + 滚轮缩放', notes: '画画便签'
});
const toolOptions = computed(() => [
  { key: 'brush', icon: 'brush', label: copy.value.brush, shortcut: 'B' },
  { key: 'eraser', icon: 'eraser', label: copy.value.eraser, shortcut: 'E' },
  { key: 'fill', icon: 'paintBucket', label: copy.value.fill, shortcut: 'F' },
  { key: 'move', icon: 'move', label: copy.value.move, shortcut: 'H' }
]);
const rulerX = computed(() => Array.from({ length: 9 }, (_, i) => Math.round(canvasWidth.value * i / 8)));
const rulerY = computed(() => Array.from({ length: 7 }, (_, i) => Math.round(canvasHeight.value * i / 6)));
const currentToolLabel = computed(() => toolOptions.value.find(item => item.key === activeTool.value)?.label);
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
let canvasFitObserver = null;
let canvasFitFrame = 0;
let strokePixels = null;

const isAuthed = computed(() => Boolean(session.value));
const activeTool = computed(() => isSpacePanning.value ? 'move' : tool.value);
const activePalette = computed(() => [...presetPalette, ...customColors.value]);
const paintedCount = computed(() => pixels.value.filter(index => index >= 0).length);
const hasUndo = computed(() => undoStack.value.length > 0);
const hasRedo = computed(() => redoStack.value.length > 0);
const canvasBaseWidth = computed(() => canvasWidth.value * DISPLAY_CELL_SIZE);
const canvasBaseHeight = computed(() => canvasHeight.value * DISPLAY_CELL_SIZE);
const canvasZoomScale = computed(() => zoom.value / 100);
const canvasZoomWidth = computed(() => Math.round(canvasBaseWidth.value * canvasZoomScale.value));
const canvasZoomHeight = computed(() => Math.round(canvasBaseHeight.value * canvasZoomScale.value));
const canvasSurfaceStyle = computed(() => ({
  width: `${canvasZoomWidth.value}px`,
  height: `${canvasZoomHeight.value}px`
}));
const canvasStyle = computed(() => ({
  width: `${canvasBaseWidth.value}px`,
  height: `${canvasBaseHeight.value}px`,
  transform: `translateZ(0) scale(${canvasZoomScale.value})`,
  backgroundColor: backgroundColor.value
}));
const publishButtonText = computed(() => {
  if (!isAuthed.value) return copy.value.loginToShare;
  return editingArtwork.value ? copy.value.saveUpdate : copy.value.share;
});
const drawingHint = computed(() => ({
  brush: copy.value.brushHint,
  eraser: copy.value.eraserHint,
  fill: copy.value.fillHint,
  move: copy.value.moveHint
})[activeTool.value] || copy.value.brushHint);

function go(path) {
  emit('go', path);
}

function toggleControlsPanel() {
  controlsOpen.value = !controlsOpen.value;
  if (controlsOpen.value) focusMode.value = false;
}

async function showColorSettings() {
  controlsOpen.value = true;
  focusMode.value = false;
  await nextTick();
  customColorInputRef.value?.$el?.querySelector('input')?.focus({ preventScroll: true });
}

function toggleGalleryPanel() {
  if (galleryDialogRef.value?.open) galleryDialogRef.value.close();
  else { galleryOpen.value = true; galleryDialogRef.value?.showModal(); }
}

async function preparePublish() {
  publishDialogRef.value?.showModal();
  await nextTick();
  titleInputRef.value?.focus({ preventScroll: true });
}

async function openPenSettings() {
  controlsOpen.value = true;
  focusMode.value = false;
  await nextTick();
  if (penSettingsRef.value) {
    penSettingsRef.value.open = true;
    penSettingsRef.value.scrollIntoView({ block: 'nearest' });
  }
}

function toggleFocus() {
  focusMode.value = !focusMode.value;
  controlsOpen.value = !focusMode.value;
  scheduleCanvasFit(true);
}

function chooseColor(color) {
  if (!/^#[\da-f]{6}$/i.test(color)) return;
  const normalized = color.toLowerCase();
  selectedColor.value = normalized;
  customColor.value = normalized;
  recentColors.value = [normalized, ...recentColors.value.filter(c => c !== normalized)].slice(0, 6);
}

function trackCoordinates(event) {
  const canvas = pixelCanvasRef.value?.$el;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / rect.width * canvasWidth.value);
  const y = Math.floor((event.clientY - rect.top) / rect.height * canvasHeight.value);
  coordinates.value = x >= 0 && x < canvasWidth.value && y >= 0 && y < canvasHeight.value ? { x, y } : null;
}

function zoomWheel(event) {
  if (!(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  adjustZoom(event.deltaY < 0 ? 10 : -10);
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
  tool.value = initialCanvasTool();
  newDialogRef.value?.close();
  scheduleCanvasFit(true);
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
    brushSize.value = Math.max(1, Math.min(4, Number(draft.brushSize) || 1));
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

function addCustomColor(color = customColor.value) {
  const normalized = normalizeHexColor(color, customColor.value);
  selectedColor.value = normalized;
  customColor.value = normalized;
  if (presetPalette.includes(normalized) || customColors.value.includes(normalized)) {
    tool.value = 'brush';
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
  tool.value = 'brush';
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
    author: session.value?.user?.nickname || session.value?.user?.username || session.value?.nickname || session.value?.username || '我',
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
    brushSize.value = Math.max(1, Math.min(4, Number(draft.brushSize) || 1));
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
  sideTab.value = 'gallery';
}

function pushHistory() {
  undoStack.value.push(currentSnapshot());
  if (undoStack.value.length > 50) undoStack.value.shift();
  redoStack.value = [];
}

function clampZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value)));
}

function viewportInnerSize(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const left = Number.parseFloat(style.paddingLeft) || 0;
  const right = Number.parseFloat(style.paddingRight) || 0;
  const top = Number.parseFloat(style.paddingTop) || 0;
  const bottom = Number.parseFloat(style.paddingBottom) || 0;
  const paddingX = left + right;
  const paddingY = top + bottom;
  return {
    width: Math.max(0, rect.width - paddingX),
    height: Math.max(0, rect.height - paddingY)
  };
}

function fitCanvasToViewport(force = false) {
  if (!force && isCanvasZoomManual.value) return;
  const viewport = canvasViewportRef.value;
  if (!viewport || !canvasBaseWidth.value || !canvasBaseHeight.value) return;
  const { width, height } = viewportInnerSize(viewport);
  if (!width || !height) return;
  const scale = Math.min(width / canvasBaseWidth.value, height / canvasBaseHeight.value);
  const fittedZoom = clampZoom(Math.floor((scale * 100) / 5) * 5);
  if (Number.isFinite(fittedZoom) && Math.abs(fittedZoom - zoom.value) >= 1) {
    zoom.value = fittedZoom;
  }
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
}

function adjustZoom(delta) {
  isCanvasZoomManual.value = true;
  zoom.value = clampZoom(zoom.value + delta);
}

function resetCanvasZoom() {
  isCanvasZoomManual.value = false;
  scheduleCanvasFit(true);
}

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
  const normalizedDiameter = Math.max(1, Math.min(6, Math.round(Number(diameter) || 1)));
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

function normalizePaintIndices(payload) {
  return normalizePaintSamples(payload).map(sample => sample.index);
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
  return Math.min(6, baseSize + Math.max(0, Math.round((pressure - 0.45) * 3)));
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

function beginPaint(payload) {
  const source = normalizePaintSamples(payload);
  if (!source.length || activeTool.value === 'move') return;
  pushHistory();
  const currentTool = tool.value;
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
  if (!isDrawing.value) return;
  paintBrushPath(payload, activePaintColorIndex);
}

function endPaint() {
  if (strokePixels) flushStrokeCommit();
  strokePixels = null;
  isDrawing.value = false;
  activePaintColorIndex = -1;
}

function beginCanvasPan(sample) {
  const viewport = canvasViewportRef.value;
  if (!viewport) return;
  canvasPanState = {
    clientX: sample.clientX,
    clientY: sample.clientY,
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop
  };
}

function continueCanvasPan(sample) {
  const viewport = canvasViewportRef.value;
  if (!viewport || !canvasPanState) return;
  viewport.scrollLeft = canvasPanState.scrollLeft - (sample.clientX - canvasPanState.clientX);
  viewport.scrollTop = canvasPanState.scrollTop - (sample.clientY - canvasPanState.clientY);
}

function endCanvasPan() {
  canvasPanState = null;
}

function endCanvasInteraction() {
  endPaint();
  endCanvasPan();
}

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
    pixels.value = next; form.title = props.lang === 'en' ? 'Moonlit house' : props.lang === 'ja' ? '月光の家' : '月光小屋';
    tool.value = 'brush'; scheduleCanvasFit(true);
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
    tool.value = 'brush';
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

async function loadArtworks(page = gallery.page) {
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
    gallery.items = Array.isArray(result.data) ? result.data : [];
    await hydrateUserLevels(gallery.items.map((artwork) => artwork.author_id)).catch(() => {});
    gallery.page = nextPage;
    gallery.total = Number(result.pagination?.total || gallery.items.length);
    gallery.totalPages = Math.max(1, Math.ceil(gallery.total / PIXEL_GALLERY_PAGE_SIZE));
    focusSharedArtwork();
  } catch (error) {
    gallery.items = [];
    gallery.error = error.message || copy.value.publishFailed;
    showToast(error.message || copy.value.publishFailed, 'error');
  } finally {
    gallery.loading = false;
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
    showToast(props.lang === 'en' ? 'Artwork loaded for editing' : (props.lang === 'ja' ? '編集用に読み込みました' : '已载入像素画，可以继续编辑'));
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

function isTypingTarget(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
}

function handleArenaKeydown(event) {
  if (publishDialogRef.value?.open || galleryDialogRef.value?.open || newDialogRef.value?.open || exportDialogRef.value?.open) return;
  if (event.key === 'Escape') {
    if (previewArtwork.value) {
      closeArtworkPreview();
      return;
    }
    if (focusMode.value) { toggleFocus(); return; }
    if (controlsOpen.value || galleryOpen.value) {
      controlsOpen.value = false;
      galleryOpen.value = false;
      return;
    }
  }
  if (isTypingTarget(event.target) || publishDialogRef.value?.open || galleryDialogRef.value?.open || newDialogRef.value?.open || exportDialogRef.value?.open) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === 'y') {
    event.preventDefault();
    redo();
    return;
  }
  if (event.key === ' ') {
    event.preventDefault();
    isSpacePanning.value = true;
    return;
  }
  if (key === 'b') tool.value = 'brush';
  if (key === 'e') tool.value = 'eraser';
  if (key === 'f') tool.value = 'fill';
  if (key === 'v' || key === 'h') tool.value = 'move';
  if (event.key === '[') brushSize.value = Math.max(1, brushSize.value - 1);
  if (event.key === ']') brushSize.value = Math.min(4, brushSize.value + 1);
  if (event.key === '-' || event.key === '_') adjustZoom(-25);
  if (event.key === '=' || event.key === '+') adjustZoom(25);
}

function handleArenaKeyup(event) {
  if (event.key === ' ') isSpacePanning.value = false;
}

function artworkInitial(name) {
  return nameInitial(name, props.t.brand || '月');
}

watch([pixels, () => form.title, () => form.description, backgroundColor, customColors, brushSize, selectedColor], () => {
  draftSaved.value = false;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveLocalDraft, 700);
});
watch(() => gallery.sort, () => loadArtworks(1));
watch([canvasBaseWidth, canvasBaseHeight], () => scheduleCanvasFit());

onMounted(async () => {
  window.addEventListener('pointerup', endCanvasInteraction);
  window.addEventListener('pointercancel', endCanvasInteraction);
  window.addEventListener('keydown', handleArenaKeydown);
  window.addEventListener('keyup', handleArenaKeyup);
  window.addEventListener('resize', handleCanvasViewportResize);
  restoreLocalDraft();
  restoreDraftAfterSignIn();
  window.addEventListener('pagehide', saveLocalDraft);
  await nextTick();
  if (typeof ResizeObserver !== 'undefined' && canvasViewportRef.value) {
    canvasFitObserver = new ResizeObserver(handleCanvasViewportResize);
    canvasFitObserver.observe(canvasViewportRef.value);
  }
  scheduleCanvasFit(true);
  loadArtworks();
  loadArtworkForEdit();
});

onBeforeUnmount(() => {
  saveLocalDraft();
  window.removeEventListener('pagehide', saveLocalDraft);
  publishDialogRef.value?.close(); galleryDialogRef.value?.close(); newDialogRef.value?.close(); exportDialogRef.value?.close();
  window.removeEventListener('pointerup', endCanvasInteraction);
  window.removeEventListener('pointercancel', endCanvasInteraction);
  window.removeEventListener('keydown', handleArenaKeydown);
  window.removeEventListener('keyup', handleArenaKeyup);
  window.removeEventListener('resize', handleCanvasViewportResize);
  canvasFitObserver?.disconnect();
  canvasFitObserver = null;
  if (canvasFitFrame) window.cancelAnimationFrame(canvasFitFrame);
  clearTimeout(toastTimer);
});
</script>

<template>
  <main class="page arena-page pixel-workspace" :class="{ 'is-controls-open': controlsOpen, 'is-gallery-open': galleryOpen, 'is-focus-mode': focusMode }">
    <section class="pw-workbench" :aria-label="copy.title">
      <header class="pw-document">
        <div class="pw-document-name"><span class="pw-document-icon"><TsIcon name="grid" :size="19" /></span><button type="button" @click="preparePublish" :title="copy.draftPlaceholder"><h1>{{ form.title || copy.draftTitle }}</h1><TsIcon name="penLine" :size="14" /></button><span class="pw-draft-status" :title="draftSaved ? workspaceCopy.saved : draftSaveFailed ? workspaceCopy.saveFailed : workspaceCopy.saving"><TsIcon :name="draftSaved ? 'check' : 'info'" :size="14" />{{ workspaceCopy.draft }}</span></div>
        <div class="pw-document-actions">
          <button class="ghost-btn" type="button" :aria-label="copy.gallery" @click="toggleGalleryPanel" :aria-expanded="galleryOpen"><TsIcon name="image" :size="17" /><span>{{ copy.gallery }}</span></button>
          <button class="ghost-btn" type="button" :aria-label="workspaceCopy.new" @click="newDialogRef.showModal()"><TsIcon name="plus" :size="17" /><span>{{ workspaceCopy.new }}</span></button>
          <label class="ghost-btn pw-import"><TsIcon name="upload" :size="17" /><span>{{ copy.imageImport }}</span><input ref="imageInputRef" class="sr-only" type="file" accept="image/*" :aria-label="copy.uploadImage" @change="handleImageUpload"></label>
          <button class="ghost-btn" type="button" :aria-label="copy.download" @click="downloadDraft"><TsIcon name="download" :size="17" /><span>{{ copy.download }}</span></button>
          <button class="primary-btn" type="button" @click="preparePublish"><TsIcon name="send" :size="17" /><span>{{ editingArtwork ? copy.saveUpdate : copy.share }}</span></button>
        </div>
      </header>
      <div class="pw-body">
        <aside class="pw-toolbox" :aria-label="copy.drawingGuide">
          <div class="pw-tools" role="group" :aria-label="copy.drawingGuide">
            <button v-for="item in toolOptions" :key="item.key" class="icon-btn pw-tool" :class="{ active: activeTool === item.key }" :aria-pressed="activeTool === item.key" :aria-label="item.label" :title="`${item.label} (${item.shortcut})`" type="button" @click="tool = item.key"><TsIcon :name="item.icon" :size="21" /><span>{{ item.label }}</span></button>
          </div>
          <div class="pw-history" role="group" :aria-label="copy.undo"><button class="icon-btn" type="button" :disabled="!hasUndo" :aria-label="copy.undo" :title="copy.undo" @click="undo"><TsIcon name="undo" :size="20" /></button><button class="icon-btn" type="button" :disabled="!hasRedo" :aria-label="copy.redo" :title="copy.redo" @click="redo"><TsIcon name="redo" :size="20" /></button></div>
          <button class="pw-selected-color" type="button" :style="{ backgroundColor: selectedColor }" :aria-label="copy.moreColors" @click="showColorSettings"></button>
          <button class="icon-btn pw-tool-help" type="button" :aria-label="copy.drawingGuide" @click="openPenSettings"><TsIcon name="helpCircle" :size="19" /></button>
        </aside>
        <div class="pw-center arena-canvas-panel">
          <div class="pw-context" role="toolbar" :aria-label="copy.drawingGuide">
            <span class="pw-current-tool"><TsIcon :name="toolOptions.find(item => item.key === activeTool)?.icon || 'brush'" :size="16" />{{ currentToolLabel }}</span>
            <label class="pw-brush-size"><span>{{ copy.brushSize }}</span><input v-model.number="brushSize" type="range" min="1" max="4" step="1" :aria-label="copy.brushSize"><strong>{{ brushSize }} px</strong></label>
            <button class="ghost-btn pw-pen-options" type="button" @click="openPenSettings"><TsIcon name="sliders" :size="15" /><span>{{ workspaceCopy.penSettings }}</span></button>
            <div class="pw-view-actions">
              <button class="ghost-btn" type="button" :class="{ active: showGrid }" :aria-pressed="showGrid" @click="showGrid = !showGrid"><TsIcon name="grid" :size="15" /><span>{{ workspaceCopy.grid }}</span></button>
              <button class="ghost-btn pw-fit-top" type="button" @click="resetCanvasZoom"><TsIcon name="maximize" :size="15" /><span>{{ copy.fitCanvas }}</span></button>
              <button class="ghost-btn" type="button" :aria-pressed="focusMode" @click="toggleFocus"><TsIcon name="maximize" :size="15" /><span>{{ focusMode ? workspaceCopy.exitFocus : workspaceCopy.focus }}</span></button>
              <button class="ghost-btn pw-restore-colors" type="button" :aria-expanded="controlsOpen" aria-controls="arena-controls-panel" @click="toggleControlsPanel"><TsIcon name="palette" :size="17" /><span>{{ workspaceCopy.colors }}</span></button>
            </div>
          </div>
          <div ref="canvasViewportRef" class="arena-canvas-viewport" @wheel="zoomWheel">
            <div class="pw-canvas-world">
              <div class="pixel-canvas-zoom-surface" :style="canvasSurfaceStyle">
                <div class="pw-ruler pw-ruler-x" aria-hidden="true"><span v-for="(value, index) in rulerX" :key="index" :style="{ left: `${index * 12.5}%` }">{{ value }}</span></div>
                <div class="pw-ruler pw-ruler-y" aria-hidden="true"><span v-for="(value, index) in rulerY" :key="index" :style="{ top: `${index * 100 / 6}%` }">{{ value }}</span></div>
                <div class="pixel-canvas" :style="canvasStyle" @dragstart.prevent @pointermove="trackCoordinates" @pointerleave="coordinates = null">
                  <PixelCanvasCells ref="pixelCanvasRef" :pixels="pixels" :palette="activePalette" :width="canvasWidth" :height="canvasHeight" :cell-size="DISPLAY_CELL_SIZE" :tool="activeTool" :show-grid="showGrid" :stabilizer="stabilizerEnabled" @begin-paint="beginPaint" @continue-paint="continuePaint" @end-paint="endPaint" @begin-pan="beginCanvasPan" @continue-pan="continueCanvasPan" @end-pan="endCanvasPan" />
                </div>
              </div>
            </div>
          </div>
          <footer class="pw-statusbar">
            <span>{{ canvasWidth }} × {{ canvasHeight }} px</span><span class="pw-shortcuts">{{ workspaceCopy.drag }}</span>
            <span class="pw-coordinates">X: {{ coordinates?.x ?? '—' }} &nbsp; Y: {{ coordinates?.y ?? '—' }}</span>
            <div class="arena-zoom-controls" role="group" :aria-label="copy.zoom"><button class="icon-btn" type="button" :aria-label="`${copy.zoom} -`" @click="adjustZoom(-10)"><TsIcon name="minus" :size="15" /></button><strong>{{ zoom }}%</strong><button class="icon-btn" type="button" :aria-label="`${copy.zoom} +`" @click="adjustZoom(10)"><TsIcon name="plus" :size="15" /></button><button class="ghost-btn" type="button" @click="resetCanvasZoom">{{ copy.fitCanvas }}</button></div>
          </footer>
          <div class="pw-mobile-hint" role="status"><TsIcon :name="activeTool === 'move' ? 'move' : 'brush'" :size="15" /><span>{{ drawingHint }}</span></div>
        </div>
        <aside id="arena-controls-panel" class="arena-controls pw-properties" :aria-label="copy.palette" :inert="!controlsOpen">
          <header class="pw-properties-head"><h2>{{ workspaceCopy.colors }}</h2><button class="icon-btn" type="button" :aria-label="copy.closeTools" :aria-expanded="controlsOpen" aria-controls="arena-controls-panel" @click="toggleControlsPanel"><TsIcon name="chevronRight" :size="18" /></button></header>
          <div class="pw-property-section">
            <PixelColorPicker ref="customColorInputRef" :model-value="selectedColor" :label="copy.freeColor" @update:model-value="chooseColor" />
            <div class="pw-property-label"><strong>{{ copy.presets }}</strong><span>{{ copy.kicker }}</span></div>
            <div class="pixel-palette pw-palette" role="group" :aria-label="copy.presets"><button v-for="color in [...presetPalette, ...studioColors]" :key="color" class="pixel-swatch" :class="{ active: selectedColor === color }" type="button" :style="{ backgroundColor: color }" :aria-label="`${copy.presets} ${color}`" :aria-pressed="selectedColor === color" @click="chooseColor(color)"><TsIcon v-if="selectedColor === color" name="check" :size="14" /></button></div>
            <div v-if="recentColors.length" class="pw-recent"><span>{{ workspaceCopy.recent }}</span><div class="pixel-palette pw-palette"><button v-for="color in recentColors" :key="color" class="pixel-swatch" :style="{ backgroundColor: color }" :aria-label="`${workspaceCopy.recent} ${color}`" type="button" @click="chooseColor(color)"></button></div></div>
            <details v-if="customColors.length" class="pw-custom-colors"><summary>{{ copy.freeColor }} <span>{{ customColors.length }}</span></summary><div class="pixel-palette pw-palette"><button v-for="color in customColors" :key="color" class="pixel-swatch" :style="{ backgroundColor: color }" :aria-pressed="selectedColor === color" :aria-label="`${copy.freeColor} ${color}`" type="button" @click="chooseColor(color)"></button></div></details>
          </div>
          <details class="pw-setting"><summary><TsIcon name="grid" :size="16" />{{ workspaceCopy.canvasSettings }}<small>{{ canvasWidth }} × {{ canvasHeight }}</small><TsIcon name="chevronRight" :size="13" /></summary><div class="pw-setting-content"><label>{{ copy.background }}<input :value="backgroundColor" type="color" :aria-label="copy.background" @change="setBackgroundColor($event.target.value)"></label><div class="pixel-palette pw-palette"><button v-for="color in backgroundPresets" :key="color" class="pixel-swatch" :style="{ backgroundColor: color }" :aria-label="`${copy.background} ${color}`" type="button" @click="setBackgroundColor(color)"></button></div><button class="ghost-btn" type="button" @click="newDialogRef.showModal()"><TsIcon name="plus" :size="15" />{{ workspaceCopy.create }}</button><button class="ghost-btn" type="button" @click="applyMoonPattern"><TsIcon name="moon" :size="15" />{{ workspaceCopy.example }}</button><button class="ghost-btn" type="button" :disabled="!paintedCount" @click="clearCanvas"><TsIcon name="trash" :size="15" />{{ copy.clear }}</button></div></details>
          <details ref="penSettingsRef" class="pw-setting"><summary><TsIcon name="sliders" :size="16" />{{ workspaceCopy.penSettings }}<TsIcon name="chevronRight" :size="13" /></summary><div class="pw-setting-content"><label><input v-model="pressureEnabled" type="checkbox">{{ copy.pressure }}</label><label><input v-model="stabilizerEnabled" type="checkbox">{{ copy.stabilizer }}</label><p>{{ drawingHint }}</p><ol><li v-for="step in copy.guideSteps" :key="step">{{ step }}</li></ol></div></details>
          <details class="pw-setting"><summary><TsIcon name="penLine" :size="16" />{{ workspaceCopy.notes }}<small>{{ chatMessages.length }}</small><TsIcon name="chevronRight" :size="13" /></summary><div class="pw-setting-content"><p>{{ copy.notesEmpty }}</p><div v-for="message in chatMessages" :key="message.id" class="pw-note"><time>{{ message.time }}</time><p>{{ message.text }}</p></div><form @submit.prevent="sendLocalMessage"><input v-model="chatMessage" type="text" maxlength="200" autocomplete="off" :aria-label="copy.messagePlaceholder" :placeholder="copy.messagePlaceholder"><button class="ghost-btn" type="submit">{{ copy.sendMessage }}</button></form></div></details>
          <div class="pw-navigator"><div class="pw-property-label"><span>{{ workspaceCopy.preview }}</span><TsIcon name="eye" :size="15" /></div><div class="pw-navigator-frame"><PixelCanvasCells :pixels="pixels" :palette="activePalette" :width="canvasWidth" :height="canvasHeight" :cell-size="1" :background-color="backgroundColor" :show-grid="false" :interactive="false" :aria-label="workspaceCopy.preview" /></div><p>{{ canvasWidth }} × {{ canvasHeight }}</p></div>
        </aside>
        <button v-if="controlsOpen" class="pw-properties-scrim" type="button" :aria-label="copy.closeTools" @click="controlsOpen = false"></button>
      </div>
    </section>
    <Teleport to="body">
      <dialog ref="galleryDialogRef" class="pw-dialog pw-gallery-dialog" :aria-label="copy.gallery" @close="galleryOpen = false" @click.self="galleryDialogRef.close()">
    <section
      id="arena-gallery-panel"
      class="arena-gallery panel"
      :aria-busy="sideTab === 'gallery' && gallery.loading"
    >
      <button class="pw-gallery-close icon-btn" type="button" :aria-label="workspaceCopy.close" @click="galleryDialogRef.close()"><TsIcon name="x" :size="20" /></button>
      <div class="arena-section-head arena-gallery-head">
        <div>
          <span>03</span>
          <h2>{{ copy.gallery }}</h2>
        </div>
        <div class="arena-gallery-tools">
          <div v-if="sideTab === 'gallery'" class="arena-gallery-sort" role="group" :aria-label="copy.gallery">
            <button class="chip" :class="{ active: gallery.sort === 'latest' }" :aria-pressed="gallery.sort === 'latest'" type="button" @click="gallery.sort = 'latest'">{{ copy.latest }}</button>
            <button class="chip" :class="{ active: gallery.sort === 'hot' }" :aria-pressed="gallery.sort === 'hot'" type="button" @click="gallery.sort = 'hot'">{{ copy.hot }}</button>
          </div>
          <button v-if="sideTab === 'gallery'" class="ghost-btn" type="button" :disabled="gallery.loading" :aria-busy="gallery.loading" @click="loadArtworks">
            <TsIcon name="refresh" :size="17" />
            <span>{{ copy.refresh }}</span>
          </button>
        </div>
      </div>

      <LoadingSkeleton v-if="gallery.loading" variant="pixel" :count="4" :label="copy.loading" />
      <div v-else-if="gallery.error" class="arena-empty error" role="alert">{{ gallery.error }}</div>
      <div v-else-if="!gallery.items.length" class="arena-empty">{{ copy.empty }}</div>
      <div v-else class="pixel-gallery-grid">
        <article
          v-for="artwork in gallery.items"
          :id="'pixel-art-' + artwork.id"
          :key="artwork.id"
          class="pixel-art-card"
        >
          <button
            class="pixel-art-preview"
            type="button"
            :title="artwork.title || copy.gallery"
            :aria-label="artwork.title || copy.gallery"
            :style="{
              '--grid-width': artworkPreviewWidth(artwork),
              '--grid-height': artworkPreviewHeight(artwork),
              '--canvas-bg': artworkBackground(artwork)
            }"
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
            <div class="pixel-art-title-row">
              <h3>{{ artwork.title }}</h3>
              <span>#{{ artwork.id }}</span>
            </div>
            <p v-if="artwork.description">{{ artwork.description }}</p>
            <div class="pixel-art-author">
              <span class="pixel-art-avatar">
                <img v-if="artwork.avatar" :src="artwork.avatar" :alt="artwork.author_nickname || artwork.author" loading="lazy" decoding="async">
                <span v-else>{{ artworkInitial(artwork.author_nickname || artwork.author) }}</span>
              </span>
              <span>{{ copy.by }} {{ artwork.author_nickname || artwork.author || props.t.brand }}</span>
              <UserLevelBadge v-if="artwork.author_id" :level="userLevel(artwork.author_id)" :lang="lang" compact :show-title="false" />
              <time>{{ formatDate(artwork.created_at) }}</time>
            </div>
          </div>
          <div class="pixel-art-actions">
            <button
              class="icon-btn like-btn"
              :class="{ liked: isArtworkLiked(artwork) }"
              :aria-pressed="isArtworkLiked(artwork)"
              type="button"
              @click="likeArtwork(artwork)"
            >
              <TsIcon name="heart" :size="15" />
              <span>{{ isArtworkLiked(artwork) ? copy.liked : copy.like }} {{ formatNumber(artwork.like_count) }}</span>
            </button>
            <button class="icon-btn" type="button" @click="downloadArtwork(artwork)">
              <TsIcon name="download" :size="15" />
              <span>{{ copy.download }}</span>
            </button>
            <button class="icon-btn" type="button" @click="openArtworkShare(artwork)">
              <TsIcon name="external" :size="15" />
              <span>{{ copy.shareLink }}</span>
            </button>
          </div>
        </article>
      </div>
      <nav v-if="sideTab === 'gallery' && !gallery.loading && gallery.totalPages > 1" class="arena-gallery-pager" aria-label="作品分页">
        <button class="icon-btn" type="button" :disabled="gallery.page <= 1" aria-label="上一页" @click="loadArtworks(gallery.page - 1)">
          <TsIcon name="arrowLeft" :size="16" />
        </button>
        <span>{{ gallery.page }} / {{ gallery.totalPages }}</span>
        <button class="icon-btn" type="button" :disabled="gallery.page >= gallery.totalPages" aria-label="下一页" @click="loadArtworks(gallery.page + 1)">
          <TsIcon name="arrowRight" :size="16" />
        </button>
      </nav>
    </section>

      </dialog>
      <dialog ref="publishDialogRef" class="pw-dialog pw-publish-dialog" :aria-label="copy.publishDetails" @click.self="publishDialogRef.close()">
        <header><h2>{{ copy.publishDetails }}</h2><button class="icon-btn" type="button" :aria-label="workspaceCopy.close" @click="publishDialogRef.close()"><TsIcon name="x" :size="20" /></button></header>
        <div class="pw-dialog-preview"><PixelCanvasCells :pixels="pixels" :palette="activePalette" :width="canvasWidth" :height="canvasHeight" :cell-size="1" :background-color="backgroundColor" :show-grid="false" :interactive="false" :aria-label="workspaceCopy.preview" /></div>
        <form @submit.prevent="shareArtwork">
          <label>{{ copy.draftPlaceholder }}<input ref="titleInputRef" v-model="form.title" maxlength="40" type="text" autocomplete="off" required :placeholder="copy.draftPlaceholder"></label>
          <label>{{ copy.descPlaceholder }}<textarea v-model="form.description" maxlength="120" rows="3" :placeholder="copy.descPlaceholder"></textarea></label>
          <footer><button class="ghost-btn" type="button" @click="publishDialogRef.close()">{{ workspaceCopy.cancel }}</button><button class="primary-btn" type="submit" :disabled="isPublishing"><TsIcon name="send" :size="17" />{{ publishButtonText }}</button></footer>
        </form>
      </dialog>
      <dialog ref="exportDialogRef" class="pw-dialog pw-export-dialog" :aria-label="copy.download" @click.self="exportDialogRef.close()" @close="exportPreview = ''">
        <header><h2>{{ copy.download }}</h2><button class="icon-btn" type="button" :aria-label="workspaceCopy.close" @click="exportDialogRef.close()"><TsIcon name="x" :size="19" /></button></header>
        <img v-if="exportPreview" class="pw-export-preview" :src="exportPreview" :alt="exportFilename">
        <p>{{ workspaceCopy.exportHint }}</p>
        <footer><button class="ghost-btn" type="button" @click="exportDialogRef.close()">{{ workspaceCopy.close }}</button><a class="primary-btn" :href="exportPreview" :download="exportFilename"><TsIcon name="download" :size="16" />{{ workspaceCopy.saveImage }}</a></footer>
      </dialog>
      <dialog ref="newDialogRef" class="pw-dialog" :aria-label="workspaceCopy.create" @click.self="newDialogRef.close()">
        <header><h2>{{ workspaceCopy.create }}</h2><button class="icon-btn" type="button" :aria-label="workspaceCopy.close" @click="newDialogRef.close()"><TsIcon name="x" :size="20" /></button></header>
        <p>{{ workspaceCopy.newHint }}</p><form @submit.prevent="createCanvas"><label>{{ copy.canvasSize }}<select v-model="newSize"><option v-for="preset in CANVAS_PRESETS" :key="preset.width" :value="`${preset.width}x${preset.height}`">{{ preset.width }} × {{ preset.height }}</option></select></label><footer><button class="ghost-btn" type="button" @click="newDialogRef.close()">{{ workspaceCopy.cancel }}</button><button class="primary-btn" type="submit">{{ workspaceCopy.create }}</button></footer></form>
      </dialog>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="previewArtwork"
        class="arena-art-lightbox"
        role="presentation"
        @pointerdown.self="closeArtworkPreview"
        @mousedown.self="closeArtworkPreview"
        @touchstart.self="closeArtworkPreview"
        @touchend.self="closeArtworkPreview"
        @click.self="closeArtworkPreview"
      >
        <section class="arena-art-lightbox-card" data-material="popover" role="dialog" aria-modal="true" :aria-label="previewArtwork.title || copy.gallery">
          <button
            class="arena-art-lightbox-close"
            type="button"
            :aria-label="props.lang === 'en' ? 'Close' : (props.lang === 'ja' ? '閉じる' : '关闭')"
            @pointerdown.stop.prevent="closeArtworkPreview"
            @mousedown.stop.prevent="closeArtworkPreview"
            @touchstart.stop.prevent="closeArtworkPreview"
            @touchend.stop.prevent="closeArtworkPreview"
            @click.stop.prevent="closeArtworkPreview"
          >
            <TsIcon name="x" :size="18" />
          </button>
          <div
            class="arena-art-lightbox-canvas"
            :style="{
              backgroundColor: artworkBackground(previewArtwork),
              aspectRatio: `${artworkWidth(previewArtwork)} / ${artworkHeight(previewArtwork)}`
            }"
          >
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
              <span>{{ copy.by }} {{ previewArtwork.author_nickname || previewArtwork.author || props.t.brand }} · {{ artworkWidth(previewArtwork) }}x{{ artworkHeight(previewArtwork) }}</span>
            </div>
            <div class="arena-art-lightbox-actions">
              <button class="ghost-btn" type="button" @click="openArtworkShare(previewArtwork)">
                <TsIcon name="external" :size="17" />
                <span>{{ copy.shareLink }}</span>
              </button>
              <button class="ghost-btn" type="button" @click="downloadArtwork(previewArtwork)">
                <TsIcon name="download" :size="17" />
                <span>{{ copy.download }}</span>
              </button>
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

    <div v-if="toast.visible" class="arena-toast show" :class="toast.type" :role="toast.type === 'error' ? 'alert' : 'status'">{{ toast.text }}</div>
  </main>
</template>
