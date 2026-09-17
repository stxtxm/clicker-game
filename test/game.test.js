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

test('perClick: Doigts Agiles adds a share of auto production (5%/level)', () => {
  const s = Game.defaultState();          // harvest lvl1 -> 1*1.08
  s.levels.auto = 10;                     // perSecond = round(10*1.08) = 11
  s.levels.thumb = 1;                     // +5% of 11 = +0.55
  // 1.08 + 0.55 = 1.63 -> 2 (vs 1 without thumb)
  assert.strictEqual(Game.perClick(s), 2);
  s.levels.thumb = 5;                     // +25% of 11 = +2.75 -> 1.08+2.75=3.83 -> 4
  assert.strictEqual(Game.perClick(s), 4);
});

test('comboMultiplier: +5% par clic soutenu, capé à ×3 (40 clics)', () => {
  assert.strictEqual(Game.comboMultiplier(0), 1);
  assert.strictEqual(Game.comboMultiplier(1), 1.05);
  assert.strictEqual(Game.comboMultiplier(4), 1.2);
  assert.strictEqual(Game.comboMultiplier(Game.COMBO_CAP), Game.COMBO_MAX_MULT);
  assert.strictEqual(Game.comboMultiplier(999), Game.COMBO_MAX_MULT);
  assert.strictEqual(Game.comboMultiplier(-3), 1);
  assert.strictEqual(Game.comboMultiplier('x'), 1);
  assert.strictEqual(Game.COMBO_CAP, (Game.COMBO_MAX_MULT - 1) / Game.COMBO_PER);
});

test('clickBud: 100% du clic = pour le joueur (never aspiré par les chaînes)', () => {
  const s = Game.defaultState();
  const r = Game.clickBud(s, 1000);
  assert.strictEqual(r.added, 1);                 // lvl1, combo ×1
  assert.strictEqual(s.weed, 1);
  assert.strictEqual(s.stock.weed, 1);
  assert.strictEqual(s.xp, 1);
  assert.strictEqual(s.totalClicks, 1);
  assert.strictEqual(s.combo.count, 1);
  assert.strictEqual(r.combo.count, 1);
  // le clic n'ajoute AUCUN flow aux chaînes : elles ne voient que l'auto
  const before = s.stock.weed;
  assert.strictEqual(Game.autoTick(s, 1000, 0).crafted.joint, undefined);
  assert.strictEqual(s.stock.weed, before);
});

test('clickBud: le combo monte mécaniquement (+5%/clic) et compte jusqu’au cap', () => {
  const s = Game.defaultState();
  for (let i = 0; i < 5; i++) Game.clickBud(s, 1000 + i * 100); // dans la fenêtre de 2s
  assert.strictEqual(s.combo.count, 5);
  assert.strictEqual(s.combo.maxCombo, 5);
  assert.strictEqual(Game.comboMultiplier(s.combo.count), 1.25); // 5 clics → ×1.25
});

test('clickBud: le cap ×3 est plafonné mais le compteur continue', () => {
  const s = Game.defaultState();
  for (let i = 0; i < 45; i++) Game.clickBud(s, 1000 + i * 10);
  assert.strictEqual(s.combo.count, 45);
  assert.strictEqual(Game.comboMultiplier(s.combo.count), Game.COMBO_MAX_MULT);
  const lastAdded = s.weed;
  const r = Game.clickBud(s, 4000); // après la fenêtre → combo reset
  assert.strictEqual(s.combo.count, 1);
  assert.strictEqual(r.combo.count, 1);
  assert.strictEqual(s.combo.maxCombo, 45);
  assert.ok(lastAdded < s.weed); // re-click produit toujours
});

test('clickBud: la fenêtre expire au-delà de COMBO_WINDOW_MS', () => {
  const s = Game.defaultState();
  Game.clickBud(s, 5000);
  Game.clickBud(s, 5400);
  assert.strictEqual(s.combo.count, 2);
  const c = Game.comboNow(s, 5400 + Game.COMBO_WINDOW_MS + 1);
  assert.strictEqual(c.count, 0);
  assert.strictEqual(c.maxCombo, 2);
});

test('crit upgrade: chance bornée par niveau (1,5%/niv, cap 30%)', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.critChance(s), 0);
  assert.strictEqual(Game.isCritHit(s, 1000), false); // sans upgrade, jamais de crit
  s.levels.crit = 1;
  assert.strictEqual(Game.critChance(s), Game.CRIT_CHANCE_PER);
  s.levels.crit = 20;
  assert.strictEqual(Game.critChance(s), 0.30);
  s.levels.crit = 999;
  assert.strictEqual(Game.critChance(s), 0.30); // clampé même si la save triche
});

test('crit upgrade: coût ×1.8, bulk MAX borné à 20 niveaux', () => {
  const s = Game.defaultState();
  s.levels.crit = 5;
  assert.strictEqual(Game.upgradeCost(s, 'crit'), Math.floor(1000000 * Math.pow(1.8, 5)));
  const def = Game.UPGRADES.find((u) => u.id === 'crit');
  assert.strictEqual(def.max, 20);
  s.money = 1e12;
  assert.strictEqual(Game.maxAffordableLevels(s, 'crit'), 20);
});

test('isCritHit: déterministe, et un clic critique rapporte ×CRIT_MULT', () => {
  const s = Game.defaultState();
  s.levels.crit = 20; // 30% — un crit doit exister dans les 20k premières ms
  let hitNow = -1;
  for (let t = 0; t < 20000; t++) {
    if (Game.isCritHit(s, t)) { hitNow = t; break; }
  }
  assert.ok(hitNow >= 0, '8 crits attendus sur 20k ms à 30%');
  assert.strictEqual(Game.isCritHit(s, hitNow), Game.isCritHit(s, hitNow));
  const noCrit = Game.defaultState();
  const base = Game.perClick(noCrit); // 1g au niveau 1
  const r = Game.clickBud(s, hitNow);
  assert.strictEqual(r.crit, true);
  assert.strictEqual(r.added, base * Game.CRIT_MULT);
  assert.strictEqual(s.weed, base * Game.CRIT_MULT);
  // deux clics consécutifs dans la même ms ne partagent pas le roll (totalClicks)
  const r2 = Game.clickBud(s, hitNow);
  assert.strictEqual(typeof r2.crit, 'boolean');
});

test('clicker upgrade: +3g de weed par clic par niveau, borné à max 30', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.perClick(s), 1);          // lvl0: (1+0) × 1.08 -> 1
  s.levels.clicker = 1;
  assert.strictEqual(Game.perClick(s), 4);          // (1+3) × 1.08 = 4.32 -> 4
  s.levels.clicker = 4;
  assert.strictEqual(Game.perClick(s), 14);         // (1+12) × 1.08 = 14.04 -> 14
  // croissance de coût ×1.8 par niveau (additif borné, pas de snowball)
  assert.strictEqual(Game.upgradeCost(s, 'clicker'), Math.floor(20000 * Math.pow(1.8, 4)));
  // plafond : au max, plus d'achat possible
  s.levels.clicker = 30;
  assert.strictEqual(Game.upgradeCost(s, 'clicker'), Infinity);
  assert.strictEqual(Game.buyUpgrade(s, 'clicker').reason, 'maxed');
  const bulk = Game.buyUpgradeBulk(s, 'clicker', 2);
  assert.strictEqual(bulk.reason, 'maxed');
  assert.strictEqual(Game.maxAffordableLevels(s, 'clicker'), 0);
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
  assert.strictEqual(Game.UPGRADES.length, 16);
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

test('mastery: chaque gramme récolté avec la variété équipée la fait XP', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(4); // débloque purple
  Game.clickBud(s, 1000); // 1g sur green (équipée par défaut)
  assert.strictEqual(s.mastery.green, 1);
  assert.strictEqual(s.mastery.purple, undefined);
  s.money = 1e9;
  assert.strictEqual(Game.equipStrain(s, 'purple').ok, true);
  Game.clickBud(s, 2000); // produit via purple (yield ×1.5 → 2g)
  assert.strictEqual(s.mastery.green, 1);
  assert.ok(s.mastery.purple >= 1, 'purple a engrangé sa récolte');
});

test('mastery: niveau dérivé de la courbe ×1.5, bonus +0,5%/niv borné au cap', () => {
  const s = Game.defaultState();
  s.mastery.green = 1;
  assert.strictEqual(Game.masteryLevel(s, 'green'), 0); // 1 < 750
  s.mastery.green = Game.masteryXpForLevel(2);
  assert.strictEqual(Game.masteryLevel(s, 'green'), 2);
  assert.strictEqual(Game.masteryMult(s, 'green'), 1 + 0.005 * 2);
  assert.ok(Math.abs(Game.productionMult(s) - 1.08 * (1 + 0.005 * 2)) < 1e-9);
  s.mastery.green = 1e18;
  assert.strictEqual(Game.masteryLevel(s, 'green'), Game.MASTERY_MAX_LEVEL);
  assert.strictEqual(Game.masteryMult(s, 'green'), 1 + 0.005 * Game.MASTERY_MAX_LEVEL);
});

test('mastery/Alerts: roundtrip + sanitisation (id inconnu, négatif, clamp)', () => {
  const s = Game.defaultState();
  s.mastery = { green: 1200, purple: -5, bogus: 99 };
  s.alerts = { weed: 1.25, joint: 2.5, hash: 0.5, nope: 1.1 };
  const d = Game.deserialize(Game.serialize(s));
  assert.strictEqual(d.mastery.green, 1200);
  assert.strictEqual(d.mastery.purple, undefined);  // négatif → retiré
  assert.strictEqual(d.mastery.bogus, undefined);
  assert.strictEqual(d.alerts.weed, 1.25);
  assert.strictEqual(d.alerts.joint, Game.ALERT_MAX); // 2.5 → clampé à 1.29
  assert.strictEqual(d.alerts.hash, 1.02);             // 0.5 → clampé UP à 1.02
  assert.strictEqual(d.alerts.nope, undefined);
  // vieilles saves sans mastery/alerts → défauts
  const old = Game.deserialize('{"weed":42}');
  assert.deepStrictEqual(old.mastery, {});
  assert.deepStrictEqual(old.alerts, {});
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
  assert.strictEqual(loaded.totalClicks, 0);
  assert.deepStrictEqual(loaded.combo, { count: 0, lastClickAt: 0, maxCombo: 0 });
});

test('deserialize: combo + totalClicks sont sanitizés et migrés', () => {
  const loaded = Game.deserialize(JSON.stringify({
    totalClicks: 12.9,
    combo: { count: '7', lastClickAt: 5, maxCombo: 99 },
    // venus de la tentative #24 — doivent être purgés
    sessionClicks: 1, activeSessionBonuses: [],
    prestige: 2, prestigeLevel: 1, prestigeBonus: 3, totalEarnedLifetime: 5,
    activePerformanceEvents: [], autoClickEnabled: true, autoClickLastTime: 2,
    levels: { power: 2, crit: 1, chain: 3, frenzy: 1, harvest: 3 }
  }));
  assert.strictEqual(loaded.totalClicks, 12);
  assert.deepStrictEqual(loaded.combo, { count: 7, lastClickAt: 5, maxCombo: 99 });
  assert.strictEqual(loaded.sessionClicks, undefined);
  assert.strictEqual(loaded.prestige, undefined);
  assert.strictEqual(loaded.levels.power, undefined);
  assert.strictEqual(loaded.levels.crit, 1); // crit est un upgrade légitime depuis cette version
  assert.strictEqual(loaded.levels.harvest, 3);
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
  // chaque chaîne lvl1 vise 8% du flux (28g) : rosin max(300,28)=300 → 1u ;
  // hash max(12,28)=28 → 2u ; joint budget restant 26g → 13u
  assert.deepStrictEqual(t.crafted, { rosin: 1, hash: 2, joint: 13 });
  assert.strictEqual(s.stock.weed, 350 - 300 - 24 - 26);
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

test('marketSamples: une période complète, bornée ±30%, déterministe', () => {
  const a = Game.marketSamples('joint', 100000, 36);
  assert.strictEqual(a.length, 36);
  for (const v of a) assert.ok(v >= 0.7 && v <= 1.3);
  assert.deepStrictEqual(a, Game.marketSamples('joint', 100000, 36));
  const step = Game.MARKET.periodMs / 36;
  assert.ok(Math.abs(a[0] - Game.pulse('joint', 100000 - 35 * step)) < 1e-9);
  assert.ok(Math.abs(a[35] - Game.pulse('joint', 100000)) < 1e-9);
});

test('setPriceAlert: armage/désarmage + cible clampée, marché inconnu refusé', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.setPriceAlert(s, 'nope').ok, false);
  const r = Game.setPriceAlert(s, 'joint', 100000);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cleared, false);
  assert.ok(r.target >= 1.05 && r.target <= Game.ALERT_MAX);
  assert.ok(s.alerts.joint >= 1.05 && s.alerts.joint <= Game.ALERT_MAX);
  const cleared = Game.setPriceAlert(s, 'joint', 100000);
  assert.strictEqual(cleared.cleared, true);
  assert.strictEqual(s.alerts.joint, undefined);
});

test('checkPriceAlerts: déclenche une fois la cible atteinte en montant', () => {
  const s = Game.defaultState();
  const armed = Game.setPriceAlert(s, 'joint', 0);
  const target = armed.target;
  let firedAt = -1;
  for (let t = 0; t < Game.MARKET.periodMs * 2; t += 1000) {
    const cur = Game.pulse('joint', t) * Game.spikeMult(s, 'joint', t);
    if (cur >= target && Game.trend('joint', t) >= 0) { firedAt = t; break; }
  }
  assert.ok(firedAt >= 0, 'la cible doit être atteignable sur une période');
  assert.deepStrictEqual(Game.checkPriceAlerts(s, firedAt), ['joint']);
  assert.strictEqual(s.alerts.joint, undefined);
  assert.deepStrictEqual(Game.checkPriceAlerts(s, firedAt + 1000), []);
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
  const t = Game.autoTick(s, 0, 30); // cake vise 2.4g→max(25,2.4)=25 →1u ; joint budget 5g→1u
  assert.deepStrictEqual(t.crafted, { cake: 1, joint: 1 });
  assert.strictEqual(t.soldMoney.cake, px(290, 'cake'));
  assert.strictEqual(t.soldMoney.joint, px(14, 'joint') * 1);
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
  assert.strictEqual(t.crafted.hash, 1);            // 8% of 240 = 19.2g -> 1 unit
  assert.strictEqual(before - s.stock.weed, 12);    // consumed <= flow, never the pile
});

test('autoTick: chains scale with stored flow (8% share, pause without inflow)', () => {
  const s = Game.defaultState();
  s.xp = Game.xpForLevel(20);
  s.money = 1e9;
  Game.buyAutomation(s, 'auto-hash'); // 12g -> 115 €
  s.stock.weed = 500;
  // flow 240g: budget = max(12, 240*0.08=19.2) -> 1 unit
  let t = Game.autoTick(s, 0, 240);
  assert.strictEqual(t.crafted.hash, 1);
  assert.strictEqual(t.soldMoney.hash, 1 * px(115, 'hash'));
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
  // chaque chaîne lvl1 vise 8% du flux (9.6g) : cake max(25,9.6)=25 → 1u ;
  // joint max(2,9.6)=9.6 → 4u
  assert.deepStrictEqual(t.crafted, { cake: 1, joint: 4 });
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
  let t = Game.autoTick(s, 0, 240);   // lvl1: max(12, 240*0.08=19.2) -> 1u
  assert.strictEqual(t.crafted.hash, 1);
  Game.buyAutomation(s, 'auto-hash');          // -> lvl2
  s.stock.weed = 5000;
  t = Game.autoTick(s, 0, 240);                // lvl2: max(12, 38.4) -> 3u
  assert.strictEqual(t.crafted.hash, 3);
  // clamp par chaîne : CHAIN_SHARE_MAX=40% même à haut niveau
  for (let i = 0; i < 5; i++) Game.buyAutomation(s, 'auto-hash'); // lvl7
  s.stock.weed = 50000;
  t = Game.autoTick(s, 0, 240);                // min(40%, 96g) -> 8u
  assert.strictEqual(t.crafted.hash, 8);
});

test('chainShareOf: base × niveau + bonus Distribution, clamp 40%', () => {
  const s = Game.defaultState();
  assert.ok(Math.abs(Game.chainShareOf(s, 'joint') - 0) < 1e-9);      // lvl 0
  s.chainLvl.joint = 1;
  assert.ok(Math.abs(Game.chainShareOf(s, 'joint') - 0.08) < 1e-9);
  s.levels.dist1 = 2;                                                  // +6%
  assert.ok(Math.abs(Game.chainShareOf(s, 'joint') - 0.14) < 1e-9);
  s.chainLvl.joint = 10;                                               // 80+6% -> clamp
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

// ---- streak quotidien (bonus journalier capé, déterministe en now) ----------

test('dayKey: format YYYY-MM-DD local, déterministe', () => {
  assert.strictEqual(Game.dayKey(0), '1970-01-01');
  assert.match(Game.dayKey(1700000000000), /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(Game.dayKey(1700000000000), Game.dayKey(1700000000000));
});

test('rollStreak: jour 1, consécutif +1, jour sauté → reset, idempotent même jour', () => {
  const s = Game.defaultState();
  // midi local : aucun des décalages du test ne peut traverser minuit
  const day0 = new Date(1700000000000);
  day0.setHours(12, 0, 0, 0);
  const T0 = day0.getTime();
  let r = Game.rollStreak(s, T0);
  assert.strictEqual(r.rolled, true);
  assert.strictEqual(r.count, 1);
  // même jour : idempotent (pas de double comptage)
  r = Game.rollStreak(s, T0 + 3600000);
  assert.strictEqual(r.rolled, false);
  assert.strictEqual(r.count, 1);
  // lendemain : jour 2
  r = Game.rollStreak(s, T0 + 86400000);
  assert.strictEqual(r.rolled, true);
  assert.strictEqual(r.count, 2);
  // un jour sauté : reset à 1
  r = Game.rollStreak(s, T0 + 3 * 86400000);
  assert.strictEqual(r.rolled, true);
  assert.strictEqual(r.count, 1);
});

test('rollStreak: compteur capé à STREAK_MAX_DAYS', () => {
  const s = Game.defaultState();
  const day0 = new Date(1700000000000);
  day0.setHours(12, 0, 0, 0);
  const T0 = day0.getTime();
  let last = null;
  for (let d = 0; d < Game.STREAK_MAX_DAYS + 5; d++) {
    last = Game.rollStreak(s, T0 + d * 86400000);
  }
  assert.strictEqual(last.count, Game.STREAK_MAX_DAYS);
});

test('streakMult: actif seulement le jour courant, bonus borné même si la save triche', () => {
  const s = Game.defaultState();
  assert.strictEqual(Game.streakMult(s, 123456), 1); // pas de streak → neutre
  const day0 = new Date(1700000000000);
  day0.setHours(12, 0, 0, 0);
  const T0 = day0.getTime();
  Game.rollStreak(s, T0);
  assert.strictEqual(Game.streakMult(s, T0), 1 + Game.STREAK_PER);
  // le lendemain, avant re-roll : inactif (lastDay ≠ aujourd'hui)
  assert.strictEqual(Game.streakMult(s, T0 + 86400000), 1);
  // save tricheuse : count hors bornes → clampé au cap
  s.streak = { lastDay: Game.dayKey(T0), count: 999 };
  assert.strictEqual(Game.streakMult(s, T0), 1 + Game.STREAK_PER * Game.STREAK_MAX_DAYS);
  // vieux jour (save périmée ou forgée) → inactif
  s.streak = { lastDay: '2000-01-01', count: 5 };
  assert.strictEqual(Game.streakMult(s, T0), 1);
});

test('productionMult intègre le streak actif (clic et idle via perClick/perSecond)', () => {
  const s = Game.defaultState();
  const day0 = new Date(1700000000000);
  day0.setHours(12, 0, 0, 0);
  const T = day0.getTime();
  const base = Game.productionMult(s, T);
  Game.rollStreak(s, T);
  assert.ok(Math.abs(Game.productionMult(s, T) - base * (1 + Game.STREAK_PER)) < 1e-9);
  s.levels.harvest = 30; // sous le premier palier ×2 (TIER_EVERY 40)
  assert.strictEqual(Game.perClick(s, T), 34); // 30 × 1.08 × 1.04 = 33.7
  const noStreak = JSON.parse(JSON.stringify(s));
  noStreak.streak = { lastDay: '2000-01-01', count: 3 };
  assert.strictEqual(Game.perClick(noStreak, T), 32); // 30 × 1.08 = 32.4
  assert.ok(Game.perSecond(s, T) >= Game.perSecond(noStreak, T));
});

// ---- stats de session (volatiles : jamais restaurées) -----------------------

test('newSession/sessionStats: €/min, part idle, taux de crit — calcul pur', () => {
  const s = Game.defaultState();
  const t0 = 1700000000000;
  Game.newSession(s, t0);
  s.session.earned = 12000;
  s.session.idleEarned = 3000;
  s.session.clicks = 200;
  s.session.crits = 50;
  s.session.maxCombo = 37;
  s.session.peakSales = 4;
  s.session.biggestSale = 5000;
  const st = Game.sessionStats(s, t0 + 600000); // 10 min
  assert.strictEqual(st.minutes, 10);
  assert.strictEqual(st.perMin, 1200);
  assert.ok(Math.abs(st.idleShare - 0.25) < 1e-9);
  assert.strictEqual(st.critRate, 25);
  assert.strictEqual(st.maxCombo, 37);
  assert.strictEqual(st.peakSales, 4);
  assert.strictEqual(st.biggestSale, 5000);
  // état sans session ouverte : stats à zéro, AUCUNE mutation (fonction pure)
  const fresh = Game.defaultState();
  const z = Game.sessionStats(fresh, t0);
  assert.strictEqual(z.earned, 0);
  assert.strictEqual(z.minutes, 0);
  assert.strictEqual(z.critRate, 0);
});

test('sessionTrackSale: pic compté (pulse ≥ 1.15), biggestSale manuel, part idle séparée', () => {
  const s = Game.defaultState();
  Game.newSession(s, 0);
  // un instant au pic du marché weed (≥ PEAK_SALE_MULT) et un autre en creux
  let peakT = -1, lowT = -1;
  for (let t = 0; t < 120000; t += 500) {
    if (peakT < 0 && Game.pulse('weed', t) >= Game.PEAK_SALE_MULT) peakT = t;
    if (lowT < 0 && Game.pulse('weed', t) <= 0.85) lowT = t;
    if (peakT >= 0 && lowT >= 0) break;
  }
  assert.ok(peakT >= 0 && lowT >= 0, 'un pic et un creux existent dans un cycle');
  Game.sessionTrackSale(s, 'weed', 500, peakT);
  Game.sessionTrackSale(s, 'weed', 1000, lowT);
  assert.strictEqual(s.session.peakSales, 1);
  assert.strictEqual(s.session.biggestSale, 1000);
  assert.strictEqual(s.session.earned, 1500);
  Game.sessionTrackSale(s, 'joint', 2500, lowT, true); // vente idle via chaîne
  assert.strictEqual(s.session.idleEarned, 2500);
  assert.strictEqual(s.session.biggestSale, 1000); // l'idle ne compte pas comme vente manuelle
  Game.sessionTrackSale(s, 'weed', 0, peakT); // gain nul : no-op
  assert.strictEqual(s.session.earned, 4000);
});

test('clickBud nourrit la session (clics, crits, combo max) ; ventes manuelles/idle trackées', () => {
  const s = Game.defaultState();
  Game.newSession(s, 0);
  s.levels.crit = 20;
  let hitT = -1;
  for (let t = 100; t < 20000; t++) {
    if (Game.isCritHit(s, t)) { hitT = t; break; }
  }
  assert.ok(hitT > 0);
  Game.clickBud(s, hitT);
  Game.clickBud(s, hitT);
  assert.strictEqual(s.session.clicks, 2);
  // deux clics dans la même ms : le 2e roll (totalClicks changé) peut ne pas crit
  assert.ok(s.session.crits >= 1);
  assert.ok(s.session.maxCombo >= 2);
  // vente manuelle : earned + biggestSale, PAS idle
  s.stock.weed = 10;
  s.stock.weedByStrain[s.strain] = 10;
  const gained = Game.sellStock(s, 'weed', undefined, 123456);
  assert.ok(gained > 0);
  assert.ok(s.session.earned >= gained);
  assert.strictEqual(s.session.idleEarned, 0);
  assert.strictEqual(s.session.biggestSale, gained);
  // vente idle (chaîne) : idleEarned, pas biggestSale
  s.xp = Game.xpForLevel(10);
  s.money = 1e9;
  assert.ok(Game.buyAutomation(s, 'auto-joint', 1).ok);
  s.levels.auto = 10;
  const flow = Game.perSecond(s);
  s.stock.weed = (s.stock.weed || 0) + flow;
  const tick = Game.autoTick(s, 123456, flow);
  const idleMoney = Object.values(tick.soldMoney || {}).reduce((a, b) => a + b, 0);
  assert.ok(idleMoney > 0, 'la chaîne a vendu ce tick');
  assert.strictEqual(s.session.idleEarned, idleMoney);
});

test('roundtrip: streak persiste (sanitisé), session reste volatile', () => {
  const s = Game.defaultState();
  Game.newSession(s, 0);
  s.session.earned = 12345;
  Game.rollStreak(s, 1700000000000);
  const d = Game.deserialize(Game.serialize(s));
  assert.strictEqual(d.streak.count, 1);
  assert.strictEqual(d.streak.lastDay, Game.dayKey(1700000000000));
  assert.strictEqual(d.session.earned, 0); // volatiles : jamais restaurées
  // save corrompue : streak borné + jour invalide → null, session purgée
  const bad = Game.deserialize(JSON.stringify({ streak: { lastDay: 'oops', count: -5 }, session: { earned: 999 } }));
  assert.strictEqual(bad.streak.lastDay, null);
  assert.strictEqual(bad.streak.count, 0);
  assert.strictEqual(bad.session.earned, 0);
});

test('ACHIEVEMENTS exporté (grille UI) : catalogue cohérent', () => {
  assert.ok(Array.isArray(Game.ACHIEVEMENTS) && Game.ACHIEVEMENTS.length >= 15);
  for (const a of Game.ACHIEVEMENTS) {
    assert.ok(a.id && a.name && a.desc, 'champs affichage présents pour ' + a.id);
    assert.strictEqual(typeof a.bonus, 'number');
    assert.strictEqual(typeof a.condition, 'function');
  }
});

test('ach_spike_master: context-dépendant (ctx.spikeSale), pas sans', () => {
  const s = Game.defaultState();
  // sans contexte: pas de déblocage (condition nécessite ctx.spikeSale truthy)
  assert.ok(!Game.checkAchievements(s).some((a) => a.id === 'ach_spike_master'));
  assert.ok(!Game.checkAchievements(s, {}).some((a) => a.id === 'ach_spike_master'));
  // avec ctx.spikeSale truthy: débloqué
  const got = Game.checkAchievements(s, { spikeSale: true });
  assert.ok(got.some((a) => a.id === 'ach_spike_master'));
  assert.strictEqual(got.find((a) => a.id === 'ach_spike_master').bonus, 5);
  // idempotent: seconde passe ne récompense pas à nouveau
  assert.strictEqual(Game.checkAchievements(s, { spikeSale: true }).length, 0);
});

test('ach_idle_1h: context-dependant (ctx.offlineMoney), seuil 10K', () => {
  const s = Game.defaultState();
  assert.ok(!Game.checkAchievements(s, { offlineMoney: 9999 }).some((a) => a.id === 'ach_idle_1h'));
  assert.ok(!Game.checkAchievements(s, { offlineMoney: 0 }).some((a) => a.id === 'ach_idle_1h'));
  assert.ok(!Game.checkAchievements(s, {}).some((a) => a.id === 'ach_idle_1h'));
  const s2 = Game.defaultState();
  assert.ok(Game.checkAchievements(s2, { offlineMoney: 10000 }).some((a) => a.id === 'ach_idle_1h'));
  const s3 = Game.defaultState();
  assert.ok(Game.checkAchievements(s3, { offlineMoney: 50000 }).some((a) => a.id === 'ach_idle_1h'));
  assert.strictEqual(Game.ACHIEVEMENTS.find((a) => a.id === 'ach_idle_1h').bonus, 8);
});

test('DAILY catalogue: 3/jour, gains bornes sans multiplicateur', () => {
  assert.ok(Array.isArray(Game.DAILY_CHALLENGES) && Game.DAILY_CHALLENGES.length >= 6);
  assert.strictEqual(Game.DAILY_COUNT, 3);
  for (const d of Game.DAILY_CHALLENGES) {
    assert.ok(d.id && d.name && d.desc && d.icon, 'affichage ' + d.id);
    assert.ok(Number.isInteger(d.target) && d.target > 0, 'cible ' + d.id);
    assert.ok(d.reward && (d.reward.weed > 0 || d.reward.money > 0), 'gain ' + d.id);
    assert.ok((d.reward.weed || 0) <= 12000 && (d.reward.money || 0) <= 25000, 'borne ' + d.id);
    assert.ok(!d.reward.mult && !d.bonus, 'pas de multiplicateur ' + d.id);
  }
});

test('dailyForDay: deterministe, 3 defis, sans remise', () => {
  const a = Game.dailyForDay('2026-09-17').map((d) => d.id);
  const b = Game.dailyForDay('2026-09-17').map((d) => d.id);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.length, 3);
  assert.strictEqual(new Set(a).size, 3);
  assert.strictEqual(Game.dailyForDay('2026-09-18').length, 3);
});

test('rollDaily: photo au lever, idempotent meme jour', () => {
  const s = Game.defaultState();
  const T0 = new Date(2026, 8, 17, 12, 0, 0).getTime();
  Game.newSession(s, T0);
  s.totalClicks = 50;
  s.totalEarned = 7000;
  let r = Game.rollDaily(s, T0);
  assert.strictEqual(r.rolled, true);
  assert.strictEqual(r.day, Game.dayKey(T0));
  assert.strictEqual(s.daily.base.clicks, 50);
  s.totalClicks = 80;
  r = Game.rollDaily(s, T0 + 3600000);
  assert.strictEqual(r.rolled, false);
  assert.strictEqual(s.daily.base.clicks, 50);
  r = Game.rollDaily(s, T0 + 86400000);
  assert.strictEqual(r.rolled, true);
  assert.strictEqual(s.daily.base.clicks, 80);
  assert.deepStrictEqual(s.daily.done, []);
});

test('dailyProgress + checkDaily: delta journalier, combo record absolu', () => {
  const s = Game.defaultState();
  const T0 = new Date(2026, 8, 17, 12, 0, 0).getTime();
  Game.newSession(s, T0);
  Game.rollDaily(s, T0);
  const keyOf = (m) => m;
  const setCounter = (metric, v) => {
    if (metric === 'clicks') s.totalClicks = v;
    else if (metric === 'earned') s.totalEarned = v;
    else if (metric === 'xp') s.xp = v;
    else if (metric === 'crafted') s.stock.joint = v;
    else if (metric === 'crits' && s.session) s.session.crits = v;
    else if (metric === 'peaks' && s.session) s.session.peakSales = v;
  };
  const today = Game.dailyForDay(Game.dayKey(T0));
  const clicks = today[0];
  const key = keyOf(clicks.metric);
  setCounter(key, 30);
  s.daily.base[key] = 30;
  assert.strictEqual(Game.dailyProgress(s, clicks, T0).value, 0);
  setCounter(key, 30 + clicks.target + 5);
  assert.strictEqual(Game.dailyProgress(s, clicks, T0).value, clicks.target + 5);
  assert.strictEqual(Game.dailyProgress(s, clicks, T0).done, true);
  assert.ok(Game.checkDaily(s, T0).some((d) => d.id === clicks.id));
  assert.strictEqual(Game.checkDaily(s, T0).filter((d) => d.id === clicks.id).length, 0);
  const combo = Game.DAILY_CHALLENGES.find((d) => d.id === 'daily_combo_20');
  s.combo.maxCombo = 25;
  assert.strictEqual(Game.dailyProgress(s, combo, T0).value, 25);
  assert.strictEqual(Game.dailyProgress(s, combo, T0).done, true);
});

test('claimDaily: gain unique, erreurs couvertes', () => {
  const s = Game.defaultState();
  const T0 = new Date(2026, 8, 17, 12, 0, 0).getTime();
  Game.newSession(s, T0);
  Game.rollDaily(s, T0);
  const today = Game.dailyForDay(Game.dayKey(T0)).map((d) => d.id);
  assert.strictEqual(Game.claimDaily(s, 'nope', T0).ok, false);
  const outside = Game.DAILY_CHALLENGES.map((d) => d.id).find((id) => !today.includes(id));
  assert.strictEqual(Game.claimDaily(s, outside, T0).reason, 'not_today');
  const target = Game.dailyForDay(Game.dayKey(T0))[0];
  assert.strictEqual(Game.claimDaily(s, target.id, T0).reason, 'not_done');
  s.totalEarned = 1e12;
  s.totalClicks = 1e6;
  s.xp = 1e9;
  s.combo.maxCombo = 999;
  s.stock.joint = 999;
  if (s.session) { s.session.crits = 99; s.session.peakSales = 99; }
  assert.ok(Game.checkDaily(s, T0).some((d) => d.id === target.id));
  const weed0 = s.stock.weed;
  const money0 = s.money;
  const res = Game.claimDaily(s, target.id, T0);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(Game.claimDaily(s, target.id, T0).reason, 'already_claimed');
  assert.ok(s.stock.weed >= weed0 && s.money >= money0);
  assert.ok(s.daily.claimed.includes(target.id));
});

test('roundtrip daily: persiste, corrompu regenere, vieux migre', () => {
  const s = Game.defaultState();
  const T0 = new Date(2026, 8, 17, 12, 0, 0).getTime();
  Game.newSession(s, T0);
  s.totalClicks = 100;
  Game.rollDaily(s, T0);
  s.totalClicks = 150;
  Game.checkDaily(s, T0);
  const d = Game.deserialize(Game.serialize(s));
  assert.strictEqual(d.daily.day, Game.dayKey(T0));
  assert.strictEqual(d.daily.base.clicks, 100);
  assert.deepStrictEqual(d.daily.done, s.daily.done);
  const bad = Game.deserialize(JSON.stringify({ daily: { day: 'oops', base: { clicks: -3 }, done: ['daily_clicks_200', 'bogus'], claimed: 'nope' } }));
  assert.strictEqual(bad.daily.day, null);
  assert.deepStrictEqual(bad.daily.done, []);
  const old = Game.deserialize(JSON.stringify({ money: 42 }));
  assert.strictEqual(old.daily.day, null);
  assert.deepStrictEqual(old.daily.done, []);
});



