(function () {
  const SOLVED_KEY = 'mr_solved';
  const TUTORIAL_KEY = 'mr_tutorial_seen';

  function emptyGrid() {
    return [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]];
  }

  const TUT_GOAL = [".....",".....",".XXX.",".....","....."];
  const TUT_SEEDS = 2;
  const TUT_TICKS = 1;

  const TUT_STEPS = [
    {
      id: 'intro',
      title: 'Сад и цель',
      text: 'Это поле 5×5. Тёмные кольца показывают цель — эти клетки нужно сделать живыми.',
      advanceBy: 'next',
      pulseGoal: true
    },
    {
      id: 'seed1',
      title: 'Посади первое семя',
      text: 'Тапни клетку с оранжевым пульсом — она тут же станет живой.',
      advanceBy: 'tap',
      tapAt: [2, 1]
    },
    {
      id: 'seed2',
      title: 'Посади второе семя',
      text: 'Теперь нажми на нижнюю отмеченную клетку.',
      advanceBy: 'tap',
      tapAt: [2, 3]
    },
    {
      id: 'rule',
      title: 'Правило сада',
      text: 'У трёх пустых клеток между семенами ровно по 2 живых соседа. По правилу B2/S2 — все три сейчас оживут.',
      advanceBy: 'next',
      arrows: [
        [[2,1],[1,2]], [[2,1],[2,2]], [[2,1],[3,2]],
        [[2,3],[1,2]], [[2,3],[2,2]], [[2,3],[3,2]]
      ]
    },
    {
      id: 'tick',
      title: 'Запусти правило',
      text: 'Жми Tick — правило применится ко всему саду одновременно. Лишние клетки увянут, новые расцветут.',
      advanceBy: 'tick',
      arrows: [
        [[2,1],[1,2]], [[2,1],[2,2]], [[2,1],[3,2]],
        [[2,3],[1,2]], [[2,3],[2,2]], [[2,3],[3,2]]
      ]
    },
    {
      id: 'win',
      title: 'Готово!',
      text: 'Живые клетки совпали с целью — уровень решён. Если что-то пойдёт не так в настоящей игре, ошибки подсвечиваются красным.',
      advanceBy: 'done',
      isWin: true
    }
  ];

  const tutorial = {
    visible: false,
    step: 0,
    grid: null,
    prevGrid: null,
    seedsLeft: 0,
    ticksLeft: 0
  };

  function startTutorial() {
    tutorial.visible = true;
    tutorial.step = 0;
    tutorial.grid = [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]];
    tutorial.prevGrid = null;
    tutorial.seedsLeft = TUT_SEEDS;
    tutorial.ticksLeft = TUT_TICKS;
    render();
  }

  function finishTutorial() {
    tutorial.visible = false;
    localStorage.setItem(TUTORIAL_KEY, '1');
    render();
  }

  function tutorialAdvance() {
    if (tutorial.step < TUT_STEPS.length - 1) {
      tutorial.step++;
      render();
    } else {
      finishTutorial();
    }
  }

  function tutorialCellClick(x, y) {
    const s = TUT_STEPS[tutorial.step];
    if (s.advanceBy !== 'tap') return;
    if (s.tapAt[0] !== x || s.tapAt[1] !== y) return;
    if (tutorial.grid[y][x] === 1) return;
    tutorial.prevGrid = cloneGrid(tutorial.grid);
    tutorial.grid[y][x] = 1;
    tutorial.seedsLeft--;
    playSeed();
    tutorialAdvance();
  }

  function tutorialTickClick() {
    const s = TUT_STEPS[tutorial.step];
    if (s.advanceBy !== 'tick') return;
    if (tutorial.ticksLeft <= 0) return;
    tutorial.prevGrid = cloneGrid(tutorial.grid);
    tutorial.grid = step(tutorial.grid);
    tutorial.ticksLeft--;
    playTick();
    setTimeout(playWin, 250);
    tutorialAdvance();
  }

  const state = {
    view: 'menu',
    levelId: 1,
    current: null,
    seedsLeft: 0,
    ticksLeft: 0,
    history: [],
    solvedLevels: loadSolved(),
    showRule: false,
    lastDelta: null,
    deltaConsumed: true,
    pendingEndAt: 0,
    solving: false
  };

  const SOLUTIONS = {
    1:  ['place(2,1)','place(2,3)','tick'],
    2:  ['place(2,0)','tick'],
    3:  ['tick'],
    4:  ['place(2,1)','place(2,2)','tick'],
    5:  ['place(2,1)','place(2,3)','tick','tick'],
    6:  ['place(2,1)','place(2,3)','tick','tick','tick'],
    7:  ['place(2,0)','place(2,1)','tick','tick','tick'],
    8:  ['place(1,2)','place(2,2)','tick','tick','tick','tick'],
    9:  ['place(2,1)','place(2,2)','tick','tick','tick','tick'],
    10: ['place(1,2)','place(3,2)'],
    11: ['place(2,1)','place(2,3)','tick'],
    12: ['place(2,1)','place(2,3)','tick','tick'],
    13: ['place(2,1)','place(2,2)','tick'],
    14: ['place(0,2)','place(4,2)','tick'],
    15: ['place(2,1)','place(2,2)','tick','tick','tick','tick'],
    16: ['place(2,1)','place(2,3)','tick'],
    17: ['place(1,1)','place(2,1)','place(1,2)','place(2,2)','tick'],
    18: ['place(2,1)','place(2,2)','place(2,3)','tick'],
    19: ['place(2,0)','place(2,1)','place(2,2)','place(2,3)','tick'],
    20: ['place(2,0)','place(0,2)','place(4,2)','place(2,4)','tick'],
    21: ['place(2,1)','place(2,3)','tick','place(1,3)','place(3,3)'],
    22: ['place(2,1)','place(2,3)','tick','place(2,0)','tick'],
    23: ['place(2,1)','place(2,3)','tick','place(0,2)','place(4,2)','tick']
  };

  const SOLVE_DELAY_MS = 650;
  let solveToken = 0;

  const END_DELAY_MS = 1100;

  function setDelta(d) {
    state.lastDelta = d;
    state.deltaConsumed = false;
  }

  function computeDelta(prev, next) {
    const bornCells = [];
    const diedCells = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (prev[y][x] === 0 && next[y][x] === 1) bornCells.push([x, y]);
        else if (prev[y][x] === 1 && next[y][x] === 0) diedCells.push([x, y]);
      }
    }
    return { bornCells, diedCells, born: bornCells.length, died: diedCells.length };
  }

  function loadSolved() {
    try {
      const raw = localStorage.getItem(SOLVED_KEY);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch (e) {
      return new Set();
    }
  }

  function persistSolved() {
    localStorage.setItem(SOLVED_KEY, JSON.stringify([...state.solvedLevels]));
  }

  function getLevel(id) {
    return LEVELS.find(l => l.id === id);
  }

  function loadLevel(id) {
    const lvl = getLevel(id);
    if (!lvl) return;
    const parsed = parseLevel(lvl.start);
    state.view = 'level';
    state.levelId = id;
    state.current = parsed.current;
    state.walls = parsed.walls;
    state.anchors = parsed.anchors;
    state.seedsLeft = lvl.seeds;
    state.ticksLeft = lvl.maxTicks;
    state.history = [];
    state.lastDelta = null;
    state.deltaConsumed = true;
    state.pendingEndAt = Date.now();
    render();
  }

  function pushSnapshot() {
    state.history.push({
      current: cloneGrid(state.current),
      seedsLeft: state.seedsLeft,
      ticksLeft: state.ticksLeft
    });
  }

  function scheduleEndCheck() {
    const lvl = getLevel(state.levelId);
    const won = isWin(state.current, lvl.goal, state.walls);
    const lost = !won && state.seedsLeft === 0 && state.ticksLeft === 0;
    if (!won && !lost) return;
    const stamp = ++state.pendingEndAt;
    setTimeout(() => {
      if (stamp !== state.pendingEndAt) return;
      if (state.view !== 'level') return;
      const lvl2 = getLevel(state.levelId);
      if (isWin(state.current, lvl2.goal, state.walls)) {
        state.view = 'win';
        state.solvedLevels.add(state.levelId);
        persistSolved();
        playWin();
        render();
      } else if (state.seedsLeft === 0 && state.ticksLeft === 0) {
        state.view = 'lose';
        render();
      }
    }, END_DELAY_MS);
  }

  function placeSeed(x, y) {
    if (state.view !== 'level') return;
    if (state.seedsLeft <= 0) return;
    if (state.walls && state.walls[y][x]) return;
    if (state.anchors && state.anchors[y][x]) return;
    if (state.current[y][x] === 1) return;
    pushSnapshot();
    state.current[y][x] = 1;
    state.seedsLeft -= 1;
    setDelta({ action: 'seed', born: 1, died: 0, bornCells: [[x, y]], diedCells: [] });
    playSeed();
    render();
    scheduleEndCheck();
  }

  function runTick() {
    if (state.view !== 'level') return;
    if (state.ticksLeft <= 0) return;
    pushSnapshot();
    const prev = state.current;
    state.current = step(state.current, state.walls, state.anchors);
    state.ticksLeft -= 1;
    const delta = computeDelta(prev, state.current);
    setDelta({ action: 'tick', ...delta });
    playTick();
    render();
    scheduleEndCheck();
  }

  function undo() {
    if (state.view !== 'level' && state.view !== 'lose') return;
    if (state.history.length === 0) return;
    state.pendingEndAt++;
    const snap = state.history.pop();
    state.current = snap.current;
    state.seedsLeft = snap.seedsLeft;
    state.ticksLeft = snap.ticksLeft;
    state.view = 'level';
    setDelta({ action: 'undo', born: 0, died: 0, bornCells: [], diedCells: [] });
    render();
  }

  function restart() {
    state.solving = false;
    solveToken++;
    loadLevel(state.levelId);
  }

  function solve() {
    if (state.view !== 'level' && state.view !== 'lose' && state.view !== 'win') return;
    const sol = SOLUTIONS[state.levelId];
    if (!sol) return;
    solveToken++;
    const myToken = solveToken;
    loadLevel(state.levelId);
    state.solving = true;
    render();
    const actions = sol.slice();
    const stepFn = () => {
      if (myToken !== solveToken) return;
      if (state.view !== 'level') return;
      if (actions.length === 0) {
        state.solving = false;
        render();
        return;
      }
      const a = actions.shift();
      if (a === 'tick') {
        runTick();
      } else {
        const m = a.match(/place\((\d+),(\d+)\)/);
        if (m) placeSeed(+m[1], +m[2]);
      }
      setTimeout(stepFn, SOLVE_DELAY_MS);
    };
    setTimeout(stepFn, 350);
  }

  function goToMenu() {
    state.view = 'menu';
    render();
  }

  function nextLevel() {
    const next = state.levelId + 1;
    if (getLevel(next)) {
      loadLevel(next);
    } else {
      goToMenu();
    }
  }

  const app = document.getElementById('app');

  function el(tag, attrs, children) {
    attrs = attrs || {};
    children = children == null ? [] : children;
    const node = document.createElement(tag);
    for (const k in attrs) {
      const v = attrs[k];
      if (k === 'class') node.className = v;
      else if (k === 'onclick') { if (v) node.addEventListener('click', v); }
      else if (v === false || v == null) continue;
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
    const list = [].concat(children);
    for (const c of list) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function render() {
    app.innerHTML = '';
    if (state.view === 'menu') {
      app.appendChild(renderMenu());
    } else {
      app.appendChild(renderLevel());
    }
    if (state.showRule) app.appendChild(renderRuleModal());
    if (tutorial.visible) app.appendChild(renderTutorial());
    app.appendChild(renderMute());
    if (state.lastDelta && !state.deltaConsumed) {
      state.deltaConsumed = true;
    }
  }

  function renderTutorial() {
    const s = TUT_STEPS[tutorial.step];
    const total = TUT_STEPS.length;

    const dots = document.createElement('div');
    dots.className = 'tutorial-dots';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = 'tutorial-dot' + (i <= tutorial.step ? ' active' : '');
      dots.appendChild(dot);
    }

    const isTickStep = s.advanceBy === 'tick';
    const tickAttrs = {
      class: 'btn-primary tutorial-tick' + (isTickStep ? ' tick-hint' : ''),
      disabled: isTickStep ? false : true
    };
    if (isTickStep) tickAttrs.onclick = tutorialTickClick;
    const tickButton = el('button', tickAttrs, 'Tick');

    const counters = el('div', { class: 'tutorial-counters' }, [
      el('span', { class: 'counter' }, [
        el('span', { class: 'label' }, 'Seeds:'),
        el('span', {}, String(tutorial.seedsLeft))
      ]),
      el('span', { class: 'counter' }, [
        el('span', { class: 'label' }, 'Ticks:'),
        el('span', {}, String(tutorial.ticksLeft))
      ])
    ]);

    const actions = [
      el('button', { class: 'btn-secondary', onclick: finishTutorial }, 'Пропустить')
    ];
    if (s.advanceBy === 'next') {
      actions.push(el('button', { class: 'btn-primary', onclick: tutorialAdvance }, 'Дальше'));
    } else if (s.advanceBy === 'done') {
      actions.push(el('button', { class: 'btn-primary', onclick: tutorialAdvance }, 'Начать!'));
    }

    const card = el('div', { class: 'tutorial-card' }, [
      dots,
      el('h2', { class: 'tutorial-title' }, s.title),
      el('p', { class: 'tutorial-text' }, s.text),
      el('div', { class: 'tutorial-stage' }, [
        renderTutorialGridWrap(s),
        counters,
        tickButton
      ]),
      el('div', { class: 'tutorial-actions' }, actions)
    ]);
    return el('div', { class: 'tutorial-overlay' }, [card]);
  }

  function renderTutorialGridWrap(s) {
    const wrap = el('div', { class: 'tutorial-grid-wrap' });
    wrap.appendChild(renderTutorialGrid(s));
    if (s.arrows && s.arrows.length) {
      wrap.appendChild(renderTutorialArrows(s.arrows));
    }
    return wrap;
  }

  function renderTutorialArrows(arrows) {
    const PITCH = 52;
    const HALF = 22;
    const SIZE = 5 * 44 + 4 * 8;
    const container = el('div', { class: 'tutorial-arrows-container', 'aria-hidden': 'true' });
    const lines = arrows.map(([from, to], i) => {
      const x1 = from[0] * PITCH + HALF;
      const y1 = from[1] * PITCH + HALF;
      const x2 = to[0] * PITCH + HALF;
      const y2 = to[1] * PITCH + HALF;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const x1a = (x1 + ux * (HALF * 0.55)).toFixed(1);
      const y1a = (y1 + uy * (HALF * 0.55)).toFixed(1);
      const x2a = (x2 - ux * (HALF * 0.4)).toFixed(1);
      const y2a = (y2 - uy * (HALF * 0.4)).toFixed(1);
      const draw = i * 90;
      const pulse = draw + 600;
      return `<line x1="${x1a}" y1="${y1a}" x2="${x2a}" y2="${y2a}" marker-end="url(#tut-arrow)" style="animation-delay: ${draw}ms, ${pulse}ms" />`;
    }).join('');
    container.innerHTML = `
      <svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg" class="tutorial-arrows-svg">
        <defs>
          <marker id="tut-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#B8542E" />
          </marker>
        </defs>
        ${lines}
      </svg>
    `;
    return container;
  }

  function renderTutorialGrid(s) {
    const grid = el('div', { class: 'grid tutorial-grid' });
    const current = tutorial.grid || emptyGrid();
    const prev = tutorial.prevGrid;
    const tapTarget = s.advanceBy === 'tap' ? s.tapAt : null;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const alive = current[y][x] === 1;
        const wasAlive = prev && prev[y][x] === 1;
        const justDied = wasAlive && !alive;
        const isTarget = TUT_GOAL[y][x] === 'X';
        const isTapHere = tapTarget && tapTarget[0] === x && tapTarget[1] === y && !alive;
        const isPulseGoal = s.pulseGoal && isTarget && !alive;
        const classes = ['cell'];
        if (alive) classes.push('alive');
        if (isTarget) classes.push('target');
        if (justDied) classes.push('just-died');
        if (isTapHere) classes.push('tap-here');
        if (isPulseGoal) classes.push('demo-highlight');
        if (s.isWin && alive) classes.push('win-pulse');
        const attrs = { class: classes.join(' ') };
        if (isTapHere) {
          const cx = x, cy = y;
          attrs.onclick = () => tutorialCellClick(cx, cy);
          attrs['aria-label'] = `Посади семя в клетке ряд ${y+1} столбец ${x+1}`;
        } else {
          attrs.disabled = true;
          attrs['aria-hidden'] = 'true';
        }
        if (s.isWin && alive) attrs.style = `animation-delay: ${y * 40}ms`;
        grid.appendChild(el('button', attrs));
      }
    }
    return grid;
  }

  function renderStatus(lvl) {
    const won = isWin(state.current, lvl.goal, state.walls);
    const lost = !won && state.seedsLeft === 0 && state.ticksLeft === 0;
    let text = '';
    let tone = 'neutral';
    if (won) {
      text = 'Сад совпал с целью — уровень собран';
      tone = 'good';
    } else if (lost) {
      text = 'Семена и тики закончились — цель не собрана';
      tone = 'bad';
    } else if (!state.lastDelta) {
      text = 'Размести семена и запускай тик';
    } else {
      const d = state.lastDelta;
      if (d.action === 'seed') text = 'Семя посажено · клетка стала живой';
      else if (d.action === 'undo') text = 'Шаг отменён';
      else if (d.action === 'tick') {
        if (d.born === 0 && d.died === 0) text = 'Тик · поле осталось прежним';
        else if (d.born > 0 && d.died > 0) text = `Тик · ожили ${d.born}, погибли ${d.died}`;
        else if (d.born > 0) text = `Тик · ожили ${d.born}`;
        else text = `Тик · погибли ${d.died}`;
      }
    }
    return el('div', { class: `status status-${tone}` }, text);
  }

  function renderRuleCard() {
    return el('section', { class: 'rule-card', 'aria-label': 'Правило игры' }, [
      el('h3', { class: 'rule-title' }, 'Правило'),
      el('p', { class: 'rule-lead' }, 'Клетка жива на следующем тике, только если у неё ровно 2 живых соседа (считаются все 8, включая диагональные).'),
      el('ul', { class: 'rule-list' }, [
        el('li', {}, 'Пустая клетка с 2 живыми соседями — оживает'),
        el('li', {}, 'Живая клетка с 2 живыми соседями — остаётся живой'),
        el('li', {}, 'У клетки 0, 1, 3 и более соседей — пустеет (умирает)')
      ]),
      el('h4', { class: 'rule-subtitle' }, 'Особые клетки'),
      el('ul', { class: 'rule-list' }, [
        el('li', {}, 'Стена (серая с штриховкой) — нельзя посадить, не считается соседом, всегда пустая'),
        el('li', {}, 'Якорь (золотистая) — всегда живая, считается соседом, не умирает'),
        el('li', {}, 'Точечная цель — вольная клетка: подходит любое состояние')
      ])
    ]);
  }

  function renderRuleModal() {
    const card = el('div', { class: 'overlay-card rule-modal' }, [
      el('h2', {}, 'Правило'),
      renderRuleCard(),
      el('div', { class: 'overlay-actions' }, [
        el('button', {
          class: 'btn-primary',
          onclick: () => { state.showRule = false; render(); }
        }, 'Понятно')
      ])
    ]);
    return el('div', {
      class: 'overlay',
      onclick: (e) => { if (e.target.classList.contains('overlay')) { state.showRule = false; render(); } }
    }, [card]);
  }

  function renderMenu() {
    const screen = el('div', { class: 'screen menu' });
    screen.appendChild(el('h1', {}, [
      'Chain Reaction',
      el('div', {}, 'Garden')
    ]));

    const firstUnsolved = LEVELS.find(l => !state.solvedLevels.has(l.id));
    const nextToPlay = firstUnsolved ? firstUnsolved.id : 1;

    screen.appendChild(el('div', { class: 'play-row' }, [
      el('button', {
        class: 'btn-primary',
        onclick: () => loadLevel(nextToPlay)
      }, 'Play'),
      el('button', {
        class: 'btn-secondary tutorial-replay',
        onclick: startTutorial
      }, 'Туториал')
    ]));

    screen.appendChild(renderRuleCard());

    screen.appendChild(el('div', { class: 'levels-title' }, 'Levels'));

    const grid = el('div', { class: 'level-grid' });
    const maxId = LEVELS[LEVELS.length - 1].id;
    for (let i = 1; i <= maxId; i++) {
      const exists = !!getLevel(i);
      const solved = state.solvedLevels.has(i);
      const isNext = i === nextToPlay && exists;
      const classes = ['level-chip'];
      if (solved) classes.push('solved');
      if (isNext) classes.push('next');
      if (exists && i > 10) classes.push('advanced');
      const attrs = {
        class: classes.join(' '),
        'aria-label': `Уровень ${i}${solved ? ', решён' : ''}${isNext ? ', следующий' : ''}${i > 10 ? ', продвинутый' : ''}`
      };
      if (exists) {
        attrs.onclick = () => loadLevel(i);
      } else {
        attrs.disabled = true;
      }
      grid.appendChild(el('button', attrs, String(i)));
    }
    screen.appendChild(grid);
    return screen;
  }

  function renderLevel() {
    const lvl = getLevel(state.levelId);
    const screen = el('div', { class: 'screen level' });

    screen.appendChild(el('div', { class: 'level-header' }, [
      el('button', { class: 'btn-secondary', onclick: goToMenu, 'aria-label': 'Back to menu' }, '← Menu'),
      el('div', { class: 'header-right' }, [
        el('button', {
          class: 'rule-toggle',
          'aria-label': 'Показать правило',
          onclick: () => { state.showRule = true; render(); }
        }, '?'),
        el('div', { class: 'crumb' }, `Level ${lvl.id}`)
      ])
    ]));

    screen.appendChild(el('h2', { class: 'level-title' }, `"${lvl.title}"`));
    screen.appendChild(el('p', { class: 'hint' }, lvl.hint));
    screen.appendChild(el('div', { class: 'divider' }));

    screen.appendChild(renderGrid(lvl));

    screen.appendChild(el('div', { class: 'counters' }, [
      el('div', { class: 'counter' }, [
        el('span', { class: 'label' }, 'Seeds:'),
        el('span', {}, String(state.seedsLeft))
      ]),
      el('div', { class: 'counter' }, [
        el('span', { class: 'label' }, 'Ticks:'),
        el('span', {}, String(state.ticksLeft))
      ])
    ]));

    screen.appendChild(renderStatus(lvl));

    if (state.view === 'win') {
      screen.appendChild(renderWinPanel(lvl));
    } else if (state.view === 'lose') {
      screen.appendChild(renderLosePanel(lvl));
    } else {
      screen.appendChild(el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn-secondary',
          onclick: undo,
          disabled: state.history.length === 0 || state.solving ? true : false
        }, 'Undo'),
        el('button', {
          class: 'btn-primary',
          onclick: runTick,
          disabled: state.ticksLeft <= 0 || state.solving ? true : false
        }, 'Tick')
      ]));
    }

    screen.appendChild(el('div', { class: 'restart-row' }, [
      el('button', { class: 'btn-secondary', onclick: restart }, 'Restart'),
      el('button', {
        class: 'btn-secondary solve-btn',
        onclick: solve,
        disabled: !SOLUTIONS[state.levelId] || state.solving ? true : false,
        title: 'Показать готовое решение'
      }, state.solving ? '⋯ Решаю' : '💡 Решить')
    ]));

    return screen;
  }

  function renderGrid(lvl) {
    const grid = el('div', { class: 'grid', role: 'grid', 'aria-label': 'Garden grid' });
    const showDelta = state.lastDelta && !state.deltaConsumed;
    const isJustDied = (x, y) => showDelta && state.lastDelta.diedCells.some(c => c[0] === x && c[1] === y);
    const showLose = state.view === 'lose';
    const showWin = state.view === 'win';
    const walls = state.walls;
    const anchors = state.anchors;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const isWall = walls && walls[y][x] === 1;
        const isAnchor = anchors && anchors[y][x] === 1;
        const alive = state.current[y][x] === 1;
        const goalChar = lvl.goal[y][x];
        const isTarget = goalChar === 'X' || goalChar === 'A';
        const isWildcard = goalChar === '?';
        const isCounted = !isWall && !isWildcard && goalChar !== '#';
        const classes = ['cell'];
        if (isWall) classes.push('wall');
        else if (isAnchor) classes.push('anchor', 'alive');
        else if (alive) classes.push('alive');
        if (isTarget && !isWall) classes.push('target');
        if (isWildcard) classes.push('wildcard');
        if (alive && isCounted && !isTarget && !isAnchor) classes.push('off-target');
        if (!alive && !isWall && isJustDied(x, y)) classes.push('just-died');
        if (showLose && isCounted) {
          if (alive && !isTarget && !isAnchor) classes.push('lose-extra');
          if (!alive && isTarget) classes.push('lose-missing');
        }
        if (showWin && alive && !isAnchor) classes.push('win-pulse');

        const role = isWall ? 'стена' : isAnchor ? 'якорь' : (alive ? 'живая' : 'пустая');
        const targetStr = isTarget ? ', цель' : (isWildcard ? ', любое' : '');
        const attrs = {
          class: classes.join(' '),
          'aria-label': `Клетка ряд ${y + 1} столбец ${x + 1}, ${role}${targetStr}`,
          'data-x': x,
          'data-y': y
        };
        if (isWall || isAnchor || alive || state.solving) {
          attrs.disabled = true;
        } else {
          const cx = x, cy = y;
          attrs.onclick = () => placeSeed(cx, cy);
        }
        if (showWin && alive && !isAnchor) {
          attrs.style = `animation-delay: ${y * 40}ms`;
        }
        grid.appendChild(el('button', attrs));
      }
    }
    return grid;
  }

  function renderWinPanel(lvl) {
    const isLast = !getLevel(state.levelId + 1);
    const explainParts = [`Все живые клетки совпали с целью на ${lvl.title}.`];
    if (state.lastDelta && state.lastDelta.action === 'tick') {
      explainParts.push(`Последний тик: ожили ${state.lastDelta.born}, погибли ${state.lastDelta.died}.`);
    }
    return el('div', { class: 'result-panel result-win' }, [
      el('h3', { class: 'result-title' }, isLast ? 'Сад собран целиком' : `Уровень ${lvl.id} решён`),
      el('p', { class: 'result-text' }, explainParts.join(' ')),
      el('div', { class: 'result-actions' }, isLast
        ? [el('button', { class: 'btn-primary', onclick: goToMenu }, 'В меню')]
        : [
            el('button', { class: 'btn-primary', onclick: nextLevel }, 'Следующий уровень'),
            el('button', { class: 'btn-secondary', onclick: restart }, 'Сыграть заново')
          ])
    ]);
  }

  function countMismatches(current, goal, walls) {
    let extra = 0;
    let missing = 0;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (walls && walls[y][x]) continue;
        const c = goal[y][x];
        if (c === '?' || c === '#') continue;
        const target = (c === 'X' || c === 'A') ? 1 : 0;
        if (current[y][x] === 1 && target === 0) extra++;
        else if (current[y][x] === 0 && target === 1) missing++;
      }
    }
    return { extra, missing };
  }

  function renderLosePanel(lvl) {
    const { extra, missing } = countMismatches(state.current, lvl.goal, state.walls);
    const parts = [];
    if (extra > 0 && missing > 0) {
      parts.push(`Лишних живых клеток: ${extra}, недостающих: ${missing}.`);
    } else if (extra > 0) {
      parts.push(`Лишних живых клеток: ${extra}.`);
    } else if (missing > 0) {
      parts.push(`Недостающих клеток: ${missing}.`);
    }
    parts.push('Они подсвечены красным на поле.');
    parts.push('Откати ход и попробуй другое размещение, или начни заново.');
    return el('div', { class: 'result-panel result-lose' }, [
      el('h3', { class: 'result-title' }, 'Не получилось'),
      el('p', { class: 'result-text' }, parts.join(' ')),
      el('div', { class: 'result-actions' }, [
        el('button', { class: 'btn-primary', onclick: restart }, 'Заново'),
        el('button', { class: 'btn-secondary', onclick: undo, disabled: state.history.length === 0 }, 'Отменить ход')
      ])
    ]);
  }

  function renderMute() {
    const muted = isMuted();
    return el('button', {
      class: 'mute-toggle',
      'aria-label': muted ? 'Unmute' : 'Mute',
      onclick: () => { toggleMuted(); render(); }
    }, muted ? '🔇' : '🔊');
  }

  document.addEventListener('keydown', (e) => {
    if (tutorial.visible) {
      if (e.key === 'Escape') { finishTutorial(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        const s = TUT_STEPS[tutorial.step];
        if (s.advanceBy === 'next' || s.advanceBy === 'done') { tutorialAdvance(); e.preventDefault(); }
      }
      return;
    }
    if (state.showRule) {
      if (e.key === 'Escape') { state.showRule = false; render(); e.preventDefault(); }
      return;
    }
    if (state.view === 'level') {
      if (e.key === 't' || e.key === 'T') { runTick(); e.preventDefault(); }
      else if (e.key === 'u' || e.key === 'U') { undo(); e.preventDefault(); }
      else if (e.key === 'r' || e.key === 'R') { restart(); e.preventDefault(); }
      else if (e.key === 'Escape') { goToMenu(); e.preventDefault(); }
    } else if (state.view === 'win' || state.view === 'lose') {
      if (e.key === 'Escape') { goToMenu(); e.preventDefault(); }
    }
  });

  if (!localStorage.getItem(TUTORIAL_KEY)) {
    startTutorial();
  } else {
    render();
  }
})();
