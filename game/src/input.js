// Keyboard and pointer input. Held keys give throttle, pitch and steering; one-shot presses
// (start, pause, mute, mission pick) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice. The pointer is a flight
// stick: its position across the window banks the plane, its height pitches it.
//
// Keys: W throttles up, S throttles down, ArrowUp climbs, ArrowDown descends,
// ArrowLeft / ArrowRight or A / D bank and turn. Space or click confirms.
// P or Escape pauses. M mutes. 1 / 2 / 3 pick a mission. Shift boosts.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_MISSION_1 = 8;
export const ACTION_MISSION_2 = 16;
export const ACTION_MISSION_3 = 32;

const THROTTLE_UP = new Set(['KeyW']);
const THROTTLE_DOWN = new Set(['KeyS']);
const PITCH_UP = new Set(['ArrowUp']);
const PITCH_DOWN = new Set(['ArrowDown']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const BOOST = new Set(['ShiftLeft', 'ShiftRight']);
const MISSIONS = new Map([
  ['Digit1', ACTION_MISSION_1],
  ['Digit2', ACTION_MISSION_2],
  ['Digit3', ACTION_MISSION_3],
  ['Numpad1', ACTION_MISSION_1],
  ['Numpad2', ACTION_MISSION_2],
  ['Numpad3', ACTION_MISSION_3],
]);

export function createInput(target) {
  let throttleUp = false;
  let throttleDown = false;
  let pitchUp = false;
  let pitchDown = false;
  let left = false;
  let right = false;
  let boost = false;
  let actions = 0;
  // Pointer stick: -1..1 across and down the window, 0 when the pointer never moved.
  let pointerX = 0;
  let pointerY = 0;
  let pointerSeen = false;

  // A resting mouse sits near the centre: ignore the wobble, or the plane never flies straight.
  function deadZone(value) {
    if (Math.abs(value) < 0.08) return 0;
    return Math.max(-1, Math.min(1, (value - Math.sign(value) * 0.08) / 0.92));
  }

  window.addEventListener('keydown', (event) => {
    if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (BOOST.has(event.code)) boost = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (MISSIONS.has(event.code)) {
      if (!event.repeat) actions |= MISSIONS.get(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
    else if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (BOOST.has(event.code)) boost = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    throttleUp = false;
    throttleDown = false;
    pitchUp = false;
    pitchDown = false;
    left = false;
    right = false;
    boost = false;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    pointerX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    pointerY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    pointerSeen = true;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1 to 1: throttle change this frame (up positive). */
    throttle() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** -1 to 1: pitch input (up positive). Keys win; the pointer stick is the fallback. */
    pitch() {
      if (pitchUp || pitchDown) return (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);
      if (pointerSeen) return deadZone(-pointerY);
      return 0;
    },
    /** -1 to 1: steering (right positive). Keys win; the pointer stick is the fallback. */
    steer() {
      if (left || right) return (right ? 1 : 0) - (left ? 1 : 0);
      if (pointerSeen) return deadZone(pointerX);
      return 0;
    },
    boosting() {
      return boost;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
