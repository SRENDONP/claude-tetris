'use strict';

// Interfaz de la tabla de records: pantalla de inicio, tabla en el game over,
// formulario de nombre y botón de borrado. La lógica pura está en records.js.
const RecordsUI = (function () {
  const R = TetrisRecords;

  function getStorage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  const store = R.createStore(getStorage());
  let data = store.load();
  // estado del game over: partida pendiente de guardar y fila a resaltar
  let pending = null;
  let highlight = -1;
  let onPlay = null;

  const startOverlay = document.getElementById('start-overlay');
  const startRecords = document.getElementById('start-records');
  const playBtn = document.getElementById('play-btn');
  const gameoverRecords = document.getElementById('gameover-records');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // textContent: nada de HTML en los nombres
    return node;
  }

  function renderTable() {
    if (!data.scores.length) return el('p', 'records-empty', 'Aún no hay records');
    const table = el('table', 'records-table');
    const head = table.createTHead().insertRow();
    for (const h of ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS']) head.appendChild(el('th', '', h));
    const body = table.createTBody();
    data.scores.forEach((entry, i) => {
      const row = body.insertRow();
      if (i === highlight) row.className = 'record-new';
      row.appendChild(el('td', '', String(i + 1)));
      row.appendChild(el('td', 'record-name', entry.name));
      row.appendChild(el('td', '', entry.score.toLocaleString()));
      row.appendChild(el('td', '', String(entry.lines)));
    });
    return table;
  }

  function renderStats() {
    const stats = el('p', 'records-stats');
    stats.append('Mejor combo: ', el('strong', '', String(data.bestCombo)),
      ' · Líneas máx.: ', el('strong', '', String(data.maxLines)));
    return stats;
  }

  function renderNameForm() {
    const form = el('form', 'record-form');
    form.appendChild(el('p', 'record-msg', '¡Nuevo record! Entras en el top 5'));
    const input = el('input', 'record-input');
    input.type = 'text';
    input.maxLength = R.NAME_MAX_LENGTH;
    input.value = R.DEFAULT_NAME;
    input.setAttribute('aria-label', 'Tu nombre');
    input.autocomplete = 'off';
    const save = el('button', 'records-btn', 'Guardar');
    save.type = 'submit';
    const row = el('div', 'record-form-row');
    row.append(input, save);
    form.appendChild(row);
    form.addEventListener('submit', e => {
      e.preventDefault(); // Enter también envía
      saveScore(input.value);
    });
    return form;
  }

  function renderBlock(container, withForm) {
    container.replaceChildren();
    if (withForm) container.appendChild(renderNameForm());
    container.append(renderTable(), renderStats());
    const reset = el('button', 'records-btn records-reset', 'Borrar records');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      reset.blur(); // evita que Espacio/Enter vuelvan a abrir el diálogo
      resetRecords();
    });
    container.appendChild(reset);
  }

  function renderAll() {
    renderBlock(startRecords, false);
    if (gameoverRecords.dataset.active) {
      const withForm = !!pending;
      renderBlock(gameoverRecords, withForm);
      if (withForm) {
        const input = gameoverRecords.querySelector('.record-input');
        input.focus();
        input.select();
      }
    }
  }

  function saveScore(name) {
    if (!pending) return;
    const result = R.insertScore(data.scores, { ...pending, name });
    data = store.save({ ...data, scores: result.scores });
    highlight = result.index;
    pending = null;
    renderAll();
  }

  function resetRecords() {
    if (!window.confirm('¿Borrar todos los records?')) return;
    data = store.reset();
    highlight = -1;
    renderAll();
  }

  // Fin de partida: las estadísticas se guardan siempre; si la puntuación
  // entra en el top se pide el nombre
  function showGameOver(result) {
    data = store.save(R.updateStats(data, result));
    highlight = -1;
    pending = R.qualifies(result.score, data.scores) ? { score: result.score, lines: result.lines } : null;
    gameoverRecords.dataset.active = '1';
    renderAll();
  }

  // Al reiniciar sin pulsar Guardar el record no se pierde: se guarda con el
  // nombre por defecto
  function hideGameOver() {
    if (pending) {
      data = store.save({ ...data, scores: R.insertScore(data.scores, pending).scores });
    }
    pending = null;
    highlight = -1;
    delete gameoverRecords.dataset.active;
    gameoverRecords.replaceChildren();
  }

  function showStart(playHandler) {
    onPlay = playHandler;
    renderAll();
    startOverlay.classList.remove('hidden');
    playBtn.focus();
  }

  playBtn.addEventListener('click', () => {
    startOverlay.classList.add('hidden');
    playBtn.blur(); // evita que Espacio (caída) vuelva a pulsar el botón
    if (onPlay) onPlay();
  });

  return { showStart, showGameOver, hideGameOver };
})();
