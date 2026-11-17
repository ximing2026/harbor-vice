// Drawing only: the world's state and the current screen in, pixels out.
// The camera follows the player through the city; the HUD, minimap and
// panels are drawn in screen space. Flat shapes, warm golden-hour colours,
// long shadows.
import { FONT, GRID, MONEY, PALETTE, VIEW, WORLD } from './config.js';
import { roadCenter } from './city.js';
import { missionName } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

const MINIMAP = { size: 196, x: 16, y: VIEW.height - 196 - 16 };

function hash(seed, n) {
  const v = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  let mapCanvas = null;
  let mapCity = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', bold = false) {
    const key = size + (bold ? 'b' : '');
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function buildMinimap(city) {
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = MINIMAP.size;
    mapCanvas.height = MINIMAP.size;
    const m = mapCanvas.getContext('2d');
    const s = MINIMAP.size / 2600;
    const ox = 80 * s;
    const oy = 80 * s;
    m.fillStyle = '#20242e';
    m.fillRect(0, 0, MINIMAP.size, MINIMAP.size);
    m.fillStyle = PALETTE.waterDeep;
    m.fillRect(0, (WORLD.waterY + 80) * s, MINIMAP.size, (MINIMAP.size - (WORLD.waterY + 80) * s));
    m.fillStyle = PALETTE.grass;
    m.fillRect(0, 0, MINIMAP.size, WORLD.waterY * s + oy);
    m.fillStyle = PALETTE.asphalt;
    for (let i = 0; i < GRID.roads; i += 1) {
      m.fillRect((roadCenter(i) - 36 + 80) * s, 0, 72 * s, WORLD.waterY * s);
      m.fillRect(0, (roadCenter(i) - 36 + 80) * s, (WORLD.maxX + 80) * s, 72 * s);
    }
    m.fillStyle = '#8a7f66';
    for (const b of city.buildings) m.fillRect((b.x + 80) * s, (b.y + 80) * s, b.w * s, b.h * s);
    m.fillStyle = '#6b4a2a';
    for (const pier of city.piers) m.fillRect((pier.x + 80) * s, (pier.y + 80) * s, pier.w * s, pier.h * s);
    mapCity = city;
  }

  function drawGround(state) {
    const city = state.city;
    const cam = state.camera;
    const vx0 = cam.x - VIEW.width / 2 - 60;
    const vy0 = cam.y - VIEW.height / 2 - 60;
    const vx1 = cam.x + VIEW.width / 2 + 60;
    const vy1 = cam.y + VIEW.height / 2 + 60;
    // Base ground: grass, then sand at the harbour front, then water.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(vx0, Math.max(vy0, 2470), vx1 - vx0, Math.max(0, Math.min(vy1, 2520) - Math.max(vy0, 2470)));
    const waterGrad = ctx.createLinearGradient(0, WORLD.waterY, 0, WORLD.waterY + WORLD.waterH);
    waterGrad.addColorStop(0, PALETTE.water);
    waterGrad.addColorStop(1, PALETTE.waterDeep);
    ctx.fillStyle = waterGrad;
    ctx.fillRect(vx0, Math.max(vy0, WORLD.waterY), vx1 - vx0, Math.max(0, Math.min(vy1, WORLD.waterY + WORLD.waterH) - Math.max(vy0, WORLD.waterY)));
    // Sun glints drifting on the water.
    ctx.fillStyle = PALETTE.waterGlint;
    for (let i = 0; i < 14; i += 1) {
      const gx = ((i * 173 + Math.floor(state.time * 12)) % 2600) - 80;
      const gy = WORLD.waterY + 20 + ((i * 67) % 220);
      if (gx > vx0 && gx < vx1 && gy > vy0 && gy < vy1) ctx.fillRect(gx, gy, 46, 3);
    }
    // Parks.
    ctx.fillStyle = PALETTE.parkGrass;
    for (const park of city.parks) ctx.fillRect(park.x, park.y, park.w, park.h);
    // Sidewalk strips along every road.
    ctx.fillStyle = PALETTE.sidewalk;
    for (let i = 0; i < GRID.roads; i += 1) {
      const c = roadCenter(i);
      ctx.fillRect(c - 50, -80, 14, 2600);
      ctx.fillRect(c + 36, -80, 14, 2600);
      ctx.fillRect(-80, c - 50, 2600, 14);
      ctx.fillRect(-80, c + 36, 2600, 14);
    }
    // Asphalt.
    for (let i = 0; i < GRID.roads; i += 1) {
      const c = roadCenter(i);
      ctx.fillStyle = i % 2 === 0 ? PALETTE.asphalt : PALETTE.asphalt2;
      ctx.fillRect(c - 36, -80, 72, 2600);
      ctx.fillRect(-80, c - 36, 2600, 72);
    }
    // Centre dashes and crosswalks.
    ctx.fillStyle = PALETTE.roadLine;
    for (let i = 0; i < GRID.roads; i += 1) {
      const c = roadCenter(i);
      for (let d = -60; d < 2560; d += 64) {
        if (d > vy0 && d < vy1) ctx.fillRect(c - 2, d, 4, 30);
        if (d > vx0 && d < vx1) ctx.fillRect(d, c - 2, 30, 4);
      }
    }
    ctx.fillStyle = PALETTE.crosswalk;
    for (let i = 0; i < GRID.roads; i += 1) {
      for (let j = 0; j < GRID.roads; j += 1) {
        const cx = roadCenter(i);
        const cy = roadCenter(j);
        for (let s = -30; s <= 30; s += 15) {
          ctx.fillRect(cx + s - 4, cy - 44, 8, 12);
          ctx.fillRect(cx + s - 4, cy + 32, 8, 12);
          ctx.fillRect(cx - 44, cy + s - 4, 12, 8);
          ctx.fillRect(cx + 32, cy + s - 4, 12, 8);
        }
      }
    }
    // Piers reach into the water.
    for (const pier of city.piers) {
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
      ctx.fillStyle = '#7d5a35';
      for (let y = pier.y + 14; y < pier.y + pier.h; y += 28) ctx.fillRect(pier.x, y, pier.w, 3);
    }
    // Buildings: long evening shadows, roofs, lit windows.
    for (const b of city.buildings) {
      ctx.fillStyle = 'rgba(20, 16, 10, 0.25)';
      ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 34));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if (hash(b.seed, cx * 10 + cy) > 0.35) {
            ctx.fillRect(b.x + 14 + cx * 34, b.y + 14 + cy * 34, 16, 18);
          }
        }
      }
      if (b.home) {
        ctx.fillStyle = PALETTE.money;
        text('HOME', b.x + b.w / 2, b.y + b.h / 2 + 6, 16, '#1d4a1d', 'center', true);
      }
      if (b.chop) {
        ctx.fillStyle = '#ffd94a';
        text('CHOP', b.x + b.w / 2, b.y + b.h / 2 + 6, 16, '#3a2a00', 'center', true);
      }
    }
    // Palms and lamps.
    for (const palm of city.palms) {
      ctx.strokeStyle = PALETTE.palmTrunk;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.lineTo(palm.x + 5, palm.y - 16);
      ctx.stroke();
      ctx.fillStyle = PALETTE.palm;
      for (let f = 0; f < 5; f += 1) {
        const a = (f / 5) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.ellipse(palm.x + 5 + Math.cos(a) * 11, palm.y - 16 + Math.sin(a) * 11, 13, 5, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const lamp of city.lamps) {
      ctx.fillStyle = '#2a2e38';
      ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSkids(state) {
    ctx.strokeStyle = 'rgba(20, 20, 24, 0.4)';
    ctx.lineWidth = 5;
    for (const s of state.skids) {
      ctx.globalAlpha = Math.min(1, s.life / 6);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      const bob = Math.sin(pk.bob) * 3;
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#2f9e4f';
        ctx.beginPath();
        ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2);
        ctx.fill();
        text('$', pk.x, pk.y + bob + 5, 15, '#e8ffe8', 'center', true);
      } else if (pk.kind === 'health') {
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(pk.x - 10, pk.y + bob - 10, 20, 20);
        ctx.fillStyle = '#d94f3d';
        ctx.fillRect(pk.x - 3, pk.y + bob - 8, 6, 16);
        ctx.fillRect(pk.x - 8, pk.y + bob - 3, 16, 6);
      } else {
        ctx.fillStyle = '#ffd94a';
        ctx.fillRect(pk.x - 8, pk.y + bob - 5, 16, 10);
        ctx.fillStyle = '#3a3f4a';
        ctx.fillRect(pk.x - 5, pk.y + bob - 2, 3, 4);
        ctx.fillRect(pk.x + 1, pk.y + bob - 2, 3, 4);
      }
    }
  }

  function drawCar(car, isPlayerCar, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const len = car.len;
    const wid = car.wid;
    if (!car.active) {
      ctx.fillStyle = '#1d1d20';
      roundRect(-len / 2, -wid / 2, len, wid, 8);
      ctx.fill();
      ctx.restore();
      return;
    }
    // Shadow.
    ctx.fillStyle = 'rgba(20, 16, 10, 0.28)';
    roundRect(-len / 2 + 4, -wid / 2 + 5, len, wid, 8);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#16181d';
    ctx.fillRect(-len / 2 + 4, -wid / 2 - 3, 12, 5);
    ctx.fillRect(len / 2 - 16, -wid / 2 - 3, 12, 5);
    ctx.fillRect(-len / 2 + 4, wid / 2 - 2, 12, 5);
    ctx.fillRect(len / 2 - 16, wid / 2 - 2, 12, 5);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(-len / 2, -wid / 2, len, wid, 8);
    ctx.fill();
    // Roof and windshield.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(-len / 6, -wid / 2 + 4, len / 3, wid - 8, 5);
    ctx.fill();
    ctx.fillStyle = '#9fc4d8';
    ctx.fillRect(len / 2 - 12, -wid / 2 + 4, 7, wid - 8);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 5);
    ctx.fillRect(len / 2 - 2, wid / 2 - 8, 3, 5);
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#16181d';
      for (let i = 0; i < 4; i += 1) ctx.fillRect(-len / 2 + 8 + i * 8, -2, 4, 4);
    }
    if (car.kind === 'police') {
      const flash = Math.floor(time * 4 + car.sirenPhase) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2f6fd8';
      ctx.fillRect(-6, -wid / 2 + 2, 12, 5);
      ctx.fillStyle = flash ? '#2f6fd8' : '#ff3b30';
      ctx.fillRect(-6, wid / 2 - 7, 12, 5);
    }
    if (car.target) {
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (isPlayerCar) {
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    // A hurt car shows a warning puff here too (damage smoke is particles).
    if (car.health < 45 && car.active) {
      ctx.fillStyle = 'rgba(90,90,90,0.5)';
      ctx.beginPath();
      ctx.arc(car.x - Math.cos(car.angle) * 16, car.y - Math.sin(car.angle) * 16, 7 + Math.sin(time * 9) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPed(ped) {
    if (ped.down > 0) {
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 13, 7, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(20, 16, 10, 0.25)';
    ctx.beginPath();
    ctx.ellipse(ped.x + 2, ped.y + 3, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b48a';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2);
    ctx.fill();
    if (ped.role === 'guard') {
      ctx.fillStyle = '#16181d';
      ctx.fillRect(ped.x + Math.cos(ped.angle) * 10 - 2, ped.y + Math.sin(ped.angle) * 10 - 2, 8, 4);
    }
    if (ped.role === 'cop') {
      ctx.fillStyle = '#d8d2c2';
      ctx.fillRect(ped.x - 6, ped.y - 11, 12, 3);
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.inCar) return;
    const blink = p.hurtTimer > 0 && Math.floor(state.time * 12) % 2 === 0;
    if (blink) return;
    ctx.fillStyle = 'rgba(20, 16, 10, 0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + 4, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Direction wedge.
    ctx.fillStyle = PALETTE.playerShirt;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18);
    ctx.arc(p.x, p.y, 12, p.angle - 0.7, p.angle + 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8b48a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.player;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.stroke();
    if (p.armed) {
      ctx.fillStyle = '#16181d';
      ctx.fillRect(p.x + Math.cos(p.angle) * 12 - 2, p.y + Math.sin(p.angle) * 12 - 2, 10, 4);
    }
  }

  function drawBullets(state) {
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2.5;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.stroke();
    }
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMarker(state) {
    const marker = state.marker;
    if (!marker) return;
    const cam = state.camera;
    const inView = Math.abs(marker.x - cam.x) < VIEW.width / 2 - 40 && Math.abs(marker.y - cam.y) < VIEW.height / 2 - 40;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    if (inView) {
      ctx.strokeStyle = PALETTE.objective;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.objective;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 5, 0, Math.PI * 2);
      ctx.fill();
      // Beacon.
      ctx.fillStyle = 'rgba(255, 217, 74, 0.25)';
      ctx.fillRect(marker.x - 3, marker.y - 130, 6, 130);
      text(marker.label, marker.x, marker.y - 44, 15, PALETTE.objective, 'center', true);
    } else {
      // Edge arrow pointing at the off-screen objective.
      const dx = marker.x - cam.x;
      const dy = marker.y - cam.y;
      const ang = Math.atan2(dy, dx);
      const ex = cam.x + Math.cos(ang) * (VIEW.width / 2 - 60);
      const ey = cam.y + Math.sin(ang) * (VIEW.height / 2 - 60);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.fillStyle = PALETTE.objective;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      const dist = Math.round(Math.hypot(dx, dy));
      text(`${marker.label} ${dist}m`, ex, ey - 18, 14, PALETTE.objective, 'center', true);
    }
  }

  function drawMinimap(state) {
    const city = state.city;
    if (!mapCanvas || mapCity !== city) buildMinimap(city);
    const mx = MINIMAP.x;
    const my = MINIMAP.y;
    ctx.drawImage(mapCanvas, mx, my);
    ctx.strokeStyle = 'rgba(244, 239, 228, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, my, MINIMAP.size, MINIMAP.size);
    const s = MINIMAP.size / 2600;
    const px = (x) => mx + (x + 80) * s;
    const py = (y) => my + (y + 80) * s;
    // Safehouse.
    ctx.fillStyle = PALETTE.money;
    ctx.fillRect(px(city.safehouse.x) - 3, py(city.safehouse.y) - 3, 6, 6);
    // Mission marker.
    if (state.marker) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.3;
      ctx.fillStyle = PALETTE.objective;
      ctx.beginPath();
      ctx.arc(px(state.marker.x), py(state.marker.y), 5 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cop cars flash blue.
    const flash = Math.floor(state.time * 3) % 2 === 0;
    if (flash) {
      ctx.fillStyle = '#5a8cff';
      for (const car of state.copCars) {
        if (!car.active) continue;
        ctx.beginPath();
        ctx.arc(px(car.x), py(car.y), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Player arrow.
    const p = state.player;
    ctx.save();
    ctx.translate(px(p.x), py(p.y));
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text('PORT MERIDIAN', mx + 4, my + MINIMAP.size - 6, 11, PALETTE.text, 'left', true);
  }

  function drawHud(state, ui) {
    const p = state.player;
    // Top-left: money and health.
    ctx.fillStyle = PALETTE.panel;
    roundRect(12, 12, 250, 64, 10);
    ctx.fill();
    text(`$${state.money.toLocaleString('en-US')}`, 26, 40, 26, PALETTE.money, 'left', true);
    ctx.fillStyle = '#3a2a2a';
    ctx.fillRect(26, 50, 180, 12);
    ctx.fillStyle = p.health > 35 ? '#7ddc7d' : '#ff5a4a';
    ctx.fillRect(26, 50, 180 * Math.max(0, p.health / 100), 12);
    text(`${Math.max(0, Math.ceil(p.health))}`, 212, 62, 14, PALETTE.text, 'left', true);
    // Top-right: wanted stars and ammo.
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    text(stars, VIEW.width - 16, 44, 30, state.wanted > 0 ? PALETTE.star : 'rgba(244,239,228,0.35)', 'right', true);
    if (p.armed) text(`AMMO ${p.ammo}`, VIEW.width - 16, 72, 18, PALETTE.text, 'right', true);
    if (p.inCar && p.car) {
      const mph = Math.round(Math.abs(p.car.speed || 0) * 0.09);
      text(`${mph} mph`, VIEW.width - 16, 100, 20, PALETTE.text, 'right', true);
    }
    // Top-centre: mission and objective.
    const mission = missionName(state.mission ? state.mission.index : 99);
    ctx.fillStyle = PALETTE.panel;
    roundRect(VIEW.width / 2 - 260, 12, 520, 56, 10);
    ctx.fill();
    text(mission.toUpperCase(), VIEW.width / 2, 36, 17, PALETTE.objective, 'center', true);
    text(state.objective, VIEW.width / 2, 58, 15, PALETTE.text, 'center');
    // Toast.
    if (state.toast) {
      ctx.globalAlpha = Math.min(1, state.toast.timer);
      ctx.fillStyle = PALETTE.panel;
      roundRect(VIEW.width / 2 - 230, 78, 460, 34, 8);
      ctx.fill();
      text(state.toast.text, VIEW.width / 2, 101, 16, PALETTE.money, 'center', true);
      ctx.globalAlpha = 1;
    }
    // Damage vignette.
    if (p.health < 35 || p.hurtTimer > 0) {
      const a = p.hurtTimer > 0 ? 0.35 : (35 - p.health) / 35 * 0.3;
      const grad = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.32, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.75);
      grad.addColorStop(0, 'rgba(255, 40, 30, 0)');
      grad.addColorStop(1, `rgba(255, 40, 30, ${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    drawMinimap(state);
    if (ui.showControls) {
      ctx.fillStyle = 'rgba(16, 18, 26, 0.7)';
      roundRect(VIEW.width - 316, VIEW.height - 92, 300, 76, 8);
      ctx.fill();
      text('WASD move · Shift run · E enter/exit car', VIEW.width - 300, VIEW.height - 62, 14, PALETTE.text);
      text('F punch · Click / Space shoot · P pause · M mute', VIEW.width - 300, VIEW.height - 40, 14, PALETTE.text);
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const lineH = 30;
    const height = 150 + lines.length * lineH + 70;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(x, y, width, height, 14);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.objective;
    ctx.lineWidth = 3;
    roundRect(x, y, width, height, 14);
    ctx.stroke();
    text(title, VIEW.width / 2, y + 74, 52, accent || PALETTE.text, 'center', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 128 + i * lineH, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 30, 22, PALETTE.objective, 'center', true);
  }

  function draw(state, screen, ui) {
    const p = state.player;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10121a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // Camera: translate so the camera centre lands in the middle of the view.
    ctx.translate(VIEW.width / 2 - state.camera.x + shakeX, VIEW.height / 2 - state.camera.y + shakeY);
    drawGround(state);
    drawSkids(state);
    drawPickups(state);
    for (const car of state.cars) if (car.active) drawCar(car, p.car === car, state.time);
    for (const car of state.traffic) if (car.active) drawCar(car, false, state.time);
    for (const car of state.copCars) if (car.active) drawCar(car, false, state.time);
    for (const ped of state.peds) if (ped.active) drawPed(ped);
    for (const cop of state.footCops) if (cop.active) drawPed(cop);
    drawPlayer(state);
    drawBullets(state);
    drawParticles(state);
    drawMarker(state);
    // Back to screen space for HUD and panels.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawPanel('HARBOR VICE', [
        'Port Meridian, 7:42 pm. The sun is going down on the harbour,',
        'and Rook the courier owes the Harbor Crew five jobs.',
        'Drive, steal, collect, run — and bring it all home.',
        '',
        'WASD move · Shift run · E steal / exit car · F punch',
        'Mouse aim, click to shoot · P pause · M mute',
        ui.hasSave ? `Save found: ${ui.saveText}` : '',
      ].filter((l) => l !== ''), ui.hasSave ? 'Enter: continue  ·  N: new game' : 'Press Enter or click to start');
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', [
        `Mission ${state.mission ? state.mission.index + 1 : '—'} of 5: ${missionName(state.mission ? state.mission.index : 99)}`,
        `Money $${state.money.toLocaleString('en-US')}  ·  Cars stolen ${state.stats.carsStolen}  ·  Missions done ${state.stats.missionsDone}`,
        '',
        'Progress saves automatically at every mission.',
      ], 'P resume  ·  R restart mission  ·  Q quit to title');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', [
        'The Port Meridian PD caught up with you.',
        `Fine: $${MONEY.bustedFine} — the Crew is not happy.`,
        'You wake up at the safehouse. The job is still yours.',
      ], 'Press Enter to get back out there');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', [
        'Port Meridian chews up couriers who stop paying attention.',
        `Hospital bill: $${MONEY.wastedFine} — the Crew is not happy.`,
        'You wake up at the safehouse. The job is still yours.',
      ], 'Press Enter to get back out there');
    } else if (screen === SCREEN_COMPLETE) {
      drawPanel('HARBOR LEGEND', [
        'Five jobs. One briefcase. Zero apologies.',
        `Money $${state.money.toLocaleString('en-US')}  ·  Missions ${state.stats.missionsDone}/5  ·  Cars stolen ${state.stats.carsStolen}`,
        '',
        'Port Meridian is yours now, Rook. Keep driving.',
      ], 'Press Enter to keep cruising');
    }
  }

  /** Convert CSS pixels relative to the canvas into world coordinates. */
  function toWorld(sx, sy, camera) {
    const ratio = window.devicePixelRatio || 1;
    const lx = (sx * ratio - view.x) / view.scale;
    const ly = (sy * ratio - view.y) / view.scale;
    return { x: camera.x - VIEW.width / 2 + lx, y: camera.y - VIEW.height / 2 + ly };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toWorld };
}
