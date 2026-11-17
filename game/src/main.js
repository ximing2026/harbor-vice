// Harbor Vice — boot, fixed-step loop, screens, audio wiring, debug handle.
import { STEP, VIEW_W, VIEW_H, WORLD, WORLD_H } from './config.js';
import { createWorld, stepWorld, respawnPlayer } from './world.js';
import { render, buildMinimap } from './render.js';
import { createInput, attachInput, clearEdges } from './input.js';
import { loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';
import {
  unlockAudio, engineStart, engineSet, bassStart, playGunshot, playCrash,
  playSiren, playJingle, toggleMute, audioStopAll,
} from './audio.js';
import { clamp } from './random.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotSeed = parseInt(params.get('seed') || '20261117', 10) || 20261117;

const input = createInput();
attachInput(input, canvas);

let state;
let shotMode = false;

if (shotName) {
  const staged = stageShot(shotName, shotSeed);
  state = staged.state;
  state.screen = staged.screen;
  shotMode = true;
} else {
  const save = loadSave();
  state = createWorld(20261117, save);
  state.saveInfo = save;
  state.screen = 'title';
}
state.minimap = buildMinimap(state.city);
state.aiming = false;

function onEvent(kind) {
  if (kind === 'gunshot') playGunshot();
  else if (kind === 'crash' || kind === 'explosion') playCrash();
  else if (kind === 'mission' || kind === 'case') playJingle('mission');
  else if (kind === 'complete') playJingle('complete');
  else if (kind === 'busted' || kind === 'wasted') playJingle('bad');
  else if (kind === 'pickup') playJingle('pickup');
}
state.onEvent = onEvent;

function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
  canvas.style.height = Math.floor(VIEW_H * scale) + 'px';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function camera() {
  const p = state.player;
  return {
    x: clamp(p.x - VIEW_W / 2, 0, Math.max(0, WORLD - VIEW_W)),
    y: clamp(p.y - VIEW_H / 2, 0, Math.max(0, WORLD_H - VIEW_H)),
  };
}

function updateAim() {
  const rect = canvas.getBoundingClientRect();
  const sx = (input.mouseX * VIEW_W) / Math.max(1, rect.width);
  const sy = (input.mouseY * VIEW_H) / Math.max(1, rect.height);
  const cam = camera();
  input.aimX = cam.x + sx;
  input.aimY = cam.y + sy;
  state.aiming = !state.player.onFoot ? false : true;
}

function saveNow() {
  writeSave({
    missionIndex: state.mission.index,
    money: state.player.money,
    carsStolen: state.stats.carsStolen,
    missionsDone: state.stats.missionsDone,
  });
}

function startAudio() {
  unlockAudio();
  engineStart();
  bassStart();
}

function handleScreens() {
  if (input.mute) {
    toggleMute();
  }
  if (state.screen === 'title') {
    if (input.enter) {
      startAudio();
      state.screen = 'play';
    }
  } else if (state.screen === 'play') {
    if (input.pause) {
      state.screen = 'pause';
      saveNow();
    }
  } else if (state.screen === 'pause') {
    if (input.pause || input.enter) state.screen = 'play';
  } else if (state.screen === 'busted' || state.screen === 'wasted') {
    if (input.enter) {
      respawnPlayer(state);
      state.screen = 'play';
    }
  } else if (state.screen === 'complete') {
    if (input.enter) state.screen = 'play';
  }
}

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (shotMode) {
    render(state, ctx, state.screen);
    return;
  }
  updateAim();
  handleScreens();
  if (state.screen === 'play') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      stepWorld(state, input, STEP);
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0;
    const car = state.playerCar;
    engineSet(!!car, car ? Math.abs(car.speed) / car.maxSpeed : 0);
    playSiren(state.player.wanted > 0);
  } else {
    engineSet(false, 0);
    playSiren(false);
  }
  render(state, ctx, state.screen);
  clearEdges(input);
}

window.__harborVice = {
  state,
  stepWorld,
  createWorld,
  version: 1,
};

requestAnimationFrame(frame);
