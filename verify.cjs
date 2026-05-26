const fs = require('fs');
const engineSrc = fs.readFileSync(__dirname + '/engine.js', 'utf8');
const levelsSrc = fs.readFileSync(__dirname + '/levels.js', 'utf8');
eval(engineSrc + '\nglobalThis.step=step; globalThis.parseGrid=parseGrid; globalThis.isWin=isWin; globalThis.cloneGrid=cloneGrid;');
eval(levelsSrc + '\nglobalThis.LEVELS=LEVELS;');

function verify(start, goal, seeds, maxTicks) {
  const startG = parseGrid(start);
  const goalG = parseGrid(goal);
  const eq = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const queue = [{grid: startG, seeds, ticks: maxTicks, path: []}];
  const seen = new Set();
  while (queue.length) {
    const {grid, seeds, ticks, path} = queue.shift();
    if (eq(grid, goalG)) return path;
    if (path.length >= 14) continue;
    const k = JSON.stringify(grid) + seeds + ticks;
    if (seen.has(k)) continue;
    seen.add(k);
    if (ticks > 0) queue.push({grid: step(grid), seeds, ticks: ticks-1, path: [...path, 'tick']});
    if (seeds > 0) {
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        if (grid[y][x] === 0) {
          const ng = cloneGrid(grid); ng[y][x] = 1;
          queue.push({grid: ng, seeds: seeds-1, ticks, path: [...path, `place(${x},${y})`]});
        }
      }
    }
  }
  return null;
}

let allOK = true;
for (const lvl of LEVELS) {
  const sol = verify(lvl.start, lvl.goal, lvl.seeds, lvl.maxTicks);
  const status = sol ? 'OK' : 'FAIL';
  if (!sol) allOK = false;
  console.log(`L${String(lvl.id).padStart(2)} ${lvl.title.padEnd(12)} seeds=${lvl.seeds} ticks=${lvl.maxTicks}  ${status}${sol ? '  ' + sol.join(' -> ') : ''}`);
}
console.log(allOK ? '\nAll levels solvable.' : '\nSOME LEVELS UNSOLVABLE');
