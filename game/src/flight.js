// The flight model: throttle, speed, bank, heading, pitch, altitude, fuel and hull.
// No drawing and no browser in here, only numbers: step() advances one fixed step and the
// caller reads the state. Flying well is an energy bargain: climb on speed, turn on bank,
// and mind the fuel, because a fast plane that climbs hard arrives thirsty.

import { CANYON, FLIGHT } from './config.js';

const DEG = Math.PI / 180;

export function createFlight() {
  const state = {
    x: 0, // metres across the canyon, 0 is the centre
    y: 12, // altitude in metres above the canyon floor
    z: 0, // metres flown down the canyon
    speed: 0, // metres per second
    throttle: 0, // 0..1
    heading: 0, // radians, 0 is straight down the canyon
    pitch: 0, // radians, positive is nose up
    roll: 0, // radians, positive is banked right
    climbRate: 0, // metres per second, for the variometer
    fuel: 100,
    hull: 100,
    boost: false,
    stalled: false,
    pullingUp: false, // terrain warning: the ground is too close, too fast
  };

  function reset(fuel) {
    state.x = 0;
    state.y = 12;
    state.z = 0;
    state.speed = 0;
    state.throttle = 0;
    state.heading = 0;
    state.pitch = 0;
    state.roll = 0;
    state.climbRate = 0;
    state.fuel = fuel;
    state.hull = 100;
    state.boost = false;
    state.stalled = false;
    state.pullingUp = false;
  }

  /**
   * One fixed step. `control` is { throttle: -1..1, pitch: -1..1, steer: -1..1, boost }.
   * Returns nothing; the world reads the state and decides what the flying hit.
   */
  function step(dt, control) {
    // Throttle chases the lever, then speed chases the throttle.
    state.throttle = Math.max(0, Math.min(1, state.throttle + control.throttle * FLIGHT.throttleRate * dt));
    state.boost = control.boost && state.fuel > 0;
    const target = state.throttle * FLIGHT.maxSpeed * (state.boost ? FLIGHT.boostThrust : 1);
    const pull = FLIGHT.accel * dt;
    if (state.speed < target) state.speed = Math.min(target, state.speed + pull);
    else state.speed = Math.max(target, state.speed - pull * 1.6);
    // Drag grows with speed, so the top end is a bargain with the fuel gauge.
    state.speed = Math.max(FLIGHT.minSpeed, state.speed - FLIGHT.drag * state.speed * state.speed * 0.001 * dt * 10);

    // Bank toward the steer, then the heading follows the bank: a turn is a banked turn.
    const wantRoll = control.steer * FLIGHT.maxBankDeg * DEG;
    const rollStep = FLIGHT.bankRate * dt;
    state.roll += Math.max(-rollStep, Math.min(rollStep, wantRoll - state.roll));
    const turnAuthority = Math.max(0.25, Math.min(1, state.speed / FLIGHT.maxSpeed));
    state.heading += Math.tan(state.roll) * FLIGHT.turnRate * turnAuthority * dt * 2.2;
    state.heading = Math.max(-0.6, Math.min(0.6, state.heading));

    // Pitch toward the stick. Without input the nose settles gently toward level.
    const wantPitch = control.pitch * FLIGHT.maxPitchDeg * DEG;
    const pitchStep = FLIGHT.pitchRate * dt;
    state.pitch += Math.max(-pitchStep, Math.min(pitchStep, wantPitch - state.pitch));
    if (control.pitch === 0) state.pitch *= Math.max(0, 1 - 0.8 * dt);

    // Lift: climb on pitch and speed. Below stall speed the wing gives up and the plane sinks.
    state.stalled = state.speed < FLIGHT.stallSpeed && state.pitch > 0;
    let climb = Math.sin(state.pitch) * state.speed * FLIGHT.climbFactor;
    if (state.stalled) climb -= FLIGHT.sinkOnStall * (1 - state.speed / FLIGHT.stallSpeed);
    state.climbRate = climb;
    state.y += climb * dt;
    if (state.y > FLIGHT.maxAlt) {
      state.y = FLIGHT.maxAlt;
      state.pitch = Math.min(state.pitch, 0);
    }
    if (state.y < FLIGHT.minAlt) state.y = FLIGHT.minAlt;

    // The plane goes where its nose points: forward along the heading, sideways with it.
    state.x += Math.sin(state.heading) * state.speed * dt;
    state.z += Math.cos(state.heading) * state.speed * dt;

    // Fuel: idle sips, full throttle drinks, boost gulps. Empty means gliding, then ground.
    const drain = FLIGHT.fuelDrainBase + state.throttle * FLIGHT.fuelDrainThrottle + (state.boost ? FLIGHT.boostDrain : 0);
    state.fuel = Math.max(0, state.fuel - drain * dt);
    if (state.fuel === 0) state.throttle = Math.max(0, state.throttle - 0.5 * dt);

    // Terrain warning: low and sinking fast, or the canyon floor coming up.
    state.pullingUp = (state.y < 14 && state.climbRate < -2) || state.y < 6;
  }

  return { state, reset, step };
}

/** Knots from metres per second, for the HUD. */
export function knots(ms) {
  return ms * 1.94384;
}

/** Feet from metres, for the altimeter. */
export function feet(m) {
  return m * 3.28084;
}

/** Heading in degrees, 0..360, for the compass strip. */
export function headingDeg(heading) {
  return ((heading / DEG + 360) % 360 + 360) % 360;
}
