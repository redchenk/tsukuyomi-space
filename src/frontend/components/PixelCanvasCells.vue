<script setup>
import { onMounted, ref, watch } from 'vue';

const props = defineProps({
  pixels: { type: Array, required: true },
  palette: { type: Array, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  cellSize: { type: Number, default: 6 },
  backgroundColor: { type: String, default: 'transparent' },
  showGrid: { type: Boolean, default: true },
  interactive: { type: Boolean, default: true },
  ariaLabel: { type: String, default: 'pixel canvas' }
});

const emit = defineEmits(['begin-paint', 'continue-paint', 'end-paint']);

const canvasRef = ref(null);
let lastPointerIndex = null;

function gridWidth() {
  const width = Number.parseInt(props.width, 10);
  return Number.isFinite(width) && width > 0 ? width : 1;
}

function gridHeight() {
  const height = Number.parseInt(props.height, 10);
  return Number.isFinite(height) && height > 0 ? height : 1;
}

function pixelSize() {
  const size = Number(props.cellSize);
  return Number.isFinite(size) && size > 0 ? size : 1;
}

function canvasPixelWidth() {
  return gridWidth() * pixelSize();
}

function canvasPixelHeight() {
  return gridHeight() * pixelSize();
}

function renderCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const pixelWidth = canvasPixelWidth();
  const pixelHeight = canvasPixelHeight();
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

  const context = canvas.getContext('2d');
  if (!context) return;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  if (props.backgroundColor && props.backgroundColor !== 'transparent') {
    context.fillStyle = props.backgroundColor;
    context.fillRect(0, 0, pixelWidth, pixelHeight);
  }

  const size = pixelSize();
  const width = gridWidth();
  const height = gridHeight();
  const limit = width * height;
  for (let index = 0; index < limit; index += 1) {
    const colorIndex = Number(props.pixels[index]);
    if (colorIndex < 0) continue;
    const color = props.palette[colorIndex];
    if (!color) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    context.fillStyle = color;
    context.fillRect(x * size, y * size, size, size);
  }

  if (props.showGrid && size >= 4) {
    context.fillStyle = 'rgba(20, 38, 45, 0.05)';
    for (let x = 1; x < width; x += 1) {
      context.fillRect(x * size, 0, 1, pixelHeight);
    }
    for (let y = 1; y < height; y += 1) {
      context.fillRect(0, y * size, pixelWidth, 1);
    }
  }
}

function pointerToIndex(event) {
  const canvas = canvasRef.value;
  if (!canvas) return -1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return -1;
  const width = gridWidth();
  const height = gridHeight();
  const x = Math.min(width - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * height)));
  return y * width + x;
}

function lineIndices(fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0) return [];
  const width = gridWidth();
  let x0 = fromIndex % width;
  let y0 = Math.floor(fromIndex / width);
  const x1 = toIndex % width;
  const y1 = Math.floor(toIndex / width);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx - dy;
  const result = [];

  while (true) {
    result.push(y0 * width + x0);
    if (x0 === x1 && y0 === y1) break;
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x0 += sx;
    }
    if (doubled < dx) {
      error += dx;
      y0 += sy;
    }
  }

  return result;
}

function handlePointerDown(event) {
  if (!props.interactive) return;
  const index = pointerToIndex(event);
  if (index < 0) return;
  event.preventDefault();
  lastPointerIndex = index;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  emit('begin-paint', [index]);
}

function handlePointerMove(event) {
  if (!props.interactive) return;
  if (lastPointerIndex === null) return;
  const index = pointerToIndex(event);
  if (index < 0) return;
  const indices = lineIndices(lastPointerIndex, index);
  lastPointerIndex = index;
  if (indices.length) emit('continue-paint', indices);
}

function finishPointer(event) {
  if (!props.interactive) return;
  if (lastPointerIndex === null) return;
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  lastPointerIndex = null;
  emit('end-paint');
}

watch(
  () => [props.pixels, props.palette, props.width, props.height, props.cellSize, props.backgroundColor, props.showGrid],
  renderCanvas,
  { flush: 'post' }
);

onMounted(renderCanvas);
</script>

<template>
  <canvas
    ref="canvasRef"
    class="pixel-canvas-renderer"
    :class="{ 'is-readonly': !props.interactive }"
    role="img"
    :aria-label="props.ariaLabel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="finishPointer"
    @pointercancel="finishPointer"
    @lostpointercapture="finishPointer"
  ></canvas>
</template>
