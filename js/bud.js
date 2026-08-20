/**
 * Bud Clicker — SVG bud renderer.
 *
 * Pure, deterministic rendering: given a strain id it returns the SVG markup
 * for the bud. No DOM access, no state mutation. Two calls with the same
 * strain always return the same string (all randomness is seeded), which is
 * both good for the clicker feel and easy to test.
 *
 * Browser: `window.BudRender`   Node: `module.exports`
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./game.js'));
  } else {
    root.BudRender = factory(root.BudGame);
  }
})(typeof self !== 'undefined' ? self : this, function (Game) {
  'use strict';

  const { STRAINS, mulberry32 } = Game;

  /** Outer "club" silhouette of the bud (viewBox 0 0 300 300). */
  const BUD_SIL =
    'M150,78 C180,78 208,96 208,128 C208,150 205,166 196,184 C186,204 176,214 158,224 C152,226.5 148,226.5 142,224 C124,214 114,204 104,184 C95,166 92,150 92,128 C92,96 120,78 150,78 Z';

  /**
   * One serrated cannabis leaflet, drawn pointing up from its origin.
   * Tip at (0,0) + (0,-78); teeth alternate along both edges.
   */
  const LEAFLET_PATH =
    'M0,0 L2.5,7 L6,10 L7,16 L3.5,15 L8,23 L7,30 L3.5,28 L8,36 L7,43 L3.5,41 L7,48 L6,54 L3,52 L5,59 L3,65 L1.5,63 L2,69 L1,75 L0,78 L-1,75 L-2,69 L-1.5,63 L-3,65 L-5,59 L-3,52 L-6,54 L-7,48 L-3.5,41 L-7,43 L-8,36 L-3.5,28 L-8,30 L-8,23 L-3.5,15 L-7,16 L-6,10 L-2.5,7 Z';

  /** Calyx (bud bract) teardrop used for the cluster. */
  const CALYX_PATH =
    'M0,-3 C8,3 15,12 15,23 C15,32 8,39 0,42 C-8,39 -15,32 -15,23 C-15,12 -8,3 0,-3 Z';

  /**
   * Build the SVG markup for the given strain.
   * @param {string} strainId strain id (falls back to the first strain)
   * @returns {string} SVG string to be injected into `<svg id="bs">`
   */
  function renderBudSvg(strainId) {
    const st = STRAINS.find((x) => x.id === strainId) || STRAINS[0];

    // -- helpers -------------------------------------------------------------
    const lg = (id, c) =>
      `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${c[0]}"/><stop offset="100%" stop-color="${c[1]}"/></linearGradient>`;
    const rg = (id, h, b, d) =>
      `<radialGradient id="${id}" cx="32%" cy="26%" r="88%">` +
      `<stop offset="0%" stop-color="${h}"/><stop offset="45%" stop-color="${b}"/><stop offset="100%" stop-color="${d}"/></radialGradient>`;
    // A leaf instance = leaflet + center vein, tinted with a named gradient.
    const lf = (id, grad) =>
      `<g id="leaf${id}"><use href="#leaflet" fill="url(#${grad})" stroke="${st.stroke}" stroke-width=".9" stroke-linejoin="round"/><use href="#vein"/></g>`;
    // A sugar leaf placed on the bud: rotate, scale, then push out by r.
    const use = (id, a, r, s) =>
      `<use href="#leaf${id}" transform="translate(150,178) rotate(${a}) scale(${s}) translate(0,-${r})"/>`;
    // Frost veil opacities, derived from the strain frost multiplier.
    const fv = (0.30 + st.frost * 0.18).toFixed(3);
    const fv2 = (0.12 + st.frost * 0.08).toFixed(3);

    // -- defs -----------------------------------------------------------------
    let h = '<defs>'
      + lg('lgd', st.d) + lg('lgm', st.m) + lg('lgl', st.l) + lg('lgf', st.f)
      + rg('cxD', st.m[0], st.d[0], st.d[1])
      + rg('cxM', st.l[0], st.m[0], st.m[1])
      + rg('cxL', st.f[0], st.l[0], st.l[1])
      + `<radialGradient id="frostVeil" cx="50%" cy="28%" r="85%">` +
        `<stop offset="0%" stop-color="#ffffff" stop-opacity="${fv}"/>` +
        `<stop offset="55%" stop-color="#ffffff" stop-opacity="${fv2}"/>` +
        `<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="occ" cx="50%" cy="96%" r="82%">` +
        `<stop offset="0%" stop-color="#000000" stop-opacity=".5"/>` +
        `<stop offset="100%" stop-color="#000000" stop-opacity="0"/></radialGradient>`
      // Subtle per-calyx waviness (static: rasterized once, cheap on mobile).
      + `<filter id="crumple" x="-15%" y="-15%" width="130%" height="130%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="3" seed="11" result="n"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="n" scale="7"/></filter>`
      // Fine frost noise sprinkled over the bud surface.
      + `<filter id="noiseFrost" x="0%" y="0%" width="100%" height="100%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="7" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0"/></filter>`
      + `<path id="leaflet" d="${LEAFLET_PATH}"/>`
      + `<line id="vein" x1="0" y1="4" x2="0" y2="72" stroke="${st.vein}" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>`
      + `<linearGradient id="lgFan" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7fae48"/><stop offset="100%" stop-color="#3a5c22"/></linearGradient>`
      + lf('D', 'lgd') + lf('M', 'lgm') + lf('L', 'lgl') + lf('F', 'lgf') + lf('A', 'lgFan')
      + `<path id="calyx" d="${CALYX_PATH}"/>`
      // Big fan leaf: petiole + 7 leaflets, mirrored angles, shorter outer fingers.
      + `<g id="fan"><line x1="0" y1="-8" x2="0" y2="-56" stroke="${st.stroke}" stroke-width="3.5" stroke-linecap="round"/>` +
        `<use href="#leafA" transform="translate(0,-56) rotate(-62) translate(0,-47) scale(.6)"/>` +
        `<use href="#leafA" transform="translate(0,-56) rotate(-45) translate(0,-59) scale(.75)"/>` +
        `<use href="#leafA" transform="translate(0,-56) rotate(-22) translate(0,-70) scale(.9)"/>` +
        `<use href="#leafA" transform="translate(0,-56) rotate(0) translate(0,-78) scale(1)"/>` +
        `<use href="#leafA" transform="translate(0,-56) rotate(22) translate(0,-70) scale(.9)"/>` +
        `<use href="#leafA" transform="translate(0,-56) rotate(45) translate(0,-59) scale(.75)"/>` +
        `<use href="#leafA" transform="translate(0,-56) rotate(62) translate(0,-47) scale(.6)"/></g>`
      + `<clipPath id="budClip"><path d="${BUD_SIL}"/></clipPath>`
      + '</defs>';

    // -- ground + stem + fan leaves (behind the bud) --------------------------
    h += `<ellipse cx="150" cy="252" rx="62" ry="13" fill="#0a1a07" opacity=".6"/>`;
    h += `<path d="M147,228 C147,240 150,247 150,252 C150,247 153,240 153,228 Z" fill="url(#lgd)" stroke="${st.stroke}" stroke-width=".8"/>`;
    h += `<use href="#fan" transform="translate(115,226) rotate(-32) scale(1.30)"/>`;
    h += `<use href="#fan" transform="translate(185,226) rotate(32) scale(1.30)"/>`;
    h += `<path d="${BUD_SIL}" fill="url(#lgd)"/>`;

    // -- calyx cluster ---------------------------------------------------------
    // Half-width of the club silhouette at a given height, so the cluster
    // keeps the bud outline.
    const hw = (y) =>
      y < 130 ? 20 + (y - 84) * (38 / 46)
      : y < 190 ? 58 - (y - 130) * (8 / 60)
      : 50 - (y - 190);
    const rnd = mulberry32(2024); // fixed seed -> identical bud every load
    let cxg = '<g filter="url(#crumple)">';
    for (let i = 0; i < 42; i++) {
      const y = 84 + Math.pow(rnd(), 0.7) * 148;
      const w = hw(y);
      const x = 150 + (rnd() * 2 - 1) * w * (0.35 + 0.65 * Math.sqrt(rnd()));
      let s = 0.5 + rnd() * 0.55;
      if (y > 190) s *= 0.8;
      const rot = (rnd() - 0.5) * 30;
      const tier = y < 150 ? 'cxL' : (y < 205 ? 'cxM' : 'cxD');
      cxg += `<use href="#calyx" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${s.toFixed(2)})" fill="url(#${tier})" stroke="${st.stroke}" stroke-width=".7" stroke-linejoin="round" opacity=".97"/>`;
    }
    cxg += '</g>';
    h += cxg;

    // -- sugar leaves (small leaflets hugging the bud) -------------------------
    h += use('F', -36, 98, .42) + use('F', -18, 104, .46) + use('F', 0, 106, .5)
       + use('F', 18, 104, .46) + use('F', 36, 98, .42);
    h += use('L', 50, 60, .44) + use('L', 78, 60, .44)
       + use('L', 108, 58, .42) + use('L', 132, 56, .4);
    h += use('L', -50, 60, .44) + use('L', -78, 60, .44)
       + use('L', -108, 58, .42) + use('L', -132, 56, .4);

    // -- frost veil + noise + occlusion, clipped to the bud -------------------
    h += `<g clip-path="url(#budClip)">` +
      `<ellipse cx="150" cy="150" rx="78" ry="86" fill="url(#frostVeil)"/>` +
      `<rect x="76" y="72" width="148" height="168" fill="url(#noiseFrost)" opacity=".5"/>` +
      `<ellipse cx="150" cy="238" rx="58" ry="20" fill="url(#occ)"/></g>`;

    // -- pistils (hairs) -------------------------------------------------------
    h += `<path d="M150,168 C149,152 152,140 150,124" stroke="${st.pistil}" stroke-width="1.7" stroke-linecap="round" fill="none" opacity=".95"/>`;
    h += `<path d="M150,124 C145,118 142,112 138,106" stroke="${st.pistil}" stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".9"/>`;
    h += `<path d="M150,124 C155,118 158,112 162,106" stroke="${st.pistil}" stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".9"/>`;
    h += `<path d="M150,196 C148,178 156,164 150,138" stroke="${st.pistil}" stroke-width="1.9" stroke-linecap="round" fill="none" opacity=".95"/>`;
    h += `<path d="M150,200 C154,184 148,172 156,148" stroke="${st.pistil2}" stroke-width="1.7" stroke-linecap="round" fill="none" opacity=".9"/>`;
    h += `<path d="M136,192 C128,178 132,164 124,144" stroke="${st.pistil}" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".9"/>`;
    h += `<path d="M164,192 C172,178 168,164 176,144" stroke="${st.pistil}" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".9"/>`;
    h += `<path d="M142,180 C136,168 140,156 132,138" stroke="${st.pistil2}" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".85"/>`;
    h += `<path d="M158,180 C164,168 160,156 168,138" stroke="${st.pistil2}" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".85"/>`;
    h += `<path d="M126,184 C116,172 120,160 110,144" stroke="${st.pistil}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".85"/>`;
    h += `<path d="M174,184 C184,172 180,160 190,144" stroke="${st.pistil}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".85"/>`;
    h += `<path d="M138,168 C130,156 134,144 126,128" stroke="${st.pistil2}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".8"/>`;
    h += `<path d="M162,168 C170,156 166,144 174,128" stroke="${st.pistil2}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".8"/>`;
    h += `<path d="M150,170 C150,158 152,148 150,134" stroke="${st.pistil2}" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".85"/>`;
    h += `<path d="M118,176 C110,166 112,154 104,140" stroke="${st.pistil}" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".8"/>`;
    h += `<path d="M182,176 C190,166 188,154 196,140" stroke="${st.pistil}" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".8"/>`;

    // Randomized curved pistils (seeded -> stable per session).
    const prnd = mulberry32(99);
    for (let i = 0; i < 10; i++) {
      const bx = 128 + prnd() * 44, by = 140 + prnd() * 55;
      const up = prnd() * Math.PI - (Math.PI / 2);
      const len = 16 + prnd() * 24;
      const c1x = bx + Math.sin(up) * len * 0.35, c1y = by - Math.cos(up) * len * 0.3;
      const ex = bx + Math.sin(up) * len, ey = by - Math.cos(up) * len;
      h += `<path d="M${bx.toFixed(1)},${by.toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${(ex + (prnd() - 0.5) * 10).toFixed(1)},${(ey - prnd() * 8).toFixed(1)} ${ex.toFixed(1)},${(ey - prnd() * 6).toFixed(1)}" stroke="${st.pistil}" stroke-width="${(1.0 + prnd() * 0.6).toFixed(1)}" stroke-linecap="round" fill="none" opacity=".9"/>`;
    }

    // -- trichomes (frost dots + stalks) --------------------------------------
    const trnd = mulberry32(777);
    let fr = '<g fill="#ffffff">';
    for (let i = 0; i < 13; i++) {
      const x = 118 + trnd() * 64, y = 102 + trnd() * 48;
      const dx = (trnd() - 0.5) * 8, dy = -4 - trnd() * 6;
      fr += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + dx).toFixed(1)}" y2="${(y + dy).toFixed(1)}" stroke="#e8f5e0" stroke-width=".6"/><circle cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="${(1.0 + trnd() * 0.6).toFixed(1)}"/>`;
    }
    const nd = Math.min(44, Math.round(40 * st.frost));
    for (let i = 0; i < nd; i++) {
      const x = Math.round(96 + trnd() * 108), y = Math.round(86 + trnd() * 124);
      fr += `<circle cx="${x}" cy="${y}" r="${(0.8 + trnd() * 0.9).toFixed(1)}"/>`;
    }
    fr += '</g>';
    h += fr;

    // -- specular highlight ----------------------------------------------------
    h += `<ellipse cx="133" cy="112" rx="30" ry="22" fill="#ffffff" opacity=".08"/>`;

    return h;
  }

  return { renderBudSvg, BUD_SIL, LEAFLET_PATH, CALYX_PATH };
});