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

test('upgradeCost scales with COST_GROWTH (distribution has its own steeper growth)', () => {
  const s = Game.defaultState();
  const harvestBase = Game.UPGRADES.find((u) => u.id === 'harvest').cost;
  const autoBase = Game.UPGRADES.find((u) => u.id === 'auto').cost;
  assert.strictEqual(Game.upgradeCost(s, 'harvest'), harvestBase); // harvest starts at level 1
  s.levels.harvest = 2;
  assert.strictEqual(Game.upgradeCost(s, 'harvest'), Math.floor(harvestBase * Math.pow(Game.COST_GROWTH, 1)));
  assert.strictEqual(Game.upgradeCost(s, 'auto'), autoBase);   // auto starts at level 0
  assert.strictEqual(Game.upgradeCost(s, 'dist1'), 4000);
  s.levels.dist1 = 1;
  assert.strictEqual(Game.upgradeCost(s, 'dist1'), Math.floor(4000 * 1.9)); // distribution growth 1.9
});

test('buyUpgrade: insufficient funds does not mutate', () => {
  const s = Game.defaultState();
  const cost = Game.upgradeCost(s, 'harvest');
  s.money = cost - 1;
  const res = Game.buyUpgrade(s, 'harvest');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'funds');
  assert.strictEqual(s.money, cost - 1);
  assert.strictEqual(s.levels.harvest, 1);
});

test('buyUpgrade: success deducts money and levels up', () => {
  const s = Game.defaultState();
  const cost = Game.upgradeCost(s, 'harvest');
  s.money = cost + 175;
  const res = Game.buyUpgrade(s, 'harvest'); // lvl1 -> base cost (exponent 0)
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.cost, cost);
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
  s.xp = Game.xpForLevel(4);                                   // level 4 >= unlock 4
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
  s.xp = Game.xpForLevel(4);                                   // passes the level gate
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
  assert.strictEqual(Game.UPGRADES.length, 18);
  assert.strictEqual(Game.STRAINS.length, 12);
  assert.strictEqual(Game.PRODUCTS.length, 14);
  assert.strictEqual(Game.MILESTONES.length, 13);
  assert.strictEqual(Game.CONTRACTS.length, 16);
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
  const g = Game.XP_GROWTH;
  const exp2 = Math.round(150 * 1 * Math.pow(g, 1));
  const exp3 = Math.round(150 * 4 * Math.pow(g, 2));
  assert.strictEqual(Game.xpForLevel(1), 0);
  assert.strictEqual(Game.xpForLevel(2), exp2);
  assert.strictEqual(Game.xpForLevel(3), exp3);
  assert.strictEqual(Game.levelFromXp(0), 1);
  assert.strictEqual(Game.levelFromXp(exp2 - 1), 1);
  assert.strictEqual(Game.levelFromXp(exp2), 2);
  assert.strictEqual(Game.levelFromXp(exp3 - 1), 2);
  assert.strictEqual(Game.levelFromXp(exp3), 3);
});

test('xpProgress reports level, progress and XP needed', () => {
  const xp2 = Game.xpForLevel(2);
  const p = Game.xpProgress(xp2 + 2);
  assert.strictEqual(p.level, 2);
  assert.strictEqual(p.current, 2);
});

test('earnXp levels up and reports milestones', () => {
  const s = Game.defaultState();
  const xp2 = Game.xpForLevel(2);
  let r = Game.earnXp(s, xp2);
  assert.strictEqual(s.xp, xp2);
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
  s.xp = Game.xpForLevel(3);                                  // level 3 -> +24%
  assert.ok(Math.abs(Game.productionMult(s) - 1.24) < 1e-9);
});

test('perClick/perSecond scale with level', () => {
  const s = Game.defaultState();
  s.levels.harvest = 5;
  const base = 5 * 1.08;
  assert.strictEqual(Game.perClick(s), Math.round(base));
  s.xp = Game.xpForLevel(4);                                                // level 4 -> x1.32
  const lvl4Mult = 1 + 0.08 * 4;
  assert.strictEqual(Game.perClick(s), Math.round(5 * lvl4Mult));
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
    assert.strictEqual(a.cost, Math.round(p.price * 400));
    assert.strictEqual(a.unlock, p.unlock + 4); // chains arrive after the product (B1)
  }
});

test('buyAutomation: funds check, deducts money and sets chain level 1', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(5); // auto-joint unlock level (1+4)
  const COST = Game.AUTOMATION.find((a) => a.id === 'auto-joint').cost; // 14 * 400 = 5600
  assert.strictEqual(COST, 5600);
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').reason, 'funds');
  s.money = COST - 1;
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').reason, 'funds');
  s.money = COST;
  const r = Game.buyAutomation(s, 'auto-joint');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.lvl, 1);
  assert.strictEqual(r.bought, 1);
  assert.strictEqual(r.cost, COST);
  assert.strictEqual(s.money, 0);
  assert.strictEqual(Game.chainLvl(s, 'joint'), 1);
  assert.strictEqual(Game.hasAuto(s, 'craft', 'joint'), true);
  assert.strictEqual(Game.hasAuto(s, 'sell', 'joint'), true);
});

test('buyAutomation: upgrade path — levels stack, cost grows ×1.5', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(5);
  s.money = 1e7;
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint', 1).lvl, 1); // 5 600
  const cost2 = Game.automationCost(s, 'joint', 1);
  assert.strictEqual(cost2, Math.floor(5600 * Game.AUTOMATION_GROWTH)); // 8400
  const r = Game.buyAutomation(s, 'auto-joint', 1);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.lvl, 2);
  assert.strictEqual(Game.chainLvl(s, 'joint'), 2);
  // bulk x2 depuis lvl2 → niveaux 3 et 4
  const bulk4 = Game.automationCost(s, 'joint', 2);
  assert.ok(bulk4 > cost2);
  const rb = Game.buyAutomation(s, 'auto-joint', 2);
  assert.strictEqual(rb.lvl, 4);
  assert.strictEqual(Game.chainLvl(s, 'joint'), 4);
  // MAX : assez d'argent pour quelques niveaux de plus
  s.money = 1e9;
  const maxN = Game.maxAutomationLevels(s, 'joint');
  assert.ok(maxN >= 5, 'max levels affordable: ' + maxN);
});

test('buyAutomation: level gate blocks early purchases even when rich', () => {
  const s = Game.defaultState();
  s.money = 1e9; // rich but level 1
  // auto-joint unlocks at 5, auto-rosin at 49
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').reason, 'level');
  assert.strictEqual(Game.buyAutomation(s, 'auto-rosin').reason, 'level');
  assert.strictEqual(s.money, 1e9); // nothing charged
  for (const p of Game.PRODUCTS) assert.strictEqual(Game.chainLvl(s, p.id), 0);
  s.xp = Game.xpForLevel(5); // exactly level 5
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').ok, true);
  assert.strictEqual(Game.buyAutomation(s, 'auto-sachet').reason, 'level'); // unlock 8
});

test('buyAutomation: unknown id rejected, upgrades need no re-unlock', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(5);
  s.money = 1e7;
  assert.strictEqual(Game.buyAutomation(s, 'nope').reason, 'unknown');
  assert.strictEqual(Game.buyAutomation(s, 'auto-joint').ok, true);
  const before = s.money;
  // déjà embauchée : on peut améliorer (pas d'erreur 'owned'), gate niveau ignorée
  const r = Game.buyAutomation(s, 'auto-joint');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.lvl, 2);
  assert.ok(s.money < before);
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

test('autoTick: dealer sells chain output only — manual stock is sacred', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(5);
  s.money = 100000;
  Game.buyAutomation(s, 'auto-joint');    // cost 5600; 2g -> 1 joint
  s.stock.joint = 5;                      // hand-made stock
  s.stock.weed = 21;
  const t = Game.autoTick(s, 0, 21);      // 21g entered storage this tick
  assert.strictEqual(t.crafted.joint, 1);                 // min(21, max(2, 3.15)) -> 1 unit
  assert.strictEqual(t.soldMoney.joint, px(14, 'joint')); // sells the crafted unit only
  assert.strictEqual(s.stock.joint, 5);                   // manual stock untouched!
  assert.strictEqual(s.stock.weed, 19);
  assert.strictEqual(s.money, 100000 - 5600 + px(14, 'joint'));
});

test('autoTick: dealer without output sells nothing — no manual dip', () => {
  const s = Game.defaultState();
  s.auto.sell.joint = true;
  s.stock.joint = 3;
  s.stock.weed = 0;
  const t = Game.autoTick(s, 0);
  assert.deepStrictEqual(t.crafted, {});
  assert.deepStrictEqual(t.soldMoney, {});
  assert.strictEqual(s.stock.joint, 3); // hoarded stock stays yours
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
  const t = Game.autoTick(s, 0, 350);
  // chaque chaîne lvl1 vise 15% du flux (52.5g) : rosin max(300,52.5)=300 → 1u ;
  // hash max(12,52.5)=52.5 → 4u ; joint budget restant 2g → 1u
  assert.deepStrictEqual(t.crafted, { rosin: 1, hash: 4, joint: 1 });
  assert.strictEqual(s.stock.weed, 350 - 300 - 48 - 2);
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
  assert.strictEqual(Game.sellStock(s, 'joint', 0, 0), 0);        // 0 -> sells nothing
  assert.strictEqual(Game.sellStock(s, 'joint', -5, 0), 0);       // negative -> nothing
  assert.strictEqual(s.stock.joint, 5);
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

test('addWeed: no cap — everything is kept', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.addWeed(s, 999999), 999999);
  assert.strictEqual(s.stock.weed, 999999);
  assert.strictEqual(Game.addWeed(s, 5), 5);         // keeps accumulating
  assert.strictEqual(s.stock.weed, 1000004);
  assert.strictEqual(s.stock.weedByStrain.green, 1000004);
});

test('distShare: bonus global de Distribution, négatifs clampés', () => {
  assert.strictEqual(Game.distShare({}), 0);
  const s = Game.defaultState();
  assert.strictEqual(Game.distShare(s), 0);
  s.levels.dist1 = 2; // +6%
  assert.ok(Math.abs(Game.distShare(s) - 0.06) < 1e-9);
  s.levels.dist2 = 1; // +6%
  assert.ok(Math.abs(Game.distShare(s) - 0.12) < 1e-9);
  s.levels.dist3 = 3; // +30%
  assert.ok(Math.abs(Game.distShare(s) - 0.42) < 1e-9);
  // corrupted negative levels are clamped
  assert.strictEqual(Game.distShare({ levels: { dist1: -5 } }), 0);
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
  s.stock.weed = 30;
  const t = Game.autoTick(s, 0, 30); // cake vise 4.5g→max(25,4.5)=25 →1u ; joint budget 5g→2u
  assert.deepStrictEqual(t.crafted, { cake: 1, joint: 2 });
  assert.strictEqual(t.soldMoney.cake, px(290, 'cake'));
  assert.strictEqual(t.soldMoney.joint, px(14, 'joint') * 2);
});

test('autoTick: chains never consume beyond the flow (pile untouched)', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(20);
  s.money = 1e9;
  Game.buyAutomation(s, 'auto-hash'); // 12g -> 115 €
  s.stock.weed = 5000;                // a big pile
  const before = s.stock.weed;
  const flow = 240;
  const t = Game.autoTick(s, 0, flow);
  assert.strictEqual(t.crafted.hash, 3);            // 15% of 240 = 36g -> 3 units
  assert.strictEqual(before - s.stock.weed, 36);    // consumed <= flow, never the pile
});

test('autoTick: chains scale with stored flow (15% share, pause without inflow)', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(20);
  s.money = 1e9;
  Game.buyAutomation(s, 'auto-hash'); // 12g -> 115 €
  s.stock.weed = 500;
  // flow 240g: budget = max(12, 240*0.15=36) -> 3 units
  let t = Game.autoTick(s, 0, 240);
  assert.strictEqual(t.crafted.hash, 3);
  assert.strictEqual(t.soldMoney.hash, 3 * px(115, 'hash'));
  // flow below one unit's cost: nothing crafted this tick (no pile eating)
  s.stock.weed = 500;
  t = Game.autoTick(s, 0, 10);
  assert.strictEqual(t.crafted.hash, undefined);
  // no flow (stock full): chains pause entirely
  s.stock.weed = 500;
  t = Game.autoTick(s, 0, 0);
  assert.strictEqual(t.crafted.hash, undefined);
});

test('autoTick: flow budget is consumed expensive-first across chains', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(20);
  s.money = 1e9;
  Game.buyAutomation(s, 'auto-cake');   // 25g -> 290 €
  Game.buyAutomation(s, 'auto-joint');  // 2g  -> 14 €
  s.stock.weed = 500;
  const t = Game.autoTick(s, 0, 120);
  // chaque chaîne lvl1 vise 15% du flux (18g) : cake max(25,18)=25 → 1u ;
  // joint max(2,18)=18 → 9u
  assert.deepStrictEqual(t.crafted, { cake: 1, joint: 9 });
});


test('autoTick: no flow -> chains pause, pile untouched (no cap needed)', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(20);
  s.money = 1e9;
  Game.buyAutomation(s, 'auto-hash');
  s.stock.weed = 5000; // big pile
  const t = Game.autoTick(s, 0, 0); // flow 0: nothing produced this tick
  assert.deepStrictEqual(t.crafted, {});
  assert.strictEqual(s.stock.weed, 5000); // pile untouched
  assert.deepStrictEqual(t.soldMoney, {});
});

test('autoTick: chain level widens throughput (idle money scale)', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(20);
  s.money = 1e9;
  Game.buyAutomation(s, 'auto-hash'); // lvl1
  s.stock.weed = 5000;
  let t = Game.autoTick(s, 0, 240);   // lvl1: max(12, 240*0.15=36) -> 3u
  assert.strictEqual(t.crafted.hash, 3);
  Game.buyAutomation(s, 'auto-hash');          // -> lvl2
  s.stock.weed = 5000;
  t = Game.autoTick(s, 0, 240);                // lvl2: max(12, 72) -> 6u
  assert.strictEqual(t.crafted.hash, 6);
  // clamp par chaîne : CHAIN_SHARE_MAX=60% même à haut niveau
  for (let i = 0; i < 5; i++) Game.buyAutomation(s, 'auto-hash'); // lvl7
  s.stock.weed = 50000;
  t = Game.autoTick(s, 0, 240);                // min(60%,144g) -> 12u
  assert.strictEqual(t.crafted.hash, 12);
});

test('chainShareOf: base × niveau + bonus Distribution, clamp 60%', () => {
  const s = Game.defaultState();
  assert.ok(Math.abs(Game.chainShareOf(s, 'joint') - 0) < 1e-9);      // lvl 0
  s.chainLvl.joint = 1;
  assert.ok(Math.abs(Game.chainShareOf(s, 'joint') - 0.15) < 1e-9);
  s.levels.dist1 = 2;                                                  // +6%
  assert.ok(Math.abs(Game.chainShareOf(s, 'joint') - 0.21) < 1e-9);
  s.chainLvl.joint = 10;                                               // 150+6% -> clamp
  assert.strictEqual(Game.chainShareOf(s, 'joint'), Game.CHAIN_SHARE_MAX);
});

// --- ruées (spikes) -------------------------------------------------------------

test('maybeTriggerSpike: only unlocked markets can spike', () => {
  // rng alterné : 1er appel < chance (déclenche), 2e appel choisit l'index
  const mkRng = (seq) => { let flip = false; return () => { flip = !flip; return flip ? 0.001 : seq; }; };
  const collect = (xp) => {
    const s = Game.defaultState();
    s.xp = xp;
    const picks = new Set();
    for (let i = 0; i < 60; i++) {
      const p = Game.maybeTriggerSpike(s, i * 100000, mkRng((i % 10) / 10));
      if (p) picks.add(p);
      s.spikeNextAt = 0;
      s.spikeUntil = 0;
    }
    return picks;
  };
  // niveau 1 : weed + joint uniquement
  for (const p of collect(Game.xpForLevel(1))) {
    if (p === 'weed') continue;
    const prod = Game.getProduct(p);
    assert.ok(prod && prod.unlock <= 1, 'spike niveau 1 sur produit verrouillé: ' + p);
  }
  // niveau 62 : tout peut spiker, y compris weed
  const late = collect(Game.xpForLevel(62));
  assert.ok(late.size >= 5, 'late game spike pool large: ' + [...late].join(','));
});

// --- contrats, spécialisation de chaînes & paliers -----------------------------

test('CONTRACTS: données cohérentes — ids uniques, exclusives valides, produits connus', () => {
  const ids = Game.CONTRACTS.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'ids uniques');
  for (const ct of Game.CONTRACTS) {
    assert.ok(ct.target > 0, ct.id + ': target > 0');
    assert.ok(Number.isInteger(ct.unlockLevel) && ct.unlockLevel > 0, ct.id + ': unlockLevel entier');
    assert.ok(ct.reward && typeof ct.reward.desc === 'string', ct.id + ': reward desc');
    for (const ex of ct.exclusive || []) {
      assert.ok(ids.includes(ex), ct.id + ': exclusive ' + ex + ' existe');
    }
    if (ct.type === 'crafted') {
      assert.ok(Game.getProduct(ct.productId), ct.id + ': productId connu');
    } else {
      assert.strictEqual(ct.productId, null, ct.id + ': pas de productId sur un contrat global');
    }
  }
});

test('chainMilestoneMult: paliers ×2 cumulatifs façon AdCap', () => {
  const s = Game.defaultState();
  s.chainLvl.joint = 24;
  assert.strictEqual(Game.chainMilestoneMult(s, 'joint'), 1);
  s.chainLvl.joint = 25;
  assert.strictEqual(Game.chainMilestoneMult(s, 'joint'), 2);
  s.chainLvl.joint = 49;
  assert.strictEqual(Game.chainMilestoneMult(s, 'joint'), 2);
  s.chainLvl.joint = 50;
  assert.strictEqual(Game.chainMilestoneMult(s, 'joint'), 4);
  s.chainLvl.joint = 200; // 2*2*2*2*2*3 = 96
  assert.strictEqual(Game.chainMilestoneMult(s, 'joint'), 96);
  assert.deepStrictEqual(Game.nextChainMilestone(s, 'joint'), { at: 300, mult: 3 });
  s.chainLvl.joint = 650; // paliers late-game : 650→×6, 800→×8, 1000→×10
  assert.strictEqual(Game.chainMilestoneMult(s, 'joint'), 2 * 2 * 2 * 2 * 2 * 3 * 3 * 4 * 5 * 6);
  assert.deepStrictEqual(Game.nextChainMilestone(s, 'joint'), { at: 800, mult: 8 });
  s.chainLvl.joint = 1000;
  assert.strictEqual(Game.chainMilestoneMult(s, 'joint'), 2 * 2 * 2 * 2 * 2 * 3 * 3 * 4 * 5 * 6 * 8 * 10);
  assert.strictEqual(Game.nextChainMilestone(s, 'joint'), null);
  // les autres chaînes ne bougent pas
  assert.strictEqual(Game.chainMilestoneMult(s, 'sachet'), 1);
});

test('chainYieldMult inclut le palier de chaîne', () => {
  const s = Game.defaultState();
  s.chainLvl.joint = 24;
  const before = Game.chainYieldMult(s, 'joint');
  s.chainLvl.joint = 25;
  const after = Game.chainYieldMult(s, 'joint');
  assert.strictEqual(Math.round((after / before) * 100) / 100, 2);
});

test('chainSpecCost: formule exponentielle, NaN/Infinity aux bornes', () => {
  const s = Game.defaultState();
  const def = Game.CHAIN_SPECS.joint.speed;
  assert.strictEqual(Game.chainSpecCost(s, 'joint', 'speed', 1), def.baseCost);
  assert.strictEqual(Game.chainSpecCost(s, 'joint', 'speed', 2), def.baseCost + Math.floor(def.baseCost * def.growth));
  assert.ok(Number.isNaN(Game.chainSpecCost(s, 'inconnu', 'speed', 1)));
  assert.ok(Number.isNaN(Game.chainSpecCost(s, 'joint', 'branche', 1)));
  s.chainSpecs.joint.speed = def.max;
  assert.strictEqual(Game.chainSpecCost(s, 'joint', 'speed', 1), Infinity);
});

test('buyChainSpec: refus si chaîne non embauchée, hors budget ou maxée', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.buyChainSpec(s, 'joint', 'speed', 1).reason, 'locked');
  s.chainLvl.joint = 1;
  assert.strictEqual(Game.buyChainSpec(s, 'joint', 'speed', 1).reason, 'funds');
  s.money = Game.chainSpecCost(s, 'joint', 'speed', 3);
  const r = Game.buyChainSpec(s, 'joint', 'speed', 3);
  assert.ok(r.ok);
  assert.strictEqual(r.lvl, 3);
  assert.strictEqual(r.bought, 3);
  assert.strictEqual(s.chainSpecs.joint.speed, 3);
  assert.strictEqual(s.money, 0);
  assert.strictEqual(Game.buyChainSpec(s, 'joint', 'speed', 2).reason, 'funds');
  s.chainSpecs.joint.speed = Game.CHAIN_SPECS.joint.speed.max;
  assert.strictEqual(Game.buyChainSpec(s, 'joint', 'speed', 1).reason, 'maxed');
  assert.strictEqual(Game.buyChainSpec(s, 'joint', 'branche', 1).reason, 'unknown');
});


test('checkContracts: offre au bon niveau, complète au target, claim débloque la reward', () => {
  const s = Game.defaultState();
  const ct = Game.CONTRACTS.find((c) => c.id === 'c_joint_king');
  // sous le niveau requis : ni offert ni complété
  s.xp = Game.xpForLevel(ct.unlockLevel - 1);
  s.chainStats = { joint: { crafted: ct.target, sold: 0, money: 0 } };
  assert.deepStrictEqual(Game.checkContracts(s), []);
  assert.strictEqual(s.contracts.offered.length, 0);
  // au niveau requis sans target atteinte : offert, pas complété
  s.xp = Game.xpForLevel(ct.unlockLevel);
  s.chainStats.joint.crafted = ct.target - 1;
  assert.deepStrictEqual(Game.checkContracts(s), []);
  assert.ok(s.contracts.offered.includes(ct.id));
  assert.ok(!s.contracts.completed.includes(ct.id));
  // target atteinte : complété
  s.chainStats.joint.crafted = ct.target;
  assert.deepStrictEqual(Game.checkContracts(s).map((c) => c.id), [ct.id]);
  assert.ok(s.contracts.completed.includes(ct.id));
  // claim : reward dérivée de claimed
  assert.ok(Game.claimContract(s, ct.id).ok);
  assert.ok(s.contracts.claimed.includes(ct.id));
  assert.ok(!s.contracts.completed.includes(ct.id));
  assert.strictEqual(Game.getContractRewards(s, 'joint').yieldMult, ct.reward.yieldMult);
  assert.strictEqual(Game.getContractRewards(s, 'sachet').yieldMult, 1, 'la reward ne fuit pas sur les autres produits');
  // refus propres
  s.contracts.completed.push(ct.id); // claim d'un contrat déjà réclamé
  assert.strictEqual(Game.claimContract(s, ct.id).reason, 'already_claimed');
  assert.strictEqual(Game.claimContract(s, 'c_sachet_king').reason, 'not_completed');
  assert.strictEqual(Game.claimContract(s, 'inconnu').reason, 'unknown');
  // re-check après claim : pas de re-complétion
  assert.deepStrictEqual(Game.checkContracts(s), []);
});

test('getContractRewards: globalYield et flowBoost s’appliquent à toutes les chaînes', () => {
  const s = Game.defaultState();
  s.contracts.completed = ['c_money_maker', 'c_volume_king'];
  Game.claimContract(s, 'c_money_maker');
  Game.claimContract(s, 'c_volume_king');
  for (const p of Game.PRODUCTS) {
    const r = Game.getContractRewards(s, p.id);
    assert.strictEqual(r.globalYield, 1.15, p.id);
    assert.strictEqual(r.flowBoost, 1.2, p.id);
  }
  assert.strictEqual(Game.getContractRewards(s, 'joint').yieldMult, 1);
});

test('autoTick alimente les compteurs de contrats (chainStats + totaux globaux)', () => {
  const s = Game.defaultState();
  s.chainLvl.joint = 1;
  s.stock.weed = 100;
  const r = Game.autoTick(s, Date.now(), 20);
  assert.ok(r.crafted.joint >= 1, 'au moins 1 unité fabriquée');
  assert.ok(s.chainStats.joint.crafted >= 1);
  assert.ok(s.chainStats.joint.sold >= 1);
  assert.ok(s.chainStats.joint.money > 0);
  assert.ok(s.contracts.chainMoneyEarned > 0);
  assert.ok(s.contracts.chainGramsConverted > 0);
});

test('deserialize: sanitisation chainStats / compteurs de contrats / chainSpecs / drop legacy', () => {
  const s = Game.defaultState();
  s.chainStats = {
    joint: { crafted: -5, sold: 'boom', money: 1.9 },
    bogus: { crafted: 9, sold: 0, money: 0 }
  };
  s.chainSpecs.joint.speed = 99;           // clamp au max (10)
  s.chainSpecs.joint.yield = -3;           // clamp à 0
  s.contracts.claimed = ['c_joint_king', 'ct_inconnu'];
  s.contracts.completed = 'nonsense';
  s.contracts.chainMoneyEarned = -50;
  s.contracts.chainGramsConverted = 'x';
  s.contractRewards = { globalYield: 999 }; // champ legacy supprimé
  const d = Game.deserialize(Game.serialize(s));
  assert.deepStrictEqual(d.chainStats.joint, { crafted: 0, sold: 0, money: 1 });
  assert.strictEqual(d.chainStats.bogus, undefined);
  assert.strictEqual(d.chainSpecs.joint.speed, 10);
  assert.strictEqual(d.chainSpecs.joint.yield, 0);
  assert.deepStrictEqual(d.contracts.claimed, ['c_joint_king']);
  assert.deepStrictEqual(d.contracts.completed, []);
  assert.strictEqual(d.contracts.chainMoneyEarned, 0);
  assert.strictEqual(d.contracts.chainGramsConverted, 0);
  assert.strictEqual(d.contractRewards, undefined);
  // les rewards dérivées survivent au chargement via claimed
  assert.strictEqual(Game.getContractRewards(d, 'joint').yieldMult, 1.25);
});

test('roundtrip contrats/paliers: claimed + chainStats + chainSpecs préservés', () => {
  const s = Game.defaultState();
  s.chainLvl.joint = 50;
  s.chainSpecs.joint.speed = 4;
  s.chainStats.joint = { crafted: 123, sold: 100, money: 4567 };
  s.contracts.claimed = ['c_joint_king'];
  const d = Game.deserialize(Game.serialize(s));
  assert.strictEqual(d.chainLvl.joint, 50);
  assert.strictEqual(d.chainSpecs.joint.speed, 4);
  assert.deepStrictEqual(d.chainStats.joint, { crafted: 123, sold: 100, money: 4567 });
  assert.deepStrictEqual(d.contracts.claimed, ['c_joint_king']);
  assert.strictEqual(Game.chainMilestoneMult(d, 'joint'), 4);
  assert.strictEqual(Game.getContractRewards(d, 'joint').yieldMult, 1.25);
});

test('courbe XP hybride: early inchangé, late-game aplati après le niveau XP_LATE_FROM', () => {
  const g = Game.XP_GROWTH, gl = Game.XP_GROWTH_LATE, F = Game.XP_LATE_FROM;
  // niveaux <= XP_LATE_FROM + 1 : formule historique pure (pacing intact)
  for (const L of [2, 10, 30, 45, F + 1]) {
    const n = L - 1;
    assert.strictEqual(Game.xpForLevel(L), Math.round(150 * n * n * Math.pow(g, n)), 'lvl ' + L);
  }
  // au-delà : la croissance bascule sur XP_GROWTH_LATE
  const n46 = F + 1; // exposant du niveau F + 2
  assert.strictEqual(Game.xpForLevel(F + 2), Math.round(150 * n46 * n46 * Math.pow(g, F) * Math.pow(gl, 1)));
  // monotone et significativement plus accessible que la courbe pure 1.42
  assert.ok(Game.xpForLevel(F + 3) > Game.xpForLevel(F + 2));
  const late = Math.round(150 * 74 * 74 * Math.pow(g, F) * Math.pow(gl, 74 - F));
  const old = Math.round(150 * 74 * 74 * Math.pow(g, 74));
  assert.ok(late < old / 10, 'le niveau 75 doit couter au moins 10x moins cher qu avant');
});

test('contenu late-game: produits/variétés/chaînes dérivées cohérents', () => {
  for (const id of ['nectar', 'caviar']) {
    const p = Game.getProduct(id);
    assert.ok(p && p.unlock > 75 && p.price > 115000, id + ' existe et est late-game');
    assert.ok(Game.CHAIN_SPECS[id], 'chaîne spécialisable : ' + id);
    const a = Game.AUTOMATION.find((x) => x.productId === id);
    assert.ok(a && a.unlock === p.unlock + 4 && a.cost === Math.round(p.price * 400), 'automation dérivée ' + id);
  }
  assert.ok(Game.getStrain('runtz') && Game.getStrain('godfather'));
  assert.ok(Game.getStrain('runtz').unlock === 70 && Game.getStrain('godfather').unlock === 78);
});

test('buyChainSpec sur une chaîne late-game (nectar)', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(90); // chaîne nectar débloquée au niveau 86
  s.chainLvl.nectar = 1;      // embauchée : prérequis buyChainSpec
  s.money = 1e11;
  const res = Game.buyChainSpec(s, 'nectar', 'yield', 2);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(s.chainSpecs.nectar.yield, 2);
  assert.ok(Game.chainYieldMult(s, 'nectar') > 1);
});

test('contrats late-game: chain_money, crafted et récompenses dérivées', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(80);
  // c_chain_billion : 1 Md€ idle
  s.contracts.chainMoneyEarned = 1e9;
  let done = Game.checkContracts(s);
  assert.ok(done.some((c) => c.id === 'c_chain_billion'));
  assert.strictEqual(Game.claimContract(s, 'c_chain_billion').ok, true);
  assert.strictEqual(Game.getContractRewards(s, 'shatter').globalYield, 1.25);
  // c_moonrock_king : 100 moonrocks craftés
  s.chainStats.moonrock = { crafted: 100, sold: 0, money: 0 };
  done = Game.checkContracts(s);
  assert.ok(done.some((c) => c.id === 'c_moonrock_king'));
  Game.claimContract(s, 'c_moonrock_king');
  assert.strictEqual(Game.getContractRewards(s, 'moonrock').yieldMult, 1.8);
  assert.strictEqual(Game.getContractRewards(s, 'joint').yieldMult, 1);
});

test('jalons m10-m13 et nouveaux achievements', () => {
  const s = Game.defaultState();
  s.xp = 1.5e10; // franchit m10 (1e10)
  const awarded = Game.checkMilestones(s);
  assert.ok(awarded.some((m) => m.id === 'm10'));
  assert.ok(!s.milestones.includes('m11')); // 1e12 pas atteint
  // ach_1b
  s.totalEarned = 2e9;
  const got = Game.checkAchievements(s);
  assert.ok(got.some((a) => a.id === 'ach_1b'));
  // ach_contracts_5 : 5 contrats réclamés
  s.contracts.claimed = ['c_joint_king', 'c_cake_king', 'c_money_maker', 'c_vape_king', 'c_moonrock_king'];
  assert.ok(Game.checkAchievements(s).some((a) => a.id === 'ach_contracts_5'));
});

test('roundtrip late-game: nouveaux catalogues + jalons survivent à la save', () => {
  const s = Game.defaultState();
  s.chainLvl.caviar = 3;
  s.chainSpecs.caviar.prestige = 0; s.chainSpecs.caviar.yield = 5;
  s.milestones = ['m1', 'm10'];
  s.contracts.claimed = ['c_chain_billion'];
  const d = Game.deserialize(Game.serialize(s));
  assert.strictEqual(d.chainLvl.caviar, 3);
  assert.strictEqual(d.chainSpecs.caviar.yield, 5);
  assert.deepStrictEqual(d.milestones, ['m1', 'm10']);
  assert.strictEqual(Game.getContractRewards(d, 'joint').globalYield, 1.25);
  // une vieille save sans specs nectar/caviar reçoit les défauts
  const old = Game.deserialize(JSON.stringify({ xp: 5e12, chainLvl: { joint: 2 } }));
  assert.deepStrictEqual(old.chainSpecs.nectar, { speed: 0, yield: 0, volume: 0 });
  assert.deepStrictEqual(old.chainSpecs.caviar, { speed: 0, yield: 0, volume: 0 });
});

// ---- stats dérivées : chainEarnRate / chainSpecImpact (juice + stats justes) ----

/** État riche : une ou plusieurs chaînes embauchées + flux idle, prêt à gagner. */
function richChainState() {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(30); // toutes les chaînes ubiquitairement déblocables ici
  s.money = 1e12;
  for (const a of Game.AUTOMATION) {
    if (Game.chainLvl(s, a.productId) === 0 && Game.levelFromXp(s.xp) >= a.unlock) {
      const r = Game.buyAutomation(s, a.id, 1);
      assert.ok(r.ok);
    }
  }
  s.levels.auto = 300;
  return s;
}

test('chainEarnRate: zéro sans flux ni chaîne, > 0 dès qu\'une chaîne tourne', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.chainEarnRate(s).total, 0);
  assert.deepStrictEqual(Game.chainEarnRate(s).per, {});
  s.levels.auto = 20; // flux idle mais aucune chaîne → toujours 0
  assert.strictEqual(Game.chainEarnRate(s).total, 0);
  s.xp = Game.xpForLevel(10);
  s.money = 1e9;
  assert.ok(Game.buyAutomation(s, 'auto-joint', 1).ok);
  const rate = Game.chainEarnRate(s, 1000000);
  assert.ok(rate.per.joint > 0, 'chaîne joint + flux → €/s > 0');
  assert.strictEqual(rate.total, rate.per.joint);
  assert.deepStrictEqual(Object.keys(rate.per), ['joint']);
});

test('chainEarnRate: les chaînes ne transforment jamais plus que le flux produit', () => {
  const s = richChainState(); // plusieurs chaînes embauchées, part clampée
  for (const p of Game.PRODUCTS) {
    assert.ok(Game.chainShareOf(s, p.id) <= Game.CHAIN_SHARE_MAX + 1e-9,
      'part de ' + p.id + ' clampée à CHAIN_SHARE_MAX');
  }
  const now = 1500000000000;
  const F = Game.perSecond(s); // flux idle constant (pas de leveling ici)
  const sim = JSON.parse(JSON.stringify(s));
  let gramsCrafted = 0;
  for (let i = 0; i < 5; i++) {
    sim.stock.weed = (sim.stock.weed || 0) + F; // reprovisionne le tas (le flux POUR ce tick)
    const tick = Game.autoTick(sim, now, F);
    for (const [pid, units] of Object.entries(tick.crafted)) {
      gramsCrafted += units * Game.getProduct(pid).cost;
    }
  }
  assert.ok(gramsCrafted > 0, 'au moins une chaîne a transformé');
  assert.ok(gramsCrafted <= F * 5, 'jamais plus que le flux produit (le tas est sacré)');
});

test('chainEarnRate: réagit instantanément à un point de spé', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(10);
  s.money = 1e9;
  assert.ok(Game.buyAutomation(s, 'auto-joint', 1).ok);
  s.levels.auto = 300;
  const now = 999;
  const piece = Game.CHAIN_SPECS.joint.speed.per;
  const r0 = Game.chainEarnRate(s, now).per.joint;
  s.chainSpecs.joint.speed += 1; // SANS achat simulé long : la stat dérive de state
  assert.ok(Game.chainEarnRate(s, now).per.joint >= r0, 'speed +1 ne baisse pas');
  const r2 = Game.chainEarnRate(s, now).per.joint;
  s.chainSpecs.joint.yield += 1;
  assert.ok(Game.chainEarnRate(s, now).per.joint >= r2, 'yield +1 ne baisse pas');
  const r3 = Game.chainEarnRate(s, now).per.joint;
  s.chainSpecs.joint.volume += 1;
  assert.ok(Game.chainEarnRate(s, now).per.joint >= r3, 'volume ne casse jamais le gain');
  assert.ok(piece > 0);
});

test('chainEarnRate affiché = gain réel mesuré par autoTick (horloge fixe)', () => {
  const s = richChainState();
  const now = 1234567890000;
  const F = Game.perSecond(s); // flux idle constant
  const eps = Game.chainEarnRate(s, now).total;
  assert.ok(eps > 0);
  // mesuré : même state, même flux F, même `now` (pulse constant) → reproduire
  // un tick par seconde comme l'UI, sans leveling qui fausserait le flux.
  const N = 20;
  const sim = JSON.parse(JSON.stringify(s));
  let measured = 0;
  for (let i = 0; i < N; i++) {
    sim.stock.weed = (sim.stock.weed || 0) + F; // le flux de CE tick
    const tick = Game.autoTick(sim, now, F);
    measured += Object.values(tick.soldMoney || {}).reduce((a, b) => a + b, 0);
  }
  measured /= N;
  assert.ok(Math.abs(measured - eps) <= Math.max(1, Math.abs(eps) * 0.01),
    'mesuré=' + measured + ' estimé=' + eps);
});

test('chainSpecImpact: texte par branche conforme au catalogue + delta €/s du bon signe', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(10);
  s.money = 1e9;
  assert.ok(Game.buyAutomation(s, 'auto-joint', 1).ok);
  s.levels.auto = 300;
  const speed = Game.chainSpecImpact(s, 'joint', 'speed');
  assert.strictEqual(speed.pctText, '+5% flux');
  assert.ok(speed.epsDelta > 0, 'speed → plus de €/s');
  const y = Game.chainSpecImpact(s, 'joint', 'yield');
  assert.strictEqual(y.pctText, '+4% prix');
  assert.ok(y.epsDelta > 0);
  const v = Game.chainSpecImpact(s, 'joint', 'volume');
  assert.strictEqual(v.pctText, '+15% max');
  assert.ok(v.epsDelta > 0);
  // maxée / inconnue
  s.chainSpecs.joint.speed = Game.CHAIN_SPECS.joint.speed.max;
  assert.deepStrictEqual(Game.chainSpecImpact(s, 'joint', 'speed'), { maxed: true });
  assert.strictEqual(Game.chainSpecImpact(s, 'inconnu', 'speed'), null);
  assert.strictEqual(Game.chainSpecImpact(s, 'joint', 'branche'), null);
});


