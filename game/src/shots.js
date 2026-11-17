// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot, so the frame is what real play
// looks like and the same seed always gives the same frame. The four scenes
// together show the title, driving with a mission, a police chase, and the
// harbour shootout.
import { STEP } from './config.js';
import { makePed } from './entities.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { range } from './random.js';

const START_SECONDS = 6;
const DRIVE_SECONDS = 17;
const CHASE_SECONDS = 13;
const MISSION_SECONDS = 6;

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function noInput() {
  return { up: false, down: false, left: false, right: false, run: false, punch: false, shoot: false, enter: false, aimX: 0, aimY: 0 };
}

/** Steer a car toward (tx, ty); reverse briefly if wedged against a building. */
function driveToward(world, tx, ty, stuck) {
  const car = world.state.player.car;
  if (!car) return noInput();
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = normAngle(want - car.angle);
  const speed = Math.abs(car.speed || 0);
  if (speed < 25) stuck.time += STEP;
  else stuck.time = 0;
  if (stuck.time > 1.1) {
    stuck.time = 0;
    return { up: false, down: true, left: true, right: false, run: false, punch: false, shoot: false, enter: false, aimX: tx, aimY: ty };
  }
  return {
    up: true, down: false,
    left: diff < -0.1, right: diff > 0.1,
    run: false, punch: false, shoot: false, enter: false, aimX: tx, aimY: ty,
  };
}

function putPlayerInCar(world, car) {
  const p = world.state.player;
  car.driver = 'player';
  p.inCar = true;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any name other than drive/chase/mission is the title scene.
 */
export function stageShot(name, world) {
  const s = world.state;
  if (name === 'drive') {
    world.reset(true);
    startMission(world, 1);
    const target = s.cars.find((c) => c.target);
    putPlayerInCar(world, target);
    s.mission.stage = 1;
    s.marker = { x: world.city.chopShop.x, y: world.city.chopShop.y, label: 'Chop shop' };
    s.objective = 'Deliver the Comet GT to the chop shop';
    const stuck = { time: 0 };
    for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
      const m = s.marker;
      world.step(STEP, driveToward(world, m.x, m.y, stuck), {});
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    world.reset(true);
    startMission(world, 3);
    const car = world.spawnPlayerCar('sports', s.player.x + 120, s.player.y + 30, 0);
    putPlayerInCar(world, car);
    // Let the wanted level call its cop cars, then pull two of them in close
    // so the chase is visibly on at the captured frame.
    for (let i = 0; i < 4 / STEP; i += 1) world.step(STEP, noInput(), {});
    const cops = s.copCars.slice(0, 2);
    cops.forEach((cop, i) => {
      const a = (i === 0 ? 2.4 : -0.7);
      cop.x = s.player.x + Math.cos(a) * 190;
      cop.y = s.player.y + Math.sin(a) * 190;
      cop.angle = Math.atan2(s.player.y - cop.y, s.player.x - cop.x);
      cop.speed = 300;
    });
    const stuck = { time: 0 };
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      // Flee from the nearest cop car.
      let nearest = null;
      let nearestD = Infinity;
      for (const cop of s.copCars) {
        const d = Math.hypot(cop.x - s.player.x, cop.y - s.player.y);
        if (d < nearestD) { nearestD = d; nearest = cop; }
      }
      const tx = nearest ? s.player.x + (s.player.x - nearest.x) * 2 : s.player.x + 600;
      const ty = nearest ? s.player.y + (s.player.y - nearest.y) * 2 : s.player.y;
      world.step(STEP, driveToward(world, tx, ty, stuck), {});
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    world.reset(true);
    startMission(world, 4);
    const p = s.player;
    p.x = world.city.docks.x;
    p.y = world.city.docks.y - 60;
    p.armed = true;
    p.ammo = 60;
    s.mission.stage = 1;
    s.marker = { x: world.city.safehouse.x, y: world.city.safehouse.y, label: 'Safehouse' };
    s.objective = 'Briefcase secured — get home, and watch the docks crew';
    world.setWanted(4, true);
    for (let i = 0; i < 4; i += 1) {
      const guard = makePed(world.random, world.city.docks.x + range(world.random, -160, 160), world.city.docks.y - range(world.random, 40, 220), 'guard');
      guard.state = 'chase';
      s.peds.push(guard);
    }
    for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
      // Close to the nearest guard and keep shooting at them.
      let nearest = null;
      let nearestD = Infinity;
      for (const ped of s.peds) {
        if (ped.role !== 'guard' || ped.down > 0) continue;
        const d = Math.hypot(ped.x - p.x, ped.y - p.y);
        if (d < nearestD) { nearestD = d; nearest = ped; }
      }
      const input = noInput();
      if (nearest) {
        const dx = nearest.x - p.x;
        const dy = nearest.y - p.y;
        const d = Math.hypot(dx, dy);
        input.aimX = nearest.x;
        input.aimY = nearest.y;
        input.shoot = d < 420;
        // Kite: close in to shoot, but back off when a guard gets too close
        // or the player's health is low — standing still gets Rook killed.
        if (d < 170 || p.health < 40) {
          input.up = dy > 8;
          input.down = dy < -8;
          input.left = dx > 8;
          input.right = dx < -8;
        } else if (d > 170) {
          input.up = dy < -8;
          input.down = dy > 8;
          input.left = dx < -8;
          input.right = dx > 8;
        }
      }
      world.step(STEP, input, {});
    }
    return { screen: SCREEN_PLAY };
  }
  world.reset(false);
  for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, noInput(), { harmless: true });
  return { screen: SCREEN_TITLE };
}
