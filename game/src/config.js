// Every tuning number and colour for HARBOR VICE in one place. The world is a
// top-down port city on a fixed grid; the renderer shows a 1280x720 window of it
// through a camera that follows the player, so no rule depends on screen size.
export const STEP = 1 / 60;

export const VIEW = { width: 1280, height: 720 };

// City grid: 9 roads each way, 300 px pitch, 72 px roads, 228 px blocks.
export const GRID = { roads: 9, pitch: 300, roadWidth: 72, block: 228 };
export const WORLD = { minX: -80, minY: -80, maxX: 2520, maxY: 2520, waterY: 2520, waterH: 260 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 265,
  health: 100,
  punchRange: 36,
  punchDamage: 34,
  punchCooldown: 0.42,
  shootCooldown: 0.22,
  bulletSpeed: 900,
  bulletDamage: 34,
};

export const CAR = {
  accel: 430,
  brake: 700,
  reverseMax: 170,
  maxSpeed: 540,
  sportsMax: 640,
  vanMax: 460,
  policeMax: 600,
  turn: 2.6,
  grip: 5.2,
  health: 100,
  radius: 22,
};

export const TRAFFIC = { count: 14, speedMin: 110, speedMax: 175, despawn: 900 };
export const PEDS = { count: 26, walkMin: 45, walkMax: 75, fleeSpeed: 150 };

export const WANTED = {
  decayDelay: 7,
  decayInterval: 9,
  max: 5,
  copCars: [0, 1, 2, 3, 4, 5],
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  ramCop: 1,
  killCop: 2,
};

export const MONEY = { start: 150, bustedFine: 200, wastedFine: 200 };

export const SAVE_KEY = 'harbor-vice.save.v1';

export const PALETTE = {
  // Golden-hour port city: warm sun, pastel blocks, teal water.
  grass: '#7fae62',
  parkGrass: '#69a054',
  sidewalk: '#c9bda6',
  asphalt: '#3c4048',
  asphalt2: '#34383f',
  roadLine: '#e8c95a',
  crosswalk: '#d8d2c2',
  sand: '#e3cd96',
  water: '#2e7f9e',
  waterDeep: '#256b87',
  waterGlint: '#7fc4d8',
  building: ['#f2d8a7', '#e8b48a', '#d97b54', '#e88ca0', '#4fa8a0', '#e0b34c', '#c9a2d8', '#9db8c9', '#f0e6d2'],
  roof: ['#8a5a3b', '#5d6b7a', '#7a4a3a', '#4a6b5a', '#6b5a7a'],
  palm: '#3f7d44',
  palmTrunk: '#8a6b4a',
  player: '#ffcf3f',
  playerShirt: '#2f6fd8',
  cop: '#2244aa',
  copCar: '#1d3fae',
  text: '#f4efe4',
  muted: '#b9b2a0',
  panel: 'rgba(16, 18, 26, 0.82)',
  star: '#ffd94a',
  objective: '#ffd94a',
  danger: '#ff5a4a',
  money: '#7ddc7d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
