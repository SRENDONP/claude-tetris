'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../tetris-core.js');
const skins = require('../skins.js');

const { SKINS, DEFAULT_SKIN, resolveSkinId, getSkin, boardColors } = skins;
const HEX = /^#[0-9a-f]{6}$/i;

// Contexto de canvas falso que registra llamadas y el estado de sombra
function fakeCtx() {
  const calls = [];
  const state = { shadowBlur: 0, shadowColor: 'rgba(0, 0, 0, 0)', globalAlpha: 1 };
  const stack = [];
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop === 'save') return () => stack.push({ ...state });
      if (prop === 'restore') return () => Object.assign(state, stack.pop());
      if (prop in target) return target[prop];
      return (...args) => calls.push([prop, ...args]);
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return ctx;
}

describe('skins', () => {
  test('incluye las 4 skins pedidas con ids únicos', () => {
    const ids = SKINS.map(s => s.id);
    assert.deepEqual(ids, ['retro', 'neon', 'pastel', 'pixel']);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of SKINS) assert.ok(typeof s.name === 'string' && s.name.length > 0);
  });

  test('cada skin tiene una paleta de 12 colores válidos alineada con COLORS', () => {
    for (const s of SKINS) {
      assert.equal(s.colors.length, core.COLORS.length, s.id);
      assert.equal(s.colors[0], null, s.id);
      assert.equal(s.colors.length - 1, 12, s.id);
      for (const c of s.colors.slice(1)) assert.match(c, HEX, `${s.id}: ${c}`);
    }
  });

  test('retro reutiliza los colores de tetris-core', () => {
    assert.deepEqual(getSkin('retro').colors, core.COLORS);
  });

  test('cada skin tiene una función drawBlock', () => {
    for (const s of SKINS) assert.equal(typeof s.drawBlock, 'function', s.id);
  });

  test('resolveSkinId cae en retro con ids desconocidos', () => {
    assert.equal(DEFAULT_SKIN, 'retro');
    for (const s of SKINS) assert.equal(resolveSkinId(s.id), s.id);
    for (const bad of [null, undefined, '', 'NEON', 'toString', '__proto__', 42, {}]) {
      assert.equal(resolveSkinId(bad), 'retro', String(bad));
      assert.equal(getSkin(bad).id, 'retro');
    }
  });

  test('boardColors: retro usa el CSS, neon es negro en ambos temas', () => {
    assert.equal(boardColors(getSkin('retro'), 'dark'), null);
    assert.equal(boardColors(getSkin('neon'), 'dark').bg, '#000000');
    assert.equal(boardColors(getSkin('neon'), 'light').bg, '#000000');
    for (const s of SKINS.filter(s => s.board)) {
      for (const theme of ['dark', 'light']) {
        const c = boardColors(s, theme);
        assert.match(c.bg, HEX);
        assert.match(c.grid, HEX);
      }
    }
  });

  test('drawBlock dibuja algo y no deja sombra ni alpha alterados', () => {
    for (const s of SKINS) {
      for (const alpha of [1, 0.2]) {
        const ctx = fakeCtx();
        s.drawBlock(ctx, 30, 60, 30, s.colors[1], alpha, { shine: 'rgba(255,255,255,0.1)' });
        assert.ok(ctx.calls.length > 0, s.id);
        assert.equal(ctx.shadowBlur, 0, `${s.id} shadowBlur`);
        assert.equal(ctx.globalAlpha, 1, `${s.id} globalAlpha`);
      }
    }
  });

  test('neon usa shadowBlur para el brillo', () => {
    const ctx = fakeCtx();
    let maxBlur = 0;
    const spy = new Proxy(ctx, {
      set(target, prop, value) {
        if (prop === 'shadowBlur') maxBlur = Math.max(maxBlur, value);
        target[prop] = value;
        return true;
      },
    });
    getSkin('neon').drawBlock(spy, 0, 0, 30, '#00f0ff', 1);
    assert.ok(maxBlur > 0);
  });

  test('pastel dibuja bordes redondeados con arcos', () => {
    const ctx = fakeCtx();
    getSkin('pastel').drawBlock(ctx, 0, 0, 30, '#a8e6ef', 1);
    assert.ok(ctx.calls.some(c => c[0] === 'arc'));
  });
});
