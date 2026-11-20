import * as THREE from 'three';
import { createGates } from './architecture.js';
import { createLanterns, lanternLayout } from './lanterns.js';
import { createOcean } from './ocean.js';
import { createBridge } from './bridge.js';
import { createFinish } from './finish.js';
import { setLighting } from './sequence.js';
import { shrinePose } from './camera.js';

const images = import.meta.glob('../../assets/access/shrine/materials/*.webp', { eager: true, import: 'default' });

export async function createShrineRenderer(canvas, signal) {
  const context = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true });
  if (!context) throw new Error('WebGL2 unavailable');
  const renderer = new THREE.WebGLRenderer({ canvas, context });
  // Empty pixels in the reflection target reveal the reflected sky.
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .016, 1400);
  const maps = {};
  const loader = new THREE.TextureLoader();
  let water, finish, disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    const textures = new Set(Object.values(maps));
    scene.traverse(object => {
      object.geometry?.dispose();
      if (object.material?.map) textures.add(object.material.map);
      object.material?.dispose();
      if (object.isInstancedMesh) object.dispose();
    });
    for (const texture of textures) texture.dispose();
    water?.dispose();
    finish?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  signal.addEventListener('abort', dispose, { once: true });
  try {
    await Promise.all(Object.entries(images).map(async ([path, url]) => {
      const texture = await loader.loadAsync(url);
      if (disposed) texture.dispose();
      else maps[path.split('/').pop().replace('.webp', '')] = texture;
    }));
    if (signal.aborted) throw new DOMException('Shrine closed', 'AbortError');
    const light = { night: { value: 0 }, trails: { value: 0 }, impact: { value: -1 }, filmLook: { value: 0 } };
    scene.add(createGates(maps.lacquer, maps['timber-normal'], maps['timber-coating']),
      createLanterns(lanternLayout(), light), createBridge(maps['gate-plaque'], maps.lacquer));
    water = createOcean(renderer, camera, scene, maps.clouds, maps.panorama, maps['arrival-clouds'], maps['side-clouds'], light);
    finish = createFinish(renderer, camera);

    function drawPose(pose, shotTime, waterTime, quality) {
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1100000 / (width * height))) * quality;
      const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== w || canvas.height !== h) {
        renderer.setSize(w, h, false);
        water.resize(w, h);
        finish.resize(w, h);
      }
      camera.aspect = width / height;
      camera.position.set(pose.x, pose.y, pose.z);
      camera.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      setLighting(shotTime, light, true);
      const age = light.impact.value;
      const flash = age < 0 ? 0 : 1 - THREE.MathUtils.smoothstep(age, .17, .65);
      water.draw(waterTime, finish.frame);
      finish.draw(flash, .12 + .61 * light.night.value + .85 * flash, age, light.filmLook.value);
    }
    function draw(held, travel, ambient, quality) {
      const aspect = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
      drawPose(shrinePose(held, travel, aspect, aspect <= 1), 10 + travel, 10 + ambient, quality);
    }
    draw(0, 0, 0, 1); // Compile and paint under the opening before the cut.
    return { draw, drawPose, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
