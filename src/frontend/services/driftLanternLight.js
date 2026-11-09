import { FILM, lakeIgnition, lakeLightPoint, lakeWaterPoint } from './driftLanternMotion';

const TAU = Math.PI * 2;
const ease = n => Math.max(0, Math.min(1, n));
const rand = (i, salt) => ((Math.sin(i * 98.17 + salt * 42.61) * 43758.5453) % 1 + 1) % 1;

function glow(ctx, x, y, radius, strength) {
  if (radius < .5 || strength < .005) return;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(255,226,164,${.67 * strength})`);
  gradient.addColorStop(.24, `rgba(255,177,81,${.36 * strength})`);
  gradient.addColorStop(.59, `rgba(238,139,49,${.12 * strength})`);
  gradient.addColorStop(1, 'rgba(238,139,49,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function ring(ctx, x, y, radius, depth, alpha, index) {
  if (alpha < .008) return;
  ctx.lineWidth = .65 + depth * .55;
  for (let i = 0; i < 5; i++) {
    const angle = (i + rand(index, i) * .61) * TAU / 5;
    ctx.strokeStyle = `rgba(255,205,137,${alpha * (.32 + rand(i, index) * .68)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * .125, 0, angle, angle + .46 + rand(index, i + 8) * .61);
    ctx.stroke();
  }
}

function mote(ctx, x, y, radius, alpha) {
  if (alpha < .01) return;
  ctx.fillStyle = `rgba(255,210,136,${alpha * .19})`;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255,234,180,${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function lightOnWater(ctx, time, g, opacity) {
  const { start, moon, shore, portrait, lanternWidth } = g;
  // The portrait artwork has open water here. Paint the same tapering
  // moon track as the wide painting, with a gentle water-driven shimmer.
  const intensity = Math.min(1, time / 600) * (portrait ? .92 : .56) * opacity;
  for (let i = 0; i < 34; i++) {
    const f = (i + .25) / 34;
    const y = shore.y + (start.y - shore.y + lanternWidth * .85) * f;
    const x = moon.x + (rand(i, 1) - .5) * (8 + 46 * f) + Math.sin(time * .004 + i) * (2 + f * 5);
    const w = (4 + 29 * f) * (.28 + rand(i, 3));
    const h = .65 + f * 2.5;
    const a = (.035 + rand(i, 9) * .20) * (1 - f * .52) * intensity;
    const stripe = ctx.createLinearGradient(x - w, 0, x + w, 0);
    stripe.addColorStop(0, 'rgba(255,202,133,0)');
    stripe.addColorStop(.42, `rgba(255,209,152,${a})`);
    stripe.addColorStop(.62, `rgba(255,229,174,${a})`);
    stripe.addColorStop(1, 'rgba(255,202,133,0)');
    ctx.fillStyle = stripe;
    ctx.fillRect(x - w, y, w * 2, h);
  }
}

export function paintLakeLight(ctx, g, time, lamp, light, fade, pulse) {
  const { viewport, image, lanternWidth, start, moon } = g;
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  if (time >= 4250) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(image.left, image.top, image.width, image.height);
  ctx.clip();

  const sceneOpacity = 1 - ease((time - FILM.zoom) / 250);
  lightOnWater(ctx, time, g, sceneOpacity);

  for (let i = 0; i < 3; i++) {
    const age = (time - i * 110) / 960;
    if (age >= 0 && age < 1) {
      ring(ctx, start.x, start.y, lanternWidth * (.36 + age * 1.6), 1, .62 * ease(age / .16) * (1 - age) ** 1.45, i);
    }
  }

  if (time >= FILM.ignite && time < 4000) {
    for (let i = 0; i < 8; i++) {
      const born = Math.min(FILM.shore - 40, Math.floor(time / 142) * 142) - i * 142;
      const age = (time - born) / 1120;
      if (born < FILM.ignite || age >= 1) continue;
      const p = lakeWaterPoint(born, g);
      ring(ctx, p.x, p.y + age * 5, Math.max(3, p.size * lanternWidth * (.13 + age * .43)), p.size, .33 * (1 - age) ** 1.45, born);
    }
    for (let i = 0; i < 18; i++) {
      const born = Math.floor((time - i * 41) / 738) * 738 + i * 41;
      const age = (time - born) / 770;
      if (born < FILM.ignite || born >= FILM.shore || age >= 1) continue;
      const p = lakeWaterPoint(born, g);
      mote(ctx, p.x + (rand(i, 4) - .5) * (6 + 26 * age) * p.size,
        p.y - 3 - age * (8 + rand(i, 5) * 31) * p.size,
        (.55 + rand(i, 8)) * (.45 + .55 * p.size), (1 - age) ** 1.6 * .74);
    }
  }

  if (fade > .003) {
    const ignite = lakeIgnition(time);
    const strength = fade * ease(time / 190);
    const radius = lanternWidth * lamp.size;
    glow(ctx, lamp.x, lamp.y - radius * .36, radius * (1.13 + ignite * .65), strength * (.40 + ignite * .59));
    glow(ctx, lamp.x, lamp.y + radius * .20, radius * .83, strength * (.19 + ignite * .22));
  }

  if (time >= FILM.shore && time < 3900) {
    const appear = ease((time - FILM.shore) / 105);
    const vanish = 1 - ease((time - 3820) / 80);
    for (let i = 13; i > 0; i--) {
      const tailTime = time - i * 15;
      if (tailTime < FILM.shore) continue;
      const p = lakeLightPoint(tailTime, g);
      const spread = i * .72;
      mote(ctx, p.x + (rand(i, 6) - .5) * spread, p.y + (rand(i, 7) - .5) * spread,
        1.55 - i * .063, appear * vanish * (1 - i / 16));
    }
    glow(ctx, light.x, light.y, 33, appear * vanish * .94);
    mote(ctx, light.x, light.y, 2.65, appear * vanish);
  }

  if (pulse > 0) {
    glow(ctx, moon.x, moon.y, moon.radius * (2.8 + (1 - pulse) * .7), pulse * 1.04 * sceneOpacity);
    ctx.strokeStyle = `rgba(255,218,152,${pulse * sceneOpacity * .32})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(moon.x, moon.y, moon.radius * (1.10 + (1 - pulse) * .65), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
