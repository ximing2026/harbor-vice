// The five chained story missions: objectives, spawn hooks and completion.
import { MISSION_TITLES, MISSION_PAYOUTS } from './config.js';
import { dist2 } from './random.js';
import { makeBullet } from './entities.js';

function near(ax, ay, bx, by, r) {
  return dist2(ax, ay, bx, by) < r * r;
}

function spawnThug(state, x, y) {
  state.thugs.push({ x, y, angle: 0, speed: 78, hp: 50, punchT: 0 });
}

function spawnGuard(state, x, y) {
  state.guards.push({ x, y, angle: 0, hp: 60, shootT: 0.6 + state.rng() * 0.8 });
}

export const MISSION_DEFS = [
  {
    title: MISSION_TITLES[0],
    objective: 'Drive the courier van from the safehouse to the docks',
    start(state) {
      state.mission.sub.enteredVan = false;
    },
    check(state) {
      const p = state.player;
      return state.mission.sub.enteredVan && !p.onFoot && state.playerCar && state.playerCar.kind === 'van'
        && near(p.x, p.y, state.city.docks.x, state.city.docks.y, state.city.docks.r);
    },
  },
  {
    title: MISSION_TITLES[1],
    objective: 'Steal the gold Comet GT and deliver it to the chop shop',
    start(state) {
      state.mission.sub.enteredComet = false;
    },
    check(state) {
      const p = state.player;
      const cs = state.city.chopshop;
      const cx = cs.x + cs.w / 2;
      const cy = cs.y + cs.h / 2;
      return state.mission.sub.enteredComet && !p.onFoot && state.playerCar && state.playerCar.kind === 'comet'
        && near(p.x, p.y, cx, cy, 150);
    },
  },
  {
    title: MISSION_TITLES[2],
    objective: 'Shake down all 3 shops — the thugs will not like it',
    start(state) {
      state.mission.sub.visited = [false, false, false];
      state.mission.sub.thugsSpawned = false;
      for (const shop of state.city.shops) {
        spawnThug(state, shop.x - 40, shop.y + shop.h + 30);
        spawnThug(state, shop.x + shop.w + 40, shop.y - 30);
      }
      state.mission.sub.thugsSpawned = true;
    },
    check(state) {
      const p = state.player;
      let all = true;
      state.city.shops.forEach((shop, i) => {
        const cx = shop.x + shop.w / 2;
        const cy = shop.y + shop.h / 2;
        if (near(p.x, p.y, cx, cy, 110)) state.mission.sub.visited[i] = true;
        if (!state.mission.sub.visited[i]) all = false;
      });
      return all;
    },
  },
  {
    title: MISSION_TITLES[3],
    objective: 'Lose the 3-star heat — stay unseen until it burns off',
    start(state) {
      state.player.heat = 60;
      state.player.wanted = 3;
      state.player.unseen = 0;
      state.mission.sub.armed = true;
    },
    check(state) {
      return state.mission.sub.armed && state.player.heat <= 0;
    },
  },
  {
    title: MISSION_TITLES[4],
    objective: 'Harbour shootout: grab the briefcase on pier 2, then escape to the safehouse',
    start(state) {
      state.mission.sub.gotCase = false;
      state.mission.sub.escaped = false;
      const pier = state.city.piers[1];
      spawnGuard(state, pier.x + 14, pier.y + 60);
      spawnGuard(state, pier.x + pier.w - 14, pier.y + 90);
      spawnGuard(state, pier.x + 40, pier.y + 140);
      spawnGuard(state, pier.x + 20, pier.y + 20);
    },
    check(state) {
      const p = state.player;
      const bc = state.city.briefcase;
      if (!state.mission.sub.gotCase && near(p.x, p.y, bc.x, bc.y, 34)) {
        state.mission.sub.gotCase = true;
        bc.taken = true;
        state.player.heat = Math.max(state.player.heat, 80);
        state.player.wanted = 4;
        if (state.onEvent) state.onEvent('case');
      }
      if (state.mission.sub.gotCase) {
        const sh = state.city.safehouse;
        const cx = sh.x + sh.w / 2;
        const cy = sh.y + sh.h / 2;
        if (near(p.x, p.y, cx, cy, 130)) return true;
      }
      return false;
    },
  },
];

export function startMission(state, index) {
  state.mission.index = index;
  state.mission.sub = {};
  state.mission.startedAt = state.time;
  if (MISSION_DEFS[index]) MISSION_DEFS[index].start(state);
  if (state.onEvent) state.onEvent('mission-start');
}

export function currentObjective(state) {
  const def = MISSION_DEFS[state.mission.index];
  if (!def) return 'Free roam — Port Meridian is yours';
  return def.title + ': ' + def.objective;
}

// Thugs chase and punch; guards hold the pier and shoot.
export function stepMissionActors(state, dt) {
  const p = state.player;
  for (const t of state.thugs) {
    if (t.hp <= 0) continue;
    const d = Math.sqrt(dist2(t.x, t.y, p.x, p.y));
    const a = Math.atan2(p.y - t.y, p.x - t.x);
    t.angle = a;
    if (d > 30) {
      t.x += Math.cos(a) * t.speed * dt;
      t.y += Math.sin(a) * t.speed * dt;
    } else {
      t.punchT -= dt;
      if (t.punchT <= 0) {
        t.punchT = 0.9;
        p.hp -= 8;
        state.shake = Math.min(10, state.shake + 3);
        if (state.onEvent) state.onEvent('hurt');
      }
    }
  }
  for (const g of state.guards) {
    if (g.hp <= 0) continue;
    const d = Math.sqrt(dist2(g.x, g.y, p.x, p.y));
    g.angle = Math.atan2(p.y - g.y, p.x - g.x);
    g.shootT -= dt;
    if (d < 380 && g.shootT <= 0) {
      g.shootT = 1.4;
      const a = Math.atan2(p.y - g.y, p.x - g.x) + (state.rng() - 0.5) * 0.14;
      state.bullets.push(makeBullet(g.x, g.y, a, 420, 'guard'));
      if (state.onEvent) state.onEvent('gunshot');
    }
  }
  state.thugs = state.thugs.filter((t) => t.hp > 0);
  state.guards = state.guards.filter((g) => g.hp > 0);
}

export function missionPayout(index) {
  return MISSION_PAYOUTS[index] || 0;
}
