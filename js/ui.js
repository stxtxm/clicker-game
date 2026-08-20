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
    p: document.getElementById('p'),
    m: document.getElementById('m'),
    ar: document.getElementById('ar'),
    hl: document.getElementById('hl'),
    stm: document.getElementById('stm'),
    stp: document.getElementById('stp'),
    pm: document.getElementById('pm'),
    pp: document.getElementById('pp'),
    sm: document.getElementById('sm'),
    sp: document.getElementById('sp'),
    sa: document.getElementById('sa'),
    bc: document.getElementById('bc'),
    mc: document.getElementById('mc'),
    bs: document.getElementById('bs'),
    ug: document.getElementById('ug'),
    sv: document.getElementById('sv')
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
        '<div class="up-buy"><span class="up-cost" id="uc-' + u.id + '">$0</span>' +
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
    for (const st of Game.STRAINS) {
      const owned = state.stock.strains.includes(st.id);
      const equipped = state.strain === st.id;
      const card = document.createElement('div');
      card.className = 'strain' + (owned ? ' owned' : '');
      card.innerHTML =
        '<span class="st-icon">' + st.icon + '</span>' +
        '<div class="st-info"><div class="st-name">' + st.name +
          (equipped ? ' <span class="st-badge">Équipée</span>' : '') + '</div>' +
          '<div class="st-desc">' + st.desc + '</div></div>' +
        '<div class="st-buy">' +
          '<span class="st-cost">' + (owned ? '' : '$' + fmt(st.cost)) + '</span>' +
          (owned ? '<span class="st-ok">Possédée</span>'
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

  /** Sync every dynamic text / disabled state with `state`. */
  function refreshStats() {
    const pc = Game.perClick(state);
    const ar = Game.perSecond(state);
    el.p.textContent = fmt(state.points);
    el.m.textContent = '$' + fmt(state.money);
    el.ar.textContent = '+' + ar;
    el.hl.textContent = pc;
    el.stm.textContent = state.stock.main + ' dispo';
    el.stp.textContent = state.stock.premium + ' dispo';
    el.pm.textContent = '$' + state.prices.main + '/u';
    el.pp.textContent = '$' + state.prices.premium + '/u';
    el.sm.disabled = state.stock.main <= 0;
    el.sp.disabled = state.stock.premium <= 0;
    el.sa.disabled = (state.stock.main + state.stock.premium) <= 0;
    for (const u of Game.UPGRADES) {
      const lv = document.getElementById('ul-' + u.id);
      if (lv) lv.textContent = 'Lvl ' + state.levels[u.id];
      const cost = document.getElementById('uc-' + u.id);
      if (cost) cost.textContent = '$' + fmt(Game.upgradeCost(state, u.id));
      const btn = document.getElementById('ub-' + u.id);
      if (btn) btn.disabled = state.money < Game.upgradeCost(state, u.id);
    }
    document.querySelectorAll('[id^="sb-"]').forEach((b) => {
      const id = b.id.slice(3);
      const st = Game.getStrain(id);
      if (st && !state.stock.strains.includes(id)) b.disabled = state.money < st.cost;
    });
  }

  // --- game actions ----------------------------------------------------------
  function onHarvest(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const ac = Game.perClick(state);
    state.points += ac;
    state.stock.main += ac;
    el.bs.classList.add('pulse-active');
    setTimeout(() => el.bs.classList.remove('pulse-active'), 280);
    let x = 50, y = 45;
    if (ev && ev.clientX && ev.clientY) {
      const r = el.bc.getBoundingClientRect();
      x = ((ev.clientX - r.left) / r.width) * 100;
      y = ((ev.clientY - r.top) / r.height) * 100;
    }
    spawnParticle('+' + ac, x, y);
    refreshStats();
    popNum(el.p);
    save();
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

  function onSell(type) {
    const gain = Game.sellStock(state, type);
    if (gain > 0) {
      state.money += gain;
      toast('+$' + fmt(gain));
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
      toast('Pas assez d\'argent');
    }
    refreshStats();
    save();
  }

  function equipStrain(id) {
    const res = Game.equipStrain(state, id);
    if (!res.ok) {
      if (res.reason === 'funds') toast('Pas assez d\'argent');
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
      state.points += ar;
      state.stock.main += ar;
    }
    if (state.stock.main > 10 && Math.random() < Game.PREMIUM_DROP_CHANCE) {
      state.stock.main -= Game.PREMIUM_DROP_COST;
      state.stock.premium += 1;
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
  el.bs.addEventListener('click', onHarvest);
  el.sm.addEventListener('click', () => onSell('main'));
  el.sp.addEventListener('click', () => onSell('premium'));
  el.sa.addEventListener('click', () => onSell('all'));
  document.querySelectorAll('.tab-btn').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // Space bar = harvest (desktop), unless a button has focus.
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