// The story of HARBOR VICE: five chained jobs for Rook, a courier who owes
// the Harbor Crew. Each mission is a small state machine over the world; the
// world calls startMission once and updateMission every step. Markers and
// objectives are written onto the world state for the HUD and the minimap.
import { makePed } from './entities.js';
import { range } from './random.js';

export const MISSIONS = [
  { id: 'first-run', name: 'First Run', reward: 400 },
  { id: 'hot-wheels', name: 'Hot Wheels', reward: 700 },
  { id: 'shakedown', name: 'The Shakedown', reward: 900 },
  { id: 'heat-wave', name: 'Heat Wave', reward: 1200 },
  { id: 'harbor-job', name: 'The Harbor Job', reward: 2500 },
];

const BRIEFINGS = [
  "Rook, the Harbor Crew owns your debt. First job's easy: take the van from your garage to the drop at the docks. Don't scratch it.",
  "The Crew wants a ride. A gold Comet GT is parked at Meridian Plaza — take it, any way you like, and bring it to the chop shop on Coral Row.",
  "Three shops on the Crew's books are late. Walk in, collect $300 from each. The owners' friends may object. They usually do.",
  "Somebody talked. The whole Port Meridian PD is coming for you. Lose the heat — all of it — then get home.",
  "The big one. Grab the briefcase at the end of Pier 1. The docks crew won't hand it over. Then bring it home through the storm.",
];

export function missionName(index) {
  return index >= 0 && index < MISSIONS.length ? MISSIONS[index].name : 'Free Roam';
}

export function missionBriefing(index) {
  return BRIEFINGS[index] || '';
}

/** Place the mission's pieces and set the first objective. Returns the briefing. */
export function startMission(world, index) {
  const s = world.state;
  const city = world.city;
  s.mission = { index, stage: 0, timer: 0, hold: 0, collected: 0, guardsSpawned: false };
  s.marker = null;
  s.objective = '';
  if (index === 0) {
    // The courier van waits at the safehouse garage. Its spot is clear of
    // the home's east wall and of the player's sedan: it used to spawn half
    // inside the wall, wedged against the sedan, and mission 1 could not
    // even start.
    const van = world.spawnPlayerCar('van', city.safehouse.x + 110, city.safehouse.y + 40, 0);
    van.missionVan = true;
    s.marker = { x: van.x, y: van.y, label: 'Courier van' };
    s.objective = 'Get in the courier van';
  } else if (index === 1) {
    const target = world.city.parkedCars.find((c) => c.target);
    s.marker = { x: target.x, y: target.y, label: 'Comet GT' };
    s.objective = 'Steal the gold Comet GT at Meridian Plaza';
  } else if (index === 2) {
    s.marker = { x: city.shops[0].x, y: city.shops[0].y, label: city.shops[0].label };
    s.objective = `Collect from ${city.shops[0].label} (0/3)`;
  } else if (index === 3) {
    world.setWanted(3, true);
    s.objective = 'Lose the cops — get your wanted level to zero';
  } else if (index === 4) {
    s.marker = { x: city.docks.x, y: city.docks.y, label: 'Pier 1' };
    s.objective = 'Get to the briefcase at the end of Pier 1';
  }
  return BRIEFINGS[index];
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Advance the active mission one step. Returns 'done' when the mission pays
 * out, 'failed' when it must restart (busted/wasted is handled by the world),
 * or null while it runs.
 */
export function updateMission(world, dt) {
  const s = world.state;
  const city = world.city;
  const m = s.mission;
  if (!m || m.index >= MISSIONS.length) return null;
  const p = s.player;

  if (m.index === 0) {
    const van = s.cars.find((c) => c.missionVan);
    if (m.stage === 0) {
      if (p.inCar && p.car === van) {
        m.stage = 1;
        s.marker = { x: city.docks.x, y: 2470, label: 'Drop point' };
        s.objective = 'Deliver the van to the docks drop point';
      }
    } else if (p.inCar && p.car === van && dist(p.car.x, p.car.y, city.docks.x, 2470) < 90) {
      return finishMission(world);
    }
  } else if (m.index === 1) {
    const target = s.cars.find((c) => c.target);
    if (m.stage === 0) {
      if (p.inCar && p.car === target) {
        m.stage = 1;
        s.marker = { x: city.chopShop.x, y: city.chopShop.y, label: 'Chop shop' };
        s.objective = 'Deliver the Comet GT to the chop shop';
      }
    } else if (p.inCar && p.car === target && dist(p.car.x, p.car.y, city.chopShop.x, city.chopShop.y) < 90) {
      return finishMission(world);
    }
    // The target was wrecked: put a fresh one back at the plaza.
    if (!target || !target.active) {
      const t = world.spawnParkedCar(true);
      if (t) { m.stage = 0; s.marker = { x: t.x, y: t.y, label: 'Comet GT' }; s.objective = 'Steal the gold Comet GT at Meridian Plaza'; }
    }
  } else if (m.index === 2) {
    const shop = city.shops[m.stage];
    if (!shop) return finishMission(world);
    if (!p.inCar && dist(p.x, p.y, shop.x, shop.y) < 58) {
      m.hold += dt;
      s.objective = `Collecting from ${shop.label}… ${Math.ceil(2 - m.hold)}s`;
      if (m.hold >= 2) {
        s.money += 300;
        m.collected += 1;
        m.hold = 0;
        m.stage += 1;
        world.addPickup('cash', shop.x + 30, shop.y + 30, 0);
        if (m.stage < city.shops.length) {
          const next = city.shops[m.stage];
          s.marker = { x: next.x, y: next.y, label: next.label };
          s.objective = `Collect from ${next.label} (${m.collected}/3)`;
          spawnThugs(world, next);
        } else {
          return finishMission(world);
        }
      }
    } else {
      m.hold = 0;
      s.objective = p.inCar ? 'Get out of the car to collect' : `Collect from ${shop.label} (${m.collected}/3)`;
    }
  } else if (m.index === 3) {
    if (m.stage === 0) {
      if (s.wanted === 0) {
        m.stage = 1;
        s.marker = { x: city.safehouse.x, y: city.safehouse.y, label: 'Safehouse' };
        s.objective = 'Heat is gone — get home to the safehouse';
      }
    } else if (dist(p.x, p.y, city.safehouse.x, city.safehouse.y) < 80) {
      return finishMission(world);
    }
  } else if (m.index === 4) {
    if (m.stage === 0) {
      if (dist(p.x, p.y, city.docks.x, city.docks.y) < 60) {
        m.hold += dt;
        s.objective = `Grabbing the briefcase… ${Math.ceil(1.2 - m.hold)}s`;
        if (m.hold >= 1.2) {
          m.stage = 1;
          m.hold = 0;
          s.marker = { x: city.safehouse.x, y: city.safehouse.y, label: 'Safehouse' };
          s.objective = 'Briefcase secured — get home, and watch the docks crew';
          world.setWanted(4, true);
          if (!p.armed) { p.armed = true; p.ammo = Math.max(p.ammo, 60); }
          spawnGuards(world);
        }
      } else {
        m.hold = 0;
        s.objective = 'Get to the briefcase at the end of Pier 1';
      }
    } else if (dist(p.x, p.y, city.safehouse.x, city.safehouse.y) < 80) {
      return finishMission(world);
    }
  }
  return null;
}

function finishMission(world) {
  const s = world.state;
  const m = s.mission;
  const reward = MISSIONS[m.index].reward;
  s.money += reward;
  s.stats.missionsDone += 1;
  s.toast = { text: `Mission complete: ${MISSIONS[m.index].name}  +$${reward}`, timer: 3.5 };
  s.mission = { index: m.index + 1, stage: 0, timer: 0, hold: 0, collected: 0, guardsSpawned: false };
  s.marker = null;
  if (s.mission.index >= MISSIONS.length) {
    s.objective = 'Free roam — Port Meridian is yours, Rook.';
    s.gameComplete = true;
    return 'done';
  }
  startMission(world, s.mission.index);
  s.toast = { text: `Mission complete: ${MISSIONS[m.index].name}  +$${reward}`, timer: 3.5 };
  return 'done';
}

function spawnThugs(world, shop) {
  const s = world.state;
  for (let i = 0; i < 2; i += 1) {
    const thug = makePed(world.random, shop.x + range(world.random, -90, 90), shop.y + range(world.random, -90, 90), 'thug');
    thug.state = 'chase';
    s.peds.push(thug);
  }
}

function spawnGuards(world) {
  const s = world.state;
  for (let i = 0; i < 4; i += 1) {
    const guard = makePed(world.random, world.city.docks.x + range(world.random, -160, 160), world.city.docks.y - range(world.random, 40, 220), 'guard');
    guard.state = 'chase';
    s.peds.push(guard);
  }
  s.mission.guardsSpawned = true;
}
