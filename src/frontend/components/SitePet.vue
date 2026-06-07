<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  spriteSrc: {
    type: String,
    default: '/assets/pets/yachiyo/spritesheet.webp'
  }
});

const SPRITE_COLUMNS = 8;
const SPRITE_ROWS = 9;

function rowFrames(row, count) {
  return Array.from({ length: count }, (_, index) => row * SPRITE_COLUMNS + index);
}

function rowDurations(values) {
  return values;
}

const SEQUENCES = {
  idle: {
    frames: rowFrames(0, 6),
    durations: rowDurations([280, 110, 110, 140, 140, 320]),
    loops: Number.POSITIVE_INFINITY
  },
  runningRight: {
    frames: rowFrames(1, 8),
    durations: rowDurations([120, 120, 120, 120, 120, 120, 120, 220]),
    loops: 4
  },
  runningLeft: {
    frames: rowFrames(2, 8),
    durations: rowDurations([120, 120, 120, 120, 120, 120, 120, 220]),
    loops: 4
  },
  waving: {
    frames: rowFrames(3, 4),
    durations: rowDurations([140, 140, 140, 280]),
    loops: 3
  },
  jumping: {
    frames: rowFrames(4, 5),
    durations: rowDurations([140, 140, 140, 140, 280]),
    loops: 3
  },
  failed: {
    frames: rowFrames(5, 8),
    durations: rowDurations([140, 140, 140, 140, 140, 140, 140, 240]),
    loops: 2
  },
  waiting: {
    frames: rowFrames(6, 6),
    durations: rowDurations([150, 150, 150, 150, 150, 260]),
    loops: 3
  },
  running: {
    frames: rowFrames(7, 6),
    durations: rowDurations([120, 120, 120, 120, 120, 220]),
    loops: 5
  },
  review: {
    frames: rowFrames(8, 6),
    durations: rowDurations([150, 150, 150, 150, 150, 280]),
    loops: 4
  }
};

const IDLE_SEQUENCE = {
  ...SEQUENCES.idle,
  loops: Number.POSITIVE_INFINITY
};
const ACTION_SEQUENCES = [
  SEQUENCES.runningRight,
  SEQUENCES.runningLeft,
  SEQUENCES.waving,
  SEQUENCES.jumping,
  SEQUENCES.failed,
  SEQUENCES.waiting,
  SEQUENCES.running,
  SEQUENCES.review
];

const frame = ref(IDLE_SEQUENCE.frames[0]);
let currentSequence = IDLE_SEQUENCE;
let sequenceIndex = 1;
let loopsRemaining = Number.POSITIVE_INFINITY;
let frameTimerId = 0;
let actionTimerId = 0;

const petStyle = computed(() => {
  const col = frame.value % SPRITE_COLUMNS;
  const row = Math.floor(frame.value / SPRITE_COLUMNS);
  const x = (col / (SPRITE_COLUMNS - 1)) * 100;
  const y = (row / (SPRITE_ROWS - 1)) * 100;

  return {
    backgroundImage: `url("${props.spriteSrc}")`,
    backgroundPosition: `${x}% ${y}%`
  };
});

function advanceFrame() {
  if (sequenceIndex >= currentSequence.frames.length) {
    if (currentSequence === IDLE_SEQUENCE) {
      sequenceIndex = 0;
    } else if (loopsRemaining > 1) {
      loopsRemaining -= 1;
      sequenceIndex = 0;
    } else {
      setIdleSequence();
      return;
    }
  }

  frame.value = currentSequence.frames[sequenceIndex % currentSequence.frames.length];
  sequenceIndex += 1;
}

function setIdleSequence() {
  currentSequence = IDLE_SEQUENCE;
  loopsRemaining = Number.POSITIVE_INFINITY;
  frame.value = currentSequence.frames[0];
  sequenceIndex = 1;
  scheduleRandomAction();
}

function queueNextFrame() {
  const frameIndex = currentSequence.frames.indexOf(frame.value);
  const duration = currentSequence.durations[frameIndex] || 160;
  frameTimerId = window.setTimeout(() => {
    advanceFrame();
    queueNextFrame();
  }, duration);
}

function randomActionDelay() {
  return 4600 + Math.floor(Math.random() * 6200);
}

function scheduleRandomAction() {
  if (actionTimerId) window.clearTimeout(actionTimerId);
  actionTimerId = window.setTimeout(() => {
    playRandomAction();
  }, randomActionDelay());
}

function playRandomAction() {
  if (currentSequence !== IDLE_SEQUENCE) return;
  const index = Math.floor(Math.random() * ACTION_SEQUENCES.length);
  currentSequence = ACTION_SEQUENCES[index];
  frame.value = currentSequence.frames[0];
  sequenceIndex = 1;
  loopsRemaining = currentSequence.loops;
}

onMounted(() => {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;
  queueNextFrame();
  scheduleRandomAction();
});

onBeforeUnmount(() => {
  if (frameTimerId) window.clearTimeout(frameTimerId);
  if (actionTimerId) window.clearTimeout(actionTimerId);
});
</script>

<template>
  <div
    class="site-pet"
    role="img"
    aria-label="Yachiyo"
    :style="petStyle"
  />
</template>

<style scoped>
.site-pet {
  --site-pet-width: clamp(6.5rem, 9vw, 9.5rem);
  position: fixed;
  right: max(0.9rem, env(safe-area-inset-right));
  bottom: max(0.75rem, env(safe-area-inset-bottom));
  z-index: 81;
  width: var(--site-pet-width);
  aspect-ratio: 192 / 208;
  padding: 0;
  border: 0;
  background-color: transparent;
  background-repeat: no-repeat;
  background-size: 800% 900%;
  filter: drop-shadow(0 16px 28px rgba(12, 16, 32, 0.28));
  pointer-events: none;
  transform-origin: 50% 100%;
}

@media (max-width: 860px) {
  .site-pet {
    --site-pet-width: clamp(5.15rem, 24vw, 6.35rem);
    right: max(0.45rem, env(safe-area-inset-right));
    bottom: max(5.65rem, calc(env(safe-area-inset-bottom) + 5.65rem));
  }
}
</style>
