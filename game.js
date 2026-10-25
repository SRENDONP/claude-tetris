'use strict';

// piezas, colisiones, rotación, borrado de líneas y generador: tetris-core.js
const { COLS, ROWS, COLORS, PIECES, createBoard, rotateCW, clearFullLines, onLinesCleared, createGenerator } = TetrisCore;
const { MIN_START_LEVEL, MAX_START_LEVEL, clampStartLevel, levelFor, dropIntervalFor } = TetrisCore;
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
const skinSelect = document.getElementById('skin-select');
const SKIN_KEY = 'tetris-skin';
let skin = TetrisSkins.getSkin(TetrisSkins.DEFAULT_SKIN);

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, generator;
// combo: piezas seguidas que borran líneas; maxCombo: el mejor de la partida
let combo = 0, maxCombo = 0;

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
  combo = cleared ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = levelFor(lines, gameStartLevel);
    dropInterval = dropIntervalFor(level);
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

// el dibujo de cada bloque lo hace la skin activa (skins.js)
function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = skin.colors[colorIndex] || COLORS[colorIndex];
  skin.drawBlock(context, x * size, y * size, size, color, alpha ?? 1, { shine: cssVar('--block-shine') });
}

// fondo del canvas: el de la skin si lo define, si no el del tema (CSS)
function clearCanvas(context, c) {
  const colors = TetrisSkins.boardColors(skin, document.documentElement.dataset.theme);
  context.clearRect(0, 0, c.width, c.height);
  context.fillStyle = colors ? colors.bg : cssVar('--board-bg');
  context.fillRect(0, 0, c.width, c.height);
}

function drawGrid() {
  const colors = TetrisSkins.boardColors(skin, document.documentElement.dataset.theme);
  ctx.strokeStyle = colors ? colors.grid : cssVar('--grid');
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
  clearCanvas(ctx, canvas);
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
  clearCanvas(nextCtx, nextCanvas);
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
  RecordsUI.showGameOver({ score, lines, combo: maxCombo }); // con el overlay ya visible para enfocar el nombre
}

// ---- Menú de pausa ----
const pauseMenu = document.getElementById('pause-menu');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsBackBtn = document.getElementById('controls-back-btn');
const startLevelSelect = document.getElementById('start-level');
const START_LEVEL_KEY = 'tetris.startLevel';

// startLevel: elegido en el menú (próxima partida); gameStartLevel: el de la partida en curso
let startLevel = loadStartLevel();
let gameStartLevel = startLevel;
// teclas pulsadas ahora mismo y las que ya lo estaban al reanudar/reiniciar:
// las repeticiones automáticas de estas últimas se ignoran hasta soltarlas
const pressedKeys = new Set();
let heldAtResume = new Set();

function loadStartLevel() {
  try {
    return clampStartLevel(localStorage.getItem(START_LEVEL_KEY) ?? MIN_START_LEVEL);
  } catch {
    return MIN_START_LEVEL;
  }
}

function saveStartLevel() {
  try { localStorage.setItem(START_LEVEL_KEY, String(startLevel)); } catch { /* sin almacenamiento */ }
}

for (let lv = MIN_START_LEVEL; lv <= MAX_START_LEVEL; lv++) {
  const opt = document.createElement('option');
  opt.value = String(lv);
  opt.textContent = String(lv);
  startLevelSelect.appendChild(opt);
}
startLevelSelect.value = String(startLevel);

function showPauseView(view) {
  const showControls = view === 'controls';
  pauseMain.classList.toggle('hidden', showControls);
  pauseControls.classList.toggle('hidden', !showControls);
  (showControls ? controlsBackBtn : resumeBtn).focus();
}

function openPauseMenu() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  pauseMenu.classList.remove('hidden');
  showPauseView('main');
}

// Cierra el menú sin reanudar el bucle (lo usan reanudar e init).
function hidePauseMenu() {
  // quitar el foco evita que Espacio/Enter vuelvan a pulsar un botón del menú
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  pauseMenu.classList.add('hidden');
}

function resumeGame() {
  if (!paused || gameOver) return;
  hidePauseMenu();
  paused = false;
  heldAtResume = new Set(pressedKeys);
  // reiniciar el reloj para que la pieza no caiga de golpe al volver; dropAccum se
  // conserva para que pausar repetidamente no congele la gravedad
  lastTime = performance.now();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// Navegación con teclado dentro del menú. Nunca llega a las acciones del juego.
function handlePauseMenuKey(e) {
  const onSelect = e.target === startLevelSelect;
  const onButton = e.target instanceof HTMLButtonElement && pauseMenu.contains(e.target);
  if (e.code === 'Escape' && onSelect) {
    // Escape sobre el selector solo lo cierra/abandona, no reanuda
    resumeBtn.focus();
    return;
  }
  if (e.code === 'Escape' && !pauseControls.classList.contains('hidden')) {
    showPauseView('main');
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) resumeGame();
    return;
  }
  const arrow = (e.code === 'ArrowUp' || e.code === 'ArrowDown') && !onSelect;
  if (arrow || e.code === 'Tab') {
    // foco circular dentro de la vista actual (también atrapa Tab en el diálogo)
    e.preventDefault();
    const view = pauseControls.classList.contains('hidden') ? pauseMain : pauseControls;
    const items = [...view.querySelectorAll('button, select')];
    const i = items.indexOf(document.activeElement);
    const step = (e.code === 'ArrowDown' || (e.code === 'Tab' && !e.shiftKey)) ? 1 : -1;
    const nextIndex = i === -1 ? (step > 0 ? 0 : items.length - 1) : (i + step + items.length) % items.length;
    items[nextIndex].focus();
    return;
  }
  // Espacio solo activa botones del menú; en otro sitio no debe desplazar la página
  if (e.code === 'Space' && !onButton && !onSelect) e.preventDefault();
}

resumeBtn.addEventListener('click', resumeGame);
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => showPauseView('controls'));
controlsBackBtn.addEventListener('click', () => showPauseView('main'));
startLevelSelect.addEventListener('change', () => {
  startLevel = clampStartLevel(startLevelSelect.value);
  saveStartLevel();
});

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
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  hidePauseMenu();
  restartBtn.blur(); // que Enter/Espacio no vuelvan a pulsar «Reiniciar» en plena partida
  heldAtResume = new Set(pressedKeys);
  dropInterval = dropIntervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  generator = createGenerator();
  next = randomPiece();
  spawn();
  updateHUD();
  RecordsUI.hideGameOver();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  pressedKeys.add(e.code);
  // escribiendo el nombre o usando los botones de la tabla de records
  if (e.target instanceof Element && e.target.closest('input, .records')) return;
  if (e.target === themeToggle && e.code === 'Space') e.preventDefault();
  // con el selector de skin enfocado, las flechas solo cambian la opción
  if (e.target === skinSelect && e.code !== 'KeyP' && e.code !== 'Escape') return;
  if (paused) { handlePauseMenuKey(e); return; }
  if (gameOver) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) openPauseMenu();
    return;
  }
  if (e.repeat && heldAtResume.has(e.code)) return;
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
  heldAtResume.delete(e.code);
});
window.addEventListener('blur', () => {
  pressedKeys.clear();
  heldAtResume.clear();
});

restartBtn.addEventListener('click', init);

function setTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-checked', String(light));
  themeText.textContent = light ? 'Claro' : 'Oscuro';
  // repintar: si el juego está en pausa o terminado el bucle no lo hace
  if (!current) return; // aún en la pantalla de inicio
  draw();
  drawNext();
}

themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Espacio (caída) active el botón
});

function setSkin(id) {
  skin = TetrisSkins.getSkin(id);
  skinSelect.value = skin.id;
  document.documentElement.dataset.skin = skin.id;
  try { localStorage.setItem(SKIN_KEY, skin.id); } catch (_) { /* sin almacenamiento */ }
  if (!current) return; // aún en la pantalla de inicio
  draw();
  drawNext();
}

function loadSkin() {
  try { return localStorage.getItem(SKIN_KEY); } catch (_) { return null; }
}

for (const s of TetrisSkins.SKINS) skinSelect.add(new Option(s.name, s.id));
skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur(); // evita que Espacio/flechas sigan cambiando la skin al jugar
});

gameOver = true; // ninguna tecla de juego hasta pulsar Jugar
setTheme('dark');
setSkin(loadSkin());
RecordsUI.showStart(init);
