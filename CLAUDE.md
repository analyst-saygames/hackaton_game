# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A vanilla HTML/CSS/JS puzzle game built around the B2/S2 cellular automaton (a cell is alive next tick iff it has exactly 2 living neighbors, Moore neighborhood). The original design lives in `CHAIN_REACTION_GARDEN_SPEC.md`; the code has since extended it with walls, anchors, wildcards, a playable tutorial, and a cheat solver.

## Running and editing

- **Run**: open `index.html` directly in a browser. No build, no server, no dev dependencies.
- **No tests, no lint, no build step.** If you add new levels, verify them with a throwaway Node script (see "Verifying new levels" below).
- **Must work over `file://`**: do not introduce ES modules, `import`/`export`, `fetch()`, or anything else that triggers CORS when opened by double-click. Scripts are loaded as classic `<script>` tags in `index.html` and rely on globals.

## Architecture

Four scripts loaded in order, each exposing globals to `window`:

```
engine.js  →  audio.js  →  levels.js  →  ui.js
```

- **`engine.js`** — pure functions, no DOM, no state. `step(grid, walls?, anchors?)` is the entire simulation rule. `parseLevel(rows)` extracts `{current, walls, anchors}` from a 5-string array. `isWin(current, goal, walls?)` knows how to skip walls (`#`) and wildcards (`?`).
- **`audio.js`** — procedural Web Audio sounds (no audio files). All effects synthesized on demand.
- **`levels.js`** — defines `const LEVELS = [...]`. Single source of truth for puzzle content.
- **`ui.js`** — single IIFE. Module-level `state` object holds all game state. Single `render()` function wipes `#app.innerHTML` and rebuilds from scratch on every change. No diffing, no virtual DOM. **The tutorial and the cheat solver both live here** — they reuse the same `placeSeed`/`runTick` pipeline so animations work consistently.

### Level character encoding

`start` and `goal` are 5 strings of 5 chars. Characters:

| Char | In `start` | In `goal` |
|---|---|---|
| `.` | empty | must be empty |
| `X` | alive | must be alive |
| `#` | wall (immutable dead, not counted as neighbor) | wall (skipped in win check) |
| `A` | anchor (always alive, counts as neighbor, never dies) | must be alive (anchor satisfies it) |
| `?` | (not used) | wildcard — any state matches |

`step()` enforces walls/anchors by forcing those positions to 0/1 respectively before applying the B2/S2 rule everywhere else.

### State and persistence

- All game state lives in the `state` object in `ui.js` (`view`, `current`, `walls`, `anchors`, `seedsLeft`, `ticksLeft`, `history`, etc.).
- Tutorial has its own `tutorial` state object.
- localStorage keys: `mr_solved` (array of solved level IDs), `mr_muted` (`"0"`/`"1"`), `mr_tutorial_seen` (`"1"`).
- Mutations go through named functions (`placeSeed`, `runTick`, `undo`, `restart`, `loadLevel`, `goToMenu`). Each calls `render()` itself.

### Win/lose timing

`scheduleEndCheck()` defers the win/lose overlay by `END_DELAY_MS` (1100ms) so the player sees the bloom/wilt animations resolve before the result panel appears. Uses a `pendingEndAt` token to cancel if the player undoes during the delay.

### Cheat solver

`ui.js` has a `SOLUTIONS` map (`{levelId: [action, action, ...]}`) used by the 💡 Решить button. Each action is either `'tick'` or `'place(x,y)'`. **When adding a new level, also add its solution here**, or the cheat button is auto-disabled for that level.

## Verifying new levels

There's no permanent verifier in the repo — these scripts are created ad hoc and deleted after use. The pattern that has worked:

```js
// verify.cjs (throwaway, do not commit)
const fs = require('fs');
const engineSrc = fs.readFileSync(__dirname + '/engine.js', 'utf8');
eval(engineSrc + '\nglobalThis.step=step; globalThis.parseLevel=parseLevel; globalThis.isWin=isWin; globalThis.cloneGrid=cloneGrid;');

function verify(start, goal, seeds, maxTicks) {
  const { current: startG, walls, anchors } = parseLevel(start);
  // BFS over (place|tick) actions with seen-set keyed by JSON.stringify(grid)+seeds+ticks
  // returns null or array of actions
}
```

Then `node verify.cjs`. Notes:

- BFS blows up past ~4 seeds with multiple ticks. For high-seed levels, instead **check a proposed solution** by running the action sequence and asserting `isWin`.
- After designing, also confirm staging is required if the level is intended to need it — run all seeds upfront then ticks-only, and assert it does NOT reach the goal.
- Delete the throwaway script after use.

## Adding a new level (checklist)

1. Append to `LEVELS` in `levels.js` with the next sequential `id`.
2. Verify solvable via the throwaway BFS or by checking a known solution.
3. Add the solution sequence to `SOLUTIONS` in `ui.js` (otherwise cheat button is disabled).
4. Menu renders all levels in `LEVELS` automatically; chips at `i > 10` get the `.advanced` (dashed) style — adjust the threshold there if needed.

## Things that look like bugs but aren't

- All `.cell.alive` elements re-trigger the bloom animation on every render because `render()` wipes `innerHTML`. The `.just-died` and `.tap-here` overlay classes use `::before`/`::after` to layer death/tap rings; that's why `.cell` is `position: relative`.
- Levels can have wildcards (`?`) that the player tap on freely — `placeSeed` doesn't treat `?` cells specially. The wildcard only affects `isWin` and lose-state mismatch counts.
- The spec's "5×5 only / no other rules" constraint has been intentionally relaxed for walls, anchors, wildcards, and bigger-seed levels. Don't try to "fix" this back to spec.
