const fs = require('node:fs');
const path = require('node:path');

const bundleDirectory = path.resolve(__dirname, '..', 'lib', 'bundled');
const sourcePath = path.join(bundleDirectory, 'live2d-room-neuro-live.iife.js');
const versionedPath = path.join(bundleDirectory, 'live2d-room-neuro-live.20260717-adaptive-perf-r6.iife.js');

fs.copyFileSync(sourcePath, versionedPath);
console.log(`Versioned Live2D bundle: ${path.basename(versionedPath)}`);
