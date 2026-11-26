// The screenshot scenes behind ?shot=start|play|canyon|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by an autopilot that
// aims for the next ring and keeps clear of rock, so the frame is what a short game really
// looks like and the same seed always gives the same frame. The end scene's pilot looks
// only a moment ahead and flies sloppy, so it is caught out once the canyon tightens, as a
// hurried player is.

import { STEP } from './config.js';
import { EVENT_COMPLETE, EVENT_CRASH } from './world.js';
import { SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 22;
const CANYON_SECONDS = 20;
const END_LIMIT_SECONDS = 600;
const SAMPLE = 1 / 30;

/** Steer and pitch toward a point in the air, at a throttle that keeps the plane flying. */
function autopilot(world, horizon, noisy) {
  const f = world.flight;
  const ring = world.nextRing();
  let targetX = 0;
  let targetY = 70;
  let look = horizon;
  if (ring && ring.z - f.z < horizon) {
    targetX = ring.x;
    targetY = ring.y;
    look = ring.z - f.z;
  }
  // Rock ahead: the nearest spire in the flight path, dodged early to the side with
  // more room, and never into the wall. A late dodge is a crash, so look 250 m ahead,
  // and judge by where the plane is heading, not only where it is.
  const hw0 = world.halfWidthAt(f.z);
  for (const spire of world.spiresInRange(f.z + 10, f.z + 250)) {
    const predX = f.x + Math.sin(f.heading) * (spire.z - f.z);
    const clearance = spire.r + 18;
    if (Math.abs(spire.x - predX) < clearance && f.y < spire.h + 6) {
      const dodge = spire.r + 16;
      const left = spire.x - dodge;
      const right = spire.x + dodge;
      targetX = Math.abs(left) < Math.abs(right) ? left : right;
      targetX = Math.max(-(hw0 - 14), Math.min(hw0 - 14, targetX));
      targetY = Math.max(targetY, spire.h + 14);
      break;
    }
  }
  // Too close to a wall: aim back toward the middle of the canyon first.
  const hw = world.halfWidthAt(f.z);
  if (Math.abs(f.x) > hw * 0.55) targetX = -Math.sign(f.x) * hw * 0.3;
  const jitter = noisy ? (Math.sin(f.z * 0.05) * 0.35 + Math.sin(f.z * 0.13) * 0.2) : 0;
  // Steer toward the target, and against the heading: without the second term the plane
  // crosses the target still turning and keeps drifting to the wall.
  const steer = Math.max(-1, Math.min(1, (targetX - f.x) / 26 - f.heading * 1.2 + jitter));
  const pitch = Math.max(-1, Math.min(1, (targetY - f.y) / 34));
  const wantThrottle = 0.78;
  const throttle = Math.max(-1, Math.min(1, (wantThrottle - f.throttle) * 4));
  return { throttle, pitch, steer, boost: false, look };
}

/**
 * Set `world` to the named scene (start, play, canyon or end; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'canyon' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, autopilot(world, 400, false));
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'canyon') {
    // A low pass: the pilot holds the plane down among the spires and banks hard.
    for (let index = 0; index < CANYON_SECONDS / STEP; index += 1) {
      const control = autopilot(world, 500, false);
      control.pitch = Math.max(-1, Math.min(1, (26 - world.flight.y) / 30));
      if (world.step(STEP, control) & EVENT_CRASH) break;
    }
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'end') {
    const limit = END_LIMIT_SECONDS / STEP;
    for (let index = 0; index < limit; index += 1) {
      const events = world.step(STEP, autopilot(world, 150, true));
      if (events & (EVENT_CRASH | EVENT_COMPLETE)) break;
    }
    const over = world.state.over;
    return { screen: over ? SCREEN_OVER : SCREEN_COMPLETE, best: world.state.score };
  }
  for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
    if (world.step(STEP, autopilot(world, 500, false)) & EVENT_CRASH) break;
  }
  const over = world.state.over;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
