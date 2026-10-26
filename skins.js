// Skins visuales: cada skin define una paleta (por nombre de pieza) y una
// función que dibuja un bloque. Sin estado ni DOM, salvo el contexto 2D que
// recibe draw(). Se carga en el navegador como global `TetrisSkins` y en Node
// con require() para los tests.
(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./tetris-core.js') : root.TetrisCore;
  const skins = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = skins;
  else root.TetrisSkins = skins;
})(typeof self !== 'undefined' ? self : this, function (core) {
  'use strict';

  const DEFAULT_SKIN = 'retro';

  // mezcla un color #rrggbb con blanco (amount > 0) o negro (amount < 0)
  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const target = amount < 0 ? 0 : 255;
    const t = Math.abs(amount);
    const mix = v => Math.round(v + (target - v) * t);
    const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // draw(ctx, x, y, size, color, opts): (x, y) es la esquina en píxeles de la
  // celda. opts.shine es el brillo del tema actual (variable CSS).
  const SKINS = {
    retro: {
      label: 'Retro',
      palette: {}, // colores de tetris-core
      draw(ctx, x, y, s, color, opts) {
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        ctx.fillStyle = opts.shine;
        ctx.fillRect(x + 1, y + 1, s - 2, 4);
      },
    },

    neon: {
      label: 'Neon',
      palette: {
        I: '#00f0ff', O: '#fff200', T: '#d500ff', S: '#39ff14', Z: '#ff1744',
        J: '#2979ff', L: '#ff9100', PLUS: '#ff00aa', U: '#7c4dff', Y: '#1de9b6',
        SINGLE: '#ffffff', RING: '#ff6e40',
      },
      draw(ctx, x, y, s, color) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = s * 0.5;
        ctx.fillStyle = color + '33'; // relleno translúcido
        ctx.fillRect(x + 3, y + 3, s - 6, s - 6);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, s - 6, s - 6);
        // núcleo brillante
        ctx.shadowBlur = s * 0.25;
        ctx.fillStyle = shade(color, 0.6);
        ctx.fillRect(x + s * 0.4, y + s * 0.4, s * 0.2, s * 0.2);
        ctx.restore();
      },
    },

    pastel: {
      label: 'Pastel',
      palette: {
        I: '#a8e6ef', O: '#fdf1a8', T: '#d7b8f3', S: '#b9e8c0', Z: '#f7b2b7',
        J: '#b5cdf7', L: '#fcd2a6', PLUS: '#f8bbd9', U: '#c3c8f2', Y: '#a9dfd8',
        SINGLE: '#fff3b0', RING: '#d9c5bc',
      },
      draw(ctx, x, y, s, color) {
        const r = s * 0.28;
        roundRectPath(ctx, x + 2, y + 2, s - 4, s - 4, r);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = shade(color, -0.18);
        ctx.stroke();
        // reflejo suave arriba a la izquierda
        roundRectPath(ctx, x + s * 0.22, y + s * 0.2, s * 0.3, s * 0.14, s * 0.07);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fill();
      },
    },

    pixel: {
      label: 'Pixel art',
      palette: {
        I: '#3cbcfc', O: '#f8d800', T: '#b53fde', S: '#58d854', Z: '#e40058',
        J: '#0058f8', L: '#f87858', PLUS: '#f878f8', U: '#6844fc', Y: '#00b8a0',
        SINGLE: '#fce0a8', RING: '#ac7c00',
      },
      draw(ctx, x, y, s, color) {
        const p = s / 10; // rejilla de 10×10 "píxeles" por bloque
        const px = (c, r, w, h) => ctx.fillRect(x + c * p, y + r * p, w * p, h * p);
        ctx.fillStyle = shade(color, -0.55); // contorno
        px(0, 0, 10, 10);
        ctx.fillStyle = color;
        px(1, 1, 8, 8);
        ctx.fillStyle = shade(color, 0.45); // bisel claro
        px(1, 1, 8, 1);
        px(1, 2, 1, 7);
        ctx.fillStyle = shade(color, -0.3); // bisel oscuro
        px(1, 8, 8, 1);
        px(8, 1, 1, 7);
        ctx.fillStyle = shade(color, 0.75); // brillo
        px(2, 2, 2, 1);
        px(2, 3, 1, 1);
        ctx.fillStyle = shade(color, -0.15); // textura de tramado
        for (const [c, r] of [[5, 3], [3, 5], [6, 6], [4, 7], [7, 4]]) px(c, r, 1, 1);
      },
    },
  };

  // colores indexados por tipo de pieza (mismo formato que core.COLORS)
  function colorsFor(skin) {
    return [null, ...core.PIECE_DEFS.map(d => skin.palette[d.name] || d.color)];
  }

  function getSkin(name) {
    return Object.prototype.hasOwnProperty.call(SKINS, name) ? SKINS[name] : SKINS[DEFAULT_SKIN];
  }

  function resolveSkinName(name) {
    return Object.prototype.hasOwnProperty.call(SKINS, name) ? name : DEFAULT_SKIN;
  }

  return { SKINS, DEFAULT_SKIN, getSkin, resolveSkinName, colorsFor, shade };
});
