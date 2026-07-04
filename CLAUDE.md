# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repo contains standalone browser games with no build step, no package manager, and no dependencies. Each game is self-contained in its own top-level directory and runs directly from static files.

- `Shooter/` — "Retro Gunner", a top-down twin-stick shooter rendered on an HTML5 `<canvas>`.
- `TicTacToe/` — a single-file Tic Tac Toe game (HTML/CSS/JS all inline in `index.html`) with an optional CPU opponent.

## Git workflow

**After every meaningful change, commit and push immediately — no exceptions.** Progress must never exist only locally.

- Commit after each meaningful, working change rather than batching up large, unrelated diffs.
- Write clean, descriptive commit messages that explain *why* the change was made, not just what changed.
- Push to GitHub immediately after every commit so the remote always reflects the current state of the work.
- Never leave completed work uncommitted or unpushed at the end of a task.

## Running the games

There is no build, lint, or test tooling in this repo. Open the HTML file directly in a browser, or serve the directory statically, e.g.:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000/Shooter/` or `http://localhost:8000/TicTacToe/`.

## Architecture: Shooter

`Shooter/game.js` is a single IIFE containing the entire game — there is no module system or bundler. It follows a classic canvas game-loop structure, organized top-to-bottom in the file as:

1. **Setup & constants** — canvas/context, tunable gameplay constants (speeds, cooldowns, radii), and `LEVELS`, an array of per-level difficulty configs (enemy count, spawn interval, speed, health).
2. **DOM references** — HUD elements and overlay `<div>` screens (menu, paused, levelComplete, gameOver, win) looked up once at load. `showScreen(name)` toggles which overlay is visible via a `hidden` class.
3. **Input** — keyboard state tracked in a `keys` Set, mouse position/down state in a `mouse` object, both updated by event listeners and read from inside the update loop (not event-driven logic).
4. **Game state** — a single `state` string machine (`menu | playing | paused | levelComplete | gameOver | win`) drives `setState()`, which shows/hides HUD and overlays. Entities (`player`, `enemies`, `bullets`, `particles`) are plain arrays/objects reset via `resetLevelEntities()` on level start/advance.
5. **Update** — per-frame logic split into `updatePlayer`, `updateEnemies`, `updateBullets`, `updateParticles`, `updateShake`, called from `update(dt)`. Enemies always path directly toward the player; collisions are simple radius-distance checks (`dist()`), not a physics engine. `checkLevelComplete()` runs after update when all enemies for the level are spawned and dead.
6. **Render** — draw functions (`drawBackground`, `drawEnemies`, `drawPlayer`, `drawBullets`, `drawParticles`) run every frame regardless of game state (so the background still animates on menus). `drawHumanoid()` is a shared primitive used to draw both the player and enemies (with different colors/radius) so their visual look stays in sync.
7. **Main loop** — a single `requestAnimationFrame` loop (`loop()`) computes `dt` in seconds (clamped to 0.05s to avoid spiral-of-death on tab-switch), calls `update(dt)` only while `state === "playing"`, but always renders.

Enemies scale in difficulty via `LEVELS` and a `tier` (1–3, derived from `health`) that maps to `TIER_COLORS` for visual distinction. Progression, scoring, and HUD updates all live inline in the same functions rather than a separate scoring module.

When modifying gameplay, tune values in the constants block or `LEVELS` array rather than hardcoding new magic numbers deeper in the update/render functions.

## Architecture: TicTacToe

`TicTacToe/index.html` is fully self-contained (styles and script inline, no external files). Board state is a flat 9-element array (`board`), and win detection (`checkWinner`) checks against the 8 lines in `WIN_LINES`. The optional CPU (`findBestMove`) is a heuristic, not minimax: it checks for an immediate win, then an immediate block, then takes center, then a corner, then a random remaining cell — it is not guaranteed to play optimally in all positions.
