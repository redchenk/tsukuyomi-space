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
  users: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.9' }],
    ['path', { d: 'M16 3.1a4 4 0 0 1 0 7.8' }]
  ],
  userPlus: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
    ['path', { d: 'M19 8v6' }],
    ['path', { d: 'M22 11h-6' }]
  ],
  plus: [
    ['path', { d: 'M12 5v14' }],
    ['path', { d: 'M5 12h14' }]
  ],
  minus: [
    ['path', { d: 'M5 12h14' }]
  ],
  userCheck: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
    ['path', { d: 'm16 11 2 2 4-4' }]
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
  fileText: [
    ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
    ['path', { d: 'M10 9H8' }],
    ['path', { d: 'M16 13H8' }],
    ['path', { d: 'M16 17H8' }]
  ],
  layers: [
    ['path', { d: 'm12 2 9 5-9 5-9-5 9-5Z' }],
    ['path', { d: 'm3 12 9 5 9-5' }],
    ['path', { d: 'm3 17 9 5 9-5' }]
  ],
  crown: [
    ['path', { d: 'M2 18h20' }],
    ['path', { d: 'm4 14 2-8 5 5 4-7 5 10' }],
    ['path', { d: 'M6 18h16' }]
  ],
  calendar: [
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M16 2v4' }],
    ['rect', { x: '3', y: '4', width: '18', height: '18', rx: '2' }],
    ['path', { d: 'M3 10h18' }]
  ],
  penLine: [
    ['path', { d: 'M12 20h9' }],
    ['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z' }]
  ],
  brush: [
    ['path', { d: 'm9.1 11.7 8.6-8.6a2.1 2.1 0 0 1 3 3l-8.6 8.6' }],
    ['path', { d: 'M14.2 14.8 9.2 9.8' }],
    ['path', { d: 'M7.5 12.5c-2.8.6-4.5 2.8-4.5 6.5 3.7 0 5.9-1.7 6.5-4.5' }],
    ['path', { d: 'M9.5 14.5 7.5 12.5' }]
  ],
  eraser: [
    ['path', { d: 'm7 21-4-4a2.8 2.8 0 0 1 0-4l8-8a2.8 2.8 0 0 1 4 0l6 6a2.8 2.8 0 0 1 0 4l-6 6' }],
    ['path', { d: 'M22 21H7' }],
    ['path', { d: 'm5 11 8 8' }]
  ],
  paintBucket: [
    ['path', { d: 'm19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0L19 11Z' }],
    ['path', { d: 'm5 2 5 5' }],
    ['path', { d: 'M2 13h15' }],
    ['path', { d: 'M22 20a2 2 0 1 1-4 0c0-1.1 2-4 2-4s2 2.9 2 4Z' }]
  ],
  undo: [
    ['path', { d: 'M9 14 4 9l5-5' }],
    ['path', { d: 'M4 9h10a6 6 0 0 1 0 12h-2' }]
  ],
  redo: [
    ['path', { d: 'm15 14 5-5-5-5' }],
    ['path', { d: 'M20 9H10a6 6 0 0 0 0 12h2' }]
  ],
  heart: [
    ['path', { d: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z' }]
  ],
  logOut: [
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
    ['path', { d: 'M16 17l5-5-5-5' }],
    ['path', { d: 'M21 12H9' }]
  ],
  refresh: [
    ['path', { d: 'M21 12a9 9 0 0 1-15.6 6.1L3 15' }],
    ['path', { d: 'M3 21v-6h6' }],
    ['path', { d: 'M3 12A9 9 0 0 1 18.6 5.9L21 9' }],
    ['path', { d: 'M21 3v6h-6' }]
  ],
  bookmark: [
    ['path', { d: 'M19 21 12 17 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z' }]
  ],
  shield: [
    ['path', { d: 'M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z' }]
  ],
  paperclip: [
    ['path', { d: 'm21.4 11.6-8.5 8.5a5 5 0 0 1-7.1-7.1l9.2-9.2a3.4 3.4 0 0 1 4.8 4.8l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.5-8.5' }]
  ],
  eye: [
    ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' }],
    ['circle', { cx: '12', cy: '12', r: '3' }]
  ],
  lock: [
    ['rect', { x: '3', y: '11', width: '18', height: '11', rx: '2' }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]
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
  audioLines: [
    ['path', { d: 'M2 10v3' }],
    ['path', { d: 'M6 6v11' }],
    ['path', { d: 'M10 3v18' }],
    ['path', { d: 'M14 8v7' }],
    ['path', { d: 'M18 5v13' }],
    ['path', { d: 'M22 10v3' }]
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
  image: [
    ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2.5', ry: '2.5' }],
    ['circle', { cx: '8.5', cy: '8.5', r: '1.5' }],
    ['path', { d: 'm21 15-4.6-4.6a2 2 0 0 0-2.8 0L5 19' }]
  ],
  search: [
    ['circle', { cx: '11', cy: '11', r: '7' }],
    ['path', { d: 'm20 20-3.5-3.5' }]
  ],
  upload: [
    ['path', { d: 'M12 16V4' }],
    ['path', { d: 'm7 9 5-5 5 5' }],
    ['path', { d: 'M4 20h16' }]
  ],
  download: [
    ['path', { d: 'M12 4v12' }],
    ['path', { d: 'm7 11 5 5 5-5' }],
    ['path', { d: 'M4 20h16' }]
  ],
  copy: [
    ['rect', { x: '8', y: '8', width: '12', height: '12', rx: '2' }],
    ['path', { d: 'M4 16V6a2 2 0 0 1 2-2h10' }]
  ],
  external: [
    ['path', { d: 'M14 3h7v7' }],
    ['path', { d: 'M10 14 21 3' }],
    ['path', { d: 'M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5' }]
  ],
  trash: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M8 6V4h8v2' }],
    ['path', { d: 'M19 6 18 20H6L5 6' }],
    ['path', { d: 'M10 11v5' }],
    ['path', { d: 'M14 11v5' }]
  ],
  star: [
    ['path', { d: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z' }]
  ],
  grid: [
    ['rect', { x: '3', y: '3', width: '7', height: '7', rx: '1.5' }],
    ['rect', { x: '14', y: '3', width: '7', height: '7', rx: '1.5' }],
    ['rect', { x: '3', y: '14', width: '7', height: '7', rx: '1.5' }],
    ['rect', { x: '14', y: '14', width: '7', height: '7', rx: '1.5' }]
  ],
  ellipsis: [
    ['circle', { cx: '5', cy: '12', r: '1.25', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '12', cy: '12', r: '1.25', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '19', cy: '12', r: '1.25', fill: 'currentColor', stroke: 'none' }]
  ],
  menu: [
    ['path', { d: 'M4 6h16' }],
    ['path', { d: 'M4 12h16' }],
    ['path', { d: 'M4 18h16' }]
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
      <rect v-else-if="path[0] === 'rect'" v-bind="path[1]" />
    </template>
  </svg>
</template>
