'use strict';

// piezas, colisiones, rotación, borrado de líneas y generador: tetris-core.js
const { COLS, ROWS, COLORS, PIECES, createBoard, rotateCW, clearFullLines, onLinesCleared, createGenerator } = TetrisCore;
const { loadRecords, saveRecords, clearRecords, rankFor, addEntry, updateStats } = TetrisRecords;
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
const overlayStats = document.getElementById('overlay-stats');
const recordForm = document.getElementById('record-form');
const recordRank = document.getElementById('record-rank');
const recordName = document.getElementById('record-name');
const recordsSection = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const themeText = document.getElementById('theme-text');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, generator;
// combo: piezas seguidas que borran al menos una línea
let combo, maxCombo, started = false;

const storage = (() => { try { return window.localStorage; } catch { return null; } })();
const LAST_NAME_KEY = 'tetris-last-name';
let records = loadRecords(storage);
// partida que entra en el top y aún no se ha guardado con nombre
let pendingEntry = null;
let highlightRank = -1;
let newStats = { newCombo: false, newLines: false };
let gameOverAt = 0;

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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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

function readLastName() {
  try { return storage?.getItem(LAST_NAME_KEY) ?? ''; } catch { return ''; }
}

function renderRecords() {
  // la partida pendiente se muestra ya en su puesto, con el nombre que se
  // está escribiendo
  const top = pendingEntry
    ? addEntry(records, { ...pendingEntry, name: recordName.value }).records.top
    : records.top;
  const rank = pendingEntry ? pendingEntry.rank : highlightRank;

  recordsBody.replaceChildren();
  if (!top.length) {
    const cell = recordsBody.insertRow().insertCell();
    cell.colSpan = 5;
    cell.className = 'records-empty';
    cell.textContent = 'Aún no hay records';
  }
  top.forEach((entry, i) => {
    const row = recordsBody.insertRow();
    if (i === rank) row.className = 'is-current';
    for (const value of [i + 1, entry.name, entry.score.toLocaleString(), entry.lines, entry.combo]) {
      row.insertCell().textContent = value;
    }
  });

  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
  bestComboEl.classList.toggle('is-new', newStats.newCombo);
  maxLinesEl.classList.toggle('is-new', newStats.newLines);
  resetRecordsBtn.classList.toggle('hidden', !records.top.length && !records.bestCombo && !records.maxLines);
}

function commitPendingEntry() {
  if (!pendingEntry) return;
  const name = recordName.value;
  ({ records } = addEntry(records, { ...pendingEntry, name }));
  highlightRank = pendingEntry.rank;
  pendingEntry = null;
  saveRecords(storage, records);
  try { storage?.setItem(LAST_NAME_KEY, name.trim()); } catch { /* sin persistencia */ }
}

function showOverlay(title, { danger = false, scoreText = '', statsText = '', showRecords = false } = {}) {
  overlayTitle.textContent = title;
  overlayTitle.classList.toggle('danger', danger);
  overlayScore.textContent = scoreText;
  overlayStats.textContent = statsText;
  recordForm.classList.toggle('hidden', !(showRecords && pendingEntry));
  recordsSection.classList.toggle('hidden', !showRecords);
  if (showRecords) renderRecords();
  overlay.classList.remove('hidden');
}

function showStart() {
  restartBtn.textContent = 'Jugar';
  showOverlay('¿JUGAMOS?', { showRecords: true });
  restartBtn.focus();
}

function endGame() {
  gameOver = true;
  gameOverAt = performance.now();
  cancelAnimationFrame(animId);

  ({ records, ...newStats } = updateStats(records, { lines, combo: maxCombo }));
  saveRecords(storage, records);
  highlightRank = -1;
  const rank = rankFor(records, score);
  pendingEntry = rank === -1 ? null : { rank, score, lines, combo: maxCombo };
  if (pendingEntry) {
    recordRank.textContent = `#${rank + 1}`;
    recordName.value = readLastName();
  }

  restartBtn.textContent = 'Reiniciar';
  showOverlay('GAME OVER', {
    danger: true,
    scoreText: `Puntuación: ${score.toLocaleString()}`,
    statsText: `Líneas: ${lines} · Combo máx.: ${maxCombo}`,
    showRecords: true,
  });
  if (pendingEntry) {
    recordName.focus();
    recordName.select();
  } else {
    restartBtn.focus();
  }
}

function togglePause() {
  if (!started || gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showOverlay('PAUSA', { danger: true });
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

function resetGame() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  generator = createGenerator();
  next = randomPiece();
  spawn();
  updateHUD();
}

function init() {
  // reiniciar sin pulsar «Guardar» no pierde el record
  commitPendingEntry();
  resetGame();
  started = true;
  overlay.classList.add('hidden');
  restartBtn.blur(); // evita que Espacio (caída) vuelva a pulsar el botón
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === themeToggle && e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyP') { togglePause(); return; }
  if (!started || paused || gameOver) return;
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

restartBtn.addEventListener('click', init);

recordName.addEventListener('input', renderRecords);

// el campo recibe el foco al perder: que las teclas de juego que siguen
// llegando (caída con Espacio, tecla mantenida) no acaben en el nombre
const GAME_KEY_GRACE_MS = 600;
recordName.addEventListener('keydown', e => {
  const gameKey = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code);
  if (gameKey && (e.repeat || performance.now() - gameOverAt < GAME_KEY_GRACE_MS)) e.preventDefault();
});

recordForm.addEventListener('submit', e => {
  e.preventDefault();
  commitPendingEntry();
  recordForm.classList.add('hidden');
  renderRecords();
  restartBtn.focus();
});

// borrado en dos pulsaciones, sin diálogos nativos
let resetArmedTimer = null;

function disarmReset() {
  clearTimeout(resetArmedTimer);
  resetArmedTimer = null;
  resetRecordsBtn.textContent = 'Borrar records';
  resetRecordsBtn.classList.remove('armed');
}

resetRecordsBtn.addEventListener('click', () => {
  if (!resetArmedTimer) {
    resetRecordsBtn.textContent = '¿Seguro? Pulsa otra vez';
    resetRecordsBtn.classList.add('armed');
    resetArmedTimer = setTimeout(disarmReset, 3000);
    return;
  }
  disarmReset();
  records = clearRecords(storage);
  highlightRank = -1;
  newStats = { newCombo: false, newLines: false };
  // la partida recién terminada pasa a entrar en el top vacío
  if (pendingEntry) {
    pendingEntry.rank = rankFor(records, pendingEntry.score);
    recordRank.textContent = `#${pendingEntry.rank + 1}`;
  }
  renderRecords();
});

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

resetGame();
setTheme('dark');
showStart();
