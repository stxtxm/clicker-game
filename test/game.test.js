/**
 * Tests for the pure game logic (js/game.js).
 * Run with: `npm test`  (or `node --test test/`)
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const Game = require('../js/game.js');

test('defaultState is fresh and isolated', () => {
  const a = Game.defaultState();
  const b = Game.defaultState();
  a.points = 99;
  a.stock.main = 5;
  a.levels.auto = 3;
  assert.strictEqual(b.points, 0);
  assert.strictEqual(b.stock.main, 0);
  assert.strictEqual(b.levels.auto, 0);
  assert.deepStrictEqual(Game.defaultState().stock.strains, ['green']);
});

test('mulberry32 is deterministic and seed-sensitive', () => {
  const r1 = Game.mulberry32(2024);
  const r2 = Game.mulberry32(2024);
  const seq1 = Array.from({ length: 20 }, () => r1());
  const seq2 = Array.from({ length: 20 }, () => r2());
  assert.deepStrictEqual(seq1, seq2);
  for (const v of seq1) assert.ok(v >= 0 && v < 1);
  const r3 = Game.mulberry32(2025);
  assert.notDeepStrictEqual(seq1, Array.from({ length: 20 }, () => r3()));
});

test('perClick: base + expert + turbo + mega', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.perClick(s), 1);
  s.levels.harvest = 3;
  assert.strictEqual(Game.perClick(s), 3);
  s.levels.expert = 2;                       // +5 each
  assert.strictEqual(Game.perClick(s), 13);
  s.levels.turbo = 1;                        // x2 clicks
  assert.strictEqual(Game.perClick(s), 26);
  s.levels.mega = 1;                         // x2 everything
  assert.strictEqual(Game.perClick(s), 52);
  assert.strictEqual(Game.perClick(Game.defaultState()), 1);
});

test('perSecond: auto + crew', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.perSecond(s), 0);
  s.levels.auto = 1;
  assert.strictEqual(Game.perSecond(s), 1);
  s.levels.crew = 2;
  assert.strictEqual(Game.perSecond(s), 21);
});

test('upgradeCost doubles with level', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.upgradeCost(s, 'harvest'), 100); // harvest starts at level 1
  s.levels.harvest = 2;
  assert.strictEqual(Game.upgradeCost(s, 'harvest'), 200);
  s.levels.harvest = 5;
  assert.strictEqual(Game.upgradeCost(s, 'harvest'), 50 * Math.pow(2, 5));
  assert.strictEqual(Game.upgradeCost(s, 'auto'), 200); // auto starts at level 0
});

test('buyUpgrade: insufficient funds does not mutate', () => {
  const s = Game.defaultState();
  s.money = 49;
  const res = Game.buyUpgrade(s, 'harvest');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'funds');
  assert.strictEqual(s.money, 49);
  assert.strictEqual(s.levels.harvest, 1);
});

test('buyUpgrade: success deducts money and levels up', () => {
  const s = Game.defaultState();
  s.money = 100;
  const res = Game.buyUpgrade(s, 'harvest');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.cost, 100); // harvest level 1 -> $100
  assert.strictEqual(res.name, 'Ciseaux');
  assert.strictEqual(s.money, 0);
  assert.strictEqual(s.levels.harvest, 2);
});

test('sellStock: main, premium and all', () => {
  const s = Game.defaultState();
  s.stock.main = 5;
  s.stock.premium = 2;
  assert.strictEqual(Game.sellStock(s, 'main'), 50); // 5 * $10
  assert.strictEqual(s.stock.main, 0);
  assert.strictEqual(s.stock.premium, 2);
  assert.strictEqual(Game.sellStock(s, 'premium'), 100); // 2 * $50
  assert.strictEqual(Game.sellStock(s, 'all'), 0);       // empty
  s.stock.main = 3;
  s.stock.premium = 1;
  assert.strictEqual(Game.sellStock(s, 'all'), 30 + 50);
  assert.strictEqual(s.stock.main, 0);
  assert.strictEqual(s.stock.premium, 0);
});

test('equipStrain: unknown id', () => {
  const res = Game.equipStrain(Game.defaultState(), 'nope');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'unknown');
});

test('equipStrain: buying unlocks and equips', () => {
  const s = Game.defaultState();
  s.money = 1500;
  const res = Game.equipStrain(s, 'purple');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.justUnlocked, true);
  assert.strictEqual(res.name, 'Purple Haze');
  assert.strictEqual(s.money, 0);
  assert.deepStrictEqual(s.stock.strains, ['green', 'purple']);
  assert.strictEqual(s.strain, 'purple');
});

test('equipStrain: not enough money', () => {
  const s = Game.defaultState();
  s.money = 10;
  const res = Game.equipStrain(s, 'purple');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'funds');
  assert.strictEqual(s.strain, 'green');
  assert.deepStrictEqual(s.stock.strains, ['green']);
});

test('equipStrain: re-equipping an owned strain is free', () => {
  const s = Game.defaultState();
  s.money = 5000;
  s.stock.strains = ['green', 'blue'];
  const res = Game.equipStrain(s, 'blue');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.justUnlocked, false);
  assert.strictEqual(s.money, 5000);
  assert.strictEqual(s.strain, 'blue');
});

test('serialize/deserialize roundtrip preserves everything', () => {
  const s = Game.defaultState();
  s.points = 123;
  s.money = 456;
  s.stock = { main: 10, premium: 1, strains: ['green', 'pink'] };
  s.levels.turbo = 3;
  s.strain = 'pink';
  const loaded = Game.deserialize(Game.serialize(s));
  assert.deepStrictEqual(loaded, s);
});

test('deserialize: null/corrupt payload falls back to defaults', () => {
  assert.deepStrictEqual(Game.deserialize(null), Game.defaultState());
  assert.deepStrictEqual(Game.deserialize(undefined), Game.defaultState());
  assert.deepStrictEqual(Game.deserialize('{oops'), Game.defaultState());
  assert.deepStrictEqual(Game.deserialize('"just a string"'), Game.defaultState());
});

test('deserialize: partial payload merges with defaults', () => {
  const loaded = Game.deserialize('{"points":42}');
  assert.strictEqual(loaded.points, 42);
  assert.strictEqual(loaded.money, 0);
  assert.deepStrictEqual(loaded.levels, Game.DEFAULT_LEVELS);
  assert.deepStrictEqual(loaded.stock.strains, ['green']);
});

test('deserialize: sanitizes unknown strain and bad shapes', () => {
  const loaded = Game.deserialize(JSON.stringify({
    points: 1,
    strain: 'does-not-exist',
    stock: { main: 7, premium: 0, strains: 'nope' },
    levels: { harvest: 2 }
  }));
  assert.strictEqual(loaded.strain, 'green');
  assert.deepStrictEqual(loaded.stock.strains, ['green']);
  assert.strictEqual(loaded.stock.main, 7);
  assert.strictEqual(loaded.levels.harvest, 2);
  assert.strictEqual(loaded.levels.auto, 0); // default filled in
});

test('data catalog is coherent', () => {
  assert.strictEqual(Game.UPGRADES.length, 6);
  assert.strictEqual(Game.STRAINS.length, 4);
  for (const u of Game.UPGRADES) {
    assert.ok(u.id && u.name && u.desc && u.cost > 0);
    assert.strictEqual(Game.BASE_COST[u.id], u.cost);
  }
  for (const st of Game.STRAINS) {
    assert.ok(st.id && st.name && st.icon && Array.isArray(st.d));
    assert.ok(Game.getStrain(st.id) === st);
    assert.ok(st.cost >= 0);
    for (const key of ['d', 'm', 'l', 'f']) {
      assert.ok(Array.isArray(st[key]) && st[key].length === 2);
    }
  }
});