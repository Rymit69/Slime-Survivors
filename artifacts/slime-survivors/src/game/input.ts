export const Input = {
  up: false,
  down: false,
  left: false,
  right: false,
  touchDx: 0,  // -1 to 1, from virtual joystick
  touchDy: 0,  // -1 to 1, from virtual joystick
};

let initialized = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'w' || e.key === 'ArrowUp') Input.up = true;
  if (e.key === 's' || e.key === 'ArrowDown') Input.down = true;
  if (e.key === 'a' || e.key === 'ArrowLeft') Input.left = true;
  if (e.key === 'd' || e.key === 'ArrowRight') Input.right = true;
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key === 'w' || e.key === 'ArrowUp') Input.up = false;
  if (e.key === 's' || e.key === 'ArrowDown') Input.down = false;
  if (e.key === 'a' || e.key === 'ArrowLeft') Input.left = false;
  if (e.key === 'd' || e.key === 'ArrowRight') Input.right = false;
}

export function initInput() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
}

export function teardownInput() {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  initialized = false;
  Input.up = false;
  Input.down = false;
  Input.left = false;
  Input.right = false;
  Input.touchDx = 0;
  Input.touchDy = 0;
}
