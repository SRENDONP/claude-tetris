'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../records.js');

const { emptyRecords, sanitizeName, loadRecords, saveRecords, clearRecords, rankFor, addEntry, updateStats } = R;

// almacenamiento en memoria con la misma interfaz que localStorage
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
  };
}

const throwingStorage = {
  getItem() { throw new Error('bloqueado'); },
  setItem() { throw new Error('bloqueado'); },
  removeItem() { throw new Error('bloqueado'); },
};

const withScores = (...scores) =>
  ({ ...emptyRecords(), top: scores.map((score, i) => ({ name: `J${i}`, score, lines: 0, combo: 0 })) });

describe('rankFor', () => {
  test('una tabla vacía acepta cualquier puntuación positiva', () => {
    assert.equal(rankFor(emptyRecords(), 10), 0);
  });

  test('una puntuación de 0 nunca entra', () => {
    assert.equal(rankFor(emptyRecords(), 0), -1);
  });

  test('calcula el puesto según la puntuación', () => {
    const rec = withScores(500, 300, 100);
    assert.equal(rankFor(rec, 600), 0);
    assert.equal(rankFor(rec, 400), 1);
    assert.equal(rankFor(rec, 50), 3);
  });

  test('con el top lleno hay que superar al último', () => {
    const rec = withScores(500, 400, 300, 200, 100);
    assert.equal(rankFor(rec, 100), -1);
    assert.equal(rankFor(rec, 101), 4);
  });

  test('en empate el record antiguo queda por delante', () => {
    assert.equal(rankFor(withScores(500, 300), 300), 2);
  });
});

describe('addEntry', () => {
  test('inserta en su puesto y recorta a MAX_ENTRIES', () => {
    const rec = withScores(500, 400, 300, 200, 100);
    const { records, rank } = addEntry(rec, { name: 'Ana', score: 350, lines: 12, combo: 3 });
    assert.equal(rank, 2);
    assert.equal(records.top.length, R.MAX_ENTRIES);
    assert.deepEqual(records.top.map(e => e.score), [500, 400, 350, 300, 200]);
    assert.deepEqual(records.top[2], { name: 'Ana', score: 350, lines: 12, combo: 3 });
  });

  test('no modifica los records originales', () => {
    const rec = withScores(100);
    addEntry(rec, { name: 'Ana', score: 200 });
    assert.equal(rec.top.length, 1);
  });

  test('si no entra devuelve los mismos records y rank -1', () => {
    const rec = withScores(500, 400, 300, 200, 100);
    const res = addEntry(rec, { name: 'Ana', score: 10 });
    assert.equal(res.rank, -1);
    assert.equal(res.records, rec);
  });
});

describe('sanitizeName', () => {
  test('recorta espacios y longitud', () => {
    assert.equal(sanitizeName('  Ana   María  '), 'Ana María');
    assert.equal(sanitizeName('x'.repeat(30)).length, R.MAX_NAME_LENGTH);
  });

  test('un nombre vacío pasa a ser el nombre por defecto', () => {
    assert.equal(sanitizeName('   '), R.DEFAULT_NAME);
    assert.equal(sanitizeName(undefined), R.DEFAULT_NAME);
  });
});

describe('updateStats', () => {
  test('guarda el mejor combo y las líneas máximas e indica si son nuevas', () => {
    const first = updateStats(emptyRecords(), { lines: 20, combo: 4 });
    assert.deepEqual([first.records.bestCombo, first.records.maxLines], [4, 20]);
    assert.deepEqual([first.newCombo, first.newLines], [true, true]);

    const second = updateStats(first.records, { lines: 30, combo: 2 });
    assert.deepEqual([second.records.bestCombo, second.records.maxLines], [4, 30]);
    assert.deepEqual([second.newCombo, second.newLines], [false, true]);
  });

  test('igualar una marca no cuenta como nueva', () => {
    const { newCombo, newLines } = updateStats({ ...emptyRecords(), bestCombo: 3, maxLines: 10 }, { lines: 10, combo: 3 });
    assert.deepEqual([newCombo, newLines], [false, false]);
  });
});

describe('persistencia', () => {
  test('guardar y cargar conserva los records', () => {
    const storage = memoryStorage();
    const { records } = addEntry(emptyRecords(), { name: 'Ana', score: 900, lines: 8, combo: 2 });
    saveRecords(storage, { ...records, bestCombo: 5, maxLines: 40 });
    assert.deepEqual(loadRecords(storage), {
      top: [{ name: 'Ana', score: 900, lines: 8, combo: 2 }],
      bestCombo: 5,
      maxLines: 40,
    });
  });

  test('sin datos, JSON corrupto o formato inesperado da records vacíos', () => {
    assert.deepEqual(loadRecords(memoryStorage()), emptyRecords());
    assert.deepEqual(loadRecords(memoryStorage({ [R.STORAGE_KEY]: '{no es json' })), emptyRecords());
    assert.deepEqual(loadRecords(memoryStorage({ [R.STORAGE_KEY]: '[1,2,3]' })), emptyRecords());
    assert.deepEqual(loadRecords(null), emptyRecords());
  });

  test('descarta entradas inválidas, ordena y limita el top', () => {
    const stored = {
      top: [
        { name: 'a', score: 10 }, null, { name: 'b', score: 'x' }, { name: 'c', score: 50 },
        { score: 30 }, { name: 'd', score: 40 }, { name: 'e', score: 20 }, { name: 'f', score: 60 },
      ],
      bestCombo: -2,
      maxLines: 'mucho',
    };
    const rec = loadRecords(memoryStorage({ [R.STORAGE_KEY]: JSON.stringify(stored) }));
    assert.deepEqual(rec.top.map(e => e.score), [60, 50, 40, 30, 20]);
    assert.equal(rec.top[3].name, R.DEFAULT_NAME);
    assert.deepEqual([rec.bestCombo, rec.maxLines], [0, 0]);
  });

  test('clearRecords borra lo guardado', () => {
    const storage = memoryStorage();
    saveRecords(storage, withScores(100));
    assert.deepEqual(clearRecords(storage), emptyRecords());
    assert.deepEqual(loadRecords(storage), emptyRecords());
  });

  test('un almacenamiento que lanza errores no rompe nada', () => {
    assert.deepEqual(loadRecords(throwingStorage), emptyRecords());
    assert.doesNotThrow(() => saveRecords(throwingStorage, withScores(100)));
    assert.deepEqual(clearRecords(throwingStorage), emptyRecords());
  });
});
