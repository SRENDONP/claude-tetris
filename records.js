// Tabla de records local (lógica pura, sin DOM): top 5 de puntuaciones con
// nombre, mejor combo y máximo de líneas. El almacenamiento es inyectable
// (localStorage en el navegador, un objeto falso en los tests). Se carga en el
// navegador como global `TetrisRecords` y en Node con require().
(function (root, factory) {
  const records = factory();
  if (typeof module === 'object' && module.exports) module.exports = records;
  else root.TetrisRecords = records;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_RECORDS = 5;
  const NAME_MAX_LENGTH = 12;
  const DEFAULT_NAME = 'JUGADOR';
  const STORAGE_KEY = 'tetris-records';

  function emptyData() {
    return { scores: [], bestCombo: 0, maxLines: 0 };
  }

  function toCount(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  // Nombre limpio: sin espacios sobrantes, recortado y con valor por defecto
  function sanitizeName(name) {
    const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
    return clean || DEFAULT_NAME;
  }

  // Ordena de mayor a menor; a igual puntuación se queda antes el más antiguo
  function sortScores(scores) {
    return scores
      .map((entry, i) => ({ entry, i }))
      .sort((a, b) => b.entry.score - a.entry.score || a.i - b.i)
      .map(({ entry }) => entry);
  }

  // Convierte cualquier cosa leída del almacenamiento en datos válidos
  function normalize(raw) {
    const data = emptyData();
    if (!raw || typeof raw !== 'object') return data;
    if (Array.isArray(raw.scores)) {
      const valid = raw.scores
        .filter(e => e && typeof e === 'object' && Number(e.score) > 0)
        .map(e => ({ name: sanitizeName(e.name), score: toCount(e.score), lines: toCount(e.lines) }));
      data.scores = sortScores(valid).slice(0, MAX_RECORDS);
    }
    data.bestCombo = toCount(raw.bestCombo);
    data.maxLines = toCount(raw.maxLines);
    return data;
  }

  // ¿La puntuación entra en el top? (0 puntos nunca cuenta como record)
  function qualifies(score, scores) {
    if (!(score > 0)) return false;
    if (scores.length < MAX_RECORDS) return true;
    return score > scores[scores.length - 1].score;
  }

  // Devuelve una lista nueva con la entrada insertada (máx. 5) y su posición,
  // o index -1 si no ha entrado en el top
  function insertScore(scores, entry) {
    const item = { name: sanitizeName(entry.name), score: toCount(entry.score), lines: toCount(entry.lines) };
    if (!qualifies(item.score, scores)) return { scores: scores.slice(), index: -1 };
    const list = sortScores([...scores, item]).slice(0, MAX_RECORDS);
    return { scores: list, index: list.indexOf(item) };
  }

  // Actualiza mejor combo y líneas máximas con el resultado de una partida
  function updateStats(data, result) {
    return {
      ...data,
      bestCombo: Math.max(data.bestCombo, toCount(result.combo)),
      maxLines: Math.max(data.maxLines, toCount(result.lines)),
    };
  }

  // Envoltorio del almacenamiento: nunca lanza (modo privado, cuota llena,
  // JSON corrupto...) y siempre devuelve datos válidos
  function createStore(storage, key = STORAGE_KEY) {
    return {
      load() {
        try {
          const text = storage && storage.getItem(key);
          return text ? normalize(JSON.parse(text)) : emptyData();
        } catch (e) {
          return emptyData();
        }
      },
      save(data) {
        const clean = normalize(data);
        try {
          if (storage) storage.setItem(key, JSON.stringify(clean));
        } catch (e) { /* sin almacenamiento: los records duran lo que la página */ }
        return clean;
      },
      reset() {
        try {
          if (storage) storage.removeItem(key);
        } catch (e) { /* ignorar */ }
        return emptyData();
      },
    };
  }

  return {
    MAX_RECORDS, NAME_MAX_LENGTH, DEFAULT_NAME, STORAGE_KEY,
    emptyData, normalize, sanitizeName, qualifies, insertScore, updateStats, createStore,
  };
});
