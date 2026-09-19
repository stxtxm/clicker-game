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
    sesClicks: document.getElementById('ses-clicks'),
    sesCombo: document.getElementById('ses-combo'),
    daily: document.getElementById('daily'),
    streakLvl: document.getElementById('streak-lvl'),
    streakMult: document.getElementById('streak-mult'),
    streakFill: document.getElementById('streak-fill'),
    streakNext: document.getElementById('streak-next'),
    coach: document.getElementById('coach'),
    coachTitle: document.getElementById('coach-title'),
    coachText: document.getElementById('coach-text'),
    coachStep: document.getElementById('coach-step'),
    coachSkip: document.getElementById('coach-skip'),
    coachReplay: document.getElementById('coach-replay')
  };

  let state = Game.defaultState();

  /** Quantity preset for market craft/sell actions: 1, 10, 100 or 'max'. */
  let qtyMode = 1;
  let upgradeQtyMode = 1;
  /** Active sub-tab in the Upgrades view: 'hw' (matériel) | 'chains'. */
  let upgTab = 'hw';
  /** Onglet visible (cache) : évite getElementById('v-…') à chaque refresh. */
  let activeTab = 'harvest';
  /** Dernier achievement notifié côté autoTick (anti-spam : 1 seul toast). */
  let lastAutoAchId = null;

  /** Dernier toast d'erreur (funds/level/locked) : throttle global anti-spam. */
  let lastErrToast = 0;
  /** Dernier popNum par nœud : throttle 150 ms (spam-clic mobile). */
  let lastPopAt = 0;
  /** Dernier bip clic : throttle 60 ms. */
  let lastClickSfx = 0;
  /** Save debounce : pas d'écriture localStorage à chaque clic. */
  let saveTimer = 0;

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
    const mc = el.mc;
    if (!mc) return;
    const last = mc.lastElementChild;
    if (last && last.textContent === text) {
      clearTimeout(last._timer);
      last._timer = setTimeout(() => { if (last.parentNode) last.remove(); }, 1200);
      return;
    }
    /* max 1 toast à la fois — plus discret, moins de spam */
    if (mc.firstElementChild) mc.firstElementChild.remove();
    const m = document.createElement('div');
    m.className = 'ms' + (big ? ' big' : '');
    m.textContent = text;
    mc.appendChild(m);
    m._timer = setTimeout(() => { if (m.parentNode) m.remove(); }, 900);
  }

  /** Toast erreur throttled : 1,5 s min entre deux (anti-spam mobile). */
  function errToast(text) {
    const now = Date.now();
    if (now - lastErrToast < 1500) return;
    lastErrToast = now;
    toast(text);
  }
  /** Re-trigger the "pop" animation (WAAPI, throttled 150 ms). */
  function popNum(node) {
    if (!node || !node.animate) return;
    const now = Date.now();
    if (now - lastPopAt < 150) return;
    lastPopAt = now;
    node.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }],
      { duration: 80, easing: 'ease-out' }
    );
  }

  /**
   * Toast de streak (jour 4+ seulement — les jours 2-3, c'est trop de notifications).
   * Sur mobile, on limite encore plus : jour 6+ seulement pour éviter le spam.
   */
  function streakToast(roll) {
    if (roll && roll.rolled && roll.count >= 6) {
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
    click: () => {
      const now = Date.now();
      if (now - lastClickSfx < 60) return;
      lastClickSfx = now;
      beep(520, 0.05, 'triangle', 0.05);
    },
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
    el.bs.innerHTML = '<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">' + svg + '</svg>';
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
      card.querySelector('.bb').addEventListener('click', function () { buyUpgrade(u.id); });
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
      card.querySelector('.bb').addEventListener('click', function () { buyAuto(a.id); });
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
      '<div class="mc-stock" id="ms-weed"></div>' +
      '<div class="mc-actions">' +
        '<button class="mc-btn sell" data-p="weed" id="mb-weed"></button>' +
      '</div>';
    el.marketGrid.appendChild(weed);
    document.getElementById('mb-weed').addEventListener('click', () => onSell('weed'));
    // Product cards
    for (const p of Game.PRODUCTS) {
      const card = document.createElement('div');
      card.className = 'market-card';
      card.id = 'mk-' + p.id;
      card.innerHTML =
                '<div class="mc-top"><div class="mc-title">' + p.icon + ' ' + p.name + '<span class="mc-qty" id="mq-' + p.id + '"></span></div><div class="mc-price" id="mp-' + p.id + '"></div></div>' +
        '<div class="mc-stock" id="ms-' + p.id + '"></div>' +
        '<div class="mc-actions">' +
          '<button class="mc-btn craft" data-p="' + p.id + '" id="mbc-' + p.id + '"></button>' +
          '<button class="mc-btn sell" data-p="' + p.id + '" id="mbs-' + p.id + '"></button>' +
        '</div>';
      card.querySelector('.craft').addEventListener('click', () => onCraft(p.id));
      card.querySelector('.sell').addEventListener('click', () => onSell(p.id));
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
    }

    // Product values
    for (const p of Game.PRODUCTS) {
      const locked = level < p.unlock;
            const card = document.getElementById('mk-' + p.id);
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
            refreshStats();
            saveSoon(1000);
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

  /** Stats de session (gains, rythme, clics, combo max) — pure lecture. */
  function updateSessionCard() {
    if (!el.sesEarned || !Game.sessionStats) return;
    const st = Game.sessionStats(state);
    el.sesEarned.textContent = '+' + fmt(st.earned) + ' €';
    el.sesPerMin.textContent = fmt(st.perMin) + ' €/min';
    el.sesClicks.textContent = fmt(st.clicks);
    el.sesCombo.textContent = '×' + Game.comboMultiplier(st.maxCombo).toFixed(1) + ' (' + st.maxCombo + ' clics)';
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
          sfx.reward();
        }
        refreshStats();
        saveSoon(1000);
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
  /** Refresh leger du clic : header + stock + mastery + coach uniquement.
   *  Evite le tick complet (market/upgrades/progress) a chaque tap mobile. */
  function refreshHarvestLite() {
    if (el.m) el.m.textContent = fmt(state.money) + " €";
    if (el.ar) el.ar.textContent = "+" + Game.perSecond(state);
    if (el.hl) el.hl.textContent = Game.perClick(state);
    if (el.lv) el.lv.textContent = Game.levelFromXp(state.xp);
    if (el.stw) el.stw.textContent = fmt(state.stock.weed) + "g dispo";
    updateMastery();
    updateCoach();
  }
  function refreshStats() {
    const pc = Game.perClick(state);
    const ar = Game.perSecond(state);
    const active = (name) => name === activeTab;

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

    if (active('harvest')) updateMastery();
    if (active('strains')) updateStrainMastery();

    if (active('sell')) renderMarket();
    if (active('contracts')) updateContracts();
    if (active('progress')) {
      renderProgress();
      updateSessionCard();
      updateStreakCard();
      updateDaily();
      updateAchievements();
    }
    updateCoach();
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
        // spans stables : textContent only, zéro innerHTML (structure built once)
        const csOwned = document.getElementById('cs-owned');
        const csTotal = document.getElementById('cs-total');
        const csDist = document.getElementById('cs-dist');
        const csIdle = document.getElementById('cs-idle');
        const csMoney = document.getElementById('cs-money');
        if (csOwned) csOwned.textContent = activeOwned + '/' + Game.AUTOMATION.length;
        if (csTotal) csTotal.textContent = totalLvl;
        if (csDist) {
          if (totalShare > 0) { csDist.style.display = ''; csDist.textContent = ' · +' + Math.round(totalShare*100) + '% dist'; }
          else csDist.style.display = 'none';
        }
        if (csIdle) csIdle.textContent = idleEst ? ' · ' + idleEst : '';
        if (csMoney) csMoney.textContent = fmt(state.money) + ' €';
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

        } else if (res.reason === 'funds') {
          errToast('Pas assez d\'argent');
        } else if (res.reason === 'maxed') {
          errToast('Branche maxée');
        } else if (res.reason === 'locked') {
          errToast(res.message);
        }
        refreshStats();
        saveSoon(1000);
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

  /** Combo UI : pill dorée statique (la barre temporelle est supprimée —
      zoom textuel du multiplicateur suffit, 1 textContent par clic). */
  function updateComboUI() {
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
    }
  }

  function onHarvest(ev) {
    if (ev && ev.preventDefault) { ev.preventDefault(); ev.stopPropagation(); }
    const res = Game.clickBud(state);
    lastComboCount = res.combo.count;
    if (res.crit) {
      sfx.crit();
      // 1 seul bounce (crit ≈ normal) — le texte suffit, pas de rotation coûteuse
      if (el.bc.animate) {
        el.bc.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(0.96, 1.04)', offset: 0.3 },
            { transform: 'scale(1)' }
          ],
          { duration: 160, easing: 'ease-out' }
        );
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(20); } catch (e) { /* unsupported */ }
      }
    } else {
      // squash & stretch simplifié : 1 bounce au lieu de 5 keyframes
      if (el.bc.animate) {
        el.bc.animate(
          [
            { transform: 'scale(1, 1)' },
            { transform: 'scale(0.96, 1.04)', offset: 0.3 },
            { transform: 'scale(1, 1)' }
          ],
          { duration: 160, easing: 'ease-out' }
        );
      }
      // feedback visuel uniquement si combo actif (mult > 1) — clics simples sont silencieux
      sfx.click();
    }
    popNum(el.stw);
    updateComboUI();
    refreshHarvestLite();
    saveSoon();
    if (res.xp.leveledUp) {
      const st = Game.STRAINS.find((x2) => x2.unlock === res.xp.level && !state.stock.strains.includes(x2.id));
      toast(st ? 'Niveau ' + res.xp.level + ' — ' + st.name + ' débloquée ! 🎉' : 'Niveau ' + res.xp.level + ' !');
      popNum(el.lv);
    }
  }

  function onCraft(productId) {
    const res = Game.craftProduct(state, productId, qtyMode === 'max' ? Infinity : qtyMode);
    const prod = Game.getProduct(productId);
    if (res.ok) {
      if (el.stw) popNum(el.stw);
      sfx.buy();
    } else {
      errToast('Pas assez de weed (' + (prod ? prod.cost + 'g' : '') + ' requis)');
    }
    refreshStats();
    saveSoon(1000);
  }

  function onSell(type) {
    const amount = type === 'weed' && qtyMode !== 'max' ? Math.min(qtyMode, state.stock.weed || 0) : undefined;
    const gain = Game.sellStock(state, type, amount);
    if (gain > 0) {
      popNum(el.m);
    }
    // achievements : comptabilisés dans autoProduce (tick/sec)
    refreshStats();
    saveSoon(1000);
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
    } else {
      if (res.cost) errToast('Manque ' + fmt(res.cost - state.money) + ' €');
      else errToast("Pas assez d'argent");
    }
    refreshStats();
    saveSoon(1000);
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
      if (firstHire) toast(res.name + ' embauchée ! 🛠️' + deltaLabel);
      popNum(el.m);
      sfx.buy();
      if (a && Game.chainMilestoneMult) {
        const multAfter = Game.chainMilestoneMult(state, a.productId);
        if (multAfter > multBefore) {
          setTimeout(() => {
            toast('🏁 Palier ×' + multAfter + ' — ' + a.name + ' !', true);
            if (el.m) popNum(el.m);
            if (el.mps) popNum(el.mps);
          }, 200);
        }
      }
    } else if (res.reason === 'funds') {
      errToast('Manque ' + fmt((res.cost || 0) - state.money) + ' €');
    } else if (res.reason === 'level') {
      const lvlGate = a ? a.unlock : '?';
      errToast('Niveau ' + lvlGate + ' requis');
    }
    refreshStats();
    saveSoon(1000);
  }

  function equipStrain(id) {
    const res = Game.equipStrain(state, id);
    if (!res.ok) {
      if (res.reason === 'funds') errToast("Pas assez d'argent");
      else if (res.reason === 'level') {
        const st = Game.getStrain(id);
        errToast('Niveau ' + (st ? st.unlock : '?') + ' requis');
      }
      return;
    }
    renderBud();
    renderStrains();
    refreshStats();
    saveSoon(1000);
  }

  /** One second tick: grow, automate, then notify only once per tick. */
  function autoProduce() {
    const now = Date.now();
    /* streak : un seul toast à la progression réelle (jour 4+ seulement) */
    if (Game.rollStreak) streakToast(Game.rollStreak(state, now));
    /* défis du jour : photo silencieuse (le déclenchement du défi proprement dit
       reste une action joueur dans onClaimDaily, donc aucun toast auto) */
    if (Game.rollDaily) Game.rollDaily(state, now);
    if (Game.maybeTriggerSpike) Game.maybeTriggerSpike(state, now);
    // alertes de prix : check silencieux (retire les alertes armées de l'état)
    if (Game.checkPriceAlerts) Game.checkPriceAlerts(state, now);
    const ar = Game.perSecond(state);
    let addedAuto = 0;
    if (ar > 0) addedAuto = Game.harvestXp(state, ar);
    // autoTick
    const tick = Game.autoTick(state, now, addedAuto);
    // achievements + contrats : 2 toasts max par tick, jamais doublons
    const spikeActive = Game.isSpikeActive && Object.keys(tick.soldMoney || {}).some((pid) => Game.isSpikeActive(state, pid, now));
    const awarded = Game.checkAchievements ? Game.checkAchievements(state, spikeActive ? { spikeSale: true } : undefined) : [];
    if (awarded.length > 0) {
      const a = awarded[awarded.length - 1];
      if (lastAutoAchId !== a.id) { lastAutoAchId = a.id; toast('🏅 ' + a.name + ' !', true); }
    }
    if (Game.checkContracts) Game.checkContracts(state);
    // spoilage doux (remplace le cap)
    const spoiled = Game.applySpoil ? Game.applySpoil(state) : 0;
    if (!document.hidden) refreshStats();
    saveSoon(5000);
  }

  // --- persistence -----------------------------------------------------------
  function save() {
    try {
      state.lastSeen = Date.now();
      localStorage.setItem(SAVE_KEY, Game.serialize(state));
    } catch (e) { /* quota / private mode: ignore */ }
  }

  /** Save debounce : regroupe les ecritures localStorage (clic = pas d I/O). */
  function saveSoon(delay) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, delay === undefined ? 2000 : delay);
  }
  function load() {
    try {
      state = Game.deserialize(localStorage.getItem(SAVE_KEY));
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
            if (Game.checkAchievements) Game.checkAchievements(state, { offlineMoney: off.money });
            setTimeout(() => toast('💤 Hors-ligne ' + Math.floor(secs/60) + 'min : +' + fmt(off.weed) + 'g +' + fmt(off.money) + '€'), 600);
          }
        }
      }
    } catch (e) {
      state = Game.defaultState();
    }
  }

  // --- onboarding (coach marks) ------------------------------------------------
  /** Cible mise en avant par étape : le bud, puis les onglets à visiter. */
  const COACH_TARGETS = { click: '#bc', sell: '.tab-btn[data-tab="sell"]', upgrade: '.tab-btn[data-tab="upgrades"]' };
  let coachTargetEl = null;
  let coachStepShown = -1;

  function clearCoachTarget() {
    if (coachTargetEl) coachTargetEl.classList.remove('coach-target');
    coachTargetEl = null;
  }

  /** Rend le coach depuis les progrès réels (appelé à chaque refreshStats). */
  function updateCoach() {
    if (!el.coach) return;
    const res = Game.checkOnboarding(state);
    if (res.done) {
      if (!el.coach.hidden) {
        el.coach.hidden = true;
        clearCoachTarget();
        coachStepShown = -1;
      }
      if (res.advanced) saveSoon(1000);
      return;
    }
    const step = Game.ONBOARDING_STEPS[res.step];
    if (el.coach.hidden) el.coach.hidden = false;
    if (el.coachTitle.textContent !== step.title) el.coachTitle.textContent = step.title;
    if (el.coachText.textContent !== step.text) el.coachText.textContent = step.text;
    const label = (res.step + 1) + '/' + Game.ONBOARDING_STEPS.length;
    if (el.coachStep.textContent !== label) el.coachStep.textContent = label;
    if (coachStepShown !== res.step) {
      coachStepShown = res.step;
      clearCoachTarget();
      const sel = COACH_TARGETS[step.id];
      coachTargetEl = sel ? document.querySelector(sel) : null;
      if (coachTargetEl) coachTargetEl.classList.add('coach-target');
    }
  }

  // --- navigation ------------------------------------------------------------
  function switchTab(tab) {
    activeTab = tab;
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

  function skipCoach() {
    Game.skipOnboarding(state);
    updateCoach();
    saveSoon(1000);
  }
  if (el.coachSkip) el.coachSkip.addEventListener('click', skipCoach);
  if (el.coach) el.coach.addEventListener('click', skipCoach);
  if (el.coachReplay) {
    el.coachReplay.addEventListener('click', () => {
      Game.restartOnboarding(state);
      coachStepShown = -1;
      switchTab('harvest');
      updateCoach();
      saveSoon(1000);
    });
  }

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
      rbTimer = setTimeout(disarmReset, 4000);
      return;
    }
    disarmReset();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    state = Game.defaultState();
    coachStepShown = -1;
    if (Game.newSession) Game.newSession(state);
    renderBud();
    renderUpgrades();
    renderStrains();
    switchTab('harvest');
    refreshStats();
    updateComboUI();
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
  updateComboUI();
  lastComboCount = (state.combo && state.combo.count) || 0;
  // expiration du combo : reset silencieux côté game, l'UI suit le delta
  setInterval(() => {
    const count = Game.comboNow(state).count;
    if (count !== lastComboCount) {
      lastComboCount = count;
      updateComboUI();
      if (count === 0) saveSoon(2000);
    }
  }, 250);
  setInterval(autoProduce, 1000);
  setInterval(save, 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  refreshStats();
  // deep link: manifest shortcuts & PWA open ?tab=sell|upgrades|strains…
  const wanted = new URLSearchParams(location.search).get('tab');
  if (wanted && document.getElementById('v-' + wanted)) switchTab(wanted);
  // coach overlay : déjà affiché en premier plan au premier run, pas de toast doublon
})();
