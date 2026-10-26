'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../tetris-core.js');
const { SKINS, DEFAULT_SKIN, getSkin, resolveSkinName, colorsFor, shade } = require('../skins.js');

// contexto 2D falso que solo registra las llamadas
function fakeCtx() {
  const calls = [];
  const ctx = new Proxy({ calls }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => calls.push(prop);
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return ctx;
}

describe('skins', () => {
  test('incluye retro, neon, pastel y pixel', () => {
    assert.deepEqual(Object.keys(SKINS).sort(), ['neon', 'pastel', 'pixel', 'retro']);
  });

  test('cada skin tiene un color #rrggbb para cada pieza', () => {
    for (const [name, skin] of Object.entries(SKINS)) {
      const colors = colorsFor(skin);
      assert.equal(colors.length, core.COLORS.length, name);
      assert.equal(colors[0], null);
      for (const c of colors.slice(1)) assert.match(c, /^#[0-9a-f]{6}$/i, `${name}: ${c}`);
    }
  });

  test('retro conserva los colores de tetris-core', () => {
    assert.deepEqual(colorsFor(SKINS.retro), core.COLORS);
  });

  test('un nombre desconocido o vacío cae en la skin por defecto', () => {
    assert.equal(resolveSkinName('neon'), 'neon');
    assert.equal(resolveSkinName(null), DEFAULT_SKIN);
    assert.equal(resolveSkinName('toString'), DEFAULT_SKIN);
    assert.equal(getSkin('nope'), SKINS[DEFAULT_SKIN]);
  });

  test('shade aclara hacia blanco y oscurece hacia negro', () => {
    assert.equal(shade('#808080', 1), '#ffffff');
    assert.equal(shade('#808080', -1), '#000000');
    assert.equal(shade('#123456', 0), '#123456');
  });

  test('draw dibuja algo con cada skin sin lanzar', () => {
    for (const [name, skin] of Object.entries(SKINS)) {
      const ctx = fakeCtx();
      skin.draw(ctx, 0, 0, 30, colorsFor(skin)[1], { shine: 'rgba(255,255,255,0.1)' });
      assert.ok(ctx.calls.length > 0, name);
    }
  });

  test('neon restaura el estado del contexto (shadowBlur)', () => {
    const ctx = fakeCtx();
    SKINS.neon.draw(ctx, 0, 0, 30, '#00f0ff', {});
    assert.equal(ctx.calls[0], 'save');
    assert.equal(ctx.calls.at(-1), 'restore');
  });
});
