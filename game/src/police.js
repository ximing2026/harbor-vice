// The police response: cop cars that hunt the player by wanted level, and
// foot cops who chase a player on foot and try to make an arrest.
import { CAR, WANTED } from './config.js';
import { roadCenter } from './city.js';
import { makeCar, makePed } from './entities.js';
import { range } from './random.js';

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function spawnCopCar(city, random, near, minDist = 320) {
  // Spawn on a road a little way from the player, off the immediate view.
  for (let tries = 0; tries < 12; tries += 1) {
    const p = city.randomRoadPoint(random);
    const d = Math.hypot(p.x - near.x, p.y - near.y);
    if (d > minDist && d < 900) {
      const car = makeCar(random, 'police', p.x, p.y, p.angle);
      car.driver = 'cop';
      return car;
    }
  }
  const p = city.randomRoadPoint(random);
  const car = makeCar(random, 'police', p.x, p.y, p.angle);
  car.driver = 'cop';
  return car;
}

export function spawnFootCop(city, random, near) {
  const p = city.randomSidewalkPoint(random);
  // Prefer a sidewalk point near the player.
  let best = p;
  let bestD = Math.hypot(p.x - near.x, p.y - near.y);
  for (let tries = 0; tries < 6; tries += 1) {
    const q = city.randomSidewalkPoint(random);
    const d = Math.hypot(q.x - near.x, q.y - near.y);
    if (d > 200 && d < bestD) { best = q; bestD = d; }
  }
  const cop = makePed(random, best.x, best.y, 'cop');
  cop.state = 'chase';
  cop.arrest = 0;
  return cop;
}

/** How many cop cars the wanted level calls for. */
export function wantedCopCars(wanted) {
  return WANTED.copCars[Math.max(0, Math.min(WANTED.max, wanted))];
}

/** Steer one cop car at the player's predicted position; returns damage on ram. */
export function stepCopCar(dt, city, car, player, playerCar) {
  const target = playerCar && playerCar.active ? playerCar : player;
  const px = target.x + (target.vx || 0) * 0.4;
  const py = target.y + (target.vy || 0) * 0.4;
  const want = Math.atan2(py - car.y, px - car.x);
  const diff = angDiff(car.angle, want);
  car.angle += Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));
  // If the target is right behind, back up out of the jam instead of spinning.
  const throttle = Math.abs(diff) > 2.2 && car.speed < 40 ? -0.7 : 1;
  const maxSpeed = CAR.policeMax * (0.75 + 0.05 * (car.wantedLevel || 2));
  const targetSpeed = throttle > 0 ? maxSpeed : -CAR.reverseMax;
  const accel = targetSpeed > car.speed ? CAR.accel : CAR.brake;
  car.speed += Math.max(-accel * dt, Math.min(accel * dt, targetSpeed - car.speed));
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = city.collide(nx, ny, 20);
  car.x = fixed.x;
  car.y = fixed.y;
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  car.sirenPhase += dt * 6;
}

/** A foot cop runs at the player and, close up, builds an arrest timer. */
export function stepFootCop(dt, city, cop, player, random) {
  const dx = player.x - cop.x;
  const dy = player.y - cop.y;
  const dist = Math.hypot(dx, dy);
  cop.angle = Math.atan2(dy, dx);
  if (dist > 26) {
    const speed = 235;
    const next = city.collide(cop.x + Math.cos(cop.angle) * speed * dt, cop.y + Math.sin(cop.angle) * speed * dt, 10);
    cop.x = next.x;
    cop.y = next.y;
    cop.arrest = Math.max(0, (cop.arrest || 0) - dt);
  } else {
    cop.arrest = (cop.arrest || 0) + dt;
    // Shove the player a little while the arrest builds.
    player.x += Math.cos(cop.angle) * 12 * dt;
    player.y += Math.sin(cop.angle) * 12 * dt;
  }
  return cop.arrest >= 1.4;
}
