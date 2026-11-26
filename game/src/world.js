// The canyon, its rings, its rock spires and its runway: the world the plane flies
// through. No drawing and no browser in here, only the layout and the rules: step() advances
// one fixed step and returns what happened as bit flags, so the caller can react without
// the world knowing about screens or sound. The layout is seeded, so ?seed=N flies the
// same canyon every time; the missions only change what the canyon asks of the pilot.

import { CANYON, FLIGHT, HULL, MISSIONS, SCORE } from './config.js';
import { createFlight } from './flight.js';
import { createRandom, createWander } from './random.js';

export const EVENT_RING = 1;
export const EVENT_FUEL = 2;
export const EVENT_NEAR = 4;
export const EVENT_HIT = 8;
export const EVENT_SCRAPE = 16;
export const EVENT_CRASH = 32;
export const EVENT_COMPLETE = 64;
export const EVENT_TOUCHDOWN = 128;

const CHUNK = 2000; // metres of canyon generated at a time (mission 2 is endless)

function halfWidthAt(z, phase) {
  return (
    CANYON.halfWidthBase +
    CANYON.halfWidthSwing * Math.sin(z * 0.0038 + phase.a) +
    12 * Math.sin(z * 0.011 + phase.b)
  );
}

function wallHeightAt(z, phase) {
  return (
    CANYON.wallHeightBase +
    CANYON.wallHeightSwing * Math.sin(z * 0.0052 + phase.c) +
    18 * Math.sin(z * 0.013 + phase.d)
  );
}

export function createWorld(seed, missionId) {
  const mission = MISSIONS.find((m) => m.id === missionId) ?? MISSIONS[0];
  const random = createRandom(seed);
  const phase = { a: random() * 6.28, b: random() * 6.28, c: random() * 6.28, d: random() * 6.28 };
  const flight = createFlight();
  const state = {
    mission: mission.id,
    score: 0,
    ringsPassed: 0,
    ringsTotal: mission.rings,
    distanceKm: 0,
    elapsed: 0,
    level: 1,
    over: false,
    complete: false,
    landed: false,
    crashReason: '',
    streak: 0, // consecutive rings without a miss: the streak pays
    lastRingAt: 0,
  };

  // Rings and spires, generated in chunks as the plane flies on. A chunk is built from the
  // same random stream in order, so a reset rebuilds the identical canyon.
  let rings = [];
  let spires = [];
  let generatedTo = 0;
  let ringX = createWander(random, 0, -34, 34, 16);
  let ringY = createWander(random, 70, 25, 150, 22);
  let nextRingZ = 420;
  let nextSpireZ = 700;

  function buildChunk(untilZ) {
    while (generatedTo < untilZ) {
      const end = generatedTo + CHUNK;
      // Target rings: a smooth wandering line down the canyon.
      if (mission.rings > 0) {
        while (nextRingZ < end && rings.filter((r) => r.counted).length < mission.rings) {
          // Every fourth ring is a fuel ring: green, generous, never counted.
          const fuel = rings.length % 4 === 3;
          // A ring sits where the corridor is: inside the walls, with room to bank through.
          const limitX = Math.max(8, halfWidthAt(nextRingZ, phase) - 20);
          const x = Math.max(-limitX, Math.min(limitX, ringX()));
          rings.push({ z: nextRingZ, x, y: ringY(), r: CANYON.ringRadius, counted: !fuel, fuel, done: false });
          nextRingZ += mission.ringSpacing;
        }
      }
      // Fuel rings between the counted ones, green and generous.
      // (They ride the same wander; a fuel ring never counts toward the mission total.)
      // Rock spires: a chance per segment, inside the walls, tall enough to matter.
      while (nextSpireZ < end) {
        if (random() < mission.spires * CANYON.spireChance) {
          const hw = halfWidthAt(nextSpireZ, phase);
          spires.push({
            z: nextSpireZ,
            x: (random() * 2 - 1) * (hw - 16),
            h: CANYON.spireMinHeight + random() * (CANYON.spireMaxHeight - CANYON.spireMinHeight),
            r: CANYON.spireRadius * (0.8 + random() * 0.5),
            hit: false,
          });
        }
        nextSpireZ += CANYON.spireEvery;
      }
      generatedTo = end;
    }
  }

  // Clouds hang above the canyon, far off, drifting slowly with the wind.
  const clouds = [];
  for (let index = 0; index < 26; index += 1) {
    clouds.push({
      x: (random() * 2 - 1) * 320,
      y: 190 + random() * 130,
      z: random() * 9000,
      size: 60 + random() * 130,
      drift: 1 + random() * 2,
    });
  }

  function reset() {
    flight.reset(mission.fuel);
    state.score = 0;
    state.ringsPassed = 0;
    state.distanceKm = 0;
    state.elapsed = 0;
    state.level = 1;
    state.over = false;
    state.complete = false;
    state.landed = false;
    state.crashReason = '';
    state.streak = 0;
    state.lastRingAt = 0;
    rings = [];
    spires = [];
    generatedTo = 0;
    nextRingZ = 420;
    nextSpireZ = 700;
    buildChunk(CHUNK);
  }

  function crash(reason) {
    if (state.over) return EVENT_CRASH;
    state.over = true;
    state.crashReason = reason;
    return EVENT_CRASH;
  }

  /**
   * One fixed step. `control` is the pilot's input for this step. Returns event flags.
   */
  function step(dt, control) {
    if (state.over || state.complete) return 0;
    let events = 0;
    state.elapsed += dt;
    const prevZ = flight.state.z;
    flight.step(dt, control);
    const f = flight.state;

    // Difficulty ramps with distance: the canyon tightens and the rocks crowd in.
    state.level = 1 + Math.floor(f.z / 1500);
    state.distanceKm = f.z / 1000;
    if (mission.id === 2) state.score += (f.z - prevZ) * (SCORE.distancePerKm / 1000);

    buildChunk(f.z + CHUNK);

    // Rings: crossed between the last step and this one. Distance from the ring's centre
    // decides a clean pass, a near miss, or nothing at all.
    for (const ring of rings) {
      if (ring.done || ring.z <= prevZ || ring.z > f.z) continue;
      ring.done = true;
      const dx = f.x - ring.x;
      const dy = f.y - ring.y;
      const d = Math.hypot(dx, dy);
      if (d < ring.r) {
        if (ring.fuel) {
          f.fuel = Math.min(120, f.fuel + FLIGHT.fuelRingBonus);
          state.score += SCORE.fuelRing;
          events |= EVENT_FUEL;
        } else {
          state.ringsPassed += 1;
          state.streak += 1;
          const centre = d < ring.r * 0.45;
          state.score += centre ? SCORE.ringCentre : SCORE.ringPass;
          state.score += Math.min(50, (state.streak - 1) * 10);
          state.lastRingAt = f.z;
          events |= EVENT_RING;
        }
      } else if (d < CANYON.ringNearRadius) {
        state.score += SCORE.ringNear;
        state.streak = 0;
        events |= EVENT_NEAR;
      } else {
        state.streak = 0;
      }
    }

    // Rock spires: a column the plane flew into. One hit, then the rock is spent.
    for (const spire of spires) {
      if (spire.hit || Math.abs(spire.z - f.z) > spire.r + 3) continue;
      if (Math.abs(f.x - spire.x) < spire.r + 3 && f.y < spire.h) {
        spire.hit = true;
        f.hull = Math.max(0, f.hull - HULL.spireHit);
        f.speed *= 0.7;
        f.x += f.x < spire.x ? -6 : 6;
        events |= EVENT_HIT;
        if (f.hull === 0) events |= crash('Rock spire, head on.');
      }
    }

    // Canyon walls: grinding one scrapes the hull and shoves the plane back inside.
    const hw = halfWidthAt(f.z, phase);
    if (Math.abs(f.x) > hw - 4) {
      // Grinding the wall: the rock pushes the nose back toward the canyon.
      const side = Math.sign(f.x) || 1;
      f.hull = Math.max(0, f.hull - HULL.wallScrape * dt);
      f.x = side * (hw - 4);
      if (Math.sign(f.heading) === side) f.heading = -f.heading * 0.5;
      events |= EVENT_SCRAPE;
      if (f.hull === 0) events |= crash('Ground into the canyon wall.');
    }

    // The ground. On the runway, slow and gentle is a landing; anywhere else it is a crash.
    if (f.y <= FLIGHT.minAlt + 0.4) {
      const onRunway =
        mission.id === 3 &&
        f.z >= CANYON.runwayAt &&
        f.z <= CANYON.runwayAt + CANYON.runwayLength &&
        Math.abs(f.x) < CANYON.runwayHalfWidth;
      const gentle = Math.abs(f.climbRate) < 4 && f.speed >= 24 && f.speed <= 62;
      if (onRunway && gentle) {
        state.landed = true;
        state.complete = true;
        state.score += SCORE.landing + Math.max(0, Math.round((62 - f.speed) * SCORE.landingBonusPerKt));
        events |= EVENT_TOUCHDOWN | EVENT_COMPLETE;
      } else if (f.speed > 4) {
        events |= crash(f.fuel === 0 ? 'Out of fuel, glided into the canyon floor.' : 'Flew into the ground.');
      }
    }

    // Out of fuel with no speed left: the glide ends where it ends.
    if (f.fuel === 0 && f.speed <= FLIGHT.minSpeed + 1 && f.y <= FLIGHT.minAlt + 2) {
      events |= crash('Out of fuel, glided into the canyon floor.');
    }

    // Mission 1 is won at the twelfth ring.
    if (mission.id === 1 && state.ringsPassed >= mission.rings) {
      state.complete = true;
      events |= EVENT_COMPLETE;
    }
    return events;
  }

  reset();

  return {
    state,
    flight: flight.state,
    mission,
    reset,
    step,
    halfWidthAt: (z) => halfWidthAt(z, phase),
    wallHeightAt: (z) => wallHeightAt(z, phase),
    runway: mission.id === 3 ? { z0: CANYON.runwayAt, z1: CANYON.runwayAt + CANYON.runwayLength, half: CANYON.runwayHalfWidth } : null,
    clouds,
    ringsInRange(z0, z1) {
      return rings.filter((r) => r.z >= z0 && r.z <= z1);
    },
    spiresInRange(z0, z1) {
      return spires.filter((s) => s.z >= z0 && s.z <= z1);
    },
    nextRing() {
      // The next ring of any kind: counted rings and green fuel rings share one line,
      // and a pilot who flies the line collects the fuel instead of running dry.
      return rings.find((r) => !r.done) ?? null;
    },
  };
}
