'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../tetris-core.js');

const { PIECES, TYPE, COLORS, SPAWN_CONFIG, COLS, ROWS } = core;
const { createBoard, collide, rotateCW, clearFullLines, onLinesCleared, createGenerator } = core;

const NEW_PIECES = ['PLUS', 'U', 'Y', 'SINGLE', 'RING'];

const countBlocks = shape => shape.flat().filter(Boolean).length;
const shapeOf = name => PIECES[TYPE[name]];
const rotateN = (shape, n) => { for (let i = 0; i < n; i++) shape = rotateCW(shape); return shape; };

// rng determinista que devuelve los valores dados en orden (y repite el último)
function seq(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

// rng pseudoaleatorio con semilla (mulberry32)
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('formas', () => {
  test('número de bloques de las piezas nuevas', () => {
    assert.equal(countBlocks(shapeOf('PLUS')), 5);
    assert.equal(countBlocks(shapeOf('U')), 5);
    assert.equal(countBlocks(shapeOf('Y')), 5);
    assert.equal(countBlocks(shapeOf('SINGLE')), 1);
    assert.equal(countBlocks(shapeOf('RING')), 8);
  });

  test('el anillo tiene el centro vacío', () => {
    assert.equal(shapeOf('RING')[1][1], 0);
  });

  test('cada pieza tiene color y sus celdas usan su índice de tipo', () => {
    for (const name of NEW_PIECES) {
      const type = TYPE[name];
      assert.ok(COLORS[type], `${name} sin color`);
      for (const v of shapeOf(name).flat()) assert.ok(v === 0 || v === type);
    }
  });

  test('las piezas estándar no cambian', () => {
    assert.deepEqual(PIECES[1], [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]]);
    assert.deepEqual(PIECES[6], [[6,0,0],[6,6,6],[0,0,0]]);
    assert.equal(TYPE.L, 7);
  });

  test('todas las piezas caben en el preview de 4×4', () => {
    for (const shape of PIECES.slice(1)) {
      assert.ok(shape.length <= 4 && shape[0].length <= 4);
    }
  });
});

describe('rotaciones', () => {
  for (const name of NEW_PIECES) {
    test(`${name}: 4 rotaciones vuelven a la forma original y conservan bloques`, () => {
      const shape = shapeOf(name);
      for (let n = 1; n <= 4; n++) {
        assert.equal(countBlocks(rotateN(shape, n)), countBlocks(shape));
      }
      assert.deepEqual(rotateN(shape, 4), shape);
    });
  }

  test('PLUS, RING y SINGLE son simétricas al rotar', () => {
    for (const name of ['PLUS', 'RING', 'SINGLE']) {
      assert.deepEqual(rotateCW(shapeOf(name)), shapeOf(name));
    }
  });

  test('U rota en sentido horario', () => {
    const u = TYPE.U;
    assert.deepEqual(rotateCW(shapeOf('U')), [
      [0, u, u],
      [0, u, 0],
      [0, u, u],
    ]);
  });

  test('Y rota en sentido horario', () => {
    const y = TYPE.Y;
    assert.deepEqual(rotateCW(shapeOf('Y')), [
      [0, 0, y, 0],
      [0, y, y, 0],
      [0, 0, y, 0],
      [0, 0, y, 0],
    ]);
  });
});

describe('colisiones', () => {
  test('paredes y suelo', () => {
    const board = createBoard();
    const plus = shapeOf('PLUS');
    assert.equal(collide(board, plus, 0, 0), false);
    assert.equal(collide(board, plus, -1, 0), true);          // pared izquierda
    assert.equal(collide(board, plus, COLS - 3, 0), false);
    assert.equal(collide(board, plus, COLS - 2, 0), true);    // pared derecha
    assert.equal(collide(board, plus, 0, ROWS - 3), false);
    assert.equal(collide(board, plus, 0, ROWS - 2), true);    // suelo
  });

  test('las filas vacías de la matriz no cuentan (Y)', () => {
    const board = createBoard();
    // la fila 0 de Y está vacía: puede asomar por arriba sin chocar
    assert.equal(collide(board, shapeOf('Y'), 0, -1), false);
    // la fila 3 está vacía: su último bloque real queda en la última fila
    assert.equal(collide(board, shapeOf('Y'), 0, ROWS - 3), false);
  });

  test('bloques del tablero', () => {
    const board = createBoard();
    board[5][5] = 1;
    assert.equal(collide(board, shapeOf('U'), 4, 4), true);   // el fondo de la U pisa (5,5)
    assert.equal(collide(board, shapeOf('U'), 4, 6), false);
  });

  test('un bloque en el hueco del anillo no colisiona', () => {
    const board = createBoard();
    board[11][4] = 1;
    assert.equal(collide(board, shapeOf('RING'), 3, 10), false);
    board[10][4] = 1;
    assert.equal(collide(board, shapeOf('RING'), 3, 10), true);
  });

  test('la 1×1 entra en un hueco de una celda', () => {
    const board = createBoard();
    board[ROWS - 1].fill(1);
    board[ROWS - 1][7] = 0;
    assert.equal(collide(board, shapeOf('SINGLE'), 7, ROWS - 1), false);
    assert.equal(collide(board, shapeOf('SINGLE'), 6, ROWS - 1), true);
  });
});

describe('borrado de líneas', () => {
  function boardWithFullRows(n) {
    const board = createBoard();
    for (let r = ROWS - n; r < ROWS; r++) board[r].fill(1);
    board[ROWS - n - 1][0] = 2; // un bloque suelto encima
    return board;
  }

  for (const n of [0, 1, 2, 3, 4]) {
    test(`devuelve ${n} con ${n} filas llenas y baja el resto`, () => {
      const board = boardWithFullRows(n);
      assert.equal(clearFullLines(board), n);
      assert.equal(board.length, ROWS);
      assert.equal(board[ROWS - 1][0], 2);
    });
  }
});

describe('recompensa 1×1', () => {
  test('sin Tetris la 1×1 nunca sale', () => {
    const gen = createGenerator(seeded(42));
    for (let i = 0; i < 5000; i++) assert.notEqual(gen.next(), TYPE.SINGLE);
  });

  test('solo un Tetris (4 líneas) da la recompensa', () => {
    for (const cleared of [0, 1, 2, 3]) {
      const gen = createGenerator(seeded(1));
      assert.equal(onLinesCleared(cleared, gen), false);
      assert.equal(gen.pendingRewards, 0);
    }
    const gen = createGenerator(seeded(1));
    assert.equal(onLinesCleared(4, gen), true);
    assert.equal(gen.pendingRewards, 1);
  });

  test('flujo real: limpiar 3 líneas no da 1×1, limpiar 4 sí', () => {
    const gen = createGenerator(seeded(7));
    const board = createBoard();
    for (let r = ROWS - 3; r < ROWS; r++) board[r].fill(1);
    onLinesCleared(clearFullLines(board), gen);
    assert.equal(gen.pendingRewards, 0);

    for (let r = ROWS - 4; r < ROWS; r++) board[r].fill(1);
    onLinesCleared(clearFullLines(board), gen);
    assert.equal(gen.pendingRewards, 1);
  });

  test('sale como mucho en rewardMaxWait apariciones aunque el azar no ayude', () => {
    const gen = createGenerator(() => 0.99); // nunca pasa rewardChance
    gen.grantReward();
    const drawn = [];
    for (let i = 0; i < SPAWN_CONFIG.rewardMaxWait; i++) drawn.push(gen.next());
    assert.equal(drawn.filter(t => t === TYPE.SINGLE).length, 1);
    assert.equal(drawn[drawn.length - 1], TYPE.SINGLE);
    assert.equal(gen.pendingRewards, 0);
  });

  test('puede salir antes si el azar lo decide', () => {
    const gen = createGenerator(seq(0.1)); // 0.1 < rewardChance
    gen.grantReward();
    assert.equal(gen.next(), TYPE.SINGLE);
  });

  test('varios Tetris acumulan varias recompensas', () => {
    const gen = createGenerator(() => 0.99);
    gen.grantReward();
    gen.grantReward();
    let singles = 0;
    for (let i = 0; i < SPAWN_CONFIG.rewardMaxWait * 2; i++) if (gen.next() === TYPE.SINGLE) singles++;
    assert.equal(singles, 2);
  });
});

describe('generador', () => {
  test('la distribución respeta los pesos configurados', () => {
    const N = 100000;
    const gen = createGenerator(seeded(123));
    const counts = {};
    for (let i = 0; i < N; i++) {
      const t = gen.next();
      counts[t] = (counts[t] || 0) + 1;
    }
    const total = Object.values(SPAWN_CONFIG.weights).reduce((a, b) => a + b, 0);
    for (const [name, w] of Object.entries(SPAWN_CONFIG.weights)) {
      const observed = (counts[TYPE[name]] || 0) / N;
      const expected = w / total;
      assert.ok(Math.abs(observed - expected) < 0.01, `${name}: ${observed} vs ${expected}`);
    }
  });

  test('los pesos son configurables', () => {
    const config = { ...SPAWN_CONFIG, weights: { RING: 1 } };
    const gen = createGenerator(seeded(5), config);
    for (let i = 0; i < 100; i++) assert.equal(gen.next(), TYPE.RING);
  });

  test('cada sorteo devuelve un tipo válido', () => {
    const gen = createGenerator(seeded(9));
    for (let i = 0; i < 1000; i++) {
      const t = gen.next();
      assert.ok(PIECES[t], `tipo inválido ${t}`);
    }
  });
});

describe('nivel inicial y velocidad', () => {
  const { levelFor, dropIntervalFor, clampStartLevel, MIN_START_LEVEL, MAX_START_LEVEL } = core;

  test('levelFor parte del nivel inicial y sube cada 10 líneas', () => {
    assert.equal(levelFor(0), 1);
    assert.equal(levelFor(9), 1);
    assert.equal(levelFor(10), 2);
    assert.equal(levelFor(0, 5), 5);
    assert.equal(levelFor(9, 5), 5);
    assert.equal(levelFor(19, 5), 6);
    assert.equal(levelFor(20, 5), 7);
  });

  test('clampStartLevel limita el nivel inicial a 1..10', () => {
    assert.equal(MIN_START_LEVEL, 1);
    assert.equal(MAX_START_LEVEL, 10);
    assert.equal(clampStartLevel(0), 1);
    assert.equal(clampStartLevel(-3), 1);
    assert.equal(clampStartLevel(11), 10);
    assert.equal(clampStartLevel('7'), 7);
    assert.equal(clampStartLevel('abc'), 1);
    assert.equal(clampStartLevel(null), 1);
    assert.equal(clampStartLevel(3.9), 3);
  });

  test('dropIntervalFor mantiene la fórmula original con mínimo de 100 ms', () => {
    assert.equal(dropIntervalFor(1), 1000);
    assert.equal(dropIntervalFor(2), 910);
    assert.equal(dropIntervalFor(10), 190);
    assert.equal(dropIntervalFor(11), 100);
    assert.equal(dropIntervalFor(50), 100);
  });

  test('un nivel inicial más alto cae más rápido', () => {
    assert.ok(dropIntervalFor(levelFor(0, 5)) < dropIntervalFor(levelFor(0, 1)));
  });
});
