// Procedural sound, no audio files: the engine is two oscillators through a low-pass
// filter, the wind is filtered noise, and the chimes and thuds are short envelopes. The
// context starts on the first user gesture; in a screenshot run there is no gesture, so
// the game simply stays quiet. M toggles it all off.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineFilter = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.4;
      master.connect(ctx.destination);
      // Engine: a sawtooth and its detuned twin, muffled by a low-pass filter.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55.5;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a band-pass, louder with speed.
      const length = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(band);
      band.connect(windGain);
      windGain.connect(master);
      noise.start();
      engineGain.gain.value = 0.05;
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type, gainValue, when = 0) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainValue, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    /** Call from a user gesture (start, click) so the context is allowed to run. */
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    },
    /** Continuous sound, called every frame with the flight state. */
    update(f) {
      if (!ctx || !engineOsc) return;
      const t = ctx.currentTime;
      const target = 42 + f.throttle * 66 + (f.boost ? 22 : 0);
      engineOsc.frequency.setTargetAtTime(target, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(target * 1.007, t, 0.08);
      engineFilter.frequency.setTargetAtTime(240 + f.throttle * 900, t, 0.1);
      if (windGain) windGain.gain.setTargetAtTime(Math.min(0.16, f.speed * 0.0016), t, 0.15);
    },
    /** Fade the engine and wind out when the flight ends: a crashed plane is quiet. */
    silence() {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (engineGain) engineGain.gain.setTargetAtTime(0, t, 0.1);
      if (windGain) windGain.gain.setTargetAtTime(0, t, 0.1);
    },
    ring() {
      tone(880, 0.35, 'sine', 0.22);
      tone(1318, 0.45, 'sine', 0.16, 0.07);
    },
    fuel() {
      tone(523, 0.3, 'sine', 0.2);
      tone(784, 0.4, 'sine', 0.18, 0.08);
    },
    near() {
      tone(660, 0.18, 'sine', 0.12);
    },
    hit() {
      tone(140, 0.3, 'square', 0.2);
      tone(90, 0.4, 'sawtooth', 0.18, 0.02);
    },
    crash() {
      tone(70, 0.9, 'sawtooth', 0.3);
      tone(45, 1.1, 'sine', 0.3, 0.05);
    },
    touchdown() {
      tone(330, 0.25, 'sine', 0.2);
      tone(494, 0.35, 'sine', 0.2, 0.09);
      tone(659, 0.5, 'sine', 0.2, 0.18);
    },
    warning() {
      tone(1046, 0.12, 'square', 0.08);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.4;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
