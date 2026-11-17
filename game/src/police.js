// Police: wanted level, heat, cop-car pursuit and foot-cop arrests.
import { WORLD, WORLD_H } from './config.js';
import { makeRng, range, rangeInt, clamp, dist2, angleDiff } from './random.js';
import { makeCar } from './entities.js';
import { resolveSolid, losBlocked } from './city.js';

export function wantedFromHeat(heat) {
  if (heat <= 0) return 0;
  return Math.min(5, Math.ceil(heat / 20));
}

export function addHeat(state, amount) {
  state.player.heat = clamp(state.player.heat + amount, 0, 100);
  state.player.wanted = wantedFromHeat(state.player.heat);
}

function spawnCopCar(state, rng) {
  const p = state.player;
  for (let tries = 0; tries < 10; tries += 1) {
    const a = range(rng, 0, Math.PI * 2);
    const r = range(rng, 450, 680);
    const x = clamp(p.x + Math.cos(a) * r, 60, WORLD - 60);
    const y = clamp(p.y + Math.sin(a) * r, 60, WORLD_H - 60);
    if (dist2(x, y, p.x, p.y) < 420 * 420) continue;
    const car = makeCar(rng, {
      kind: 'cop', x, y, maxSpeed: 150, accel: 200,
      color: '#20242e', hp: 120, driver: 'cop',
    });
    car.targetX = p.x;
    car.targetY = p.y;
    car.retarget = 0;
    return car;
  }
  return null;
}

function spawnFootCop(state, rng) {
  const p = state.player;
  for (let tries = 0; tries < 10; tries += 1) {
    const a = range(rng, 0, Math.PI * 2);
    const r = range(rng, 280, 420);
    const x = clamp(p.x + Math.cos(a) * r, 40, WORLD - 40);
    const y = clamp(p.y + Math.sin(a) * r, 40, WORLD - 40);
    if (dist2(x, y, p.x, p.y) < 260 * 260) continue;
    return { x, y, angle: 0, speed: 96, hp: 40, arrest: 0 };
  }
  return null;
}

export function stepPolice(state, dt, rng) {
  const p = state.player;
  p.wanted = wantedFromHeat(p.heat);

  // Visibility: a cop sees the player only within 520 px with a clear line
  // of sight (buildings block it). Sight is re-checked a few times a second
  // per cop, so ducking behind a building really breaks the chase.
  let seen = false;
  for (const car of state.cars) {
    if (car.kind !== 'cop') continue;
    car.sightT = (car.sightT || 0) - dt;
    if (car.sightT <= 0) {
      car.sightT = 0.25;
      car.sees = dist2(car.x, car.y, p.x, p.y) < 520 * 520
        && !losBlocked(state.city, car.x, car.y, p.x, p.y);
    }
    if (car.sees) {
      seen = true;
      car.blindT = 0;
    } else {
      car.blindT = (car.blindT || 0) + dt;
    }
  }
  for (const fc of state.footCops) {
    fc.sightT = (fc.sightT || 0) - dt;
    if (fc.sightT <= 0) {
      fc.sightT = 0.25;
      fc.sees = dist2(fc.x, fc.y, p.x, p.y) < 520 * 520
        && !losBlocked(state.city, fc.x, fc.y, p.x, p.y);
    }
    if (fc.sees) {
      seen = true;
      fc.blindT = 0;
    } else {
      fc.blindT = (fc.blindT || 0) + dt;
    }
  }
  if (seen) {
    p.unseen = 0;
    p.lastSeenX = p.x;
    p.lastSeenY = p.y;
  } else {
    p.unseen += dt;
    // Heat decays only once the player has been unseen a while, and only
    // while heat itself is above zero (wanted is heat's floor, not its gate).
    if (p.unseen > 3 && p.heat > 0) {
      p.heat = Math.max(0, p.heat - 5 * dt);
      p.wanted = wantedFromHeat(p.heat);
    }
  }
  // Cops that have not seen the player for 10 s give up and drive off.
  state.cars = state.cars.filter((car) => car.kind !== 'cop' || (car.blindT || 0) <= 10);
  state.footCops = state.footCops.filter((fc) => (fc.blindT || 0) <= 10);

  // Keep the right number of cop cars on the road. Reinforcements only arrive
  // while the player is seen (or in the first seconds after a mission starts,
  // when the police respond to the call) — once the player breaks away, the
  // force dwindles instead of respawning on top of them.
  let copCount = 0;
  for (const car of state.cars) if (car.kind === 'cop') copCount += 1;
  const responding = state.time - state.mission.startedAt < 3;
  if (p.wanted > 0 && copCount < p.wanted && (seen || responding)) {
    const car = spawnCopCar(state, rng);
    if (car) state.cars.push(car);
  }
  if (p.wanted === 0) {
    // Clear out distant cop cars once the heat is gone.
    state.cars = state.cars.filter((car) => {
      if (car.kind !== 'cop') return true;
      return dist2(car.x, car.y, p.x, p.y) < 900 * 900;
    });
  }

  // Foot cops while the player is on foot and wanted. Like the cars, they
  // only reinforce while the player is seen (or just after a mission starts)
  // — otherwise a fresh cop would keep spawning on top of a hidden player
  // and the heat could never burn off.
  if (p.wanted > 0 && p.onFoot && (seen || responding)) {
    const want = Math.min(2, p.wanted);
    if (state.footCops.length < want) {
      const fc = spawnFootCop(state, rng);
      if (fc) state.footCops.push(fc);
    }
  } else if (state.footCops.length > 0 && p.wanted === 0) {
    state.footCops.length = 0;
  }

  // Cop-car pursuit: steer toward the last-seen position (never perfect
  // homing), ram the player's car on contact.
  for (const car of state.cars) {
    if (car.kind !== 'cop' || car.hp <= 0) continue;
    car.retarget -= dt;
    if (car.retarget <= 0) {
      car.targetX = p.lastSeenX;
      car.targetY = p.lastSeenY;
      car.retarget = 1.5;
    }
    const want = Math.atan2(car.targetY - car.y, car.targetX - car.x);
    const turn = clamp(angleDiff(car.angle, want), -2.6 * dt, 2.6 * dt);
    car.angle += turn;
    const distTo = Math.sqrt(dist2(car.x, car.y, car.targetX, car.targetY));
    const desired = distTo > 120 ? car.maxSpeed : car.maxSpeed * 0.55;
    car.speed += clamp(desired - car.speed, -300 * dt, 220 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const fixed = resolveSolid(state.city, nx, ny, 15);
    if (Math.abs(fixed.x - nx) > 2 || Math.abs(fixed.y - ny) > 2) car.speed *= 0.4;
    car.x = fixed.x;
    car.y = fixed.y;
    // Ram the player's car, then back off: a sustained grind would shred
    // the player's car in seconds, so each ram is small and the cop retreats.
    if (!p.onFoot && state.playerCar) {
      const pc = state.playerCar;
      if (dist2(car.x, car.y, pc.x, pc.y) < 34 * 34) {
        if (car.hitCooldown <= 0) {
          damageCar(state, pc, 5);
          damageCar(state, car, 3);
          state.shake = Math.min(14, state.shake + 6);
          car.hitCooldown = 1.5;
          car.speed = -30;
        }
      }
    }
  }

  // Foot cops chase on foot; holding the player for 1.2 s busts them.
  p.arrestT = 0;
  for (const fc of state.footCops) {
    const a = Math.atan2(p.y - fc.y, p.x - fc.x);
    fc.angle = a;
    fc.x += Math.cos(a) * fc.speed * dt;
    fc.y += Math.sin(a) * fc.speed * dt;
    const fixed = resolveSolid(state.city, fc.x, fc.y, 10);
    fc.x = fixed.x;
    fc.y = fixed.y;
    if (dist2(fc.x, fc.y, p.x, p.y) < 26 * 26) {
      fc.arrest += dt;
      if (fc.arrest > p.arrestT) p.arrestT = fc.arrest;
    } else {
      fc.arrest = 0;
    }
  }
  if (p.arrestT >= 1.2 && p.onFoot) {
    p.busted = true;
  }
}

// Damage a car with a per-car hit cooldown so wedged cars don't explode in
// under two seconds from per-step contact damage.
export function damageCar(state, car, amount) {
  if (car.parked) return; // parked cars are immovable and indestructible
  if (car.hitCooldown > 0) return;
  car.hp -= amount;
  car.hitCooldown = 0.8;
  if (car.hp <= 0) {
    explodeCar(state, car);
  }
}

export function explodeCar(state, car) {
  car.hp = 0;
  car.dead = true;
  state.shake = Math.min(18, state.shake + 10);
  for (let i = 0; i < 26; i += 1) {
    const a = state.rng() * Math.PI * 2;
    const s = 40 + state.rng() * 180;
    state.particles.push({
      x: car.x, y: car.y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.5 + state.rng() * 0.7, maxLife: 1.2,
      color: ['#ff9a3c', '#ff5a3c', '#3a3a3a', '#d8d8d8'][Math.floor(state.rng() * 4)],
      size: 3 + state.rng() * 5,
    });
  }
  if (state.onExplosion) state.onExplosion(car.x, car.y);
}
