// Usage: node scripts/render-access-shrine.mjs /path/to/tsukuyomi-shrine
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

if (!process.argv[2]) throw new Error('Supply the shrine artwork directory');
const source = path.resolve(process.argv[2]);
const output = path.resolve('src/frontend/assets/access/shrine');
const tmp = await mkdtemp(path.join(tmpdir(), 'tsukuyomi-shrine-frames-'));
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const film = await readFile(path.join(source, 'assets/entry-tunnel.mp4'));
const crossing = (await readFile(path.join(source, 'src/crossing.js'), 'utf8'))
  .replace("'./landmarks.js'", "'/services/shrine/landmarks.js'");
const server = await createServer({
  configFile: false, root: path.resolve('src/frontend'), publicDir: false, logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: ['three'] },
  server: { host: '127.0.0.1', port: 0, hmr: false, open: false },
  plugins: [{
    name: 'offline-shrine-bake',
    resolveId(id) { if (id === 'virtual:shrine-crossing') return '\0' + id; },
    load(id) { if (id === '\0virtual:shrine-crossing') return crossing + '\nexport { T };'; }
  }]
});
const filenames = [];
let browser;
try {
  await server.listen();
  const base = server.resolvedUrls.local[0];
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
  for (const [suffix, width, height] of [['', 1440, 810], ['-mobile', 576, 1024]]) {
    const dir = path.join(tmp, suffix || 'desktop');
    await mkdir(dir);
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.route('**/shrine-bake', route => route.fulfill({
      contentType: 'text/html', body: '<style>*{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>'
    }));
    await page.route('**/optical-tunnel.mp4', route => {
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), film.length - 1) : film.length - 1;
      const headers = { 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4' };
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${film.length}`;
      return route.fulfill({ status: range ? 206 : 200, headers, body: film.subarray(start, end + 1) });
    });
    await page.goto(base + 'shrine-bake');
    await page.evaluate(async () => {
      const { createCrossing, T } = await import('/@id/virtual:shrine-crossing');
      const { createShrineRenderer } = await import('/services/shrine/renderer.js');
      const { approachPose } = await import('/services/shrine/approach.js');
      const surface = document.querySelector('canvas');
      const scene = await createShrineRenderer(surface, new AbortController().signal);
      const renderer = new T.WebGLRenderer({ alpha: false });
      renderer.setSize(innerWidth, innerHeight, false);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      const ready = new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
      video.src = '/optical-tunnel.mp4';
      await ready;
      const optics = new T.VideoTexture(video);
      const tunnel = createCrossing(renderer, optics, null);
      const aspect = innerWidth / innerHeight, portrait = aspect < 1;
      const quality = Math.max(1, Math.sqrt(innerWidth * innerHeight / 1100000));
      window.bake = async (index, mime = 'image/png') => {
        const time = index / 30;
        let canvas = surface;
        if (time < 5) {
          const seek = new Promise(resolve => { video.onseeked = resolve; });
          video.currentTime = (index + .4) / 30;
          await seek;
          optics.needsUpdate = true;
          tunnel.draw(aspect);
          canvas = renderer.domElement;
        } else if (time < 10) {
          scene.drawPose(approachPose(time, aspect, portrait), time, time, quality);
        } else {
          scene.draw(0, time - 10, time - 10, quality);
        }
        if (canvas.width !== innerWidth || canvas.height !== innerHeight) throw new Error('Wrong capture resolution');
        return canvas.toDataURL(mime, .92).split(',')[1];
      };
    });
    for (let i = 0; i < 369; i++) {
      const data = await page.evaluate(index => window.bake(index), i);
      if (errors.length) throw new Error(errors.join('\n'));
      await writeFile(path.join(dir, String(i).padStart(3, '0') + '.png'), Buffer.from(data, 'base64'));
      if (i % 75 === 0) console.log(`${width}×${height} frame ${i}/369`);
    }
    const poster = 'shrine-poster' + suffix + '.webp';
    const still = await page.evaluate(() => window.bake(300, 'image/webp'));
    await writeFile(path.join(tmp, poster), Buffer.from(still, 'base64'));
    filenames.push(poster);
    await page.close();
    for (const [name, start, count] of [['standby', 0, 300], ['nightfall', 300, 69]]) {
      const filename = 'shrine-' + name + suffix + '.mp4';
      execFileSync(ffmpeg, ['-v','error','-y','-framerate','30','-start_number',String(start),
        '-i',path.join(dir,'%03d.png'),'-frames:v',String(count),'-vf','scale=out_color_matrix=bt709:out_range=tv',
        '-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-color_range','tv',
        '-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','bt709',
        path.join(dir,filename)]);
      // Also set the coded stream's VUI. Some encoders replace its transfer
      // tags while converting RGB to limited-range YUV.
      execFileSync(ffmpeg, ['-v','error','-y','-i',path.join(dir,filename),'-map','0:v:0','-c:v','copy',
        '-bsf:v','h264_metadata=colour_primaries=1:transfer_characteristics=13:matrix_coefficients=1:video_full_range_flag=0',
        '-color_range','tv','-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','bt709',
        '-movflags','+faststart+write_colr',path.join(tmp,filename)]);
      filenames.push(filename);
    }

  }
  for (const name of filenames) await copyFile(path.join(tmp,name),path.join(output,name));
} finally {
  await browser?.close();
  await server.close();
  await rm(tmp, {recursive:true, force:true});
}
