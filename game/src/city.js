// The city of Port Meridian: a seeded grid of roads, blocks and buildings,
// the harbour along its south edge, and every named place the missions use.
// Pure data and geometry — no drawing, no browser — so the shots and the
// game build the same city from the same seed.
import { GRID, PALETTE, WORLD } from './config.js';
import { pick, range } from './random.js';

export function roadCenter(index) {
  return GRID.roadWidth / 2 + index * GRID.pitch;
}

function blockRect(bi, bj) {
  const x0 = roadCenter(bi) + GRID.roadWidth / 2;
  const y0 = roadCenter(bj) + GRID.roadWidth / 2;
  return { x: x0, y: y0, w: GRID.block, h: GRID.block };
}

export function createCity(random) {
  const buildings = [];
  const parks = [];
  const palms = [];
  const lamps = [];
  const piers = [];
  const parkedCars = [];
  const carColors = ['#d94f3d', '#3d7dd9', '#e8c95a', '#7ddc7d', '#e8e8e8', '#5a4a6b', '#2fa8a0', '#c95a7d'];

  // Named places: block indices are (column, row) on the 8x8 block grid.
  const PARK_BLOCK = [4, 4];
  const PLAZA_BLOCK = [5, 3];
  const CHOP_BLOCK = [7, 1];
  const safehouse = { x: blockRect(0, 0).x + 60, y: blockRect(0, 0).y + 60 };
  const chopShop = { x: blockRect(7, 1).x + 114, y: blockRect(7, 1).y + 114 };
  const plaza = { x: blockRect(5, 3).x + 114, y: blockRect(5, 3).y + 114 };
  const docks = { x: 1200, y: 2680 };
  const shops = [
    { x: blockRect(2, 5).x + 114, y: blockRect(2, 5).y - 8, label: "Rosa's Bodega" },
    { x: blockRect(6, 3).x - 8, y: blockRect(6, 3).y + 114, label: 'Neon Nails' },
    { x: blockRect(3, 7).x + 114, y: blockRect(3, 7).y + 236, label: 'Bait & Tackle' },
  ];

  // Two piers reach into the harbour water; the docks marker sits at the first.
  piers.push({ x: 1150, y: WORLD.waterY, w: 100, h: 200 });
  piers.push({ x: 1650, y: WORLD.waterY, w: 100, h: 160 });

  for (let bi = 0; bi < 8; bi += 1) {
    for (let bj = 0; bj < 8; bj += 1) {
      const block = blockRect(bi, bj);
      const key = `${bi},${bj}`;
      if (key === `${PARK_BLOCK[0]},${PARK_BLOCK[1]}`) {
        parks.push({ x: block.x, y: block.y, w: block.w, h: block.h });
        for (let t = 0; t < 9; t += 1) {
          palms.push({ x: block.x + 30 + random() * (block.w - 60), y: block.y + 30 + random() * (block.h - 60) });
        }
        continue;
      }
      if (key === `${PLAZA_BLOCK[0]},${PLAZA_BLOCK[1]}`) {
        // Open plaza: no buildings, and the mission-2 sports car parks here.
        parkedCars.push({ x: plaza.x + 40, y: plaza.y - 20, angle: Math.PI / 2, model: 'sports', color: '#e8c95a', target: true });
        for (let t = 0; t < 4; t += 1) {
          palms.push({ x: block.x + 24 + t * 60, y: block.y + 24 });
          palms.push({ x: block.x + 24 + t * 60, y: block.y + block.h - 24 });
        }
        continue;
      }
      if (key === '0,0') {
        buildings.push({ x: block.x + 20, y: block.y + 20, w: 120, h: 90, color: '#f0e6d2', roof: '#8a5a3b', seed: random(), home: true });
        buildings.push({ x: block.x + 150, y: block.y + 130, w: 60, h: 50, color: '#c9a2d8', roof: '#5d6b7a', seed: random() });
        continue;
      }
      if (key === `${CHOP_BLOCK[0]},${CHOP_BLOCK[1]}`) {
        buildings.push({ x: block.x + 30, y: block.y + 30, w: 168, h: 120, color: '#5d6b7a', roof: '#3a3f4a', seed: random(), chop: true });
        continue;
      }
      // An ordinary block: one big building, two side by side, or four small.
      const style = random();
      if (style < 0.45) {
        buildings.push({ x: block.x + 14, y: block.y + 14, w: block.w - 28, h: block.h - 28, color: pick(random, PALETTE.building), roof: pick(random, PALETTE.roof), seed: random() });
      } else if (style < 0.8) {
        buildings.push({ x: block.x + 12, y: block.y + 12, w: block.w / 2 - 18, h: block.h - 24, color: pick(random, PALETTE.building), roof: pick(random, PALETTE.roof), seed: random() });
        buildings.push({ x: block.x + block.w / 2 + 6, y: block.y + 12, w: block.w / 2 - 18, h: block.h - 24, color: pick(random, PALETTE.building), roof: pick(random, PALETTE.roof), seed: random() });
      } else {
        for (const [ox, oy] of [[12, 12], [block.w / 2 + 6, 12], [12, block.h / 2 + 6], [block.w / 2 + 6, block.h / 2 + 6]]) {
          buildings.push({ x: block.x + ox, y: block.y + oy, w: block.w / 2 - 18, h: block.h / 2 - 18, color: pick(random, PALETTE.building), roof: pick(random, PALETTE.roof), seed: random() });
        }
      }
      // A palm or two on the block's corners.
      if (random() < 0.6) palms.push({ x: block.x + 16, y: block.y + 16 });
      if (random() < 0.4) palms.push({ x: block.x + block.w - 16, y: block.y + block.h - 16 });
    }
  }

  // A lamp at every intersection corner, and palms along the harbour front.
  for (let i = 0; i < GRID.roads; i += 1) {
    for (let j = 0; j < GRID.roads; j += 1) {
      lamps.push({ x: roadCenter(i) - GRID.roadWidth / 2 + 6, y: roadCenter(j) - GRID.roadWidth / 2 + 6 });
    }
  }
  for (let x = 100; x < 2400; x += 170) {
    palms.push({ x: x + range(random, -20, 20), y: WORLD.waterY - 60 });
  }

  // Parked cars along road edges: stealable, but not the mission target.
  for (let n = 0; n < 10; n += 1) {
    const vertical = random() < 0.5;
    const road = Math.floor(random() * GRID.roads);
    const along = range(random, 120, roadCenter(GRID.roads - 1));
    const side = random() < 0.5 ? -1 : 1;
    const x = vertical ? roadCenter(road) + side * 26 : along;
    const y = vertical ? along : roadCenter(road) + side * 26;
    parkedCars.push({ x, y, angle: vertical ? Math.PI / 2 : 0, model: pick(random, ['sedan', 'sedan', 'van', 'taxi']), color: pick(random, carColors), target: false });
  }

  // Never let a parked car block the courier van: with some seeds one lands
  // on top of the van's parking spot and wedges it against the safehouse,
  // so the first mission cannot even start. Relocated cars go to a fixed
  // road-edge spot (no extra random calls, so the rest of the city is
  // unchanged for this seed).
  let relocated = 0;
  for (const pc of parkedCars) {
    if (pc.target) continue;
    const nearVan = Math.hypot(pc.x - (safehouse.x + 110), pc.y - (safehouse.y + 40)) < 130;
    const nearHome = Math.hypot(pc.x - safehouse.x, pc.y - safehouse.y) < 200;
    if (nearVan || nearHome) {
      pc.x = roadCenter(7);
      pc.y = roadCenter(1) + 26 + relocated * 70;
      pc.angle = 0;
      relocated += 1;
    }
  }

  function inWater(x, y) {
    if (y < WORLD.waterY) return false;
    for (const pier of piers) {
      if (x >= pier.x && x <= pier.x + pier.w && y >= pier.y && y <= pier.y + pier.h) return false;
    }
    return true;
  }

  /** Push a circle out of buildings, water and the world edge; returns the new point. */
  function collide(x, y, r) {
    let nx = Math.max(WORLD.minX + r, Math.min(WORLD.maxX - r, x));
    let ny = Math.max(WORLD.minY + r, Math.min(WORLD.maxY + WORLD.waterH - r, y));
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
      const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
      const dx = nx - cx;
      const dy = ny - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        if (d2 > 0.01) {
          const d = Math.sqrt(d2);
          nx = cx + (dx / d) * r;
          ny = cy + (dy / d) * r;
        } else {
          // The centre is inside the building: leave along the smallest overlap.
          const left = nx - b.x;
          const right = b.x + b.w - nx;
          const top = ny - b.y;
          const bottom = b.y + b.h - ny;
          const m = Math.min(left, right, top, bottom);
          if (m === left) nx = b.x - r;
          else if (m === right) nx = b.x + b.w + r;
          else if (m === top) ny = b.y - r;
          else ny = b.y + b.h + r;
        }
      }
    }
    if (inWater(nx, ny)) {
      // Shoved into the sea: back to the waterline (or onto the pier they came from).
      ny = WORLD.waterY - r;
    }
    return { x: nx, y: ny };
  }

  function randomRoadPoint(randomFn) {
    const vertical = randomFn() < 0.5;
    const road = Math.floor(randomFn() * GRID.roads);
    const along = range(randomFn, 60, roadCenter(GRID.roads - 1));
    return vertical
      ? { x: roadCenter(road), y: along, angle: randomFn() < 0.5 ? 0 : Math.PI }
      : { x: along, y: roadCenter(road), angle: randomFn() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }

  function randomSidewalkPoint(randomFn) {
    const vertical = randomFn() < 0.5;
    const road = Math.floor(randomFn() * GRID.roads);
    const along = range(randomFn, 40, roadCenter(GRID.roads - 1));
    const side = randomFn() < 0.5 ? -1 : 1;
    return vertical
      ? { x: roadCenter(road) + side * 52, y: along }
      : { x: along, y: roadCenter(road) + side * 52 };
  }

  return {
    buildings, parks, palms, lamps, piers, parkedCars,
    safehouse, chopShop, plaza, docks, shops,
    collide, inWater, randomRoadPoint, randomSidewalkPoint,
  };
}
