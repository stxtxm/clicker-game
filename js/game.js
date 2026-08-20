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
 *     points: number,                    // harvested buds (never sold)
 *     money:  number,                    // currency used to buy upgrades/strains
 *     strain: string,                    // currently equipped strain id
 *     stock:  { main, premium, strains[] },
 *     prices: { main, premium },         // sell price per unit
*   levels: { harvest, auto, expert, crew, turbo, mega },
 *     xp: number,                         // lifetime XP (= total buds ever harvested)
 *     genomes: number,                    // prestige currency, +25% production each
 *     milestones: string[],               // awarded milestone ids
 *     totalEarned: number                 // lifetime cash earned
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
    { id: 'harvest', name: 'Ciseaux',     icon: '✂️',   desc: '+1 point par clic',        cost: 50 },
    { id: 'auto',    name: 'Auto-récolte',icon: '🤖',   desc: '+1 point par seconde',     cost: 200 },
    { id: 'expert',  name: 'Expert',      icon: '🧑‍🌾', desc: '+5 points par clic',        cost: 500 },
    { id: 'crew',    name: 'Équipe',      icon: '👥',   desc: '+10 points par seconde',   cost: 2000 },
    { id: 'turbo',   name: 'Turbo',       icon: '⚡',   desc: 'x2 points par clic',       cost: 10000 },
    { id: 'mega',    name: 'Mega',        icon: '🌟',   desc: 'x2 toute la production',   cost: 50000 }
  ];

  /**
   * Strain catalog.
   * Each strain defines its own gradient palette used by the SVG renderer:
   *   d/m/l/f — dark / mid / light / frost gradient stops (two colors each)
   *   vein, stroke — leaf vein + outline colors
   *   pistil / pistil2 — hair colors
   *   frost — frost intensity multiplier (drives trichome count / frost veil)
   *   unlock — player level required to buy the strain
   */
  const STRAINS = [
    { id: 'green',  name: 'Green Dream', icon: '🌿', cost: 0,     unlock: 1,  desc: 'La classique, résineuse et généreuse',
      d: ['#3f6d2c', '#1b3b13'], m: ['#5f8f3c', '#2c521f'], l: ['#a8d172', '#4c7a2e'], f: ['#d3eaa2', '#7fae48'],
      vein: '#173012', stroke: '#102a0c', pistil: '#ff8c00', pistil2: '#ff9d1f', frost: 1 },
    { id: 'purple', name: 'Purple Haze', icon: '🟣', cost: 1500, unlock: 3,  desc: 'Notes violettes et sucrées',
      d: ['#4a2f6e', '#241243'], m: ['#6a3fa0', '#341a58'], l: ['#a06fd0', '#5c2f8a'], f: ['#cfa8ee', '#8a55c0'],
      vein: '#1c0f38', stroke: '#150a2c', pistil: '#ffab2e', pistil2: '#ffc46e', frost: 1.25 },
    { id: 'blue',   name: 'Blue Frost',  icon: '💠', cost: 8000, unlock: 6,  desc: 'Givrée bleutée, très cristalline',
      d: ['#1f4a5a', '#0d2630'], m: ['#2e6f8f', '#163b4d'], l: ['#5fa8cf', '#2f6d8f'], f: ['#a8d8ee', '#5f9fcf'],
      vein: '#0c2230', stroke: '#081a24', pistil: '#ffffff', pistil2: '#d8f0ff', frost: 1.7 },
    { id: 'pink',   name: 'Pink Kush',   icon: '🌸', cost: 25000, unlock: 10, desc: 'Pistils rosés, calyx denses',
      d: ['#6e2f4a', '#3a1730'], m: ['#8f3f6a', '#4a1f3a'], l: ['#d06fa8', '#8a3f66'], f: ['#eea8cf', '#b06f98'],
      vein: '#351028', stroke: '#280c1e', pistil: '#ff6f9d', pistil2: '#ffb3cc', frost: 1.4 }
  ];

  /** Base cost of each upgrade, indexed by id. */
  const BASE_COST = Object.fromEntries(UPGRADES.map((u) => [u.id, u.cost]));

  /** Default upgrade levels for a brand new game. */
  const DEFAULT_LEVELS = { harvest: 1, auto: 0, expert: 0, crew: 0, turbo: 0, mega: 0 };

  /** Chance per tick that 5 regular buds convert into 1 premium bud. */
  const PREMIUM_DROP_CHANCE = 0.05;
  /** Conversion amount: 5 buds -> 1 premium. */
  const PREMIUM_DROP_COST = 5;

  /* ---- progression curve ---------------------------------------------------
   * XP = 1 per harvested bud, earned forever. The level curve is quadratic
   * (60 * (level-1)^2 cumulative XP), so early levels come fast and later ones
   * demand real runs. Each level adds +10% production; every owned strain
   * beyond the first adds +5%; each milestone and each prestige genome add
   * their own permanent multipliers. All of them multiply together.
   */
  const XP_BASE = 60;
  const PRESTIGE_BASE = 10000;

  /** Milestones: permanent production bonuses granted at lifetime-XP thresholds. */
  const MILESTONES = [
    { id: 'm1', xp: 100,     bonus: 5,  name: 'Premiers pas',         icon: '🌱' },
    { id: 'm2', xp: 1000,    bonus: 10, name: 'En pleine croissance', icon: '🌿' },
    { id: 'm3', xp: 10000,   bonus: 15, name: 'Serre industrielle',   icon: '🏭' },
    { id: 'm4', xp: 100000,  bonus: 25, name: 'Mogul du cannabis',    icon: '💎' },
    { id: 'm5', xp: 1000000, bonus: 50, name: 'Roi du bud',           icon: '👑' }
  ];

  /** Cumulative XP required to reach `level` (level 1 needs 0 XP). */
  function xpForLevel(level) {
    return XP_BASE * (level - 1) * (level - 1);
  }

  /** Player level for a given lifetime XP. Always >= 1. */
  function levelFromXp(xp) {
    return 1 + Math.floor(Math.sqrt(Math.max(0, xp || 0) / XP_BASE));
  }

  /** Level, XP earned inside it and XP still needed for the next level. */
  function xpProgress(xp) {
    const level = levelFromXp(xp);
    const cur = xpForLevel(level);
    const next = xpForLevel(level + 1);
    return { level, current: Math.max(0, (xp || 0) - cur), needed: next - cur };
  }

  /**
   * Total production multiplier from level, owned strains, prestige genomes
   * and awarded milestones.
   * @param {object} s state
   */
  function productionMult(s) {
    let m = 1 + 0.10 * levelFromXp(s.xp);
    m *= 1 + 0.05 * Math.max(0, (s.stock.strains.length || 1) - 1);
    m *= 1 + 0.25 * (s.genomes || 0);
    const bonus = MILESTONES.reduce((a, mi) =>
      a + ((s.milestones || []).includes(mi.id) ? mi.bonus : 0), 0);
    m *= 1 + bonus / 100;
    return m;
  }

  /** Add lifetime XP (e.g. from a harvest), returns what just happened. */
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

  /** Prestige genomes a reset would grant right now (sub-linear growth). */
  function prestigeGain(s) {
    return Math.floor(Math.sqrt((s.xp || 0) / PRESTIGE_BASE));
  }

  /** Whether a prestige reset is available. */
  function canPrestige(s) {
    return prestigeGain(s) >= 1;
  }

  /**
   * Prestige reset ("Nouvelle génération"): wipe currency, stock and upgrades,
   * keep strains, level/XP, milestones and records, and bank a permanent
   * production multiplier. Returns the number of genomes gained.
   */
  function prestige(s) {
    const gain = prestigeGain(s);
    if (gain < 1) return { ok: false, reason: 'threshold' };
    s.genomes = (s.genomes || 0) + gain;
    s.points = 0;
    s.money = 0;
    s.stock = { main: 0, premium: 0, strains: s.stock.strains };
    s.levels = { ...DEFAULT_LEVELS };
    s.strain = 'green';
    return { ok: true, gain };
  }

  /**
   * Deterministic pseudo-random generator (mulberry32).
   * Used by the bud renderer so a given strain always produces the same SVG.
   * @param {number} seed any 32-bit-ish integer
   * @returns {() => number} function returning floats in [0, 1)
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

  /**
   * Fresh game state.
   * @returns {object} a brand new, unmodified default state
   */
  function defaultState() {
    return {
      points: 0,
      money: 0,
      strain: 'green',
      stock: { main: 0, premium: 0, strains: ['green'] },
      prices: { main: 10, premium: 50 },
      levels: { ...DEFAULT_LEVELS },
      xp: 0,
      genomes: 0,
      milestones: [],
      totalEarned: 0
    };
  }

  /** @returns {object|undefined} strain definition, or undefined if unknown */
  function getStrain(id) {
    return STRAINS.find((x) => x.id === id);
  }

  /**
   * Buds gained per click.
   *   base  = harvest + expert*5
   *   turbo : x2 clicks
   *   mega  : x2 everything
   * then scaled by the production multiplier (level / strains / genomes / milestones).
   * @param {object} s state
   */
  function perClick(s) {
    let pc = s.levels.harvest + s.levels.expert * 5;
    if (s.levels.turbo > 0) pc *= 2;
    if (s.levels.mega > 0) pc *= 2;
    return Math.round(pc * productionMult(s));
  }

  /**
   * Buds gained per second (auto production), scaled by the production
   * multiplier.
   * @param {object} s state
   */
  function perSecond(s) {
    return Math.round((s.levels.auto + s.levels.crew * 10) * productionMult(s));
  }

  /**
   * Current purchase price of an upgrade: base cost doubles per owned level.
   * @param {object} s state
   * @param {string} id upgrade id
   */
  function upgradeCost(s, id) {
    return Math.floor(BASE_COST[id] * Math.pow(2, s.levels[id]));
  }

  /**
   * Try to buy an upgrade. Mutates state on success only.
   * @returns {{ok:boolean, reason?:string, cost?:number, name?:string}}
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
   * Sell stock and return the cash gained (does NOT add it to `s.money`;
   * the caller decides). Selling 'main' or 'premium' empties that stock;
   * 'all' empties both.
   * @param {object} s state
   * @param {'main'|'premium'|'all'} type which stock to sell
   * @returns {number} cash gained
   */
  function sellStock(s, type) {
    let gain = 0;
    if (type === 'main' || type === 'all') {
      gain += s.stock.main * s.prices.main;
      s.stock.main = 0;
    }
    if (type === 'premium' || type === 'all') {
      gain += s.stock.premium * s.prices.premium;
      s.stock.premium = 0;
    }
    return gain;
  }

  /**
   * Equip a strain; buys it first if not owned. Buying is gated by the player
   * level (`st.unlock`) and the cash price.
   * @param {object} s state
   * @param {string} id strain id
   * @returns {{ok:boolean, reason?:string, justUnlocked?:boolean, name?:string}}
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
   * @param {object} s state
   * @returns {string} JSON
   */
  function serialize(s) {
    return JSON.stringify(s);
  }

  /**
   * Load + sanitize state from a localStorage string.
   * Never throws: a corrupted or missing payload falls back to a default
   * state merged over whatever was parseable.
   * @param {string|null|undefined} raw
   * @returns {object} a valid state
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
    // Sanitize: levels/stock must have valid shape.
    d.levels = { ...DEFAULT_LEVELS, ...(d.levels || {}) };
    if (!d.stock || typeof d.stock !== 'object') d.stock = { main: 0, premium: 0, strains: ['green'] };
    if (!Array.isArray(d.stock.strains)) d.stock.strains = ['green'];
    if (!getStrain(d.strain)) d.strain = 'green';
    d.xp = typeof d.xp === 'number' && d.xp >= 0 ? d.xp : 0;
    d.genomes = typeof d.genomes === 'number' && d.genomes >= 0 ? d.genomes : 0;
    d.totalEarned = typeof d.totalEarned === 'number' && d.totalEarned >= 0 ? d.totalEarned : 0;
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
    PREMIUM_DROP_CHANCE,
    PREMIUM_DROP_COST,
    XP_BASE,
    PRESTIGE_BASE,
    MILESTONES,
    mulberry32,
    defaultState,
    getStrain,
    xpForLevel,
    levelFromXp,
    xpProgress,
    productionMult,
    earnXp,
    checkMilestones,
    prestigeGain,
    canPrestige,
    prestige,
    perClick,
    perSecond,
    upgradeCost,
    buyUpgrade,
    sellStock,
    equipStrain,
    serialize,
    deserialize
  };
});