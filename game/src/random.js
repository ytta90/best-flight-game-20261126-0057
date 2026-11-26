// A small seeded random source, so a game given ?seed=N plays the same canyon every time
// and the screenshots are reproducible. Mulberry32: short, fast, and good enough for terrain.

export function createRandom(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth 1D wander: value drifts a little each call, never jumps, stays in [min, max]. */
export function createWander(random, start, min, max, step) {
  let value = start;
  return function wander() {
    value += (random() * 2 - 1) * step;
    if (value < min) value = min + (min - value) * 0.5;
    if (value > max) value = max - (max - value) * 0.5;
    // The reflection above narrows a big overshoot; the clamp finishes the job.
    return Math.max(min, Math.min(max, value));
  };
}
