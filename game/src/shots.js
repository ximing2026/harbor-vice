// Screenshot scenes: each plays the real rules forward from a fresh world
// for a fixed number of steps, steered by a simple autopilot, so the frame is
// what a short game really looks like and the same seed always gives the same
// frame.
import { STEP, WORLD } from './config.js';
import { createWorld, stepWorld } from './world.js';
import { startMission } from './missions.js';
import { angleDiff, clamp } from './random.js';

const DRIVE_SECONDS = 8;
const CHASE_SECONDS = 7;
const MISSION_SECONDS = 3;

function blankInput() {
  return {
    up: false, down: false, left: false, right: false,
    enter: false, action: false, punch: false, shoot: false,
    aimX: 0, aimY: 0,
  };
}

// Drive the player's car toward a road point: steer to the target, brake for
// sharp turns so the car can make 90-degree corners without clipping buildings.
// Never reverse: if the target is behind, drive on and loop around —
// reversing into a turn stalls the car in an oscillation.
function driveToward(state, tx, ty) {
  const car = state.playerCar;
  const input = blankInput();
  if (!car) return input;
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, want);
  input.left = diff < -0.15;
  input.right = diff > 0.15;
  input.up = Math.abs(diff) < 1.2;
  input.down = false;
  return input;
}

function walkToward(state, tx, ty, shoot) {
  const p = state.player;
  const input = blankInput();
  const want = Math.atan2(ty - p.y, tx - p.x);
  const dx = Math.cos(want);
  const dy = Math.sin(want);
  input.right = dx > 0.3;
  input.left = dx < -0.3;
  input.down = dy > 0.3;
  input.up = dy < -0.3;
  if (shoot) {
    input.aimX = shoot.x;
    input.aimY = shoot.y;
    input.shoot = true;
  }
  return input;
}

function stepN(state, seconds, inputFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(state, inputFn ? inputFn(state, i) : blankInput(), STEP);
  }
}

export function stageShot(name, seed) {
  const state = createWorld(seed || 20261117);
  state.screen = 'play';

  if (name === 'drive') {
    // The Comet GT, mid-drive down a long straight with traffic around.
    const comet = state.missionVehicles.comet;
    comet.x = 400;
    comet.y = 1048;
    comet.angle = 0;
    comet.parked = false;
    comet.driver = 'player';
    state.playerCar = comet;
    state.player.onFoot = false;
    state.player.x = comet.x;
    state.player.y = comet.y;
    state.player.angle = 0;
    state.mission.index = 1;
    startMission(state, 1);
    stepN(state, DRIVE_SECONDS, () => driveToward(state, 1500, 1048));
    return { state, screen: 'play' };
  }

  if (name === 'chase') {
    // Five stars: the sedan fleeing north with cop cars closing in.
    const sedan = state.missionVehicles.sedan;
    sedan.x = 832;
    sedan.y = 1300;
    sedan.angle = -Math.PI / 2;
    sedan.parked = false;
    sedan.driver = 'player';
    state.playerCar = sedan;
    state.player.onFoot = false;
    state.player.x = sedan.x;
    state.player.y = sedan.y;
    state.player.angle = -Math.PI / 2;
    state.player.heat = 100;
    state.player.wanted = 5;
    state.player.unseen = 0;
    state.player.lastSeenX = sedan.x;
    state.player.lastSeenY = sedan.y;
    // The banner reads "Lose the Heat": this is the escape, not a delivery.
    startMission(state, 3);
    state.player.heat = 100;
    state.player.wanted = 5;
    // Cop cars spawn on their own during the pursuit (heat is 5 stars).
    stepN(state, CHASE_SECONDS, () => driveToward(state, 832, 300));
    return { state, screen: 'play' };
  }

  if (name === 'mission') {
    // The Harbor Job: on the pier, guards ahead, briefcase in reach.
    state.mission.index = 4;
    startMission(state, 4);
    state.player.x = 1200;
    state.player.y = 1880;
    state.player.angle = Math.PI / 2;
    state.player.ammo = 60;
    stepN(state, MISSION_SECONDS, (st) => {
      // Shoot the nearest live guard or foot cop. Before the grab, walk to
      // the briefcase; after it, run back north off the pier.
      let guard = null;
      let best = 320 * 320;
      for (const g of [...st.guards, ...st.footCops]) {
        if (g.hp <= 0) continue;
        const d = (g.x - st.player.x) ** 2 + (g.y - st.player.y) ** 2;
        if (d < best) { best = d; guard = g; }
      }
      const bc = st.city.briefcase;
      if (st.mission.sub.gotCase) return walkToward(st, 1200, 1800, guard);
      return walkToward(st, bc.x, bc.y, guard);
    });
    return { state, screen: 'play' };
  }

  // Default: title over a living city.
  stepN(state, 5, null);
  state.screen = 'title';
  return { state, screen: 'title' };
}
