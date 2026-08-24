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

test('upgradeCost scales with COST_GROWTH (storage has its own steeper growth)', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.upgradeCost(s, 'harvest'), 150); // harvest starts at level 1
  s.levels.harvest = 2;
  assert.strictEqual(Game.upgradeCost(s, 'harvest'), Math.floor(150 * Math.pow(Game.COST_GROWTH, 1)));
  assert.strictEqual(Game.upgradeCost(s, 'auto'), 750);   // auto starts at level 0
  assert.strictEqual(Game.upgradeCost(s, 'sbox'), 4000);
  s.levels.sbox = 1;
  assert.strictEqual(Game.upgradeCost(s, 'sbox'), Math.floor(4000 * 3.0)); // storage growth 3.0
});

test('buyUpgrade: insufficient funds does not mutate', () => {
  const s = Game.defaultState();
  s.money = 149;
  const res = Game.buyUpgrade(s, 'harvest');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'funds');
  assert.strictEqual(s.money, 149);
  assert.strictEqual(s.levels.harvest, 1);
});

test('buyUpgrade: success deducts money and levels up', () => {
  const s = Game.defaultState();
  s.money = 325;
  const res = Game.buyUpgrade(s, 'harvest'); // lvl1 -> base cost 150 (exponent 0)
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.cost, 150);
  assert.strictEqual(res.name, 'Ciseaux Pro');
  assert.strictEqual(s.money, 175);
  assert.strictEqual(s.levels.harvest, 2);
});

// Deterministic market pulse for tests (t=0 → each market has a fixed phase)
const px = (base, id) => Math.round(base * Game.pulse(id, 0));

test('market pulse oscillates ±30% deterministically', () => {
  for (const id of ['weed', 'joint', 'hash', 'rosin']) {
    const p0 = Game.pulse(id, 0);
    assert.ok(p0 >= 0.7 && p0 <= 1.3, id + ' pulse out of range');
    assert.strictEqual(p0, Game.pulse(id, 0)); // deterministic
  }
  // same phase comes back after one full period
  assert.ok(Math.abs(Game.pulse('joint', 120000) - Game.pulse('joint', 0)) < 1e-6);
});

test('sellStock: weed, product, partial amount and all (pulse-aware)', () => {
  const s = Game.defaultState();
  s.stock.weed = 10;
  s.stock.hash = 1;
  s.stock.resin = 1;
  assert.strictEqual(Game.sellStock(s, 'weed', undefined, 0), 10 * px(6, 'weed'));
  assert.strictEqual(s.stock.weed, 0);
  assert.strictEqual(s.stock.hash, 1);
  assert.strictEqual(Game.sellStock(s, 'hash', undefined, 0), px(115, 'hash'));
  assert.strictEqual(Game.sellStock(s, 'resin', 1, 0), px(550, 'resin'));
  assert.strictEqual(Game.sellStock(s, 'all', undefined, 0), 0); // empty
});

test('sellStock: partial amounts and sell-all across products', () => {
  const s = Game.defaultState();
  s.stock.joint = 10;
  s.stock.weed = 50;
  const unitJ = px(14, 'joint');
  const gain3 = Game.sellStock(s, 'joint', 3, 0);
  assert.strictEqual(gain3, 3 * unitJ);
  assert.strictEqual(s.stock.joint, 7);
  const gain = Game.sellStock(s, 'all', undefined, 0);
  assert.strictEqual(gain, 7 * unitJ + 50 * px(6, 'weed'));
  assert.strictEqual(s.stock.joint, 0);
  assert.strictEqual(s.stock.weed, 0);
  assert.strictEqual(s.money, gain3 + gain);
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

test('product prices scale with equipped strain multiplier and pulse', () => {
  const s = Game.defaultState();
  s.strain = 'purple'; // x1.4
  assert.strictEqual(Game.productUnitPrice(s, Game.getProduct('joint'), 0),
    Math.round(14 * 1.4 * Game.pulse('joint', 0)));
});

test('perClick: Doigts Agiles adds a share of auto production', () => {
  const s = Game.defaultState();          // harvest lvl1 -> 1*1.08
  s.levels.auto = 10;                     // perSecond = round(10*1.08) = 11
  s.levels.thumb = 1;                     // +8% of 11 = +0.88
  // 1.08 + 0.88 = 1.96 -> 2 (vs 1 without thumb)
  assert.strictEqual(Game.perClick(s), 2);
  s.levels.thumb = 5;                     // +40% of 11 = +4.4 -> 1.08+4.4=5.48 -> 5
  assert.strictEqual(Game.perClick(s), 5);
});

test('equipStrain: unknown id', () => {
  const res = Game.equipStrain(Game.defaultState(), 'nope');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'unknown');
});

test('equipStrain: buying unlocks and equips (level gate satisfied)', () => {
  const s = Game.defaultState();
  s.money = 5000;
  s.xp = 3500;                                   // level 4 >= unlock 4
  const res = Game.equipStrain(s, 'purple');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.justUnlocked, true);
  assert.strictEqual(res.name, 'Purple Haze');
  assert.strictEqual(s.money, 1000);
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
  assert.strictEqual(Game.UPGRADES.length, 9);
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
  assert.strictEqual(Game.xpForLevel(2), 198);   // 150 * 1² * 1.32¹ rounded
  assert.strictEqual(Game.xpForLevel(3), 1045);
  assert.strictEqual(Game.levelFromXp(0), 1);
  assert.strictEqual(Game.levelFromXp(197), 1);
  assert.strictEqual(Game.levelFromXp(198), 2);
  assert.strictEqual(Game.levelFromXp(1044), 2);
  assert.strictEqual(Game.levelFromXp(1045), 3);
});

test('xpProgress reports level, progress and XP needed', () => {
  const p = Game.xpProgress(200);
  assert.strictEqual(p.level, 2);
  assert.strictEqual(p.current, 2);
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
  s.xp = 3105;                                                // level 4 -> x1.32
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

// --- automation (one hire per product: auto-craft + auto-sell) ----------------

test('automation catalog: one hire per product, coherent costs', () => {
  assert.strictEqual(Game.AUTOMATION.length, Game.PRODUCTS.length);
  const ids = new Set();
  for (const a of Game.AUTOMATION) {
    assert.ok(!ids.has(a.id), 'duplicate id ' + a.id);
    ids.add(a.id);
    const p = Game.getProduct(a.productId);
    assert.ok(p, 'unknown product ' + a.productId);
    assert.strictEqual(a.kind, 'both');
    assert.ok(a.cost > 0 && Number.isInteger(a.cost));
    assert.strictEqual(a.cost, Math.round(p.price * 500));
    assert.strictEqual(a.unlock, p.unlock + 5); // chains arrive after the product
  }
});

test('buyAutomation: funds check, deducts money and unlocks craft+sell', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(6); // auto-joint unlock level
  const COST = Game.AUTOMATION.find((a) => a.id === 'auto-joint').cost; // 14 * 500 = 7000
  assert.strictEqual(COST, 7000);
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').reason, 'funds');
  s.money = COST - 1;
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').reason, 'funds');
  s.money = COST;
  const r = Game.buyAutomation(s, 'auto-joint');
  assert.deepStrictEqual(r, { ok: true, name: 'Chaîne Joint Roulé' });
  assert.strictEqual(s.money, 0);
  assert.strictEqual(Game.hasAuto(s, 'craft', 'joint'), true);
  assert.strictEqual(Game.hasAuto(s, 'sell', 'joint'), true);
});

test('buyAutomation: level gate blocks early purchases even when rich', () => {
  const s = Game.defaultState();
  s.money = 1e9; // rich but level 1
  // auto-joint unlocks at 6, auto-rosin at 50
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').reason, 'level');
  assert.strictEqual(Game.buyAutomation(s, 'auto-rosin').reason, 'level');
  assert.strictEqual(s.money, 1e9); // nothing charged
  assert.deepStrictEqual(s.auto, { craft: {}, sell: {} });
  s.xp = Game.xpForLevel(6); // exactly level 6
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').ok, true);
  assert.strictEqual(Game.buyAutomation(s, 'auto-sachet').reason, 'level'); // unlock 9
});

test('buyAutomation: rejects duplicate and unknown hires', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(6);
  s.money = 100000;
  assert.strictEqual(Game.buyAutomation(s, 'nope').reason, 'unknown');
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').ok, true);
  const before = s.money;
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').reason, 'owned');
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

test('autoTick: dealer sells chain output + dips 1u/s into manual stock', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(6);
  s.money = 100000;
  Game.buyAutomation(s, 'auto-joint');    // cost 7000; 2g -> 1 joint
  s.stock.joint = 5;                      // hand-made stock
  s.stock.weed = 21;
  const t = Game.autoTick(s, 0);
  assert.strictEqual(t.crafted.joint, 1);               // capped at 1u/s
  assert.strictEqual(t.soldMoney.joint, 2 * px(14, 'joint')); // chain unit + 1 manual unit
  assert.strictEqual(s.stock.joint, 4);                 // manual stock leaks 1u/s
  assert.strictEqual(s.stock.weed, 19);
  assert.strictEqual(s.money, 100000 - 7000 + 2 * px(14, 'joint'));
});

test('autoTick: idle dealer drains manual stock even without weed', () => {
  const s = Game.defaultState();
  s.auto.sell.joint = true; // dealer (legacy partial save or starved ouvrier)
  s.stock.joint = 3;
  s.stock.weed = 0;
  const t = Game.autoTick(s, 0);
  assert.deepStrictEqual(t.crafted, {});
  assert.strictEqual(t.soldMoney.joint, px(14, 'joint')); // 1 manual unit sold
  assert.strictEqual(s.stock.joint, 2);
});

test('autoTick: dealer quota stops at empty stock', () => {
  const s = Game.defaultState();
  s.auto.sell.joint = true;
  s.stock.joint = 0;
  const t = Game.autoTick(s, 0);
  assert.deepStrictEqual(t.soldMoney, {});
  assert.strictEqual(s.money, 0);
});

test('autoTick: scarce weed goes to the most expensive product first', () => {
  const s = Game.defaultState();
  s.money = 1e9;
  s.xp = Game.xpForLevel(50); // rosin chain unlock
  for (const id of ['auto-rosin', 'auto-hash', 'auto-joint']) {
    assert.strictEqual(Game.buyAutomation(s, id).ok, true);
  }
  s.stock.weed = 350;
  const t = Game.autoTick(s);
  // 1u/s cap each: rosin eats 300g (best €/g), then hash 12g, joint 2g
  assert.deepStrictEqual(t.crafted, { rosin: 1, hash: 1, joint: 1 });
  assert.strictEqual(s.stock.weed, 36);
});

test('automation flags survive serialize/deserialize roundtrip', () => {
  const s = Game.defaultState();
  s.money = 10000000; // enough for every hire
  s.xp = Game.xpForLevel(50);
  Game.buyAutomation(s, 'auto-joint');
  Game.buyAutomation(s, 'auto-rosin');
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

// --- edge cases & hardening ---------------------------------------------------

test('buyUpgrade: unknown id rejected without corrupting money', () => {
  const s = Game.defaultState();
  s.money = 1000;
  const r = Game.buyUpgrade(s, 'nope');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unknown');
  assert.strictEqual(s.money, 1000);
});

test('upgradeCost: unknown id is not a number (never charged)', () => {
  const s = Game.defaultState();
  assert.ok(Number.isNaN(Game.upgradeCost(s, 'nope')));
  assert.strictEqual(Game.buyUpgrade(s, 'nope').ok, false);
});

test('sellStock: clamps amount above stock, ignores zero/negative', () => {
  const s = Game.defaultState();
  s.stock.joint = 4;
  const u = px(14, 'joint');
  assert.strictEqual(Game.sellStock(s, 'joint', 99, 0), 4 * u);   // clamped to stock
  assert.strictEqual(s.stock.joint, 0);
  s.stock.joint = 5;
  assert.strictEqual(Game.sellStock(s, 'joint', 0, 0), 1 * u);    // 0 -> min 1
  assert.strictEqual(Game.sellStock(s, 'joint', -5, 0), 1 * u);   // negative -> min 1
  assert.strictEqual(s.stock.joint, 3);
});

test('craftProduct: fractional/NaN qty floors to safe values', () => {
  const s = Game.defaultState();
  s.stock.weed = 30;
  s.stock.weedByStrain.green = 30;
  assert.strictEqual(Game.craftProduct(s, 'joint', 2.9).amount, 2);
  assert.strictEqual(s.stock.joint, 2);
  assert.strictEqual(Game.craftProduct(s, 'joint', NaN).amount, 1); // NaN -> 1
  assert.strictEqual(Game.craftProduct(s, 'joint', '3').amount, 3); // numeric strings ok
  assert.strictEqual(Game.craftProduct(s, 'unknown-prod', 1).ok, false);
});

test('addWeed: respects cap exactly, returns 0 when full', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.addWeed(s, 999999), 1200); // base cap
  assert.strictEqual(s.stock.weed, 1200);
  assert.strictEqual(Game.addWeed(s, 5), 0);         // full -> nothing
  assert.strictEqual(s.stock.weedByStrain.green, 1200);
});

test('maxWeedStorage: missing/negative levels fall back to base', () => {
  assert.strictEqual(Game.maxWeedStorage({}), 1200);
  // corrupted saves with negative levels must never brick the cap
  assert.strictEqual(Game.maxWeedStorage({ levels: { sbox: -3, coldroom: undefined } }), 1200);
  assert.strictEqual(Game.maxWeedStorage({ levels: { sbox: 2, coldroom: 1 } }), 1200 + 1400 + 3500);
});

test('priceOf: unknown product is 0, weed uses prices.weed base', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.priceOf(s, 'unknown', 0), 0);
  const weedPx = Game.priceOf(s, 'weed', 0);
  assert.ok(weedPx >= Math.floor(6 * 0.7) && weedPx <= Math.ceil(6 * 1.3));
});

test('market pulse: all markets stay in bounds and are deterministic', () => {
  for (const id of ['weed', ...Game.PRODUCTS.map((p) => p.id)]) {
    for (const t of [0, 12345, 60000, 47211]) {
      const p = Game.pulse(id, t);
      assert.ok(p > 0.7 - 1e-9 && p < 1.3 + 1e-9, id + '@' + t + ' = ' + p);
      assert.strictEqual(p, Game.pulse(id, t));
    }
  }
});

test('market trend: matches pulse slope (up between samples)', () => {
  const id = 'hash';
  for (let t = 0; t < 120000; t += 5000) {
    const rising = Game.pulse(id, t + 100) > Game.pulse(id, t);
    if (Game.trend(id, t) === 1) assert.ok(rising, 'trend up but pulse fell @' + t);
    if (Game.trend(id, t) === -1) assert.ok(!rising, 'trend down but pulse rose @' + t);
  }
});

test('equipStrain: re-equipping owned strain is free', () => {
  const s = Game.defaultState();
  s.money = 100;
  assert.strictEqual(Game.equipStrain(s, 'green').ok, true);
  assert.strictEqual(s.money, 100); // already owned
  assert.strictEqual(Game.equipStrain(s, 'green').justUnlocked, false);
});

test('equipStrain: level gate blocks rich low-level players', () => {
  const s = Game.defaultState();
  s.money = 1e9;
  assert.strictEqual(Game.equipStrain(s, 'widow').reason, 'level'); // unlock 45
  assert.strictEqual(s.money, 1e9);
});

test('earnXp: multi-level jump reports every crossed milestone once', () => {
  const s = Game.defaultState();
  const r = Game.earnXp(s, 50000); // crosses m1 (200), m2 (2.5K), m3 (30K)
  assert.deepStrictEqual(r.milestones.map((m) => m.id), ['m1', 'm2', 'm3']);
  assert.deepStrictEqual(s.milestones, ['m1', 'm2', 'm3']);
  assert.ok(r.level >= 7); // XP_GROWTH 1.32: 50K xp = level 7
});

test('productionMult: milestones stack with level and strain', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(10);
  s.milestones = ['m1', 'm2'];
  s.strain = 'purple';
  // (1 + 0.08*10) * 1.5 * 1.15
  const expected = 1.8 * 1.5 * 1.15;
  assert.ok(Math.abs(Game.productionMult(s) - expected) < 1e-9);
});

test('deserialize: negative and string-typed stock values are sanitized', () => {
  const loaded = Game.deserialize(JSON.stringify({
    stock: { weed: -50, joint: '12', hash: 3, strains: ['green'] },
    money: -5
  }));
  assert.strictEqual(loaded.stock.weed, 0);
  assert.strictEqual(loaded.stock.joint, 0); // string is not a number -> 0
  assert.strictEqual(loaded.stock.hash, 3);
  assert.strictEqual(loaded.money, -5);      // money kept as-is (UI displays floor)
});

test('serialize roundtrip keeps chains, per-strain maps and market state', () => {
  const s = Game.defaultState();
  s.money = 5e6;
  s.xp = Game.xpForLevel(30);
  s.stock.weed = 123;
  s.stock.weedByStrain = { green: 100, purple: 23 };
  s.stock.strains = ['green', 'purple'];
  s.strain = 'purple';
  Game.buyAutomation(s, 'auto-joint');
  const loaded = Game.deserialize(Game.serialize(s));
  assert.deepStrictEqual(loaded, s);
});

test('autoTick: multiple chains drain weed expensive-first, dealers sell each output', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(20);
  s.money = 1e9;
  for (const id of ['auto-cake', 'auto-joint']) assert.strictEqual(Game.buyAutomation(s, id).ok, true);
  s.stock.weed = 30; // cake eats 25g, joint gets the last 5g — but 1u/s cap each
  const t = Game.autoTick(s, 0);
  assert.deepStrictEqual(t.crafted, { cake: 1, joint: 1 });
  // dealers sell their chain output (no manual stock to dip into -> quota clamped)
  assert.strictEqual(t.soldMoney.cake, px(290, 'cake'));
  assert.strictEqual(t.soldMoney.joint, px(14, 'joint'));
});
