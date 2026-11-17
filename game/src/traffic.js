// City traffic: cars that follow the road grid from intersection to
// intersection, keep a lane, and stop when something is in front of them.
// Pedestrians stroll the sidewalks and run from danger.
import { GRID, PEDS, TRAFFIC } from './config.js';
import { roadCenter } from './city.js';
import { makeCar, makePed } from './entities.js';
import { range } from './random.js';

function nearestIntersection(x, y) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < GRID.roads; i += 1) {
    for (let j = 0; j < GRID.roads; j += 1) {
      const dx = x - roadCenter(i);
      const dy = y - roadCenter(j);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = { i, j }; }
    }
  }
  return best;
}

function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** A traffic car picks its next intersection when it reaches the one it aimed for. */
function retarget(car, random) {
  const node = nearestIntersection(car.x, car.y);
  const options = [];
  if (node.i > 0) options.push({ i: node.i - 1, j: node.j });
  if (node.i < GRID.roads - 1) options.push({ i: node.i + 1, j: node.j });
  if (node.j > 0) options.push({ i: node.i, j: node.j - 1 });
  if (node.j < GRID.roads - 1) options.push({ i: node.i, j: node.j + 1 });
  const next = options[Math.floor(random() * options.length)];
  // Right-hand lane: offset 18 px to the right of the travel direction.
  const tx = roadCenter(next.i);
  const ty = roadCenter(next.j);
  const dir = Math.atan2(ty - car.y, tx - car.x);
  const px = Math.cos(dir + Math.PI / 2) * 18;
  const py = Math.sin(dir + Math.PI / 2) * 18;
  car.target = { x: tx + px, y: ty + py };
  car.cruise = range(random, TRAFFIC.speedMin, TRAFFIC.speedMax);
}

export function createTraffic(city, random, count) {
  const cars = [];
  for (let n = 0; n < count; n += 1) {
    const p = city.randomRoadPoint(random);
    const car = makeCar(random, n % 7 === 6 ? 'taxi' : 'sedan', p.x, p.y, p.angle);
    car.target = { x: p.x, y: p.y };
    car.cruise = range(random, TRAFFIC.speedMin, TRAFFIC.speedMax);
    retarget(car, random);
    cars.push(car);
  }
  return cars;
}

export function createPeds(city, random, count) {
  const peds = [];
  for (let n = 0; n < count; n += 1) {
    const p = city.randomSidewalkPoint(random);
    peds.push(makePed(random, p.x, p.y));
  }
  return peds;
}

/** True when another car (or the player's car) sits in front of `car` within range. */
function blockedAhead(car, others, rangeAhead) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of others) {
    if (other === car || !other.active) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (along > 0 && along < rangeAhead && side < 30) return true;
  }
  return false;
}

export function stepTraffic(dt, city, cars, playerCar, focus, random) {
  for (const car of cars) {
    if (!car.active) continue;
    const dx = car.target.x - car.x;
    const dy = car.target.y - car.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 24) retarget(car, random);
    const want = Math.atan2(car.target.y - car.y, car.target.x - car.x);
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, angleDiff(car.angle, want)));
    const blocked = blockedAhead(car, cars, 78) || (playerCar && playerCar.active && blockedAhead(car, [playerCar], 78));
    const targetSpeed = blocked ? 0 : car.cruise;
    car.speed += Math.max(-320 * dt, Math.min(220 * dt, targetSpeed - car.speed));
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Too far from the action: recycle onto a road near the focus point.
    const fx = focus.x - car.x;
    const fy = focus.y - car.y;
    if (fx * fx + fy * fy > TRAFFIC.despawn * TRAFFIC.despawn) {
      const p = city.randomRoadPoint(random);
      // Keep the recycle near the player: nudge the spawn onto a nearby road.
      const near = nearestIntersection(focus.x, focus.y);
      const road = Math.floor(random() * GRID.roads);
      const along = range(random, -400, 400);
      if (random() < 0.5) { car.x = roadCenter(road); car.y = Math.max(0, Math.min(2400, roadCenter(near.j) + along)); }
      else { car.x = Math.max(0, Math.min(2400, roadCenter(near.i) + along)); car.y = roadCenter(road); }
      car.angle = p.angle;
      car.speed = car.cruise;
      retarget(car, random);
    }
  }
}

export function stepPeds(dt, city, peds, danger, random) {
  for (const ped of peds) {
    if (!ped.active || ped.down > 0) {
      if (ped.down > 0) ped.down -= dt;
      continue;
    }
    // Danger nearby (gunfire, explosion, a speeding car): run away from it.
    let flee = null;
    for (const d of danger) {
      const dx = ped.x - d.x;
      const dy = ped.y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < d.radius) { flee = { x: ped.x + dx / (dist || 1), y: ped.y + dy / (dist || 1) }; break; }
    }
    if (flee) {
      ped.state = 'flee';
      ped.angle = Math.atan2(flee.y - ped.y, flee.x - ped.x);
      const step = PEDS.fleeSpeed * dt;
      const next = city.collide(ped.x + Math.cos(ped.angle) * step, ped.y + Math.sin(ped.angle) * step, 10);
      ped.x = next.x;
      ped.y = next.y;
      continue;
    }
    if (ped.state === 'flee') ped.state = 'walk';
    ped.timer -= dt;
    const dx = ped.tx - ped.x;
    const dy = ped.ty - ped.y;
    if (Math.hypot(dx, dy) < 18 || ped.timer <= 0) {
      const p = city.randomSidewalkPoint(random);
      ped.tx = p.x;
      ped.ty = p.y;
      ped.timer = range(random, 4, 10);
    }
    const want = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.angle += Math.max(-3 * dt, Math.min(3 * dt, angleDiff(ped.angle, want)));
    if (!ped.walkSpeed) ped.walkSpeed = range(random, PEDS.walkMin, PEDS.walkMax);
    const speed = ped.walkSpeed;
    const next = city.collide(ped.x + Math.cos(ped.angle) * speed * dt, ped.y + Math.sin(ped.angle) * speed * dt, 10);
    ped.x = next.x;
    ped.y = next.y;
  }
}
