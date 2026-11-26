// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// AERIS is a dawn canyon run: the sun is low, the rock is warm, the sky is indigo above
// a band of gold, and the instruments glow amber and cyan against it.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Flight model: speeds in metres per second, altitudes in metres. */
export const FLIGHT = {
  maxSpeed: 95, // about 185 knots at full throttle
  stallSpeed: 26, // below this the wing stops flying and the plane sinks
  minSpeed: 12,
  accel: 22, // how fast speed chases the throttle's target
  drag: 0.12, // extra bleed at high speed
  throttleRate: 0.55, // throttle travel per second
  maxBankDeg: 55, // bank at full steer
  bankRate: 2.6, // radians per second toward the wanted bank
  turnRate: 0.55, // heading change per second at full bank and cruise speed
  maxPitchDeg: 20, // pitch at full climb input
  pitchRate: 1.9, // radians per second toward the wanted pitch
  climbFactor: 1.0, // climb rate is sin(pitch) * speed
  sinkOnStall: 14, // extra metres per second lost while stalled
  maxAlt: 260, // the ceiling: thin air up here, the engine wheezes
  minAlt: 2, // the ground: touch it outside the runway and it is a crash
  fuelDrainBase: 0.32, // fuel per second at idle
  fuelDrainThrottle: 0.72, // extra fuel per second at full throttle
  fuelRingBonus: 25, // fuel a green ring gives back
  boostDrain: 1.6, // extra fuel per second while boosting (Shift)
  boostThrust: 1.25, // speed multiplier while boosting
};

/** The canyon corridor and what lives in it. Distances in metres. */
export const CANYON = {
  halfWidthBase: 66, // half the corridor at its calmest
  halfWidthSwing: 20, // how much the walls wander in and out
  wallHeightBase: 70, // how tall the rock stands
  wallHeightSwing: 45,
  ringSpacing: 260, // metres between target rings
  ringRadius: 16, // the ring you must fly through
  ringNearRadius: 26, // a near miss still scores a little
  spireEvery: 175, // metres between spire chances
  spireChance: 0.62, // a spire appears at a chance point this often
  spireMinHeight: 26,
  spireMaxHeight: 95,
  spireRadius: 5,
  runwayAt: 6000, // where the runway starts, mission 3
  runwayLength: 900,
  runwayHalfWidth: 14,
};

/** Missions: three sorties with different goals, each with its own best score. */
export const MISSIONS = [
  {
    id: 1,
    name: 'Ring Run',
    goal: 'Fly through 12 rings before the fuel runs out.',
    blurb: '12 rings, fuel is the clock.',
    rings: 12,
    ringSpacing: 260,
    fuel: 100,
    spires: 0.55,
  },
  {
    id: 2,
    name: 'Canyon Dash',
    goal: 'Fly as far as you can. The canyon only gets tighter.',
    blurb: 'As far as you can. It only gets tighter.',
    rings: 0,
    ringSpacing: 260,
    fuel: 100,
    spires: 0.8,
  },
  {
    id: 3,
    name: 'Runway Landing',
    goal: 'Follow the rings 6 km down the canyon and land on the runway.',
    blurb: '6 km down the canyon, then land it.',
    rings: 8,
    ringSpacing: 740,
    fuel: 120,
    spires: 0.5,
  },
];

export const SCORE = {
  ringCentre: 150, // through the middle of the ring
  ringPass: 100, // through the ring at all
  ringNear: 25, // close enough to count as a near miss
  fuelRing: 50,
  distancePerKm: 10, // Canyon Dash pays per kilometre flown
  landing: 500, // a clean touchdown
  landingBonusPerKt: 4, // extra for landing gently, per knot under the limit
};

export const HULL = {
  start: 100,
  wallScrape: 3, // per second of grinding the canyon wall
  spireHit: 34, // one rock spire, head on
  ringClip: 0, // clipping a ring costs nothing but the streak
};

/** Where the best score of each mission is kept between visits (this browser only). */
export const BEST_KEY = 'aeris-canyon-run.best.';

export const PALETTE = {
  skyTop: '#141c33',
  skyMid: '#3a3a63',
  skyHorizon: '#ff9a5c',
  skyLow: '#ffc98a',
  sunCore: '#fff3c4',
  sunGlow: '#ff8a3c',
  mountainFar: '#4a4360',
  mountainNear: '#332f47',
  rockDark: '#5a3d2c',
  rock: '#7a563f',
  rockLight: '#9a6f52',
  rockStrata: '#54382c',
  groundSand: '#a97e56',
  groundDark: '#7d5a40',
  groundLine: '#c99a6b',
  cloud: '#ffe9d6',
  ring: '#37e0ff',
  ringCore: '#d8fbff',
  fuelRing: '#5cff8a',
  spire: '#3d2b21',
  spireEdge: '#a97e56',
  runway: '#2e3138',
  runwayLine: '#f5f0dc',
  runwayLight: '#ffb347',
  planeBody: '#e8eef4',
  planeAccent: '#ff7a3c',
  planeCanopy: '#7fd4ff',
  planeGlow: '#ffb347',
  hudText: '#eaf6ff',
  hudAmber: '#ffc46b',
  hudGreen: '#7dff9e',
  hudRed: '#ff5d5d',
  hudDim: '#8fa3b8',
  panel: '#101827',
  panelEdge: '#2c3e55',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
