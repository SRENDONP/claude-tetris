// Tabla de records local (sin DOM): top de puntuaciones con nombre, mejor
// combo y líneas máximas. Se guarda en localStorage; se carga en el navegador
// como global `TetrisRecords` y en Node con require() para los tests.
(function (root, factory) {
  const records = factory();
  if (typeof module === 'object' && module.exports) module.exports = records;
  else root.TetrisRecords = records;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'tetris-records';
  const MAX_ENTRIES = 5;
  const MAX_NAME_LENGTH = 12;
  const DEFAULT_NAME = 'Anónimo';

  function emptyRecords() {
    return { top: [], bestCombo: 0, maxLines: 0 };
  }

  const toCount = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

  function sanitizeName(name) {
    const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
    return clean || DEFAULT_NAME;
  }

  // Normaliza datos leídos del almacenamiento: cualquier cosa corrupta o con
  // otro formato se descarta en lugar de romper el juego.
  function normalize(data) {
    const rec = emptyRecords();
    if (!data || typeof data !== 'object') return rec;
    if (Array.isArray(data.top)) {
      rec.top = data.top
        .filter(e => e && typeof e === 'object' && toCount(e.score) > 0)
        .map(e => ({ name: sanitizeName(e.name), score: toCount(e.score), lines: toCount(e.lines), combo: toCount(e.combo) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ENTRIES);
    }
    rec.bestCombo = toCount(data.bestCombo);
    rec.maxLines = toCount(data.maxLines);
    return rec;
  }

  // storage puede no existir o lanzar (modo privado, cookies bloqueadas):
  // en ese caso los records simplemente no persisten.
  function loadRecords(storage) {
    try {
      const raw = storage && storage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyRecords();
    } catch {
      return emptyRecords();
    }
  }

  function saveRecords(storage, rec) {
    try {
      if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(rec));
    } catch { /* sin persistencia */ }
  }

  function clearRecords(storage) {
    try {
      if (storage) storage.removeItem(STORAGE_KEY);
    } catch { /* sin persistencia */ }
    return emptyRecords();
  }

  // Puesto (0-based) que ocuparía la puntuación, o -1 si no entra en el top.
  // En empate gana el record más antiguo.
  function rankFor(rec, score) {
    if (!(score > 0)) return -1;
    const i = rec.top.findIndex(e => score > e.score);
    if (i !== -1) return i;
    return rec.top.length < MAX_ENTRIES ? rec.top.length : -1;
  }

  // Devuelve una copia con la partida añadida al top (si entra) y el puesto.
  function addEntry(rec, { name, score, lines, combo }) {
    const rank = rankFor(rec, score);
    if (rank === -1) return { records: rec, rank };
    const top = [...rec.top];
    top.splice(rank, 0, { name: sanitizeName(name), score, lines: toCount(lines), combo: toCount(combo) });
    return { records: { ...rec, top: top.slice(0, MAX_ENTRIES) }, rank };
  }

  // Mejor combo y líneas máximas cuentan para cualquier partida, entre o no
  // en el top. Devuelve también qué marcas se han superado.
  function updateStats(rec, { lines, combo }) {
    const newCombo = toCount(combo) > rec.bestCombo;
    const newLines = toCount(lines) > rec.maxLines;
    return {
      records: {
        ...rec,
        bestCombo: Math.max(rec.bestCombo, toCount(combo)),
        maxLines: Math.max(rec.maxLines, toCount(lines)),
      },
      newCombo,
      newLines,
    };
  }

  return {
    STORAGE_KEY, MAX_ENTRIES, MAX_NAME_LENGTH, DEFAULT_NAME,
    emptyRecords, sanitizeName, normalize, loadRecords, saveRecords, clearRecords,
    rankFor, addEntry, updateStats,
  };
});
