// Regenerate only when a seasonal illustration or its depth contours change.
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('@playwright/test');

// Shorelines and foreground silhouettes, in the original illustration's coordinates.
const contours = {
  spring: {
    shore: '0,58 10,54 18,58 29,50 37,54 49,49 63,54 78,42 89,51 100,43',
    near: '0,91 10,84 19,90 27,80 31,69 36,61 41,52 45,43 47,40 49,41 51,43 53,44 55,46 57,48 58,38 57,30 55,24 53,17 52.4,9 52.4,0 100,0'
  },
  summer: {
    shore: '0,42 8,36 10,31 13,37 20,40 26,37 36,40 42,38 50,33 56,27 68,28 90,38 100,32',
    near: '0,52 4,62 8,68 10,66 10,63 12,63 12,70 20,68 28,65 31,64 31,61 34,61 35,65 39,60 43,56 48,53 52,48 55,42 57,34 55,36 54,35 57,29 58,23 56,20 56,16 58,13 60,13 60,9 62,4 64,0 100,0'
  },
  autumn: {
    shore: '0,39 9,40 15,43 21,40 27,41 34,38 39,40 46,32 53,31 60,24 77,29 100,25',
    near: '0,88 10,83 20,79 30,74 34,73 34,71 38,70 39,73 42,70 45,68 46,65 50,62 54,60 57,55 60,50 62,44 63,39 61,35 59,30 57,23 56.6,16 56.7,10 57.8,3 58.3,0 100,0'
  },
  winter: {
    shore: '0,42 9,35 16,41 21,37 29,35 36,31 42,28 51,24 63,25 82,37 100,31',
    near: '0,68 4,66 6,64 9,66 10,72 15,75 17,71 20,69 24,70 25,74 31,77 34,72 37,68 40,62 44,57 47,51 48,47 45,43 42,40 41,38 44,39 47,40 50,43 54,39 57,33 59,27 57,22 56,17 55,10 55,0 100,0'
  },
};

async function generate() {
  const target = path.join(__dirname, '../src/frontend/assets/hub-depth');
  await fs.mkdir(target, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  try {
    const page = await browser.newPage();
    for (const [season, planes] of Object.entries(contours)) {
      for (const [name, points] of Object.entries(planes)) {
        const png = await page.evaluate(async ({ name, points }) => {
          const canvas = document.createElement('canvas');
          canvas.width = 384;
          canvas.height = 216;
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="216" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs><filter id="edge" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="${name === 'near' ? 1.9 : 1.2}"/>
            </filter></defs>
            <polygon points="${points} 110,0 110,110 -10,110 -10,100" fill="white" stroke="white"
              stroke-width="7" stroke-linejoin="round" filter="url(#edge)"/>
          </svg>`;
          const image = new Image();
          image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
          await image.decode();
          canvas.getContext('2d').drawImage(image, 0, 0);
          return canvas.toDataURL('image/png').split(',')[1];
        }, { name, points });
        await fs.writeFile(path.join(target, season + '-' + name + '.png'), Buffer.from(png, 'base64'));
      }
    }
  } finally {
    await browser.close();
  }
}
generate().catch(error => { console.error(error); process.exitCode = 1; });
