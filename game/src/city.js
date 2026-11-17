// Port Meridian — the city layout: road grid, buildings, park, plaza, harbour,
// landmarks, parked cars and pickup spots. All derived from one seed so the
// city is identical on every run.
import { PITCH, ROAD, STREETS, WORLD, WORLD_H, roadC, PAL } from './config.js';
import { makeRng, range, rangeInt, pick } from './random.js';

const ROOFS = ['#6b4a35', '#5d4030', '#7a5240', '#54402e', '#6e3f2e', '#4a3a2c'];
const WALLS = ['#c9a06a', '#b98d54', '#a87f52', '#c2a878', '#9a7a4e'];

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const windows = [];

  // One or two buildings per ordinary block; park and plaza blocks stay open.
  for (let bx = 0; bx < STREETS; bx += 1) {
    for (let by = 0; by < STREETS; by += 1) {
      const x0 = bx * PITCH + ROAD;
      const y0 = by * PITCH + ROAD;
      const size = PITCH - ROAD; // 136
      if (bx === 1 && by === 1) {
        // Park: trees scattered inside the block.
        for (let i = 0; i < 14; i += 1) {
          trees.push({ x: x0 + range(rng, 12, size - 12), y: y0 + range(rng, 12, size - 12), r: range(rng, 8, 15) });
        }
        continue;
      }
      if (bx === 4 && by === 4) continue; // central plaza, kept open
      const n = rangeInt(rng, 1, 2);
      for (let i = 0; i < n; i += 1) {
        const w = range(rng, 56, 96);
        const h = range(rng, 56, 96);
        const x = x0 + range(rng, 4, size - w - 4);
        const y = y0 + range(rng, 4, size - h - 4);
        const b = { x, y, w, h, roof: pick(rng, ROOFS), wall: pick(rng, WALLS), kind: 'block' };
        buildings.push(b);
        const cols = Math.max(1, Math.floor(w / 26));
        const rows = Math.max(1, Math.floor(h / 26));
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            if (rng() < 0.55) windows.push({ x: x + 10 + cx * 26, y: y + 10 + cy * 26, lit: rng() < 0.5 });
          }
        }
      }
    }
  }

  // Landmark buildings (also solid).
  const safehouse = { x: 96, y: 96, w: 84, h: 64, roof: PAL.safehouse, wall: '#7a9a6a', kind: 'safehouse' };
  const chopshop = { x: 1480, y: 480, w: 110, h: 80, roof: PAL.chopshop, wall: '#8a5a4a', kind: 'chopshop' };
  const shops = [
    { x: 480, y: 1080, w: 90, h: 70, roof: PAL.shop, wall: '#7a8aa0', kind: 'shop', id: 0 },
    { x: 1080, y: 280, w: 90, h: 70, roof: PAL.shop, wall: '#7a8aa0', kind: 'shop', id: 1 },
    { x: 1280, y: 1280, w: 90, h: 70, roof: PAL.shop, wall: '#7a8aa0', kind: 'shop', id: 2 },
  ];
  buildings.push(safehouse, chopshop, ...shops);

  const piers = [
    { x: 560, y: WORLD, w: 80, h: 180, id: 0 },
    { x: 1160, y: WORLD, w: 80, h: 180, id: 1 },
  ];

  const city = {
    seed,
    buildings,
    trees,
    windows,
    safehouse,
    chopshop,
    shops,
    piers,
    docks: { x: 600, y: 1900, r: 95 },
    briefcase: { x: 1200, y: 1940, taken: false },
    park: { x: 1 * PITCH + ROAD, y: 1 * PITCH + ROAD, s: PITCH - ROAD },
    plaza: { x: 4 * PITCH + ROAD, y: 4 * PITCH + ROAD, s: PITCH - ROAD },
  };
  return city;
}

// True when the point is solid ground to drive or walk on: inside a building
// or in the water (piers are walkable/drivable decks over the water).
export function solidAt(city, x, y) {
  if (x < 0 || y < 0 || x > WORLD || y > WORLD_H) return true;
  if (y >= WORLD) {
    for (const p of city.piers) {
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return false;
    }
    return true; // open water
  }
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

// Push a circle (x, y, radius) out of solid ground; returns corrected position.
export function resolveSolid(city, x, y, r) {
  let nx = x;
  let ny = y;
  // Water: only piers may be entered. A circle may cross the water line when
  // its centre lines up with a pier's span; it may not drive past a pier's end.
  if (ny + r >= WORLD) {
    let pier = null;
    for (const p of city.piers) {
      if (nx >= p.x + 4 && nx <= p.x + p.w - 4) { pier = p; break; }
    }
    if (!pier) {
      ny = WORLD - r;
    } else if (ny + r > pier.y + pier.h) {
      ny = pier.y + pier.h - r;
    }
  }
  if (nx - r < 0) nx = r;
  if (nx + r > WORLD) nx = WORLD - r;
  if (ny - r < 0) ny = r;
  if (ny + r > WORLD_H) ny = WORLD_H - r;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
    const dx = nx - cx;
    const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        ny = cy + (dy / d) * r;
      } else {
        // Centre inside the rect: push out along the smallest penetration.
        const pl = nx - b.x + r;
        const pr = b.x + b.w - nx + r;
        const pt = ny - b.y + r;
        const pb = b.y + b.h - ny + r;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) nx = b.x - r;
        else if (m === pr) nx = b.x + b.w + r;
        else if (m === pt) ny = b.y - r;
        else ny = b.y + b.h + r;
      }
    }
  }
  return { x: nx, y: ny };
}

export function onPier(city, x, y) {
  for (const p of city.piers) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
  }
  return false;
}

// True when a building stands between the two points (water never blocks
// sight). Sampled along the segment; used by the police sight check.
export function losBlocked(city, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(d / 20));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = x1 + dx * t;
    const y = y1 + dy * t;
    for (const b of city.buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
  }
  return false;
}

// Fixed pickup spots (cash / health / ammo).
export function pickupSpots() {
  return [
    { x: 400, y: 400, kind: 'cash' },
    { x: 900, y: 900, kind: 'cash' },
    { x: 1500, y: 300, kind: 'cash' },
    { x: 300, y: 1200, kind: 'health' },
    { x: 1400, y: 1400, kind: 'health' },
    { x: 700, y: 700, kind: 'ammo' },
    { x: 1100, y: 1600, kind: 'ammo' },
    { x: 1600, y: 1000, kind: 'cash' },
  ];
}
