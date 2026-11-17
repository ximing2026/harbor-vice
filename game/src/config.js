// Harbor Vice — tuning, palette and world layout constants.
export const STEP = 1 / 60;
export const PITCH = 200; // distance between neighbouring road centrelines
export const ROAD = 64; // road width
export const STREETS = 9; // roads each way
export const WORLD = STREETS * PITCH; // 1800: city square
export const HARBOUR_TOP = WORLD; // water starts here
export const WORLD_H = WORLD + 220; // harbour strip below the city

export const START_MONEY = 150;
export const VIEW_W = 1280;
export const VIEW_H = 720;

// Golden-hour palette.
export const PAL = {
  ground: '#b98d54',
  groundDark: '#a67c46',
  road: '#3b3f4b',
  roadEdge: '#2c2f38',
  lane: '#d8c27a',
  sidewalk: '#8d7d60',
  water: '#2e6f8e',
  waterDark: '#255a74',
  park: '#5d8a4a',
  parkDark: '#4c7439',
  plaza: '#9a8a72',
  pier: '#7a6248',
  pierEdge: '#5d4a36',
  safehouse: '#3f7a52',
  chopshop: '#7a3f3f',
  shop: '#4a6a8a',
  docks: '#8a6a3f',
  hudBg: 'rgba(12, 14, 20, 0.72)',
  hudText: '#f2e8d5',
  accent: '#e8b820',
};

// Centreline of road i (0..8) in either direction.
export function roadC(i) {
  return i * PITCH + ROAD / 2;
}

// True when the point is on a road (either direction).
export function onRoad(x, y) {
  for (let i = 0; i < STREETS; i += 1) {
    const c = roadC(i);
    if (Math.abs(x - c) <= ROAD / 2 || Math.abs(y - c) <= ROAD / 2) return true;
  }
  return false;
}

export const MISSION_PAYOUTS = [400, 700, 900, 1200, 2500];
export const MISSION_TITLES = [
  'The Courier Run',
  'The Gold Comet',
  'Shakedown',
  'Lose the Heat',
  'The Harbor Job',
];
