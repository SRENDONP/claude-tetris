// Lógica pura del juego (sin DOM): piezas, rotación, colisiones, borrado de
// líneas y generador. Se carga en el navegador como global `TetrisCore` y en
// Node con require() para los tests.
(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.TetrisCore = core;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLS = 10;
  const ROWS = 20;

  // Para añadir una pieza basta con añadir una entrada aquí (y su peso en
  // SPAWN_CONFIG). Las formas usan 1 para los bloques; el tipo es índice + 1.
  const PIECE_DEFS = [
    { name: 'I', color: '#4dd0e1', shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    { name: 'O', color: '#ffd54f', shape: [[1,1],[1,1]] },
    { name: 'T', color: '#ba68c8', shape: [[0,1,0],[1,1,1],[0,0,0]] },
    { name: 'S', color: '#81c784', shape: [[0,1,1],[1,1,0],[0,0,0]] },
    { name: 'Z', color: '#e57373', shape: [[1,1,0],[0,1,1],[0,0,0]] },
    { name: 'J', color: '#90caf9', shape: [[1,0,0],[1,1,1],[0,0,0]] },
    { name: 'L', color: '#ffb74d', shape: [[0,0,1],[1,1,1],[0,0,0]] },
    // pentominós
    { name: 'PLUS', color: '#f06292', shape: [[0,1,0],[1,1,1],[0,1,0]] },
    { name: 'U', color: '#7986cb', shape: [[1,0,1],[1,1,1],[0,0,0]] },
    { name: 'Y', color: '#4db6ac', shape: [[0,0,0,0],[1,1,1,1],[0,1,0,0],[0,0,0,0]] },
    // especiales
    { name: 'SINGLE', color: '#ffd700', shape: [[1]] },          // recompensa por Tetris
    { name: 'RING', color: '#a1887f', shape: [[1,1,1],[1,0,1],[1,1,1]] }, // reto
  ];

  const STANDARD_WEIGHT = 90 / 7;

  // Probabilidades de aparición. Los pesos son relativos (no hace falta que
  // sumen 100). SINGLE tiene peso 0: solo sale como recompensa.
  const SPAWN_CONFIG = {
    weights: {
      I: STANDARD_WEIGHT, O: STANDARD_WEIGHT, T: STANDARD_WEIGHT, S: STANDARD_WEIGHT,
      Z: STANDARD_WEIGHT, J: STANDARD_WEIGHT, L: STANDARD_WEIGHT,
      PLUS: 3, U: 3, Y: 2,
      RING: 2,
      SINGLE: 0,
    },
    rewardPiece: 'SINGLE',
    rewardChance: 0.35, // probabilidad por aparición de entregar la 1×1 pendiente
    rewardMaxWait: 4,   // como mucho sale en esta aparición tras el Tetris
  };

  const COLORS = [null, ...PIECE_DEFS.map(d => d.color)];
  const PIECES = [null, ...PIECE_DEFS.map((d, i) => d.shape.map(row => row.map(v => (v ? i + 1 : 0))))];
  const TYPE = Object.fromEntries(PIECE_DEFS.map((d, i) => [d.name, i + 1]));

  function createBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  }

  function collide(board, shape, ox, oy) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = ox + c;
        const ny = oy + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function rotateCW(shape) {
    const rows = shape.length, cols = shape[0].length;
    const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        result[c][rows - 1 - r] = shape[r][c];
    return result;
  }

  // Borra las filas completas del tablero (in place) y devuelve cuántas borró.
  function clearFullLines(board) {
    let cleared = 0;
    for (let r = board.length - 1; r >= 0; r--) {
      if (board[r].every(v => v !== 0)) {
        board.splice(r, 1);
        board.unshift(new Array(board[0].length).fill(0));
        cleared++;
        r++;
      }
    }
    return cleared;
  }

  // Solo un Tetris real (4 líneas en una jugada) da la pieza de recompensa.
  function onLinesCleared(cleared, generator) {
    if (cleared === 4) {
      generator.grantReward();
      return true;
    }
    return false;
  }

  function createGenerator(rng = Math.random, config = SPAWN_CONFIG) {
    const pool = Object.entries(config.weights)
      .filter(([, w]) => w > 0)
      .map(([name, w]) => ({ type: TYPE[name], w }));
    const total = pool.reduce((s, p) => s + p.w, 0);
    let pendingRewards = 0;
    let waited = 0;

    function weightedPick() {
      let roll = rng() * total;
      for (const p of pool) {
        if (roll < p.w) return p.type;
        roll -= p.w;
      }
      return pool[pool.length - 1].type;
    }

    return {
      grantReward() { pendingRewards++; },
      get pendingRewards() { return pendingRewards; },
      next() {
        if (pendingRewards > 0) {
          waited++;
          if (waited >= config.rewardMaxWait || rng() < config.rewardChance) {
            pendingRewards--;
            waited = 0;
            return TYPE[config.rewardPiece];
          }
        }
        return weightedPick();
      },
    };
  }

  // Nivel inicial elegible en el menú de pausa.
  const MIN_START_LEVEL = 1;
  const MAX_START_LEVEL = 10;

  // Normaliza un nivel inicial cualquiera (texto, NaN, fuera de rango) a 1..10.
  function clampStartLevel(value) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return MIN_START_LEVEL;
    return Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, n));
  }

  // Se sube un nivel cada 10 líneas, partiendo del nivel inicial elegido.
  function levelFor(lines, startLevel = 1) {
    return clampStartLevel(startLevel) + Math.floor(lines / 10);
  }

  // Milisegundos entre caídas automáticas para un nivel (mínimo 100).
  function dropIntervalFor(level) {
    return Math.max(100, 1000 - (level - 1) * 90);
  }

  return {
    MIN_START_LEVEL, MAX_START_LEVEL, clampStartLevel, levelFor, dropIntervalFor,
    COLS, ROWS, PIECE_DEFS, SPAWN_CONFIG, COLORS, PIECES, TYPE,
    createBoard, collide, rotateCW, clearFullLines, onLinesCleared, createGenerator,
  };
});
