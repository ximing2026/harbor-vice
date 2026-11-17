// Factories for the moving things in Port Meridian: cars and pedestrians.
// A car is a circle in the physics (its radius) with a body length for the
// drawing; a pedestrian is a walker with a mood (calm, fleeing, down, thug,
// guard, cop, driver).
import { CAR, PALETTE } from './config.js';
import { pick, range } from './random.js';

export const MODEL = {
  sedan: { len: 46, wid: 22, max: CAR.maxSpeed },
  sports: { len: 48, wid: 21, max: CAR.sportsMax },
  van: { len: 54, wid: 25, max: CAR.vanMax },
  taxi: { len: 46, wid: 22, max: CAR.maxSpeed },
  police: { len: 48, wid: 22, max: CAR.policeMax },
};

const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8c95a', '#7ddc7d', '#e8e8e8', '#5a4a6b', '#2fa8a0', '#c95a7d', '#e07b39'];
const PED_SHIRTS = ['#d94f3d', '#3d7dd9', '#7ddc7d', '#e8e8e8', '#c95a7d', '#2fa8a0', '#e07b39', '#9db8c9'];

export function makeCar(random, kind, x, y, angle) {
  const model = MODEL[kind] || MODEL.sedan;
  return {
    kind, x, y, angle, speed: 0, vx: 0, vy: 0,
    len: model.len, wid: model.wid, maxSpeed: model.max,
    color: kind === 'police' ? PALETTE.copCar : kind === 'taxi' ? '#e8c95a' : pick(random, CAR_COLORS),
    health: CAR.health, active: true, driver: kind === 'police' ? 'cop' : 'traffic',
    smoke: 0, fire: 0, sirenPhase: random() * Math.PI * 2,
  };
}

export function makePed(random, x, y, role = 'walker') {
  return {
    x, y, angle: range(random, 0, Math.PI * 2), speed: 0,
    role, // walker | thug | guard | cop | driver
    health: role === 'guard' || role === 'thug' ? 100 : 30,
    shirt: role === 'cop' ? '#2244aa' : role === 'guard' ? '#3a3f4a' : role === 'thug' ? '#5a2a2a' : pick(random, PED_SHIRTS),
    state: 'walk', // walk | flee | down | chase | attack
    tx: x, ty: y, // the walk target they are heading for
    timer: range(random, 0, 2),
    attackTimer: 0, shootTimer: range(random, 0.5, 1.5),
    down: 0, active: true,
  };
}
