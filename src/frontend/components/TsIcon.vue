<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
  strokeWidth: { type: [Number, String], default: 2 }
});

const iconPaths = {
  home: [
    ['path', { d: 'M3 10.8 12 3l9 7.8' }],
    ['path', { d: 'M5 10v10h5v-6h4v6h5V10' }]
  ],
  moon: [
    ['path', { d: 'M12.4 3.1a8.7 8.7 0 1 0 8.5 8.5A6.8 6.8 0 0 1 12.4 3.1Z' }]
  ],
  message: [
    ['path', { d: 'M21 11.5a8.4 8.4 0 0 1-8.7 8.3 9.4 9.4 0 0 1-3.8-.8L3 21l1.8-4.8a8 8 0 0 1-1.1-4.1 8.4 8.4 0 0 1 8.7-8.3A8.4 8.4 0 0 1 21 11.5Z' }]
  ],
  plaza: [
    ['path', { d: 'M8 19c2.8-1.4 5.2-1.4 8 0' }],
    ['path', { d: 'M5 8h14' }],
    ['path', { d: 'M7 8a5 5 0 0 1 10 0' }],
    ['path', { d: 'M12 8v11' }]
  ],
  book: [
    ['path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }],
    ['path', { d: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z' }]
  ],
  gamepad: [
    ['path', { d: 'M6.8 9h10.4a4.8 4.8 0 0 1 4.5 6.5l-.7 1.8a2.2 2.2 0 0 1-3.6.8L15 16H9l-2.4 2.1a2.2 2.2 0 0 1-3.6-.8l-.7-1.8A4.8 4.8 0 0 1 6.8 9Z' }],
    ['path', { d: 'M8 12v3' }],
    ['path', { d: 'M6.5 13.5h3' }],
    ['path', { d: 'M16 13.5h.01' }],
    ['path', { d: 'M18 12.5h.01' }]
  ],
  compass: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'm15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z' }]
  ],
  bell: [
    ['path', { d: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9' }],
    ['path', { d: 'M13.7 21a2 2 0 0 1-3.4 0' }]
  ],
  sun: [
    ['circle', { cx: '12', cy: '12', r: '4' }],
    ['path', { d: 'M12 2v2' }],
    ['path', { d: 'M12 20v2' }],
    ['path', { d: 'm4.9 4.9 1.4 1.4' }],
    ['path', { d: 'm17.7 17.7 1.4 1.4' }],
    ['path', { d: 'M2 12h2' }],
    ['path', { d: 'M20 12h2' }],
    ['path', { d: 'm4.9 19.1 1.4-1.4' }],
    ['path', { d: 'm17.7 6.3 1.4-1.4' }]
  ],
  user: [
    ['circle', { cx: '12', cy: '8', r: '4' }],
    ['path', { d: 'M4 21a8 8 0 0 1 16 0' }]
  ],
  settings: [
    ['path', { d: 'M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z' }],
    ['path', { d: 'M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.08 1.65V21a2 2 0 1 1-4 0v-.09A1.8 1.8 0 0 0 8.8 19.3a1.8 1.8 0 0 0-2 .36l-.06.06A2 2 0 1 1 3.9 16.9l.06-.06a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.65-1.08H2.6a2 2 0 1 1 0-4h.09A1.8 1.8 0 0 0 4.3 8.7a1.8 1.8 0 0 0-.36-2l-.06-.06A2 2 0 1 1 6.7 3.8l.06.06a1.8 1.8 0 0 0 2 .36h.02A1.8 1.8 0 0 0 9.9 2.6V2.5a2 2 0 1 1 4 0v.09c0 .73.44 1.38 1.1 1.65a1.8 1.8 0 0 0 2-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 2c.27.66.92 1.1 1.65 1.1h.09a2 2 0 1 1 0 4h-.09A1.8 1.8 0 0 0 19.4 15Z' }]
  ],
  note: [
    ['path', { d: 'M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z' }],
    ['path', { d: 'M16 3v5h5' }],
    ['path', { d: 'M8 13h8' }],
    ['path', { d: 'M8 17h5' }]
  ],
  badge: [
    ['path', { d: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z' }],
    ['circle', { cx: '12', cy: '9', r: '2.2' }],
    ['path', { d: 'M8 17a4 4 0 0 1 8 0' }]
  ],
  music: [
    ['path', { d: 'M9 18V5l12-2v13' }],
    ['circle', { cx: '6', cy: '18', r: '3' }],
    ['circle', { cx: '18', cy: '16', r: '3' }]
  ],
  play: [['path', { d: 'm8 5 11 7-11 7Z' }]],
  pause: [
    ['path', { d: 'M8 5v14' }],
    ['path', { d: 'M16 5v14' }]
  ],
  volume: [
    ['path', { d: 'M11 5 6 9H3v6h3l5 4Z' }],
    ['path', { d: 'M15.5 8.5a5 5 0 0 1 0 7' }],
    ['path', { d: 'M18.5 5.5a9 9 0 0 1 0 13' }]
  ],
  list: [
    ['path', { d: 'M8 6h13' }],
    ['path', { d: 'M8 12h13' }],
    ['path', { d: 'M8 18h13' }],
    ['path', { d: 'M3 6h.01' }],
    ['path', { d: 'M3 12h.01' }],
    ['path', { d: 'M3 18h.01' }]
  ],
  chevronUp: [['path', { d: 'm18 15-6-6-6 6' }]],
  chevronDown: [['path', { d: 'm6 9 6 6 6-6' }]],
  skipBack: [
    ['path', { d: 'M19 20 9 12l10-8v16Z' }],
    ['path', { d: 'M5 19V5' }]
  ],
  skipForward: [
    ['path', { d: 'm5 4 10 8-10 8V4Z' }],
    ['path', { d: 'M19 5v14' }]
  ],
  send: [
    ['path', { d: 'M22 2 11 13' }],
    ['path', { d: 'm22 2-7 20-4-9-9-4 20-7Z' }]
  ],
  loader: [
    ['path', { d: 'M12 2v4' }],
    ['path', { d: 'M12 18v4' }],
    ['path', { d: 'm4.93 4.93 2.83 2.83' }],
    ['path', { d: 'm16.24 16.24 2.83 2.83' }],
    ['path', { d: 'M2 12h4' }],
    ['path', { d: 'M18 12h4' }],
    ['path', { d: 'm4.93 19.07 2.83-2.83' }],
    ['path', { d: 'm16.24 7.76 2.83-2.83' }]
  ],
  x: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }]
  ]
};

const paths = computed(() => iconPaths[props.name] || iconPaths.home);
</script>

<template>
  <svg
    class="ts-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-for="(path, index) in paths" :key="index">
      <path v-if="path[0] === 'path'" v-bind="path[1]" />
      <circle v-else-if="path[0] === 'circle'" v-bind="path[1]" />
    </template>
  </svg>
</template>
