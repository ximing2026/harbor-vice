// Entity factories: cars, pedestrians, bullets, pickups, particles.
import { range, rangeInt, pick } from './random.js';

let nextId = 1;

const CAR_COLORS = ['#c94f42', '#4a7ac9', '#c9a13f', '#7a4a9a', '#4a9a6a', '#c9c9c9', '#3f3f4a', '#d07a3a'];

export function makeCar(rng, o) {
  return {
    id: nextId,
    kind: o.kind || 'traffic', // traffic | parked | van | comet | sedan | cop
    x: o.x,
    y: o.y,
    angle: o.angle || 0,
    speed: 0,
    maxSpeed: o.maxSpeed || 120,
    accel: o.accel || 140,
    color: o.color || pick(rng, CAR_COLORS),
    w: o.w || 34,
    h: o.h || 18,
    hp: o.hp || 100,
    parked: !!o.parked,
    driver: o.driver || null, // 'traffic' | 'player' | 'cop' | null
    hitCooldown: 0,
    route: null,
    lane: o.lane || 0,
    dir: o.dir || 0, // 0 E, 1 S, 2 W, 3 N (traffic only)
    wait: 0,
    smoke: 0,
  };
}

export function makePed(rng, x, y) {
  return {
    id: nextId,
    x,
    y,
    angle: range(rng, 0, Math.PI * 2),
    speed: range(rng, 28, 46),
    color: pick(rng, ['#e8d8b0', '#8ab0d8', '#d88a8a', '#a0d8a0', '#d8c88a', '#b0a0d8']),
    dir: rangeInt(rng, 0, 3),
    road: rangeInt(rng, 0, 1) ? 'h' : 'v',
    lane: rangeInt(rng, 0, 8),
    flee: 0,
    fleeX: 0,
    fleeY: 0,
    hp: 30,
  };
}

export function makeBullet(x, y, angle, speed, from) {
  return {
    x,
    y,
    px: x,
    py: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 1.2,
    from, // 'player' | 'guard' | 'thug' | 'cop'
    damage: 34,
  };
}

export function makePickup(x, y, kind) {
  return { x, y, kind, bob: 0, taken: false };
}

export function makeParticle(x, y, vx, vy, life, color, size) {
  return { x, y, vx, vy, life, maxLife: life, color, size };
}

export function resetIds() {
  nextId = 1;
}
