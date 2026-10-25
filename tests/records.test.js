'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../records.js');

// almacenamiento falso con la misma interfaz que localStorage
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    map,
  };
}

const throwing = {
  getItem() { throw new Error('bloqueado'); },
  setItem() { throw new Error('cuota'); },
  removeItem() { throw new Error('bloqueado'); },
};

const entry = (name, score, lines = 0) => ({ name, score, lines });

describe('qualifies', () => {
  test('con menos de 5 records cualquier puntuación positiva entra', () => {
    assert.equal(R.qualifies(1, []), true);
    assert.equal(R.qualifies(10, [entry('A', 100)]), true);
  });

  test('0 puntos nunca entra', () => {
    assert.equal(R.qualifies(0, []), false);
  });

  test('con 5 records hay que superar al último', () => {
    const full = [500, 400, 300, 200, 100].map((s, i) => entry('P' + i, s));
    assert.equal(R.qualifies(100, full), false);
    assert.equal(R.qualifies(101, full), true);
  });
});

describe('insertScore', () => {
  test('inserta ordenado de mayor a menor y devuelve la posición', () => {
    const { scores, index } = R.insertScore([entry('A', 300), entry('B', 100)], entry('C', 200));
    assert.deepEqual(scores.map(e => e.name), ['A', 'C', 'B']);
    assert.equal(index, 1);
  });

  test('mantiene como máximo 5 y descarta el peor', () => {
    const full = [500, 400, 300, 200, 100].map((s, i) => entry('P' + i, s));
    const { scores, index } = R.insertScore(full, entry('NUEVO', 450));
    assert.equal(scores.length, 5);
    assert.equal(index, 1);
    assert.deepEqual(scores.map(e => e.score), [500, 450, 400, 300, 200]);
  });

  test('si no entra devuelve index -1 y la lista intacta', () => {
    const full = [500, 400, 300, 200, 100].map((s, i) => entry('P' + i, s));
    const { scores, index } = R.insertScore(full, entry('X', 50));
    assert.equal(index, -1);
    assert.deepEqual(scores, full);
    assert.notEqual(scores, full);
  });

  test('a igual puntuación el nuevo queda detrás del antiguo', () => {
    const { index } = R.insertScore([entry('A', 100)], entry('B', 100));
    assert.equal(index, 1);
  });

  test('no modifica la lista original', () => {
    const list = [entry('A', 100)];
    R.insertScore(list, entry('B', 200));
    assert.equal(list.length, 1);
  });
});

describe('sanitizeName', () => {
  test('recorta espacios y longitud', () => {
    assert.equal(R.sanitizeName('  Ana   María  '), 'Ana María');
    assert.equal(R.sanitizeName('x'.repeat(30)).length, R.NAME_MAX_LENGTH);
  });

  test('vacío usa el nombre por defecto', () => {
    assert.equal(R.sanitizeName('   '), R.DEFAULT_NAME);
    assert.equal(R.sanitizeName(undefined), R.DEFAULT_NAME);
  });
});

describe('updateStats', () => {
  test('guarda el máximo de combo y líneas', () => {
    let data = R.emptyData();
    data = R.updateStats(data, { combo: 3, lines: 10 });
    data = R.updateStats(data, { combo: 1, lines: 25 });
    assert.equal(data.bestCombo, 3);
    assert.equal(data.maxLines, 25);
  });
});

describe('normalize', () => {
  test('descarta entradas inválidas, ordena y limita a 5', () => {
    const data = R.normalize({
      scores: [null, 'x', { score: 'nope' }, { score: null }, { score: -3 },...[1, 7, 3, 9, 5, 2].map(s => entry('P' + s, s))],
      bestCombo: -4,
      maxLines: '12',
    });
    assert.deepEqual(data.scores.map(e => e.score), [9, 7, 5, 3, 2]);
    assert.equal(data.bestCombo, 0);
    assert.equal(data.maxLines, 12);
  });

  test('cualquier cosa que no sea objeto da datos vacíos', () => {
    assert.deepEqual(R.normalize(null), R.emptyData());
    assert.deepEqual(R.normalize(42), R.emptyData());
    assert.deepEqual(R.normalize({ scores: 'abc' }), R.emptyData());
  });
});

describe('createStore', () => {
  test('sin datos guardados carga vacío', () => {
    assert.deepEqual(R.createStore(fakeStorage()).load(), R.emptyData());
  });

  test('guarda y vuelve a cargar', () => {
    const storage = fakeStorage();
    const store = R.createStore(storage);
    const data = { scores: [entry('Ana', 1200, 8)], bestCombo: 4, maxLines: 8 };
    store.save(data);
    assert.ok(storage.map.has(R.STORAGE_KEY));
    assert.deepEqual(R.createStore(storage).load(), data);
  });

  test('JSON corrupto carga vacío sin lanzar', () => {
    const store = R.createStore(fakeStorage({ [R.STORAGE_KEY]: '{no es json' }));
    assert.deepEqual(store.load(), R.emptyData());
  });

  test('reset borra los records', () => {
    const storage = fakeStorage();
    const store = R.createStore(storage);
    store.save({ scores: [entry('Ana', 10)], bestCombo: 1, maxLines: 1 });
    assert.deepEqual(store.reset(), R.emptyData());
    assert.deepEqual(store.load(), R.emptyData());
  });

  test('un almacenamiento que lanza o no existe no rompe nada', () => {
    for (const storage of [throwing, null]) {
      const store = R.createStore(storage);
      assert.deepEqual(store.load(), R.emptyData());
      assert.deepEqual(store.save({ scores: [entry('A', 5)] }).scores, [entry('A', 5)]);
      assert.deepEqual(store.reset(), R.emptyData());
    }
  });
});
