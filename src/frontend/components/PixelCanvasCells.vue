<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  pixels: { type: Array, required: true },
  palette: { type: Array, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  cellSize: { type: Number, default: 6 },
  backgroundColor: { type: String, default: 'transparent' },
  showGrid: { type: Boolean, default: true },
  interactive: { type: Boolean, default: true },
  tool: { type: String, default: 'brush' },
  inputMode: { type: String, default: 'auto' },
  stabilizer: { type: Boolean, default: true },
  ariaLabel: { type: String, default: 'pixel canvas' }
});

const emit = defineEmits(['begin-paint', 'continue-paint', 'end-paint', 'begin-pan', 'continue-pan', 'end-pan']);

const canvasRef = ref(null);
let activePointer = null;
let renderFrame = 0;
let lastPenAt = 0;

const PALM_REJECTION_MS = 850;
const STABILIZER_BLEND = 0.62;

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
  renderFrame = 0;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const pixelWidth = canvasPixelWidth();
  const pixelHeight = canvasPixelHeight();
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

  const context = canvas.getContext('2d', { desynchronized: true });
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

function scheduleRender() {
  if (renderFrame) return;
  renderFrame = window.requestAnimationFrame(renderCanvas);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointerPressure(event) {
  const pressure = Number(event.pressure);
  if (Number.isFinite(pressure) && pressure > 0) return clamp(pressure, 0, 1);
  return event.pointerType === 'pen' ? 0.5 : 0.5;
}

function pointerToSample(event) {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const width = gridWidth();
  const height = gridHeight();
  let x = clamp(((event.clientX - rect.left) / rect.width) * width, 0, width - 0.0001);
  let y = clamp(((event.clientY - rect.top) / rect.height) * height, 0, height - 0.0001);
  const pointerType = event.pointerType || 'mouse';

  if (props.stabilizer && activePointer?.lastSample && pointerType === 'pen' && props.tool !== 'fill') {
    x = activePointer.lastSample.x + ((x - activePointer.lastSample.x) * STABILIZER_BLEND);
    y = activePointer.lastSample.y + ((y - activePointer.lastSample.y) * STABILIZER_BLEND);
  }

  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  return {
    index: cellY * width + cellX,
    x,
    y,
    cellX,
    cellY,
    clientX: event.clientX,
    clientY: event.clientY,
    pressure: pointerPressure(event),
    pointerType,
    tiltX: Number(event.tiltX || 0),
    tiltY: Number(event.tiltY || 0),
    twist: Number(event.twist || 0)
  };
}

function lineSamples(fromSample, toSample) {
  if (!fromSample || !toSample || fromSample.index < 0 || toSample.index < 0) return [];
  const width = gridWidth();
  let x0 = fromSample.index % width;
  let y0 = Math.floor(fromSample.index / width);
  const x1 = toSample.index % width;
  const y1 = Math.floor(toSample.index / width);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx - dy;
  const result = [];

  while (true) {
    result.push({
      ...toSample,
      index: y0 * width + x0,
      cellX: x0,
      cellY: y0
    });
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

function coalescedEvents(event) {
  const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
  return events.length ? events : [event];
}

function shouldAcceptPointer(event) {
  if (!props.interactive || activePointer) return false;
  if (event.isPrimary === false) return false;
  const pointerType = event.pointerType || 'mouse';
  const now = performance.now();
  if (pointerType === 'pen') lastPenAt = now;
  if (pointerType === 'touch' && now - lastPenAt < PALM_REJECTION_MS) return false;
  if (props.inputMode === 'pen' && pointerType === 'touch') return false;
  if (props.inputMode === 'touch' && pointerType === 'pen') return false;
  return true;
}

function paintPayload(samples) {
  return {
    points: samples.filter(sample => sample && sample.index >= 0),
    pointerType: activePointer?.pointerType || samples[0]?.pointerType || 'mouse'
  };
}

function capturePointer(target, pointerId) {
  try {
    target.setPointerCapture?.(pointerId);
  } catch {
    // Synthetic events and some tablet drivers can race pointer capture.
  }
}

function releasePointer(target, pointerId) {
  try {
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
  } catch {
    // Losing capture is non-fatal; the page-level pointerup handler also cleans up.
  }
}

function handlePointerDown(event) {
  if (!shouldAcceptPointer(event)) return;
  const sample = pointerToSample(event);
  if (!sample) return;
  event.preventDefault();
  if (sample.pointerType === 'pen') lastPenAt = performance.now();
  activePointer = {
    id: event.pointerId,
    pointerType: sample.pointerType,
    lastSample: sample,
    mode: props.tool === 'move' ? 'pan' : 'paint'
  };
  capturePointer(event.currentTarget, event.pointerId);

  if (activePointer.mode === 'pan') {
    emit('begin-pan', sample);
    return;
  }

  emit('begin-paint', paintPayload([sample]));
}

function handlePointerMove(event) {
  if (!props.interactive || !activePointer || activePointer.id !== event.pointerId) return;
  event.preventDefault();
  if ((event.pointerType || 'mouse') === 'pen') lastPenAt = performance.now();

  const samples = [];
  for (const pointerEvent of coalescedEvents(event)) {
    const sample = pointerToSample(pointerEvent);
    if (!sample) continue;
    if (activePointer.mode === 'pan') {
      activePointer.lastSample = sample;
      emit('continue-pan', sample);
      continue;
    }
    samples.push(...lineSamples(activePointer.lastSample, sample));
    activePointer.lastSample = sample;
  }

  if (samples.length) emit('continue-paint', paintPayload(samples));
}

function finishPointer(event) {
  if (!props.interactive || !activePointer || activePointer.id !== event.pointerId) return;
  releasePointer(event.currentTarget, event.pointerId);
  const mode = activePointer.mode;
  activePointer = null;
  emit(mode === 'pan' ? 'end-pan' : 'end-paint');
}

watch(
  () => [props.pixels, props.palette, props.width, props.height, props.cellSize, props.backgroundColor, props.showGrid],
  scheduleRender,
  { flush: 'post' }
);

onMounted(renderCanvas);

onBeforeUnmount(() => {
  if (renderFrame) window.cancelAnimationFrame(renderFrame);
});
</script>

<template>
  <canvas
    ref="canvasRef"
    class="pixel-canvas-renderer"
    :class="[
      { 'is-readonly': !props.interactive },
      `is-tool-${props.tool}`
    ]"
    role="img"
    :aria-label="props.ariaLabel"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerrawupdate="handlePointerMove"
    @pointerup="finishPointer"
    @pointercancel="finishPointer"
    @lostpointercapture="finishPointer"
  ></canvas>
</template>
