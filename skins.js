// Skins visuales (sin DOM): paleta de 12 colores alineada con COLORS de
// tetris-core.js, colores de tablero opcionales y una función de dibujo por
// bloque. Se carga en el navegador como global `TetrisSkins` (después de
// tetris-core.js) y en Node con require() para los tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tetris-core.js'));
  else root.TetrisSkins = factory(root.TetrisCore);
})(typeof self !== 'undefined' ? self : this, function (core) {
  'use strict';

  const DEFAULT_SKIN = 'retro';

  // Paletas: índice 0 vacío, 1..12 en el mismo orden que PIECE_DEFS
  // (I, O, T, S, Z, J, L, PLUS, U, Y, SINGLE, RING).
  const RETRO_COLORS = core.COLORS.slice();

  const NEON_COLORS = [null,
    '#00f0ff', '#fff200', '#d000ff', '#39ff14', '#ff073a', '#2979ff',
    '#ff9100', '#ff2bd6', '#7c4dff', '#1de9b6', '#ffe600', '#ff6e40',
  ];

  const PASTEL_COLORS = [null,
    '#a8e6ef', '#fdf1a7', '#d7bde2', '#b8e2c8', '#f5b7b1', '#bcd4f6',
    '#fad7a0', '#f8c8dc', '#c5cae9', '#a3d9d0', '#ffe8a3', '#d7ccc8',
  ];

  const PIXEL_COLORS = [null,
    '#3cbcfc', '#f8d838', '#b858f8', '#58d854', '#f83800', '#0078f8',
    '#fc9838', '#f878f8', '#6888fc', '#00b800', '#fce0a8', '#ac7c00',
  ];

  // ---- utilidades de color ----

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // amount > 0 aclara hacia blanco, < 0 oscurece hacia negro (rango -1..1)
  function shade(hex, amount) {
    const target = amount < 0 ? 0 : 255;
    const t = Math.abs(amount);
    const [r, g, b] = hexToRgb(hex).map(v => Math.round(v + (target - v) * t));
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Rectángulo redondeado con arcos manuales (no depende de ctx.roundRect)
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - r);
    ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  }

  // ---- funciones de dibujo ----
  // Firma común: (ctx, px, py, size, color, alpha, env) donde px/py son
  // píxeles de la esquina de la celda y env.shine es el brillo del tema.

  function drawRetro(ctx, px, py, size, color, alpha, env) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    ctx.fillStyle = (env && env.shine) || 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(px + 1, py + 1, size - 2, 4);
    ctx.globalAlpha = 1;
  }

  function drawNeon(ctx, px, py, size, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = alpha < 1 ? 6 : 14;
    // borde luminoso + interior translúcido
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 3, py + 3, size - 6, size - 6);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = color;
    ctx.fillRect(px + 4, py + 4, size - 8, size - 8);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = shade(color, 0.6);
    ctx.fillRect(px + size / 2 - 2, py + size / 2 - 2, 4, 4);
    ctx.restore(); // restaura shadowBlur/shadowColor/alpha: no se filtran a otros dibujos
  }

  function drawPastel(ctx, px, py, size, color, alpha) {
    const r = size * 0.28;
    ctx.save();
    ctx.globalAlpha = alpha;
    roundRectPath(ctx, px + 1.5, py + 1.5, size - 3, size - 3, r);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = shade(color, -0.18);
    ctx.stroke();
    // brillo suave arriba a la izquierda
    roundRectPath(ctx, px + 5, py + 4, size * 0.45, size * 0.22, size * 0.11);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();
    ctx.restore();
  }

  function drawPixel(ctx, px, py, size, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const light = shade(color, 0.35);
    const dark = shade(color, -0.3);
    const border = shade(color, -0.55);
    ctx.fillStyle = border;
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = color;
    ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
    // textura determinista en tramado (dither) de "píxeles" de 3 px
    const p = Math.max(2, Math.floor(size / 10));
    const cells = Math.floor((size - 4) / p);
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const x = px + 2 + i * p;
        const y = py + 2 + j * p;
        if (i === 0 || j === 0) { ctx.fillStyle = light; ctx.fillRect(x, y, p, p); }
        else if (i === cells - 1 || j === cells - 1) { ctx.fillStyle = dark; ctx.fillRect(x, y, p, p); }
        else if ((i + j) % 4 === 0 && i % 2 === 0) { ctx.fillStyle = dark; ctx.fillRect(x, y, p, p); }
        else if ((i * 3 + j) % 7 === 0) { ctx.fillStyle = light; ctx.fillRect(x, y, p, p); }
      }
    }
    ctx.restore();
  }

  // board: null → usa los colores CSS del tema (--board-bg / --grid);
  // si no, { dark: {bg, grid}, light: {bg, grid} }.
  const SKINS = [
    { id: 'retro', name: 'Retro', colors: RETRO_COLORS, board: null, drawBlock: drawRetro },
    {
      id: 'neon', name: 'Neon', colors: NEON_COLORS,
      board: { dark: { bg: '#000000', grid: '#0d1b2a' }, light: { bg: '#000000', grid: '#0d1b2a' } },
      drawBlock: drawNeon,
    },
    {
      id: 'pastel', name: 'Pastel', colors: PASTEL_COLORS,
      board: { dark: { bg: '#2a2735', grid: '#35314a' }, light: { bg: '#fffaf5', grid: '#f1e8df' } },
      drawBlock: drawPastel,
    },
    {
      id: 'pixel', name: 'Pixel art', colors: PIXEL_COLORS,
      board: { dark: { bg: '#101018', grid: '#1c1c28' }, light: { bg: '#e8e4d4', grid: '#d6d0bc' } },
      drawBlock: drawPixel,
    },
  ];

  const BY_ID = Object.fromEntries(SKINS.map(s => [s.id, s]));

  // Devuelve un id válido; cualquier valor desconocido cae en 'retro'
  function resolveSkinId(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id) ? id : DEFAULT_SKIN;
  }

  function getSkin(id) {
    return BY_ID[resolveSkinId(id)];
  }

  // Colores de tablero para el tema dado, o null si se usan los del CSS
  function boardColors(skin, theme) {
    if (!skin.board) return null;
    return skin.board[theme === 'light' ? 'light' : 'dark'];
  }

  return { SKINS, DEFAULT_SKIN, resolveSkinId, getSkin, boardColors, roundRectPath, shade };
});
