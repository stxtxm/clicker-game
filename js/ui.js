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
    sth: document.getElementById('sth'),
    str: document.getElementById('str'),
    sthW: document.getElementById('sth-w'),
    pw: document.getElementById('pw'),
    ph: document.getElementById('ph'),
    pr: document.getElementById('pr'),
    swMarket: document.getElementById('sw-market'),
    sh: document.getElementById('sh'),
    sr: document.getElementById('sr'),
    cbHash: document.getElementById('cb-hash'),
    cbResin: document.getElementById('cb-resin'),
    bc: document.getElementById('bc'),
    mc: document.getElementById('mc'),
    bs: document.getElementById('bs'),
    ug: document.getElementById('ug'),
    sv: document.getElementById('sv'),
    shopStorage: document.getElementById('shop-storage'),
    shopStrains: document.getElementById('shop-strains'),
    shopVarietal: document.getElementById('shop-varietal'),
    xplv: document.getElementById('xplv'),
    xpmult: document.getElementById('xpmult'),
    xpf: document.getElementById('xpf'),
    xpcur: document.getElementById('xpcur'),
    xpnext: document.getElementById('xpnext'),
    ms: document.getElementById('ms'),
    rb: document.getElementById('rb')
  };

  let state = Game.defaultState();

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

  function renderShopStorage() {
    if (!el.shopStorage) return;
    el.shopStorage.innerHTML = '';
    const storageUpgrades = Game.UPGRADES.filter((u) => ['sbox', 'coldroom'].includes(u.id));
    for (const u of storageUpgrades) {
      const level = state.levels[u.id] || 0;
      const cost = Game.upgradeCost(state, u.id);
      const affordable = state.money >= cost;
      const card = document.createElement('div');
      card.className = 'upgrade' + (affordable ? ' affordable' : '');
      card.innerHTML =
        '<span class="up-icon">' + u.icon + '</span>' +
        '<div class="up-info"><div class="up-name">' + u.name + ' <span class="up-level">Lvl ' + level + '</span></div>' +
        '<div class="up-desc">' + u.desc + '</div></div>' +
        '<div class="up-buy"><span class="up-cost">' + fmt(cost) + ' €</span><button class="bb">Acheter</button></div>';
      const btn = card.querySelector('.bb');
      btn.disabled = !affordable;
      btn.addEventListener('click', () => buyUpgrade(u.id));
      el.shopStorage.appendChild(card);
    }
  }

  function renderShopStrains() {
    if (!el.shopStrains) return;
    el.shopStrains.innerHTML = '';
    const level = Game.levelFromXp(state.xp);
    const available = Game.STRAINS.filter((st) => !state.stock.strains.includes(st.id) && level >= st.unlock);
    if (available.length === 0) {
      el.shopStrains.innerHTML = '<p style="font-size:.8rem;color:var(--muted)">Aucune nouvelle variété débloquée — gagne des niveaux !</p>';
      return;
    }
    for (const st of available) {
      const card = document.createElement('div');
      card.className = 'strain';
      if (state.money >= st.cost) card.classList.add('affordable');
      card.innerHTML =
        '<span class="st-icon">' + st.icon + '</span>' +
        '<div class="st-info"><div class="st-name">' + st.name + '</div>' +
        '<div class="st-desc">' + st.desc + ' (x' + st.yieldMult + ' rendement, x' + st.priceMult + ' prix)</div></div>' +
        '<div class="st-buy"><span class="st-cost">' + fmt(st.cost) + ' €</span><button class="bb">Acheter</button></div>';
      const btn = card.querySelector('.bb');
      btn.disabled = state.money < st.cost;
      btn.addEventListener('click', () => equipStrain(st.id));
      el.shopStrains.appendChild(card);
    }
  }

  function renderShopVarietal() {
    if (!el.shopVarietal) return;
    el.shopVarietal.innerHTML = '';
    const owned = state.stock.strains;
    let hasAny = false;
    for (const sid of owned) {
      if ((state.stock.weedByStrain && state.stock.weedByStrain[sid] > 0) || (state.stock.hashByStrain && state.stock.hashByStrain[sid] > 0) || state.stock.weed > 0) { hasAny = true; break; }
    }
    if (!hasAny && state.stock.weed <= 0 && (state.stock.hash || 0) <= 0) {
      el.shopVarietal.innerHTML = '<p style="font-size:.8rem;color:var(--muted)">Pas de stock à vendre — récolte d\'abord !</p>';
      return;
    }
    for (const sid of owned) {
      const st = Game.getStrain(sid);
      if (!st) continue;
      const weedStock = (state.stock.weedByStrain && state.stock.weedByStrain[sid]) || 0;
      const hashStock = (state.stock.hashByStrain && state.stock.hashByStrain[sid]) || 0;
      // show card even if stock is 0, but disable buttons — gives interest to see what each strain holds
      const weedPrice = Math.round(state.prices.weed * st.priceMult);
      const hashPrice = Math.round(state.prices.hash * st.priceMult);
      const card = document.createElement('div');
      card.className = 'varietal-card';
      card.innerHTML =
        '<div class="varietal-head"><span>' + st.icon + '</span><span>' + st.name + '</span><span style="margin-left:auto;font-size:.7rem;color:var(--muted)">' + weedStock + 'g / ' + hashStock + 'h</span><span style="font-size:.75rem;color:var(--gold)">x' + st.priceMult + '</span></div>' +
        '<div class="varietal-actions">' +
          '<button class="mc-btn sell" data-t="weed">Weed 1g — ' + weedPrice + '€ (' + weedStock + 'g)</button>' +
          '<button class="mc-btn sell" data-t="hash">Hash 1u — ' + hashPrice + '€ (' + hashStock + 'h)</button>' +
        '</div>';
      const wBtn = card.querySelector('[data-t="weed"]');
      const hBtn = card.querySelector('[data-t="hash"]');
      wBtn.disabled = weedStock <= 0;
      hBtn.disabled = hashStock <= 0;
      wBtn.addEventListener('click', () => {
        const gain = Game.sellByStrain(state, sid, 'weed', 1);
        if (gain > 0) { toast('+' + fmt(gain) + '€ (' + st.name + ')'); popNum(el.m); refreshStats(); save(); }
        else toast('Pas de weed ' + st.name);
      });
      hBtn.addEventListener('click', () => {
        const gain = Game.sellByStrain(state, sid, 'hash', 1);
        if (gain > 0) { toast('+' + fmt(gain) + '€ (' + st.name + ' hash)'); popNum(el.m); refreshStats(); save(); }
        else toast('Pas de hash ' + st.name);
      });
      el.shopVarietal.appendChild(card);
    }
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
    const st = Game.getStrain(state.strain);
    const pMult = st ? st.priceMult : 1.0;

    if (el.m) el.m.textContent = fmt(state.money) + ' €';
    if (el.ar) el.ar.textContent = '+' + ar;
    if (el.hl) el.hl.textContent = pc;

    const cap = Game.maxWeedStorage(state);
    if (el.stw) {
      el.stw.textContent = fmt(state.stock.weed) + ' / ' + fmt(cap) + 'g';
      el.stw.parentElement?.classList.toggle('full', state.stock.weed >= cap);
    }
    if (el.sthW) el.sthW.textContent = fmt(state.stock.weed) + 'g disponibles';
    if (el.sth) el.sth.textContent = fmt(state.stock.hash) + ' dispo';
    if (el.str) el.str.textContent = fmt(state.stock.resin) + ' dispo';

    if (el.pw) el.pw.textContent = Math.round(state.prices.weed * pMult) + ' €/g';
    if (el.ph) el.ph.textContent = Math.round(state.prices.hash * pMult) + ' €/u';
    if (el.pr) el.pr.textContent = Math.round(state.prices.resin * pMult) + ' €/u';

    if (el.swMarket) el.swMarket.disabled = state.stock.weed <= 0;
    if (el.sh) el.sh.disabled = (state.stock.hash || 0) <= 0;
    if (el.sr) el.sr.disabled = (state.stock.resin || 0) <= 0;

    if (el.cbHash) el.cbHash.disabled = state.stock.weed < Game.HASH_CONVERT_COST;
    if (el.cbResin) el.cbResin.disabled = state.stock.weed < Game.RESIN_CONVERT_COST;

    // shop extras (varietal sales, stockage & variétés à acheter)
    renderShopVarietal();
    renderShopStorage();
    renderShopStrains();

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
  function onHarvest(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const ac = Game.perClick(state);
    const added = Game.addWeed(state, ac);
    if (added < ac) toast('Stock plein ! Vends ou agrandis 📦');
    const xp = Game.earnXp(state, added);
    // retrigger animation even on rapid taps
    el.bc.classList.remove('pulse-active');
    void el.bc.offsetWidth;
    el.bc.classList.add('pulse-active');
    setTimeout(() => el.bc.classList.remove('pulse-active'), 400);
    spawnParticle('+' + ac + 'g');
    refreshStats();
    if (el.stw) popNum(el.stw);
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

  function spawnParticle(text) {
    const p = document.createElement('div');
    p.className = 'click-fx';
    p.textContent = text;
    // léger jitter horizontal pour les taps rapides, vertical fixe
    p.style.left = (50 + (Math.random() - 0.5) * 16) + '%';
    el.bc.appendChild(p);
    setTimeout(() => p.remove(), 720);
  }

  function onCraft(type) {
    const res = Game.craftProduct(state, type);
    if (res.ok) {
      toast(type === 'hash' ? '📦 1 Hash conditionné !' : '🍯 1 Résine supérieure !');
      if (el.stw) popNum(el.stw);
    } else {
      toast('Pas assez de weed (' + (type === 'hash' ? '5g' : '20g') + ' requis)');
    }
    refreshStats();
    save();
  }

  function onSell(type) {
    const gain = Game.sellStock(state, type);
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

  /** One auto-production tick (every second). */
  function autoProduce() {
    const ar = Game.perSecond(state);
    if (ar > 0) {
      const added = Game.addWeed(state, ar);
      Game.earnXp(state, added);
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
  }

  // --- wiring -----------------------------------------------------------------
  if (el.bs) el.bs.addEventListener('click', onHarvest);
  else if (el.bc) el.bc.addEventListener('click', onHarvest);
  if (el.swMarket) el.swMarket.addEventListener('click', () => onSell('weed'));
  if (el.sh) el.sh.addEventListener('click', () => onSell('hash'));
  if (el.sr) el.sr.addEventListener('click', () => onSell('resin'));
  if (el.cbHash) el.cbHash.addEventListener('click', () => onCraft('hash'));
  if (el.cbResin) el.cbResin.addEventListener('click', () => onCraft('resin'));

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
