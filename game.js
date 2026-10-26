'use strict';

// piezas, colisiones, rotación, borrado de líneas y generador: tetris-core.js
const { COLS, ROWS, COLORS, PIECES, createBoard, rotateCW, clearFullLines, onLinesCleared, createGenerator } = TetrisCore;
const { MAX_START_LEVEL, levelForLines, dropIntervalForLevel, clampStartLevel } = TetrisCore;
const BLOCK = 30;

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const themeText = document.getElementById('theme-text');
const pauseMenu = document.getElementById('pause-menu');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsBackBtn = document.getElementById('controls-back-btn');
const levelDownBtn = document.getElementById('level-down');
const levelUpBtn = document.getElementById('level-up');
const startLevelEl = document.getElementById('start-level-value');

const START_LEVEL_KEY = 'tetris-start-level';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, generator;
let startLevel = loadStartLevel(); // el que se usará en la próxima partida
let gameStartLevel;                // el de la partida en curso

// Teclas pulsadas ahora mismo. Al salir del menú, las que sigan pulsadas se
// ignoran hasta soltarlas, para que la autorrepetición no mueva la pieza.
const pressedKeys = new Set();
let suppressedKeys = new Set();

function randomPiece() {
  const type = generator.next();
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  return TetrisCore.collide(board, shape, ox, oy);
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  const cleared = clearFullLines(board);
  onLinesCleared(cleared, generator); // un Tetris deja pendiente la pieza 1×1
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = levelForLines(lines, gameStartLevel);
    dropInterval = dropIntervalForLevel(level);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = cssVar('--block-shine');
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = cssVar('--grid');
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function loadStartLevel() {
  try {
    return clampStartLevel(localStorage.getItem(START_LEVEL_KEY) ?? 1);
  } catch {
    return 1;
  }
}

function setStartLevel(value) {
  startLevel = clampStartLevel(value);
  startLevelEl.textContent = startLevel;
  levelDownBtn.disabled = startLevel <= 1;
  levelUpBtn.disabled = startLevel >= MAX_START_LEVEL;
  try {
    localStorage.setItem(START_LEVEL_KEY, String(startLevel));
  } catch {
    // sin almacenamiento: el nivel solo dura esta sesión
  }
}

function showPauseView(view) {
  pauseMain.classList.toggle('hidden', view !== 'main');
  pauseControls.classList.toggle('hidden', view !== 'controls');
  (view === 'controls' ? controlsBackBtn : resumeBtn).focus();
}

function openPauseMenu() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  pauseMenu.classList.remove('hidden');
  showPauseView('main');
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  suppressedKeys = new Set(pressedKeys);
}

function resume() {
  if (!paused) return;
  closePauseMenu();
  paused = false;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

// Flechas arriba/abajo recorren los botones visibles del menú; izquierda y
// derecha cambian el nivel inicial cuando el foco está en el selector.
function handleMenuKey(e) {
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
    if (e.code === 'Escape' && !pauseControls.classList.contains('hidden')) showPauseView('main');
    else resume();
    return;
  }
  const focusables = [...pauseMenu.querySelectorAll('.pause-view:not(.hidden) button:not(:disabled)')];
  const idx = focusables.indexOf(document.activeElement);
  switch (e.code) {
    case 'ArrowUp':
    case 'ArrowDown': {
      e.preventDefault();
      const step = e.code === 'ArrowDown' ? 1 : -1;
      const nextIdx = idx < 0 ? 0 : (idx + step + focusables.length) % focusables.length;
      focusables[nextIdx].focus();
      break;
    }
    case 'ArrowLeft':
    case 'ArrowRight':
      if (document.activeElement === levelDownBtn || document.activeElement === levelUpBtn) {
        e.preventDefault();
        setStartLevel(startLevel + (e.code === 'ArrowRight' ? 1 : -1));
        // si el botón enfocado se deshabilita, el foco pasa al otro
        if (document.activeElement.disabled) (levelDownBtn.disabled ? levelUpBtn : levelDownBtn).focus();
      }
      break;
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() dentro de este frame no puede cancelar el frame en curso,
  // así que no hay que volver a programar el bucle
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel;
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  dropInterval = dropIntervalForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  generator = createGenerator();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  pressedKeys.add(e.code);
  if (e.target === themeToggle && e.code === 'Space') e.preventDefault();
  // con el menú abierto el juego no recibe ninguna tecla
  if (paused) { handleMenuKey(e); return; }
  if (gameOver) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) openPauseMenu();
    return;
  }
  if (suppressedKeys.has(e.code)) {
    if (e.code === 'Space') e.preventDefault();
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => {
  pressedKeys.delete(e.code);
  suppressedKeys.delete(e.code);
});

// si la ventana pierde el foco no llegan los keyup: olvidar las teclas
window.addEventListener('blur', () => {
  pressedKeys.clear();
  suppressedKeys.clear();
});

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', resume);
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => showPauseView('controls'));
controlsBackBtn.addEventListener('click', () => showPauseView('main'));
levelDownBtn.addEventListener('click', () => setStartLevel(startLevel - 1));
levelUpBtn.addEventListener('click', () => setStartLevel(startLevel + 1));

function setTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-checked', String(light));
  themeText.textContent = light ? 'Claro' : 'Oscuro';
  // repintar: si el juego está en pausa o terminado el bucle no lo hace
  draw();
  drawNext();
}

themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Espacio (caída) active el botón
});

setStartLevel(startLevel);
init();
setTheme('dark');
