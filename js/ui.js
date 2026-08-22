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
  const Cloud = window.BudCloud;
  const SAVE_KEY = 'budClicker';

  // --- DOM references --------------------------------------------------------
  const el = {
    p: document.getElementById('p'),
    m: document.getElementById('m'),
    ar: document.getElementById('ar'),
    lv: document.getElementById('lv'),
    hl: document.getElementById('hl'),
    stw: document.getElementById('stw'),
    sth: document.getElementById('sth'),
    str: document.getElementById('str'),
    pw: document.getElementById('pw'),
    ph: document.getElementById('ph'),
    pr: document.getElementById('pr'),
    sw: document.getElementById('sw'),
    sh: document.getElementById('sh'),
    sr: document.getElementById('sr'),
    sa: document.getElementById('sa'),
    cbHash: document.getElementById('cb-hash'),
    cbResin: document.getElementById('cb-resin'),
    bc: document.getElementById('bc'),
    mc: document.getElementById('mc'),
    bs: document.getElementById('bs'),
    ug: document.getElementById('ug'),
    sv: document.getElementById('sv'),
    xplv: document.getElementById('xplv'),
    xpmult: document.getElementById('xpmult'),
    xpf: document.getElementById('xpf'),
    xpcur: document.getElementById('xpcur'),
    xpnext: document.getElementById('xpnext'),
    pg: document.getElementById('pg'),
    pb: document.getElementById('pb'),
    pdist: document.getElementById('pdist'),
    ms: document.getElementById('ms'),
    rb: document.getElementById('rb'),
    ccStatus: document.getElementById('ccstatus'),
    ccGist: document.getElementById('ccgist')
  };

  let state = Game.defaultState();

  // --- helpers ---------------------------------------------------------------
  /** Format a number for display: 1.2K / 3.45M / floor below 1000. */
  function fmt(n) {
    return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
      : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K'
      : Math.floor(n);
  }

  /** Short toast notification. */
  function toast(text) {
    const m = document.createElement('div');
    m.className = 'ms';
    m.textContent = text;
    el.mc.appendChild(m);
    setTimeout(() => m.remove(), 2200);
  }

  /** Re-trigger the "pop" animation on a stat element. */
  function popNum(node) {
    node.classList.remove('pop');
    void node.offsetWidth;
    node.classList.add('pop');
  }

  // --- rendering -------------------------------------------------------------
  function renderBud() {
    el.bs.innerHTML = Bud.renderBudSvg(state.strain);
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
      card.addEventListener('click', () => buyUpgrade(u.id));
      card.querySelector('.bb').addEventListener('click', (ev) => {
        ev.stopPropagation();
        buyUpgrade(u.id);
      });
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

  /** Render the progression panel: level/XP bar, prestige, milestones. */
  function renderProgress() {
    const prog = Game.xpProgress(state.xp);
    const mult = Game.productionMult(state);
    el.lv.textContent = prog.level;
    el.xplv.textContent = 'Niveau ' + prog.level;
    el.xpmult.textContent = 'x' + mult.toFixed(2);
    const pct = prog.needed > 0 ? Math.min(100, Math.round((prog.current / prog.needed) * 100)) : 100;
    el.xpf.style.width = pct + '%';
    el.xpcur.textContent = fmt(prog.current);
    el.xpnext.textContent = ' / ' + fmt(prog.needed) + ' XP';

    const gain = Game.prestigeGain(state);
    const can = Game.canPrestige(state);
    el.pg.textContent = '+' + gain;
    el.pb.disabled = !can;
    el.pdist.textContent = can
      ? 'Prêt ! ' + fmt(state.xp) + ' XP'
      : fmt(state.xp) + ' / ' + fmt(Game.PRESTIGE_BASE) + ' XP';

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

  /** Sync every dynamic text / disabled state with `state`. */
  function refreshStats() {
    const pc = Game.perClick(state);
    const ar = Game.perSecond(state);
    const st = Game.getStrain(state.strain);
    const pMult = st ? st.priceMult : 1.0;

    el.p.textContent = fmt(state.weed) + 'g';
    el.m.textContent = fmt(state.money) + ' €';
    el.ar.textContent = '+' + ar;
    el.hl.textContent = pc;

    el.stw.textContent = fmt(state.stock.weed) + 'g dispo';
    el.sth.textContent = fmt(state.stock.hash) + ' dispo';
    el.str.textContent = fmt(state.stock.resin) + ' dispo';

    el.pw.textContent = Math.round(state.prices.weed * pMult) + ' €/g';
    el.ph.textContent = Math.round(state.prices.hash * pMult) + ' €/u';
    el.pr.textContent = Math.round(state.prices.resin * pMult) + ' €/u';

    el.sw.disabled = state.stock.weed <= 0;
    el.sh.disabled = (state.stock.hash || 0) <= 0;
    el.sr.disabled = (state.stock.resin || 0) <= 0;
    el.sa.disabled = (state.stock.weed + (state.stock.hash || 0) + (state.stock.resin || 0)) <= 0;

    el.cbHash.disabled = state.stock.weed < Game.HASH_CONVERT_COST;
    el.cbResin.disabled = state.stock.weed < Game.RESIN_CONVERT_COST;

    for (const u of Game.UPGRADES) {
      const lv = document.getElementById('ul-' + u.id);
      if (lv) lv.textContent = 'Lvl ' + state.levels[u.id];
      const cost = document.getElementById('uc-' + u.id);
      if (cost) cost.textContent = fmt(Game.upgradeCost(state, u.id)) + ' €';
      const btn = document.getElementById('ub-' + u.id);
      if (btn) btn.disabled = state.money < Game.upgradeCost(state, u.id);
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
    state.weed += ac;
    state.stock.weed += ac;
    const xp = Game.earnXp(state, ac);
    el.bs.classList.add('pulse-active');
    setTimeout(() => el.bs.classList.remove('pulse-active'), 280);
    let x = 50, y = 45;
    if (ev && ev.clientX && ev.clientY) {
      const r = el.bc.getBoundingClientRect();
      x = ((ev.clientX - r.left) / r.width) * 100;
      y = ((ev.clientY - r.top) / r.height) * 100;
    }
    spawnParticle('+' + ac + 'g', x, y);
    refreshStats();
    popNum(el.p);
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

  function spawnParticle(text, x, y) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.textContent = text;
    p.style.left = (x || 50) + '%';
    p.style.top = (y || 45) + '%';
    el.bc.appendChild(p);
    setTimeout(() => p.remove(), 520);
  }

  function onCraft(type) {
    const res = Game.craftProduct(state, type);
    if (res.ok) {
      toast(type === 'hash' ? '📦 1 Hash conditionné !' : '🍯 1 Résine supérieure !');
      popNum(el.p);
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
      toast('Pas assez d'argent');
    }
    refreshStats();
    save();
  }

  function equipStrain(id) {
    const res = Game.equipStrain(state, id);
    if (!res.ok) {
      if (res.reason === 'funds') toast('Pas assez d'argent');
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
      state.weed += ar;
      state.stock.weed += ar;
      Game.earnXp(state, ar);
    }
    if (state.stock.weed > 20 && Math.random() < Game.PRODUCT_DROP_CHANCE) {
      if (Math.random() < 0.3) {
        state.stock.weed -= 20;
        state.stock.resin = (state.stock.resin || 0) + 1;
      } else {
        state.stock.weed -= 5;
        state.stock.hash = (state.stock.hash || 0) + 1;
      }
    }
    refreshStats();
    save();
  }

  // --- cloud persistence ------------------------------------------------------
  const CLOUD_PUSH_INTERVAL = 60000;
  let cloudTimer = null;

  function renderCloud() {
    const nid = Cloud.getId();
    el.ccGist.textContent = nid ? 'ID: ' + nid : '— aucune sauvegarde —';
    el.ccStatus.textContent = '';
    el.ccStatus.className = 'cc-status';
  }

  function cloudStatus(text, ok) {
    el.ccStatus.textContent = text;
    el.ccStatus.className = 'cc-status' + (ok === true ? ' ok' : ok === false ? ' err' : '');
  }

  async function cloudPush() {
    if (!Cloud.hasBlob()) {
      const res = await Cloud.create(state);
      if (res.ok) {
        renderCloud();
        cloudStatus('Sauvegardé ✓', true);
      } else cloudStatus('Erreur réseau', false);
    } else {
      const res = await Cloud.update(state);
      if (res.ok) cloudStatus('Sauvegardé ✓', true);
      else cloudStatus(res.reason === 'gone' ? 'Sauvegarde expirée — nouvelle création…' : 'Erreur', false);
    }
  }

  async function cloudPull() {
    if (!Cloud.hasBlob()) return;
    try {
      const res = await Cloud.pull();
      if (!res.ok || !res.state) return;
      state = Game.deserialize(JSON.stringify(res.state));
      renderBud();
      renderUpgrades();
      renderStrains();
      refreshStats();
      save();
      const ts = res.savedAt ? new Date(res.savedAt).toLocaleString('fr-FR') : '';
      cloudStatus('Chargé' + (ts ? ' (save du ' + ts + ')' : ''), true);
    } catch (e) { /* silent on boot */ }
  }

  function startCloudAuto() {
    if (Cloud.hasBlob()) cloudPull();
    cloudTimer = setInterval(() => cloudPush(), CLOUD_PUSH_INTERVAL);
  }
  // --- persistence -----------------------------------------------------------
  let cloudPushPending = null;
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, Game.serialize(state));
    } catch (e) { /* quota / private mode: ignore */ }
    if (!cloudPushPending) {
      cloudPushPending = setTimeout(() => {
        cloudPushPending = null;
        cloudPush();
      }, 2000);
    }
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
  el.bs.addEventListener('click', onHarvest);
  el.sw.addEventListener('click', () => onSell('weed'));
  el.sh.addEventListener('click', () => onSell('hash'));
  el.sr.addEventListener('click', () => onSell('resin'));
  el.sa.addEventListener('click', () => onSell('all'));
  el.cbHash.addEventListener('click', () => onCraft('hash'));
  el.cbResin.addEventListener('click', () => onCraft('resin'));

  document.querySelectorAll('.tab-btn').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  el.pb.addEventListener('click', () => {
    const res = Game.prestige(state);
    if (!res.ok) {
      toast('Pas encore assez de XP pour recycler');
      return;
    }
    toast('Nouvelle génération : +' + res.gain + ' génome' + (res.gain > 1 ? 's' : '') + ' 🧬');
    renderBud();
    renderUpgrades();
    renderStrains();
    renderProgress();
    refreshStats();
    save();
  });

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
  renderCloud();
  startCloudAuto();
  setInterval(autoProduce, 1000);
  setInterval(save, 10000);
  refreshStats();
  setTimeout(() => toast('Clique sur le bud !'), 400);
})();
