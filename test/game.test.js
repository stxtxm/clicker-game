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
  a.weed = 99;
  a.stock.weed = 5;
  a.levels.auto = 3;
  assert.strictEqual(b.weed, 0);
  assert.strictEqual(b.stock.weed, 0);
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

test('perClick: base + expert + turbo + mega, scaled by level and strain multiplier', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.perClick(s), 1);       // level 1 -> +8%, green yieldMult 1.0 -> 1.08 -> 1
  s.levels.harvest = 3;
  assert.strictEqual(Game.perClick(s), 3);       // 3 * 1.08 = 3.24 -> 3
  s.levels.expert = 2;                           // +5 each -> 13
  assert.strictEqual(Game.perClick(s), 14);      // 13 * 1.08 = 14.04 -> 14
  s.levels.turbo = 1;                            // x2 clicks -> 26
  assert.strictEqual(Game.perClick(s), 28);      // 26 * 1.08 = 28.08 -> 28
  s.levels.mega = 1;                             // x2 everything -> 52
  assert.strictEqual(Game.perClick(s), 56);      // 52 * 1.08 = 56.16 -> 56
  assert.strictEqual(Game.perClick(Game.defaultState()), 1);
});

test('perSecond: auto + crew, scaled by level and strain multiplier', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.perSecond(s), 0);
  s.levels.auto = 1;
  assert.strictEqual(Game.perSecond(s), 1);      // 1 * 1.08 = 1.08 -> 1
  s.levels.crew = 2;                             // 1 + 30 = 31
  assert.strictEqual(Game.perSecond(s), 33);     // 31 * 1.08 = 33.48 -> 33
});

test('upgradeCost scales properly', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.upgradeCost(s, 'harvest'), 80); // harvest starts at level 1
  s.levels.harvest = 2;
  assert.strictEqual(Game.upgradeCost(s, 'harvest'), Math.floor(80 * Math.pow(2.1, 1)));
  assert.strictEqual(Game.upgradeCost(s, 'auto'), 350);   // auto starts at level 0
});

test('buyUpgrade: insufficient funds does not mutate', () => {
  const s = Game.defaultState();
  s.money = 79;
  const res = Game.buyUpgrade(s, 'harvest');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'funds');
  assert.strictEqual(s.money, 79);
  assert.strictEqual(s.levels.harvest, 1);
});

test('buyUpgrade: success deducts money and levels up', () => {
  const s = Game.defaultState();
  s.money = 100;
  const res = Game.buyUpgrade(s, 'harvest');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.cost, 80); // harvest level 1 cost = 80
  assert.strictEqual(res.name, 'Ciseaux Pro');
  assert.strictEqual(s.money, 20);
  assert.strictEqual(s.levels.harvest, 2);
});

test('sellStock: weed, product, partial amount and all', () => {
  const s = Game.defaultState();
  s.stock.weed = 10;
  s.stock.hash = 1;
  s.stock.resin = 1;
  assert.strictEqual(Game.sellStock(s, 'weed'), 120); // 10 * 12 €
  assert.strictEqual(s.stock.weed, 0);
  assert.strictEqual(s.stock.hash, 1);
  assert.strictEqual(Game.sellStock(s, 'hash'), 200);   // 1 * 200 € (catalog price)
  assert.strictEqual(Game.sellStock(s, 'resin', 1), 800); // 1 * 800 €
  assert.strictEqual(Game.sellStock(s, 'all'), 0);      // empty
});

test('sellStock: partial amounts and sell-all across products', () => {
  const s = Game.defaultState();
  s.stock.joint = 10;
  s.stock.weed = 50;
  assert.strictEqual(Game.sellStock(s, 'joint', 3), 84); // 3 * 28 €
  assert.strictEqual(s.stock.joint, 7);
  // green x1: joints left (7*28) + raw weed (50*12)
  const gain = Game.sellStock(s, 'all');
  assert.strictEqual(gain, 7 * 28 + 50 * 12);
  assert.strictEqual(s.stock.joint, 0);
  assert.strictEqual(s.stock.weed, 0);
  assert.strictEqual(s.money, 84 + gain);
});

test('craftProduct: consumes weed and supports qty / max', () => {
  const s = Game.defaultState();
  s.stock.weed = 100;
  s.stock.weedByStrain.green = 100;
  let r = Game.craftProduct(s, 'joint', 10);
  assert.deepStrictEqual(r, { ok: true, amount: 10 });
  assert.strictEqual(s.stock.weed, 80); // 10 * 2g
  assert.strictEqual(s.stock.joint, 10);
  assert.strictEqual(s.stock.weedByStrain.green, 80); // per-strain map drained
  r = Game.craftProduct(s, 'joint', Infinity);
  assert.deepStrictEqual(r, { ok: true, amount: 40 });
  assert.strictEqual(s.stock.weed, 0);
  assert.strictEqual(s.stock.joint, 50);
  r = Game.craftProduct(s, 'hash', 1);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'weed');
});

test('product prices scale with equipped strain multiplier', () => {
  const s = Game.defaultState();
  s.strain = 'purple'; // x1.4
  assert.strictEqual(Game.productUnitPrice(s, Game.getProduct('joint')), Math.round(28 * 1.4));
});

test('equipStrain: unknown id', () => {
  const res = Game.equipStrain(Game.defaultState(), 'nope');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'unknown');
});

test('equipStrain: buying unlocks and equips (level gate satisfied)', () => {
  const s = Game.defaultState();
  s.money = 3000;
  s.xp = 3500;                                   // level 4 >= unlock 4
  const res = Game.equipStrain(s, 'purple');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.justUnlocked, true);
  assert.strictEqual(res.name, 'Purple Haze');
  assert.strictEqual(s.money, 500);
  assert.deepStrictEqual(s.stock.strains, ['green', 'purple']);
  assert.strictEqual(s.strain, 'purple');
});

test('equipStrain: level gate blocks purchase below required level', () => {
  const s = Game.defaultState();
  s.money = 100000;
  const res = Game.equipStrain(s, 'purple');     // needs level 4
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'level');
  assert.strictEqual(s.strain, 'green');
  assert.deepStrictEqual(s.stock.strains, ['green']);
});

test('equipStrain: not enough money', () => {
  const s = Game.defaultState();
  s.money = 10;
  s.xp = 3500;                                   // passes the level gate
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
  s.weed = 123;
  s.money = 456;
  s.stock = { ...Game.defaultState().stock, weed: 10, hash: 1, resin: 0, weedByStrain: { green: 4 }, hashByStrain: { pink: 1 } };
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
  const loaded = Game.deserialize('{"weed":42}');
  assert.strictEqual(loaded.weed, 42);
  assert.strictEqual(loaded.money, 0);
  assert.deepStrictEqual(loaded.levels, Game.DEFAULT_LEVELS);
  assert.deepStrictEqual(loaded.stock.strains, ['green']);
});

test('deserialize: sanitizes unknown strain and bad shapes', () => {
  const loaded = Game.deserialize(JSON.stringify({
    weed: 1,
    strain: 'does-not-exist',
    stock: { weed: 7, hash: 0, resin: 0, strains: 'nope' },
    levels: { harvest: 2 }
  }));
  assert.strictEqual(loaded.strain, 'green');
  assert.deepStrictEqual(loaded.stock.strains, ['green']);
  assert.strictEqual(loaded.stock.weed, 7);
  assert.strictEqual(loaded.levels.harvest, 2);
  assert.strictEqual(loaded.levels.auto, 0); // default filled in
});

test('data catalog is coherent', () => {
  assert.strictEqual(Game.UPGRADES.length, 8);
  assert.strictEqual(Game.STRAINS.length, 8);
  for (const u of Game.UPGRADES) {
    assert.ok(u.id && u.name && u.desc && u.cost > 0);
    assert.strictEqual(Game.BASE_COST[u.id], u.cost);
  }
  for (const st of Game.STRAINS) {
    assert.ok(st.id && st.name && st.icon && Array.isArray(st.d));
    assert.ok(Game.getStrain(st.id) === st);
    assert.ok(st.cost >= 0);
    assert.ok(st.unlock >= 1);
    for (const key of ['d', 'm', 'l', 'f']) {
      assert.ok(Array.isArray(st[key]) && st[key].length === 2);
    }
  }
});

test('level curve: hybrid quadratic-exponential XP thresholds', () => {
  assert.strictEqual(Game.xpForLevel(1), 0);
  assert.strictEqual(Game.xpForLevel(2), 192);   // 150 * 1² * 1.28¹ rounded
  assert.strictEqual(Game.xpForLevel(3), 983);
  assert.strictEqual(Game.levelFromXp(0), 1);
  assert.strictEqual(Game.levelFromXp(191), 1);
  assert.strictEqual(Game.levelFromXp(192), 2);
  assert.strictEqual(Game.levelFromXp(982), 2);
  assert.strictEqual(Game.levelFromXp(983), 3);
});

test('xpProgress reports level, progress and XP needed', () => {
  const p = Game.xpProgress(200);
  assert.strictEqual(p.level, 2);
  assert.strictEqual(p.current, 8);
});

test('earnXp levels up and reports milestones', () => {
  const s = Game.defaultState();
  let r = Game.earnXp(s, 200);
  assert.strictEqual(s.xp, 200);
  assert.strictEqual(r.leveledUp, true);      // 0 -> level 2
  assert.strictEqual(r.level, 2);
  assert.deepStrictEqual(r.milestones.map((m) => m.id), ['m1']); // 200 XP milestone
  assert.deepStrictEqual(s.milestones, ['m1']);
  r = Game.earnXp(s, 30);
  assert.strictEqual(r.leveledUp, false);
  assert.deepStrictEqual(r.milestones, []);
});

test('checkMilestones awards only once', () => {
  const s = Game.defaultState();
  s.xp = 3000;
  assert.deepStrictEqual(Game.checkMilestones(s).map((m) => m.id), ['m1', 'm2']);
  assert.deepStrictEqual(Game.checkMilestones(s), []);
});

test('productionMult composes level, strains and milestones', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.productionMult(s), 1.08);           // level 1 -> +8%
  s.xp = 1200;                                                // level 3 -> +24%
  assert.ok(Math.abs(Game.productionMult(s) - 1.24) < 1e-9);
});

test('perClick/perSecond scale with level', () => {
  const s = Game.defaultState();
  s.levels.harvest = 5;
  const base = 5 * 1.08;
  assert.strictEqual(Game.perClick(s), Math.round(base));
  s.xp = 3000;                                                // level 4 -> x1.32
  assert.strictEqual(Game.perClick(s), Math.round(5 * 1.32));
});

test('deserialize: old saves get default progression fields', () => {
  const loaded = Game.deserialize('{"weed":42,"money":5}');
  assert.strictEqual(loaded.xp, 0);
  assert.strictEqual(loaded.totalEarned, 0);
  assert.deepStrictEqual(loaded.milestones, []);
});

test('deserialize: sanitizes bad progression fields', () => {
  const loaded = Game.deserialize(JSON.stringify({
    xp: -3, milestones: ['m1', 'nope'], totalEarned: 12.5
  }));
  assert.strictEqual(loaded.xp, 0);
  assert.strictEqual(loaded.totalEarned, 12.5);
  assert.deepStrictEqual(loaded.milestones, ['m1']);
});

// --- automation (Ouvriers / Dealers) -----------------------------------------

test('automation catalog: one craft + one hire per product, coherent costs', () => {
  assert.strictEqual(Game.AUTOMATION.length, Game.PRODUCTS.length * 2);
  const ids = new Set();
  for (const a of Game.AUTOMATION) {
    assert.ok(!ids.has(a.id), 'duplicate id ' + a.id);
    ids.add(a.id);
    assert.ok(Game.getProduct(a.productId), 'unknown product ' + a.productId);
    assert.ok(a.kind === 'craft' || a.kind === 'sell');
    assert.ok(a.cost > 0 && Number.isInteger(a.cost));
    const p = Game.getProduct(a.productId);
    if (a.kind === 'craft') assert.strictEqual(a.cost, Math.round(p.price * 90));
    else assert.strictEqual(a.cost, Math.round(p.price * 140));
    assert.strictEqual(a.unlock, p.unlock);
  }
});

test('buyAutomation: funds check, deducts money and sets flag', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.buyAutomation(s, 'craft-joint').reason, 'funds');
  s.money = 2519; // just short
  assert.strictEqual(Game.buyAutomation(s, 'craft-joint').reason, 'funds');
  s.money = 2520;
  const r = Game.buyAutomation(s, 'craft-joint');
  assert.deepStrictEqual(r, { ok: true, name: 'Ouvrier Joint Roulé' });
  assert.strictEqual(s.money, 0);
  assert.strictEqual(Game.hasAuto(s, 'craft', 'joint'), true);
});

test('buyAutomation: rejects duplicate and unknown hires', () => {
  const s = Game.defaultState();
  s.money = 100000;
  assert.strictEqual(Game.buyAutomation(s, 'nope').reason, 'unknown');
  assert.strictEqual(Game.buyAutomation(s, 'craft-joint').ok, true);
  const before = s.money;
  assert.strictEqual(Game.buyAutomation(s, 'craft-joint').reason, 'owned');
  assert.strictEqual(s.money, before); // no double charge
});

test('autoTick: no-op without any hire owned', () => {
  const s = Game.defaultState();
  s.stock.weed = 100;
  s.stock.joint = 5;
  const t = Game.autoTick(s);
  assert.deepStrictEqual(t.crafted, {});
  assert.deepStrictEqual(t.soldMoney, {});
  assert.strictEqual(s.stock.weed, 100);
  assert.strictEqual(s.stock.joint, 5);
  assert.strictEqual(s.money, 0);
});

test('autoTick: ouvrier crafts as much weed allows, dealer sells everything', () => {
  const s = Game.defaultState();
  s.money = 100000;
  Game.buyAutomation(s, 'craft-joint');   // 2g -> 28 €
  Game.buyAutomation(s, 'sell-joint');
  s.stock.weed = 21;
  const t = Game.autoTick(s);
  assert.strictEqual(t.crafted.joint, 10);          // floor(21/2)
  assert.strictEqual(t.soldMoney.joint, 280);       // 10 * 28 €
  assert.strictEqual(s.stock.weed, 1);
  assert.strictEqual(s.stock.joint, 0);             // sold same tick
  assert.strictEqual(s.money, 100000 - 2520 - 3920 + 280); // hires paid, sale earned
});

test('autoTick: scarce weed goes to the most expensive product first', () => {
  const s = Game.defaultState();
  s.money = 1e9;
  for (const id of ['craft-rosin', 'craft-hash', 'craft-joint']) {
    assert.strictEqual(Game.buyAutomation(s, id).ok, true);
  }
  s.stock.weed = 350;
  const t = Game.autoTick(s);
  // rosin eats 300g (best €/g), hash takes 48g of the remaining 50, joint gets the last 2g
  assert.deepStrictEqual(t.crafted, { rosin: 1, hash: 4, joint: 1 });
  assert.strictEqual(s.stock.weed, 0);
});

test('autoTick: dealers only touch their own product', () => {
  const s = Game.defaultState();
  s.money = 100000;
  Game.buyAutomation(s, 'sell-joint');
  s.stock.joint = 3;
  s.stock.hash = 7;
  s.stock.weed = 50;
  Game.autoTick(s);
  assert.strictEqual(s.stock.joint, 0);
  assert.strictEqual(s.stock.hash, 7);              // untouched
  assert.strictEqual(s.stock.weed, 50);             // no crafter: weed untouched
  assert.strictEqual(s.money, 100000 - 3920 + 84);
});

test('automation flags survive serialize/deserialize roundtrip', () => {
  const s = Game.defaultState();
  s.money = 10000000; // enough for every hire
  Game.buyAutomation(s, 'craft-joint');
  Game.buyAutomation(s, 'sell-rosin');
  const loaded = Game.deserialize(Game.serialize(s));
  assert.deepStrictEqual(loaded, s);
  assert.strictEqual(Game.hasAuto(loaded, 'craft', 'joint'), true);
  assert.strictEqual(Game.hasAuto(loaded, 'sell', 'rosin'), true);
});

test('deserialize: sanitizes malformed auto shapes and old saves', () => {
  // old save without auto field
  const old = Game.deserialize('{"weed":42,"money":5}');
  assert.deepStrictEqual(old.auto, { craft: {}, sell: {} });
  // garbage shapes / unknown ids / non-true values are dropped
  const weird = Game.deserialize(JSON.stringify({
    auto: { craft: { joint: true, nope: true }, sell: 'garbage' }
  }));
  assert.deepStrictEqual(weird.auto, { craft: { joint: true }, sell: {} });
});
