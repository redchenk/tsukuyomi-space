const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const BACKGROUND_URL = '/assets/images/yachiyo-hub-stand.png';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('分享卡背景加载失败'));
    image.src = url;
  });
}

function drawCover(ctx, image) {
  const scale = Math.max(CARD_WIDTH / image.naturalWidth, CARD_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, (CARD_WIDTH - width) / 2, (CARD_HEIGHT - height) / 2, width, height);
}

function splitLines(ctx, value, maxWidth, maxLines) {
  const source = String(value || '').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const lines = [];
  let current = '';
  for (const character of source) {
    const next = current + character;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = character;
      if (lines.length === maxLines) break;
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.join('').length < source.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function drawConversation(ctx, label, text, y, color, maxLines = 2) {
  ctx.fillStyle = color;
  ctx.font = '800 22px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillText(label, 72, y);
  ctx.fillStyle = '#f7fbff';
  ctx.font = '700 34px "Microsoft YaHei", "PingFang SC", sans-serif';
  const lines = splitLines(ctx, text, 750, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, 72, y + 50 + index * 48));
  return y + 50 + Math.max(1, lines.length) * 48;
}

export async function renderRoomShareCard({ title, userMessage, assistantMessage, scene = {} }) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#10182c';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  try {
    drawCover(ctx, await loadImage(BACKGROUND_URL));
  } catch (_) {
    // The text card remains usable if the decorative image is temporarily unavailable.
  }

  const overlay = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  overlay.addColorStop(0, 'rgba(6, 12, 26, 0.94)');
  overlay.addColorStop(0.68, 'rgba(8, 16, 34, 0.72)');
  overlay.addColorStop(1, 'rgba(8, 16, 34, 0.16)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = '#aef2ff';
  ctx.font = '900 18px "Segoe UI", sans-serif';
  ctx.fillText('TSUKUYOMI SPACE · ROOM MEMORY', 72, 58);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 43px "Microsoft YaHei", "PingFang SC", sans-serif';
  const titleLines = splitLines(ctx, title || '与八千代的一次对话', 760, 1);
  ctx.fillText(titleLines[0] || '与八千代的一次对话', 72, 112);

  let y = drawConversation(ctx, '你', userMessage, 172, '#9ee2cf', 2);
  y = drawConversation(ctx, '八千代', assistantMessage, y + 26, '#ffb7d4', 3);

  const weather = String(scene.weather || 'clear');
  const location = [scene.city, scene.temperature == null ? '' : `${scene.temperature}°C`, weather].filter(Boolean).join(' · ');
  ctx.fillStyle = 'rgba(235, 247, 255, 0.78)';
  ctx.font = '700 20px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillText(location || '月读空间', 72, 582);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(235, 247, 255, 0.68)';
  ctx.fillText('yachiyo.hk', 1128, 582);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/jpeg', 0.9);
}
