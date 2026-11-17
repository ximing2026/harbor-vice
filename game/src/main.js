// Boot and the one loop for HARBOR VICE: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast one),
// and the renderer paints what is there. The game moves between six screens:
// title, play, paused, busted, wasted and complete.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BUSTED, EVENT_CRASH, EVENT_GAME_DONE, EVENT_HIT, EVENT_MISSION_DONE,
  EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, EVENT_STAR_UP, EVENT_STEAL, EVENT_WASTED,
} from './world.js';
import { SoundFX } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_NEW_GAME, ACTION_PAUSE, ACTION_PUNCH,
  ACTION_QUIT, ACTION_RESTART_MISSION, createInput,
} from './input.js';
import {
  createRenderer,
  SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED,
} from './render.js';
import { stageShot } from './shots.js';
import { clearSave, loadSave, writeSave } from './save.js';
import { missionBriefing, startMission } from './missions.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const sfx = new SoundFX();

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { hasSave: false, saveText: '', showControls: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = loadSave();
  let muted = false;
  let accumulator = 0;
  let last = performance.now();

  window.__harborVice = {
    state: world.state,
    world,
    get screen() { return screen; },
  };

  // Screen readers (and anyone watching the page's text) hear screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function applySave() {
    if (!save) return;
    const s = world.state;
    s.money = save.money;
    s.stats.missionsDone = save.missionsDone;
    s.stats.carsStolen = save.carsStolen;
    if (save.missionIndex > 0 && save.missionIndex < 5) startMission(world, save.missionIndex);
  }

  function startGame(fromSave) {
    world.reset(true);
    if (fromSave) applySave();
    else {
      save = null;
      clearSave();
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    sfx.unlock();
    sfx.startMusic();
    const briefing = missionBriefing(world.state.mission ? world.state.mission.index : 0);
    announce(`Playing. ${briefing}`);
  }

  function toTitle() {
    writeSave(world);
    save = loadSave();
    world.reset(false);
    screen = SCREEN_TITLE;
    announce('Harbor Vice. Press Enter or click to start.');
  }

  function handleEvents(events) {
    if (events & EVENT_MISSION_DONE) {
      sfx.missionDone();
      writeSave(world);
    }
    if (events & EVENT_GAME_DONE) {
      screen = SCREEN_COMPLETE;
      announce('All five jobs done. Port Meridian is yours.');
      writeSave(world);
    }
    if (events & EVENT_BUSTED) {
      sfx.busted();
      screen = SCREEN_BUSTED;
      announce('Busted. The police caught you.');
    }
    if (events & EVENT_WASTED) {
      sfx.busted();
      screen = SCREEN_WASTED;
      announce('Wasted.');
    }
    if (events & EVENT_CRASH) sfx.crash();
    if (events & EVENT_SHOT) sfx.shot();
    if (events & EVENT_PUNCH) sfx.punch();
    if (events & EVENT_PICKUP) sfx.pickup();
    if (events & EVENT_STAR_UP) sfx.sirenBlip();
    if (events & EVENT_STEAL) sfx.click();
    if (events & EVENT_HIT) sfx.tone(180, 90, 120, 'sine', 0.15);
  }

  function step() {
    const actions = input.takeActions();
    const mouse = input.mouse();
    const aim = renderer.toWorld(mouse.x, mouse.y, world.state.camera);
    const gameInput = {
      up: input.up(), down: input.down(), left: input.left(), right: input.right(),
      run: input.run(),
      punch: !!(actions & ACTION_PUNCH),
      shoot: mouse.down,
      enter: !!(actions & ACTION_ENTER),
      aimX: aim.x, aimY: aim.y,
    };
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_NEW_GAME) {
        startGame(false);
        return;
      }
      if (actions & ACTION_CONFIRM) {
        startGame(!!save);
        return;
      }
      world.step(STEP, gameInput, { harmless: true });
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_RESTART_MISSION) {
        const idx = world.state.mission ? world.state.mission.index : 0;
        startMission(world, Math.min(idx, 4));
        screen = SCREEN_PLAY;
        announce('Mission restarted.');
      } else if (actions & ACTION_QUIT) {
        toTitle();
      }
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_COMPLETE) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Free roam. Port Meridian is yours.');
      }
      return;
    }
    // SCREEN_PLAY
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    const events = world.step(STEP, gameInput, {});
    handleEvents(events);
    const p = world.state.player;
    sfx.setEngine(p.inCar && p.car ? Math.abs(p.car.speed || 0) / 600 : 0);
    sfx.setSiren(world.state.wanted > 0);
    sfx.sirenStep(world.state.time);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      step();
      accumulator -= STEP;
      if (screen !== SCREEN_PLAY && screen !== SCREEN_TITLE) {
        accumulator = 0;
        break;
      }
    }
    const ui = {
      hasSave: !!save,
      saveText: save ? `mission ${save.missionIndex + 1} of 5 · $${save.money}` : '',
      showControls: screen === SCREEN_PLAY && world.state.stats.timePlayed < 25,
    };
    renderer.draw(world.state, screen, ui);
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM' && !event.repeat) {
      muted = sfx.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Harbor Vice. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
