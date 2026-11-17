// Save and load for HARBOR VICE: mission progress, money and lifetime stats
// in localStorage, so a visit can pick up where the last one left off.
// Storage can be off (private windows): then the game just plays unsaved.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      missionIndex: typeof data.missionIndex === 'number' ? data.missionIndex : 0,
      money: typeof data.money === 'number' ? data.money : 150,
      missionsDone: typeof data.missionsDone === 'number' ? data.missionsDone : 0,
      carsStolen: typeof data.carsStolen === 'number' ? data.carsStolen : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(world) {
  try {
    const s = world.state;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      missionIndex: s.mission ? s.mission.index : 0,
      money: s.money,
      missionsDone: s.stats.missionsDone,
      carsStolen: s.stats.carsStolen,
    }));
  } catch {
    // Unsaved play is still play.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
