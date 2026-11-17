// Harbor Vice — the renderer: golden-hour city, cars, HUD, minimap, screens.
import { PITCH, ROAD, STREETS, WORLD, WORLD_H, VIEW_W, VIEW_H, PAL, roadC } from './config.js';
import { clamp, dist2 } from './random.js';
import { currentObjective } from './missions.js';

export function missionTarget(state) {
  const idx = state.mission.index;
  if (idx === 0) return { x: state.city.docks.x, y: state.city.docks.y, label: 'DOCKS' };
  if (idx === 1) {
    const cs = state.city.chopshop;
    return { x: cs.x + cs.w / 2, y: cs.y + cs.h / 2, label: 'CHOP SHOP' };
  }
  if (idx === 2) {
    const v = state.mission.sub.visited || [false, false, false];
    for (let i = 0; i < 3; i += 1) {
      if (!v[i]) {
        const s = state.city.shops[i];
        return { x: s.x + s.w / 2, y: s.y + s.h / 2, label: 'SHOP ' + (i + 1) };
      }
    }
    return null;
  }
  if (idx === 4) {
    if (!state.mission.sub.gotCase) {
      const bc = state.city.briefcase;
      return { x: bc.x, y: bc.y, label: 'BRIEFCASE' };
    }
    const sh = state.city.safehouse;
    return { x: sh.x + sh.w / 2, y: sh.y + sh.h / 2, label: 'SAFEHOUSE' };
  }
  return null;
}

// Pre-rendered static city for the minimap.
export function buildMinimap(city) {
  const scale = 150 / WORLD;
  const cv = document.createElement('canvas');
  cv.width = 150;
  cv.height = Math.round(150 * (WORLD_H / WORLD));
  const g = cv.getContext('2d');
  g.fillStyle = PAL.ground;
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = PAL.park;
  g.fillRect(city.park.x * scale, city.park.y * scale, city.park.s * scale, city.park.s * scale);
  g.fillStyle = PAL.plaza;
  g.fillRect(city.plaza.x * scale, city.plaza.y * scale, city.plaza.s * scale, city.plaza.s * scale);
  g.fillStyle = PAL.water;
  g.fillRect(0, WORLD * scale, cv.width, (WORLD_H - WORLD) * scale);
  g.fillStyle = PAL.road;
  for (let i = 0; i < STREETS; i += 1) {
    g.fillRect(0, (roadC(i) - ROAD / 2) * scale, WORLD * scale, ROAD * scale);
    g.fillRect((roadC(i) - ROAD / 2) * scale, 0, ROAD * scale, WORLD * scale);
  }
  g.fillStyle = PAL.pier;
  for (const p of city.piers) g.fillRect(p.x * scale, p.y * scale, p.w * scale, p.h * scale);
  g.fillStyle = '#5d4030';
  for (const b of city.buildings) g.fillRect(b.x * scale, b.y * scale, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
  return { canvas: cv, scale };
}

function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const w = car.w;
  const h = car.h;
  // Wheels.
  ctx.fillStyle = '#16181d';
  ctx.fillRect(-w / 2 + 2, -h / 2 - 2, 8, 4);
  ctx.fillRect(w / 2 - 10, -h / 2 - 2, 8, 4);
  ctx.fillRect(-w / 2 + 2, h / 2 - 2, 8, 4);
  ctx.fillRect(w / 2 - 10, h / 2 - 2, 8, 4);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.fill();
  // Cabin + windshield.
  ctx.fillStyle = 'rgba(20, 26, 34, 0.85)';
  ctx.fillRect(-w / 2 + 9, -h / 2 + 3, 10, h - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(w / 2 - 9, -h / 2 + 3, 5, h - 6);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(w / 2 - 1, -h / 2 + 2, 2, 3);
  ctx.fillRect(w / 2 - 1, h / 2 - 5, 2, 3);
  // Cop light bar.
  if (car.kind === 'cop') {
    const on = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = on ? '#ff2e2e' : '#2e6bff';
    ctx.fillRect(-4, -h / 2 - 1, 8, 4);
    ctx.fillStyle = on ? '#2e6bff' : '#ff2e2e';
    ctx.fillRect(-4, h / 2 - 3, 8, 4);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-w / 2 + 2, -2, 5, 4);
  }
  // Damage smoke.
  if (car.hp < 55 && car.hp > 0) {
    ctx.fillStyle = 'rgba(60,60,60,0.5)';
    ctx.beginPath();
    ctx.arc(-w / 4, 0, 5 + Math.sin(time * 9) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPerson(ctx, x, y, angle, color, dark) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = dark || color;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  // Facing tick.
  ctx.fillStyle = '#20242e';
  ctx.fillRect(6, -1.5, 6, 3);
  ctx.restore();
}

export function render(state, ctx, screen) {
  const p = state.player;
  const time = state.time;
  const camX = clamp(p.x - VIEW_W / 2 + (state.shake ? (Math.random() - 0.5) * state.shake : 0), 0, Math.max(0, WORLD - VIEW_W));
  const camY = clamp(p.y - VIEW_H / 2 + (state.shake ? (Math.random() - 0.5) * state.shake : 0), 0, Math.max(0, WORLD_H - VIEW_H));
  ctx.save();
  ctx.translate(-camX, -camY);

  // Ground.
  ctx.fillStyle = PAL.ground;
  ctx.fillRect(camX - 10, camY - 10, VIEW_W + 20, VIEW_H + 20);
  // Park + plaza.
  ctx.fillStyle = PAL.park;
  ctx.fillRect(state.city.park.x, state.city.park.y, state.city.park.s, state.city.park.s);
  ctx.fillStyle = PAL.plaza;
  ctx.fillRect(state.city.plaza.x, state.city.plaza.y, state.city.plaza.s, state.city.plaza.s);
  // Water + piers.
  ctx.fillStyle = PAL.water;
  ctx.fillRect(camX - 10, WORLD, VIEW_W + 20, WORLD_H - WORLD + 10);
  ctx.fillStyle = PAL.waterDark;
  for (let i = 0; i < 40; i += 1) {
    const wx = ((i * 137) % WORLD) + Math.sin(time * 0.7 + i) * 8;
    ctx.fillRect(wx, WORLD + 12 + (i % 5) * 40, 26, 2);
  }
  for (const pier of state.city.piers) {
    ctx.fillStyle = PAL.pier;
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.fillStyle = PAL.pierEdge;
    ctx.fillRect(pier.x, pier.y, pier.w, 4);
    ctx.fillRect(pier.x, pier.y + pier.h - 4, pier.w, 4);
  }
  // Roads.
  for (let i = 0; i < STREETS; i += 1) {
    ctx.fillStyle = PAL.road;
    ctx.fillRect(0, roadC(i) - ROAD / 2, WORLD, ROAD);
    ctx.fillRect(roadC(i) - ROAD / 2, 0, ROAD, WORLD);
  }
  // Lane dashes.
  ctx.fillStyle = PAL.lane;
  for (let i = 0; i < STREETS; i += 1) {
    for (let d = 40; d < WORLD; d += 80) {
      ctx.fillRect(d, roadC(i) - 1, 34, 2);
      ctx.fillRect(roadC(i) - 1, d, 2, 34);
    }
  }
  // Sidewalks.
  ctx.fillStyle = PAL.sidewalk;
  for (let i = 0; i < STREETS; i += 1) {
    ctx.fillRect(0, roadC(i) - ROAD / 2 - 6, WORLD, 5);
    ctx.fillRect(0, roadC(i) + ROAD / 2 + 1, WORLD, 5);
    ctx.fillRect(roadC(i) - ROAD / 2 - 6, 0, 5, WORLD);
    ctx.fillRect(roadC(i) + ROAD / 2 + 1, 0, 5, WORLD);
  }
  // Trees.
  for (const t of state.city.trees) {
    ctx.fillStyle = PAL.parkDark;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.park;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Buildings.
  for (const b of state.city.buildings) {
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x, b.y + b.h - 6, b.w, 6);
    ctx.fillRect(b.x + b.w - 6, b.y, 6, b.h);
  }
  // Windows.
  for (const w of state.city.windows) {
    ctx.fillStyle = w.lit ? '#ffd880' : '#2c2f38';
    ctx.fillRect(w.x, w.y, 7, 7);
  }
  // Landmark labels.
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  label(ctx, 'SAFEHOUSE', state.city.safehouse.x + 42, state.city.safehouse.y - 8);
  label(ctx, 'CHOP SHOP', state.city.chopshop.x + 55, state.city.chopshop.y - 8);
  for (const s of state.city.shops) label(ctx, 'SHOP', s.x + s.w / 2, s.y - 8);
  label(ctx, 'DOCKS', state.city.docks.x, state.city.docks.y - 100);
  label(ctx, 'PIER 2', state.city.piers[1].x + 40, state.city.piers[1].y + 30);

  // Pickups.
  for (const pk of state.pickups) {
    if (pk.taken) continue;
    const bob = Math.sin(pk.bob * 3) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#2e7a3a';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8f5d0';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-10, -3, 20, 6);
      ctx.fillRect(-3, -10, 6, 20);
      ctx.fillStyle = '#c92e2e';
      ctx.fillRect(-8, -2, 16, 4);
      ctx.fillRect(-2, -8, 4, 16);
    } else {
      ctx.fillStyle = '#c9a13f';
      ctx.fillRect(-9, -7, 18, 14);
      ctx.fillStyle = '#3a2e18';
      ctx.fillRect(-6, -4, 4, 8);
      ctx.fillRect(2, -4, 4, 8);
    }
    ctx.restore();
  }

  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,24,0.5)';
  ctx.lineWidth = 3;
  for (const s of state.skid) {
    ctx.globalAlpha = Math.min(0.6, s.life / 6);
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Briefcase.
  if (!state.city.briefcase.taken) {
    const bc = state.city.briefcase;
    ctx.fillStyle = '#e8b820';
    ctx.fillRect(bc.x - 10, bc.y - 7, 20, 14);
    ctx.fillStyle = '#3a2e18';
    ctx.fillRect(bc.x - 4, bc.y - 10, 8, 4);
  }

  // Cars.
  for (const car of state.cars) {
    if (car.hp <= 0) continue;
    drawCar(ctx, car, time);
  }
  // Pedestrians.
  for (const ped of state.peds) {
    if (ped.hp <= 0) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color);
  }
  // Thugs / guards / foot cops.
  for (const t of state.thugs) {
    if (t.hp <= 0) continue;
    drawPerson(ctx, t.x, t.y, t.angle, '#c92e2e', '#7a1a1a');
  }
  for (const g of state.guards) {
    if (g.hp <= 0) continue;
    drawPerson(ctx, g.x, g.y, g.angle, '#2e2e3a', '#14141c');
  }
  for (const fc of state.footCops) {
    drawPerson(ctx, fc.x, fc.y, fc.angle, '#2e4a7a', '#16283f');
  }
  // Player.
  if (p.onFoot) {
    drawPerson(ctx, p.x, p.y, p.angle, '#e8b820', '#3f8a7a');
    // Aim line.
    if (state.aiming) {
      ctx.strokeStyle = 'rgba(232,184,32,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * 90, p.y + Math.sin(p.angle) * 90);
      ctx.stroke();
    }
  } else if (state.playerCar) {
    // Highlight ring under the player's car.
    ctx.strokeStyle = 'rgba(232,184,32,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(state.playerCar.x, state.playerCar.y, 26, 16, state.playerCar.angle, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Bullets.
  ctx.fillStyle = '#ffe9a8';
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Particles.
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Mission target marker + off-screen arrow.
  const target = missionTarget(state);
  if (target && state.screen === 'play') {
    const pulse = 1 + Math.sin(time * 4) * 0.15;
    ctx.strokeStyle = '#e8b820';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 22 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e8b820';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(target.label, target.x, target.y - 30);
    // Off-screen arrow.
    const sx = target.x - camX;
    const sy = target.y - camY;
    if (sx < 60 || sx > VIEW_W - 60 || sy < 60 || sy > VIEW_H - 60) {
      const cx = clamp(sx, 70, VIEW_W - 70);
      const cy = clamp(sy, 70, VIEW_H - 70);
      const a = Math.atan2(sy - cy, sx - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#e8b820';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -10);
      ctx.lineTo(-10, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();

  // Dusk tint.
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, 'rgba(255,170,80,0.05)');
  grad.addColorStop(1, 'rgba(40,20,60,0.10)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  drawHUD(state, ctx, screen);
}

function label(ctx, text, x, y) {
  ctx.fillStyle = 'rgba(12,14,20,0.65)';
  const w = ctx.measureText(text).width + 12;
  ctx.fillRect(x - w / 2, y - 10, w, 16);
  ctx.fillStyle = '#f2e8d5';
  ctx.fillText(text, x, y + 2);
}

function drawHUD(state, ctx, screen) {
  const p = state.player;
  const mm = state.minimap;
  // Top-left: money / health / ammo.
  ctx.fillStyle = PAL.hudBg;
  ctx.fillRect(12, 12, 250, 86);
  ctx.fillStyle = PAL.hudText;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('$' + p.money, 24, 40);
  ctx.font = '14px sans-serif';
  ctx.fillText('AMMO ' + p.ammo, 24, 62);
  // Health bar.
  ctx.fillStyle = '#3a2020';
  ctx.fillRect(24, 72, 160, 12);
  ctx.fillStyle = p.hp > 40 ? '#4a9a4a' : '#c92e2e';
  ctx.fillRect(24, 72, 160 * Math.max(0, p.hp) / 100, 12);
  ctx.fillStyle = PAL.hudText;
  ctx.fillText('HP ' + Math.max(0, Math.round(p.hp)), 192, 84);

  // Wanted stars, top-right.
  ctx.fillStyle = PAL.hudBg;
  ctx.fillRect(VIEW_W - 190, 12, 178, 44);
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < p.wanted ? '#ffd23e' : 'rgba(242,232,213,0.25)';
    ctx.fillText('★', VIEW_W - 162 + i * 32, 44);
  }

  // Mission objective, top-center.
  ctx.fillStyle = PAL.hudBg;
  const obj = currentObjective(state);
  ctx.font = 'bold 15px sans-serif';
  const ow = ctx.measureText(obj).width + 28;
  ctx.fillRect((VIEW_W - ow) / 2, 12, ow, 34);
  ctx.fillStyle = PAL.accent;
  ctx.fillText(obj, VIEW_W / 2, 34);

  // Message.
  if (state.messageT > 0 && state.message) {
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = PAL.accent;
    ctx.fillText(state.message, VIEW_W / 2, 84);
  }

  // Minimap, bottom-right.
  if (mm) {
    const mw = 150;
    const mh = Math.round(150 * (WORLD_H / WORLD));
    const mx = VIEW_W - mw - 14;
    const my = VIEW_H - mh - 14;
    ctx.fillStyle = 'rgba(12,14,20,0.8)';
    ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
    ctx.drawImage(mm.canvas, mx, my);
    const s = mm.scale;
    const target = missionTarget(state);
    if (target) {
      ctx.fillStyle = '#e8b820';
      ctx.beginPath();
      ctx.arc(mx + target.x * s, my + target.y * s, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of state.cars) {
      if (car.kind !== 'cop' || car.hp <= 0) continue;
      ctx.fillStyle = '#2e6bff';
      ctx.fillRect(mx + car.x * s - 2, my + car.y * s - 2, 4, 4);
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx + p.x * s, my + p.y * s, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Arrest progress.
  if (p.arrestT > 0.1 && p.onFoot) {
    ctx.fillStyle = 'rgba(12,14,20,0.8)';
    ctx.fillRect(VIEW_W / 2 - 110, VIEW_H - 90, 220, 26);
    ctx.fillStyle = '#c92e2e';
    ctx.fillRect(VIEW_W / 2 - 104, VIEW_H - 84, 208 * Math.min(1, p.arrestT / 1.2), 14);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('ARRESTED…', VIEW_W / 2, VIEW_H - 72);
  }

  // Screens.
  if (screen === 'title') drawTitle(state, ctx);
  else if (screen === 'pause') drawCenter(state, ctx, 'PAUSED', 'Press P to resume · M mute');
  else if (screen === 'busted') drawCenter(state, ctx, 'BUSTED', 'The Harbor Crew bails you out — $100 · Press Enter');
  else if (screen === 'wasted') drawCenter(state, ctx, 'WASTED', 'You wake up at the safehouse — $100 · Press Enter');
  else if (screen === 'complete') drawCenter(state, ctx, 'ALL JOBS DONE', 'The debt is paid. Free roam — press Enter to keep playing');
}

function drawTitle(state, ctx) {
  ctx.fillStyle = 'rgba(10,10,16,0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8b820';
  ctx.font = 'bold 84px sans-serif';
  ctx.fillText('HARBOR VICE', VIEW_W / 2, 250);
  ctx.fillStyle = '#f2e8d5';
  ctx.font = '20px sans-serif';
  ctx.fillText('Port Meridian · five jobs · one debt to the Harbor Crew', VIEW_W / 2, 292);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#c9b98a';
  ctx.fillText('WASD drive / walk · E enter & steal cars · F punch · Mouse aim + click to shoot', VIEW_W / 2, 340);
  ctx.fillText('P pause · M mute · missions pay — save keeps your progress', VIEW_W / 2, 366);
  const save = state.saveInfo;
  if (save && save.missionIndex > 0) {
    ctx.fillStyle = '#e8b820';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Continue: mission ' + (save.missionIndex + 1) + ' of 5 · $' + save.money + ' — press Enter', VIEW_W / 2, 420);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Press Enter to start', VIEW_W / 2, 420);
  }
  ctx.fillStyle = 'rgba(242,232,213,0.6)';
  ctx.font = '13px sans-serif';
  ctx.fillText('An original game · all art, names and music are its own', VIEW_W / 2, 470);
}

function drawCenter(state, ctx, title, sub) {
  ctx.fillStyle = 'rgba(10,10,16,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e8d5';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText(title, VIEW_W / 2, VIEW_H / 2 - 20);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#c9b98a';
  ctx.fillText(sub, VIEW_W / 2, VIEW_H / 2 + 22);
}
