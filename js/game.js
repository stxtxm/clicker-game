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
 *     prices: { weed },
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
   *  Costs are tuned so early purchases take ~1-2 min of play to pay back.
   *  B1 rebalance (growth 1.35): cheaper early hook, more frequent purchases.
   *  Progression lissée : 4 nouveaux paliers intermédiaires pour rallonger. */
  const UPGRADES = [
    { id: 'harvest', name: 'Ciseaux Pro',    icon: '✂️',   desc: '+1g de weed par clic',      cost: 120 },
    { id: 'auto',    name: 'Système Auto',   icon: '🤖',   desc: '+1g de weed par seconde',   cost: 550 },
    { id: 'thumb',   name: 'Doigts Agiles',  icon: '🫰',   desc: '+8% de ta prod./s s\'ajoute à chaque clic', cost: 1200 },
    { id: 'expert',  name: 'Taille Expert',  icon: '🧑‍🌾', desc: '+5g de weed par clic',      cost: 4000 },
    { id: 'mist',    name: 'Brume Foliaire', icon: '💧',   desc: '+2g de weed par seconde',   cost: 12000, growth: 1.35 },
    { id: 'trim',    name: 'Trimmer Pro',    icon: '🔧',   desc: '+5g de weed par clic',      cost: 25000, growth: 1.35 },
    { id: 'crew',    name: 'Équipe de Serre',icon: '👥',   desc: '+15g de weed par seconde',  cost: 25000 },
    { id: 'co2',     name: 'Injecteur CO₂',  icon: '🫧',   desc: '+15g de weed par seconde',  cost: 180000, growth: 1.35 },
    { id: 'turbo',   name: 'Éclairage Turbo',icon: '⚡',   desc: 'x2 production de weed',     cost: 90000 },
    { id: 'uv',      name: 'Chambre UV',     icon: '🔮',   desc: 'x1.4 production globale',   cost: 500000, growth: 1.35 },
    { id: 'mega',    name: 'Laboratoire+',   icon: '🌟',   desc: 'x2 production globale',     cost: 750000 },
    // Distribution upgrades: PAS de cap de stock — ces paliers élargissent la
    // part du flux que les chaînes convertissent (le vrai gate late-game).
    { id: 'dist1',   name: 'Réseau Local',   icon: '📦',   desc: '+3% de flux converti par les chaînes',  cost: 4000, growth: 1.9 },
    { id: 'dist2',   name: 'Logistique Régionale', icon: '🚚', desc: '+6% de flux converti par les chaînes', cost: 240000, growth: 1.9 },
    { id: 'dist3',   name: 'Entrepôts Nationaux', icon: '🏭', desc: '+10% de flux converti par les chaînes', cost: 2000000, growth: 1.9 }
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
      vein: '#1f1f1f', stroke: '#121212', pistil: '#ffffff', pistil2: '#ffffff', frost: 3.0 },
    { id: 'zkittlez', name: 'Zkittlez', icon: '🍬', cost: 800000000, unlock: 52, yieldMult: 20.0, priceMult: 18.0, desc: 'Arc-en-ciel sucré, explosion fruitée',
      d: ['#6e2f6e', '#3a153a'], m: ['#8f3f8f', '#4a1f4a'], l: ['#d06fd0', '#8a3f8a'], f: ['#eea8ee', '#c080c0'],
      vein: '#2a0f2a', stroke: '#1c0a1c', pistil: '#ffd700', pistil2: '#ffea00', frost: 3.2 },
    { id: 'gelato', name: 'Gelato 33', icon: '🍦', cost: 2000000000, unlock: 62, yieldMult: 24.0, priceMult: 21.0, desc: 'Crémeuse et glaciale, le graal moderne',
      d: ['#4a6e2f', '#1f2f15'], m: ['#6e8f3f', '#2f4a1f'], l: ['#a8d070', '#5a8f3f'], f: ['#d8e8a8', '#a0c070'],
      vein: '#1a2f10', stroke: '#0f1a08', pistil: '#ff69b4', pistil2: '#ffb6c1', frost: 3.5 }
  ];

  /** Base cost of each upgrade, indexed by id. */
  const BASE_COST = Object.fromEntries(UPGRADES.map((u) => [u.id, u.cost]));

  /** Multiplicative growth of upgrade cost per level (Cookie-Clicker-like).
   *  B1 rebalance: 1.35 (was 1.85) — more frequent purchases, less wall. */
  const COST_GROWTH = 1.35;

  /** Growth for distribution upgrades (was storage, same sink role). */
  const STORAGE_GROWTH = 1.9;

  /** Default upgrade levels for a brand new game. */
  const DEFAULT_LEVELS = { harvest: 1, auto: 0, expert: 0, thumb: 0, crew: 0, turbo: 0, mega: 0, dist1: 0, dist2: 0, mist: 0, trim: 0, co2: 0, uv: 0, dist3: 0 };

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
    { id: 'rosin',   icon: '🌟', name: 'Live Rosin',         cost: 300, price: 5800, unlock: 45, desc: 'Le nec plus ultra des extraits' },
    { id: 'vape',    icon: '🔋', name: 'Vape Cart',          cost: 600, price: 12500, unlock: 52, desc: 'Distillat en cartouche' },
    { id: 'diamonds',icon: '💠', name: 'THC Diamonds',       cost: 1200,price: 26000, unlock: 60, desc: 'Cristaux purs à 99%' },
    { id: 'moonrock',icon: '🌙', name: 'Moonrock',           cost: 2500,price: 55000, unlock: 68, desc: 'Fleur trempée dans l\'huile et le kief' },
    { id: 'soda',    icon: '🥤', name: 'Soda THC',           cost: 5000,price: 115000,unlock: 75, desc: 'Boisson pétillante infusée' }
  ];

  /**
   * Automation catalog — managers AdvCap MULTI-NIVEAUX.
   *
   * Chaque chaîne (une par produit) se débloque puis s'améliore :
   *   - Niveau 1 (embauche) : ouvre la chaîne, convertit CHAIN_FLOW_SHARE du flux ;
   *   - Chaque niveau suivant : +CHAIN_FLOW_SHARE de part (argent idle ↑ linéairement),
   *     plafonnée par chaîne à CHAIN_SHARE_MAX ;
   *   - Le Dealer vend uniquement la production fraîche de SA chaîne.
   *
   * Coût du niveau L = base × AUTOMATION_GROWTH^(L-1), base ≈ 400× prix unitaire,
   * débloquée 4 niveaux après le produit.
   */
  const AUTOMATION = PRODUCTS.map((p) => ({
    id: 'auto-' + p.id,
    productId: p.id,
    kind: 'both',
    icon: '⚙️',
    name: 'Chaîne ' + p.name,
    desc: 'Fabrique et vend auto. au prix du marché — chaque niveau convertit plus de flux',
    cost: Math.round(p.price * 400),
    growth: 1.5,
    unlock: p.unlock + 4
  }));

  /** Croissance du coût par niveau de chaîne. */
  const AUTOMATION_GROWTH = 1.5;
  /** Part max convertible par UNE chaîne (clamp anti-tout-manger). */
  const CHAIN_SHARE_MAX = 0.6;

  /** Chain specialization trees — each product gets its own branching upgrades.
   *  `per` = effet par point (donnée pilotante, pas de parsing de desc). */
  const CHAIN_SPECS = {
    joint: {
      speed:  { name: 'Cadence',       max: 10, per: 0.05,  desc: 'Flux converti +5%/pt',   baseCost: 5000,        growth: 1.6 },
      yield:  { name: 'Rendement',     max: 10, per: 0.04,  desc: 'Prix de vente +4%/pt',   baseCost: 8000,        growth: 1.65 },
      volume: { name: 'Volume',        max: 8,  per: 0.15,  desc: 'Max g/tick +15%/pt',     baseCost: 12000,       growth: 1.7 },
    },
    sachet: {
      speed:  { name: 'Cadence',       max: 10, per: 0.05,  desc: 'Flux converti +5%/pt',   baseCost: 20000,       growth: 1.6 },
      yield:  { name: 'Qualité',       max: 10, per: 0.05,  desc: 'Prix de vente +5%/pt',   baseCost: 30000,       growth: 1.65 },
      volume: { name: 'Conditionnement',max: 8, per: 0.15,  desc: 'Max g/tick +15%/pt',     baseCost: 45000,       growth: 1.7 },
    },
    hash: {
      speed:  { name: 'Pression',      max: 10, per: 0.04,  desc: 'Flux converti +4%/pt',   baseCost: 60000,       growth: 1.6 },
      yield:  { name: 'Pureté',        max: 10, per: 0.06,  desc: 'Prix de vente +6%/pt',   baseCost: 90000,       growth: 1.65 },
      volume: { name: 'Blocs',         max: 8,  per: 0.12,  desc: 'Max g/tick +12%/pt',     baseCost: 130000,      growth: 1.7 },
    },
    cake: {
      speed:  { name: 'Four',          max: 10, per: 0.04,  desc: 'Flux converti +4%/pt',   baseCost: 200000,      growth: 1.6 },
      yield:  { name: 'Recette',       max: 10, per: 0.07,  desc: 'Prix de vente +7%/pt',   baseCost: 300000,      growth: 1.65 },
      volume: { name: 'Parts',         max: 8,  per: 0.10,  desc: 'Max g/tick +10%/pt',     baseCost: 450000,      growth: 1.7 },
    },
    resin: {
      speed:  { name: 'Extraction',    max: 10, per: 0.03,  desc: 'Flux converti +3%/pt',   baseCost: 600000,      growth: 1.6 },
      yield:  { name: 'Terpènes',      max: 10, per: 0.08,  desc: 'Prix de vente +8%/pt',   baseCost: 900000,      growth: 1.65 },
      volume: { name: 'Filtration',    max: 8,  per: 0.08,  desc: 'Max g/tick +8%/pt',      baseCost: 1300000,     growth: 1.7 },
    },
    huile: {
      speed:  { name: 'Distillation',  max: 10, per: 0.03,  desc: 'Flux converti +3%/pt',   baseCost: 2000000,     growth: 1.6 },
      yield:  { name: 'Concentration', max: 10, per: 0.09,  desc: 'Prix de vente +9%/pt',   baseCost: 3000000,     growth: 1.65 },
      volume: { name: 'Cartouches',    max: 8,  per: 0.07,  desc: 'Max g/tick +7%/pt',      baseCost: 4500000,     growth: 1.7 },
    },
    shatter: {
      speed:  { name: 'Purge',         max: 10, per: 0.02,  desc: 'Flux converti +2%/pt',   baseCost: 6000000,     growth: 1.6 },
      yield:  { name: 'Clarté',        max: 10, per: 0.10,  desc: 'Prix de vente +10%/pt',  baseCost: 9000000,     growth: 1.65 },
      volume: { name: 'Cassure',       max: 8,  per: 0.06,  desc: 'Max g/tick +6%/pt',      baseCost: 13000000,    growth: 1.7 },
    },
    rosin: {
      speed:  { name: 'Presse',        max: 10, per: 0.02,  desc: 'Flux converti +2%/pt',   baseCost: 20000000,    growth: 1.6 },
      yield:  { name: 'Live',          max: 10, per: 0.12,  desc: 'Prix de vente +12%/pt',  baseCost: 30000000,    growth: 1.65 },
      volume: { name: 'Rendement',     max: 8,  per: 0.05,  desc: 'Max g/tick +5%/pt',      baseCost: 45000000,    growth: 1.7 },
    },
    vape: {
      speed:  { name: 'Remplissage',   max: 10, per: 0.02,  desc: 'Flux converti +2%/pt',   baseCost: 60000000,    growth: 1.6 },
      yield:  { name: 'Hardware',      max: 10, per: 0.12,  desc: 'Prix de vente +12%/pt',  baseCost: 90000000,    growth: 1.65 },
      volume: { name: 'Batteries',     max: 8,  per: 0.05,  desc: 'Max g/tick +5%/pt',      baseCost: 130000000,   growth: 1.7 },
    },
    diamonds: {
      speed:  { name: 'Cristallisation',max: 10, per: 0.015, desc: 'Flux converti +1.5%/pt', baseCost: 200000000,   growth: 1.6 },
      yield:  { name: 'Pureté 99%',    max: 10, per: 0.15,  desc: 'Prix de vente +15%/pt',  baseCost: 300000000,   growth: 1.65 },
      volume: { name: 'Taille',        max: 8,  per: 0.04,  desc: 'Max g/tick +4%/pt',      baseCost: 450000000,   growth: 1.7 },
    },
    moonrock: {
      speed:  { name: 'Trempage',      max: 10, per: 0.015, desc: 'Flux converti +1.5%/pt', baseCost: 600000000,   growth: 1.6 },
      yield:  { name: 'Infusion',      max: 10, per: 0.15,  desc: 'Prix de vente +15%/pt',  baseCost: 900000000,   growth: 1.65 },
      volume: { name: 'Enrobage',      max: 8,  per: 0.04,  desc: 'Max g/tick +4%/pt',      baseCost: 1300000000,  growth: 1.7 },
    },
    soda: {
      speed:  { name: 'Carbonatation', max: 10, per: 0.01,  desc: 'Flux converti +1%/pt',   baseCost: 2000000000,  growth: 1.6 },
      yield:  { name: 'Dosage',        max: 10, per: 0.18,  desc: 'Prix de vente +18%/pt',  baseCost: 3000000000,  growth: 1.65 },
      volume: { name: 'Canettes',      max: 8,  per: 0.03,  desc: 'Max g/tick +3%/pt',      baseCost: 4500000000,  growth: 1.7 },
    },
  };

  /** Default specialization state for a new game. */
  function defaultChainSpecs() {
    const specs = {};
    for (const pid of Object.keys(CHAIN_SPECS)) {
      specs[pid] = { speed: 0, yield: 0, volume: 0 };
    }
    return specs;
  }

  /** Contracts: exclusive late-game objectives with permanent rewards. */
  const CONTRACTS = [
    {
      id: 'c_joint_king',
      name: 'Roi du Joint',
      desc: 'Produire 10 000 joints via la chaîne',
      icon: '👑',
      productId: 'joint',
      target: 10000,
      type: 'crafted',
      reward: { yieldMult: 1.25, desc: '+25% prix joints (permanent)' },
      unlockLevel: 30,
      exclusive: ['c_sachet_king', 'c_hash_king']
    },
    {
      id: 'c_sachet_king',
      name: 'Empereur du Sachet',
      desc: 'Produire 5 000 sachets via la chaîne',
      icon: '🛍️',
      productId: 'sachet',
      target: 5000,
      type: 'crafted',
      reward: { yieldMult: 1.3, desc: '+30% prix sachets (permanent)' },
      unlockLevel: 35,
      exclusive: ['c_joint_king', 'c_hash_king']
    },
    {
      id: 'c_hash_king',
      name: 'Maître du Hash',
      desc: 'Produire 2 000 hash via la chaîne',
      icon: '📦',
      productId: 'hash',
      target: 2000,
      type: 'crafted',
      reward: { yieldMult: 1.35, desc: '+35% prix hash (permanent)' },
      unlockLevel: 40,
      exclusive: ['c_joint_king', 'c_sachet_king']
    },
    {
      id: 'c_cake_king',
      name: 'Pâtissier Cosmique',
      desc: 'Produire 1 000 space cakes via la chaîne',
      icon: '🍰',
      productId: 'cake',
      target: 1000,
      type: 'crafted',
      reward: { yieldMult: 1.4, desc: '+40% prix cakes (permanent)' },
      unlockLevel: 45,
      exclusive: ['c_resin_king']
    },
    {
      id: 'c_resin_king',
      name: 'Alchimiste Suprême',
      desc: 'Produire 500 résines via la chaîne',
      icon: '🍯',
      productId: 'resin',
      target: 500,
      type: 'crafted',
      reward: { yieldMult: 1.5, desc: '+50% prix résines (permanent)' },
      unlockLevel: 50,
      exclusive: ['c_cake_king']
    },
    {
      id: 'c_rosin_king',
      name: 'Vive la Rosin',
      desc: 'Produire 200 live rosin via la chaîne',
      icon: '🌟',
      productId: 'rosin',
      target: 200,
      type: 'crafted',
      reward: { yieldMult: 1.6, desc: '+60% prix rosin (permanent)' },
      unlockLevel: 55,
      exclusive: ['c_shatter_king']
    },
    {
      id: 'c_shatter_king',
      name: 'Cristal Pur',
      desc: 'Produire 100 shatter via la chaîne',
      icon: '💎',
      productId: 'shatter',
      target: 100,
      type: 'crafted',
      reward: { yieldMult: 1.7, desc: '+70% prix shatter (permanent)' },
      unlockLevel: 60,
      exclusive: ['c_rosin_king']
    },
    {
      id: 'c_vape_king',
      name: 'Vape Lord',
      desc: 'Produire 50 vape carts via la chaîne',
      icon: '🔋',
      productId: 'vape',
      target: 50,
      type: 'crafted',
      reward: { yieldMult: 1.5, desc: '+50% prix vapes (permanent)' },
      unlockLevel: 65,
      exclusive: []
    },
    {
      id: 'c_diamonds_king',
      name: 'Diamants Éternels',
      desc: 'Produire 20 THC diamonds via la chaîne',
      icon: '💠',
      productId: 'diamonds',
      target: 20,
      type: 'crafted',
      reward: { yieldMult: 1.6, desc: '+60% prix diamonds (permanent)' },
      unlockLevel: 70,
      exclusive: []
    },
    {
      id: 'c_money_maker',
      name: 'Money Maker',
      desc: 'Gagner 1 000 000 € via les chaînes (idle)',
      icon: '💸',
      productId: null,
      target: 1000000,
      type: 'chain_money',
      reward: { globalYield: 1.15, desc: '+15% prix TOUS produits chaînes (permanent)' },
      unlockLevel: 40,
      exclusive: ['c_volume_king']
    },
    {
      id: 'c_volume_king',
      name: 'Volume Max',
      desc: 'Convertir 500 000g de weed via les chaînes',
      icon: '📊',
      productId: null,
      target: 500000,
      type: 'chain_grams',
      reward: { flowBoost: 1.2, desc: '+20% flux converti TOUTES chaînes (permanent)' },
      unlockLevel: 45,
      exclusive: ['c_money_maker']
    },
  ];

  /** Default contracts state. */
  function defaultContracts() {
    return { completed: [], offered: [], claimed: [], chainMoneyEarned: 0, chainGramsConverted: 0 };
  }

  /**
   * Paliers de chaîne, façon AdVenture Capitalist : chaque palier franchi
   * multiplie le rendement (prix de vente) de LA chaîne — cumulatif.
   * Boucle motivationnelle : pousser une chaîne vers son prochain palier
   * donne un saut de revenu visible, sans casser la règle « l'idle paie
   * ce qu'il transforme » (le flux reste la ressource gate).
   */
  const CHAIN_MILESTONES = [
    { at: 25,  mult: 2 },
    { at: 50,  mult: 2 },
    { at: 75,  mult: 2 },
    { at: 100, mult: 2 },
    { at: 150, mult: 2 },
    { at: 200, mult: 3 },
    { at: 300, mult: 3 },
    { at: 400, mult: 4 },
    { at: 500, mult: 5 }
  ];

  /** Multiplicateur de rendement cumulé des paliers atteints par UNE chaîne. */
  function chainMilestoneMult(s, productId) {
    const lvl = chainLvl(s, productId);
    let mult = 1;
    for (const m of CHAIN_MILESTONES) {
      if (lvl >= m.at) mult *= m.mult;
    }
    return mult;
  }

  /** Prochain palier d'une chaîne ({at, mult}) ou null si tous franchis. */
  function nextChainMilestone(s, productId) {
    const lvl = chainLvl(s, productId);
    return CHAIN_MILESTONES.find((m) => m.at > lvl) || null;
  }

  /* ---- progression curve (lissée, plus longue) ---------------- */
  const XP_BASE = 150;
  const XP_GROWTH = 1.42;

  /** Milestones: permanent production bonuses granted at lifetime-XP thresholds. */
  const MILESTONES = [
    { id: 'm1', xp: 200,     bonus: 5,  name: 'Premiers bocal',       icon: '🌱' },
    { id: 'm2', xp: 2500,    bonus: 10, name: 'Récolte abondante',    icon: '🌿' },
    { id: 'm3', xp: 30000,   bonus: 15, name: 'Laboratoire de prod',  icon: '🏭' },
    { id: 'm4', xp: 350000,  bonus: 25, name: 'Baron de la résine',   icon: '💎' },
    { id: 'm5', xp: 4000000, bonus: 40, name: 'Légende internationale',icon: '👑' },
    { id: 'm6', xp: 50000000,bonus: 75, name: 'Empereur du Cannabis',icon: '🪐' },
    { id: 'm7', xp: 150000000,bonus: 60, name: 'Cartel Mondial',     icon: '🌍' },
    { id: 'm8', xp: 400000000,bonus: 80, name: 'Nébuleuse Verte',    icon: '🌌' },
    { id: 'm9', xp: 1000000000,bonus: 100, name: 'Légende Éternelle', icon: '♾️' }
  ];

  /** Achievements: permanent bonuses for specific accomplishments. */
  const ACHIEVEMENTS = [
    { id: 'ach_first_sell', name: 'Première Vente', desc: 'Vendre pour la première fois', icon: '💰', bonus: 2, condition: (s) => (s.totalEarned || 0) >= 1 },
    { id: 'ach_first_chain', name: 'Première Chaîne', desc: 'Embaucher votre premier manager', icon: '⚙️', bonus: 3, condition: (s) => Object.values(s.chainLvl || {}).some((l) => l > 0) },
    { id: 'ach_spike_master', name: 'Maître des Ruées', desc: 'Vendre pendant une ruée', icon: '🔥', bonus: 5, condition: (s, ctx) => ctx && ctx.spikeSale },
    { id: 'ach_level_10', name: 'Niveau 10', desc: 'Atteindre le niveau 10', icon: '⭐', bonus: 4, condition: (s) => levelFromXp(s.xp) >= 10 },
    { id: 'ach_level_25', name: 'Niveau 25', desc: 'Atteindre le niveau 25', icon: '🌟', bonus: 6, condition: (s) => levelFromXp(s.xp) >= 25 },
    { id: 'ach_level_50', name: 'Niveau 50', desc: 'Atteindre le niveau 50', icon: '💫', bonus: 8, condition: (s) => levelFromXp(s.xp) >= 50 },
    { id: 'ach_100k', name: 'Centenaire', desc: 'Gagner 100 000 € au total', icon: '💵', bonus: 5, condition: (s) => (s.totalEarned || 0) >= 100000 },
    { id: 'ach_1m', name: 'Millionnaire', desc: 'Gagner 1 000 000 € au total', icon: '💎', bonus: 10, condition: (s) => (s.totalEarned || 0) >= 1000000 },
    { id: 'ach_10m', name: 'Dix Millionnaire', desc: 'Gagner 10 000 000 € au total', icon: '👑', bonus: 15, condition: (s) => (s.totalEarned || 0) >= 10000000 },
    { id: 'ach_all_strains', name: 'Collectionneur', desc: 'Débloquer toutes les variétés', icon: '🌈', bonus: 20, condition: (s) => (s.stock.strains || []).length >= STRAINS.length },
    { id: 'ach_all_products', name: 'Producteur', desc: 'Fabriquer tous les produits au moins une fois', icon: '🏭', bonus: 15, condition: (s) => PRODUCTS.every((p) => (s.stock[p.id] || 0) > 0) },
    { id: 'ach_chain_10', name: 'Chaîne x10', desc: 'Atteindre le niveau 10 sur une chaîne', icon: '⚡', bonus: 10, condition: (s) => Object.values(s.chainLvl || {}).some((l) => l >= 10) },
    { id: 'ach_idle_1h', name: 'Producteur Passif', desc: 'Gagner 10 000 € en idle (1h offline)', icon: '⏰', bonus: 8, condition: (s, ctx) => ctx && ctx.offlineMoney >= 10000 },
    { id: 'ach_click_1k', name: 'Cliqueur', desc: 'Cliquer 1 000 fois', icon: '👆', bonus: 5, condition: (s) => (s.totalClicks || 0) >= 1000 },
    { id: 'ach_click_10k', name: 'Cliqueur Pro', desc: 'Cliquer 10 000 fois', icon: '👆', bonus: 10, condition: (s) => (s.totalClicks || 0) >= 10000 }
  ];

  /** Tier bonus: tous les 40 niveaux → ×2 (espacé pour lisser le late-game). */
  const TIER_EVERY = 40;
  function tierMult(level) {
    const t = Math.floor(Math.max(0, level) / TIER_EVERY);
    return t <= 0 ? 1 : Math.pow(2, t);
  }

  /** Market spike — remplace Golden Bud : ~1 fois/70s, 15s ×1.6 sur un produit aléatoire. */
  const SPIKE_DURATION = 15000;
  const SPIKE_MULT = 1.6;
  const SPIKE_COOLDOWN_MIN = 50000;
  const SPIKE_COOLDOWN_MAX = 90000;
  function isSpikeActive(s, kind, now) {
    const t = now === undefined ? Date.now() : now;
    return !!(s && s.spikeUntil && s.spikeProduct === kind && t < s.spikeUntil);
  }
  function spikeMult(s, kind, now) {
    return isSpikeActive(s, kind, now) ? SPIKE_MULT : 1;
  }
  function maybeTriggerSpike(s, now, rng) {
    const t = now === undefined ? Date.now() : now;
    if (!s) return false;
    if (s.spikeUntil && t < s.spikeUntil) return false;
    if (s.spikeNextAt && t < s.spikeNextAt) return false;
    const chance = 0.014; // ~1.4%/s ≈ 1 per 70s
    const r = rng ? rng() : Math.random();
    if (r < chance) {
      // Ruées UNIQUEMENT sur les marchés débloqués (weed toujours dispo) :
      // pas de spike sur un produit encore verrouillé par le niveau.
      const level = levelFromXp(s.xp);
      const pool = ['weed'].concat(PRODUCTS.filter((p) => level >= p.unlock).map((p) => p.id));
      const pick = pool[Math.floor((rng ? rng() : Math.random()) * pool.length)];
      s.spikeProduct = pick;
      s.spikeUntil = t + SPIKE_DURATION;
      const span = SPIKE_COOLDOWN_MAX - SPIKE_COOLDOWN_MIN;
      s.spikeNextAt = t + SPIKE_DURATION + SPIKE_COOLDOWN_MIN + Math.floor((rng ? rng() : Math.random()) * span);
      return pick;
    }
    if (!s.spikeNextAt) {
      const span = SPIKE_COOLDOWN_MAX - SPIKE_COOLDOWN_MIN;
      s.spikeNextAt = t + SPIKE_COOLDOWN_MIN + Math.floor((rng ? rng() : Math.random()) * span);
    }
    return false;
  }

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
    const achBonus = achievementBonus(s);
    m *= 1 + achBonus / 100;
    return m;
  }

  /**
   * XP granted for a harvest: PAS de cap — tous les grammes produits comptent
   * pleinement. La progression n'est plus punie par le stockage.
   */
  function harvestXp(s, produced) {
    const added = addWeed(s, produced);
    earnXp(s, added);
    return added;
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

  /** Check and award achievements. Returns newly unlocked ones. */
  function checkAchievements(s, ctx) {
    const awarded = [];
    for (const ach of ACHIEVEMENTS) {
      if (!(s.achievements || []).includes(ach.id) && ach.condition(s, ctx || {})) {
        s.achievements = s.achievements || [];
        s.achievements.push(ach.id);
        awarded.push(ach);
      }
    }
    return awarded;
  }

  /** Total achievement bonus as a percentage. */
  function achievementBonus(s) {
    if (!s.achievements || !s.achievements.length) return 0;
    return s.achievements.reduce((sum, id) => {
      const ach = ACHIEVEMENTS.find((a) => a.id === id);
      return sum + (ach ? ach.bonus : 0);
    }, 0);
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

  /**
   * Bonus global de Distribution ajouté à CHAQUE chaîne (dist1/2/3).
   * Chaque chaîne convertit min(CHAIN_SHARE_MAX, CHAIN_FLOW_SHARE × niveau
   * + distShare) du flux produit — le gate late-game est l'automatisation.
   */
  function distShare(s) {
    if (!s || !s.levels) return 0;
    return Math.max(0, s.levels.dist1 || 0) * 0.03
      + Math.max(0, s.levels.dist2 || 0) * 0.06
      + Math.max(0, s.levels.dist3 || 0) * 0.10;
  }

  /** Part effective d'UNE chaîne (clampée à CHAIN_SHARE_MAX). */
  function chainShareOf(s, productId) {
    const baseShare = CHAIN_FLOW_SHARE * chainLvl(s, productId) + distShare(s);
    const speedDef = CHAIN_SPECS[productId] && CHAIN_SPECS[productId].speed;
    const specs = s.chainSpecs && s.chainSpecs[productId] ? s.chainSpecs[productId] : { speed: 0 };
    // Hardware synergy: harvest/expert/trim boost speed spec effectiveness
    const hwSpeedBoost = 1 + (s.levels.harvest || 0) * 0.01 + (s.levels.expert || 0) * 0.015 + (s.levels.trim || 0) * 0.02;
    const specBonus = specs.speed * (speedDef ? speedDef.per : 0.05) * hwSpeedBoost;
    const contractRewards = getContractRewards(s, productId);
    return Math.min(CHAIN_SHARE_MAX, (baseShare + specBonus) * contractRewards.flowBoost);
  }

  /** Effective sale price multiplier from yield specialization + milestones + contracts. */
  function chainYieldMult(s, productId) {
    const yieldDef = CHAIN_SPECS[productId] && CHAIN_SPECS[productId].yield;
    const specs = s.chainSpecs && s.chainSpecs[productId] ? s.chainSpecs[productId] : { yield: 0 };
    // Hardware synergy: turbo/uv/mega boost yield spec effectiveness
    const hwYieldBoost = 1 + (s.levels.turbo || 0) * 0.15 + (s.levels.uv || 0) * 0.1 + (s.levels.mega || 0) * 0.2;
    const yieldPerPt = yieldDef ? yieldDef.per : 0.04;
    const contractRewards = getContractRewards(s, productId);
    return (1 + specs.yield * yieldPerPt * hwYieldBoost) * chainMilestoneMult(s, productId)
      * contractRewards.yieldMult * contractRewards.globalYield;
  }

  /** Effective max grams per tick from volume specialization. */
  function chainVolumeMult(s, productId) {
    const volumeDef = CHAIN_SPECS[productId] && CHAIN_SPECS[productId].volume;
    const specs = s.chainSpecs && s.chainSpecs[productId] ? s.chainSpecs[productId] : { volume: 0 };
    // Hardware synergy: crew/co2 boost volume spec effectiveness
    const hwVolumeBoost = 1 + (s.levels.crew || 0) * 0.1 + (s.levels.co2 || 0) * 0.15;
    const volumePerPt = volumeDef ? volumeDef.per : 0.15;
    const contractRewards = getContractRewards(s, productId);
    return (1 + specs.volume * volumePerPt * hwVolumeBoost) * contractRewards.flowBoost;
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
    const chainLvl = {};
    for (const p of PRODUCTS) chainLvl[p.id] = 0;
    return {
      weed: 0,
      money: 0,
      strain: 'green',
      stock,
      prices: { weed: 6 },
      levels: { ...DEFAULT_LEVELS },
      auto: { craft: {}, sell: {} },
      chainLvl,
      chainSpecs: defaultChainSpecs(),
      chainStats: {},
      contracts: defaultContracts(),
      xp: 0,
      milestones: [],
      achievements: [],
      totalEarned: 0,
      lastSeen: 0,
      spikeUntil: 0,
      spikeProduct: null,
      spikeNextAt: 0
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
    const sm = spikeMult(s, kind, t);
    if (kind === 'weed') return Math.round(s.prices.weed * pm * pulse('weed', t) * sm);
    const p = getProduct(kind);
    if (!p) return 0;
    return Math.round(p.price * pm * pulse(kind, t) * sm);
  }

  /**
   * Offline earnings: simulate `seconds` of idle production at 50% rate (AdvCap).
   * Returns { weed, money } gained. Mutates state (adds weed/money/xp).
   * @param {object} s state
   * @param {number} seconds seconds away (capped 8h)
   * @param {number} [now] epoch ms
   */
  function offlineTick(s, seconds, now) {
    const t = now === undefined ? Date.now() : now;
    const secs = Math.max(0, Math.min(28800, Math.floor(seconds || 0)));
    if (secs <= 0) return { weed: 0, money: 0 };
    const ps = perSecond(s);
    const weed = Math.floor(ps * secs * 0.5);
    const added = harvestXp(s, weed);
    // auto-sell a share via chains at 50% rate
    const flow = added;
    const res = autoTick(s, t, flow);
    applySpoil(s); // le surplus hors-ligne se dégrade aussi
    const money = Object.values(res.soldMoney).reduce((a, b) => a + b, 0);
    return { weed: added, money };
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
   * Tier bonus: every 25 levels → ×2 per upgrade.
   * Progression lissée: trim s'ajoute à expert.
   */
  function perClick(s) {
    const h = (s.levels.harvest || 0) * tierMult(s.levels.harvest || 0);
    const e = (s.levels.expert || 0) * 5 * tierMult(s.levels.expert || 0);
    const t = (s.levels.trim || 0) * 5 * tierMult(s.levels.trim || 0);
    let pc = h + e + t;
    if (s.levels.turbo > 0) pc *= 2 * tierMult(s.levels.turbo || 0);
    if (s.levels.uv > 0) pc *= 1.4 * tierMult(s.levels.uv || 0);
    if (s.levels.mega > 0) pc *= 2 * tierMult(s.levels.mega || 0);
    let total = pc * productionMult(s);
    total += perSecond(s) * (s.levels.thumb || 0) * 0.08; // +8%/lvl of auto prod
    return Math.round(total);
  }

  /**
   * Weed gained per second (auto production), scaled by production multiplier.
   * Tier bonus applies per upgrade. Progression lissée: mist/co2.
   */
  function perSecond(s) {
    const a = (s.levels.auto || 0) * tierMult(s.levels.auto || 0);
    const mi = (s.levels.mist || 0) * 2 * tierMult(s.levels.mist || 0);
    const c = (s.levels.crew || 0) * 15 * tierMult(s.levels.crew || 0);
    const co = (s.levels.co2 || 0) * 15 * tierMult(s.levels.co2 || 0);
    let base = a + mi + c + co;
    if (s.levels.uv > 0) base *= 1.4 * tierMult(s.levels.uv || 0);
    if (s.levels.mega > 0) base *= 2 * tierMult(s.levels.mega || 0);
    // turbo does not affect perSecond (only click weed)
    return Math.round(base * productionMult(s));
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
   * Bulk cost for buying `n` levels at once (geometric sum). Returns total €.
   * @param {object} s state
   * @param {string} id upgrade id
   * @param {number} n how many to buy
   * @returns {number} total cost
   */
  function upgradeBulkCost(s, id, n) {
    const count = Math.max(1, Math.floor(n || 1));
    let total = 0;
    const u = UPGRADES.find((x) => x.id === id);
    const growth = (u && u.growth) || COST_GROWTH;
    const base = BASE_COST[id];
    const cur = s.levels[id] - (id === 'harvest' ? 1 : 0);
    for (let i = 0; i < count; i++) {
      total += Math.floor(base * Math.pow(growth, cur + i));
    }
    return total;
  }

  /**
   * Buy `n` levels of an upgrade at once (AdvCap batch). Returns result.
   * @param {object} s state
   * @param {string} id upgrade id
   * @param {number} n count (1,10,100)
   */
  function buyUpgradeBulk(s, id, n) {
    const count = Math.max(1, Math.floor(n || 1));
    const cost = upgradeBulkCost(s, id, count);
    if (s.money < cost) return { ok: false, reason: 'funds', cost };
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return { ok: false, reason: 'unknown' };
    s.money -= cost;
    s.levels[id] += count;
    return { ok: true, cost, count, name: u.name };
  }

  /**
   * Time to afford an upgrade in seconds (AdvCap ROI). Infinity if no income.
   * @param {object} s state
   * @param {string} id upgrade id
   * @param {number} [n] bulk count
   */
  function timeToAfford(s, id, n) {
    const cost = n ? upgradeBulkCost(s, id, n) : upgradeCost(s, id);
    const need = cost - (s.money || 0);
    if (need <= 0) return 0;
    const ps = perSecond(s);
    const income = ps * 6; // ~6€/g average via weed sales (approx), plus auto is 0.15 share already
    // use perSecond weed * avg price 7 €/g as rough income estimate
    const eps = Math.max(1, ps * 7);
    return Math.ceil(need / eps);
  }

  /**
   * Try to buy an upgrade. Mutates state on success only.
   */
  function buyUpgrade(s, id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return { ok: false, reason: 'unknown' };
    const cost = upgradeCost(s, id);
    if (s.money < cost) return { ok: false, reason: 'funds' };
    s.money -= cost;
    s.levels[id]++;
    return { ok: true, cost, name: u.name };
  }

  /**
   * Combien de niveaux du upgrade `id` peut-on payer avec l'argent courant ?
   * (pour le bouton MAX — capé à 500 pour éviter les boucles folles)
   */
  function maxAffordableLevels(s, id) {
    let n = 0;
    while (n < 500) {
      if (upgradeBulkCost(s, id, n + 1) > s.money) break;
      n++;
    }
    return n;
  }

  /** Niveau actuel d'une chaîne (0 = non embauchée). */
  function chainLvl(s, productId) {
    return Math.max(0, Math.floor((s.chainLvl && s.chainLvl[productId]) || 0));
  }

  /**
   * Coût TOTAL pour acheter `n` niveaux de la chaîne à partir de son niveau
   * courant : somme géométrique base × AUTOMATION_GROWTH^(cur+i).
   */
  function automationCost(s, productId, n) {
    const a = AUTOMATION.find((x) => x.productId === productId);
    if (!a) return NaN;
    const count = Math.max(1, Math.floor(n || 1));
    const cur = chainLvl(s, productId);
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(a.cost * Math.pow(AUTOMATION_GROWTH, cur + i));
    }
    return total;
  }

  /** Combien de niveaux de chaîne payables avec l'argent courant (bouton MAX). */
  function maxAutomationLevels(s, productId) {
    let n = 0;
    while (n < 500) {
      if (automationCost(s, productId, n + 1) > s.money) break;
      n++;
    }
    return n;
  }

  /** Cost to buy `n` points in a specialization branch. */
  function chainSpecCost(s, productId, branch, n) {
    const specDef = CHAIN_SPECS[productId] && CHAIN_SPECS[productId][branch];
    if (!specDef) return NaN;
    const cur = s.chainSpecs && s.chainSpecs[productId] ? s.chainSpecs[productId][branch] : 0;
    if (cur >= specDef.max) return Infinity;
    const count = Math.max(1, Math.min(n || 1, specDef.max - cur));
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(specDef.baseCost * Math.pow(specDef.growth, cur + i));
    }
    return total;
  }

  /** Max affordable spec points in a branch. */
  function maxChainSpecPoints(s, productId, branch) {
    let n = 0;
    while (n < 20) {
      if (chainSpecCost(s, productId, branch, n + 1) > s.money) break;
      n++;
    }
    return n;
  }

  /** Buy specialization points. */
  function buyChainSpec(s, productId, branch, n) {
    const specDef = CHAIN_SPECS[productId] && CHAIN_SPECS[productId][branch];
    if (!specDef) return { ok: false, reason: 'unknown' };
    if (!s.chainLvl || !s.chainLvl[productId] || s.chainLvl[productId] < 1) {
      return { ok: false, reason: 'locked', message: 'Chaîne non embauchée' };
    }
    const cur = s.chainSpecs && s.chainSpecs[productId] ? s.chainSpecs[productId][branch] : 0;
    if (cur >= specDef.max) return { ok: false, reason: 'maxed' };
    const want = Math.max(1, Math.min(n || 1, specDef.max - cur));
    const cost = chainSpecCost(s, productId, branch, want);
    if (s.money < cost) return { ok: false, reason: 'funds', cost };
    s.money -= cost;
    s.chainSpecs = s.chainSpecs || defaultChainSpecs();
    s.chainSpecs[productId] = s.chainSpecs[productId] || { speed: 0, yield: 0, volume: 0 };
    s.chainSpecs[productId][branch] = cur + want;
    return { ok: true, productId, branch, lvl: cur + want, bought: want, cost };
  }

  /** Check and complete contracts. */
  function checkContracts(s, ctx) {
    const completed = [];
    const level = levelFromXp(s.xp);
    for (const ct of CONTRACTS) {
      if (s.contracts.completed.includes(ct.id) || s.contracts.claimed.includes(ct.id)) continue;
      if (level < ct.unlockLevel) continue;
      let progress = 0;
      if (ct.type === 'crafted' && ct.productId) {
        progress = s.chainStats && s.chainStats[ct.productId] ? s.chainStats[ct.productId].crafted : 0;
      } else if (ct.type === 'chain_money') {
        progress = s.contracts.chainMoneyEarned || 0;
      } else if (ct.type === 'chain_grams') {
        progress = s.contracts.chainGramsConverted || 0;
      }
      if (progress >= ct.target) {
        s.contracts.completed.push(ct.id);
        completed.push(ct);
      } else if (!s.contracts.offered.includes(ct.id)) {
        s.contracts.offered.push(ct.id);
      }
    }
    return completed;
  }

  /** Claim a completed contract. Rewards are DERIVED from the claimed list
   *  (getContractRewards) — nothing multiplicative is stored in the save. */
  function claimContract(s, contractId) {
    const ct = CONTRACTS.find((c) => c.id === contractId);
    if (!ct) return { ok: false, reason: 'unknown' };
    if (!s.contracts.completed.includes(contractId)) return { ok: false, reason: 'not_completed' };
    if (s.contracts.claimed.includes(contractId)) return { ok: false, reason: 'already_claimed' };
    s.contracts.completed = s.contracts.completed.filter((c) => c !== contractId);
    s.contracts.claimed.push(contractId);
    return { ok: true, contract: ct };
  }

  /** Reward multipliers for a product, derived from the claimed contracts. */
  function getContractRewards(s, productId) {
    const rewards = { yieldMult: 1, globalYield: 1, flowBoost: 1 };
    const claimed = s.contracts && Array.isArray(s.contracts.claimed) ? s.contracts.claimed : [];
    for (const id of claimed) {
      const ct = CONTRACTS.find((c) => c.id === id);
      if (!ct) continue;
      if (ct.reward.yieldMult && ct.productId === productId) rewards.yieldMult *= ct.reward.yieldMult;
      if (ct.reward.globalYield) rewards.globalYield *= ct.reward.globalYield;
      if (ct.reward.flowBoost) rewards.flowBoost *= ct.reward.flowBoost;
    }
    return rewards;
  }

  /**
   * Embauche ou améliore une chaîne. Le gate de niveau ne s'applique qu'à la
   * PREMIÈRE embauche (lvl 0 → 1) ; ensuite on paie le niveau suivant.
   * @returns {{ok:boolean, reason?:'level'|'funds'|'unknown', name?:string, lvl?:number, bought?:number}}
   */
  function buyAutomation(s, id, n) {
    const a = AUTOMATION.find((x) => x.id === id);
    if (!a) return { ok: false, reason: 'unknown' };
    const cur = chainLvl(s, a.productId);
    if (cur === 0 && levelFromXp(s.xp) < a.unlock) return { ok: false, reason: 'level' };
    const want = Math.max(1, Math.floor(n || 1));
    const cost = automationCost(s, a.productId, want);
    if (s.money < cost) return { ok: false, reason: 'funds', cost };
    s.money -= cost;
    if (!s.chainLvl || typeof s.chainLvl !== 'object') s.chainLvl = {};
    s.chainLvl[a.productId] = cur + want;
    // flags legacy maintenus pour compat (autoTick/serialize)
    if (!s.auto || typeof s.auto !== 'object') s.auto = { craft: {}, sell: {} };
    if (!s.auto.craft || typeof s.auto.craft !== 'object') s.auto.craft = {};
    if (!s.auto.sell || typeof s.auto.sell !== 'object') s.auto.sell = {};
    s.auto.craft[a.productId] = true;
    s.auto.sell[a.productId] = true;
    return { ok: true, name: a.name, lvl: cur + want, bought: want, cost };
  }

  /** @returns {boolean} true si la chaîne est active (niveau ≥ 1 ou flags legacy). */
  function hasAuto(s, kind, productId) {
    if (chainLvl(s, productId) > 0) return true;
    return !!(s.auto && s.auto[kind] && s.auto[kind][productId]);
  }

  /** Share of the tick's produced flow each owned chain converts (base 15%). */
  const CHAIN_FLOW_SHARE = 0.15;

  /**
   * Automation tick — runs every second after weed production.
   *
   * Order matters and is deliberate:
   *   1. Auto-craft owned chains, most expensive product first. Throughput is
   *      PROPORTIONAL to the flow that actually entered storage: each chain
   *      converts up to CHAIN_FLOW_SHARE of the remaining budget (1u/s floor
   *      when flow allows). No stored inflow (stock full) -> chains pause:
   *      the player's pile and hand-made stock are never drained by chains.
   *   2. Dealers sell exactly their chain's fresh output at the CURRENT market
   *      price (pulse included): idle money is proportional to what the chain
   *      transformed, while hand-made bulk sales at a +30% peak stay the
   *      bigger, smarter move.
   *
   * No XP is granted: consistent with manual crafting/selling which only move €.
   * @param {object} s state (mutated)
   * @param {number} [now] epoch ms for the market pulse (default Date.now())
   * @param {number} [flow] grams produced this tick (clicks + auto); default 0
   * @returns {{crafted:Object<string,number>, soldMoney:Object<string,number>}} per-product units crafted and cash earned this tick
   */
  function autoTick(s, now, flow) {
    const res = { crafted: {}, soldMoney: {} };
    let budget = Math.max(0, flow || 0);
    for (const p of [...PRODUCTS].reverse()) {
      if (!hasAuto(s, 'craft', p.id)) continue;
      // chains convert ONLY what actually entered storage this tick:
      // at least 1u/s when flow allows, up to this chain's share of the
      // remaining budget (niveau de chaîne + bonus Distribution + SPEED spec, clampé).
      if (budget < p.cost) continue;
      const share = chainShareOf(s, p.id);
      const volumeMult = chainVolumeMult(s, p.id);
      const maxGrams = Math.max(p.cost, flow * share) * volumeMult;
      const grams = Math.min(budget, maxGrams);
      const units = Math.floor(grams / p.cost);
      if (units < 1) continue;
      const r = craftProduct(s, p.id, units);
      if (r.ok) {
        res.crafted[p.id] = r.amount;
        budget -= r.amount * p.cost;
        // track for contracts
        s.chainStats = s.chainStats || {};
        s.chainStats[p.id] = s.chainStats[p.id] || { crafted: 0, sold: 0, money: 0 };
        s.chainStats[p.id].crafted += r.amount;
      }
    }
    let chainMoneyThisTick = 0;
    let chainGramsThisTick = 0;
    for (const p of PRODUCTS) {
      if (!hasAuto(s, 'sell', p.id)) continue;
      const made = res.crafted[p.id] || 0;
      if (!made) continue;
      const prod = getProduct(p.id);
      const unit = priceOf(s, p.id, now) * chainYieldMult(s, p.id);
      const gain = Math.round(made * unit);
      s.stock[p.id] -= made;
      s.money += gain;
      s.totalEarned = (s.totalEarned || 0) + gain;
      res.soldMoney[p.id] = gain;
      chainMoneyThisTick += gain;
      chainGramsThisTick += made * prod.cost;
      // track for contracts
      s.chainStats[p.id] = s.chainStats[p.id] || { crafted: 0, sold: 0, money: 0 };
      s.chainStats[p.id].sold += made;
      s.chainStats[p.id].money += gain;
    }
    // track totals for global contracts
    if (chainMoneyThisTick > 0) s.contracts.chainMoneyEarned = (s.contracts.chainMoneyEarned || 0) + chainMoneyThisTick;
    if (chainGramsThisTick > 0) s.contracts.chainGramsConverted = (s.contracts.chainGramsConverted || 0) + chainGramsThisTick;
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
        : Math.min(s.stock.weed || 0, Math.max(0, Math.floor(amount)));
      gain = toSell * unit;
      s.stock.weed = (s.stock.weed || 0) - toSell;
      drainByStrain(s, 'weedByStrain', toSell);
    } else {
      const prod = getProduct(type);
      if (prod) {
        const unit = priceOf(s, type, now);
        const have = s.stock[type] || 0;
        const toSell = amount === undefined ? have : Math.min(have, Math.max(0, Math.floor(amount)));
        gain = toSell * unit;
        s.stock[type] = have - toSell;
        drainByStrain(s, type + 'ByStrain', toSell);
      }
    }
    s.money += gain;
    s.totalEarned = (s.totalEarned || 0) + gain;
    return gain;
  }

  /** Add weed to stock (total + per-strain) — PAS de cap, tout est gardé. */
  function addWeed(s, amount) {
    const toAdd = Math.max(0, Math.floor(amount || 0));
    if (toAdd <= 0) return 0;
    s.weed = (s.weed || 0) + toAdd;
    s.stock.weed = (s.stock.weed || 0) + toAdd;
    const sid = s.strain;
    if (!s.stock.weedByStrain) s.stock.weedByStrain = {};
    s.stock.weedByStrain[sid] = (s.stock.weedByStrain[sid] || 0) + toAdd;
    return toAdd;
  }

  /**
   * Spoilage doux — REMPLACE le cap de stock comme gate de progression.
   * Au-delà d'un plancher (= max(500g, 60s de production)), la weed brute se
   * dégrade de 1%/s : thésauriser est possible mais jamais rentable, cliquer
   * n'est JAMAIS bloqué, et l'économie reste bornée sans mur frustrant.
   * @param {object} s state (mutated)
   * @returns {number} grams lost this call
   */
  const SPOIL_RATE = 0.01;
  function applySpoil(s) {
    const floor = Math.max(500, perSecond(s) * 60);
    const stock = s.stock.weed || 0;
    if (stock <= floor) return 0;
    const loss = Math.min(stock - floor, Math.ceil((stock - floor) * SPOIL_RATE));
    s.stock.weed = stock - loss;
    drainByStrain(s, 'weedByStrain', loss);
    return loss;
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
     // migration: anciens upgrades de stockage -> paliers Distribution (même rang)
     if (d.levels.sbox !== undefined) { d.levels.dist1 = Math.max(0, d.levels.sbox | 0); delete d.levels.sbox; }
     if (d.levels.coldroom !== undefined) { d.levels.dist2 = Math.max(0, d.levels.coldroom | 0); delete d.levels.coldroom; }
     if (d.levels.silo !== undefined) { d.levels.dist3 = Math.max(0, d.levels.silo | 0); delete d.levels.silo; }
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
      delete d.stock.main; delete d.stock.premium;
      // moonrock is now a valid product (was legacy premium), keep it
      d.milestones = Array.isArray(d.milestones)
        ? d.milestones.filter((m) => MILESTONES.some((mi) => mi.id === m))
        : [];
      d.achievements = Array.isArray(d.achievements)
        ? d.achievements.filter((a) => ACHIEVEMENTS.some((ach) => ach.id === a))
        : [];
      // chain specs sanitization
      const defaultSpecs = defaultChainSpecs();
      if (!d.chainSpecs || typeof d.chainSpecs !== 'object') d.chainSpecs = defaultSpecs;
      else {
        for (const pid of Object.keys(CHAIN_SPECS)) {
          if (!d.chainSpecs[pid] || typeof d.chainSpecs[pid] !== 'object') {
            d.chainSpecs[pid] = { speed: 0, yield: 0, volume: 0 };
          } else {
            d.chainSpecs[pid].speed = Math.max(0, Math.min(CHAIN_SPECS[pid].speed.max, Math.floor(d.chainSpecs[pid].speed || 0)));
            d.chainSpecs[pid].yield = Math.max(0, Math.min(CHAIN_SPECS[pid].yield.max, Math.floor(d.chainSpecs[pid].yield || 0)));
            d.chainSpecs[pid].volume = Math.max(0, Math.min(CHAIN_SPECS[pid].volume.max, Math.floor(d.chainSpecs[pid].volume || 0)));
          }
        }
      }
      // contracts sanitization
      const defaultContractsState = defaultContracts();
      if (!d.contracts || typeof d.contracts !== 'object') d.contracts = defaultContractsState;
      else {
        d.contracts.completed = Array.isArray(d.contracts.completed)
          ? d.contracts.completed.filter((c) => CONTRACTS.some((ct) => ct.id === c))
          : [];
        d.contracts.offered = Array.isArray(d.contracts.offered)
          ? d.contracts.offered.filter((c) => CONTRACTS.some((ct) => ct.id === c))
          : [];
        d.contracts.claimed = Array.isArray(d.contracts.claimed)
          ? d.contracts.claimed.filter((c) => CONTRACTS.some((ct) => ct.id === c))
          : [];
        d.contracts.chainMoneyEarned = typeof d.contracts.chainMoneyEarned === 'number' && d.contracts.chainMoneyEarned >= 0
          ? Math.floor(d.contracts.chainMoneyEarned) : 0;
        d.contracts.chainGramsConverted = typeof d.contracts.chainGramsConverted === 'number' && d.contracts.chainGramsConverted >= 0
          ? Math.floor(d.contracts.chainGramsConverted) : 0;
      }
      // récompenses dérivées de claimed — drop du champ legacy (WIP pré-release)
      delete d.contractRewards;
      // stats de chaînes — produits connus uniquement, compteurs ≥ 0
      if (!d.chainStats || typeof d.chainStats !== 'object') d.chainStats = {};
      {
        const clean = {};
        for (const p of PRODUCTS) {
          const st = d.chainStats[p.id];
          if (!st || typeof st !== 'object') continue;
          clean[p.id] = {
            crafted: typeof st.crafted === 'number' && st.crafted >= 0 ? Math.floor(st.crafted) : 0,
            sold: typeof st.sold === 'number' && st.sold >= 0 ? Math.floor(st.sold) : 0,
            money: typeof st.money === 'number' && st.money >= 0 ? Math.floor(st.money) : 0
          };
        }
        d.chainStats = clean;
      }
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
      // niveaux de chaînes : entiers ≥ 0, produits connus uniquement ;
      // migration des vieilles saves (chaîne possédée sans niveau → 1)
      if (!d.chainLvl || typeof d.chainLvl !== 'object') d.chainLvl = {};
      {
        const clean = {};
        for (const p of PRODUCTS) {
          const v = d.chainLvl[p.id];
          clean[p.id] = typeof v === 'number' && v > 0 ? Math.min(999, Math.floor(v)) : 0;
          if (!clean[p.id] && d.auto.craft[p.id]) clean[p.id] = 1;
        }
        d.chainLvl = clean;
      }
      d.lastSeen = typeof d.lastSeen === 'number' && d.lastSeen >= 0 ? d.lastSeen : 0;
      d.spikeUntil = typeof d.spikeUntil === 'number' && d.spikeUntil >= 0 ? d.spikeUntil : 0;
      d.spikeProduct = typeof d.spikeProduct === 'string' && (d.spikeProduct === 'weed' || PRODUCTS.some((p) => p.id === d.spikeProduct)) ? d.spikeProduct : null;
      d.spikeNextAt = typeof d.spikeNextAt === 'number' && d.spikeNextAt >= 0 ? d.spikeNextAt : 0;
      // drop removed fields (golden, prestige)
      delete d.goldenUntil;
      delete d.goldenNextAt;
      delete d.prestige;
      delete d.lifetimeEarned;
     return d;
   }

  return {
    UPGRADES,
    STRAINS,
    PRODUCTS,
    AUTOMATION,
    BASE_COST,
    COST_GROWTH,
    STORAGE_GROWTH,
    DEFAULT_LEVELS,
    MARKET,
    XP_BASE,
    XP_GROWTH,
    MILESTONES,
    TIER_EVERY,
    SPIKE_DURATION,
    SPIKE_MULT,
    SPIKE_COOLDOWN_MIN,
    SPIKE_COOLDOWN_MAX,
    mulberry32,
    addWeed,
    harvestXp,
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
    checkAchievements,
    achievementBonus,
    perClick,
    perSecond,
    upgradeCost,
    buyUpgrade,
    hasAuto,
    buyAutomation,
    autoTick,
    craftProduct,
    sellStock,
    equipStrain,
    serialize,
    deserialize,
    tierMult,
    isSpikeActive,
    spikeMult,
    maybeTriggerSpike,
    chainLvl,
    chainShareOf,
    distShare,
    chainYieldMult,
    chainVolumeMult,
    CHAIN_FLOW_SHARE,
    CHAIN_SHARE_MAX,
    CHAIN_SPECS,
    AUTOMATION_GROWTH,
    automationCost,
    maxAutomationLevels,
    chainSpecCost,
    maxChainSpecPoints,
    buyChainSpec,
    maxAffordableLevels,
    applySpoil,
    SPOIL_RATE,
    offlineTick,
    upgradeBulkCost,
    buyUpgradeBulk,
    timeToAfford,
    CONTRACTS,
    checkContracts,
    claimContract,
    getContractRewards,
    defaultContracts,
    CHAIN_MILESTONES,
    chainMilestoneMult,
    nextChainMilestone
  };
});
