/**
 * Playthrough simulation — plays like a real player and collects pacing stats.
 *
 * The sim drives the REAL game logic (js/game.js) tick by tick:
 *   - clicks 2.5×/s (realistic active mobile play),
 *   - crafts the best unlocked product, sells when its market pulse is favorable
 *     or storage pressure forces it,
 *   - buys upgrades cheapest-first, storage when capped too often,
 *     strains and automation chains as soon as unlocked + affordable.
 *
 * Deterministic: market time starts at 0 and advances 1s per tick.
 * Assertions encode broad pacing targets; the stats line documents the curve.
 */
const test = require('node:test');
const assert = require('node:assert');
const Game = require('../js/game.js');

/** Simulate `minutes` of play. Returns {stats, timeline}. */
function simulate(minutes) {
  const s = Game.defaultState();
  const TICKS = minutes * 60;
  let clickCarry = 0;
  let clickAdded = 0;
  let capHits = 0;
  let cappedStreak = 0;
  const stats = {
    firstUpgrade: null, firstChain: null, chains3: null, firstPurple: null, firstBlue: null,
    earned: {}, levels: {}, capHits: 0
  };
  const earnedMarks = [10000, 100000, 1000000, 10000000];
  const levelMarks = [5, 10, 13, 20, 30, 45];

  for (let tick = 0; tick < TICKS; tick++) {
    const now = tick * 1000;
    const min = tick / 60;
    // session model: 5 min active, 3 min AFK (idle games are played by bursts)
    const afk = (tick % 480) >= 300;

    // --- active play: 2.5 clicks/s (deterministic fractional carry)
    if (!afk) {
      clickCarry += 2.5;
      while (clickCarry >= 1) {
        clickCarry -= 1;
        const added = Game.addWeed(s, Game.perClick(s));
        Game.earnXp(s, added);
      }
    }
    // --- idle production
    const auto = Game.perSecond(s);
    let storedFlow = 0;
    if (auto > 0) storedFlow = Game.harvestXp(s, auto); // added grams = chain flow
    storedFlow += 2.5 * Game.perClick(s) * 0; // clicks add via the loop below
    storedFlow += clickAdded;

    // storage pressure is measured right after production, BEFORE the chains
    // drain their share (matches what the player sees when the tick lands)
    const cap = Game.maxWeedStorage(s);
    if (s.stock.weed >= cap * 0.97) { cappedStreak++; } else { cappedStreak = 0; }
    if (cappedStreak >= 120) { capHits++; cappedStreak = 0; }

    // --- automation chains (proportional to grams actually stored)
    Game.autoTick(s, now, storedFlow);

    if (afk) { /* away: no selling, stock piles up */ }
    // --- selling strategy (active only): best unlocked product by €/g × pulse; sell on
    //     favorable pulse, or dump everything when coming back from an AFK-capped session
    const level = Game.levelFromXp(s.xp);
    let best = null;
    for (const p of Game.PRODUCTS) {
      if (level < p.unlock) continue;
      const eff = (p.price / p.cost) * Game.pulse(p.id, now);
      if (!best || eff > best.eff) best = { p, eff };
    }
    const weedPulse = Game.pulse('weed', now);
    const backFromAfk = !afk && s.stock.weed >= cap * 0.9;
    if (afk) {
      // away: no crafting, no selling — stock piles up to the cap
    } else if (best) {
      if (s.stock.weed >= best.p.cost) {
        Game.craftProduct(s, best.p.id, Math.floor(s.stock.weed / best.p.cost));
      }
      const favorable = Game.pulse(best.p.id, now) > 1.0;
      if ((favorable || backFromAfk) && s.stock[best.p.id] > 0) {
        Game.sellStock(s, best.p.id, undefined, now);
      }
      if (backFromAfk && s.stock.weed > 0) Game.sellStock(s, 'weed', undefined, now);
    } else if (backFromAfk || weedPulse > 1.05) {
      if (s.stock.weed > 0) Game.sellStock(s, 'weed', undefined, now);
    }

    // --- buying strategy
    // 1) automation chain just unlocked & affordable (long-term goal first)
    for (const a of Game.AUTOMATION) {
      const owned = Game.hasAuto(s, 'craft', a.productId) && Game.hasAuto(s, 'sell', a.productId);
      if (!owned && level >= a.unlock && s.money >= a.cost) {
        const r = Game.buyAutomation(s, a.id);
        if (r.ok && !stats.firstChain) stats.firstChain = min;
      }
    }
    // 2) better strain
    const cur = Game.getStrain(s.strain);
    for (const st of Game.STRAINS) {
      if (st.priceMult > (cur ? cur.priceMult : 1) && level >= st.unlock && s.money >= st.cost) {
        if (Game.equipStrain(s, st.id).ok) {
          if (st.id === 'purple' && !stats.firstPurple) stats.firstPurple = min;
          if (st.id === 'blue' && !stats.firstBlue) stats.firstBlue = min;
        }
      }
    }
    // 3) storage when capped too often (incl. silo late)
    for (const sid of ['sbox', 'coldroom', 'silo']) {
      if (capHits >= 2 && s.money >= Game.upgradeCost(s, sid)) Game.buyUpgrade(s, sid);
    }
    // 4) cheapest hardware upgrade
    const hw = Game.UPGRADES.filter((u) => !['sbox', 'coldroom', 'silo'].includes(u.id));
    const affordable = hw
      .map((u) => ({ u, c: Game.upgradeCost(s, u.id) }))
      .filter((x) => s.money >= x.c)
      .sort((a, b) => a.c - b.c)[0];
    if (affordable) Game.buyUpgrade(s, affordable.u.id);

    // --- stats marks
    for (const e of earnedMarks) {
      if (!stats.earned[e] && (s.totalEarned || 0) >= e) stats.earned[e] = min;
    }
    for (const l of levelMarks) {
      if (!stats.levels[l] && level >= l) stats.levels[l] = min;
    }
    const chainCount = Game.AUTOMATION.filter((a) => Game.hasAuto(s, 'craft', a.productId)).length;
    if (chainCount >= 3 && !stats.chains3) stats.chains3 = min;
    if (!stats.firstUpgrade && Object.values(s.levels).some((v, i) => v > (i === 0 ? 1 : 0))) stats.firstUpgrade = min;
  }

  stats.capHits = capHits;
  stats.end = {
    level: Game.levelFromXp(s.xp),
    money: Math.floor(s.money),
    totalEarned: Math.floor(s.totalEarned || 0),
    chains: Game.AUTOMATION.filter((a) => Game.hasAuto(s, 'craft', a.productId)).length,
    strain: s.strain,
    cap: Game.maxWeedStorage(s),
    perSec: Game.perSecond(s),
    perClick: Game.perClick(s)
  };
  return stats;
}

const fmtStats = (st) => JSON.stringify({
  firstUpgrade_min: st.firstUpgrade && +st.firstUpgrade.toFixed(1),
  lvl5: st.levels[5] && +st.levels[5].toFixed(1),
  lvl10: st.levels[10] && +st.levels[10].toFixed(1),
  lvl13: st.levels[13] && +st.levels[13].toFixed(1),
  lvl20: st.levels[20] && +st.levels[20].toFixed(1),
  lvl30: st.levels[30] && +st.levels[30].toFixed(1),
  lvl45: st.levels[45] && +st.levels[45].toFixed(1),
  firstChain_min: st.firstChain && +st.firstChain.toFixed(1),
  chains3_min: st.chains3 && +st.chains3.toFixed(1),
  purple_min: st.firstPurple && +st.firstPurple.toFixed(1),
  blue_min: st.firstBlue && +st.firstBlue.toFixed(1),
  '10K_min': st.earned[10000] && +st.earned[10000].toFixed(1),
  '100K_min': st.earned[100000] && +st.earned[100000].toFixed(1),
  '1M_min': st.earned[1000000] && +st.earned[1000000].toFixed(1),
  '10M_min': st.earned[10000000] && +st.earned[10000000].toFixed(1),
  capHits: st.capHits
});

test('playthrough 2h: pacing targets + stats', () => {
  const st = simulate(120);
  console.log('SIM2H ' + fmtStats(st));
  console.log('SIM2H end ' + JSON.stringify(st.end));
  // Pacing targets for an OPTIMAL player (real players are 2-4x slower).
  // Extended curve (12 produits, 10 strains, 9 jalons, XP 1.38, paliers 25) : plus longue.
  assert.ok(st.firstUpgrade !== null && st.firstUpgrade <= 1, 'first upgrade within a minute');
  assert.ok(st.levels[10] >= 5 && st.levels[10] <= 20, 'level 10 around 10 min of optimal play');
  assert.ok(st.levels[20] >= 12 && st.levels[20] <= 60, 'level 20 is a ~25 min milestone');
  assert.ok(st.levels[30] >= 25 && st.levels[30] <= 90, 'level 30 mid-late');
  assert.ok(st.firstChain >= 2 && st.firstChain <= 15, 'first chain is an early mid-game goal');
  assert.ok(st.earned[1000000] >= 4 && st.earned[1000000] <= 20, '1M lifetime around 10 min of optimal play');
  assert.ok(st.earned[10000000] >= 9, '10M not before ~13 min even when perfect');
  assert.ok(st.end.level >= 30, 'progression keeps flowing (no wall) — vise 34+ avec nouveau contenu');
  // 150B: 12 produits + paliers + strains étendus relèvent le plafond
  assert.ok(st.end.totalEarned < 150e9, 'economy stays bounded over a 2h optimal run');
});
