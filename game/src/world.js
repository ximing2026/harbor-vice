// Harbor Vice — the simulation: player, cars, combat, pickups, missions.
// Browser-free: main.js wires input/render/audio around this module, and the
// Node chain test imports it directly.
import { STEP, WORLD, WORLD_H, START_MONEY, PITCH, ROAD, roadC, MISSION_PAYOUTS } from './config.js';
import { makeRng, clamp, dist2, angleDiff, range, rangeInt } from './random.js';
import { buildCity, resolveSolid, solidAt, pickupSpots } from './city.js';
import { makeCar, makePickup, makeParticle } from './entities.js';
import { spawnTrafficCar, spawnPed, stepTraffic, stepPeds, scarePeds } from './traffic.js';
import { stepPolice, addHeat, damageCar, explodeCar } from './police.js';
import { MISSION_DEFS, startMission, stepMissionActors, currentObjective } from './missions.js';
import { writeSave } from './save.js';

export function createWorld(seed, saveData) {
  const rng = makeRng(seed);
  const city = buildCity(seed);
  const state = {
    seed,
    rng,
    time: 0,
    screen: 'title',
    city,
    player: {
      x: 232, y: 190, angle: 0, vx: 0, vy: 0,
      hp: 100, money: START_MONEY, ammo: 48,
      onFoot: true, heat: 0, wanted: 0, unseen: 99,
      lastSeenX: 232, lastSeenY: 190,
      arrestT: 0, busted: false, hitCooldown: 0, punchT: 0, shootT: 0,
    },
    playerCar: null,
    cars: [],
    peds: [],
    footCops: [],
    thugs: [],
    guards: [],
    bullets: [],
    pickups: [],
    particles: [],
    skid: [],
    mission: { index: 0, sub: {}, startedAt: 0 },
    stats: { carsStolen: 0, missionsDone: 0, shotsFired: 0, kills: 0 },
    shake: 0,
    flash: 0,
    message: '',
    messageT: 0,
    onEvent: null,
    onExplosion: null,
  };
  state.onExplosion = (x, y) => {
    scarePeds(state, x, y, 320);
    if (state.onEvent) state.onEvent('explosion');
  };

  // Mission vehicles and the player's sedan.
  const van = makeCar(rng, { kind: 'van', x: 320, y: 244, angle: 0, maxSpeed: 150, accel: 130, color: '#c8c8d0', w: 40, h: 20, parked: true });
  const comet = makeCar(rng, { kind: 'comet', x: 1000, y: 648, angle: 0, maxSpeed: 260, accel: 210, color: '#e8b820', w: 36, h: 18, parked: true });
  const sedan = makeCar(rng, { kind: 'sedan', x: 250, y: 320, angle: Math.PI / 2, maxSpeed: 190, accel: 160, color: '#3f8a7a', w: 34, h: 18, parked: true });
  state.cars.push(van, comet, sedan);
  state.missionVehicles = { van, comet, sedan };

  // Extra parked cars scattered on roads, clear of the mission spots.
  const keepOut = [
    { x: 320, y: 244 }, { x: 1000, y: 648 }, { x: 250, y: 320 },
    { x: 600, y: 1900 }, { x: 232, y: 190 },
  ];
  let placed = 0;
  let guard = 0;
  while (placed < 8 && guard < 60) {
    guard += 1;
    const horiz = rng() < 0.5;
    const lane = rangeInt(rng, 0, 8);
    const along = range(rng, 120, WORLD - 120);
    const off = rng() < 0.5 ? -16 : 16;
    const x = horiz ? along : roadC(lane) + off;
    const y = horiz ? roadC(lane) + off : along;
    let bad = false;
    for (const k of keepOut) if (dist2(x, y, k.x, k.y) < 130 * 130) { bad = true; break; }
    for (const c of state.cars) if (dist2(x, y, c.x, c.y) < 90 * 90) { bad = true; break; }
    if (bad) continue;
    state.cars.push(makeCar(rng, {
      kind: 'parked', x, y, angle: horiz ? (off > 0 ? 0 : Math.PI) : (off > 0 ? Math.PI / 2 : -Math.PI / 2),
      parked: true,
    }));
    placed += 1;
  }

  for (let i = 0; i < 14; i += 1) {
    const car = spawnTrafficCar(rng, state.player, state.cars);
    if (car) state.cars.push(car);
  }
  for (let i = 0; i < 26; i += 1) {
    const ped = spawnPed(rng, state.player);
    if (ped) state.peds.push(ped);
  }
  for (const spot of pickupSpots()) {
    state.pickups.push(makePickup(spot.x, spot.y, spot.kind));
  }

  if (saveData) {
    if (typeof saveData.money === 'number') state.player.money = saveData.money;
    if (typeof saveData.missionIndex === 'number') state.mission.index = Math.min(5, Math.max(0, saveData.missionIndex));
    if (typeof saveData.carsStolen === 'number') state.stats.carsStolen = saveData.carsStolen;
    if (typeof saveData.missionsDone === 'number') state.stats.missionsDone = saveData.missionsDone;
  }
  startMission(state, state.mission.index);
  return state;
}

function say(state, text, seconds) {
  state.message = text;
  state.messageT = seconds || 3;
}

function segPointDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.sqrt(dist2(px, py, cx, cy));
}

function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const car of state.cars) {
    if (car.hp <= 0 || car.dead) continue;
    const d = dist2(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(state, car) {
  const p = state.player;
  if (car.kind === 'traffic' && car.driver === 'traffic') {
    // Carjacking: pull the driver out.
    car.driver = null;
    addHeat(state, 25);
    say(state, 'Carjacked!');
    state.stats.carsStolen += 1;
  } else if (car.parked) {
    if (car.kind === 'comet') { addHeat(state, 25); say(state, 'Stole the Comet GT!'); state.stats.carsStolen += 1; }
    else if (car.kind === 'van') { addHeat(state, 15); say(state, 'Took the courier van'); state.stats.carsStolen += 1; }
    else if (car.kind === 'sedan') { say(state, 'Your sedan'); }
    else { addHeat(state, 10); state.stats.carsStolen += 1; }
  }
  car.parked = false;
  car.driver = 'player';
  car.speed = 0;
  state.playerCar = car;
  p.onFoot = false;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  if (car.kind === 'van' && state.mission.index === 0) state.mission.sub.enteredVan = true;
  if (car.kind === 'comet' && state.mission.index === 1) state.mission.sub.enteredComet = true;
}

function exitCar(state) {
  const p = state.player;
  const car = state.playerCar;
  if (!car) return;
  const sx = Math.cos(car.angle + Math.PI / 2);
  const sy = Math.sin(car.angle + Math.PI / 2);
  const spot = resolveSolid(state.city, car.x + sx * 28, car.y + sy * 28, 10);
  p.x = spot.x;
  p.y = spot.y;
  p.onFoot = true;
  p.vx = 0;
  p.vy = 0;
  car.driver = null;
  car.parked = true;
  car.speed = 0;
  state.playerCar = null;
}

function stepPlayer(state, input, dt) {
  const p = state.player;
  p.hitCooldown = Math.max(0, p.hitCooldown - dt);
  p.punchT = Math.max(0, p.punchT - dt);
  p.shootT = Math.max(0, p.shootT - dt);

  if (input.action) {
    if (p.onFoot) {
      const car = nearestCar(state, p.x, p.y, 48);
      if (car && (car.kind !== 'traffic' || car.speed < 60)) enterCar(state, car);
    } else {
      exitCar(state);
    }
  }

  if (p.onFoot) {
    const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my) || 1;
    const speed = 175;
    p.vx = (mx / len) * speed * (mx || my ? 1 : 0);
    p.vy = (my / len) * speed * (mx || my ? 1 : 0);
    if (mx || my) p.angle = Math.atan2(my, mx);
    const nx = p.x + p.vx * dt;
    const ny = p.y + p.vy * dt;
    const fixed = resolveSolid(state.city, nx, ny, 11);
    p.x = fixed.x;
    p.y = fixed.y;

    if (input.punch && p.punchT <= 0) {
      p.punchT = 0.35;
      const fx = Math.cos(p.angle);
      const fy = Math.sin(p.angle);
      const targets = [...state.peds, ...state.thugs, ...state.guards, ...state.footCops];
      for (const t of targets) {
        if (t.hp <= 0) continue;
        const dx = t.x - p.x;
        const dy = t.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 38 && (dx * fx + dy * fy) / (d || 1) > 0.2) {
          t.hp -= 20;
          if (t.flee !== undefined) { t.flee = 3; t.fleeX = p.x; t.fleeY = p.y; }
          if (state.peds.includes(t)) addHeat(state, 10);
          else addHeat(state, 12);
          state.shake = Math.min(8, state.shake + 2);
          break;
        }
      }
    }

    if (input.shoot && p.shootT <= 0 && p.ammo > 0) {
      p.shootT = 0.22;
      p.ammo -= 1;
      state.stats.shotsFired += 1;
      const a = Math.atan2(input.aimY - p.y, input.aimX - p.x);
      p.angle = a;
      const bx = p.x + Math.cos(a) * 18;
      const by = p.y + Math.sin(a) * 18;
      state.bullets.push({
        x: bx, y: by, px: bx, py: by,
        vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
        life: 1.2, from: 'player', damage: 34,
      });
      addHeat(state, 6);
      scarePeds(state, p.x, p.y, 220);
      if (state.onEvent) state.onEvent('gunshot');
    }
  } else if (state.playerCar) {
    const car = state.playerCar;
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const throttle = input.up ? 1 : 0;
    const brake = input.down ? 1 : 0;
    if (throttle) car.speed = Math.min(car.maxSpeed, car.speed + car.accel * dt);
    else if (brake) car.speed = Math.max(-60, car.speed - 260 * dt);
    else {
      car.speed -= car.speed * 0.9 * dt;
      if (Math.abs(car.speed) < 4) car.speed = 0;
    }
    const spd = Math.abs(car.speed);
    const turnRate = 2.4 * (0.35 + 0.65 * Math.min(1, spd / 100));
    car.angle += steer * turnRate * dt * (car.speed >= 0 ? 1 : -1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const fixed = resolveSolid(state.city, nx, ny, 16);
    if (Math.abs(fixed.x - nx) > 2 || Math.abs(fixed.y - ny) > 2) {
      if (spd > 70) {
        state.shake = Math.min(12, state.shake + 4);
        if (state.onEvent) state.onEvent('crash');
        damageCar(state, car, 5);
      }
      car.speed *= 0.45;
    }
    car.x = fixed.x;
    car.y = fixed.y;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Skid marks on hard turns at speed.
    if (Math.abs(steer) > 0.7 && spd > 120) {
      state.skid.push({ x1: car.x, y1: car.y, x2: nx, y2: ny, life: 6 });
      if (state.skid.length > 400) state.skid.shift();
    }
  }
}

function stepCarCollisions(state, dt) {
  const pc = state.playerCar;
  if (!pc || pc.hp <= 0) return;
  // A speeding car scatters nearby pedestrians: they dive out of the way
  // instead of standing in the road. (Only at speed — a slow car does not
  // spook them, so parking-lot bumps still happen.)
  if (Math.abs(pc.speed) > 120) scarePeds(state, pc.x, pc.y, 140);
  for (const other of state.cars) {
    if (other === pc || other.hp <= 0 || other.dead) continue;
    const dx = pc.x - other.x;
    const dy = pc.y - other.y;
    const d = Math.hypot(dx, dy);
    if (d >= 34 || d < 0.01) continue;
    const push = (34 - d) / 2;
    const ux = dx / d;
    const uy = dy / d;
    if (other.parked || other.kind === 'parked') {
      // Parked cars are immovable: only the player car moves.
      pc.x += ux * (34 - d);
      pc.y += uy * (34 - d);
    } else {
      pc.x += ux * push;
      pc.y += uy * push;
      other.x -= ux * push;
      other.y -= uy * push;
    }
    const impact = Math.abs(pc.speed - (other.speed || 0));
    if (impact > 60) {
      damageCar(state, pc, 8);
      damageCar(state, other, 8);
      state.shake = Math.min(12, state.shake + 4);
      if (state.onEvent) state.onEvent('crash');
    }
  }
  // Running over pedestrians.
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.hp <= 0) continue;
    if (dist2(ped.x, ped.y, pc.x, pc.y) < 22 * 22 && Math.abs(pc.speed) > 30) {
      ped.hp = 0;
      addHeat(state, 20);
      state.stats.kills += 1;
      say(state, 'You ran someone over!');
      for (let i = 0; i < 8; i += 1) {
        state.particles.push(makeParticle(ped.x, ped.y, (state.rng() - 0.5) * 120, (state.rng() - 0.5) * 120, 0.6, '#a02020', 3));
      }
    }
  }
}

function stepBullets(state, dt) {
  const p = state.player;
  for (const b of state.bullets) {
    b.px = b.x;
    b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (solidAt(state.city, b.x, b.y)) {
      b.life = 0;
      state.particles.push(makeParticle(b.x, b.y, 0, 0, 0.25, '#ffd880', 3));
      continue;
    }
    if (b.from === 'player') {
      // Hit peds / thugs / guards / foot cops (segment test: no tunneling).
      const targets = [...state.peds, ...state.thugs, ...state.guards, ...state.footCops];
      for (const t of targets) {
        if (t.hp <= 0) continue;
        if (segPointDist(t.x, t.y, b.px, b.py, b.x, b.y) < 13) {
          t.hp -= b.damage;
          b.life = 0;
          if (t.flee !== undefined) { t.flee = 3; t.fleeX = p.x; t.fleeY = p.y; }
          if (state.peds.includes(t)) addHeat(state, 8);
          else state.stats.kills += 1;
          break;
        }
      }
      if (b.life <= 0) continue;
      // Hit cars.
      for (const car of state.cars) {
        if (car.hp <= 0 || car.dead) continue;
        if (car === state.playerCar) continue;
        if (segPointDist(car.x, car.y, b.px, b.py, b.x, b.y) < 18) {
          damageCar(state, car, b.damage);
          if (car.kind === 'cop') addHeat(state, 15);
          b.life = 0;
          break;
        }
      }
    } else {
      // Enemy bullets hit the player.
      if (segPointDist(p.x, p.y, b.px, b.py, b.x, b.y) < 13) {
        p.hp -= 12;
        b.life = 0;
        state.shake = Math.min(10, state.shake + 3);
        if (state.onEvent) state.onEvent('hurt');
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
}

function stepPickups(state, dt) {
  const p = state.player;
  for (const pk of state.pickups) {
    pk.bob += dt;
    if (pk.taken) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) pk.taken = false;
      continue;
    }
    if (dist2(p.x, p.y, pk.x, pk.y) < 28 * 28) {
      pk.taken = true;
      pk.respawnT = 25;
      if (pk.kind === 'cash') { p.money += 50; say(state, '+$50'); }
      else if (pk.kind === 'health') { p.hp = Math.min(100, p.hp + 40); say(state, '+40 health'); }
      else if (pk.kind === 'ammo') { p.ammo += 24; say(state, '+24 ammo'); }
      if (state.onEvent) state.onEvent('pickup');
    }
  }
}

function stepParticles(state, dt) {
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= (1 - 2 * dt);
    pt.vy *= (1 - 2 * dt);
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  for (const s of state.skid) s.life -= dt;
  state.skid = state.skid.filter((s) => s.life > 0);
}

function saveGame(state) {
  writeSave({
    missionIndex: state.mission.index,
    money: state.player.money,
    carsStolen: state.stats.carsStolen,
    missionsDone: state.stats.missionsDone,
  });
}

export function stepWorld(state, input, dt) {
  if (state.screen !== 'play') return;
  state.time += dt;
  state.messageT = Math.max(0, state.messageT - dt);
  state.shake = Math.max(0, state.shake - 30 * dt);
  state.flash = Math.max(0, state.flash - 2.5 * dt);

  stepPlayer(state, input, dt);
  stepTraffic(state, dt, state.rng);
  stepPeds(state, dt, state.rng);
  stepPolice(state, dt, state.rng);
  stepMissionActors(state, dt);
  stepCarCollisions(state, dt);
  stepBullets(state, dt);
  stepPickups(state, dt);
  stepParticles(state, dt);

  // Cooldowns tick down.
  for (const car of state.cars) car.hitCooldown = Math.max(0, car.hitCooldown - dt);

  // Traffic cars hitting the player on foot.
  const p = state.player;
  if (p.onFoot && p.hitCooldown <= 0) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic' || car.hp <= 0) continue;
      if (dist2(car.x, car.y, p.x, p.y) < 24 * 24 && Math.abs(car.speed) > 25) {
        p.hp -= 20;
        p.hitCooldown = 1;
        state.shake = Math.min(10, state.shake + 5);
        if (state.onEvent) state.onEvent('hurt');
        break;
      }
    }
  }

  // Player car exploded while driving: force the player out, hurt.
  if (state.playerCar && state.playerCar.dead) {
    const car = state.playerCar;
    state.playerCar = null;
    p.onFoot = true;
    p.hp -= 25;
    const spot = resolveSolid(state.city, car.x + 30, car.y, 10);
    p.x = spot.x;
    p.y = spot.y;
    say(state, 'Your car blew up!');
  }
  state.cars = state.cars.filter((car) => !car.dead || car === state.playerCar);
  state.peds = state.peds.filter((ped) => ped.hp > 0);

  // Keep traffic and peds topped up.
  if (state.cars.filter((c) => c.kind === 'traffic').length < 14) {
    const car = spawnTrafficCar(state.rng, p, state.cars);
    if (car) state.cars.push(car);
  }
  if (state.peds.length < 26) {
    const ped = spawnPed(state.rng, p);
    if (ped) state.peds.push(ped);
  }

  // Mission completion.
  if (state.mission.index < MISSION_DEFS.length) {
    const def = MISSION_DEFS[state.mission.index];
    if (def.check(state)) {
      const payout = MISSION_PAYOUTS[state.mission.index];
      p.money += payout;
      state.stats.missionsDone += 1;
      say(state, def.title + ' complete! +$' + payout, 4);
      if (state.onEvent) state.onEvent('mission');
      state.mission.index += 1;
      if (state.mission.index < MISSION_DEFS.length) {
        startMission(state, state.mission.index);
      } else {
        state.screen = 'complete';
        if (state.onEvent) state.onEvent('complete');
      }
      saveGame(state);
    }
  }

  // Busted / wasted transitions.
  if (p.busted && state.screen === 'play') {
    state.screen = 'busted';
    if (state.onEvent) state.onEvent('busted');
    saveGame(state);
  } else if (p.hp <= 0 && state.screen === 'play') {
    state.screen = 'wasted';
    if (state.onEvent) state.onEvent('wasted');
    saveGame(state);
  }
}

export function respawnPlayer(state) {
  const p = state.player;
  p.hp = 100;
  p.heat = 0;
  p.wanted = 0;
  p.unseen = 99;
  p.busted = false;
  p.onFoot = true;
  p.money = Math.max(0, p.money - 100);
  p.x = 232;
  p.y = 190;
  p.angle = 0;
  if (state.playerCar) {
    state.playerCar.driver = null;
    state.playerCar.parked = true;
    state.playerCar = null;
  }
  state.footCops.length = 0;
  state.screen = 'play';
  saveGame(state);
}

export { currentObjective, startMission };
export { STEP };
