// Traffic and pedestrian AI: road-following cars and sidewalk walkers.
import { PITCH, ROAD, STREETS, WORLD, roadC } from './config.js';
import { makeRng, range, rangeInt, pick, clamp, dist2 } from './random.js';
import { makeCar, makePed } from './entities.js';

const DIRS = [
  { dx: 1, dy: 0 }, // 0 east
  { dx: 0, dy: 1 }, // 1 south
  { dx: -1, dy: 0 }, // 2 west
  { dx: 0, dy: -1 }, // 3 north
];
const LANE_OFF = 14; // right-hand lane offset from the centreline

// Lane-centre position for a car travelling dir along road `lane`.
function lanePos(dir, lane) {
  const c = roadC(lane);
  if (dir === 0) return { x: 0, y: c + LANE_OFF };
  if (dir === 2) return { x: 0, y: c - LANE_OFF };
  if (dir === 1) return { x: c + LANE_OFF, y: 0 };
  return { x: c - LANE_OFF, y: 0 };
}

export function spawnTrafficCar(rng, player, cars) {
  for (let tries = 0; tries < 12; tries += 1) {
    const dir = rangeInt(rng, 0, 3);
    const lane = rangeInt(rng, 0, STREETS - 1);
    const pos = lanePos(dir, lane);
    const along = range(rng, 80, WORLD - 80);
    const x = dir === 0 || dir === 2 ? along : pos.x;
    const y = dir === 1 || dir === 3 ? along : pos.y;
    if (dist2(x, y, player.x, player.y) < 300 * 300) continue;
    let blocked = false;
    for (const c of cars) {
      if (dist2(x, y, c.x, c.y) < 90 * 90) { blocked = true; break; }
    }
    if (blocked) continue;
    const car = makeCar(rng, {
      kind: 'traffic', x, y,
      angle: Math.atan2(DIRS[dir].dy, DIRS[dir].dx),
      maxSpeed: range(rng, 85, 125),
      driver: 'traffic',
    });
    car.dir = dir;
    car.lane = lane;
    car.speed = car.maxSpeed;
    return car;
  }
  return null;
}

export function spawnPed(rng, player) {
  for (let tries = 0; tries < 12; tries += 1) {
    const horiz = rng() < 0.5;
    const lane = rangeInt(rng, 0, STREETS - 1);
    const along = range(rng, 80, WORLD - 80);
    const off = (rng() < 0.5 ? -1 : 1) * (ROAD / 2 + 9);
    const x = horiz ? along : roadC(lane) + off;
    const y = horiz ? roadC(lane) + off : along;
    if (dist2(x, y, player.x, player.y) < 220 * 220) continue;
    const ped = makePed(rng, x, y);
    ped.road = horiz ? 'h' : 'v';
    ped.lane = lane;
    ped.dir = rangeInt(rng, 0, 1) ? 1 : -1;
    return ped;
  }
  return null;
}

// Car ahead in the same lane and direction, within `range` px.
function carAhead(state, car, rangePx) {
  const d = DIRS[car.dir];
  let best = null;
  let bestDist = rangePx;
  for (const other of state.cars) {
    if (other === car || other.parked && other.hp <= 0) continue;
    if (other.parked && other.kind === 'traffic') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * d.dx + dy * d.dy;
    if (along <= 0 || along > bestDist) continue;
    const side = Math.abs(dx * d.dy - dy * d.dx);
    if (side > 26) continue;
    // Parked cars block too (they sit in the lane).
    best = other;
    bestDist = along;
  }
  return best;
}

export function stepTraffic(state, dt, rng) {
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.hp <= 0) continue;
    const d = DIRS[car.dir];
    const ahead = carAhead(state, car, 62);
    const target = ahead ? 0 : car.maxSpeed;
    car.speed += clamp(target - car.speed, -260 * dt, 170 * dt);
    // At an intersection, sometimes turn onto the crossing road.
    const along = car.dir === 0 || car.dir === 2 ? car.x : car.y;
    for (let j = 0; j < STREETS; j += 1) {
      const c = roadC(j);
      if (Math.abs(along - c) < 9 && car.wait <= 0) {
        if (rng() < 0.3) {
          const options = [0, 1, 2, 3].filter((nd) => nd !== (car.dir + 2) % 4);
          const nd = pick(rng, options);
          if (nd === 1 || nd === 3) {
            // Now travelling along vertical road j: set the x lane, keep y.
            car.x = roadC(j) + (nd === 1 ? LANE_OFF : -LANE_OFF);
          } else {
            // Now travelling along horizontal road j: set the y lane, keep x.
            car.y = roadC(j) + (nd === 0 ? LANE_OFF : -LANE_OFF);
          }
          car.dir = nd;
          car.lane = j;
          car.angle = Math.atan2(DIRS[nd].dy, DIRS[nd].dx);
        }
        car.wait = 0.6; // don't re-decide at the same crossing
        break;
      }
    }
    car.wait = Math.max(0, car.wait - dt);
    car.x += d.dx * car.speed * dt;
    car.y += d.dy * car.speed * dt;
    // Wrap around the city edge instead of despawning mid-road.
    if (car.x < -40) { car.x = WORLD + 30; }
    if (car.x > WORLD + 40) { car.x = -30; }
    if (car.y < -40) { car.y = WORLD + 30; }
    if (car.y > WORLD + 40) { car.y = -30; }
  }
}

export function stepPeds(state, dt, rng) {
  for (const ped of state.peds) {
    if (ped.hp <= 0) continue;
    if (ped.flee > 0) {
      ped.flee -= dt;
      const a = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
      ped.x += Math.cos(a) * 95 * dt;
      ped.y += Math.sin(a) * 95 * dt;
      ped.angle = a;
      continue;
    }
    const speed = ped.speed;
    if (ped.road === 'h') {
      ped.x += ped.dir * speed * dt;
      ped.y = roadC(ped.lane) + (ped.dir > 0 ? ROAD / 2 + 9 : -(ROAD / 2 + 9));
      ped.angle = ped.dir > 0 ? 0 : Math.PI;
      if (ped.x < 60 || ped.x > WORLD - 60) ped.dir *= -1;
      // At an intersection, sometimes switch to a vertical road.
      const along = ped.x;
      for (let j = 0; j < STREETS; j += 1) {
        if (Math.abs(along - roadC(j)) < 6 && rng() < 0.004) {
          ped.road = 'v';
          ped.lane = j;
          ped.dir = rng() < 0.5 ? 1 : -1;
          break;
        }
      }
    } else {
      ped.y += ped.dir * speed * dt;
      ped.x = roadC(ped.lane) + (ped.dir > 0 ? ROAD / 2 + 9 : -(ROAD / 2 + 9));
      ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (ped.y < 60 || ped.y > WORLD - 60) ped.dir *= -1;
      const along = ped.y;
      for (let j = 0; j < STREETS; j += 1) {
        if (Math.abs(along - roadC(j)) < 6 && rng() < 0.004) {
          ped.road = 'h';
          ped.lane = j;
          ped.dir = rng() < 0.5 ? 1 : -1;
          break;
        }
      }
    }
    // Keep peds out of the water.
    if (ped.y > WORLD - 10) ped.y = WORLD - 10;
  }
}

// Scare nearby pedestrians (gunfire, explosion): they run from the point.
export function scarePeds(state, x, y, radius) {
  for (const ped of state.peds) {
    if (ped.hp <= 0) continue;
    if (dist2(ped.x, ped.y, x, y) < radius * radius) {
      ped.flee = 3;
      ped.fleeX = x;
      ped.fleeY = y;
    }
  }
}
