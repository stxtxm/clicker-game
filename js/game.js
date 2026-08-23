/**
 * Bud Clicker — pure game logic.
 *
 * This module contains ALL the game data and every piece of *logic* that does
 * not touch the DOM or the localStorage. It is intentionally side-effect free:
 * every function takes the game state as a parameter and returns a value,
 * which makes it fully testable in Node.js (`node --test`).
 *
 * The module exposes a single namespace (`window.BudGame` in the browser,
 * `module.exports` in Node). The UI layer (`js/ui.js`) is the only part that
 * mutates state and talks to the DOM.
 *
 * State shape (see `defaultState`):
 *   state = {
 *     weed: number,                      // total harvested (grams)
 *     money:  number,                    // €
 *     strain: string,                    // equipped strain id
 *     stock:  { weed, hash, resin, strains: string[] },
 *     prices: { weed, hash, resin },
 *     levels: { harvest, auto, expert, crew, turbo, mega, sbox, coldroom },
 *     xp: number,                        // lifetime XP
 *     milestones: string[],
 *     totalEarned: number
 *   }
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BudGame = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Upgrades catalog: id, display name, icon, description, base cost. */
  const UPGRADES = [
    { id: 'harvest', name: 'Ciseaux Pro',    icon: '✂️',   desc: '+1g de weed par clic',      cost: 80 },
    { id: 'auto',    name: 'Système Auto',   icon: '🤖',   desc: '+1g de weed par seconde',   cost: 350 },
    { id: 'expert',  name: 'Taille Expert',  icon: '🧑‍🌾', desc: '+5g de weed par clic',      cost: 900 },
    { id: 'crew',    name: 'Équipe de Serre',icon: '👥',   desc: '+15g de weed par seconde',  cost: 3500 },
    { id: 'turbo',   name: 'Éclairage Turbo',icon: '⚡',   desc: 'x2 production de weed',     cost: 18000 },
    { id: 'mega',    name: 'Laboratoire+',   icon: '🌟',   desc: 'x2 production globale',     cost: 90000 },
    { id: 'sbox',    name: 'Boîte Étanche',  icon: '📦',   desc: '+500g capacité weed max',   cost: 500 },
    { id: 'coldroom',name: 'Chambre Froide', icon: '❄️',   desc: '+2500g capacité weed max',  cost: 8500 }
  ];

  /**
   * Strain catalog.
   * Each strain brings unique multi-dimensional bonuses (multiplier on yield and value):
   *   yieldMult: multiplicative bonus on weed harvested per click / second
   *   priceMult: multiplicative bonus on selling prices
   *   d/m/l/f — dark / mid / light / frost gradient stops
   */
  const STRAINS = [
    { id: 'green',  name: 'Green Dream', icon: '🌿', cost: 0,     unlock: 1,  yieldMult: 1.0, priceMult: 1.0, desc: 'La classique, résineuse et généreuse',
      d: ['#3f6d2c', '#1b3b13'], m: ['#5f8f3c', '#2c521f'], l: ['#a8d172', '#4c7a2e'], f: ['#d3eaa2', '#7fae48'],
      vein: '#173012', stroke: '#102a0c', pistil: '#ff8c00', pistil2: '#ff9d1f', frost: 1 },
    { id: 'purple', name: 'Purple Haze', icon: '🟣', cost: 2500, unlock: 4,  yieldMult: 1.5, priceMult: 1.4, desc: 'Notes violettes et sucrées, haut rendement',
      d: ['#4a2f6e', '#241243'], m: ['#6a3fa0', '#341a58'], l: ['#a06fd0', '#5c2f8a'], f: ['#cfa8ee', '#8a55c0'],
      vein: '#1c0f38', stroke: '#150a2c', pistil: '#ffab2e', pistil2: '#ffc46e', frost: 1.25 },
    { id: 'blue',   name: 'Blue Frost',  icon: '💠', cost: 15000, unlock: 8,  yieldMult: 2.2, priceMult: 2.0, desc: 'Givrée bleutée, très cristalline et puissante',
      d: ['#1f4a5a', '#0d2630'], m: ['#2e6f8f', '#163b4d'], l: ['#5fa8cf', '#2f6d8f'], f: ['#a8d8ee', '#5f9fcf'],
      vein: '#0c2230', stroke: '#081a24', pistil: '#ffffff', pistil2: '#d8f0ff', frost: 1.7 },
    { id: 'pink',   name: 'Pink Kush',   icon: '🌸', cost: 60000, unlock: 13, yieldMult: 3.5, priceMult: 3.0, desc: 'Pistils rosés denses, valeur exceptionnelle',
      d: ['#6e2f4a', '#3a1730'], m: ['#8f3f6a', '#4a1f3a'], l: ['#d06fa8', '#8a3f66'], f: ['#eea8cf', '#b06f98'],
      vein: '#351028', stroke: '#280c1e', pistil: '#ff6f9d', pistil2: '#ffb3cc', frost: 1.4 },
    { id: 'lemon',  name: 'Lemon Haze',  icon: '🍋', cost: 220000, unlock: 19, yieldMult: 5.2, priceMult: 4.5, desc: 'Arômes acidulés toniques, production fulgurante',
      d: ['#6d6d2c', '#3b3b13'], m: ['#8f8f3c', '#52521f'], l: ['#d1d172', '#7a7a2e'], f: ['#eaeaa2', '#aeae48'],
      vein: '#303012', stroke: '#2a2a0c', pistil: '#ffea00', pistil2: '#ffff55', frost: 1.8 },
    { id: 'northern',name: 'Northern Lights', icon: '🌌', cost: 850000, unlock: 26, yieldMult: 8.0, priceMult: 7.0, desc: 'Indica légendaire et givrée de trichomes',
      d: ['#2c3f6d', '#131b3b'], m: ['#3c5f8f', '#1f2c52'], l: ['#72a8d1', '#2e4c7a'], f: ['#a2d3ea', '#487fae'],
      vein: '#121730', stroke: '#0c102a', pistil: '#00ffff', pistil2: '#88ffff', frost: 2.1 },
    { id: 'gorilla', name: 'Gorilla Glue', icon: '🦍', cost: 3500000, unlock: 34, yieldMult: 13.0, priceMult: 11.0, desc: 'Résine ultra-collante, puissance maximale',
      d: ['#5a4a2f', '#30260d'], m: ['#8f723e', '#4d3b16'], l: ['#cfa86e', '#7a5f2e'], f: ['#eecda8', '#ae8848'],
      vein: '#30220c', stroke: '#241a08', pistil: '#ffaa00', pistil2: '#ffcc44', frost: 2.5 },
    { id: 'widow',  name: 'White Widow', icon: '🕷️', cost: 15000000, unlock: 45, yieldMult: 22.0, priceMult: 18.0, desc: 'Blanche de trichomes, le sommet absolu',
      d: ['#4a4a4a', '#202020'], m: ['#707070', '#383838'], l: ['#a8a8a8', '#5a5a5a'], f: ['#e0e0e0', '#888888'],
      vein: '#1f1f1f', stroke: '#121212', pistil: '#ffffff', pistil2: '#ffffff', frost: 3.0 }
  ];

  /** Base cost of each upgrade, indexed by id. */
  const BASE_COST = Object.fromEntries(UPGRADES.map((u) => [u.id, u.cost]));

  /** Default upgrade levels for a brand new game. */
  const DEFAULT_LEVELS = { harvest: 1, auto: 0, expert: 0, crew: 0, turbo: 0, mega: 0, sbox: 0, coldroom: 0 };

  /** Crafting costs: weed needed to craft concentrates. */
  const HASH_CONVERT_COST = 5;       // 5g weed -> 1g Hash
  const RESIN_CONVERT_COST = 20;     // 20g weed -> 1g Resin

  /* ---- progression curve (Slower, deeper & more rewarding) ---------------- */
  const XP_BASE = 150;
  const XP_GROWTH = 1.28;

  /** Milestones: permanent production bonuses granted at lifetime-XP thresholds. */
  const MILESTONES = [
    { id: 'm1', xp: 200,     bonus: 5,  name: 'Premiers bocal',       icon: '🌱' },
    { id: 'm2', xp: 2500,    bonus: 10, name: 'Récolte abondante',    icon: '🌿' },
    { id: 'm3', xp: 30000,   bonus: 15, name: 'Laboratoire de prod',  icon: '🏭' },
    { id: 'm4', xp: 350000,  bonus: 25, name: 'Baron de la résine',   icon: '💎' },
    { id: 'm5', xp: 4000000, bonus: 40, name: 'Légende internationale',icon: '👑' },
    { id: 'm6', xp: 50000000,bonus: 75, name: 'Empereur du Cannabis',icon: '🪐' }
  ];

  /** Lazily extended cumulative-XP table (index = level; index 1 = 0 XP). */
  const _xpTable = [0, 0];

  /** Cumulative XP required to reach `level` (level 1 needs 0 XP). */
  function xpForLevel(level) {
    const l = Math.max(1, Math.min(9999, Math.floor(Number(level) || 1)));
    while (_xpTable.length <= l) {
      const n = _xpTable.length - 1; // entry for level n+1 uses exponent n
      _xpTable.push(Math.round(XP_BASE * n * n * Math.pow(XP_GROWTH, n)));
    }
    return _xpTable[l];
  }

  /** Player level for a given lifetime XP. Always >= 1. */
  function levelFromXp(xp) {
    const x = Math.max(0, Number(xp) || 0);
    let lo = 1, hi = 2;
    while (xpForLevel(hi) <= x && hi < 8192) hi *= 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (xpForLevel(mid) <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Level, XP earned inside it and XP still needed for the next level. */
  function xpProgress(xp) {
    const level = levelFromXp(xp);
    const cur = xpForLevel(level);
    const next = xpForLevel(level + 1);
    return { level, current: Math.max(0, (xp || 0) - cur), needed: next - cur };
  }

  /**
   * Total production multiplier from level, strain yieldMult
   * and awarded milestones.
   * @param {object} s state
   */
  function productionMult(s) {
    let m = 1 + 0.08 * levelFromXp(s.xp);
    const st = getStrain(s.strain);
    if (st) m *= st.yieldMult;
    const bonus = MILESTONES.reduce((a, mi) =>
      a + ((s.milestones || []).includes(mi.id) ? mi.bonus : 0), 0);
    m *= 1 + bonus / 100;
    return m;
  }

  /** Add lifetime XP (e.g. from harvested weed), returns what just happened. */
  function earnXp(s, n) {
    const before = levelFromXp(s.xp);
    s.xp = (s.xp || 0) + n;
    const level = levelFromXp(s.xp);
    return { leveledUp: level > before, level, milestones: checkMilestones(s) };
  }

  /** Award any milestone thresholds now crossed. Returns the new ones. */
  function checkMilestones(s) {
    const awarded = [];
    for (const mi of MILESTONES) {
      if (!(s.milestones || []).includes(mi.id) && (s.xp || 0) >= mi.xp) {
        s.milestones.push(mi.id);
        awarded.push(mi);
      }
    }
    return awarded;
  }

  /**
   * Deterministic pseudo-random generator (mulberry32).
   */
  function mulberry32(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Maximum weed storage capacity based on upgrades. */
  function maxWeedStorage(s) {
    let cap = 1000;
    if (s && s.levels) {
      cap += (s.levels.sbox || 0) * 500;
      cap += (s.levels.coldroom || 0) * 2500;
    }
    return cap;
  }

  /**
   * Fresh game state.
   * @returns {object} a brand new, unmodified default state
   */
  function defaultState() {
    return {
      weed: 0,
      money: 0,
      strain: 'green',
      stock: { weed: 0, hash: 0, resin: 0, strains: ['green'] },
      prices: { weed: 12, hash: 65, resin: 280 },
      levels: { ...DEFAULT_LEVELS },
      xp: 0,
      milestones: [],
      totalEarned: 0
    };
  }

  /** @returns {object|undefined} strain definition, or undefined if unknown */
  function getStrain(id) {
    return STRAINS.find((x) => x.id === id);
  }

  /**
   * Weed gained per click (grams).
   */
  function perClick(s) {
    let pc = s.levels.harvest + s.levels.expert * 5;
    if (s.levels.turbo > 0) pc *= 2;
    if (s.levels.mega > 0) pc *= 2;
    return Math.round(pc * productionMult(s));
  }

  /**
   * Weed gained per second (auto production), scaled by production multiplier.
   */
  function perSecond(s) {
    return Math.round((s.levels.auto + s.levels.crew * 15) * productionMult(s));
  }

  /**
   * Current purchase price of an upgrade: base cost doubles per owned level.
   */
  function upgradeCost(s, id) {
    return Math.floor(BASE_COST[id] * Math.pow(2.1, s.levels[id] - (id === 'harvest' ? 1 : 0)));
  }

  /**
   * Try to buy an upgrade. Mutates state on success only.
   */
  function buyUpgrade(s, id) {
    const cost = upgradeCost(s, id);
    if (s.money < cost) return { ok: false, reason: 'funds' };
    s.money -= cost;
    s.levels[id]++;
    const u = UPGRADES.find((x) => x.id === id);
    return { ok: true, cost, name: u ? u.name : id };
  }

  /**
   * Transform raw weed into Hash or Resin.
   * @param {object} s state
   * @param {'hash'|'resin'} type product type
   * @returns {{ok:boolean, reason?:string, amount?:number}}
   */
  function craftProduct(s, type) {
    const cost = type === 'resin' ? RESIN_CONVERT_COST : HASH_CONVERT_COST;
    if (s.stock.weed < cost) return { ok: false, reason: 'weed' };
    s.stock.weed -= cost;
    s.stock[type] = (s.stock[type] || 0) + 1;
    return { ok: true, amount: 1 };
  }

  /**
   * Sell stock and return the cash gained (€).
   * Prices scale with strain priceMult.
   * @param {object} s state
   * @param {'weed'|'hash'|'resin'|'all'} type which stock to sell
   * @returns {number} cash gained
   */
  function sellStock(s, type) {
    const st = getStrain(s.strain);
    const pMult = st ? st.priceMult : 1.0;
    const prices = {
      weed: Math.round(s.prices.weed * pMult),
      hash: Math.round(s.prices.hash * pMult),
      resin: Math.round(s.prices.resin * pMult)
    };

    let gain = 0;
    if (type === 'weed' || type === 'all') {
      gain += s.stock.weed * prices.weed;
      s.stock.weed = 0;
    }
    if (type === 'hash' || type === 'all') {
      gain += (s.stock.hash || 0) * prices.hash;
      s.stock.hash = 0;
    }
    if (type === 'resin' || type === 'all') {
      gain += (s.stock.resin || 0) * prices.resin;
      s.stock.resin = 0;
    }
    s.money += gain;
    s.totalEarned = (s.totalEarned || 0) + gain;
    return gain;
  }

  /**
   * Equip a strain; buys it first if not owned.
   */
  function equipStrain(s, id) {
    const st = getStrain(id);
    if (!st) return { ok: false, reason: 'unknown' };
    const owned = s.stock.strains.includes(id);
    let justUnlocked = false;
    if (!owned) {
      if (levelFromXp(s.xp) < st.unlock) return { ok: false, reason: 'level' };
      if (s.money < st.cost) return { ok: false, reason: 'funds' };
      s.money -= st.cost;
      s.stock.strains.push(id);
      justUnlocked = true;
    }
    s.strain = id;
    return { ok: true, justUnlocked, name: st.name };
  }

  /**
   * Serialize state to the localStorage string.
   */
  function serialize(s) {
    return JSON.stringify(s);
  }

  /**
   * Load + sanitize state from a localStorage string.
   */
  function deserialize(raw) {
    const d = defaultState();
    if (!raw) return d;
    try {
      const old = JSON.parse(raw);
      if (old && typeof old === 'object') Object.assign(d, old);
    } catch {
      return d;
    }
     d.levels = { ...DEFAULT_LEVELS, ...(d.levels || {}) };
     if (!d.stock || typeof d.stock !== 'object') d.stock = { weed: 0, hash: 0, resin: 0, strains: ['green'] };
     d.stock.weed = typeof d.stock.weed === 'number' && d.stock.weed >= 0 ? d.stock.weed : 0;
     d.stock.hash = typeof d.stock.hash === 'number' && d.stock.hash >= 0 ? d.stock.hash : 0;
     d.stock.resin = typeof d.stock.resin === 'number' && d.stock.resin >= 0 ? d.stock.resin : 0;
     if (!Array.isArray(d.stock.strains)) d.stock.strains = ['green'];
     if (!getStrain(d.strain)) d.strain = 'green';
     d.weed = typeof d.weed === 'number' && d.weed >= 0 ? d.weed : 0;
     d.xp = typeof d.xp === 'number' && d.xp >= 0 ? d.xp : 0;
     d.totalEarned = typeof d.totalEarned === 'number' && d.totalEarned >= 0 ? d.totalEarned : 0;
     if (!d.prices || typeof d.prices !== 'object') d.prices = { weed: 12, hash: 65, resin: 280 };
     else {
       const p = d.prices;
       d.prices = { weed: typeof p.weed === 'number' ? p.weed : 12, hash: typeof p.hash === 'number' ? p.hash : 65, resin: typeof p.resin === 'number' ? p.resin : 280 };
     }
     // drop legacy fields from old saves
     delete d.points; delete d.genomes;
     delete d.stock.main; delete d.stock.premium; delete d.stock.rosin; delete d.stock.moonrock;
    d.milestones = Array.isArray(d.milestones)
      ? d.milestones.filter((m) => MILESTONES.some((mi) => mi.id === m))
      : [];
    return d;
  }

  return {
    UPGRADES,
    STRAINS,
    BASE_COST,
    DEFAULT_LEVELS,
    HASH_CONVERT_COST,
    RESIN_CONVERT_COST,
    XP_BASE,
    XP_GROWTH,
    MILESTONES,
    mulberry32,
    maxWeedStorage,
    defaultState,
    getStrain,
    xpForLevel,
    levelFromXp,
    xpProgress,
    productionMult,
    earnXp,
    checkMilestones,
    perClick,
    perSecond,
    upgradeCost,
    buyUpgrade,
    craftProduct,
    sellStock,
    equipStrain,
    serialize,
    deserialize
  };
});
