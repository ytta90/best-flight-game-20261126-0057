// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, game over and mission
// complete. Three missions wait on the title screen, each with its own best score.
//
// ?seed=N fixes the canyon. ?shot=start|play|canyon|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, MISSIONS, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_COMPLETE,
  EVENT_CRASH,
  EVENT_FUEL,
  EVENT_HIT,
  EVENT_NEAR,
  EVENT_RING,
  EVENT_TOUCHDOWN,
  createWorld,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_MISSION_1,
  ACTION_MISSION_2,
  ACTION_MISSION_3,
  ACTION_MUTE,
  ACTION_PAUSE,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_COMPLETE,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();
let missionId = 1;
let world = createWorld(seed, missionId);

function readBest(id) {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY + id) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(id, value) {
  try {
    window.localStorage.setItem(BEST_KEY + id, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function refreshMissionsList() {
  world.missionsList = MISSIONS.map((m) => ({ ...m, best: readBest(m.id) }));
}

refreshMissionsList();

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, scene.best, 0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest(missionId);
  let accumulator = 0;
  let last = performance.now();
  let warnedLowFuel = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function pickMission(id) {
    missionId = id;
    world = createWorld(seed, missionId);
    refreshMissionsList();
    best = readBest(missionId);
  }

  function startGame(id) {
    if (id !== undefined && id !== missionId) pickMission(id);
    else {
      world.reset();
      refreshMissionsList();
    }
    audio.unlock();
    accumulator = 0;
    warnedLowFuel = false;
    screen = SCREEN_PLAY;
    announce(`Flying ${world.mission.name}. ${world.mission.goal}`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.silence();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(missionId, best);
      refreshMissionsList();
    }
    announce(`Crashed. ${world.state.crashReason} Score ${world.state.score}. Best ${best}.`);
  }

  function completeGame() {
    screen = SCREEN_COMPLETE;
    audio.silence();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(missionId, best);
      refreshMissionsList();
    }
    announce(`Mission complete. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_MISSION_1 && screen !== SCREEN_PLAY) startGame(1);
    else if (actions & ACTION_MISSION_2 && screen !== SCREEN_PLAY) startGame(2);
    else if (actions & ACTION_MISSION_3 && screen !== SCREEN_PLAY) startGame(3);
    else if (actions & ACTION_CONFIRM && screen !== SCREEN_PLAY) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) return;
    const control = {
      throttle: input.throttle(),
      pitch: input.pitch(),
      steer: input.steer(),
      boost: input.boosting(),
    };
    const events = world.step(STEP, control);
    audio.update(world.flight);
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_FUEL) audio.fuel();
    if (events & EVENT_NEAR) audio.near();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_TOUCHDOWN) audio.touchdown();
    if (events & EVENT_CRASH) {
      audio.crash();
      endGame();
    } else if (events & EVENT_COMPLETE) {
      completeGame();
    }
    if (!warnedLowFuel && world.flight.fuel < 25 && world.flight.fuel > 0) {
      warnedLowFuel = true;
      audio.warning();
      announce('Low fuel.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, best, 0);
  }

  // Leaving the tab pauses a running game rather than letting the canyon fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('AERIS Canyon Run. Press 1, 2 or 3 to pick a mission, or Space to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
