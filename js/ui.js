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
    ug: document.getElementById('ug'),
    sv: document.getElementById('sv'),
    fw: document.getElementById('full-warn'),
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

  // --- helpers ---------------------------------------------------------------
  /** Format a number for display: 1.2K / 3.45M / floor below 1000. */
  function fmt(n) {
    return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
      : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K'
      : Math.floor(n);
  }

  /** Short toast notification — max 3 visibles, les plus anciens sortent. */
  function toast(text) {
    const m = document.createElement('div');
    m.className = 'ms';
    m.textContent = text;
    // limite à 3 toasts simultanés
    while (el.mc.children.length >= 3) el.mc.firstElementChild.remove();
    el.mc.appendChild(m);
    setTimeout(() => { if (m.parentNode) m.remove(); }, 2200);
  }

  /** Re-trigger the "pop" animation on a stat element. */
  function popNum(node) {
    node.classList.remove('pop');
    void node.offsetWidth;
    node.classList.add('pop');
  }

  // --- rendering -------------------------------------------------------------
  function renderBud() {
    const st = Game.getStrain(state.strain);
    if (el.sb && st) el.sb.textContent = st.icon + ' ' + st.name;
    if (!el.bs) return;
    const svg = Bud.renderBudSvg(state.strain);
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

  /** Render the market: one sellable product per card + weed brute.
   *  Prices pulse ±30% on a ~2 min cycle — arrows show the current direction. */
  function renderMarket() {
    if (!el.marketGrid) return;
    el.marketGrid.innerHTML = '';
    const level = Game.levelFromXp(state.xp);
    const now = Date.now();

    // Weed brute card — sell raw grams
    {
      const unit = Game.priceOf(state, 'weed', now);
      const have = state.stock.weed || 0;
      const n = qtyMode === 'max' ? have : Math.min(qtyMode, have);
      const card = document.createElement('div');
      card.className = 'market-card';
      card.innerHTML =
        '<div class="mc-top"><div class="mc-title">🌿 Weed Brute</div><div class="mc-price">' + trendArrow('weed', now) + ' ' + unit + ' €/g</div></div>' +
        '<div class="mc-stock" id="sth-w">' + fmt(have) + 'g disponibles</div>' +
        '<div class="mc-actions"><button class="mc-btn sell" data-p="weed">Vendre ' +
          (qtyMode === 'max' ? 'tout (' + fmt(have) + 'g)' : 'x' + n + ' (' + fmt(n) + 'g)') + '</button></div>';
      const btn = card.querySelector('button');
      btn.disabled = n <= 0;
      btn.addEventListener('click', () => onSell('weed'));
      el.marketGrid.appendChild(card);
    }

    // Crafted products
    for (const p of Game.PRODUCTS) {
      const locked = level < p.unlock;
      const unit = Game.priceOf(state, p.id, now);
      const have = state.stock[p.id] || 0;
      const maxCraftable = Math.floor((state.stock.weed || 0) / p.cost);
      const card = document.createElement('div');
      card.className = 'market-card' + (locked ? ' locked' : '');
      const qtyLabel = qtyMode === 'max'
        ? (locked ? '' : '<span class="mc-qty">x' + fmt(maxCraftable) + '</span>')
        : '';
      card.innerHTML =
        '<div class="mc-top"><div class="mc-title">' + p.icon + ' ' + p.name + qtyLabel + '</div><div class="mc-price">' + trendArrow(p.id, now) + ' ' + unit + ' €/u</div></div>' +
        (locked
          ? '<div class="mc-stock">🔒 Niveau ' + p.unlock + ' requis — ' + p.cost + 'g weed → 1u</div>'
          : '<div class="mc-stock">' + fmt(have) + ' dispo — ' + p.cost + 'g → 1u (' + p.desc + ')</div>') +
        '<div class="mc-actions">' +
          (locked ? '' :
            '<button class="mc-btn craft" data-p="' + p.id + '">Fabriquer ' +
              (qtyMode === 'max' ? 'max (' + fmt(maxCraftable) + ')' : 'x' + Math.min(qtyMode, Math.max(1, maxCraftable))) +
            '</button>' +
            '<button class="mc-btn sell" data-p="' + p.id + '">Vendre ' +
              (qtyMode === 'max' ? 'tout (' + fmt(have) + ')' : 'x' + Math.min(qtyMode, Math.max(1, have))) +
            '</button>') +
        '</div>';
      const cBtn = card.querySelector('.craft');
      const sBtn = card.querySelector('.sell');
      if (cBtn) {
        cBtn.disabled = maxCraftable <= 0;
        cBtn.addEventListener('click', () => onCraft(p.id));
      }
      if (sBtn) {
        sBtn.disabled = have <= 0;
        sBtn.addEventListener('click', () => onSell(p.id));
      }
      el.marketGrid.appendChild(card);
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
    if (el.lv) el.lv.textContent = prog.level;
    if (el.xplv) el.xplv.textContent = 'Niveau ' + prog.level;
    if (el.xpmult) el.xpmult.textContent = 'x' + mult.toFixed(2);
    if (el.xpf) {
      const pct = prog.needed > 0 ? Math.min(100, Math.round((prog.current / prog.needed) * 100)) : 100;
      el.xpf.style.width = pct + '%';
    }
    if (el.xpcur) el.xpcur.textContent = fmt(prog.current);
    if (el.xpnext) el.xpnext.textContent = ' / ' + fmt(prog.needed) + ' XP';

    if (el.ms) {
      el.ms.innerHTML = '';
      for (const mi of Game.MILESTONES) {
        const done = state.milestones.includes(mi.id);
        const item = document.createElement('div');
        item.className = 'ms-item' + (done ? ' done' : '');
        const pct2 = Math.min(100, Math.round((state.xp / mi.xp) * 100));
        item.innerHTML =
          '<span class="ms-icon">' + mi.icon + '</span>' +
          '<div class="ms-info"><div class="ms-name">' + mi.name +
            (done ? ' <span class="ms-badge">+' + mi.bonus + '%</span>' : '') + '</div>' +
            '<div class="ms-bar"><div class="ms-fill" style="width:' + pct2 + '%"></div></div></div>' +
          '<span class="ms-xp">' + (done ? '✓' : fmt(mi.xp) + ' XP') + '</span>';
        el.ms.appendChild(item);
      }
    }
  }

  /** Sync every dynamic text / disabled state with `state`. */
  function refreshStats() {
    const pc = Game.perClick(state);
    const ar = Game.perSecond(state);

    if (el.m) el.m.textContent = fmt(state.money) + ' €';
    if (el.ar) el.ar.textContent = '+' + ar;
    if (el.hl) el.hl.textContent = pc;

    const cap = Game.maxWeedStorage(state);
    const isFull = (state.stock.weed || 0) >= cap;
    if (el.stw) {
      el.stw.textContent = fmt(state.stock.weed) + ' / ' + fmt(cap) + 'g';
      el.stw.parentElement?.classList.toggle('full', isFull);
    }
    // storage-full feedback: pulsing bud + clickable warning banner
    if (el.bc) el.bc.classList.toggle('storage-full', isFull);
    if (el.fw) el.fw.hidden = !isFull;

    renderMarket();

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
      const lv = document.getElementById('ul-' + a.id);
      if (lv) {
        lv.textContent = anyOwned ? '✓ Actif' : (Game.levelFromXp(state.xp) < a.unlock ? '🔒 Niv. ' + a.unlock : 'Unique');
        lv.classList.toggle('owned', anyOwned);
      }
      const btn = document.getElementById('ub-' + a.id);
      if (btn) btn.disabled = (hasCraft && hasSell) || state.money < a.cost;
      const card = document.getElementById('ui-' + a.id);
      if (card) card.classList.toggle('affordable', !(hasCraft && hasSell) && state.money >= a.cost);
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

  function onHarvest(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const ac = Game.perClick(state);
    const added = Game.addWeed(state, ac);
    const full = added < ac;
    if (full && Date.now() - lastFullToast > 2500) {
      toast('Stock plein ! Vends ou agrandis 📦');
      lastFullToast = Date.now();
    }
    const xp = Game.earnXp(state, added);
    // retrigger animation even on rapid taps
    el.bc.classList.remove('pulse-active');
    void el.bc.offsetWidth;
    el.bc.classList.add('pulse-active');
    setTimeout(() => el.bc.classList.remove('pulse-active'), 400);
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

  function spawnParticle(text, warn) {
    const p = document.createElement('div');
    p.className = 'click-fx' + (warn ? ' warn' : '');
    p.textContent = text;
    // léger jitter horizontal pour les taps rapides, vertical fixe
    p.style.left = (50 + (Math.random() - 0.5) * 16) + '%';
    el.bc.appendChild(p);
    setTimeout(() => p.remove(), 720);
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
    if (ar > 0) {
      const added = Game.addWeed(state, ar);
      Game.earnXp(state, added);
    }
    // automation hires (Ouvriers/Dealers) craft & sell owned products
    Game.autoTick(state);
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
  }

  // --- wiring -----------------------------------------------------------------
  if (el.bs) el.bs.addEventListener('click', onHarvest);
  else if (el.bc) el.bc.addEventListener('click', onHarvest);
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
  setTimeout(() => toast('Clique sur le bud !'), 400);
})();
