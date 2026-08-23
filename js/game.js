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
 *     stock:  {
 *       weed, hash, resin,               // totals (for display/cap)
 *       weedByStrain: { [id]: number },  // per-variety stock
 *       hashByStrain: { [id]: number },
 *       resinByStrain: { [id]: number },
 *       strains: string[]
 *     },
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

  /** Upgrades catalog: id, display name, icon, description, base cost.
   *  Costs are tuned so early purchases take ~1-2 min of play to pay back. */
  const UPGRADES = [
    { id: 'harvest', name: 'Ciseaux Pro',    icon: '✂️',   desc: '+1g de weed par clic',      cost: 150 },
    { id: 'auto',    name: 'Système Auto',   icon: '🤖',   desc: '+1g de weed par seconde',   cost: 750 },
    { id: 'thumb',   name: 'Doigts Agiles',  icon: '🫰',   desc: '+8% de ta prod./s s\'ajoute à chaque clic', cost: 1200 },
    { id: 'expert',  name: 'Taille Expert',  icon: '🧑‍🌾', desc: '+5g de weed par clic',      cost: 4000 },
    { id: 'crew',    name: 'Équipe de Serre',icon: '👥',   desc: '+15g de weed par seconde',  cost: 25000 },
    { id: 'turbo',   name: 'Éclairage Turbo',icon: '⚡',   desc: 'x2 production de weed',     cost: 90000 },
    { id: 'mega',    name: 'Laboratoire+',   icon: '🌟',   desc: 'x2 production globale',     cost: 750000 },
    // Storage upgrades grow much faster (growth: 3.2) than production ones:
    // income ≈ cap × €/g, so storage is THE money sink pacing the endgame.
    { id: 'sbox',    name: 'Boîte Étanche',  icon: '📦',   desc: '+600g capacité weed max',   cost: 8000, growth: 4.2 },
    { id: 'coldroom',name: 'Chambre Froide', icon: '❄️',   desc: '+3000g capacité weed max',  cost: 500000, growth: 4.2 }
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
    { id: 'purple', name: 'Purple Haze', icon: '🟣', cost: 4000, unlock: 4,  yieldMult: 1.5, priceMult: 1.4, desc: 'Notes violettes et sucrées, haut rendement',
      d: ['#4a2f6e', '#241243'], m: ['#6a3fa0', '#341a58'], l: ['#a06fd0', '#5c2f8a'], f: ['#cfa8ee', '#8a55c0'],
      vein: '#1c0f38', stroke: '#150a2c', pistil: '#ffab2e', pistil2: '#ffc46e', frost: 1.25 },
    { id: 'blue',   name: 'Blue Frost',  icon: '💠', cost: 40000, unlock: 8,  yieldMult: 2.2, priceMult: 2.0, desc: 'Givrée bleutée, très cristalline et puissante',
      d: ['#1f4a5a', '#0d2630'], m: ['#2e6f8f', '#163b4d'], l: ['#5fa8cf', '#2f6d8f'], f: ['#a8d8ee', '#5f9fcf'],
      vein: '#0c2230', stroke: '#081a24', pistil: '#ffffff', pistil2: '#d8f0ff', frost: 1.7 },
    { id: 'pink',   name: 'Pink Kush',   icon: '🌸', cost: 250000, unlock: 13, yieldMult: 3.5, priceMult: 3.0, desc: 'Pistils rosés denses, valeur exceptionnelle',
      d: ['#6e2f4a', '#3a1730'], m: ['#8f3f6a', '#4a1f3a'], l: ['#d06fa8', '#8a3f66'], f: ['#eea8cf', '#b06f98'],
      vein: '#351028', stroke: '#280c1e', pistil: '#ff6f9d', pistil2: '#ffb3cc', frost: 1.4 },
    { id: 'lemon',  name: 'Lemon Haze',  icon: '🍋', cost: 1200000, unlock: 19, yieldMult: 5.2, priceMult: 4.5, desc: 'Arômes acidulés toniques, production fulgurante',
      d: ['#6d6d2c', '#3b3b13'], m: ['#8f8f3c', '#52521f'], l: ['#d1d172', '#7a7a2e'], f: ['#eaeaa2', '#aeae48'],
      vein: '#303012', stroke: '#2a2a0c', pistil: '#ffea00', pistil2: '#ffff55', frost: 1.8 },
    { id: 'northern',name: 'Northern Lights', icon: '🌌', cost: 7000000, unlock: 26, yieldMult: 8.0, priceMult: 7.0, desc: 'Indica légendaire et givrée de trichomes',
      d: ['#2c3f6d', '#131b3b'], m: ['#3c5f8f', '#1f2c52'], l: ['#72a8d1', '#2e4c7a'], f: ['#a2d3ea', '#487fae'],
      vein: '#121730', stroke: '#0c102a', pistil: '#00ffff', pistil2: '#88ffff', frost: 2.1 },
    { id: 'gorilla', name: 'Gorilla Glue', icon: '🦍', cost: 40000000, unlock: 34, yieldMult: 13.0, priceMult: 11.0, desc: 'Résine ultra-collante, puissance maximale',
      d: ['#5a4a2f', '#30260d'], m: ['#8f723e', '#4d3b16'], l: ['#cfa86e', '#7a5f2e'], f: ['#eecda8', '#ae8848'],
      vein: '#30220c', stroke: '#241a08', pistil: '#ffaa00', pistil2: '#ffcc44', frost: 2.5 },
    { id: 'widow',  name: 'White Widow', icon: '🕷️', cost: 200000000, unlock: 45, yieldMult: 22.0, priceMult: 18.0, desc: 'Blanche de trichomes, le sommet absolu',
      d: ['#4a4a4a', '#202020'], m: ['#707070', '#383838'], l: ['#a8a8a8', '#5a5a5a'], f: ['#e0e0e0', '#888888'],
      vein: '#1f1f1f', stroke: '#121212', pistil: '#ffffff', pistil2: '#ffffff', frost: 3.0 }
  ];

  /** Base cost of each upgrade, indexed by id. */
  const BASE_COST = Object.fromEntries(UPGRADES.map((u) => [u.id, u.cost]));

  /** Multiplicative growth of upgrade cost per level (Cookie-Clicker-like). */
  const COST_GROWTH = 1.85;

  /** Default upgrade levels for a brand new game. */
  const DEFAULT_LEVELS = { harvest: 1, auto: 0, expert: 0, thumb: 0, crew: 0, turbo: 0, mega: 0, sbox: 0, coldroom: 0 };

  /**
   * Product catalog — everything sellable at the market.
   * `cost` grams of weed are consumed to craft 1 unit, sold at `price` € (x strain priceMult).
   * Higher tiers give a better €/g ratio but need more weed and a higher level.
   */
  const PRODUCTS = [
    { id: 'joint',   icon: '🚬', name: 'Joint Roulé',        cost: 2,   price: 14,   unlock: 1,  desc: 'Le classique du marché' },
    { id: 'sachet',  icon: '🛍️', name: 'Sachet Scellé',      cost: 6,   price: 46,   unlock: 4,  desc: 'Conditionné sous vide' },
    { id: 'hash',    icon: '📦', name: 'Hash Conditionné',   cost: 12,  price: 115,  unlock: 8,  desc: 'Pressé à la main' },
    { id: 'cake',    icon: '🍰', name: 'Space Cake',         cost: 25,  price: 290,  unlock: 13, desc: 'Recette maison gourmande' },
    { id: 'resin',   icon: '🍯', name: 'Résine Supérieure',  cost: 40,  price: 550,  unlock: 19, desc: 'Extraction soignée' },
    { id: 'huile',   icon: '💧', name: 'Huile Verte',        cost: 80,  price: 1200, unlock: 26, desc: 'Distillat concentré' },
    { id: 'shatter', icon: '💎', name: 'Shatter Pur',        cost: 150, price: 2600, unlock: 34, desc: 'Translucide et puissant' },
    { id: 'rosin',   icon: '🌟', name: 'Live Rosin',         cost: 300, price: 5800, unlock: 45, desc: 'Le nec plus ultra des extraits' }
  ];

  /**
   * Automation catalog — Adventure-Capitalist-style one-time purchases ("managers").
   *
   * One hire per market product unlocks its full chain at once:
   * an Ouvrier auto-crafts weed into the product (up to 1 unit/s)
   * AND a Dealer sells ONLY the units produced by that chain.
   *
   * Deliberate limits keeping the game interactive:
   *   - throughput is hard-capped at 1 unit/s per product,
   *   - manual stock is NEVER touched by dealers (big hand-made sales stay yours),
   *   - sustaining an expensive chain needs huge weed income (rosin = 300g/s).
   *
   * Costs scale with product value (~200× the old craft+sell pair was merged
   * here): cost ≈ 400× unit price, unlocked 5 levels after the product itself.
   */
  const AUTOMATION = PRODUCTS.map((p) => ({
    id: 'auto-' + p.id,
    productId: p.id,
    kind: 'both',
    icon: '⚙️',
    name: 'Chaîne ' + p.name,
    desc: 'Fabrique et vend 1u/s maximum — ton stock manuel reste intact',
    cost: Math.round(p.price * 500),
    unlock: p.unlock + 5
  }));

  /* ---- progression curve (Slower, deeper & more rewarding) ---------------- */
  const XP_BASE = 150;
  const XP_GROWTH = 1.32;

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
      cap += (s.levels.sbox || 0) * 600;
      cap += (s.levels.coldroom || 0) * 3000;
    }
    return cap;
  }

  /**
   * Fresh game state.
   * @returns {object} a brand new, unmodified default state
   */
  function defaultState() {
    const stock = { weed: 0, weedByStrain: {}, strains: ['green'] };
    for (const p of PRODUCTS) {
      stock[p.id] = 0;
      stock[p.id + 'ByStrain'] = {};
    }
    return {
      weed: 0,
      money: 0,
      strain: 'green',
      stock,
      prices: { weed: 6 },
      levels: { ...DEFAULT_LEVELS },
      auto: { craft: {}, sell: {} },
      xp: 0,
      milestones: [],
      totalEarned: 0
    };
  }

  /** @returns {object|undefined} strain definition, or undefined if unknown */
  function getStrain(id) {
    return STRAINS.find((x) => x.id === id);
  }

  /** @returns {object|undefined} product definition, or undefined if unknown */
  function getProduct(id) {
    return PRODUCTS.find((x) => x.id === id);
  }

  /* ---- market pulse (strategic sell timing) ------------------------------- */
  /**
   * Commodity prices oscillate ±30% around their base on a ~2 min cycle, with
   * a stable per-market phase offset. Players watch trends (↗/↘) and time
   * their bulk sales for peaks — pure strategy layer, zero state needed
   * (deterministic in `now`, so saves and tests stay reproducible).
   */
  const MARKET = { swing: 0.3, periodMs: 120000 };

  /** Stable pseudo-random phase in [0, 2π) derived from the market id. */
  function _phase(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
    return (h / 997) * Math.PI * 2;
  }

  /**
   * Market multiplier for one commodity at time `now` (ms), in [1-swing, 1+swing].
   * `MARKET.periodMs` is the exact cycle duration (2π argument scaling).
   * @param {string} marketId 'weed' or a product id
   * @param {number} now epoch ms
   * @returns {number} multiplier ~1 ± 0.3
   */
  function pulse(marketId, now) {
    return 1 + MARKET.swing * Math.sin(now * (2 * Math.PI / MARKET.periodMs) + _phase(marketId));
  }

  /**
   * Whether a market is currently rising or falling.
   * @returns {1|-1|0} 1 rising, -1 falling, 0 flat (at a peak/trough)
   */
  function trend(marketId, now) {
    const d = Math.cos(now * (2 * Math.PI / MARKET.periodMs) + _phase(marketId));
    return d > 0.001 ? 1 : d < -0.001 ? -1 : 0;
  }

  /**
   * Current sale price of weed or a product: base × strain priceMult × market pulse.
   * @param {object} s state
   * @param {string} kind 'weed' or a product id
   * @param {number} [now] epoch ms (default Date.now())
   * @returns {number} unit price in €
   */
  function priceOf(s, kind, now) {
    const t = now === undefined ? Date.now() : now;
    const st = getStrain(s.strain);
    const pm = st ? st.priceMult : 1.0;
    if (kind === 'weed') return Math.round(s.prices.weed * pm * pulse('weed', t));
    const p = getProduct(kind);
    if (!p) return 0;
    return Math.round(p.price * pm * pulse(kind, t));
  }

  /** @returns {number} sale price of one unit of `prod` (strain mult + market pulse) */
  function productUnitPrice(s, prod, now) {
    return priceOf(s, prod.id, now);
  }

  /**
   * Weed gained per click (grams).
   *
   * Cookie-Clicker-style relevance: beyond the flat harvest, every level of
   * `thumb` (Doigts Agiles) adds a share of your per-second production to each
   * click — clicking stays worthwhile because it scales with your economy.
   */
  function perClick(s) {
    let pc = s.levels.harvest + s.levels.expert * 5;
    if (s.levels.turbo > 0) pc *= 2;
    if (s.levels.mega > 0) pc *= 2;
    let total = pc * productionMult(s);
    total += perSecond(s) * (s.levels.thumb || 0) * 0.08; // +8%/lvl of auto prod
    return Math.round(total);
  }

  /**
   * Weed gained per second (auto production), scaled by production multiplier.
   */
  function perSecond(s) {
    return Math.round((s.levels.auto + s.levels.crew * 15) * productionMult(s));
  }

  /**
   * Current purchase price of an upgrade: base cost × COST_GROWTH per level.
   * Growth is gentler than the old x2.1 doubling — no more dead-end walls.
   */
  function upgradeCost(s, id) {
    const u = UPGRADES.find((x) => x.id === id);
    const growth = (u && u.growth) || COST_GROWTH;
    return Math.floor(BASE_COST[id] * Math.pow(growth, s.levels[id] - (id === 'harvest' ? 1 : 0)));
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

  /** @returns {boolean} true if the given automation hire is owned */
  function hasAuto(s, kind, productId) {
    return !!(s.auto && s.auto[kind] && s.auto[kind][productId]);
  }

  /**
   * Buy a one-time automation hire. Mutates state on success only.
   * A single purchase enables BOTH auto-craft and auto-sell for the product
   * (flags stored per kind so partial legacy states keep working).
   * @param {object} s state
   * @param {string} id automation id from AUTOMATION (e.g. 'auto-joint')
   * @returns {{ok:boolean, reason?:'level'|'funds'|'unknown'|'owned', name?:string}}
   */
  function buyAutomation(s, id) {
    const a = AUTOMATION.find((x) => x.id === id);
    if (!a) return { ok: false, reason: 'unknown' };
    if (levelFromXp(s.xp) < a.unlock) return { ok: false, reason: 'level' };
    if (!s.auto || typeof s.auto !== 'object') s.auto = { craft: {}, sell: {} };
    if (!s.auto[a.kind] || typeof s.auto[a.kind] !== 'object') s.auto[a.kind] = {};
    if (s.auto.craft[a.productId] && s.auto.sell[a.productId]) return { ok: false, reason: 'owned' };
    if (s.money < a.cost) return { ok: false, reason: 'funds' };
    s.money -= a.cost;
    s.auto.craft[a.productId] = true;
    s.auto.sell[a.productId] = true;
    return { ok: true, name: a.name };
  }

  /**
   * Automation tick — runs every second after weed production.
   *
   * Order matters and is deliberate:
   *   1. Auto-craft owned chains, most expensive product first: when weed is
   *      scarce the highest €/g conversion wins. Throughput is hard-capped at
   *      1 unit/s per product.
   *   2. Dealers sell EXACTLY the units their chain just crafted — never the
   *      player's manual stock. A chain is therefore a capped idle trickle
   *      (1u/s × product price), while hand-made bulk sales stay interactive.
   *
   * No XP is granted: consistent with manual crafting/selling which only move €.
   * @param {object} s state (mutated)
   * @param {number} [now] epoch ms for the market pulse (default Date.now())
   * @returns {{crafted:Object<string,number>, soldMoney:Object<string,number>}} per-product units crafted and cash earned this tick
   */
  function autoTick(s, now) {
    const res = { crafted: {}, soldMoney: {} };
    for (const p of [...PRODUCTS].reverse()) {
      if (!hasAuto(s, 'craft', p.id)) continue;
      const r = craftProduct(s, p.id, 1);
      if (r.ok) res.crafted[p.id] = r.amount;
    }
    for (const p of PRODUCTS) {
      const made = res.crafted[p.id] || 0;
      if (!hasAuto(s, 'sell', p.id) || made <= 0) continue;
      const gain = sellStock(s, p.id, made, now);
      if (gain > 0) res.soldMoney[p.id] = gain;
    }
    return res;
  }

  /**
   * Transform raw weed into a market product (uses total stock).
   * Keeps per-strain maps in sync for the currently equipped strain.
   * @param {object} s state
   * @param {string} productId product id from PRODUCTS
   * @param {number} qty how many units to craft (default 1, Infinity = as many as possible)
   * @returns {{ok:boolean, reason?:string, amount?:number}}
   */
  function craftProduct(s, productId, qty) {
    const prod = getProduct(productId);
    if (!prod) return { ok: false, reason: 'unknown' };
    const maxAffordable = Math.floor((s.stock.weed || 0) / prod.cost);
    const wanted = qty === Infinity ? maxAffordable : Math.max(1, Math.floor(Number(qty) || 1));
    const made = Math.min(wanted, maxAffordable);
    if (made <= 0) return { ok: false, reason: 'weed', needed: prod.cost };
    s.stock.weed -= made * prod.cost;
    s.stock[productId] = (s.stock[productId] || 0) + made;
    // drain the weed just consumed from per-strain maps (equipped strain first)
    const sid = s.strain;
    if (!s.stock.weedByStrain) s.stock.weedByStrain = {};
    let left = made * prod.cost;
    const order = [sid].concat(s.stock.strains.filter((x) => x !== sid));
    for (const key of order) {
      if (left <= 0) break;
      const have = s.stock.weedByStrain[key] || 0;
      if (have <= 0) continue;
      const take = Math.min(have, left);
      s.stock.weedByStrain[key] = have - take;
      left -= take;
    }
    const mapKey = productId + 'ByStrain';
    if (!s.stock[mapKey]) s.stock[mapKey] = {};
    s.stock[mapKey][sid] = (s.stock[mapKey][sid] || 0) + made;
    return { ok: true, amount: made };
  }

  /** Drain `n` units from a per-strain map (equipped strain first). */
  function drainByStrain(s, mapKey, n) {
    if (!n || !s.stock[mapKey]) return;
    const sid = s.strain;
    let left = n;
    const order = [sid].concat(s.stock.strains.filter((x) => x !== sid));
    for (const key of order) {
      if (left <= 0) break;
      const have = s.stock[mapKey][key] || 0;
      if (have <= 0) continue;
      const take = Math.min(have, left);
      s.stock[mapKey][key] = have - take;
      left -= take;
    }
  }

  /**
   * Sell stock and return the cash gained (€).
   * Prices scale with strain priceMult.
   * @param {object} s state
   * @param {'weed'|string|'all'} type 'weed', a product id from PRODUCTS, or 'all'
   * @param {number} [amount] units/grams to sell (default: all of that type)
   * @param {number} [now] epoch ms for the market pulse (default Date.now())
   * @returns {number} cash gained
   */
  function sellStock(s, type, amount, now) {
    if (type === 'all') {
      let total = sellStock(s, 'weed', undefined, now);
      for (const p of PRODUCTS) total += sellStock(s, p.id, undefined, now);
      return total;
    }
    let gain = 0;
    if (type === 'weed') {
      const unit = priceOf(s, 'weed', now);
      const toSell = amount === undefined ? (s.stock.weed || 0)
        : Math.min(s.stock.weed || 0, Math.max(1, Math.floor(amount)));
      gain = toSell * unit;
      s.stock.weed = (s.stock.weed || 0) - toSell;
      drainByStrain(s, 'weedByStrain', toSell);
    } else {
      const prod = getProduct(type);
      if (prod) {
        const unit = priceOf(s, type, now);
        const have = s.stock[type] || 0;
        const toSell = amount === undefined ? have : Math.min(have, Math.max(1, Math.floor(amount)));
        gain = toSell * unit;
        s.stock[type] = have - toSell;
        drainByStrain(s, type + 'ByStrain', toSell);
      }
    }
    s.money += gain;
    s.totalEarned = (s.totalEarned || 0) + gain;
    return gain;
  }

  /**
   * Sell stock as a specific strain (applies that strain's priceMult).
   * Uses per-strain stock; for old saves with empty per-strain maps, falls back to generic total once.
   * @param {object} s state
   * @param {'weed'|'hash'|'resin'} type
   * @param {string} strainId
   * @param {number} amount grams/units to sell (default 1, or Infinity for all)
   * @returns {number} cash gained (0 if nothing to sell)
   */
  function sellByStrain(s, type, strainId, amount) {
    const st = getStrain(strainId);
    if (!st || !s.stock.strains.includes(strainId)) return 0;
    const pMult = st.priceMult;
    const unitPrice = Math.round(s.prices[type] * pMult);
    const mapKey = type + 'ByStrain';
    const perStrain = s.stock[mapKey] || {};
    const strainStock = perStrain[strainId] || 0;
    const isOldSave = perStrain && Object.keys(perStrain).length === 0 && (s.stock[type] || 0) > 0;
    const effectiveStock = (strainStock > 0 || !isOldSave) ? strainStock : (s.stock[type] || 0);
    const toSell = amount === Infinity ? effectiveStock : Math.min(effectiveStock, amount || 1);
    if (toSell <= 0) return 0;
    // deduct from per-strain and total
    if (!s.stock[mapKey]) s.stock[mapKey] = {};
    s.stock[mapKey][strainId] = Math.max(0, (perStrain[strainId] || 0) - toSell);
    s.stock[type] = Math.max(0, (s.stock[type] || 0) - toSell);
    const gain = toSell * unitPrice;
    s.money += gain;
    s.totalEarned = (s.totalEarned || 0) + gain;
    return gain;
  }

  /** Add weed to stock (total + per-strain), respecting maxWeedStorage cap. Returns actual added. */
  function addWeed(s, amount) {
    const cap = maxWeedStorage(s);
    const canAdd = Math.max(0, cap - (s.stock.weed || 0));
    const toAdd = Math.min(amount, canAdd);
    if (toAdd <= 0) return 0;
    s.weed = (s.weed || 0) + toAdd;
    s.stock.weed = (s.stock.weed || 0) + toAdd;
    const sid = s.strain;
    if (!s.stock.weedByStrain) s.stock.weedByStrain = {};
    s.stock.weedByStrain[sid] = (s.stock.weedByStrain[sid] || 0) + toAdd;
    return toAdd;
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
     if (!d.stock || typeof d.stock !== 'object') d.stock = defaultState().stock;
     d.stock.weed = typeof d.stock.weed === 'number' && d.stock.weed >= 0 ? d.stock.weed : 0;
     // per-product stock + per-strain maps (init/migrate)
     for (const p of PRODUCTS) {
       d.stock[p.id] = typeof d.stock[p.id] === 'number' && d.stock[p.id] >= 0 ? d.stock[p.id] : 0;
       const mk = p.id + 'ByStrain';
       if (!d.stock[mk] || typeof d.stock[mk] !== 'object') {
         d.stock[mk] = {};
         if ((d.stock[p.id] || 0) > 0) d.stock[mk][d.strain] = (d.stock[mk][d.strain] || 0) + d.stock[p.id];
       }
     }
     // per-strain weed stock — init if missing, migrate generic stock for old saves
     if (!d.stock.weedByStrain || typeof d.stock.weedByStrain !== 'object') d.stock.weedByStrain = {};
     if (d.stock.weed > 0 && Object.keys(d.stock.weedByStrain).length === 0) d.stock.weedByStrain[d.strain] = (d.stock.weedByStrain[d.strain] || 0) + d.stock.weed;
     if (!Array.isArray(d.stock.strains)) d.stock.strains = ['green'];
     if (!getStrain(d.strain)) d.strain = 'green';
     d.weed = typeof d.weed === 'number' && d.weed >= 0 ? d.weed : 0;
     d.xp = typeof d.xp === 'number' && d.xp >= 0 ? d.xp : 0;
     d.totalEarned = typeof d.totalEarned === 'number' && d.totalEarned >= 0 ? d.totalEarned : 0;
     if (!d.prices || typeof d.prices !== 'object') d.prices = { weed: 6 };
     else if (typeof d.prices.weed !== 'number') d.prices.weed = 6;
     // drop legacy fields
     delete d.points; delete d.genomes;
     delete d.stock.main; delete d.stock.premium; delete d.stock.moonrock;
     d.milestones = Array.isArray(d.milestones)
       ? d.milestones.filter((m) => MILESTONES.some((mi) => mi.id === m))
       : [];
     // automation hires — keep known flags only, drop anything else
     if (!d.auto || typeof d.auto !== 'object') d.auto = { craft: {}, sell: {} };
     for (const kind of ['craft', 'sell']) {
       const src = d.auto[kind];
       const clean = {};
       if (src && typeof src === 'object') {
         for (const p of PRODUCTS) {
           if (src[p.id] === true) clean[p.id] = true;
         }
       }
       d.auto[kind] = clean;
     }
    return d;
  }

  return {
    UPGRADES,
    STRAINS,
    PRODUCTS,
    AUTOMATION,
    BASE_COST,
    COST_GROWTH,
    DEFAULT_LEVELS,
    MARKET,
    XP_BASE,
    XP_GROWTH,
    MILESTONES,
    mulberry32,
    maxWeedStorage,
    addWeed,
    defaultState,
    getStrain,
    getProduct,
    productUnitPrice,
    pulse,
    trend,
    priceOf,
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
    hasAuto,
    buyAutomation,
    autoTick,
    craftProduct,
    sellStock,
    sellByStrain,
    equipStrain,
    serialize,
    deserialize
  };
});
