(function () {
  const SOLVED_KEY = 'mr_solved';
  const TUTORIAL_KEY = 'mr_tutorial_seen';
  const CONCEPTS_KEY = 'mr_concepts_seen';
  const LEVELS_VERSION_KEY = 'mr_levels_version';
  const CURRENT_LEVELS_VERSION = '3';

  if (localStorage.getItem(LEVELS_VERSION_KEY) !== CURRENT_LEVELS_VERSION) {
    localStorage.removeItem(SOLVED_KEY);
    localStorage.removeItem(TUTORIAL_KEY);
    localStorage.removeItem(CONCEPTS_KEY);
    localStorage.setItem(LEVELS_VERSION_KEY, CURRENT_LEVELS_VERSION);
  }

  function loadConcepts() {
    try {
      const raw = localStorage.getItem(CONCEPTS_KEY);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch (e) {
      return new Set();
    }
  }

  function persistConcepts(set) {
    localStorage.setItem(CONCEPTS_KEY, JSON.stringify([...set]));
  }

  // ----- inline guided first level (playable-style) -----
  // The guide drives the real level-1 board: it highlights the next cell to tap,
  // then pulses Tick, instead of a separate multi-screen modal.
  function buildGuideSeq(solution) {
    if (!solution) return null;
    return solution.map(function (a) {
      const m = a.match(/place\((\d+),(\d+)\)/);
      return m ? { type: 'place', x: +m[1], y: +m[2] } : { type: 'tick' };
    });
  }

  function guideNext() {
    if (!state.guide.active || !state.guide.seq) return null;
    return state.guide.seq[state.guide.idx] || null;
  }

  function advanceGuide() {
    if (!state.guide.active) return;
    state.guide.idx++;
    if (state.guide.idx >= state.guide.seq.length) {
      state.guide.active = false;
      localStorage.setItem(TUTORIAL_KEY, '1');
      state.seenConcepts.add('rule');
      state.seenConcepts.add('tick');
      persistConcepts(state.seenConcepts);
    }
  }

  function guideHintText() {
    const a = guideNext();
    if (!a) return '';
    if (a.type === 'tick') return 'Жми Tick — по правилу сада клетки между семенами оживут, а семена уйдут.';
    return 'Тапни светящуюся клетку, чтобы посадить семя.';
  }

  const state = {
    view: 'menu',
    levelId: 1,
    current: null,
    seedsLeft: 0,
    ticksLeft: 0,
    history: [],
    solvedLevels: loadSolved(),
    seenConcepts: loadConcepts(),
    showRule: false,
    introDismissed: false,
    lastDelta: null,
    deltaConsumed: true,
    pendingEndAt: 0,
    solving: false,
    guide: { active: false, seq: null, idx: 0 }
  };

  const SOLUTIONS = {
    1:  ['place(2,1)','place(2,3)','tick'],
    2:  ['place(2,1)','place(2,3)','tick'],
    3:  ['place(2,1)','place(2,2)','tick'],
    4:  ['place(2,1)','place(2,3)','tick'],
    5:  ['place(2,1)','place(2,3)','tick','tick'],
    6:  ['place(2,1)','place(2,3)','tick','tick'],
    7:  ['place(2,1)','place(2,2)','tick'],
    8:  ['place(0,2)','place(4,2)','tick'],
    9:  ['place(2,0)','place(2,1)','tick','tick','tick'],
    10: ['place(2,1)','place(2,3)','tick'],
    11: ['place(2,1)','place(2,3)','tick','tick','tick'],
    12: ['place(2,1)','place(2,2)','tick','tick','tick','tick'],
    13: ['place(2,1)','place(2,2)','place(2,3)','tick'],
    14: ['place(1,2)','place(2,2)','tick','tick','tick','tick'],
    15: ['place(2,1)','place(2,3)','tick','place(2,0)','tick'],
    16: ['place(2,1)','place(2,2)','tick','tick','tick','tick'],
    17: ['place(1,1)','place(2,1)','place(1,2)','place(2,2)','tick'],
    18: ['place(2,1)','place(2,3)','tick','place(1,3)','place(3,3)'],
    19: ['place(2,0)','place(0,2)','place(4,2)','place(2,4)','tick'],
    20: ['place(2,0)','place(2,1)','place(2,2)','place(2,3)','tick'],
    21: ['place(2,1)','place(2,3)','tick','place(0,2)','place(4,2)','tick']
  };

  const SOLVE_PLACE_DELAY_MS = 700;
  const SOLVE_TICK_DELAY_MS = 1500;
  let solveToken = 0;

  const END_DELAY_MS = 1400;

  function setDelta(d) {
    state.lastDelta = d;
    state.deltaConsumed = false;
  }

  function computeDelta(prev, next) {
    const bornCells = [];
    const diedCells = [];
    const flows = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (prev[y][x] === 0 && next[y][x] === 1) {
          bornCells.push([x, y]);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < 5 && ny >= 0 && ny < 5 && prev[ny][nx] === 1) {
                flows.push({ fromX: nx, fromY: ny, toX: x, toY: y });
              }
            }
          }
        } else if (prev[y][x] === 1 && next[y][x] === 0) {
          diedCells.push([x, y]);
        }
      }
    }
    return { bornCells, diedCells, born: bornCells.length, died: diedCells.length, flows };
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

  function loadLevel(id, opts) {
    const lvl = getLevel(id);
    if (!lvl) return;
    clearCelebration();
    state.solving = false;
    solveToken++;
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
    state.introDismissed = false;
    const wantGuide = (opts && typeof opts.guide === 'boolean')
      ? opts.guide
      : (id === 1);
    state.guide = wantGuide
      ? { active: true, seq: buildGuideSeq(SOLUTIONS[id]), idx: 0 }
      : { active: false, seq: null, idx: 0 };
    render();
  }

  function dismissIntro(conceptId) {
    state.seenConcepts.add(conceptId);
    persistConcepts(state.seenConcepts);
    state.introDismissed = true;
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
        launchConfetti();
      } else if (state.seedsLeft === 0 && state.ticksLeft === 0) {
        state.view = 'lose';
        render();
        flashLose();
      }
    }, END_DELAY_MS);
  }

  // Celebration / fail feedback. These live on document.body, outside #app,
  // so render() (which wipes #app) never clears them mid-animation.
  function launchConfetti() {
    const colors = ['#B8542E', '#2E4A1F', '#C99A3A', '#D9A57F', '#9CC15B'];
    for (let i = 0; i < 70; i++) {
      const d = document.createElement('div');
      d.className = 'confetti-piece';
      d.style.left = (Math.random() * 100) + 'vw';
      d.style.background = colors[i % colors.length];
      d.style.borderRadius = Math.random() < 0.5 ? '2px' : '50%';
      d.style.animation = 'confetti-fall ' + (1400 + Math.random() * 1300) + 'ms ease-in ' + (Math.random() * 400) + 'ms forwards';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 3300);
    }
  }

  function flashLose() {
    const f = document.createElement('div');
    f.className = 'lose-flash';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }

  function clearCelebration() {
    document.querySelectorAll('.confetti-piece, .lose-flash').forEach(n => n.remove());
  }

  function placeSeed(x, y) {
    if (state.view !== 'level') return;
    if (state.seedsLeft <= 0) return;
    if (state.walls && state.walls[y][x]) return;
    if (state.anchors && state.anchors[y][x]) return;
    if (state.current[y][x] === 1) return;
    if (state.guide.active && !state.solving) {
      const a = guideNext();
      if (!a || a.type !== 'place' || a.x !== x || a.y !== y) return;
    }
    pushSnapshot();
    state.current[y][x] = 1;
    state.seedsLeft -= 1;
    setDelta({ action: 'seed', born: 1, died: 0, bornCells: [[x, y]], diedCells: [] });
    playSeed();
    if (state.guide.active) advanceGuide();
    render();
    scheduleEndCheck();
  }

  function runTick() {
    if (state.view !== 'level') return;
    if (state.ticksLeft <= 0) return;
    if (state.guide.active && !state.solving) {
      const a = guideNext();
      if (!a || a.type !== 'tick') return;
    }
    pushSnapshot();
    const prev = state.current;
    state.current = step(state.current, state.walls, state.anchors);
    state.ticksLeft -= 1;
    const delta = computeDelta(prev, state.current);
    setDelta({ action: 'tick', ...delta });
    playTick();
    if (state.guide.active) advanceGuide();
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
    loadLevel(state.levelId);
  }

  function solve() {
    if (state.view !== 'level' && state.view !== 'lose' && state.view !== 'win') return;
    const sol = SOLUTIONS[state.levelId];
    if (!sol) return;
    loadLevel(state.levelId);
    state.guide = { active: false, seq: null, idx: 0 };
    const myToken = solveToken;
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
      let nextDelay = SOLVE_PLACE_DELAY_MS;
      if (a === 'tick') {
        runTick();
        nextDelay = SOLVE_TICK_DELAY_MS;
      } else {
        const m = a.match(/place\((\d+),(\d+)\)/);
        if (m) placeSeed(+m[1], +m[2]);
      }
      setTimeout(stepFn, nextDelay);
    };
    setTimeout(stepFn, 450);
  }

  function goToMenu() {
    clearCelebration();
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
    app.appendChild(renderMute());
    if (state.lastDelta && !state.deltaConsumed) {
      state.deltaConsumed = true;
    }
  }

  function renderIntroCard(lvl) {
    if (!lvl.intro || !lvl.conceptId) return null;
    if (state.seenConcepts.has(lvl.conceptId)) return null;
    if (state.introDismissed) return null;
    return el('div', { class: 'intro-card' }, [
      el('div', { class: 'intro-label' }, 'Новое'),
      el('p', { class: 'intro-text' }, lvl.intro),
      el('button', {
        class: 'btn-primary intro-dismiss',
        onclick: () => dismissIntro(lvl.conceptId)
      }, 'Понятно')
    ]);
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

  function renderMiniGrid(rows) {
    const grid = el('div', { class: 'mini-grid' });
    for (const row of rows) {
      for (const c of row) {
        const classes = ['mini-cell'];
        if (c === 'X') classes.push('alive');
        else if (c === 'A') classes.push('mini-anchor');
        else if (c === '#') classes.push('mini-wall');
        else if (c === '?') classes.push('mini-wildcard');
        grid.appendChild(el('div', { class: classes.join(' ') }));
      }
    }
    return grid;
  }

  function renderRuleItem(text, before, after) {
    return el('li', { class: 'rule-item' }, [
      el('div', { class: 'rule-item-text' }, text),
      el('div', { class: 'rule-item-example' }, [
        renderMiniGrid(before),
        el('div', { class: 'rule-item-arrow' }, '→'),
        renderMiniGrid(after)
      ])
    ]);
  }

  function renderSpecialItem(text, sample) {
    return el('li', { class: 'rule-item rule-item-special' }, [
      el('div', { class: 'rule-item-text' }, text),
      el('div', { class: 'rule-item-example' }, [
        renderMiniGrid(sample)
      ])
    ]);
  }

  function renderRuleCard() {
    return el('section', { class: 'rule-card', 'aria-label': 'Правило игры' }, [
      el('h3', { class: 'rule-title' }, 'Правило'),
      el('p', { class: 'rule-lead' }, 'Клетка жива на следующем тике, только если у неё ровно 2 живых соседа (считаются все 8, включая диагональные).'),
      el('ul', { class: 'rule-list' }, [
        renderRuleItem('Пустая клетка с 2 живыми соседями — оживает',
          ['.X.','...','.X.'], ['...','.X.','...']),
        renderRuleItem('Живая клетка с 2 живыми соседями — остаётся живой',
          ['X.X','.X.','...'], ['...','.X.','...']),
        renderRuleItem('У клетки 0, 1, 3 и более соседей — пустеет (умирает)',
          ['.X.','.X.','...'], ['...','...','...'])
      ]),
      el('h4', { class: 'rule-subtitle' }, 'Особые клетки'),
      el('ul', { class: 'rule-list' }, [
        renderSpecialItem('Стена (серая с штриховкой) — нельзя посадить, не считается соседом, всегда пустая',
          ['...','.#.','...']),
        renderSpecialItem('Якорь (золотистая) — всегда живая, считается соседом, не умирает',
          ['...','.A.','...']),
        renderSpecialItem('Точечная цель — вольная клетка: подходит любое состояние',
          ['...','.?.','...'])
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
    screen.appendChild(el('h1', {}, 'Garden of Life'));

    const firstUnsolved = LEVELS.find(l => !state.solvedLevels.has(l.id));
    const nextToPlay = firstUnsolved ? firstUnsolved.id : 1;

    screen.appendChild(el('div', { class: 'play-row' }, [
      el('button', {
        class: 'btn-primary',
        onclick: () => loadLevel(nextToPlay)
      }, 'Play'),
      el('button', {
        class: 'btn-secondary tutorial-replay',
        onclick: () => loadLevel(1, { guide: true })
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

    const guiding = state.guide.active && !state.solving;
    screen.appendChild(el('h2', { class: 'level-title' }, `"${lvl.title}"`));
    screen.appendChild(el('p', { class: 'hint' }, guiding ? guideHintText() : lvl.hint));
    screen.appendChild(el('div', { class: 'divider' }));

    const intro = guiding ? null : renderIntroCard(lvl);
    if (intro) screen.appendChild(intro);

    const gridSection = el('div', { class: 'grid-section' });
    gridSection.appendChild(renderGrid(lvl));
    const sd = state.lastDelta && !state.deltaConsumed;
    if (sd && state.lastDelta.flows && state.lastDelta.flows.length) {
      gridSection.appendChild(renderFlowOverlay(state.lastDelta.flows));
    }
    screen.appendChild(gridSection);

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
      const guideTickNow = guiding && guideNext() && guideNext().type === 'tick';
      const guideBlockTick = guiding && !guideTickNow;
      screen.appendChild(el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn-secondary',
          onclick: undo,
          disabled: state.history.length === 0 || state.solving || guiding ? true : false
        }, 'Undo'),
        el('button', {
          class: 'btn-primary' + (guideTickNow ? ' tick-hint' : ''),
          onclick: runTick,
          disabled: state.ticksLeft <= 0 || state.solving || guideBlockTick ? true : false
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

  function renderFlowOverlay(flows) {
    const PITCH = 68;
    const HALF = 28;
    const SIZE = 5 * 56 + 4 * 12;
    const circles = flows.map((f, i) => {
      const fromX = f.fromX * PITCH + HALF;
      const fromY = f.fromY * PITCH + HALF;
      const toX = f.toX * PITCH + HALF;
      const toY = f.toY * PITCH + HALF;
      const dx = (toX - fromX).toFixed(1);
      const dy = (toY - fromY).toFixed(1);
      const delay = i * 55;
      return `<circle cx="${fromX}" cy="${fromY}" r="7" class="flow-particle" style="--dx: ${dx}px; --dy: ${dy}px; animation-delay: ${delay}ms" />`;
    }).join('');
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg class="flow-overlay" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${circles}</svg>`;
    return wrap.firstChild;
  }

  function renderGrid(lvl) {
    const grid = el('div', { class: 'grid', role: 'grid', 'aria-label': 'Garden grid' });
    const showDelta = state.lastDelta && !state.deltaConsumed;
    const isJustDied = (x, y) => showDelta && state.lastDelta.diedCells.some(c => c[0] === x && c[1] === y);
    const isJustBorn = (x, y) => showDelta && state.lastDelta.action === 'tick' && state.lastDelta.bornCells && state.lastDelta.bornCells.some(c => c[0] === x && c[1] === y);
    const showLose = state.view === 'lose';
    const showWin = state.view === 'win';
    const walls = state.walls;
    const anchors = state.anchors;
    const guideAction = (state.guide.active && !state.solving) ? guideNext() : null;
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
        if (alive && !isAnchor && isJustBorn(x, y)) classes.push('just-born');
        if (showLose && isCounted) {
          if (alive && !isTarget && !isAnchor) classes.push('lose-extra');
          if (!alive && isTarget) classes.push('lose-missing');
        }
        if (showWin && alive && !isAnchor) classes.push('win-pulse');
        const isGuideTap = guideAction && guideAction.type === 'place' && guideAction.x === x && guideAction.y === y && !alive && !isWall && !isAnchor;
        if (isGuideTap) classes.push('tap-here');

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
        } else if (guideAction) {
          if (isGuideTap) {
            const cx = x, cy = y;
            attrs.onclick = () => placeSeed(cx, cy);
          } else {
            attrs.disabled = true;
          }
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

  render();
})();
