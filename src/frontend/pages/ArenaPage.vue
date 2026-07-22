<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { apiFetch, authFetch, authHeaders, getSession, parseResponse } from '../api/client';
import PixelCanvasCells from '../components/PixelCanvasCells.vue';
import SocialShareDialog from '../components/SocialShareDialog.vue';
import TsIcon from '../components/TsIcon.vue';
import { formatDateTime } from '../utils/time';

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
const MIN_ZOOM = 35;
const MAX_ZOOM = 260;
const MAX_CUSTOM_COLORS = 20;
const MAX_IMAGE_COLORS = 32;
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
const backgroundPresets = ['#ffffff', '#f7f7f7', '#edf8ff', '#ffd1e8', '#172033', '#0b1020'];
const decodedArtworkPreviews = new WeakMap();
const fullArtworkCache = new Map();

const copy = computed(() => props.lang === 'ja' ? {
  kicker: 'Tsukuyomi Pixel Atelier',
  title: '月光ピクセル工房',
  subtitle: '今日の月色と小さな物語をグリッドに置いて、訪れた人の反応を待つ静かなアトリエ。',
  channel: '公開キャンバス',
  channelValue: '投稿といいねを同期中',
  onlineRoom: 'オンラインお絵描きチャット',
  draftTitle: '新しい作品',
  draftPlaceholder: '作品名',
  descPlaceholder: 'ひとことメモ',
  share: '投稿する',
  saveUpdate: '更新を保存',
  loginToShare: 'ログインして投稿',
  clear: '消去',
  undo: '戻す',
  redo: '進む',
  sample: '月模様',
  download: 'PNG',
  brush: 'ブラシ',
  eraser: '消しゴム',
  fill: '塗りつぶし',
  move: '移動',
  zoom: 'ズーム',
  layers: 'レイヤー',
  brushSize: 'Size',
  pressure: '筆圧',
  stabilizer: '手ぶれ補正',
  chat: 'チャット',
  connected: '接続中',
  messagePlaceholder: 'メッセージ...',
  sendMessage: '送信',
  palette: 'パレット',
  presets: 'プリセット',
  freeColor: '自由色',
  addColor: '色を保存',
  colorLimit: '保存できる色はここまでです',
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
  subtitle: '把今天的月色、灵感和小小角色碎片落进网格，作品会汇入公开画廊，等候新的回应。',
  channel: '公开画廊',
  channelValue: '作品与点赞实时同步',
  onlineRoom: '在线画板聊天室',
  draftTitle: '新作品',
  draftPlaceholder: '作品名',
  descPlaceholder: '给这幅画留一句话',
  share: '发布作品',
  saveUpdate: '保存更新',
  loginToShare: '登录后发布',
  clear: '清空',
  undo: '撤销',
  redo: '重做',
  sample: '月纹模板',
  download: '导出 PNG',
  brush: '画笔',
  eraser: '橡皮',
  fill: '填充',
  move: '移动',
  zoom: '缩放',
  layers: '图层',
  brushSize: 'Size',
  pressure: '笔压',
  stabilizer: '防抖',
  chat: '聊天',
  connected: '已连接',
  messagePlaceholder: '输入消息...',
  sendMessage: '发送',
  palette: '调色板',
  presets: '预设色',
  freeColor: '自由颜色',
  addColor: '保存颜色',
  colorLimit: '可保存颜色已满',
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
const chatMessage = ref('');
const chatMessages = ref([
  { id: 1, author: '蓝莓', time: '03:50', text: '晚上好' },
  { id: 2, author: '某处的无名氏', time: '07:14', text: '早上好' },
  { id: 3, author: 'heiji', time: '08:17', text: '有人吗' },
  { id: 4, author: '橘子鱼仙', time: '22:33', text: '咕咕～噢噢!!!' }
]);
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
const toast = reactive({
  text: '',
  visible: false
});

let toastTimer = 0;
let activePaintColorIndex = -1;
let canvasPanState = null;
let canvasFitObserver = null;
let canvasFitFrame = 0;
let strokePixels = null;
let strokeCommitFrame = 0;

const isAuthed = computed(() => Boolean(session.value));
const activeTool = computed(() => isSpacePanning.value ? 'move' : tool.value);
const activePalette = computed(() => [...presetPalette, ...customColors.value]);
const paintedCount = computed(() => pixels.value.filter(index => index >= 0).length);
const hasUndo = computed(() => undoStack.value.length > 0);
const hasRedo = computed(() => redoStack.value.length > 0);
const paletteStyle = computed(() => ({
  '--palette-size': activePalette.value.length
}));
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

function go(path) {
  emit('go', path);
}

function showToast(text) {
  toast.text = text;
  toast.visible = true;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.visible = false;
  }, 2200);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(props.lang === 'ja' ? 'ja-JP' : 'zh-CN');
}

function formatDate(value) {
  if (!value) return '';
  return formatDateTime(value, props.lang === 'ja' ? 'ja-JP' : 'zh-CN');
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
    showToast(copy.value.colorLimit);
    return activePalette.value.indexOf(fallbackColor);
  }
  customColors.value = [...customColors.value, normalized];
  tool.value = 'brush';
  return activePalette.value.indexOf(normalized);
}

function selectCustomColor() {
  addCustomColor(customColor.value);
}

function ensurePaletteColor(color) {
  const normalized = normalizeHexColor(color, presetPalette[3]);
  const existing = activePalette.value.indexOf(normalized);
  return existing >= 0 ? existing : addCustomColor(normalized);
}

function setBackgroundColor(color) {
  backgroundColor.value = normalizeHexColor(color, '#ffffff');
}

function sendLocalMessage() {
  const text = chatMessage.value.trim();
  if (!text) return;
  chatMessages.value.push({
    id: Date.now(),
    author: session.value?.user?.username || session.value?.username || '我',
    time: new Date().toLocaleTimeString(props.lang === 'ja' ? 'ja-JP' : 'zh-CN', { hour: '2-digit', minute: '2-digit' }),
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

function cancelStrokeCommit() {
  if (!strokeCommitFrame) return;
  window.cancelAnimationFrame(strokeCommitFrame);
  strokeCommitFrame = 0;
}

function commitStrokePixels() {
  if (!strokePixels) return;
  pixels.value = [...strokePixels];
}

function scheduleStrokeCommit() {
  if (strokeCommitFrame) return;
  strokeCommitFrame = window.requestAnimationFrame(() => {
    strokeCommitFrame = 0;
    commitStrokePixels();
  });
}

function flushStrokeCommit() {
  cancelStrokeCommit();
  commitStrokePixels();
}

function discardStrokeBuffer() {
  cancelStrokeCommit();
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
    customColor: customColor.value
  };
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
  for (const sample of source) {
    for (const targetIndex of brushTargetIndices(sample.index, pressureBrushSize(sample))) {
      if (next[targetIndex] === colorIndex) continue;
      next[targetIndex] = colorIndex;
      changed = true;
    }
  }

  if (!changed) return;
  if (strokePixels) {
    scheduleStrokeCommit();
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

function applyMoonPattern() {
  endPaint();
  pushHistory();
  const width = canvasWidth.value;
  const height = canvasHeight.value;
  const next = blankPixels(width, height);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const baseSize = Math.min(width, height);
  const moonRadius = baseSize * 0.34;
  const cutoutRadius = baseSize * 0.29;
  const cutoutX = centerX + baseSize * 0.22;
  const cutoutY = centerY - baseSize * 0.08;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      const cutout = Math.hypot(x - cutoutX, y - cutoutY);
      const index = y * width + x;
      if (distance < moonRadius && cutout > cutoutRadius) next[index] = 2;
      if (distance > moonRadius * 1.05 && distance < moonRadius * 1.14 && y > height * 0.14 && y < height * 0.82) next[index] = 4;
    }
  }
  [
    [0.25, 0.18, 5],
    [0.75, 0.63, 5],
    [0.43, 0.82, 5],
    [0.69, 0.25, 6],
    [0.18, 0.68, 6]
  ].forEach(([xRatio, yRatio, colorIndex]) => {
    const x = Math.round(xRatio * (width - 1));
    const y = Math.round(yRatio * (height - 1));
    next[y * width + x] = colorIndex;
  });
  pixels.value = next;
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
    showToast(copy.value.imageTypeInvalid);
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
    showToast(copy.value.imageLoadFailed);
  }
}

function downloadDraft() {
  flushStrokeCommit();
  const canvas = makeCanvasFromPixels(draftPixelsSnapshot(), activePalette.value, canvasWidth.value, canvasHeight.value, backgroundColor.value);
  const link = document.createElement('a');
  link.download = `${form.title.trim() || 'tsukuyomi-pixel-art'}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
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
    showToast(error.message || copy.value.publishFailed);
    return;
  }
  const canvas = makeCanvasFromPixels(
    artworkPixels(fullArtwork),
    artworkPalette(fullArtwork),
    artworkWidth(fullArtwork),
    artworkHeight(fullArtwork),
    artworkBackground(fullArtwork)
  );
  const link = document.createElement('a');
  link.download = artworkFileName(fullArtwork);
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function openArtworkPreview(artwork) {
  try {
    previewArtwork.value = await loadFullArtwork(artwork);
  } catch (error) {
    showToast(error.message || copy.value.publishFailed);
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
      text: fullArtwork.description || `${copy.value.by} ${fullArtwork.author || props.t.brand}`,
      url,
      imageUrl,
      downloadUrl: imageUrl,
      downloadName: artworkFileName(fullArtwork)
    };
    artworkShareOpen.value = true;
  } catch (error) {
    showToast(error.message || copy.value.publishFailed);
  }
}

function closeArtworkPreview(event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  previewArtwork.value = null;
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
    gallery.page = nextPage;
    gallery.total = Number(result.pagination?.total || gallery.items.length);
    gallery.totalPages = Math.max(1, Math.ceil(gallery.total / PIXEL_GALLERY_PAGE_SIZE));
    focusSharedArtwork();
  } catch (error) {
    gallery.items = [];
    gallery.error = error.message || copy.value.publishFailed;
    showToast(error.message || copy.value.publishFailed);
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
    showToast(props.lang === 'ja' ? '編集用に読み込みました' : '已载入像素画，可以继续编辑');
  } catch (error) {
    showToast(error.message || copy.value.publishFailed);
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
  flushStrokeCommit();
  session.value = getSession();
  if (!isAuthed.value) {
    go('/login');
    return;
  }
  if (!form.title.trim()) {
    showToast(copy.value.titleRequired);
    return;
  }
  if (!paintedCount.value) {
    showToast(copy.value.blankCanvas);
    return;
  }

  try {
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
    upsertArtwork(result.data);
    if (wasEditing) {
      editingArtwork.value = result.data;
      showToast(result.message || copy.value.updateOk);
    } else {
      showToast(result.message || copy.value.publishOk);
      form.title = '';
      form.description = '';
    }
  } catch (error) {
    showToast(error.message || copy.value.publishFailed);
  }
}

async function likeArtwork(artwork) {
  session.value = getSession();
  if (!isAuthed.value) {
    go('/login');
    return;
  }
  if (isArtworkLiked(artwork)) {
    showToast(copy.value.alreadyLiked);
    return;
  }

  try {
    const response = await authFetch(`/api/pixel-art/${artwork.id}/like`, {
      method: 'POST',
      headers: authHeaders()
    });
    const result = await parseResponse(response);
    if (!result.success) throw new Error(result.message || copy.value.publishFailed);
    upsertArtwork(result.data);
    showToast(result.message || copy.value.likedToast);
  } catch (error) {
    showToast(error.message || copy.value.publishFailed);
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
  if (event.key === 'Escape' && previewArtwork.value) closeArtworkPreview();
  if (isTypingTarget(event.target)) return;
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
  return String(name || props.t.brand || '月').slice(0, 1).toUpperCase();
}

watch(() => gallery.sort, () => loadArtworks(1));
watch([canvasBaseWidth, canvasBaseHeight], () => scheduleCanvasFit());

onMounted(async () => {
  window.addEventListener('pointerup', endCanvasInteraction);
  window.addEventListener('pointercancel', endCanvasInteraction);
  window.addEventListener('keydown', handleArenaKeydown);
  window.addEventListener('keyup', handleArenaKeyup);
  window.addEventListener('resize', handleCanvasViewportResize);
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
  window.removeEventListener('pointerup', endCanvasInteraction);
  window.removeEventListener('pointercancel', endCanvasInteraction);
  window.removeEventListener('keydown', handleArenaKeydown);
  window.removeEventListener('keyup', handleArenaKeyup);
  window.removeEventListener('resize', handleCanvasViewportResize);
  canvasFitObserver?.disconnect();
  canvasFitObserver = null;
  if (canvasFitFrame) window.cancelAnimationFrame(canvasFitFrame);
  cancelStrokeCommit();
  clearTimeout(toastTimer);
});
</script>

<template>
  <main class="page arena-page">
    <section class="arena-hero">
      <div class="arena-hero-copy">
        <div class="arena-kicker">{{ copy.kicker }}</div>
        <h1 :data-room="copy.onlineRoom">{{ copy.title }}</h1>
        <p>{{ copy.subtitle }}</p>
      </div>
      <aside class="arena-status panel">
        <div class="arena-status-line"><span>{{ copy.channel }}</span><strong>{{ copy.channelValue }}</strong></div>
      </aside>
    </section>

    <section class="arena-workbench">
      <div class="arena-canvas-panel panel">
        <div class="arena-section-head">
          <div>
            <span>01</span>
            <h2>{{ copy.draftTitle }}</h2>
          </div>
          <div class="arena-tool-toggle" role="group" :aria-label="copy.brush">
            <button class="icon-btn" :class="{ active: activeTool === 'brush' }" type="button" :title="copy.brush" @click="tool = 'brush'">
              <TsIcon name="brush" :size="18" />
            </button>
            <button class="icon-btn" :class="{ active: activeTool === 'eraser' }" type="button" :title="copy.eraser" @click="tool = 'eraser'">
              <TsIcon name="eraser" :size="18" />
            </button>
            <button class="icon-btn" :class="{ active: activeTool === 'fill' }" type="button" :title="copy.fill" @click="tool = 'fill'">
              <TsIcon name="paintBucket" :size="18" />
            </button>
            <button class="icon-btn" :class="{ active: activeTool === 'move' }" type="button" :title="copy.move" @click="tool = 'move'">
              <TsIcon name="move" :size="18" />
            </button>
          </div>
        </div>

        <div ref="canvasViewportRef" class="arena-canvas-viewport">
          <div
            class="pixel-canvas-zoom-surface"
            :style="canvasSurfaceStyle"
          >
            <div
              class="pixel-canvas"
              :style="canvasStyle"
              @dragstart.prevent
            >
              <PixelCanvasCells
                :pixels="pixels"
                :palette="activePalette"
                :width="canvasWidth"
                :height="canvasHeight"
                :cell-size="DISPLAY_CELL_SIZE"
                :tool="activeTool"
                :stabilizer="stabilizerEnabled"
                @begin-paint="beginPaint"
                @continue-paint="continuePaint"
                @end-paint="endPaint"
                @begin-pan="beginCanvasPan"
                @continue-pan="continueCanvasPan"
                @end-pan="endCanvasPan"
              />
            </div>
          </div>
        </div>

        <div class="arena-canvas-actions">
          <button class="icon-btn" type="button" :disabled="!hasUndo" :title="copy.undo" @click="undo">
            <TsIcon name="undo" :size="18" />
          </button>
          <button class="icon-btn" type="button" :disabled="!hasRedo" :title="copy.redo" @click="redo">
            <TsIcon name="redo" :size="18" />
          </button>
          <button class="ghost-btn" type="button" :title="copy.sample" @click="applyMoonPattern">
            <TsIcon name="star" :size="17" /> <span>{{ copy.sample }}</span>
          </button>
          <button class="ghost-btn" type="button" :title="copy.clear" @click="clearCanvas">
            <TsIcon name="trash" :size="17" /> <span>{{ copy.clear }}</span>
          </button>
          <button class="ghost-btn" type="button" :title="copy.download" @click="downloadDraft">
            <TsIcon name="download" :size="17" /> <span>{{ copy.download }}</span>
          </button>
          <button class="primary-btn arena-publish-btn" type="button" :title="publishButtonText" @click="shareArtwork">
            <TsIcon name="send" :size="17" />
            <span>{{ publishButtonText }}</span>
          </button>
          <div class="arena-zoom-controls" :aria-label="copy.zoom">
            <button class="icon-btn" type="button" :title="`${copy.zoom} -`" @click="adjustZoom(-25)">
              <TsIcon name="minus" :size="17" />
            </button>
            <strong>{{ zoom }}%</strong>
            <button class="icon-btn" type="button" :title="`${copy.zoom} +`" @click="adjustZoom(25)">
              <TsIcon name="plus" :size="17" />
            </button>
          </div>
        </div>
      </div>

      <aside class="arena-controls panel">
        <div class="arena-section-head">
          <div>
            <span>02</span>
            <h2>{{ copy.palette }}</h2>
          </div>
        </div>

        <div class="arena-control-block arena-import-panel">
          <div class="arena-control-label">{{ copy.imageImport }}</div>
          <label class="ghost-btn arena-upload-btn">
            <TsIcon name="upload" :size="17" />
            <span>{{ copy.uploadImage }}</span>
            <input class="sr-only" type="file" accept="image/*" @change="handleImageUpload">
          </label>
        </div>

        <div class="arena-control-block arena-slider-block">
          <div class="arena-control-label">{{ copy.brushSize }}: {{ brushSize }}px</div>
          <input v-model.number="brushSize" type="range" min="1" max="4" step="1">
          <div class="arena-drawing-toggles">
            <label class="arena-drawing-toggle">
              <input v-model="pressureEnabled" type="checkbox">
              <span>{{ copy.pressure }}</span>
            </label>
            <label class="arena-drawing-toggle">
              <input v-model="stabilizerEnabled" type="checkbox">
              <span>{{ copy.stabilizer }}</span>
            </label>
          </div>
        </div>

        <div class="arena-control-block">
          <div class="arena-control-label">{{ copy.presets }}</div>
          <div class="pixel-palette" :style="paletteStyle">
            <button
              v-for="color in presetPalette"
              :key="color"
              class="pixel-swatch"
              :class="{ active: selectedColor === color }"
              type="button"
              :style="{ backgroundColor: color }"
              :aria-label="color"
              @click="selectedColor = color; tool = 'brush'"
            ></button>
          </div>
        </div>

        <div class="arena-color-picker">
          <label>
            <span>{{ copy.freeColor }}</span>
            <input v-model="customColor" type="color" @input="selectCustomColor">
          </label>
          <button class="ghost-btn" type="button" @click="selectCustomColor">
            <TsIcon name="plus" :size="17" />
            <span>{{ copy.addColor }}</span>
          </button>
          <span class="arena-color-chip" :style="{ backgroundColor: customColor }" aria-hidden="true"></span>
        </div>

        <div v-if="customColors.length" class="arena-control-block">
          <div class="arena-control-label">{{ copy.freeColor }}</div>
          <div class="pixel-palette pixel-palette-custom">
            <button
              v-for="color in customColors"
              :key="color"
              class="pixel-swatch"
              :class="{ active: selectedColor === color }"
              type="button"
              :style="{ backgroundColor: color }"
              :aria-label="color"
              @click="selectedColor = color; tool = 'brush'"
            ></button>
          </div>
        </div>

        <div class="arena-control-block">
          <div class="arena-control-label">{{ copy.background }}</div>
          <div class="pixel-palette pixel-background-palette">
            <button
              v-for="color in backgroundPresets"
              :key="color"
              class="pixel-swatch pixel-background-swatch"
              :class="{ active: backgroundColor === color }"
              type="button"
              :style="{ backgroundColor: color }"
              :aria-label="color"
              @click="setBackgroundColor(color)"
            ></button>
            <label class="pixel-background-wheel">
              <input v-model="backgroundColor" type="color" @input="setBackgroundColor(backgroundColor)">
              <span :style="{ backgroundColor }"></span>
            </label>
          </div>
        </div>

        <div class="arena-draft-form">
          <label>
            <span>{{ copy.draftPlaceholder }}</span>
            <input v-model="form.title" maxlength="40" type="text" :placeholder="copy.draftPlaceholder">
          </label>
          <label>
            <span>{{ copy.descPlaceholder }}</span>
            <textarea v-model="form.description" maxlength="120" rows="3" :placeholder="copy.descPlaceholder"></textarea>
          </label>
        </div>
      </aside>
    </section>

    <section class="arena-gallery panel" :aria-busy="sideTab === 'gallery' && gallery.loading">
      <div class="arena-section-head arena-gallery-head">
        <div>
          <span>03</span>
          <h2>{{ sideTab === 'chat' ? copy.chat : copy.gallery }}</h2>
        </div>
        <div class="arena-gallery-tools">
          <button class="chip" :class="{ active: sideTab === 'chat' }" type="button" @click="sideTab = 'chat'">{{ copy.chat }}</button>
          <button class="chip" :class="{ active: sideTab === 'gallery' }" type="button" @click="sideTab = 'gallery'">{{ copy.gallery }}</button>
          <button v-if="sideTab === 'gallery'" class="ghost-btn" type="button" :disabled="gallery.loading" :aria-busy="gallery.loading" @click="loadArtworks">
            <TsIcon name="refresh" :size="17" />
            <span>{{ copy.refresh }}</span>
          </button>
        </div>
      </div>

      <div v-if="sideTab === 'chat'" class="arena-chat-panel">
        <div class="arena-chat-status"><span></span>{{ copy.connected }}（{{ chatMessages.length }}）</div>
        <div class="arena-chat-feed">
          <div v-for="message in chatMessages" :key="message.id" class="arena-chat-message">
            <strong>{{ message.author }}</strong>
            <time>{{ message.time }}</time>
            <p>{{ message.text }}</p>
          </div>
        </div>
        <div class="arena-chat-input">
          <input v-model="chatMessage" type="text" :placeholder="copy.messagePlaceholder" @keyup.enter="sendLocalMessage">
          <button type="button" @click="sendLocalMessage">{{ copy.sendMessage }}</button>
        </div>
      </div>
      <LoadingSkeleton v-else-if="gallery.loading" variant="pixel" :count="4" :label="copy.loading" />
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
                <img v-if="artwork.avatar" :src="artwork.avatar" :alt="artwork.author">
                <span v-else>{{ artworkInitial(artwork.author) }}</span>
              </span>
              <span>{{ copy.by }} {{ artwork.author || props.t.brand }}</span>
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
          <TsIcon name="chevron-left" :size="16" />
        </button>
        <span>{{ gallery.page }} / {{ gallery.totalPages }}</span>
        <button class="icon-btn" type="button" :disabled="gallery.page >= gallery.totalPages" aria-label="下一页" @click="loadArtworks(gallery.page + 1)">
          <TsIcon name="chevron-right" :size="16" />
        </button>
      </nav>
    </section>

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
            :aria-label="props.lang === 'ja' ? '閉じる' : '关闭'"
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
              <span>{{ copy.by }} {{ previewArtwork.author || props.t.brand }} · {{ artworkWidth(previewArtwork) }}x{{ artworkHeight(previewArtwork) }}</span>
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

    <div v-if="toast.visible" class="arena-toast show">{{ toast.text }}</div>
  </main>
</template>
