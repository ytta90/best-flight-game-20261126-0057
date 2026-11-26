// Drawing only: the world's state and the current screen in, pixels out. A real 3D
// projection puts the canyon on the screen: the camera rides behind the plane, the ground
// rushes under it in a perspective grid, the walls stand on either side, and the rings hang
// in the air ahead. The HUD is lit instruments: altitude, speed and heading, fuel and hull,
// an attitude ball and a compass strip. Text that holds a number is rebuilt only when the
// number changes, so a frame allocates almost nothing.

import { FIELD, FONT, PALETTE } from './config.js';
import { feet, headingDeg, knots } from './flight.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_COMPLETE = 'complete';

const FOCAL = 470; // pixels: a 75-degree field of view over 720 lines
const VIEW_AHEAD = 650; // metres of canyon drawn
const SLICE = 25; // metres between ground-grid slices

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexLerp(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return `rgb(${r},${g},${bl})`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const altLabel = cachedLabel('');
  const vsiLabel = cachedLabel('');
  const spdLabel = cachedLabel('');
  const scoreLabel = cachedLabel('');
  const ringsLabel = cachedLabel('');
  const distLabel = cachedLabel('');
  const fuelLabel = cachedLabel('');
  const hullLabel = cachedLabel('');
  const headingLabel = cachedLabel('');

  // Particles live here: ring bursts, wall sparks, crash debris. Screen-space, short-lived.
  const particles = [];
  function burst(x, y, color, count, speed) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 40, life: 0.5 + Math.random() * 0.4, age: 0, color, size: 2 + Math.random() * 3 });
    }
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, glow) {
    if (!fonts.has(size)) fonts.set(size, `600 ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    if (glow) {
      context.shadowColor = color;
      context.shadowBlur = 8;
    } else {
      context.shadowBlur = 0;
    }
    context.fillText(value, x, y);
    context.shadowBlur = 0;
  }

  /** Project a world point into screen space. Null when behind the camera. */
  function project(px, py, pz, cam) {
    const dx = px - cam.x;
    const dy = py - cam.y;
    const dz = pz - cam.z;
    const cosY = Math.cos(cam.yaw);
    const sinY = Math.sin(cam.yaw);
    const rx = dx * cosY - dz * sinY;
    const rz = dx * sinY + dz * cosY;
    const cosP = Math.cos(cam.pitch);
    const sinP = Math.sin(cam.pitch);
    const ry2 = dy * cosP - rz * sinP;
    const rz2 = dy * sinP + rz * cosP;
    if (rz2 < 1) return null;
    return { x: cam.cx + (rx / rz2) * cam.focal, y: cam.cy - (ry2 / rz2) * cam.focal, d: rz2 };
  }

  function fogFactor(d) {
    return Math.max(0, Math.min(1, d / VIEW_AHEAD));
  }

  function drawSky(cam, elapsed) {
    const horizonY = cam.cy - Math.tan(cam.pitch) * cam.focal;
    const grad = context.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.45, PALETTE.skyMid);
    grad.addColorStop(0.62, PALETTE.skyHorizon);
    grad.addColorStop(0.72, PALETTE.skyLow);
    grad.addColorStop(1, PALETTE.groundDark);
    context.fillStyle = grad;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // The low sun, up and to the left, with its glow.
    const sunX = FIELD.width / 2 - 300 - cam.yaw * 420;
    const sunY = horizonY - 130;
    const glow = context.createRadialGradient(sunX, sunY, 8, sunX, sunY, 150);
    glow.addColorStop(0, 'rgba(255, 190, 90, 0.85)');
    glow.addColorStop(0.4, 'rgba(255, 138, 60, 0.35)');
    glow.addColorStop(1, 'rgba(255, 138, 60, 0)');
    context.fillStyle = glow;
    context.fillRect(sunX - 150, sunY - 150, 300, 300);
    context.fillStyle = PALETTE.sunCore;
    context.beginPath();
    context.arc(sunX, sunY, 34, 0, Math.PI * 2);
    context.fill();

    // Two mountain ridges, far and near, sliding with the heading.
    drawRidge(horizonY, cam.yaw * 260, 46, PALETTE.mountainFar, 0.004, 3.1);
    drawRidge(horizonY + 26, cam.yaw * 520, 78, PALETTE.mountainNear, 0.006, 7.7);

    // Clouds drift across the upper sky: soft, warm, lit by the sun.
    context.fillStyle = 'rgba(255, 240, 224, 0.72)';
    for (let index = 0; index < 10; index += 1) {
      const base = index * 173 + 60;
      const drift = ((base + elapsed * (2 + index * 0.7) - cam.yaw * 300) % (FIELD.width + 360) + FIELD.width + 360) % (FIELD.width + 360) - 180;
      const cy = 60 + (index % 4) * 42;
      const size = 46 + (index % 3) * 26;
      context.beginPath();
      context.ellipse(drift, cy, size, size * 0.32, 0, 0, Math.PI * 2);
      context.ellipse(drift + size * 0.5, cy + 8, size * 0.6, size * 0.24, 0, 0, Math.PI * 2);
      context.ellipse(drift - size * 0.45, cy + 6, size * 0.5, size * 0.22, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawRidge(baseY, offset, amp, color, freq, seed) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, FIELD.height);
    for (let x = 0; x <= FIELD.width; x += 16) {
      const peak =
        Math.sin(x * freq + seed) * 0.6 + Math.sin(x * freq * 2.7 + seed * 2.3) * 0.3 + Math.sin(x * freq * 0.31 + seed * 0.7) * 0.5;
      context.lineTo(x, baseY - amp * (0.55 + peak * 0.45) - offset * 0.12);
    }
    context.lineTo(FIELD.width, FIELD.height);
    context.closePath();
    context.fill();
  }

  function drawGround(world, cam) {
    const zStart = Math.ceil((cam.z + 8) / SLICE) * SLICE;
    // The canyon floor itself, sandy and lit, fading into the haze.
    for (let z = zStart; z <= cam.z + VIEW_AHEAD - SLICE; z += SLICE) {
      const hw0 = world.halfWidthAt(z);
      const hw1 = world.halfWidthAt(z + SLICE);
      const a = project(-hw0, 0, z, cam);
      const b = project(hw0, 0, z, cam);
      const c = project(hw1, 0, z + SLICE, cam);
      const d = project(-hw1, 0, z + SLICE, cam);
      if (!a || !b || !c || !d) continue;
      context.fillStyle = hexLerp(PALETTE.groundSand, PALETTE.skyHorizon, fogFactor(a.d) * 0.85);
      context.globalAlpha = 0.92;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.lineTo(c.x, c.y);
      context.lineTo(d.x, d.y);
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
    }
    // Longitudinal lines first: the canyon floor rushing under the plane.
    for (const lx of [-40, -20, 0, 20, 40]) {
      context.beginPath();
      let started = false;
      for (let z = zStart; z <= cam.z + VIEW_AHEAD; z += SLICE) {
        if (Math.abs(lx) > world.halfWidthAt(z) - 2) continue;
        const p = project(lx, 0, z, cam);
        if (!p) continue;
        if (!started) {
          context.moveTo(p.x, p.y);
          started = true;
        } else context.lineTo(p.x, p.y);
      }
      context.strokeStyle = hexLerp(PALETTE.groundLine, PALETTE.skyHorizon, 0.55);
      context.globalAlpha = 0.5;
      context.lineWidth = 1.5;
      context.stroke();
      context.globalAlpha = 1;
    }
    // Lateral slices: the ground's own rungs, fading into the haze.
    for (let z = zStart; z <= cam.z + VIEW_AHEAD; z += SLICE) {
      const hw = world.halfWidthAt(z);
      const left = project(-hw, 0, z, cam);
      const right = project(hw, 0, z, cam);
      if (!left || !right) continue;
      const fog = fogFactor(left.d);
      context.strokeStyle = hexLerp(PALETTE.groundSand, PALETTE.skyHorizon, fog * 0.8);
      context.globalAlpha = 0.75 - fog * 0.55;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(left.x, left.y);
      context.lineTo(right.x, right.y);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  function drawWalls(world, cam) {
    const zStart = Math.ceil((cam.z + 8) / SLICE) * SLICE;
    for (let side = -1; side <= 1; side += 2) {
      for (let z = zStart; z <= cam.z + VIEW_AHEAD - SLICE; z += SLICE) {
        const z2 = z + SLICE;
        const hw1 = world.halfWidthAt(z) * side;
        const hw2 = world.halfWidthAt(z2) * side;
        const h1 = world.wallHeightAt(z);
        const h2 = world.wallHeightAt(z2);
        const a = project(hw1, 0, z, cam);
        const b = project(hw1, h1, z, cam);
        const c = project(hw2, h2, z2, cam);
        const d = project(hw2, 0, z2, cam);
        if (!a || !b || !c || !d) continue;
        const fog = fogFactor(a.d);
        const shade = Math.sin(z * 0.05) * 0.5 + 0.5;
        const base = side < 0 ? PALETTE.rock : PALETTE.rockLight;
        context.fillStyle = hexLerp(hexLerp(base, PALETTE.rockDark, shade * 0.35), PALETTE.skyHorizon, fog * 0.75);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.lineTo(c.x, c.y);
        context.lineTo(d.x, d.y);
        context.closePath();
        context.fill();
        // One strata line across the face, so the rock reads as rock.
        const mid1 = project(hw1, h1 * 0.55, z, cam);
        const mid2 = project(hw2, h2 * 0.55, z2, cam);
        if (mid1 && mid2) {
          context.strokeStyle = hexLerp(PALETTE.rockStrata, PALETTE.skyHorizon, fog * 0.7);
          context.globalAlpha = 0.6;
          context.lineWidth = 1.5;
          context.beginPath();
          context.moveTo(mid1.x, mid1.y);
          context.lineTo(mid2.x, mid2.y);
          context.stroke();
          context.globalAlpha = 1;
        }
      }
    }
  }

  function drawRunway(world, cam) {
    const runway = world.runway;
    if (!runway) return;
    const z0 = Math.max(runway.z0, cam.z + 4);
    const z1 = Math.min(runway.z1, cam.z + VIEW_AHEAD);
    if (z1 <= z0) return;
    const corners = [
      project(-runway.half, 0.3, z0, cam),
      project(runway.half, 0.3, z0, cam),
      project(runway.half, 0.3, z1, cam),
      project(-runway.half, 0.3, z1, cam),
    ];
    if (corners.some((p) => !p)) return;
    context.fillStyle = PALETTE.runway;
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    for (const p of corners.slice(1)) context.lineTo(p.x, p.y);
    context.closePath();
    context.fill();
    // Centreline dashes and edge lights, marching away.
    for (let z = Math.ceil(z0 / 30) * 30; z < z1; z += 30) {
      const a = project(0, 0.4, z, cam);
      const b = project(0, 0.4, z + 15, cam);
      if (a && b) {
        context.strokeStyle = PALETTE.runwayLine;
        context.lineWidth = Math.max(1, 300 / a.d);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
      for (const side of [-1, 1]) {
        const light = project(side * runway.half, 0.6, z, cam);
        if (light) {
          context.fillStyle = PALETTE.runwayLight;
          context.beginPath();
          context.arc(light.x, light.y, Math.max(1.5, 160 / light.d), 0, Math.PI * 2);
          context.fill();
        }
      }
    }
  }

  function drawSpires(world, cam) {
    for (const spire of world.spiresInRange(cam.z + 4, cam.z + VIEW_AHEAD)) {
      const base = project(spire.x, 0, spire.z, cam);
      const top = project(spire.x, spire.h, spire.z, cam);
      if (!base || !top) continue;
      const wBottom = Math.max(2, (spire.r * 2 * cam.focal) / base.d);
      const wTop = wBottom * 0.35;
      const fog = fogFactor(base.d);
      context.fillStyle = hexLerp(PALETTE.spire, PALETTE.skyHorizon, fog * 0.7);
      context.beginPath();
      context.moveTo(base.x - wBottom / 2, base.y);
      context.lineTo(top.x - wTop / 2, top.y);
      context.lineTo(top.x + wTop / 2, top.y);
      context.lineTo(base.x + wBottom / 2, base.y);
      context.closePath();
      context.fill();
      // Sunlit edge, so the rock has a lit side.
      context.strokeStyle = hexLerp(PALETTE.spireEdge, PALETTE.skyHorizon, fog * 0.7);
      context.lineWidth = Math.max(1, wBottom * 0.12);
      context.beginPath();
      context.moveTo(base.x - wBottom / 2, base.y);
      context.lineTo(top.x - wTop / 2, top.y);
      context.stroke();
    }
  }

  function drawRings(world, cam, elapsed) {
    const rings = world.ringsInRange(cam.z + 4, cam.z + VIEW_AHEAD).slice().sort((a, b) => b.z - a.z);
    for (const ring of rings) {
      const c = project(ring.x, ring.y, ring.z, cam);
      // A ring at the camera plane projects to an enormous arc: skip it.
      if (!c || c.d < 12) continue;
      const radius = (ring.r * cam.focal) / c.d;
      if (radius < 2) continue;
      const pulse = 1 + Math.sin(elapsed * 3 + ring.z) * 0.06;
      const fog = fogFactor(c.d);
      const color = ring.fuel ? PALETTE.fuelRing : PALETTE.ring;
      context.save();
      context.globalAlpha = ring.done ? 0.25 : 1 - fog * 0.55;
      context.strokeStyle = color;
      context.lineWidth = Math.max(2, Math.min(11, radius * 0.14));
      if (c.d < 320) {
        context.shadowColor = color;
        context.shadowBlur = 16;
      }
      context.beginPath();
      context.ellipse(c.x, c.y, radius * pulse, radius * 0.92 * pulse, 0, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      context.globalAlpha *= 0.5;
      context.lineWidth = Math.max(1, radius * 0.05);
      context.beginPath();
      context.ellipse(c.x, c.y, radius * 0.72 * pulse, radius * 0.66 * pulse, 0, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  function drawPlane(f, elapsed) {
    const cx = FIELD.width / 2;
    const cy = FIELD.height / 2 + 118;
    const flicker = 0.75 + Math.sin(elapsed * 31) * 0.12 + Math.sin(elapsed * 57) * 0.08;
    context.save();
    context.translate(cx, cy);
    context.rotate(f.roll * 0.9);
    context.scale(1.12, 1.12);
    // Engine glow: two hot tails behind the plane, brighter with throttle.
    const glow = 26 + f.throttle * 30 * flicker + (f.boost ? 18 : 0);
    const grad = context.createRadialGradient(0, 52, 2, 0, 52, glow);
    grad.addColorStop(0, 'rgba(255, 200, 90, 0.9)');
    grad.addColorStop(0.5, 'rgba(255, 122, 60, 0.45)');
    grad.addColorStop(1, 'rgba(255, 122, 60, 0)');
    context.fillStyle = grad;
    context.beginPath();
    context.ellipse(0, 52, glow * 0.55, glow, 0, 0, Math.PI * 2);
    context.fill();
    // Wings, swept back toward the tail.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(-14, -6);
    context.lineTo(-96, 34);
    context.lineTo(-88, 46);
    context.lineTo(-10, 22);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(14, -6);
    context.lineTo(96, 34);
    context.lineTo(88, 46);
    context.lineTo(10, 22);
    context.closePath();
    context.fill();
    // Wing accent stripes.
    context.fillStyle = PALETTE.planeAccent;
    context.beginPath();
    context.moveTo(-40, 6);
    context.lineTo(-92, 36);
    context.lineTo(-86, 43);
    context.lineTo(-32, 13);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(40, 6);
    context.lineTo(92, 36);
    context.lineTo(86, 43);
    context.lineTo(32, 13);
    context.closePath();
    context.fill();
    // Tailplane.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(-10, 34);
    context.lineTo(-46, 52);
    context.lineTo(-40, 58);
    context.lineTo(-8, 46);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(10, 34);
    context.lineTo(46, 52);
    context.lineTo(40, 58);
    context.lineTo(8, 46);
    context.closePath();
    context.fill();
    // Fuselage: wide at the tail, tapering to the nose.
    const fus = context.createLinearGradient(0, 62, 0, -64);
    fus.addColorStop(0, '#c8d4de');
    fus.addColorStop(0.6, PALETTE.planeBody);
    fus.addColorStop(1, '#ffffff');
    context.fillStyle = fus;
    context.beginPath();
    context.moveTo(-13, 58);
    context.quadraticCurveTo(-15, 0, -5, -62);
    context.quadraticCurveTo(0, -68, 5, -62);
    context.quadraticCurveTo(15, 0, 13, 58);
    context.quadraticCurveTo(0, 64, -13, 58);
    context.closePath();
    context.fill();
    // Vertical fin.
    context.fillStyle = PALETTE.planeAccent;
    context.beginPath();
    context.moveTo(-4, 44);
    context.lineTo(-3, 6);
    context.lineTo(2, -6);
    context.lineTo(6, 40);
    context.closePath();
    context.fill();
    // Canopy glint.
    context.fillStyle = PALETTE.planeCanopy;
    context.beginPath();
    context.ellipse(0, -34, 5.5, 13, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.85)';
    context.beginPath();
    context.ellipse(-1.5, -40, 1.8, 6, 0, 0, Math.PI * 2);
    context.fill();
    // Navigation lights: red left, green right, blinking with the clock.
    if (Math.floor(elapsed * 2) % 2 === 0) {
      context.fillStyle = '#ff4d4d';
      context.beginPath();
      context.arc(-94, 40, 3.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#4dff88';
      context.beginPath();
      context.arc(94, 40, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    // Speed streaks at the screen edges when the air is really moving.
    if (f.speed > 55) {
      context.strokeStyle = 'rgba(255,255,255,0.28)';
      context.lineWidth = 2;
      for (let index = 0; index < 8; index += 1) {
        const y = ((index * 97 + elapsed * 900) % 720);
        const len = 20 + f.speed * 0.5;
        context.beginPath();
        context.moveTo(8, y);
        context.lineTo(8 + len, y);
        context.moveTo(FIELD.width - 8, y);
        context.lineTo(FIELD.width - 8 - len, y);
        context.stroke();
      }
    }
  }

  function drawParticles(dt) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const p = particles[index];
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(index, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      context.globalAlpha = 1 - p.age / p.life;
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawHud(world, f) {
    const s = world.state;
    context.textBaseline = 'alphabetic';
    // Altitude and vertical speed, top left.
    text('ALT', 28, 44, 16, PALETTE.hudDim, 'left');
    text(altLabel(`${Math.round(feet(f.y)).toLocaleString('en-US')} FT`), 28, 76, 34, PALETTE.hudText, 'left', true);
    text(vsiLabel(`VSI ${f.climbRate >= 0 ? '+' : ''}${Math.round(feet(f.climbRate) * 60).toLocaleString('en-US')} FPM`), 28, 102, 15, PALETTE.hudDim, 'left');
    // Speed and throttle, under the altitude.
    text('SPD', 28, 138, 16, PALETTE.hudDim, 'left');
    text(spdLabel(`${Math.round(knots(f.speed))} KT`), 28, 170, 34, PALETTE.hudText, 'left', true);
    const thrW = 150;
    context.fillStyle = 'rgba(255,255,255,0.15)';
    context.fillRect(28, 182, thrW, 8);
    context.fillStyle = f.boost ? PALETTE.hudAmber : PALETTE.hudGreen;
    context.fillRect(28, 182, thrW * f.throttle, 8);
    text('THR', 186, 190, 13, PALETTE.hudDim, 'left');
    if (f.boost) text('BOOST', 222, 190, 13, PALETTE.hudAmber, 'left', true);

    // Compass strip, top centre.
    const hdg = headingDeg(f.heading);
    const stripX = FIELD.width / 2;
    context.fillStyle = 'rgba(16,24,39,0.55)';
    context.fillRect(stripX - 170, 18, 340, 44);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(stripX - 170, 18, 340, 44);
    for (let deg = -60; deg <= 60; deg += 15) {
      const d = Math.round(hdg + deg);
      const norm = ((d % 360) + 360) % 360;
      const x = stripX + deg * 2.6;
      const major = norm % 45 === 0;
      context.strokeStyle = PALETTE.hudDim;
      context.lineWidth = major ? 2 : 1;
      context.beginPath();
      context.moveTo(x, 52);
      context.lineTo(x, major ? 38 : 44);
      context.stroke();
      if (major) {
        const label = norm === 0 ? 'N' : norm === 90 ? 'E' : norm === 180 ? 'S' : norm === 270 ? 'W' : String(norm).padStart(3, '0');
        text(label, x, 34, 13, PALETTE.hudText, 'center');
      }
    }
    text(headingLabel(`${Math.round(hdg).toString().padStart(3, '0')}°`), stripX, 84, 20, PALETTE.hudAmber, 'center', true);
    // Flight path marker: where the nose is actually going.
    const fpmX = stripX + f.heading * 420;
    const fpmY = FIELD.height / 2 - f.pitch * 380;
    context.strokeStyle = PALETTE.hudGreen;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(fpmX, fpmY, 9, 0, Math.PI * 2);
    context.moveTo(fpmX - 15, fpmY);
    context.lineTo(fpmX - 6, fpmY);
    context.moveTo(fpmX + 6, fpmY);
    context.lineTo(fpmX + 15, fpmY);
    context.moveTo(fpmX, fpmY - 15);
    context.lineTo(fpmX, fpmY - 6);
    context.stroke();

    // Score, rings and distance, top right.
    text('SCORE', FIELD.width - 28, 44, 16, PALETTE.hudDim, 'right');
    text(scoreLabel(s.score.toLocaleString('en-US')), FIELD.width - 28, 76, 34, PALETTE.hudText, 'right', true);
    if (s.ringsTotal > 0) text(ringsLabel(`RINGS ${s.ringsPassed}/${s.ringsTotal}`), FIELD.width - 28, 102, 15, PALETTE.hudAmber, 'right');
    text(distLabel(`${s.distanceKm.toFixed(2)} KM  ·  LVL ${s.level}`), FIELD.width - 28, 126, 15, PALETTE.hudDim, 'right');
    text(world.mission.name.toUpperCase(), FIELD.width - 28, 150, 15, PALETTE.hudText, 'right');

    // Fuel and hull, bottom left.
    text(fuelLabel(`FUEL ${Math.round(f.fuel)}%`), 28, FIELD.height - 78, 15, f.fuel < 25 ? PALETTE.hudRed : PALETTE.hudText, 'left');
    context.fillStyle = 'rgba(255,255,255,0.15)';
    context.fillRect(28, FIELD.height - 68, 190, 10);
    context.fillStyle = f.fuel < 25 ? PALETTE.hudRed : f.fuel < 50 ? PALETTE.hudAmber : PALETTE.hudGreen;
    context.fillRect(28, FIELD.height - 68, 190 * (f.fuel / 120), 10);
    text(hullLabel(`HULL ${Math.round(f.hull)}%`), 28, FIELD.height - 38, 15, f.hull < 35 ? PALETTE.hudRed : PALETTE.hudText, 'left');
    context.fillStyle = 'rgba(255,255,255,0.15)';
    context.fillRect(28, FIELD.height - 28, 190, 10);
    context.fillStyle = f.hull < 35 ? PALETTE.hudRed : f.hull < 60 ? PALETTE.hudAmber : PALETTE.hudGreen;
    context.fillRect(28, FIELD.height - 28, 190 * (f.hull / 100), 10);

    // Attitude indicator, bottom centre: the ball that never lies.
    const ax = FIELD.width / 2;
    const ay = FIELD.height - 88;
    const ar = 46;
    context.save();
    context.beginPath();
    context.arc(ax, ay, ar, 0, Math.PI * 2);
    context.clip();
    context.translate(ax, ay);
    context.rotate(-f.roll);
    context.translate(0, f.pitch * 160);
    context.fillStyle = '#2f6db3';
    context.fillRect(-ar, -ar * 2, ar * 2, ar * 2);
    context.fillStyle = '#7a5230';
    context.fillRect(-ar, 0, ar * 2, ar * 2);
    context.strokeStyle = 'rgba(255,255,255,0.8)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(-ar, 0);
    context.lineTo(ar, 0);
    context.stroke();
    context.restore();
    context.strokeStyle = PALETTE.hudText;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(ax, ay, ar, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.hudAmber;
    context.beginPath();
    context.moveTo(ax - 14, ay);
    context.lineTo(ax - 4, ay);
    context.lineTo(ax, ay - 5);
    context.lineTo(ax + 4, ay);
    context.lineTo(ax + 14, ay);
    context.lineTo(ax + 4, ay + 3);
    context.lineTo(ax - 4, ay + 3);
    context.closePath();
    context.fill();
    text('ATT', ax, ay + ar + 18, 12, PALETTE.hudDim, 'center');

    // Mission objective, bottom right.
    const lines = world.mission.goal.split(/(.{0,44}\S)\s/g).filter(Boolean);
    let oy = FIELD.height - 66;
    for (const line of lines.slice(0, 2)) {
      text(line, FIELD.width - 28, oy, 15, PALETTE.hudText, 'right');
      oy += 20;
    }
    if (s.streak >= 3) text(`STREAK x${s.streak}`, FIELD.width - 28, oy, 15, PALETTE.hudAmber, 'right', true);

    // Warnings, centre top, blinking with the clock.
    const blink = Math.floor(world.state.elapsed * 3) % 2 === 0;
    if (blink) {
      if (f.fuel < 25 && f.fuel > 0) text('LOW FUEL', FIELD.width / 2, 116, 22, PALETTE.hudRed, 'center', true);
      else if (f.stalled) text('STALL — NOSE DOWN, THROTTLE UP', FIELD.width / 2, 116, 22, PALETTE.hudRed, 'center', true);
      else if (f.pullingUp) text('PULL UP', FIELD.width / 2, 116, 22, PALETTE.hudAmber, 'center', true);
    }
  }

  function drawPanel(title, lines, prompt, width = 640) {
    const lineH = 30;
    const height = 120 + lines.length * lineH + 64;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(16,24,39,0.88)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 62, 44, PALETTE.hudText, 'center');
    lines.forEach((line, index) => {
      text(line.text, FIELD.width / 2, y + 116 + index * lineH, line.size ?? 20, line.color ?? PALETTE.hudDim, 'center');
    });
    text(prompt, FIELD.width / 2, y + height - 26, 20, PALETTE.hudAmber, 'center', true);
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(world, screen, best, events) {
    const f = world.flight;
    const elapsed = world.state.elapsed;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#141c33';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    const cam = {
      x: f.x * 0.9,
      y: f.y + 3.2,
      z: f.z - 15,
      yaw: f.heading,
      pitch: f.pitch * 0.6,
      focal: FOCAL,
      cx: FIELD.width / 2,
      cy: FIELD.height / 2,
    };

    // Ring bursts and wall sparks, from this frame's events.
    if (events & 1) {
      const passed = world.ringsInRange(Math.max(0, f.z - 40), f.z).filter((r) => r.done).pop();
      if (passed) {
        const p = project(passed.x, passed.y, passed.z, cam);
        if (p) burst(p.x, p.y, passed.fuel ? PALETTE.fuelRing : PALETTE.ring, 26, 260);
      }
    }
    if (events & 16) {
      const side = f.x < 0 ? 60 : FIELD.width - 60;
      burst(side, FIELD.height / 2 + 120, '#ffb347', 6, 160);
    }
    if (events & 8) burst(FIELD.width / 2, FIELD.height / 2 + 118, '#ff5d5d', 30, 320);

    drawSky(cam, elapsed);
    drawGround(world, cam);
    drawWalls(world, cam);
    drawRunway(world, cam);
    drawSpires(world, cam);
    drawRings(world, cam, elapsed);
    drawPlane(f, elapsed);
    drawParticles(1 / 60);

    if (screen === SCREEN_TITLE) {
      const lines = [
        { text: 'A dawn run down a canyon that does not forgive.', size: 21, color: PALETTE.hudText },
        { text: '', size: 20 },
        ...world.missionsList.map((m) => ({
          text: `${m.id}. ${m.name} — ${m.blurb}  Best ${m.best}`,
          size: 18,
        })),
        { text: '', size: 20 },
        { text: 'W/S throttle · ↑/↓ pitch · ←/→ bank · mouse steers · Shift boost', size: 18 },
        { text: 'Fly the rings. Mind the fuel. Land it if you can.', size: 18 },
      ];
      drawPanel('AERIS — Canyon Run', lines, 'Press 1, 2 or 3 to fly, or click', 780);
      return;
    }
    drawHud(world, f);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', [{ text: 'The canyon will wait for you.', size: 20 }], 'Press P to keep flying');
    } else if (screen === SCREEN_OVER) {
      drawPanel('Crashed', [
        { text: world.state.crashReason || 'The canyon wins this time.', size: 20, color: PALETTE.hudText },
        { text: `Score ${world.state.score.toLocaleString('en-US')}  ·  Best ${best.toLocaleString('en-US')}`, size: 20 },
        { text: `${world.state.distanceKm.toFixed(2)} km flown · ${world.state.ringsPassed} rings`, size: 18 },
      ], 'Press Space to fly again');
    } else if (screen === SCREEN_COMPLETE) {
      drawPanel(world.state.landed ? 'Landed — Mission Complete' : 'Mission Complete', [
        { text: world.state.landed ? 'Wheels down, gentle as a whisper.' : 'Every ring, every second, yours.', size: 20, color: PALETTE.hudText },
        { text: `Score ${world.state.score.toLocaleString('en-US')}  ·  Best ${best.toLocaleString('en-US')}`, size: 20 },
        { text: `${world.state.distanceKm.toFixed(2)} km flown · ${world.state.ringsPassed} rings`, size: 18 },
      ], 'Press Space to fly again, or 1 / 2 / 3 for another mission');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
