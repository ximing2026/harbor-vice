// The game's rules and state, with no drawing and no browser in it: the
// player on foot and in cars, traffic, police, wanted level, missions,
// pickups and effects. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react (sound, screens) without
// the world knowing about screens or sound. The world owns the city and
// the mission machine.
import { CAR, GRID, MONEY, PEDS, PLAYER, TRAFFIC, VIEW, WANTED, WORLD } from './config.js';
import { createCity, roadCenter } from './city.js';
import { makeCar, makePed } from './entities.js';
import { updateMission, startMission } from './missions.js';
import { spawnCopCar, spawnFootCop, stepCopCar, stepFootCop, wantedCopCars } from './police.js';
import { createPeds, createTraffic, stepPeds, stepTraffic } from './traffic.js';
import { range } from './random.js';

export const EVENT_MISSION_DONE = 1;
export const EVENT_BUSTED = 2;
export const EVENT_WASTED = 4;
export const EVENT_CRASH = 8;
export const EVENT_SHOT = 16;
export const EVENT_PUNCH = 32;
export const EVENT_PICKUP = 64;
export const EVENT_STAR_UP = 128;
export const EVENT_STEAL = 256;
export const EVENT_GAME_DONE = 512;
export const EVENT_HIT = 1024;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(random) {
  const city = createCity(random);
  const state = {
    city,
    time: 0, money: MONEY.start, wanted: 0, wantedTimer: 0, unseenTimer: 0,
    player: null, cars: [], traffic: [], copCars: [], footCops: [], peds: [],
    pickups: [], bullets: [], particles: [], skids: [],
    camera: { x: 0, y: 0 }, shake: 0, pickupTimer: 5,
    mission: null, marker: null, objective: '', toast: null, gameComplete: false,
    stats: { missionsDone: 0, carsStolen: 0, pedsHit: 0, shotsFired: 0, timePlayed: 0 },
  };

  function makePlayer(x, y) {
    return {
      x, y, angle: -Math.PI / 2, health: PLAYER.health, ammo: 0, armed: false,
      inCar: false, car: null, punchTimer: 0, shootTimer: 0, enterCooldown: 0,
      hurtTimer: 0, walkPhase: 0,
    };
  }

  function addParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const v = range(random, speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: range(random, life * 0.5, life), maxLife: life, size: range(random, size * 0.6, size * 1.4), color });
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
  }

  function addPickup(kind, x, y, value) {
    state.pickups.push({ kind, x, y, value, timer: 25, bob: random() * Math.PI * 2 });
  }

  function gainWanted(n) {
    if (state.wanted >= WANTED.max) return 0;
    const before = state.wanted;
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.unseenTimer = 0;
    return state.wanted > before ? EVENT_STAR_UP : 0;
  }

  function setWanted(level, force) {
    if (force || level > state.wanted) {
      state.wanted = clamp(level, 0, WANTED.max);
      state.unseenTimer = 0;
    }
  }

  function damageCar(car, amount, events) {
    if (!car.active || car.health <= 0) return events;
    car.health -= amount;
    if (car.health <= 0) {
      car.health = 0;
      car.active = false;
      addParticles(car.x, car.y, 26, '#ff7b2f', 260, 0.9, 6);
      addParticles(car.x, car.y, 18, '#3a3f4a', 120, 1.4, 9);
      state.shake = Math.max(state.shake, 10);
      events |= EVENT_CRASH;
      if (state.player.car === car) {
        // The player's ride blew up under them.
        state.player.inCar = false;
        state.player.car = null;
        state.player.health -= 25;
        state.player.x = car.x + 40;
        state.player.y = car.y;
      }
    }
    return events;
  }

  function spawnPlayerCar(kind, x, y, angle) {
    const car = makeCar(random, kind, x, y, angle);
    car.driver = 'parked';
    state.cars.push(car);
    return car;
  }

  /** Put the mission-2 target car back at the plaza after it was wrecked. */
  function spawnParkedCar(target) {
    const citySpot = city.parkedCars.find((c) => c.target);
    if (!citySpot) return null;
    const car = makeCar(random, 'sports', citySpot.x, citySpot.y, citySpot.angle);
    car.target = true;
    car.driver = 'parked';
    state.cars.push(car);
    return car;
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of [...state.cars, ...state.traffic]) {
      if (!car.active || car.driver === 'cop') continue;
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function stealCar(car, events) {
    const p = state.player;
    if (car.driver === 'traffic') {
      // Pull the driver out onto the sidewalk; they run for it.
      const driver = makePed(random, car.x + 34, car.y + 10, 'driver');
      driver.state = 'flee';
      driver.tx = car.x + 300;
      driver.ty = car.y - 200;
      state.peds.push(driver);
      const idx = state.traffic.indexOf(car);
      if (idx >= 0) state.traffic.splice(idx, 1);
      state.cars.push(car);
      state.stats.carsStolen += 1;
      events |= EVENT_STEAL | gainWanted(WANTED.stealCar);
    } else if (car.driver === 'parked' && !car.own && !car.missionVan) {
      // A parked car with an owner: taking it is still theft, and the heat
      // rises for it exactly as it does for a car pulled from traffic.
      state.stats.carsStolen += 1;
      events |= EVENT_STEAL | gainWanted(WANTED.stealCar);
    }
    car.driver = 'player';
    p.inCar = true;
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    return events;
  }

  function exitCar() {
    const p = state.player;
    if (!p.car) return;
    const car = p.car;
    car.driver = 'parked';
    car.speed = 0;
    p.inCar = false;
    p.car = null;
    const nx = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    const ny = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    const fixed = city.collide(nx, ny, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    p.angle = car.angle;
  }

  function stepPlayerOnFoot(dt, input) {
    const p = state.player;
    let events = 0;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const fixed = city.collide(p.x + mx * speed * dt, p.y + my * speed * dt, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      p.angle = Math.atan2(my, mx);
      p.walkPhase += dt * speed * 0.06;
    }
    if (p.punchTimer > 0) p.punchTimer -= dt;
    if (p.shootTimer > 0) p.shootTimer -= dt;
    if (p.hurtTimer > 0) p.hurtTimer -= dt;

    if (input.punch && p.punchTimer <= 0) {
      p.punchTimer = PLAYER.punchCooldown;
      events |= EVENT_PUNCH;
      const px = p.x + Math.cos(p.angle) * 22;
      const py = p.y + Math.sin(p.angle) * 22;
      for (const ped of state.peds) {
        if (!ped.active || ped.down > 0) continue;
        const d = Math.hypot(ped.x - px, ped.y - py);
        if (d < PLAYER.punchRange) {
          ped.health -= PLAYER.punchDamage;
          ped.x += Math.cos(p.angle) * 18;
          ped.y += Math.sin(p.angle) * 18;
          addParticles(ped.x, ped.y, 6, '#ffd94a', 160, 0.4, 4);
          if (ped.health <= 0) {
            ped.down = ped.role === 'walker' ? 4 : 8;
            ped.state = 'down';
            if (ped.role === 'walker') events |= gainWanted(1);
            if (random() < 0.5) addPickup('cash', ped.x, ped.y, 25);
          } else if (ped.role === 'thug' || ped.role === 'guard' || ped.role === 'cop') {
            ped.state = 'chase';
          }
        }
      }
      // Punching a cop car is a bad idea, but it happens: dent it, raise heat.
      for (const car of state.copCars) {
        if (car.active && Math.hypot(car.x - px, car.y - py) < 40) {
          events |= gainWanted(WANTED.ramCop);
          break;
        }
      }
      // Foot cops can be punched down like anyone else.
      for (const cop of state.footCops) {
        if (!cop.active || cop.down > 0) continue;
        if (Math.hypot(cop.x - px, cop.y - py) < PLAYER.punchRange) {
          cop.health -= PLAYER.punchDamage;
          if (cop.health <= 0) {
            cop.down = 8;
            cop.state = 'down';
            events |= gainWanted(WANTED.killCop);
          }
        }
      }
    }

    if (input.shoot && p.armed && p.ammo > 0 && p.shootTimer <= 0) {
      p.shootTimer = PLAYER.shootCooldown;
      p.ammo -= 1;
      state.stats.shotsFired += 1;
      const aim = Math.atan2(input.aimY - p.y, input.aimX - p.x);
      p.angle = aim;
      state.bullets.push({ x: p.x + Math.cos(aim) * 20, y: p.y + Math.sin(aim) * 20, vx: Math.cos(aim) * PLAYER.bulletSpeed, vy: Math.sin(aim) * PLAYER.bulletSpeed, from: 'player', life: 0.9 });
      addParticles(p.x + Math.cos(aim) * 26, p.y + Math.sin(aim) * 26, 3, '#ffd94a', 120, 0.15, 3);
      events |= EVENT_SHOT | gainWanted(0); // shooting itself is not the crime; hitting someone is
    }

    if (input.enter && p.enterCooldown <= 0) {
      const car = nearestCar(p.x, p.y, 52);
      if (car) {
        events = stealCar(car, events);
        p.enterCooldown = 0.5;
      }
    }
    if (p.enterCooldown > 0) p.enterCooldown -= dt;
    return events;
  }

  function stepDriving(dt, input) {
    const p = state.player;
    const car = p.car;
    let events = 0;
    const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dirSign = car.speed >= 0 ? 1 : -1;
    car.angle += steer * CAR.turn * dt * Math.min(1, Math.abs(car.speed) / 160) * dirSign;
    if (throttle > 0) car.speed += CAR.accel * dt;
    else if (throttle < 0) {
      car.speed -= (car.speed > 20 ? CAR.brake : CAR.accel * 0.6) * dt;
    } else {
      car.speed -= Math.sign(car.speed) * 120 * dt;
      if (Math.abs(car.speed) < 6) car.speed = 0;
    }
    car.speed = clamp(car.speed, -CAR.reverseMax, car.maxSpeed);
    const hx = Math.cos(car.angle);
    const hy = Math.sin(car.angle);
    const k = 1 - Math.exp(-CAR.grip * dt);
    car.vx += (hx * car.speed - car.vx) * k;
    car.vy += (hy * car.speed - car.vy) * k;
    const prevX = car.x;
    const prevY = car.y;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    const fixed = city.collide(car.x, car.y, CAR.radius);
    if (fixed.x !== car.x || fixed.y !== car.y) {
      const impact = Math.hypot(car.vx, car.vy);
      car.x = fixed.x;
      car.y = fixed.y;
      if (impact > 260) {
        events = damageCar(car, impact * 0.09, events);
        state.shake = Math.max(state.shake, 6);
        events |= EVENT_CRASH;
      }
      car.vx *= 0.4;
      car.vy *= 0.4;
      car.speed *= 0.5;
    }
    // Skid marks on hard turns at speed.
    if (Math.abs(steer) > 0.4 && Math.abs(car.speed) > 260) {
      state.skids.push({ x1: prevX - hy * 10, y1: prevY + hx * 10, x2: car.x - hy * 10, y2: car.y + hx * 10, life: 6 });
      state.skids.push({ x1: prevX + hy * 10, y1: prevY - hx * 10, x2: car.x + hy * 10, y2: car.y - hx * 10, life: 6 });
      if (state.skids.length > 300) state.skids.splice(0, state.skids.length - 300);
    }
    // Smoke and fire as the car takes damage.
    if (car.health < 45 && random() < dt * 8) {
      addParticles(car.x - hx * 14, car.y - hy * 14, 1, car.health < 20 ? '#ff7b2f' : '#5a5a5a', 40, 0.8, 5);
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (input.enter && p.enterCooldown <= 0) {
      exitCar();
      p.enterCooldown = 0.5;
    }
    if (p.enterCooldown > 0) p.enterCooldown -= dt;
    return events;
  }

  function collideCars(dt, events) {
    const all = [...state.cars, ...state.traffic, ...state.copCars];
    for (let i = 0; i < all.length; i += 1) {
      const a = all[i];
      if (!a.active) continue;
      for (let j = i + 1; j < all.length; j += 1) {
        const b = all[j];
        if (!b.active) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = 42;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const rel = Math.abs((a.vx || 0) - (b.vx || 0)) + Math.abs((a.vy || 0) - (b.vy || 0));
          if (rel > 200) {
            events = damageCar(a, rel * 0.05, events);
            events = damageCar(b, rel * 0.05, events);
            if (a === state.player.car || b === state.player.car) {
              state.shake = Math.max(state.shake, 5);
              events |= EVENT_CRASH;
              if ((a.driver === 'cop' || b.driver === 'cop') && (a === state.player.car || b === state.player.car)) {
                events |= gainWanted(WANTED.ramCop);
              }
            }
          }
          // Exchange a little speed so the shove reads.
          const tmpVx = a.vx || 0;
          const tmpVy = a.vy || 0;
          a.vx = (b.vx || 0) * 0.4;
          a.vy = (b.vy || 0) * 0.4;
          b.vx = tmpVx * 0.4;
          b.vy = tmpVy * 0.4;
          if (a.driver === 'traffic' && Math.abs(a.speed || 0) > 30) a.speed = (a.speed || 0) * 0.5;
          if (b.driver === 'traffic' && Math.abs(b.speed || 0) > 30) b.speed = (b.speed || 0) * 0.5;
        }
      }
    }
    return events;
  }

  function stepBullets(dt, events) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      // Buildings stop bullets.
      let hitWall = false;
      for (const bd of city.buildings) {
        if (b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h) { hitWall = true; break; }
      }
      if (hitWall || b.x < WORLD.minX || b.x > WORLD.maxX || b.y < WORLD.minY || b.y > WORLD.maxY + WORLD.waterH) {
        b.life = 0;
        addParticles(b.x, b.y, 3, '#d8d2c2', 90, 0.25, 3);
        continue;
      }
      if (b.from === 'player') {
        for (const ped of state.peds) {
          if (!ped.active || ped.down > 0) continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 15) {
            b.life = 0;
            ped.health -= PLAYER.bulletDamage;
            addParticles(ped.x, ped.y, 6, '#ff5a4a', 140, 0.4, 4);
            if (ped.health <= 0) {
              ped.down = ped.role === 'walker' ? 4 : 8;
              ped.state = 'down';
              if (ped.role === 'walker') events |= gainWanted(1);
              if (ped.role === 'cop') events |= gainWanted(WANTED.killCop);
              if (random() < 0.5) addPickup('cash', ped.x, ped.y, 25);
            } else if (ped.role === 'thug' || ped.role === 'guard' || ped.role === 'cop') {
              ped.state = 'chase';
            }
            break;
          }
        }
        if (b.life > 0) {
          for (const car of [...state.copCars, ...state.traffic]) {
            if (!car.active) continue;
            if (Math.hypot(car.x - b.x, car.y - b.y) < 26) {
              b.life = 0;
              events = damageCar(car, 12, events);
              if (car.driver === 'cop') events |= gainWanted(1);
              addParticles(b.x, b.y, 4, '#ffd94a', 160, 0.3, 3);
              break;
            }
          }
        }
      } else {
        const p = state.player;
        if (!p.inCar && Math.hypot(p.x - b.x, p.y - b.y) < 14 && p.hurtTimer <= 0) {
          b.life = 0;
          p.health -= 10;
          p.hurtTimer = 0.4;
          addParticles(p.x, p.y, 6, '#ff5a4a', 140, 0.4, 4);
          events |= EVENT_HIT;
        }
        if (p.inCar && p.car && Math.hypot(p.car.x - b.x, p.car.y - b.y) < 26) {
          b.life = 0;
          events = damageCar(p.car, 6, events);
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    return events;
  }

  function stepEnemies(dt, events) {
    const p = state.player;
    for (const ped of state.peds) {
      if (!ped.active || ped.down > 0) continue;
      if (ped.role !== 'thug' && ped.role !== 'guard' && ped.role !== 'cop') continue;
      if (ped.state !== 'chase') continue;
      const dx = p.x - ped.x;
      const dy = p.y - ped.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 900) { ped.state = 'walk'; continue; }
      ped.angle = Math.atan2(dy, dx);
      const speed = ped.role === 'guard' ? 205 : 185;
      if (dist > 30) {
        const next = city.collide(ped.x + Math.cos(ped.angle) * speed * dt, ped.y + Math.sin(ped.angle) * speed * dt, 10);
        ped.x = next.x;
        ped.y = next.y;
      } else if (!p.inCar) {
        // Close enough to swing at the player.
        ped.attackTimer -= dt;
        if (ped.attackTimer <= 0) {
          ped.attackTimer = 0.9;
          p.health -= ped.role === 'guard' ? 10 : 8;
          p.hurtTimer = 0.3;
          addParticles(p.x, p.y, 5, '#ff5a4a', 120, 0.35, 4);
          events |= EVENT_HIT;
        }
      }
      if (ped.role === 'guard' && !p.inCar && dist < 420 && dist > 60) {
        ped.shootTimer -= dt;
        if (ped.shootTimer <= 0) {
          ped.shootTimer = range(random, 1.0, 1.8);
          const aim = Math.atan2(dy, dx) + range(random, -0.09, 0.09);
          state.bullets.push({ x: ped.x + Math.cos(aim) * 18, y: ped.y + Math.sin(aim) * 18, vx: Math.cos(aim) * 720, vy: Math.sin(aim) * 720, from: 'guard', life: 1.1 });
          addParticles(ped.x + Math.cos(aim) * 24, ped.y + Math.sin(aim) * 24, 3, '#ffd94a', 120, 0.15, 3);
        }
      }
    }
    return events;
  }

  function stepCarVsPed(dt, events) {
    const drivers = [...state.cars, ...state.traffic, ...state.copCars].filter((c) => c.active);
    for (const car of drivers) {
      const speed = Math.hypot(car.vx || 0, car.vy || 0) || Math.abs(car.speed || 0);
      if (speed < 70) continue;
      for (const ped of state.peds) {
        if (!ped.active || ped.down > 0) continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < 28) {
          ped.down = 4;
          ped.state = 'down';
          ped.health -= 40;
          ped.x += Math.cos(Math.atan2(ped.y - car.y, ped.x - car.x)) * 26;
          ped.y += Math.sin(Math.atan2(ped.y - car.y, ped.x - car.x)) * 26;
          addParticles(ped.x, ped.y, 8, '#ff5a4a', 160, 0.5, 4);
          state.stats.pedsHit += 1;
          if (car === state.player.car) events |= gainWanted(WANTED.hitPed);
        }
      }
      // A fast car can also run the player down.
      const p = state.player;
      if (!p.inCar && car !== p.car && Math.hypot(p.x - car.x, p.y - car.y) < 26 && p.hurtTimer <= 0) {
        p.health -= 14;
        p.hurtTimer = 0.6;
        p.x += Math.cos(Math.atan2(p.y - car.y, p.x - car.x)) * 30;
        p.y += Math.sin(Math.atan2(p.y - car.y, p.x - car.x)) * 30;
        addParticles(p.x, p.y, 6, '#ff5a4a', 140, 0.4, 4);
        events |= EVENT_HIT;
      }
    }
    return events;
  }

  function stepWanted(dt, events) {
    if (state.wanted === 0) return events;
    // Are the police on you right now?
    let seen = false;
    for (const car of state.copCars) {
      if (car.active && Math.hypot(car.x - state.player.x, car.y - state.player.y) < 520) { seen = true; break; }
    }
    if (!seen) {
      for (const cop of state.footCops) {
        if (cop.active && cop.down <= 0 && Math.hypot(cop.x - state.player.x, cop.y - state.player.y) < 320) { seen = true; break; }
      }
    }
    if (seen) {
      state.unseenTimer = 0;
    } else {
      state.unseenTimer += dt;
      if (state.unseenTimer > WANTED.decayDelay) {
        state.wantedTimer += dt;
        if (state.wantedTimer >= WANTED.decayInterval) {
          state.wantedTimer = 0;
          state.unseenTimer = WANTED.decayDelay;
          state.wanted -= 1;
        }
      }
    }
    // Keep the right number of cop cars on the road.
    const want = wantedCopCars(state.wanted);
    while (state.copCars.filter((c) => c.active).length < want) {
      const car = spawnCopCar(city, random, state.player, 340);
      car.wantedLevel = state.wanted;
      state.copCars.push(car);
    }
    // Foot cops when the player is on foot and the heat is on.
    if (!state.player.inCar && state.wanted >= 2) {
      const active = state.footCops.filter((c) => c.active && c.down <= 0).length;
      if (active < (state.wanted >= 4 ? 2 : 1)) {
        state.footCops.push(spawnFootCop(city, random, state.player));
      }
    }
    return events;
  }

  function stepPickups(dt, events) {
    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) {
      state.pickupTimer = range(random, 6, 10);
      if (state.pickups.length < 6) {
        const p = city.randomSidewalkPoint(random);
        const roll = random();
        addPickup(roll < 0.45 ? 'cash' : roll < 0.75 ? 'health' : 'ammo', p.x, p.y, roll < 0.45 ? Math.floor(range(random, 25, 80)) : roll < 0.75 ? 25 : 24);
      }
    }
    const p = state.player;
    for (const pk of state.pickups) {
      pk.timer -= dt;
      pk.bob += dt * 3;
      if (Math.hypot(pk.x - p.x, pk.y - p.y) < 30) {
        pk.timer = 0;
        if (pk.kind === 'cash') state.money += pk.value;
        else if (pk.kind === 'health') p.health = Math.min(PLAYER.health, p.health + pk.value);
        else if (pk.kind === 'ammo') { p.armed = true; p.ammo += pk.value; }
        events |= EVENT_PICKUP;
      }
    }
    state.pickups = state.pickups.filter((pk) => pk.timer > 0);
    return events;
  }

  function respawn(reason) {
    const p = state.player;
    const fine = reason === 'busted' ? MONEY.bustedFine : MONEY.wastedFine;
    state.money = Math.max(0, state.money - fine);
    state.wanted = 0;
    state.unseenTimer = 0;
    state.wantedTimer = 0;
    state.copCars = [];
    state.footCops = [];
    state.bullets = [];
    p.health = PLAYER.health;
    p.inCar = false;
    p.car = null;
    const fixed = city.collide(city.safehouse.x + 40, city.safehouse.y + 110, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    p.angle = -Math.PI / 2;
    // The mission restarts from its beginning.
    if (state.mission && state.mission.index < 5) startMission(world, state.mission.index);
  }

  function reset(newGame) {
    state.time = 0;
    state.money = MONEY.start;
    state.wanted = 0;
    state.unseenTimer = 0;
    state.wantedTimer = 0;
    state.cars = [];
    state.traffic = [];
    state.copCars = [];
    state.footCops = [];
    state.peds = [];
    state.pickups = [];
    state.bullets = [];
    state.particles = [];
    state.skids = [];
    state.gameComplete = false;
    state.toast = null;
    state.mission = null;
    state.marker = null;
    state.objective = '';
    state.stats = { missionsDone: 0, carsStolen: 0, pedsHit: 0, shotsFired: 0, timePlayed: 0 };
    state.player = makePlayer(city.safehouse.x + 40, city.safehouse.y + 110);
    // The player's own sedan waits on the road just south of the safehouse.
    // It used to sit in the courier van's exit lane, 20px from the van, and
    // wedge it against the home's east wall so the first mission could not
    // even start.
    const sedan = spawnPlayerCar('sedan', city.safehouse.x + 40, city.safehouse.y + 204, 0);
    sedan.own = true;
    // The mission target car sits at the plaza.
    spawnParkedCar(true);
    // The rest of the parked cars from the city plan.
    for (const pc of city.parkedCars) {
      if (pc.target) continue;
      const car = makeCar(random, pc.model, pc.x, pc.y, pc.angle);
      car.color = pc.color;
      car.driver = 'parked';
      state.cars.push(car);
    }
    state.traffic = createTraffic(city, random, TRAFFIC.count);
    state.peds = createPeds(city, random, PEDS.count);
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    if (newGame) startMission(world, 0);
  }

  function step(dt, input, opts = {}) {
    let events = 0;
    const harmless = !!opts.harmless;
    state.time += dt;
    const p = state.player;

    if (!harmless) {
      if (p.inCar && p.car && p.car.active) events |= stepDriving(dt, input);
      else if (p.inCar && p.car && !p.car.active) { p.inCar = false; p.car = null; }
      else events |= stepPlayerOnFoot(dt, input);
      if (p.health <= 0) {
        events |= EVENT_WASTED;
        respawn('wasted');
        return events;
      }
      events |= stepEnemies(dt, events);
      events |= stepBullets(dt, events);
      events |= collideCars(dt, events);
      events |= stepCarVsPed(dt, events);
      events |= stepWanted(dt, events);
      events |= stepPickups(dt, events);
      // Foot cops make the arrest — but only while the heat is on.
      if (state.wanted > 0 && !p.inCar) {
        for (const cop of state.footCops) {
          if (!cop.active || cop.down > 0) continue;
          if (stepFootCop(dt, city, cop, p, random)) {
            events |= EVENT_BUSTED;
            respawn('busted');
            return events;
          }
        }
      }
      // Once the heat is gone, no foot cop stays on the street: the whole
      // foot-cop list goes, not just the downed ones.
      if (state.wanted === 0) state.footCops = [];
      else state.footCops = state.footCops.filter((c) => c.active && c.down <= 0);
      const missionResult = updateMission(world, dt);
      if (missionResult === 'done') {
        events |= EVENT_MISSION_DONE;
        if (state.gameComplete) events |= EVENT_GAME_DONE;
      }
      state.stats.timePlayed += dt;
    }

    // Traffic and pedestrians keep the city alive on every screen.
    stepTraffic(dt, city, state.traffic, p.car && p.car.active ? p.car : null, { x: p.x, y: p.y }, random);
    const danger = [];
    for (const b of state.bullets) danger.push({ x: b.x, y: b.y, radius: 130 });
    if (p.car && Math.abs(p.car.speed || 0) > 300) danger.push({ x: p.car.x, y: p.car.y, radius: 120 });
    for (const pt of state.particles) {
      if (pt.color === '#ff7b2f') danger.push({ x: pt.x, y: pt.y, radius: 150 });
    }
    stepPeds(dt, city, state.peds, danger, random);

    // Particles and skid marks fade.
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - 2 * dt;
      pt.vy *= 1 - 2 * dt;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const s of state.skids) s.life -= dt;
    state.skids = state.skids.filter((s) => s.life > 0);
    if (state.toast) {
      state.toast.timer -= dt;
      if (state.toast.timer <= 0) state.toast = null;
    }

    // Cop cars hunt, even on the title backdrop.
    for (const car of state.copCars) {
      if (!car.active) continue;
      stepCopCar(dt, city, car, p, p.car && p.car.active ? p.car : null);
    }
    state.copCars = state.copCars.filter((c) => c.active && Math.hypot(c.x - p.x, c.y - p.y) < 1600);

    // Camera follows the player, eased, clamped to the world.
    const tx = clamp(p.x, VIEW.width / 2 - 80, WORLD.maxX - VIEW.width / 2 + 80);
    const ty = clamp(p.y, VIEW.height / 2 - 80, WORLD.maxY + WORLD.waterH - VIEW.height / 2);
    const ck = 1 - Math.exp(-4 * dt);
    state.camera.x += (tx - state.camera.x) * ck;
    state.camera.y += (ty - state.camera.y) * ck;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    return events;
  }

  const world = {
    state, city, random,
    reset, step, respawn,
    spawnPlayerCar, spawnParkedCar, addPickup, setWanted, gainWanted,
  };
  reset(true);
  return world;
}
