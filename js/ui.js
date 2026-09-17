/**
 * Bud Clicker — UI layer.
 *
 * The only module allowed to touch the DOM and the localStorage. It owns the
 * game state (a plain object, see `Game.defaultState`) and re-renders the UI
 * after every mutation. All game *logic* lives in `js/game.js` (pure), all
 * SVG generation in `js/bud.js` (pure); this file is just the glue.
 *
 * Requires `window.BudGame` and `window.BudRender` (load this script last).
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return; // node/test guard

  const Game = window.BudGame;
  const Bud = window.BudRender;
  const SAVE_KEY = 'budClicker';

  // --- DOM references --------------------------------------------------------
  const el = {
    m: document.getElementById('m'),
    ar: document.getElementById('sec'),
    lv: document.getElementById('lv'),
    hl: document.getElementById('cl'),
    stw: document.getElementById('stw'),
    comboWrap: document.getElementById('combo-wrap'),
    comboPill: document.getElementById('combo-pill'),
    comboBar: document.getElementById('combo-bar'),
    marketGrid: document.getElementById('market-grid'),
    sellAll: document.getElementById('sell-all'),
    qtyRow: document.getElementById('qty-row'),
    upgQtyRow: document.getElementById('upg-qty-row'),
    upgQtyInfo: document.getElementById('upg-qty-info'),
    upgTabs: document.getElementById('upg-tabs'),
    chainUg: document.getElementById('ug-chains'),
    chainSummary: document.getElementById('chain-summary'),
    bc: document.getElementById('bc'),
    mc: document.getElementById('mc'),
    bs: document.getElementById('bs'),
    sb: document.getElementById('sb'),
    soundBtn: document.getElementById('sound-btn'),
    headerLogo: document.getElementById('header-bud-logo'),
    ug: document.getElementById('ug'),
    sv: document.getElementById('sv'),
    mps: document.getElementById('mps'),
    xplv: document.getElementById('xplv'),
    xpmult: document.getElementById('xpmult'),
    xpf: document.getElementById('xpf'),
    xpcur: document.getElementById('xpcur'),
    xpnext: document.getElementById('xpnext'),
    ms: document.getElementById('ms'),
    rb: document.getElementById('rb'),
    cv: document.getElementById('cv'),
    ach: document.getElementById('ach'),
    achCount: document.getElementById('ach-count'),
    sesEarned: document.getElementById('ses-earned'),
    sesPerMin: document.getElementById('ses-permin'),
    sesIdle: document.getElementById('ses-idle'),
    sesClicks: document.getElementById('ses-clicks'),
    sesCrits: document.getElementById('ses-crits'),
    sesCombo: document.getElementById('ses-combo'),
    sesPeaks: document.getElementById('ses-peaks'),
    sesBig: document.getElementById('ses-big'),
    daily: document.getElementById('daily'),
    streakLvl: document.getElementById('streak-lvl'),
    streakMult: document.getElementById('streak-mult'),
    streakFill: document.getElementById('streak-fill'),
    streakNext: document.getElementById('streak-next')
  };

  let state = Game.defaultState();

  /** Quantity preset for market craft/sell actions: 1, 10, 100 or 'max'. */
  let qtyMode = 1;
  let upgradeQtyMode = 1;
  /** Active sub-tab in the Upgrades view: 'hw' (matériel) | 'chains'. */
  let upgTab = 'hw';

  // --- juice : paliers de gains totaux (💰) -----------------------------------
  /** Exposant du palier de 10 atteint par les gains totaux (0 sous 1 M€). */
  function earnStep(te) { return te >= 1e6 ? Math.floor(Math.log10(te)) : 0; }
  /** Label compact pour le juice : 1 M€, 250 M€, 3 Md€… */
  function moneyWord(n) { return n >= 1e9 ? Math.round(n / 1e9) + ' Md€' : Math.round(n / 1e6) + ' M€'; }
  let lastEarnStep = 0;

  // --- helpers ---------------------------------------------------------------
  /** Format a number for display: 1.2K / 3.45M / floor below 1000. */
  function fmt(n) {
    return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
      : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K'
      : Math.floor(n);
  }

  /**
   * Short toast notification — max 2 visibles, dédoublonnées: re-notifier le
   * même message (ex « Pas assez d'argent » en spam-cliquant) ne réempile pas,
   * ça relance seulement le timer du toast existant.
   * `big` = variante dorée pour les moments jouissifs (paliers de chaîne, max…).
   */
  function toast(text, big) {
    const last = el.mc.lastElementChild;
    if (last && last.textContent === text) {
      clearTimeout(last._timer);
      last._timer = setTimeout(() => { if (last.parentNode) last.remove(); }, 2200);
      return;
    }
    const m = document.createElement('div');
    m.className = 'ms' + (big ? ' big' : '');
    m.textContent = text;
    while (el.mc.children.length >= 2) el.mc.firstElementChild.remove();
    el.mc.appendChild(m);
    m._timer = setTimeout(() => { if (m.parentNode) m.remove(); }, 2200);
  }

  /** Re-trigger the "pop" animation on a stat element (WAAPI: no forced reflow). */
  function popNum(node) {
    if (!node || !node.animate) return;
    node.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(1)' }],
      { duration: 180, easing: 'cubic-bezier(.34,1.56,.64,1)' }
    );
  }

  /** Toast de streak (jour 2+ seulement — le jour 1 ne fait pas de tapage). */
  function streakToast(roll) {
    if (roll && roll.rolled && roll.count > 1) {
      toast('🔥 Streak jour ' + roll.count + ' — +' + Math.round((roll.mult - 1) * 100) + '% de production !', true);
    }
  }

  // --- son (WebAudio, zéro fichier, désactivable) -----------------------------
  /** AudioContext créé au premier geste (autoplay policy), ou null si inutilisable. */
  let audioCtx = null;
  let soundOn = true;
  const SOUND_KEY = 'budClickerSound';

  function soundEnabled() {
    try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { /* private mode */ }
    return soundOn;
  }
  function toggleSound() {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) { /* private mode */ }
    return soundOn;
  }
  /** Lazy AudioContext : la première interaction joueur débloque l'audio. */
  function getCtx() {
    if (!soundEnabled()) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (audioCtx === null) {
      if (typeof AC === 'undefined') return null;
      try { audioCtx = new AC(); } catch (e) { return null; }
    }
    return audioCtx;
  }
  /** Bip synthétisé court (oscillateur) : `freq` Hz, gain décroissant, polyphonie limitée. */
  function beep(freq, duration, type, gain) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (duration || 0.1));
      osc.connect(g); g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (duration || 0.1));
      osc.onended = () => { osc.disconnect(); g.disconnect(); };
    } catch (e) { /* audio indisponible : silencieux */ }
  }
  /** Pop discret au clic (montée rapide), crit plus riche (deux notes). */
  const sfx = {
    click: () => beep(520, 0.05, 'triangle', 0.05),
    crit: () => { beep(780, 0.09, 'square', 0.07); setTimeout(() => beep(1170, 0.12, 'square', 0.06), 60); },
    buy: () => { beep(440, 0.08, 'triangle', 0.06); setTimeout(() => beep(660, 0.1, 'triangle', 0.06), 70); },
    reward: () => { beep(523, 0.1, 'triangle', 0.07); setTimeout(() => beep(659, 0.1, 'triangle', 0.07), 90); setTimeout(() => beep(784, 0.16, 'triangle', 0.07), 180); }
  };

  // --- rendering -------------------------------------------------------------
  function renderBud() {
    const st = Game.getStrain(state.strain);
    if (el.sb && st) el.sb.textContent = st.icon + ' ' + st.name;
    const svg = Bud.renderBudSvg(state.strain);
    if (el.headerLogo) {
      el.headerLogo.innerHTML = '<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">' + svg + '</svg>';
    }
    if (!el.bs) return;
    // bs may be <svg> (old) or <div> (new) — handle both
    if (el.bs.tagName.toLowerCase() === 'svg') {
      el.bs.innerHTML = svg;
    } else {
      el.bs.innerHTML = '<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">' + svg + '</svg>';
    }
  }

  function renderUpgrades() {
    // Matériel trié par coût croissant — la lecture suit la progression
    el.ug.innerHTML = '';
    const sorted = [...Game.UPGRADES].sort((a, b) => a.cost - b.cost);
    for (const u of sorted) {
      const card = document.createElement('div');
      card.className = 'upgrade';
      card.id = 'ui-' + u.id;
      const tierInfo = Game.TIER_EVERY ? ' · ×2 tous les ' + Game.TIER_EVERY : '';
      card.innerHTML =
        '<span class="up-icon">' + u.icon + '</span>' +
        '<div class="up-info"><div class="up-name">' + u.name +
          ' <span class="up-level" id="ul-' + u.id + '">Lvl 0</span></div>' +
          '<div class="up-desc">' + u.desc + tierInfo + '</div></div>' +
        '<div class="up-buy"><span class="up-cost" id="uc-' + u.id + '">0 €</span>' +
          '<button class="bb" id="ub-' + u.id + '">Acheter</button></div>';
      card.querySelector('.bb').addEventListener('click', () => buyUpgrade(u.id));
      el.ug.appendChild(card);
    }
    // Chaînes — onglet dédié, multi-niveaux (embauche puis améliorations)
    if (!el.chainUg) return;
    el.chainUg.innerHTML = '';
    for (const a of Game.AUTOMATION) {
      const p = Game.getProduct(a.productId);
      const card = document.createElement('div');
      card.className = 'upgrade';
      card.id = 'ui-' + a.id;
      card.innerHTML =
        '<span class="up-icon">' + (p ? p.icon : a.icon) + '</span>' +
        '<div class="up-info"><div class="up-name">' + a.name +
          ' <span class="up-level" id="ul-' + a.id + '">Niv 0</span></div>' +
          '<div class="up-desc">' + a.desc + ' · +' + Math.round(Game.CHAIN_FLOW_SHARE * 100) + '% flux/niveau</div>' +
          '<div class="chain-bar"><div class="chain-fill" id="chain-bar-' + a.id + '" style="width:0%"></div></div>' +
          '<div id="chain-idle-' + a.id + '" style="font-size:.68rem;color:var(--muted);margin-top:3px"></div>' +
          '<div class="chain-specs" id="chain-specs-' + a.id + '" style="display:none;margin-top:6px;"></div></div>' +
        '<div class="up-buy"><span class="up-cost" id="uc-' + a.id + '">' + fmt(a.cost) + ' €</span>' +
          '<button class="bb" id="ub-' + a.id + '">Acheter</button></div>';
      card.querySelector('.bb').addEventListener('click', () => buyAuto(a.id));
      el.chainUg.appendChild(card);
    }
  }

  function renderStrains() {
    el.sv.innerHTML = '';
    const level = Game.levelFromXp(state.xp);
    for (const st of Game.STRAINS) {
      const owned = state.stock.strains.includes(st.id);
      const equipped = state.strain === st.id;
      const locked = !owned && level < st.unlock;
      const card = document.createElement('div');
      card.className = 'strain' + (owned ? ' owned' : '') + (locked ? ' locked' : '');
      card.innerHTML =
        '<span class="st-icon">' + st.icon + '</span>' +
        '<div class="st-info"><div class="st-name">' + st.name +
          (equipped ? ' <span class="st-badge">Équipée</span>' : '') + '</div>' +
          '<div class="st-desc">' + st.desc + ' (x' + st.yieldMult + ' rendement, x' + st.priceMult + ' prix)</div>' +
          '<div class="st-mastery"><span class="stm-lvl" id="stm-l-' + st.id + '"></span>' +
            '<span class="stm-bar"><span class="stm-fill" id="stm-f-' + st.id + '"></span></span></div></div>' +
        '<div class="st-buy">' +
          (owned ? ''
            : locked ? '<span class="st-lock">🔒 Niveau ' + st.unlock + '</span>'
            : '<span class="st-cost">' + fmt(st.cost) + ' €</span>') +
          (owned ? '<span class="st-ok">Possédée</span>'
                 : locked ? ''
                 : '<button class="bb" id="sb-' + st.id + '">Acheter</button>') +
        '</div>';
      card.addEventListener('click', () => equipStrain(st.id));
      const btn = card.querySelector('.bb');
      if (btn) {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          equipStrain(st.id);
        });
      }
      el.sv.appendChild(card);
    }
  }

  /** Trend arrow for a market at `now`: ↗ rising, ↘ falling, → flat. */
  function trendArrow(marketId, now) {
    const t = Game.trend(marketId, now);
    if (t > 0) return '<span class="trend up">↗</span>';
    if (t < 0) return '<span class="trend down">↘</span>';
    return '<span class="trend">→</span>';
  }

  /** Sparkline SVG statique par carte marché — seule la polyline bouge. */
  function sparklineHtml(marketId) {
    return '<div class="mc-spark"><svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline id="sl-' + marketId + '" fill="none" stroke="var(--green)" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
      '</svg></div>';
  }

  /** Polyline d'un marché : position dans le cycle pulse (déterministe). */
  function updateSparkline(marketId) {
    const poly = document.getElementById('sl-' + marketId);
    if (!poly) return;
    const samples = Game.marketSamples(marketId, Date.now(), 36);
    const min = Math.min.apply(null, samples);
    const max = Math.max.apply(null, samples);
    const span = Math.max(0.02, max - min);
    const pts = [];
    for (let i = 0; i < samples.length; i++) {
      const x = (i * 100 / (samples.length - 1)).toFixed(1);
      const y = (25 - ((samples[i] - min) / span) * 23).toFixed(1);
      pts.push(x + ',' + y);
    }
    poly.setAttribute('points', pts.join(' '));
    poly.setAttribute('stroke', Game.isSpikeActive(state, marketId) ? 'var(--gold)' : 'var(--green)');
  }

  /** État de la cloche d'alerte d'un marché (armée → cible affichée). */
  function updateBell(marketId) {
    const bell = document.getElementById('bell-' + marketId);
    if (!bell) return;
    const target = state.alerts && state.alerts[marketId];
    bell.textContent = target ? '🔔 ' + Math.round(target * 100) + '%' : '🔔';
    bell.classList.toggle('armed', !!target);
    bell.title = target
      ? 'Alerte armée à ' + Math.round(target * 100) + '% — reclique pour annuler'
      : 'Me prévenir quand le prix monte encore';
  }

  /* Market rendering — structure built ONCE (stable tap targets), values
     updated in place every tick. Rebuilding innerHTML every second thrashed
     layout on mobile and recreated buttons under the player's finger. */
  let marketBuilt = false;
  let marketLockKey = '';

  function buildMarketStructure() {
    el.marketGrid.innerHTML = '';
    // Weed brute card
    const weed = document.createElement('div');
    weed.className = 'market-card';
    weed.innerHTML =
      '<div class="mc-top"><div class="mc-title">🌿 Weed Brute</div><div class="mc-price" id="mp-weed"></div></div>' +
      sparklineHtml('weed') +
      '<div class="mc-stock" id="ms-weed"></div>' +
      '<div class="mc-actions">' +
        '<button class="mc-btn bell" id="bell-weed" title="Alerte prix"></button>' +
        '<button class="mc-btn sell" data-p="weed" id="mb-weed"></button>' +
      '</div>';
    el.marketGrid.appendChild(weed);
    document.getElementById('mb-weed').addEventListener('click', () => onSell('weed'));
    document.getElementById('bell-weed').addEventListener('click', () => onAlert('weed'));
    // Product cards
    for (const p of Game.PRODUCTS) {
      const card = document.createElement('div');
      card.className = 'market-card';
      card.id = 'mk-' + p.id;
      card.innerHTML =
        '<div class="mc-top"><div class="mc-title">' + p.icon + ' ' + p.name + '<span class="mc-qty" id="mq-' + p.id + '"></span></div><div class="mc-price" id="mp-' + p.id + '"></div></div>' +
        sparklineHtml(p.id) +
        '<div class="mc-stock" id="ms-' + p.id + '"></div>' +
        '<div class="mc-actions">' +
          '<button class="mc-btn bell" id="bell-' + p.id + '" title="Alerte prix"></button>' +
          '<button class="mc-btn craft" data-p="' + p.id + '" id="mbc-' + p.id + '"></button>' +
          '<button class="mc-btn sell" data-p="' + p.id + '" id="mbs-' + p.id + '"></button>' +
        '</div>';
      card.querySelector('.craft').addEventListener('click', () => onCraft(p.id));
      card.querySelector('.sell').addEventListener('click', () => onSell(p.id));
      card.querySelector('.bell').addEventListener('click', () => onAlert(p.id));
      el.marketGrid.appendChild(card);
    }
  }

  /** Render the market: prices pulse ±30% on a ~2 min cycle — arrows show direction. */
  function renderMarket() {
    if (!el.marketGrid) return;
    const level = Game.levelFromXp(state.xp);
    const now = Date.now();
    // rebuild the DOM only when a product lock state changes (level up)
    const lockKey = Game.PRODUCTS.map((p) => (level >= p.unlock ? 1 : 0)).join('');
    if (!marketBuilt || lockKey !== marketLockKey) {
      buildMarketStructure();
      marketBuilt = true;
      marketLockKey = lockKey;
    }

    // Weed brute values
    {
      const unit = Game.priceOf(state, 'weed', now);
      const have = state.stock.weed || 0;
      const n = qtyMode === 'max' ? have : Math.min(qtyMode, have);
      const spike = Game.isSpikeActive && Game.isSpikeActive(state, 'weed', now);
      document.getElementById('mp-weed').innerHTML = (spike ? '🔥 ' : '') + trendArrow('weed', now) + ' ' + unit + ' €/g';
      const weedCard = el.marketGrid.querySelector('.market-card');
      if (weedCard) weedCard.classList.toggle('spike', !!spike);
      document.getElementById('ms-weed').textContent = fmt(have) + 'g disponibles' + (spike ? ' — 🔥 Ruée ×1.6 !' : '');
      const btn = document.getElementById('mb-weed');
      btn.textContent = 'Vendre ' + (qtyMode === 'max' ? 'tout (' + fmt(have) + 'g)' : 'x' + n + ' (' + fmt(n) + 'g)');
      btn.disabled = n <= 0;
      updateSparkline('weed');
      updateBell('weed');
    }

    // Product values
    for (const p of Game.PRODUCTS) {
      const locked = level < p.unlock;
      const card = document.getElementById('mk-' + p.id);
      updateSparkline(p.id);
      updateBell(p.id);
      card.classList.toggle('locked', locked);
      const priceEl = document.getElementById('mp-' + p.id);
      const stockEl = document.getElementById('ms-' + p.id);
      const qtyEl = document.getElementById('mq-' + p.id);
      const cBtn = document.getElementById('mbc-' + p.id);
      const sBtn = document.getElementById('mbs-' + p.id);
      if (locked) {
        priceEl.innerHTML = trendArrow(p.id, now) + ' ' + Game.priceOf(state, p.id, now) + ' €/u';
        stockEl.textContent = '🔒 Niveau ' + p.unlock + ' requis — ' + p.cost + 'g weed → 1u';
        qtyEl.textContent = '';
        cBtn.style.display = 'none';
        sBtn.style.display = 'none';
        continue;
      }
      cBtn.style.display = '';
      sBtn.style.display = '';
      const unit = Game.priceOf(state, p.id, now);
      const have = state.stock[p.id] || 0;
      const maxCraftable = Math.floor((state.stock.weed || 0) / p.cost);
      const spike = Game.isSpikeActive && Game.isSpikeActive(state, p.id, now);
      card.classList.toggle('spike', !!spike);
      priceEl.innerHTML = (spike ? '🔥 ' : '') + trendArrow(p.id, now) + ' ' + unit + ' €/u';
      stockEl.textContent = fmt(have) + ' dispo — ' + p.cost + 'g → 1u (' + p.desc + ')' + (spike ? ' — 🔥 Ruée ×1.6 !' : '');
      qtyEl.textContent = qtyMode === 'max' ? 'x' + fmt(maxCraftable) : '';
      cBtn.textContent = 'Fabriquer ' + (qtyMode === 'max' ? 'max (' + fmt(maxCraftable) + ')' : 'x' + Math.min(qtyMode, Math.max(1, maxCraftable)));
      cBtn.disabled = maxCraftable <= 0;
      sBtn.textContent = 'Vendre ' + (qtyMode === 'max' ? 'tout (' + fmt(have) + ')' : 'x' + Math.min(qtyMode, Math.max(1, have)));
      sBtn.disabled = have <= 0;
    }

    // qty pills active state + sell-all button
    if (el.qtyRow) {
      el.qtyRow.querySelectorAll('.qty-pill').forEach((b) => {
        b.classList.toggle('active', String(b.dataset.q) === String(qtyMode));
      });
    }
    if (el.sellAll) el.sellAll.disabled =
      !Game.PRODUCTS.some((p) => (state.stock[p.id] || 0) > 0) && (state.stock.weed || 0) <= 0;
  }

  /** Render the progression panel: level/XP bar and milestones. */
  function renderProgress() {
    const now = Date.now();
    const prog = Game.xpProgress(state.xp);
    const mult = Game.productionMult(state, now);
    if (el.xplv) el.xplv.textContent = 'Niveau ' + prog.level;
    if (el.xpmult) el.xpmult.textContent = 'x' + mult.toFixed(2);
    if (el.xpf) {
      const pct = prog.needed > 0 ? Math.min(100, Math.round((prog.current / prog.needed) * 100)) : 100;
      el.xpf.style.width = pct + '%';
    }
    if (el.xpcur) el.xpcur.textContent = fmt(prog.current);
    if (el.xpnext) el.xpnext.textContent = ' / ' + fmt(prog.needed) + ' XP';

    updateMilestones();
  }

  /* Milestones — same structure/values split as the market: built once, the
     per-second tick only touches widths/classes (no innerHTML churn). */
  function buildMilestones() {
    el.ms.innerHTML = '';
    for (const mi of Game.MILESTONES) {
      const item = document.createElement('div');
      item.className = 'ms-item';
      item.id = 'msi-' + mi.id;
      item.innerHTML =
        '<span class="ms-icon">' + mi.icon + '</span>' +
        '<div class="ms-info"><div class="ms-name">' + mi.name +
          '<span class="ms-badge" id="msb-' + mi.id + '"></span></div>' +
          '<div class="ms-bar"><div class="ms-fill" id="msf-' + mi.id + '"></div></div></div>' +
        '<span class="ms-xp" id="msx-' + mi.id + '"></span>';
      el.ms.appendChild(item);
    }
  }

  function updateMilestones() {
    if (!el.ms) return;
    if (el.ms.children.length !== Game.MILESTONES.length) buildMilestones();
    for (const mi of Game.MILESTONES) {
      const done = state.milestones.includes(mi.id);
      const item = document.getElementById('msi-' + mi.id);
      const pct = Math.min(100, Math.round((state.xp / mi.xp) * 100));
      item.classList.toggle('done', done);
      document.getElementById('msf-' + mi.id).style.width = pct + '%';
      document.getElementById('msb-' + mi.id).textContent = done ? '+' + mi.bonus + '%' : '';
      document.getElementById('msx-' + mi.id).textContent = done ? '✓' : fmt(mi.xp) + ' XP';
    }
  }

  /** Render contracts panel. */
  function buildContracts() {
    if (!el.cv) return;
    el.cv.innerHTML = '';
    for (const ct of Game.CONTRACTS) {
      const card = document.createElement('div');
      card.className = 'ct-card';
      card.id = 'ct-' + ct.id;
      card.innerHTML =
        '<div class="ct-head">' +
          '<span class="ct-icon">' + ct.icon + '</span>' +
          '<div class="ct-info">' +
            '<div class="ct-name">' + ct.name + '</div>' +
            '<div class="ct-desc">' + ct.desc + '</div>' +
          '</div>' +
          '<span class="ct-target">Niv ' + ct.unlockLevel + '+</span>' +
        '</div>' +
        '<div class="ct-progress">' +
          '<div class="ct-bar"><div class="ct-fill" id="ctf-' + ct.id + '"></div></div>' +
          '<span class="ct-pct" id="ctp-' + ct.id + '">0%</span>' +
        '</div>' +
        '<div class="ct-reward" id="ctr-' + ct.id + '"></div>' +
        '<button class="ct-btn" id="ctb-' + ct.id + '" disabled></button>';
      el.cv.appendChild(card);
    }
  }

  function updateContracts() {
    if (!el.cv) return;
    if (el.cv.children.length !== Game.CONTRACTS.length) buildContracts();
    const level = Game.levelFromXp(state.xp);
    const completed = state.contracts ? state.contracts.completed : [];
    const offered = state.contracts ? state.contracts.offered : [];
    const claimed = state.contracts ? state.contracts.claimed : [];
    for (const ct of Game.CONTRACTS) {
      const card = document.getElementById('ct-' + ct.id);
      const fill = document.getElementById('ctf-' + ct.id);
      const pctEl = document.getElementById('ctp-' + ct.id);
      const rewardEl = document.getElementById('ctr-' + ct.id);
      const btn = document.getElementById('ctb-' + ct.id);
      if (!card) continue;

      let progress = 0;
      if (ct.type === 'crafted' && ct.productId) {
        progress = state.chainStats && state.chainStats[ct.productId] ? state.chainStats[ct.productId].crafted : 0;
      } else if (ct.type === 'chain_money') {
        progress = state.contracts ? (state.contracts.chainMoneyEarned || 0) : 0;
      } else if (ct.type === 'chain_grams') {
        progress = state.contracts ? (state.contracts.chainGramsConverted || 0) : 0;
      }
      const pct = ct.target > 0 ? Math.min(100, Math.round((progress / ct.target) * 100)) : 0;
      const isCompleted = completed.includes(ct.id);
      const isOffered = offered.includes(ct.id) || isCompleted;
      const isClaimed = claimed.includes(ct.id);
      const canUnlock = level >= ct.unlockLevel;

      card.classList.toggle('locked', !canUnlock);
      card.classList.toggle('offered', isOffered && !isCompleted && !isClaimed);
      card.classList.toggle('completed', isCompleted && !isClaimed);
      if (fill) fill.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';

      if (rewardEl) {
        if (isClaimed) {
          rewardEl.textContent = '✓ Récompense récupérée : ' + ct.reward.desc;
          rewardEl.style.borderLeftColor = 'var(--gold)';
        } else if (isCompleted) {
          rewardEl.textContent = '✨ Récompense : ' + ct.reward.desc + ' — Clique pour récupérer !';
          rewardEl.style.borderLeftColor = 'var(--green)';
        } else if (isOffered) {
          rewardEl.textContent = '🎯 Objectif : ' + ct.reward.desc + ' (à ' + fmt(ct.target) + (ct.type === 'chain_money' ? ' €' : ct.type === 'chain_grams' ? 'g' : ' unités') + ')';
          rewardEl.style.borderLeftColor = 'var(--gold)';
        } else {
          rewardEl.textContent = '🔒 Se débloque au niveau ' + ct.unlockLevel;
          rewardEl.style.borderLeftColor = 'var(--border)';
        }
      }

      if (btn) {
        if (isClaimed) {
          btn.textContent = '✓ Terminé';
          btn.disabled = true;
          btn.className = 'ct-btn locked';
        } else if (isCompleted) {
          btn.textContent = '🎁 Récupérer';
          btn.disabled = false;
          btn.className = 'ct-btn claim';
          btn.onclick = () => {
            const res = Game.claimContract(state, ct.id);
            if (res.ok) {
              toast(res.contract.icon + ' Contrat accompli : ' + res.contract.reward.desc);
              // célébration : pop élastique de la carte + burst de particules
              if (card.animate) {
                card.animate(
                  [{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.35 }, { transform: 'scale(0.98)', offset: 0.7 }, { transform: 'scale(1)' }],
                  { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' }
                );
              }
              for (let i = 0; i < 3; i++) setTimeout(() => spawnParticle('🎁 ' + ct.icon + ' ' + ct.name + ' !'), i * 120);
              popNum(el.m);
            }
            refreshStats();
            save();
          };
        } else if (!canUnlock) {
          btn.textContent = '🔒 Niveau ' + ct.unlockLevel + ' requis';
          btn.disabled = true;
          btn.className = 'ct-btn locked';
        } else if (!isOffered) {
          btn.textContent = 'Non disponible';
          btn.disabled = true;
          btn.className = 'ct-btn locked';
        } else {
          btn.textContent = 'En cours... ' + fmt(progress) + ' / ' + fmt(ct.target);
          btn.disabled = true;
          btn.className = 'ct-btn locked';
        }
      }
    }
  }

  /* Maîtrise — barre de la vue Récolte bâtie dans index.html, seuls les
     textes/largeurs bougent chaque tick (in-place, zéro innerHTML). */
  function updateMastery() {
    const fill = document.getElementById('mty-fill');
    if (!fill) return;
    const sid = state.strain;
    const st = Game.getStrain(sid);
    const cap = Game.MASTERY_MAX_LEVEL || 40;
    const lvl = Game.masteryLevel ? Game.masteryLevel(state, sid) : 0;
    const xp = (state.mastery && state.mastery[sid]) || 0;
    const curT = Game.masteryXpForLevel ? Game.masteryXpForLevel(lvl) : 0;
    const nextT = Game.masteryXpForLevel ? Game.masteryXpForLevel(lvl + 1) : 0;
    const pct = lvl >= cap ? 100 : Math.min(100, ((xp - curT) / Math.max(1, nextT - curT)) * 100);
    const lbl = document.getElementById('mty-lbl');
    const lvlEl = document.getElementById('mty-lvl');
    const nextEl = document.getElementById('mty-next');
    if (lbl) lbl.textContent = '🌱 Maîtrise — ' + (st ? st.name : sid);
    if (lvlEl) lvlEl.textContent = 'Niv ' + lvl + (lvl >= cap ? ' (MAX)' : ' · +' + Math.round(lvl * 0.5) + '%');
    fill.style.width = pct + '%';
    if (nextEl) nextEl.textContent = lvl >= cap ? 'Maîtrise maxée' : fmt(Math.max(0, nextT - xp)) + ' XP';
  }

  /* Maîtrise dans la vue Variétés — lignes statiques (renderStrains), mises à
     jour in place ici quand l'onglet est visible. */
  function updateStrainMastery() {
    for (const stVar of Game.STRAINS) {
      const lvlEl = document.getElementById('stm-l-' + stVar.id);
      const fill = document.getElementById('stm-f-' + stVar.id);
      if (!lvlEl || !fill) continue;
      const cap = Game.MASTERY_MAX_LEVEL || 40;
      const lvl = Game.masteryLevel ? Game.masteryLevel(state, stVar.id) : 0;
      const xp = (state.mastery && state.mastery[stVar.id]) || 0;
      const curT = Game.masteryXpForLevel ? Game.masteryXpForLevel(lvl) : 0;
      const nextT = Game.masteryXpForLevel ? Game.masteryXpForLevel(lvl + 1) : 0;
      const pct = lvl >= cap ? 100 : Math.min(100, ((xp - curT) / Math.max(1, nextT - curT)) * 100);
      lvlEl.textContent = lvl > 0 ? 'Niv ' + lvl + ' +' + Math.round(lvl * 0.5) + '%' : '';
      fill.style.width = pct + '%';
    }
  }

  /* Achievements (vue Progression) — grille construite une fois, mise à jour
     in place (classes/textContent) à chaque tick où l'onglet est visible. */
  function buildAchievements() {
    if (!el.ach) return;
    el.ach.innerHTML = '';
    for (const a of Game.ACHIEVEMENTS) {
      const card = document.createElement('div');
      card.className = 'ach-card';
      card.id = 'ach-' + a.id;
      card.innerHTML =
        '<span class="ach-icon">' + a.icon + '</span>' +
        '<div class="ach-info"><div class="ach-name">' + a.name + '</div>' +
        '<div class="ach-desc">' + a.desc + '</div></div>' +
        '<span class="ach-bonus" id="achb-' + a.id + '"></span>';
      el.ach.appendChild(card);
    }
  }

  function updateAchievements() {
    if (!el.ach) return;
    if (el.ach.children.length !== Game.ACHIEVEMENTS.length) buildAchievements();
    const got = state.achievements || [];
    let totalBonus = 0;
    for (const a of Game.ACHIEVEMENTS) {
      const done = got.includes(a.id);
      if (done) totalBonus += a.bonus;
      const card = document.getElementById('ach-' + a.id);
      if (card) card.classList.toggle('done', done);
      const bonus = document.getElementById('achb-' + a.id);
      if (bonus) bonus.textContent = done ? '+' + a.bonus + '%' : '🔒';
    }
    if (el.achCount) {
      el.achCount.textContent = got.length + '/' + Game.ACHIEVEMENTS.length + ' débloqués · +' + totalBonus + '% de production';
    }
  }

  /** Stats de session (€/min, part idle, crits, ventes au pic) — pure lecture. */
  function updateSessionCard() {
    if (!el.sesEarned || !Game.sessionStats) return;
    const st = Game.sessionStats(state);
    el.sesEarned.textContent = '+' + fmt(st.earned) + ' €';
    el.sesPerMin.textContent = fmt(st.perMin) + ' €/min';
    el.sesIdle.textContent = Math.round(st.idleShare * 100) + '%';
    el.sesClicks.textContent = fmt(st.clicks);
    el.sesCrits.textContent = st.clicks > 0 ? st.crits + ' (' + st.critRate.toFixed(1) + '%)' : '0';
    el.sesCombo.textContent = '×' + Game.comboMultiplier(st.maxCombo).toFixed(1) + ' (' + st.maxCombo + ' clics)';
    el.sesPeaks.textContent = String(st.peakSales);
    el.sesBig.textContent = fmt(st.biggestSale) + ' €';
  }

  /** Carte streak : jour courant + bonus actif + progression vers le cap. */
  function updateStreakCard() {
    if (!el.streakLvl) return;
    const maxDays = Game.STREAK_MAX_DAYS || 10;
    const per = Game.STREAK_PER || 0.04;
    const count = (state.streak && state.streak.count) || 0;
    const mult = Game.streakMult ? Game.streakMult(state) : 1;
    const active = mult > 1;
    el.streakLvl.textContent = count > 0 ? 'Jour ' + count + (active ? '' : ' (en pause)') : 'Aucun streak';
    el.streakMult.textContent = active ? '+' + Math.round((mult - 1) * 100) + '% prod' : '+0%';
    el.streakFill.style.width = Math.min(100, (count / maxDays) * 100) + '%';
    el.streakNext.textContent = count >= maxDays ? 'Streak maxé' :
      count > 0 ? 'Reviens demain : +' + Math.round(Math.min(maxDays, count + 1) * per * 100) + '%' :
      'Joue aujourd\'hui pour démarrer';
  }

  /** Label compact d'une récompense de défi (+1.5Kg, +25K €). */
  function dailyRewardLabel(def) {
    const parts = [];
    if (def.reward.weed) parts.push('+' + fmt(def.reward.weed) + 'g');
    if (def.reward.money) parts.push('+' + fmt(def.reward.money) + ' €');
    return parts.join(' · ');
  }

  /* Défis du jour (vue Progression) — cartes construites une fois par jour,
     mises à jour in place (barres/boutons) à chaque tick où l'onglet est
     visible. Le tirage est seedé par jour : même set toute la journée. */
  let dailyBuiltDay = null;

  function buildDaily() {
    if (!el.daily || !Game.dailyForDay) return;
    Game.rollDaily(state);
    el.daily.innerHTML = '';
    for (const def of Game.dailyForDay(state.daily.day)) {
      const card = document.createElement('div');
      card.className = 'daily-card';
      card.id = 'daily-' + def.id;
      card.innerHTML =
        '<span class="daily-icon">' + def.icon + '</span>' +
        '<div class="daily-info"><div class="daily-name">' + def.name + '</div>' +
        '<div class="daily-desc">' + def.desc + ' · 🎁 ' + dailyRewardLabel(def) + '</div>' +
        '<div class="daily-bar"><div class="daily-fill" id="dailyf-' + def.id + '"></div></div></div>' +
        '<span class="daily-count" id="dailyc-' + def.id + '"></span>' +
        '<button class="daily-btn" id="dailyb-' + def.id + '">🎁</button>';
      el.daily.appendChild(card);
      card.querySelector('.daily-btn').addEventListener('click', () => {
        const res = Game.claimDaily(state, def.id);
        if (res.ok) {
          const bits = [];
          if (res.gained.weed) bits.push('+' + fmt(res.gained.weed) + 'g');
          if (res.gained.money) bits.push('+' + fmt(res.gained.money) + ' €');
          toast('📅 ' + def.name + ' : ' + bits.join(' · ') + ' !', true);
          spawnParticle('📅 ' + def.icon + ' ' + bits.join(' · ') + ' !', true);
          popNum(el.m);
          sfx.reward();
        } else if (res.reason === 'already_claimed') {
          toast('Défi déjà réclamé');
        } else {
          toast('Défi pas encore terminé');
        }
        refreshStats();
        save();
      });
    }
    dailyBuiltDay = state.daily.day;
  }

  function updateDaily() {
    if (!el.daily || !Game.dailyForDay) return;
    Game.rollDaily(state);
    if (dailyBuiltDay !== state.daily.day || el.daily.children.length !== Game.DAILY_COUNT) buildDaily();
    const done = (state.daily && state.daily.done) || [];
    const claimed = (state.daily && state.daily.claimed) || [];
    for (const def of Game.dailyForDay(state.daily.day)) {
      const p = Game.dailyProgress(state, def);
      const card = document.getElementById('daily-' + def.id);
      const fill = document.getElementById('dailyf-' + def.id);
      const count = document.getElementById('dailyc-' + def.id);
      const btn = document.getElementById('dailyb-' + def.id);
      const isDone = done.includes(def.id) || p.done;
      const isClaimed = claimed.includes(def.id);
      if (card) {
        card.classList.toggle('done', isDone);
        card.classList.toggle('claimed', isClaimed);
      }
      if (fill) fill.style.width = Math.min(100, Math.round((p.value / p.target) * 100)) + '%';
      if (count) count.textContent = fmt(p.value) + '/' + fmt(p.target);
      if (btn) {
        btn.disabled = !isDone || isClaimed;
        btn.textContent = isClaimed ? '✓' : isDone ? '🎁 Réclamer' : '🔒';
      }
    }
  }

  /** Sync every dynamic text / disabled state with `state`.
   *  Hidden views are skipped: the per-second tick only writes to the DOM the
   *  player is actually looking at (less style/layout work, smoother on mobile). */
  function refreshStats() {
    const pc = Game.perClick(state);
    const ar = Game.perSecond(state);
    const active = (name) => {
      const v = document.getElementById('v-' + name);
      return !v || v.classList.contains('active');
    };

    if (el.m) el.m.textContent = fmt(state.money) + ' €';
    if (el.ar) el.ar.textContent = '+' + ar;
    if (el.hl) el.hl.textContent = pc;
    if (el.lv) el.lv.textContent = Game.levelFromXp(state.xp); // header: always fresh

    // idle income visibility — derived from state (chainEarnRate), pas d'historique
    // qui lag derrière les achats : la valeur est EXACTE pour le flux idle et
    // réagit instantanément à chaque upgrade (testé contre autoTick).
    const earn = Game.chainEarnRate ? Game.chainEarnRate(state) : { per: {}, total: 0 };
    if (el.mps) el.mps.textContent = earn.total > 0 ? '+' + fmt(earn.total) + ' €/s idle' : '';

    // PAS de cap : le stock est libre, on affiche juste le total
    if (el.stw) el.stw.textContent = fmt(state.stock.weed) + 'g dispo';

    updateMastery();
    if (active('strains')) updateStrainMastery();

    if (active('sell')) renderMarket();
    if (active('contracts')) updateContracts();
    if (active('progress') || active('harvest')) renderProgress();
    if (active('progress')) {
      updateSessionCard();
      updateStreakCard();
      updateDaily();
      updateAchievements();
    }
    if (!active('upgrades')) return;

    // sub-tab Matériel / Chaînes : on ne met à jour que la liste visible
    if (el.upgTabs) {
      el.upgTabs.querySelectorAll('.qty-pill').forEach((b) => {
        b.classList.toggle('active', b.dataset.utab === upgTab);
      });
    }
    const showHw = upgTab === 'hw';
    if (el.ug) el.ug.hidden = !showHw;
    if (el.chainUg) el.chainUg.hidden = showHw;
    // qty pills x1/x10/MAX visibles sur les deux onglets
    if (el.upgQtyRow) {
      el.upgQtyRow.querySelectorAll('.qty-pill').forEach((b) => {
        b.classList.toggle('active', String(b.dataset.q) === String(upgradeQtyMode));
      });
    }
    if (el.upgQtyInfo) el.upgQtyInfo.textContent = showHw ? 'Paliers ×2 tous les 40' : 'Chaînes +8% flux auto/niveau · MAX = max payable';
    if (el.chainSummary) {
      if (!showHw) {
        const activeOwned = Game.AUTOMATION.filter((a) => Game.chainLvl(state, a.productId) > 0).length;
        const totalLvl = Game.PRODUCTS.reduce((s, p) => s + Game.chainLvl(state, p.id), 0);
        const totalShare = Game.distShare ? Game.distShare(state) : 0;
        const idleEst = earn.total > 0 ? '+' + fmt(earn.total) + ' €/s idle' : '';
        el.chainSummary.style.display = 'block';
        el.chainSummary.innerHTML = '<b>⚙️ ' + activeOwned + '/' + Game.AUTOMATION.length + ' chaînes</b> · Niv total ' + totalLvl + (totalShare ? ' · +' + Math.round(totalShare*100) + '% dist' : '') + (idleEst ? ' · ' + idleEst : '') + ' <span style="float:right;color:var(--gold);font-weight:800;">' + fmt(state.money) + ' €</span>';
      } else {
        el.chainSummary.style.display = 'none';
      }
    }
    if (!showHw) {
      updateChainCards();
      return;
    }
    for (const u of Game.UPGRADES) {
      const lv = state.levels[u.id] || 0;
      const tier = Game.tierMult ? Game.tierMult(lv) : 1;
      const nextTier = Game.TIER_EVERY ? Game.TIER_EVERY - (lv % Game.TIER_EVERY) : 0;
      const tierLabel = tier > 1 ? ' ×' + tier : '';
      const lvEl = document.getElementById('ul-' + u.id);
      if (lvEl) lvEl.textContent = 'Lvl ' + lv + tierLabel + (nextTier && nextTier <= 5 ? ' (' + nextTier + '→×' + (tier*2) + ')' : '');
      // quantité : 1 / 10 / MAX (max = niveaux payables d'un coup)
      let count = upgradeQtyMode;
      if (count === 'max') count = Math.max(1, Game.maxAffordableLevels(state, u.id));
      const bulk = count > 1 && Game.upgradeBulkCost ? Game.upgradeBulkCost(state, u.id, count) : Game.upgradeCost(state, u.id);
      const costEl = document.getElementById('uc-' + u.id);
      if (costEl) {
        if (bulk === Infinity) {
          costEl.textContent = 'MAX ✓';
        } else {
          const time = Game.timeToAfford ? Game.timeToAfford(state, u.id, count > 1 ? count : undefined) : 0;
          const timeLabel = time > 0 && time < 3600 ? ' (' + (time < 60 ? time + 's' : Math.ceil(time/60) + 'm') + ')' : '';
          costEl.textContent = fmt(bulk) + ' €' + timeLabel;
        }
      }
      const btn = document.getElementById('ub-' + u.id);
      const card = document.getElementById('ui-' + u.id);
      const affordable = state.money >= bulk;
      if (btn) {
        btn.disabled = !affordable;
        btn.textContent = count > 1 ? 'Acheter x' + count : 'Acheter';
      }
      if (card) card.classList.toggle('affordable', affordable);
      if (card) card.classList.toggle('tier-ready', nextTier === 1 && affordable);
    }
    document.querySelectorAll('[id^="sb-"]').forEach((b) => {
      const id = b.id.slice(3);
      const stDef = Game.getStrain(id);
      if (stDef && !state.stock.strains.includes(id)) {
        b.disabled = Game.levelFromXp(state.xp) < stDef.unlock || state.money < stDef.cost;
      }
    });
    renderProgress();
  }

  /** Chaînes (onglet dédié) : multi-niveaux — embauche puis améliorations. */
  function updateChainCards() {
    // €/s idle estimé : dérivé de state (chainEarnRate), requis ici et par
    // refreshStats — on le calcule donc dans la portée locale (pas de
    // dépendance à une variable de refreshStats, source de ReferenceError).
    const earn = Game.chainEarnRate ? Game.chainEarnRate(state) : { per: {}, total: 0 };
    for (const a of Game.AUTOMATION) {
      const lvl = Game.chainLvl(state, a.productId);
      const levelOk = lvl > 0 || Game.levelFromXp(state.xp) >= a.unlock;
      let count = upgradeQtyMode;
      if (count === 'max') count = Math.max(1, Game.maxAutomationLevels(state, a.productId));
      const cost = Game.automationCost(state, a.productId, count);
      const lv = document.getElementById('ul-' + a.id);
      if (lv) {
        const shareNow = lvl > 0 ? Game.chainShareOf(state, a.productId) : 0;
        lv.textContent = lvl > 0
          ? 'Niv ' + lvl + ' · ' + Math.round(shareNow*100) + '% flux'
          : (!levelOk ? '🔒 Niv. ' + a.unlock : 'Niv 0');
        lv.classList.toggle('owned', lvl > 0);
      }
      const btn = document.getElementById('ub-' + a.id);
      if (btn) {
        btn.disabled = !levelOk || state.money < cost;
        btn.textContent = lvl > 0 ? (count > 1 ? 'Améliorer x' + count : 'Améliorer') : 'Acheter';
      }
      const card = document.getElementById('ui-' + a.id);
      if (card) {
        card.classList.toggle('affordable', levelOk && state.money >= cost);
        card.classList.toggle('owned', lvl > 0);
      }
      const costEl = document.getElementById('uc-' + a.id);
      if (costEl) costEl.textContent = fmt(cost) + ' €';
      const bar = document.getElementById('chain-bar-' + a.id);
      if (bar) {
        const share = Game.chainShareOf ? Game.chainShareOf(state, a.productId) : 0;
        const pct = lvl > 0 ? Math.round(share / Game.CHAIN_SHARE_MAX * 100) : 0;
        bar.style.width = pct + '%';
      }
      const idleEl = document.getElementById('chain-idle-' + a.id);
      if (idleEl) {
        if (lvl > 0) {
          const share = Game.chainShareOf(state, a.productId);
          const eps = (earn.per && earn.per[a.productId]) || 0;
          const fluxPct = Math.round(share * 100);
          idleEl.textContent = eps > 0
            ? '≈ ' + fmt(eps) + ' €/s idle · ' + fluxPct + '% flux'
            : (Game.perSecond(state) > 0
              ? 'Pas encore de flux converti (coût > budget) · ' + fluxPct + '% flux'
              : 'Aucune production — achète de l\'idle · ' + fluxPct + '% flux');
        } else {
          idleEl.textContent = levelOk ? 'Prête à embaucher — idle dès le niveau 1' : '🔒 Niveau ' + a.unlock;
        }
      }
      // render specialization tree — built once, updated in place (innerHTML
      // par tick détruisait les transitions et remplaçait les boutons sous le
      // doigt : les 2e/3e achats rapides tombaient sur un nœud détaché)
      const specsEl = document.getElementById('chain-specs-' + a.id);
      if (specsEl) {
        if (lvl > 0) {
          specsEl.style.display = 'block';
          updateChainSpecs('chain-specs-' + a.id, a.productId);
        } else {
          specsEl.style.display = 'none';
        }
      }
    }
  }

  /** Specialization tree: build ONCE per chain (ids stables, handlers attachés
   *  une seule fois), puis updateChainSpecs ne touche que text/width/disabled. */
  function buildChainSpecs(containerId, productId) {
    const specs = Game.CHAIN_SPECS && Game.CHAIN_SPECS[productId];
    const specsEl = document.getElementById(containerId);
    if (!specs || !specsEl) return;
    let html = '<div style="font-size:.7rem;line-height:1.6;">';
    html += '<div id="cs-' + productId + '-ms" style="color:var(--gold);font-weight:700;margin-bottom:2px;"></div>';
    for (const [branch, def] of Object.entries(specs)) {
      const icon = branch === 'speed' ? '⚡' : branch === 'yield' ? '💎' : '📦';
      html += '<div style="display:flex;align-items:center;gap:4px;margin:2px 0;">' +
        '<span style="min-width:2.5rem;">' + icon + ' ' + def.name + '</span>' +
        '<span style="color:var(--gold);font-weight:700;min-width:2rem;" id="cs-' + productId + '-' + branch + '-count">0/' + def.max + '</span>' +
        '<div style="flex:1;height:4px;background:var(--bg);border-radius:2px;overflow:hidden;">' +
          '<div class="spec-fill" id="cs-' + productId + '-' + branch + '-fill" style="width:0%;height:100%;background:var(--accent);transition:width .2s"></div>' +
        '</div>' +
        '<button class="bb" data-spec="' + branch + '" data-pid="' + productId + '" id="cs-' + productId + '-' + branch + '-buy" style="font-size:.6rem;padding:1px 6px;"></button>' +
      '</div>';
    }
    html += '</div>';
    specsEl.innerHTML = html;
    specsEl.dataset.built = productId;
    specsEl.querySelectorAll('button[data-spec]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const branch = btn.dataset.spec;
        const pid = btn.dataset.pid;
        // impact calculé AVANT l'achat (delta €/s = avant → après)
        const impact = Game.chainSpecImpact ? Game.chainSpecImpact(state, pid, branch) : null;
        const res = Game.buyChainSpec(state, pid, branch, 1);
        if (res.ok) {
          const def = Game.CHAIN_SPECS[pid][branch];
          const impactText = impact && impact.pctText ? impact.pctText : '';
          const epsTxt = impact && impact.epsDelta > 0 ? ' (+' + fmt(impact.epsDelta) + ' €/s)' : '';
          toast('💎 ' + def.name + ' → ' + res.lvl + '/' + def.max + ' — ' + impactText + epsTxt);
          popNum(btn);
          // juice : la branche flash en doré, le compteur pop, la carte vibre,
          // une particule part exactement du bouton qui vient de payer
          const countEl = document.getElementById('cs-' + pid + '-' + branch + '-count');
          if (countEl) popNum(countEl);
          const fillEl = document.getElementById('cs-' + pid + '-' + branch + '-fill');
          if (fillEl) {
            fillEl.classList.add('spec-flash');
            setTimeout(() => fillEl.classList.remove('spec-flash'), 550);
          }
          const card = document.getElementById('ui-' + 'auto-' + pid);
          if (card) {
            card.classList.add('popping');
            card.animate && card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' });
            setTimeout(() => card.classList.remove('popping'), 400);
          }
          spawnParticle('💎 +' + res.bought + ' ' + branch, false, card || btn);
          if (el.mps) popNum(el.mps);
          if (res.lvl >= def.max) toast('💎 ' + def.name + ' maxée !', true);
        } else if (res.reason === 'funds') {
          toast('Pas assez d\'argent');
        } else if (res.reason === 'maxed') {
          toast('Branche maxée');
        } else if (res.reason === 'locked') {
          toast(res.message);
        }
        refreshStats();
        save();
      });
    });
  }

  /** Update the spec tree in place: counts, bar widths, costs, MAX state. */
  function updateChainSpecs(containerId, productId) {
    const specs = Game.CHAIN_SPECS && Game.CHAIN_SPECS[productId];
    const specsEl = document.getElementById(containerId);
    if (!specs || !specsEl) return;
    if (specsEl.dataset.built !== productId) buildChainSpecs(containerId, productId);
    const stateSpecs = state.chainSpecs && state.chainSpecs[productId] ? state.chainSpecs[productId] : {};
    for (const [branch, def] of Object.entries(specs)) {
      const cur = stateSpecs[branch] || 0;
      const maxed = cur >= def.max;
      const countEl = document.getElementById('cs-' + productId + '-' + branch + '-count');
      const fillEl = document.getElementById('cs-' + productId + '-' + branch + '-fill');
      const buyEl = document.getElementById('cs-' + productId + '-' + branch + '-buy');
      if (countEl) countEl.textContent = cur + '/' + def.max;
      if (fillEl) {
        fillEl.style.width = (cur / def.max * 100) + '%';
        fillEl.style.background = maxed ? 'var(--gold)' : 'var(--accent)';
      }
      if (buyEl) {
        if (maxed) {
          buyEl.textContent = 'MAX';
          buyEl.disabled = true;
        } else {
          const cost = Game.chainSpecCost(state, productId, branch, 1);
          buyEl.textContent = fmt(cost) + ' €';
          buyEl.disabled = state.money < cost;
        }
      }
    }
    const msEl = document.getElementById('cs-' + productId + '-ms');
    if (msEl) {
      const curMult = Game.chainMilestoneMult ? Game.chainMilestoneMult(state, productId) : 1;
      const nextMs = Game.nextChainMilestone ? Game.nextChainMilestone(state, productId) : null;
      const lvlNow = Game.chainLvl(state, productId);
      msEl.textContent = '🏁 Rendement ×' + curMult +
        (nextMs ? ' — prochain ×' + nextMs.mult + ' au niveau ' + nextMs.at + ' (' + (nextMs.at - lvlNow) + ' restants)' : ' — tous paliers maxés');
    }
  }

  // --- game actions ----------------------------------------------------------
  /** Dernier compte de combo affiché (détecte l'expiration pour cacher l'UI). */
  let lastComboCount = 0;

  /** Combo UI : pill dorée + barre de temps (scaleX compositor, WAAPI). */
  function updateComboUI(reanimateBar) {
    if (!el.comboWrap || !el.comboPill) return;
    const c = state.combo || { count: 0 };
    const count = c.count || 0;
    const active = count >= 2;
    el.comboWrap.hidden = !active;
    if (active) {
      const mult = Game.comboMultiplier(count);
      el.comboPill.textContent = count >= Game.COMBO_CAP
        ? '⚡ Combo MAX — clic ×' + mult.toFixed(1)
        : '⚡ Combo ×' + count + ' — clic ×' + mult.toFixed(1);
      if (reanimateBar && el.comboBar && el.comboBar.animate) {
        el.comboBar.animate(
          [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
          { duration: Game.COMBO_WINDOW_MS, easing: 'linear' }
        );
      }
    }
  }

  function onHarvest(ev) {
    if (ev && ev.preventDefault) { ev.preventDefault(); ev.stopPropagation(); }
    const res = Game.clickBud(state);
    lastComboCount = res.combo.count;
    if (res.crit) {
      sfx.crit();
      // 💥 Juice critique : shake plus fort que le squash, pluie d'étincelles
      // dorées + haptique — le moment rare (borné à 30 %) doit se SENTIR.
      if (el.bc.animate) {
        el.bc.animate(
          [
            { transform: 'scale(1) rotate(0deg)' },
            { transform: 'scale(1.12, 0.88) rotate(-1.6deg)', offset: 0.2 },
            { transform: 'scale(0.9, 1.12) rotate(1.6deg)', offset: 0.45 },
            { transform: 'scale(1.07, 0.96)', offset: 0.7 },
            { transform: 'scale(1) rotate(0deg)' }
          ],
          { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' }
        );
      }
      spawnParticle('💥 +' + res.added + 'g CRITIQUE !', false, undefined, 'crit');
      for (let i = 0; i < 4; i++) {
        setTimeout(() => spawnParticle('✦', false, undefined, 'crit'), 70 + i * 80);
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(30); } catch (e) { /* unsupported */ }
      }
    } else {
      // squash & stretch juice — WAAPI: compositor-driven, restarts cleanly on
      // rapid taps (each new animation replaces the previous, no forced reflow)
      if (el.bc.animate) {
        el.bc.animate(
          [
            { transform: 'scale(1, 1)' },
            { transform: 'scale(0.955, 1.045)', offset: 0.22 },
            { transform: 'scale(1.055, 0.955)', offset: 0.42 },
            { transform: 'scale(0.99, 1.015)', offset: 0.68 },
            { transform: 'scale(1, 1)' }
          ],
          { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' }
        );
      }
      spawnParticle('+' + res.added + 'g' + (res.mult > 1 ? ' · ×' + res.mult.toFixed(1) : ''));
      sfx.click();
    }
    popNum(el.stw);
    updateComboUI(true);
    if (Game.checkDaily) dailyToast(Game.checkDaily(state));
    refreshStats();
    save();
    if (res.xp.leveledUp) {
      toast('Niveau ' + res.xp.level + ' !');
      spawnParticle('⬆️ Niveau ' + res.xp.level + ' !');
      popNum(el.lv);
      const st = Game.STRAINS.find((x2) => x2.unlock === res.xp.level && !state.stock.strains.includes(x2.id));
      if (st) setTimeout(() => toast(st.name + ' débloquée ! 🎉'), 600);
    }
    for (const mi of res.xp.milestones) {
      toast(mi.icon + ' Jalon : ' + mi.name + ' (+' + mi.bonus + '%)');
    }
  }

  /* Particle pool — reused nodes in a dedicated overlay ABOVE the bud, so a
     click never dirties the bud's compositor layer (re-raster of the filtered
     SVG was the main per-tap jank). */
  const FX_POOL = [];
  let fxFloor = 0;
  function fxLayer() {
    if (el.fx) return el.fx;
    el.fx = document.createElement('div');
    el.fx.id = 'fx';
    (el.bc ? el.bc.parentElement : document.body).appendChild(el.fx);
    return el.fx;
  }
  function spawnParticle(text, warn, anchor, cls) {
    const layer = fxLayer();
    let p = FX_POOL.find((n) => !n._busy);
    if (!p) {
      if (FX_POOL.length >= 8) p = FX_POOL[fxFloor++ % 8];
      else { p = document.createElement('div'); FX_POOL.push(p); layer.appendChild(p); }
    }
    p._busy = true;
    p.className = 'click-fx' + (cls ? ' ' + cls : warn ? ' warn' : '');
    p.textContent = text;
    // anchor to the target's current rect (bud by default) — fixed particles
    // get their own compositor layers, the viewed node's layer is untouched
    const node = anchor && anchor.getBoundingClientRect ? anchor : el.bc;
    const r = node.getBoundingClientRect();
    p.style.left = Math.round(r.left + r.width * (0.5 + (Math.random() - 0.5) * 0.16)) + 'px';
    p.style.top = Math.round(r.top + r.height * 0.22) + 'px';
    if (p.animate) {
      const a = p.animate(
        [
          { opacity: 0, transform: 'translateY(8px) scale(.7)' },
          { opacity: 1, transform: 'translateY(-6px) scale(1)', offset: 0.25 },
          { opacity: 0, transform: 'translateY(-58px) scale(1.05)' }
        ],
        { duration: 700, easing: 'cubic-bezier(.2,.7,.3,1)' }
      );
      a.onfinish = () => { p._busy = false; p.style.opacity = 0; };
    } else {
      setTimeout(() => { p._busy = false; }, 700);
    }
  }

  function onCraft(productId) {
    const res = Game.craftProduct(state, productId, qtyMode === 'max' ? Infinity : qtyMode);
    const prod = Game.getProduct(productId);
    if (res.ok) {
      toast(prod.icon + ' ' + res.amount + 'x ' + prod.name + ' fabriqué' + (res.amount > 1 ? 's' : '') + ' !');
      if (el.stw) popNum(el.stw);
      sfx.buy();
      if (Game.checkDaily) dailyToast(Game.checkDaily(state));
    } else {
      toast('Pas assez de weed (' + (prod ? prod.cost + 'g' : '') + ' requis)');
    }
    refreshStats();
    save();
  }

  function onSell(type) {
    const amount = type === 'weed' && qtyMode !== 'max' ? Math.min(qtyMode, state.stock.weed || 0) : undefined;
    const gain = Game.sellStock(state, type, amount);
    if (gain > 0) {
      toast('+' + fmt(gain) + ' €');
      popNum(el.m);
    }
    // achievements: context dépendant (vente pendant une ruée)
    const now = Date.now();
    const checkTypes = type === 'all'
      ? ['weed'].concat(Game.PRODUCTS ? Game.PRODUCTS.map((p) => p.id) : [])
      : [type];
    if (Game.isSpikeActive && checkTypes.some((t) => Game.isSpikeActive(state, t, now))) {
      const awarded = Game.checkAchievements ? Game.checkAchievements(state, { spikeSale: true }) : [];
      for (const a of awarded) {
        toast('🏅 ' + a.name + ' (+' + a.bonus + '%) !');
        spawnParticle(a.icon + ' ' + a.name + ' !', true);
      }
    }
    if (Game.checkDaily) dailyToast(Game.checkDaily(state, now));
    refreshStats();
    save();
  }

  /** Arme/désarme l'alerte de prix d'un marché (feedback via le retour Game). */
  function onAlert(marketId) {
    const res = Game.setPriceAlert(state, marketId);
    if (res.ok) {
      if (res.cleared) toast('🔕 Alerte annulée');
      else toast('🔔 Alerte à ' + Math.round(res.target * 100) + '% du prix de base');
    }
    refreshStats();
    save();
  }

  function buyUpgrade(id) {
    // qty : 1 | 10 | 'max' (résolu en niveaux payables au moment du clic)
    let count = upgradeQtyMode;
    if (count === 'max') count = Math.max(1, Game.maxAffordableLevels(state, id));
    const res = count > 1 && Game.buyUpgradeBulk ? Game.buyUpgradeBulk(state, id, count) : Game.buyUpgrade(state, id);
    if (res.ok) {
      const label = res.count ? ' x' + res.count : '';
      toast(res.name + label + ' acheté !');
      popNum(el.m);
      sfx.buy();
      const card = document.getElementById('ui-' + id);
      if (card) {
        card.classList.add('popping');
        card.animate && card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        setTimeout(() => card.classList.remove('popping'), 380);
        for (let i = 0; i < Math.min(3, res.count || 1); i++) setTimeout(() => spawnParticle('✨ Niv +' + (res.count || 1) + ' !'), i * 90);
      }
    } else {
      if (res.cost) toast('Manque ' + fmt(res.cost - state.money) + ' €');
      else toast("Pas assez d'argent");
    }
    refreshStats();
    save();
  }

  /** Embauche ou améliore une chaîne (niveau +1, ou bulk/MAX) — juice inclus. */
  function buyAuto(id) {
    const a = Game.AUTOMATION.find((x) => x.id === id);
    let count = upgradeQtyMode;
    if (count === 'max') count = a ? Math.max(1, Game.maxAutomationLevels(state, a.productId)) : 1;
    const eps0 = a && Game.chainEarnRate ? (Game.chainEarnRate(state).per[a.productId] || 0) : 0;
    const multBefore = a && Game.chainMilestoneMult ? Game.chainMilestoneMult(state, a.productId) : 1;
    const res = Game.buyAutomation(state, id, count);
    if (res.ok) {
      // la stat €/s idle réagit INSTANTANÉMENT (dérivée de state) : le delta
      // affiché dans le toast est exact, pas une moyenne qui lag derrière.
      const eps1 = a && Game.chainEarnRate ? (Game.chainEarnRate(state).per[a.productId] || 0) : 0;
      const delta = eps1 - eps0;
      const deltaLabel = delta > 0 ? ' (+' + fmt(delta) + ' €/s)' : '';
      const firstHire = res.lvl <= res.bought;
      toast(firstHire
        ? res.name + ' embauchée ! 🛠️' + deltaLabel
        : res.name + ' → Niv ' + res.lvl + ' !' + deltaLabel);
      popNum(el.m);
      sfx.buy();
      const card = document.getElementById('ui-' + id);
      if (card) {
        card.classList.add('popping');
        card.animate && card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        setTimeout(() => card.classList.remove('popping'), 420);
        // halo doré court — le joueur voit QUE sa chaîne vient de vibrer
        card.classList.add('chain-juiced');
        setTimeout(() => card.classList.remove('chain-juiced'), 650);
        const lvlSpan = document.getElementById('ul-' + a.id);
        if (lvlSpan) popNum(lvlSpan);
        const bar = document.getElementById('chain-bar-' + a.id);
        if (bar) {
          bar.classList.add('flash');
          setTimeout(() => bar.classList.remove('flash'), 550);
        }
        for (let i = 0; i < Math.min(3, res.bought || 1); i++) {
          setTimeout(() => spawnParticle('⚙️ +' + (res.bought || 1) + ' Niv !', false, card), i * 90);
        }
      }
      // juice palier de chaîne (AdCap) : le rendement vient de sauter — toast
      // doré big + pluie de ✦, le head-up date la stat en parallèle
      if (a && Game.chainMilestoneMult) {
        const multAfter = Game.chainMilestoneMult(state, a.productId);
        if (multAfter > multBefore) {
          setTimeout(() => {
            toast('🏁 Palier ×' + multAfter + ' — ' + a.name + ' !', true);
            spawnParticle('🏁 ×' + multAfter + ' !', false, card);
            if (el.m) popNum(el.m);
            if (el.mps) popNum(el.mps);
            for (let i = 0; i < 4; i++) setTimeout(() => spawnParticle('✦', false, card), i * 120);
          }, 250);
        }
      }
    } else if (res.reason === 'funds') {
      toast('Manque ' + fmt((res.cost || 0) - state.money) + ' €');
    } else if (res.reason === 'level') {
      const lvlGate = a ? a.unlock : '?';
      toast('Niveau ' + lvlGate + ' requis');
    }
    refreshStats();
    save();
  }

  function equipStrain(id) {
    const res = Game.equipStrain(state, id);
    if (!res.ok) {
      if (res.reason === 'funds') toast("Pas assez d'argent");
      else if (res.reason === 'level') {
        const st = Game.getStrain(id);
        toast('Niveau ' + (st ? st.unlock : '?') + ' requis');
      }
      return;
    }
    if (res.justUnlocked) {
      toast(res.name + ' débloquée !');
      popNum(el.m);
    }
    renderBud();
    renderStrains();
    refreshStats();
    save();
  }

  /** Toast + particule pour chaque défi du jour qui vient de se terminer. */
  function dailyToast(awarded) {
    for (const def of awarded) {
      toast('📅 Défi terminé : ' + def.name + ' — réclame ta récompense !', true);
      spawnParticle('📅 ' + def.icon + ' ' + def.name + ' !', true);
    }
  }

  /** One auto-production tick (every second): weed growth, then automation. */
  function autoProduce() {
    const now = Date.now();
    // streak quotidien : idempotent — un jour nouveau démarre le bonus
    if (Game.rollStreak) streakToast(Game.rollStreak(state, now));
    // défis du jour : nouveau jour → photo des compteurs (silencieux)
    if (Game.rollDaily) Game.rollDaily(state, now);
    const spiked = Game.maybeTriggerSpike && Game.maybeTriggerSpike(state, now);
    if (spiked) {
      const prod = Game.getProduct(spiked);
      const name = prod ? prod.name : spiked === 'weed' ? 'Weed Brute' : spiked;
      toast('🔥 Ruée sur ' + name + ' ×1.6 (15s) !');
      spawnParticle('🔥 ' + name + ' ×1.6 !');
    }
    // alertes de prix : prévient dès qu'un marché armé atteint sa cible
    const firedAlerts = Game.checkPriceAlerts ? Game.checkPriceAlerts(state, now) : [];
    for (const aid of firedAlerts) {
      const ap = Game.getProduct(aid);
      const aname = ap ? ap.name : aid === 'weed' ? 'Weed Brute' : aid;
      toast('🔔 ' + aname + ' a atteint ton prix cible !');
    }
    const ar = Game.perSecond(state);
    let addedAuto = 0;
    if (ar > 0) addedAuto = Game.harvestXp(state, ar);
    const awarded = Game.checkAchievements ? Game.checkAchievements(state) : [];
    for (const a of awarded) {
      toast('🏅 ' + a.name + ' (+' + a.bonus + '%) !');
      spawnParticle(a.icon + ' ' + a.name + ' !', true);
    }
    // automation hires (Ouvriers/Dealers) craft & sell their chain's output,
    // proportionally to the AUTO flow produced this tick ONLY — the player's
    // clicked weed stays 100% theirs (click-first: jamais aspirée par les chaînes)
    const tick = Game.autoTick(state, now, addedAuto);
    // achievements: vente pendant une ruée (auto)
    if (Game.isSpikeActive && Object.keys(tick.soldMoney || {}).some((pid) => Game.isSpikeActive(state, pid, now))) {
      const awarded = Game.checkAchievements ? Game.checkAchievements(state, { spikeSale: true }) : [];
      for (const a of awarded) {
        toast('🏅 ' + a.name + ' (+' + a.bonus + '%) !');
        spawnParticle(a.icon + ' ' + a.name + ' !', true);
      }
    }
    // contrats : offre / complétion selon la progression des chaînes
    const doneContracts = Game.checkContracts ? Game.checkContracts(state) : [];
    for (const ct of doneContracts) {
      toast('📋 ' + ct.name + ' accompli — récupère ta récompense !');
    }
    // défis du jour : constat silencieux chaque seconde (toast si nouveau)
    if (Game.checkDaily) dailyToast(Game.checkDaily(state, now));
    // spoilage doux (remplace le cap) : le surplus au-dessus du plancher se dégrade
    const spoiled = Game.applySpoil ? Game.applySpoil(state) : 0;
    // juice paliers de gains totaux : chaque puissance de 10 franchie célèbre
    const earnSt = earnStep(state.totalEarned || 0);
    if (earnSt > lastEarnStep) {
      lastEarnStep = earnSt;
      toast('💰 ' + moneyWord(Math.pow(10, earnSt)) + ' de gains totaux !');
      popNum(el.m);
    }
    refreshStats();
    save();
  }

  // --- persistence -----------------------------------------------------------
  function save() {
    try {
      state.lastSeen = Date.now();
      localStorage.setItem(SAVE_KEY, Game.serialize(state));
    } catch (e) { /* quota / private mode: ignore */ }
  }

  function load() {
    try {
      state = Game.deserialize(localStorage.getItem(SAVE_KEY));
      lastEarnStep = earnStep(state.totalEarned || 0); // pas de toast au boot
      // session de jeu : volatiles (compteurs de la save jamais repris)
      if (Game.newSession) Game.newSession(state);
      // streak quotidien : marque le jour (toast si le streak progresse)
      if (Game.rollStreak) streakToast(Game.rollStreak(state));
      // défis du jour : photo des compteurs au boot (silencieux)
      if (Game.rollDaily) Game.rollDaily(state);
      // offline earnings (AdvCap 50%, 8h cap)
      if (state.lastSeen) {
        const secs = Math.floor((Date.now() - state.lastSeen) / 1000);
        if (secs > 30 && secs < 28800) {
          const off = Game.offlineTick ? Game.offlineTick(state, secs) : { weed: 0, money: 0 };
          if (off.weed > 0 || off.money > 0) {
            // achievements: gains hors-ligne (ex: 10K € en idle)
            if (Game.checkAchievements) {
              const awarded = Game.checkAchievements(state, { offlineMoney: off.money });
              for (const a of awarded) {
                setTimeout(() => toast('🏅 ' + a.name + ' (+' + a.bonus + '%) !'), 1300);
              }
            }
            setTimeout(() => toast('💤 Hors-ligne ' + Math.floor(secs/60) + 'min : +' + fmt(off.weed) + 'g +' + fmt(off.money) + '€'), 600);
          }
        }
      }
    } catch (e) {
      state = Game.defaultState();
    }
  }

  // --- navigation ------------------------------------------------------------
  function switchTab(tab) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    const target = document.getElementById('v-' + tab);
    if (target) target.classList.add('active');
    document.querySelectorAll('.tab-btn').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    refreshStats(); // the newly visible view is stale by up to one tick
  }

  // --- wiring -----------------------------------------------------------------
  // pointerdown = réponse instantanée au touch; click reste écouté pour les
  // clicks programmatiques (e2e) — le garde évite le double déclenchement souris
  let lastPointerDown = 0;
  const harvestTarget = el.bs || el.bc;
  if (harvestTarget) {
    harvestTarget.addEventListener('pointerdown', () => { lastPointerDown = Date.now(); onHarvest(new MouseEvent('tap')); });
    harvestTarget.addEventListener('click', (ev) => {
      if (Date.now() - lastPointerDown < 600) return; // déjà récolté au pointerdown
      onHarvest(ev);
    });
  }
  // clavier : le bud est focusable (role=button) → Entrée/Espace récoltent
  if (el.bc) {
    el.bc.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onHarvest(ev);
      }
    });
  }
  if (el.soundBtn) {
    const syncSoundBtn = () => {
      const on = soundEnabled();
      el.soundBtn.textContent = on ? '🔊' : '🔇';
      el.soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    syncSoundBtn();
    el.soundBtn.addEventListener('click', () => {
      const on = toggleSound();
      el.soundBtn.textContent = on ? '🔊' : '🔇';
      el.soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) sfx.click();
    });
  }
  if (el.sellAll) el.sellAll.addEventListener('click', () => onSell('all'));
  if (el.qtyRow) {
    el.qtyRow.querySelectorAll('.qty-pill').forEach((b) => {
      b.addEventListener('click', () => {
        const q = b.dataset.q;
        qtyMode = q === 'max' ? 'max' : Math.max(1, Math.floor(Number(q) || 1));
        renderMarket();
      });
    });
  }
  if (el.upgQtyRow) {
    el.upgQtyRow.querySelectorAll('.qty-pill').forEach((b) => {
      b.addEventListener('click', () => {
        const q = b.dataset.q;
        upgradeQtyMode = q === 'max' ? 'max' : Math.max(1, Math.floor(Number(q) || 1));
        refreshStats();
      });
    });
  }
  if (el.upgTabs) {
    el.upgTabs.querySelectorAll('.qty-pill').forEach((b) => {
      b.addEventListener('click', () => {
        upgTab = b.dataset.utab === 'chains' ? 'chains' : 'hw';
        refreshStats();
      });
    });
  }

  document.querySelectorAll('.tab-btn').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  let rbTimer = null;
  function disarmReset() {
    clearTimeout(rbTimer);
    rbTimer = null;
    el.rb.classList.remove('armed');
    el.rb.textContent = 'Recommencer la progression';
  }
  el.rb.addEventListener('click', () => {
    if (!rbTimer) {
      el.rb.classList.add('armed');
      el.rb.textContent = '⚠ Confirmer la remise à zéro';
      if (el.rb.animate) {
        el.rb.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
          { duration: 220, easing: 'cubic-bezier(.34,1.56,.64,1)' }
        );
      }
      toast('Reclique pour tout effacer !');
      rbTimer = setTimeout(disarmReset, 4000);
      return;
    }
    disarmReset();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    state = Game.defaultState();
    lastEarnStep = 0;
    if (Game.newSession) Game.newSession(state);
    renderBud();
    renderUpgrades();
    renderStrains();
    switchTab('harvest');
    refreshStats();
    updateComboUI(false);
    save();
    toast('Nouvelle partie, bon courage 🌱');
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space' && !ev.repeat && document.activeElement.tagName !== 'BUTTON') {
      ev.preventDefault();
      onHarvest(ev);
    }
  });

  // --- boot --------------------------------------------------------------------
  renderUpgrades();
  load();
  Game.checkAchievements ? Game.checkAchievements(state) : null;
  renderStrains();
  renderBud();
  updateComboUI(false);
  lastComboCount = (state.combo && state.combo.count) || 0;
  // expiration du combo : reset silencieux côté game, l'UI suit le delta
  setInterval(() => {
    const count = Game.comboNow(state).count;
    if (count !== lastComboCount) {
      lastComboCount = count;
      updateComboUI(false);
      if (count === 0) save();
    }
  }, 250);
  setInterval(autoProduce, 1000);
  setInterval(save, 10000);
  refreshStats();
  // deep link: manifest shortcuts & PWA open ?tab=sell|upgrades|strains…
  const wanted = new URLSearchParams(location.search).get('tab');
  if (wanted && document.getElementById('v-' + wanted)) switchTab(wanted);
  setTimeout(() => toast('Clique sur le bud !'), 400);
})();
