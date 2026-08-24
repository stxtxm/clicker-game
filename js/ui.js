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
    marketGrid: document.getElementById('market-grid'),
    sellAll: document.getElementById('sell-all'),
    qtyRow: document.getElementById('qty-row'),
    bc: document.getElementById('bc'),
    mc: document.getElementById('mc'),
    bs: document.getElementById('bs'),
    sb: document.getElementById('sb'),
    headerLogo: document.getElementById('header-bud-logo'),
    ug: document.getElementById('ug'),
    sv: document.getElementById('sv'),
    fw: document.getElementById('full-warn'),
    mps: document.getElementById('mps'),
    xplv: document.getElementById('xplv'),
    xpmult: document.getElementById('xpmult'),
    xpf: document.getElementById('xpf'),
    xpcur: document.getElementById('xpcur'),
    xpnext: document.getElementById('xpnext'),
    ms: document.getElementById('ms'),
    rb: document.getElementById('rb')
  };

  let state = Game.defaultState();

  /** Quantity preset for market craft/sell actions: 1, 10, 100 or 'max'. */
  let qtyMode = 1;

  /**
   * Stock-full banner arming: hidden at launch even with a full save — it only
   * appears after the player's first bud click (i.e. when clicking starts to
   * matter), then stays driven by the near-cap threshold.
   */
  let fullBannerArmed = false;
  let fullBannerShown = false;

  /** Animated show/hide of the stock-full banner (compositor-only props). */
  function setFullBanner(show) {
    if (!el.fw || show === fullBannerShown) return;
    fullBannerShown = show;
    if (!el.fw.animate) { el.fw.hidden = !show; return; }
    if (show) {
      el.fw.hidden = false;
      el.fw.animate(
        [
          { opacity: 0, transform: 'translateY(-14px) scale(.96)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ],
        { duration: 300, easing: 'cubic-bezier(.34,1.4,.64,1)' }
      );
    } else {
      const out = el.fw.animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(-10px)' }
        ],
        { duration: 180, easing: 'ease-out' }
      );
      out.onfinish = () => { el.fw.hidden = true; };
    }
  }

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
   */
  function toast(text) {
    const last = el.mc.lastElementChild;
    if (last && last.textContent === text) {
      clearTimeout(last._timer);
      last._timer = setTimeout(() => { if (last.parentNode) last.remove(); }, 2200);
      return;
    }
    const m = document.createElement('div');
    m.className = 'ms';
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
    el.ug.innerHTML = '';
    for (const u of Game.UPGRADES) {
      const card = document.createElement('div');
      card.className = 'upgrade';
      card.id = 'ui-' + u.id;
      card.innerHTML =
        '<span class="up-icon">' + u.icon + '</span>' +
        '<div class="up-info"><div class="up-name">' + u.name +
          ' <span class="up-level" id="ul-' + u.id + '">Lvl 0</span></div>' +
          '<div class="up-desc">' + u.desc + '</div></div>' +
        '<div class="up-buy"><span class="up-cost" id="uc-' + u.id + '">0 €</span>' +
          '<button class="bb" id="ub-' + u.id + '">Acheter</button></div>';
      card.querySelector('.bb').addEventListener('click', () => buyUpgrade(u.id));
      el.ug.appendChild(card);
    }
    // Automation hires — same .upgrade card format, one-time purchase
    for (const a of Game.AUTOMATION) {
      const p = Game.getProduct(a.productId);
      const card = document.createElement('div');
      card.className = 'upgrade';
      card.id = 'ui-' + a.id;
      card.innerHTML =
        '<span class="up-icon">' + (p ? p.icon : a.icon) + '</span>' +
        '<div class="up-info"><div class="up-name">' + a.name +
          ' <span class="up-level" id="ul-' + a.id + '">Unique</span></div>' +
          '<div class="up-desc">' + a.desc + '</div></div>' +
        '<div class="up-buy"><span class="up-cost" id="uc-' + a.id + '">' + fmt(a.cost) + ' €</span>' +
          '<button class="bb" id="ub-' + a.id + '">Acheter</button></div>';
      card.querySelector('.bb').addEventListener('click', () => buyAuto(a.id));
      el.ug.appendChild(card);
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
          '<div class="st-desc">' + st.desc + ' (x' + st.yieldMult + ' rendement, x' + st.priceMult + ' prix)</div></div>' +
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
      '<div class="mc-actions"><button class="mc-btn sell" data-p="weed" id="mb-weed"></button></div>';
    weed.querySelector('button').addEventListener('click', () => onSell('weed'));
    el.marketGrid.appendChild(weed);
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
      document.getElementById('mp-weed').innerHTML = trendArrow('weed', now) + ' ' + unit + ' €/g';
      document.getElementById('ms-weed').textContent = fmt(have) + 'g disponibles';
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
      priceEl.innerHTML = trendArrow(p.id, now) + ' ' + unit + ' €/u';
      stockEl.textContent = fmt(have) + ' dispo — ' + p.cost + 'g → 1u (' + p.desc + ')';
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
    const prog = Game.xpProgress(state.xp);
    const mult = Game.productionMult(state);
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

    const cap = Game.maxWeedStorage(state);
    // 97% threshold (not exact cap): owned chains drain a few g/s continuously,
    // so the stock hovers just under the cap while clicks are still wasted —
    // the banner must stay up for the player to reach the Marché.
    const isFull = (state.stock.weed || 0) >= cap * 0.97;
    if (el.stw) {
      el.stw.textContent = fmt(state.stock.weed) + ' / ' + fmt(cap) + 'g';
      el.stw.parentElement?.classList.toggle('full', isFull);
    }
    // storage-full feedback: pulsing bud + clickable warning banner
    if (el.bc) el.bc.classList.toggle('storage-full', isFull);
    setFullBanner(fullBannerArmed && isFull);

    if (active('sell')) renderMarket();
    if (active('progress') || active('harvest')) renderProgress();
    if (!active('upgrades')) return;

    for (const u of Game.UPGRADES) {
      const lv = document.getElementById('ul-' + u.id);
      if (lv) lv.textContent = 'Lvl ' + state.levels[u.id];
      const cost = document.getElementById('uc-' + u.id);
      if (cost) cost.textContent = fmt(Game.upgradeCost(state, u.id)) + ' €';
      const btn = document.getElementById('ub-' + u.id);
      const card = document.getElementById('ui-' + u.id);
      const affordable = state.money >= Game.upgradeCost(state, u.id);
      if (btn) btn.disabled = !affordable;
      if (card) card.classList.toggle('affordable', affordable);
    }
    // automation hires: one-time purchase; legacy saves may hold a single
    // craft/sell flag — show ✓ Actif as soon as one is set, allow completing
    for (const a of Game.AUTOMATION) {
      const hasCraft = Game.hasAuto(state, 'craft', a.productId);
      const hasSell = Game.hasAuto(state, 'sell', a.productId);
      const anyOwned = hasCraft || hasSell;
      const levelOk = Game.levelFromXp(state.xp) >= a.unlock;
      const lv = document.getElementById('ul-' + a.id);
      if (lv) {
        lv.textContent = anyOwned ? '✓ Actif' : (!levelOk ? '🔒 Niv. ' + a.unlock : 'Unique');
        lv.classList.toggle('owned', anyOwned);
      }
      const btn = document.getElementById('ub-' + a.id);
      if (btn) btn.disabled = (hasCraft && hasSell) || !levelOk || state.money < a.cost;
      const card = document.getElementById('ui-' + a.id);
      if (card) card.classList.toggle('affordable', !(hasCraft && hasSell) && levelOk && state.money >= a.cost);
      if (card) card.classList.toggle('owned', anyOwned);
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

  // --- game actions ----------------------------------------------------------
  /** Timestamp of the last "stock plein" toast (throttle: 1 per 2.5s max). */
  let lastFullToast = 0;
  /** Grams produced by clicks since the last automation tick (chain flow). */
  let clickFlow = 0;

  function onHarvest(ev) {
    if (ev && ev.preventDefault) { ev.preventDefault(); ev.stopPropagation(); }
    fullBannerArmed = true; // from now on the banner may show (first interaction)
    const ac = Game.perClick(state);
    const added = Game.harvestXp(state, ac);
    clickFlow += added; // chains only process grams that actually entered storage
    const full = added < ac;
    if (full && Date.now() - lastFullToast > 2500) {
      toast('Stock plein ! Vends ou agrandis 📦');
      lastFullToast = Date.now();
    }
    const xp = Game.xpProgress(state.xp); // refreshed after harvestXp above
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
    if (added > 0) {
      spawnParticle('+' + ac + 'g');
      popNum(el.stw);
    } else {
      // storage capped: red feedback instead of a fake gain
      spawnParticle('Plein !', true);
      popNum(el.stw);
    }
    refreshStats();
    save();
    if (xp.leveledUp) {
      toast('Niveau ' + xp.level + ' !');
      const st = Game.STRAINS.find((x2) => x2.unlock === xp.level && !state.stock.strains.includes(x2.id));
      if (st) setTimeout(() => toast(st.name + ' débloquée ! 🎉'), 600);
    }
    for (const mi of xp.milestones) {
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
  function spawnParticle(text, warn) {
    const layer = fxLayer();
    let p = FX_POOL.find((n) => !n._busy);
    if (!p) {
      if (FX_POOL.length >= 8) p = FX_POOL[fxFloor++ % 8];
      else { p = document.createElement('div'); FX_POOL.push(p); layer.appendChild(p); }
    }
    p._busy = true;
    p.className = 'click-fx' + (warn ? ' warn' : '');
    p.textContent = text;
    // anchor to the bud's current rect (fixed particles get their own
    // compositor layers — the bud's layer is never invalidated by them)
    const r = el.bc.getBoundingClientRect();
    p.style.left = Math.round(r.left + r.width * (0.5 + (Math.random() - 0.5) * 0.16)) + 'px';
    p.style.top = Math.round(r.top + r.height * 0.18) + 'px';
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
    refreshStats();
    save();
  }

  function buyUpgrade(id) {
    const res = Game.buyUpgrade(state, id);
    if (res.ok) {
      toast(res.name + ' acheté !');
      popNum(el.m);
    } else {
      toast("Pas assez d'argent");
    }
    refreshStats();
    save();
  }

  /** Buy a one-time automation hire (Ouvrier/Dealer). */
  function buyAuto(id) {
    const res = Game.buyAutomation(state, id);
    if (res.ok) {
      toast(res.name + ' embauché ! 🛠️');
      popNum(el.m);
    } else if (res.reason === 'funds') {
      toast("Pas assez d'argent");
    } else if (res.reason === 'level') {
      const a = Game.AUTOMATION.find((x) => x.id === id);
      toast('Niveau ' + (a ? a.unlock : '?') + ' requis');
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

  /** One auto-production tick (every second): weed growth, then automation. */
  function autoProduce() {
    const ar = Game.perSecond(state);
    let addedAuto = 0;
    if (ar > 0) addedAuto = Game.harvestXp(state, ar);
    // automation hires (Ouvriers/Dealers) craft & sell owned products,
    // proportionally to what actually entered storage this tick — at cap
    // they pause instead of draining the player's pile
    const tick = Game.autoTick(state, undefined, addedAuto + clickFlow);
    clickFlow = 0;
    // idle income visibility: what the dealers just paid, shown as €/s
    if (el.mps) {
      const earned = Object.values(tick.soldMoney || {}).reduce((a, b) => a + b, 0);
      el.mps.textContent = earned > 0 ? '+' + fmt(earned) + ' €/s' : '';
    }
    refreshStats();
    save();
  }

  // --- persistence -----------------------------------------------------------
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, Game.serialize(state));
    } catch (e) { /* quota / private mode: ignore */ }
  }

  function load() {
    try {
      state = Game.deserialize(localStorage.getItem(SAVE_KEY));
    } catch (e) {
      state = Game.defaultState();
    }
  }

  // --- navigation ------------------------------------------------------------
  function switchTab(tab) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    const target = document.getElementById('v-' + tab);
    if (target) target.classList.add('active');
    document.querySelectorAll('.tab-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.tab === tab));
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
  if (el.sellAll) el.sellAll.addEventListener('click', () => onSell('all'));
  if (el.fw) el.fw.addEventListener('click', () => switchTab('sell'));
  if (el.qtyRow) {
    el.qtyRow.querySelectorAll('.qty-pill').forEach((b) => {
      b.addEventListener('click', () => {
        const q = b.dataset.q;
        qtyMode = q === 'max' ? 'max' : Math.max(1, Math.floor(Number(q) || 1));
        renderMarket();
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
    renderBud();
    renderUpgrades();
    renderStrains();
    switchTab('harvest');
    refreshStats();
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
  renderStrains();
  renderBud();
  setInterval(autoProduce, 1000);
  setInterval(save, 10000);
  refreshStats();
  // deep link: manifest shortcuts & PWA open ?tab=sell|upgrades|strains…
  const wanted = new URLSearchParams(location.search).get('tab');
  if (wanted && document.getElementById('v-' + wanted)) switchTab(wanted);
  setTimeout(() => toast('Clique sur le bud !'), 400);
})();
