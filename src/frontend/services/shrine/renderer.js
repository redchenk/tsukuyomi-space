import * as THREE from 'three';
import { createGates } from './architecture.js';
import { createLanterns, lanternLayout } from './lanterns.js';
import { createOcean } from './ocean.js';
import { createBloom } from './bloom.js';
import { shrinePose } from './camera.js';

const images = import.meta.glob('../../assets/access/shrine/materials/*.webp', { eager: true, import: 'default' });

export async function createShrineRenderer(canvas, portrait, signal) {
  const context = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true });
  if (!context) throw new Error('WebGL2 unavailable');
  const renderer = new THREE.WebGLRenderer({ canvas, context });
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .016, 1400);
  const maps = {};
  const loader = new THREE.TextureLoader();
  let water, bloom, disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    scene.traverse(object => {
      object.geometry?.dispose();
      object.material?.dispose();
      if (object.isInstancedMesh) object.dispose();
    });
    for (const texture of Object.values(maps)) texture.dispose();
    water?.dispose();
    bloom?.dispose();
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
    const light = { night: { value: 0 }, trails: { value: 0 } };
    const lamps = lanternLayout();
    scene.add(createGates(maps.lacquer, lamps, light, maps['arrival-timber'], maps['pillar-samples'], maps['lacquer-relief']),
      createLanterns(lamps, light));
    water = createOcean(renderer, camera, scene, maps.clouds, maps.panorama, maps['arrival-clouds'], maps['side-clouds'], light);
    bloom = createBloom(renderer);

    function draw(held, travel, ambient, quality) {
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1100000 / (width * height))) * quality;
      const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== w || canvas.height !== h) {
        renderer.setSize(w, h, false);
        water.resize(w, h);
        bloom.resize(w, h);
      }
      camera.aspect = width / height;
      const pose = shrinePose(held, travel, camera.aspect, portrait);
      camera.position.set(pose.x, pose.y, pose.z);
      camera.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      light.night.value = THREE.MathUtils.smoothstep(travel, 1.01, 1.64);
      light.trails.value = THREE.MathUtils.smoothstep(travel, 1.26, 2.24);
      water.draw(10 + ambient, bloom.frame, 10 + Math.max(0, ambient - held));
      bloom.draw(light.night.value);
    }
    draw(0, 0, 0, 1); // Compile and paint under the opening before the cut.
    return { draw, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
