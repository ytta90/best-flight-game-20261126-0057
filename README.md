# AERIS — Canyon Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/ytta90/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/ytta90/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A complete, original flight game that runs offline in a desktop browser from its own static files. No libraries, no network. A dawn run down a canyon that does not forgive: thread the glowing rings, mind the fuel, dodge the rock spires, and land it on the runway if you can.

You fly a little jet in chase view over a procedural canyon at sunrise — mountains on the horizon, the sun low and gold, the ground rushing under you in a perspective grid. The instruments are lit: altitude, speed and heading, a compass strip, an attitude ball, fuel and hull gauges, and a flight-path marker that shows where the nose is actually going.

## How to play

- **W / S** — throttle up / down
- **↑ / ↓** — pitch up / down (climb and descend)
- **← / → or A / D** — bank and turn
- **Mouse** — steer and pitch, like a flight stick
- **Shift** — boost (drinks fuel fast)
- **Space / click** — start, restart, confirm
- **1 / 2 / 3** — pick a mission
- **P / Esc** — pause, **M** — mute

Flying well is an energy bargain: climb on speed, turn on bank, and mind the fuel gauge, because a fast plane that climbs hard arrives thirsty. Below stall speed the wing gives up and the plane sinks. Green rings give fuel back. A clean pass through a ring's centre pays more, and a streak of clean passes pays extra.

## Missions

1. **Ring Run** — fly through 12 rings before the fuel runs out.
2. **Canyon Dash** — fly as far as you can; the canyon only gets tighter.
3. **Runway Landing** — follow the rings 6 km down the canyon and land on the runway: slow, gentle, on the strip.

Best score per mission is kept in your browser.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no install.

## Files

- `main.ts` — the hand-in: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `serve.ts` — tiny static server for local play
- `game/index.html` — the page: one canvas, one status line
- `game/src/main.js` — boot, the fixed-step loop, screens, screenshot staging
- `game/src/config.js` — every tuning number, the missions, the palette
- `game/src/random.js` — seeded RNG, so `?seed=N` flies the same canyon
- `game/src/input.js` — keyboard and pointer stick
- `game/src/flight.js` — the flight model: throttle, bank, pitch, stall, fuel
- `game/src/world.js` — the canyon, its rings, rock spires, runway and missions
- `game/src/render.js` — the 3D chase view, the plane, the lit instruments, the panels
- `game/src/audio.js` — procedural WebAudio: engine, wind, chimes
- `game/src/shots.js` — deterministic screenshot scenes with an autopilot

Screenshots are deterministic renders of the game's own code:
`?shot=start|play|canyon|end&seed=1`, taken at 1280×720.

Playtested in a headless desktop browser: 30 seconds of key-driven flight (throttle,
bank, pitch, pause and resume), mission 2 started from the title screen, zero console
or page errors.

## License

MIT. See LICENSE.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
