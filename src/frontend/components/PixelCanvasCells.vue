<script setup>
import { onMounted, ref, watch } from 'vue';

const props = defineProps({
  pixels: { type: Array, required: true },
  palette: { type: Array, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  cellSize: { type: Number, default: 6 }
});

const emit = defineEmits(['begin-paint', 'continue-paint', 'end-paint']);

const canvasRef = ref(null);
let lastPointerIndex = null;

function canvasPixelWidth() {
  return Math.max(1, props.width * props.cellSize);
}

function canvasPixelHeight() {
  return Math.max(1, props.height * props.cellSize);
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

  const size = props.cellSize;
  for (let index = 0; index < props.pixels.length; index += 1) {
    const colorIndex = Number(props.pixels[index]);
    if (colorIndex < 0) continue;
    const color = props.palette[colorIndex];
    if (!color) continue;
    const x = index % props.width;
    const y = Math.floor(index / props.width);
    context.fillStyle = color;
    context.fillRect(x * size, y * size, size, size);
  }

  if (size >= 4) {
    context.fillStyle = 'rgba(20, 38, 45, 0.05)';
    for (let x = 1; x < props.width; x += 1) {
      context.fillRect(x * size, 0, 1, pixelHeight);
    }
    for (let y = 1; y < props.height; y += 1) {
      context.fillRect(0, y * size, pixelWidth, 1);
    }
  }
}

function pointerToIndex(event) {
  const canvas = canvasRef.value;
  if (!canvas) return -1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return -1;
  const x = Math.min(props.width - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * props.width)));
  const y = Math.min(props.height - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * props.height)));
  return y * props.width + x;
}

function lineIndices(fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0) return [];
  const width = props.width;
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
  const index = pointerToIndex(event);
  if (index < 0) return;
  event.preventDefault();
  lastPointerIndex = index;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  emit('begin-paint', [index]);
}

function handlePointerMove(event) {
  if (lastPointerIndex === null) return;
  const index = pointerToIndex(event);
  if (index < 0) return;
  const indices = lineIndices(lastPointerIndex, index);
  lastPointerIndex = index;
  if (indices.length) emit('continue-paint', indices);
}

function finishPointer(event) {
  if (lastPointerIndex === null) return;
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  lastPointerIndex = null;
  emit('end-paint');
}

watch(
  () => [props.pixels, props.palette, props.width, props.height, props.cellSize],
  renderCanvas,
  { flush: 'post' }
);

onMounted(renderCanvas);
</script>

<template>
  <canvas
    ref="canvasRef"
    class="pixel-canvas-renderer"
    role="img"
    aria-label="pixel canvas"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="finishPointer"
    @pointercancel="finishPointer"
    @lostpointercapture="finishPointer"
  ></canvas>
</template>
