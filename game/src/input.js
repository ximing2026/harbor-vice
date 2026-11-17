// Keyboard + mouse input: produces one plain input object per frame.
// No game logic here — world.js consumes the object.
export function createInput() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    enter: false,
    action: false, // E: enter/exit car, carjack
    punch: false, // F
    shoot: false, // mouse click (edge-triggered by main)
    aimX: 0,
    aimY: 0, // aim in world coordinates, filled in by main.js
    mouseX: 0,
    mouseY: 0, // screen coordinates
    pause: false, // P / Escape (edge-triggered by main)
    mute: false, // M (edge-triggered by main)
    anyKey: false,
    keys: {},
  };
}

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyE: 'action',
  KeyF: 'punch',
  Enter: 'enter',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
};

export function attachInput(input, canvas) {
  function onKey(e, down) {
    const name = KEYMAP[e.code];
    if (!name) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    input.keys[e.code] = down;
    if (name === 'up' || name === 'down' || name === 'left' || name === 'right') {
      input[name] = down;
    } else if (down) {
      input[name] = true; // edge: main.js clears it after consuming
    }
    input.anyKey = true;
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  canvas.addEventListener('mousedown', (e) => {
    input.shoot = true;
    input.anyKey = true;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - r.left;
    input.mouseY = e.clientY - r.top;
  });
  window.addEventListener('blur', () => {
    input.up = input.down = input.left = input.right = false;
    input.keys = {};
  });
}

// Clear edge-triggered flags after the frame consumed them.
export function clearEdges(input) {
  input.enter = false;
  input.action = false;
  input.punch = false;
  input.shoot = false;
  input.pause = false;
  input.mute = false;
  input.anyKey = false;
}
