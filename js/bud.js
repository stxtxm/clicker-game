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

  /** Conical "cola" silhouette of the bud (viewBox 0 0 300 300). */
  const BUD_SIL =
    'M150,62 C164,62 178,74 186,94 C194,114 199,136 197,158 C195,182 186,204 168,220 C160,227 154,230 150,230 C146,230 140,227 132,220 C114,204 105,182 103,158 C101,136 106,114 114,94 C122,74 136,62 150,62 Z';

  /**
   * One serrated cannabis leaflet, drawn pointing DOWN from its tip.
   * Tip at (0,0), base at (0,100); slender lanceolate blade (~1:5 ratio),
   * 11 teeth per side, each tooth apex offset toward the tip like the real
   * serratures of Cannabis sativa.
   */
  const LEAFLET_PATH =
    'M0,0 L3,7 L1.5,10 L5.5,17 L3,20 L7.5,27 L4.5,30 L9,37 L5.5,40 L10,47 L6.5,50 L10.5,57 L6.5,60 L9.5,67 L5.5,70 L8,77 L4.5,79 L6,85 L3,87 L3.8,92 L1.5,94 L1.8,98 L0,100 ' +
    'L-1.8,98 L-1.5,94 L-3.8,92 L-3,87 L-6,85 L-4.5,79 L-8,77 L-5.5,70 L-9.5,67 L-6.5,60 L-10.5,57 L-6.5,50 L-10,47 L-5.5,40 L-9,37 L-4.5,30 L-7.5,27 L-3,20 L-5.5,17 L-1.5,10 L-3,7 Z';

  /** Calyx (bract) teardrop with a tiny beak, used for the dense cluster. */
  const CALYX_PATH =
    'M0,-4 C7.5,0 13.5,8 14,18 C14.5,28 8,37 0,41 C-8,37 -14.5,28 -14,18 C-13.5,8 -7.5,0 0,-4 Z';

  /** Half-width of the cola silhouette at height y (matches BUD_SIL). */
  function halfWidth(y) {
    if (y < 76) return Math.max(0, (y - 62) * (20 / 14));
    if (y < 94) return 20 + (y - 76) * (14 / 18);
    if (y < 114) return 34 + (y - 94) * (9 / 20);
    if (y < 136) return 43 + (y - 114) * (5 / 22);
    if (y < 158) return 48 + (y - 136) * (1 / 22);
    if (y < 182) return 49 - (y - 158) * (4 / 24);
    if (y < 204) return 45 - (y - 182) * (12 / 22);
    if (y < 220) return 33 - (y - 204) * (18 / 16);
    return Math.max(0, 15 - (y - 220) * (13 / 10));
  }

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
    // A leaf instance = veined blade tinted with a gradient + colored midrib.
    const lf = (id, grad) =>
      `<g id="leaf${id}">` +
      `<use href="#leafletV" fill="url(#${grad})" stroke="${st.stroke}" stroke-width=".8"/>` +
      `<use href="#midrib" stroke="${st.vein}"/></g>`;
    // A leaf anchored by its base at (bx,by), tip tilted phi degrees off vertical.
    const leafAt = (id, bx, by, phi, s) =>
      `<use href="#leaf${id}" transform="translate(${bx},${by}) rotate(${phi}) scale(${s}) translate(0,-100)"/>`;

    // -- defs -----------------------------------------------------------------
    let h = '<defs>'
      + lg('lgd', st.d) + lg('lgm', st.m) + lg('lgl', st.l) + lg('lgf', st.f)
      + `<radialGradient id="budBase" cx="36%" cy="20%" r="95%">` +
        `<stop offset="0%" stop-color="${st.m[0]}"/><stop offset="52%" stop-color="${st.d[0]}"/>` +
        `<stop offset="100%" stop-color="${st.d[1]}"/></radialGradient>`
      + `<radialGradient id="cxD" cx="38%" cy="24%" r="90%">` +
        `<stop offset="0%" stop-color="${st.m[0]}"/><stop offset="60%" stop-color="${st.d[0]}"/>` +
        `<stop offset="100%" stop-color="${st.d[1]}"/></radialGradient>`
      + `<radialGradient id="cxM" cx="38%" cy="24%" r="90%">` +
        `<stop offset="0%" stop-color="${st.l[0]}"/><stop offset="60%" stop-color="${st.m[0]}"/>` +
        `<stop offset="100%" stop-color="${st.m[1]}"/></radialGradient>`
      + `<radialGradient id="cxL" cx="40%" cy="26%" r="90%">` +
        `<stop offset="0%" stop-color="${st.f[0]}"/><stop offset="60%" stop-color="${st.l[0]}"/>` +
        `<stop offset="100%" stop-color="${st.l[1]}"/></radialGradient>`
      // Soft resin sheen (kept subtle: the frost must never look like glass).
      + `<radialGradient id="frostVeil" cx="50%" cy="30%" r="80%">` +
        `<stop offset="0%" stop-color="#ffffff" stop-opacity="${(0.10 + st.frost * 0.05).toFixed(3)}"/>` +
        `<stop offset="60%" stop-color="#ffffff" stop-opacity="${(0.04 + st.frost * 0.02).toFixed(3)}"/>` +
        `<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="occ" cx="50%" cy="96%" r="82%">` +
        `<stop offset="0%" stop-color="#000000" stop-opacity=".45"/>` +
        `<stop offset="100%" stop-color="#000000" stop-opacity="0"/></radialGradient>`
      // Subtle per-calyx waviness (static: rasterized once, cheap on mobile).
      + `<filter id="crumple" x="-15%" y="-15%" width="130%" height="130%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="3" seed="11" result="n"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter>`
      // Fine frost noise sprinkled over the bud surface.
      + `<filter id="noiseFrost" x="0%" y="0%" width="100%" height="100%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="7" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0"/></filter>`
      + `<path id="leaflet" d="${LEAFLET_PATH}"/>`
      // Blade + short secondary veins reaching toward the serration notches.
      // The blade carries NO fill/stroke of its own so it inherits both from
      // the <use> that references this group; the veins opt out explicitly.
      + `<g id="leafletV"><use href="#leaflet"/>`
      + `<path d="M0,14 Q2.5,16 5,21 M0,24 Q3.5,26 7,31 M0,34 Q4,36 8.5,41 M0,44 Q4.5,46 9.5,51 M0,54 Q4.5,56 9.5,61 M0,64 Q4,66 8.5,71" fill="none" stroke="#000000" stroke-opacity=".16" stroke-width=".8"/>`
      + `<path d="M0,14 Q-2.5,16 -5,21 M0,24 Q-3.5,26 -7,31 M0,34 Q-4,36 -8.5,41 M0,44 Q-4.5,46 -9.5,51 M0,54 Q-4.5,56 -9.5,61 M0,64 Q-4,66 -8.5,71" fill="none" stroke="#000000" stroke-opacity=".16" stroke-width=".8"/></g>`
      + `<path id="midrib" d="M0,5 L0,95" fill="none" stroke-width="1.3" opacity=".55" stroke-linecap="round"/>`
      + `<linearGradient id="lgFan" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7fae48"/><stop offset="100%" stop-color="#3a5c22"/></linearGradient>`
      + lf('D', 'lgd') + lf('M', 'lgm') + lf('L', 'lgl') + lf('F', 'lgf') + lf('A', 'lgFan')
      + `<path id="calyx" d="${CALYX_PATH}"/>`
      // Big fan leaf: petiole climbing to a node where 7 leaflets radiate.
      // Each leaflet is pushed out by exactly its own length so all the bases
      // converge on the node; outer fingers are shorter and droop wider.
      + `<g id="fan">` +
        `<path d="M0,10 C-1.5,-6 1.5,-24 0,-40" fill="none" stroke="${st.stroke}" stroke-width="3.2" stroke-linecap="round"/>` +
        `<use href="#leafA" transform="translate(0,-40) rotate(0) translate(0,-62) scale(.62)"/>` +
        `<use href="#leafA" transform="translate(0,-40) rotate(-27) translate(0,-51) scale(.51)"/>` +
        `<use href="#leafA" transform="translate(0,-40) rotate(27) translate(0,-51) scale(.51)"/>` +
        `<use href="#leafA" transform="translate(0,-40) rotate(-52) translate(0,-40) scale(.4)"/>` +
        `<use href="#leafA" transform="translate(0,-40) rotate(52) translate(0,-40) scale(.4)"/>` +
        `<use href="#leafA" transform="translate(0,-40) rotate(-78) translate(0,-30) scale(.3)"/>` +
        `<use href="#leafA" transform="translate(0,-40) rotate(78) translate(0,-30) scale(.3)"/></g>`
      + `<clipPath id="budClip"><path d="${BUD_SIL}"/></clipPath>`
      + '</defs>';

    // -- ground + stem + fan leaves (behind the bud) --------------------------
    h += `<ellipse cx="150" cy="250" rx="54" ry="11" fill="#0a1a07" opacity=".6"/>`;
    h += `<path d="M148,224 C148,238 149,246 150,255 C151,246 152,238 152,224 Z" fill="url(#lgd)" stroke="${st.stroke}" stroke-width=".8"/>`;
    h += `<use href="#fan" transform="translate(98,238) rotate(-32) scale(1.12)"/>`;
    h += `<use href="#fan" transform="translate(202,238) rotate(32) scale(1.12)"/>`;
    h += `<path d="${BUD_SIL}" fill="url(#budBase)"/>`;

    // -- calyx cluster ---------------------------------------------------------
    // Three depth passes over the whole cola: big dark bracts deep in the bud,
    // mid tones packing the surface, small pale bracts popping out last (some
    // deliberately straddling the silhouette so the outline stays lumpy).
    const rnd = mulberry32(2024); // fixed seed -> identical bud every load
    let cxg = '<g filter="url(#crumple)">';
    // Rows of bracts sweeping the whole cola like pinecone scales: each depth
    // pass lays evenly spaced calyxes along the silhouette contour (with a
    // little jitter), which guarantees a tight, gap-free packing.
    const pass = (grad, dy, stepX, sMin, sVar, edge, rotMax, y0, y1) => {
      for (let y = y0; y <= y1; y += dy) {
        const w = halfWidth(y) * edge;
        const n = Math.max(1, Math.round((w * 2) / stepX));
        for (let i = 0; i < n; i++) {
          const fx = n === 1 ? 0 : -1 + (2 * i) / (n - 1);
          const x = 150 + fx * w + (rnd() - 0.5) * stepX * 0.6;
          let s = sMin + rnd() * sVar;
          if (y > 192) s *= 0.85;
          else if (y < 82) s *= 0.8;
          const rot = (rnd() - 0.5) * rotMax;
          cxg += `<use href="#calyx" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${s.toFixed(2)})" fill="url(#${grad})" stroke="${st.stroke}" stroke-width=".65" stroke-linejoin="round" opacity=".97"/>`;
        }
      }
    };
    pass('cxD', 16, 19, 0.72, 0.28, 0.95, 40, 76, 220);
    pass('cxM', 14, 17, 0.58, 0.26, 1.00, 48, 72, 222);
    pass('cxL', 15, 26, 0.44, 0.22, 1.06, 56, 74, 206);
    cxg += '</g>';
    h += cxg;

    // -- rounded flanks + bottom core shadow, clipped to the cola --------------
    h += `<g clip-path="url(#budClip)">` +
      `<ellipse cx="112" cy="160" rx="20" ry="64" fill="#000000" opacity=".13"/>` +
      `<ellipse cx="188" cy="160" rx="20" ry="64" fill="#000000" opacity=".13"/>` +
      `<ellipse cx="150" cy="228" rx="44" ry="15" fill="url(#occ)"/></g>`;

    // -- sugar leaves -----------------------------------------------------------
    // A crown of small blades clasping the top of the cola...
    h += leafAt('F', 150, 84, -28, .34) + leafAt('F', 150, 84, -14, .38)
       + leafAt('F', 150, 84, 0, .40) + leafAt('F', 150, 84, 14, .38)
       + leafAt('F', 150, 84, 28, .34);
    // ...and larger ones poking out of the flanks, lower ones drooping.
    h += leafAt('L', 116, 154, -70, .44) + leafAt('L', 105, 178, -96, .40)
       + leafAt('L', 112, 200, -124, .36) + leafAt('L', 128, 215, -152, .31);
    h += leafAt('L', 184, 154, 70, .44) + leafAt('L', 195, 178, 96, .40)
       + leafAt('L', 188, 200, 124, .36) + leafAt('L', 172, 215, 152, .31);

    // -- resin sheen + frost noise, clipped to the cola -------------------------
    h += `<g clip-path="url(#budClip)">` +
      `<ellipse cx="150" cy="112" rx="46" ry="56" fill="url(#frostVeil)"/>` +
      `<rect x="101" y="62" width="98" height="168" fill="url(#noiseFrost)" opacity=".45"/></g>`;

    // -- pistils (short curved tufts rising out of the bracts) ------------------
    const PISTIL_CURLS = [
      'M139,100 Q130,84 136,68', 'M150,94 Q150,78 157,64', 'M161,100 Q170,85 163,69',
      'M127,120 Q114,110 110,96', 'M173,120 Q186,110 190,97',
      'M144,118 Q139,104 143,90', 'M156,118 Q162,104 157,90',
      'M121,152 Q108,144 103,131', 'M179,152 Q192,144 197,132',
      'M133,172 Q120,164 115,151', 'M167,172 Q180,164 185,152',
      'M147,148 Q142,134 147,120', 'M153,148 Q159,134 154,120',
      'M129,198 Q116,192 111,179', 'M171,198 Q184,192 189,180',
      'M150,182 Q147,166 152,150',
    ];
    for (let i = 0; i < PISTIL_CURLS.length; i++) {
      const c = i % 3 === 2 ? st.pistil2 : st.pistil;
      h += `<path d="${PISTIL_CURLS[i]}" stroke="${c}" stroke-width="${i < 3 ? 1.8 : 1.4}" stroke-linecap="round" fill="none" opacity=".92"/>`;
    }
    // Seeded scatter of extra hairs between the bracts.
    const prnd = mulberry32(99);
    for (let i = 0; i < 16; i++) {
      const y = 96 + prnd() * 112;
      const bx = 150 + (prnd() * 2 - 1) * halfWidth(y) * 0.85;
      const len = 9 + prnd() * 13;
      const dir = prnd() < 0.5 ? -1 : 1;
      const ex = bx + dir * len * (0.55 + prnd() * 0.45);
      const ey = y - (4 + prnd() * 9);
      const c1x = bx + dir * len * 0.25, c1y = y - len * 0.35;
      h += `<path d="M${bx.toFixed(1)},${y.toFixed(1)} Q${c1x.toFixed(1)},${c1y.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}" stroke="${i % 3 === 2 ? st.pistil2 : st.pistil}" stroke-width="${(1.2 + prnd() * 0.7).toFixed(1)}" stroke-linecap="round" fill="none" opacity="${(0.75 + prnd() * 0.2).toFixed(2)}"/>`;
    }

    // -- trichomes (frost dots + stalks) --------------------------------------
    const trnd = mulberry32(777);
    let fr = '<g fill="#ffffff">';
    for (let i = 0; i < 13; i++) {
      const x = 116 + trnd() * 68, y = 82 + trnd() * 52;
      const dx = (trnd() - 0.5) * 8, dy = -4 - trnd() * 6;
      fr += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + dx).toFixed(1)}" y2="${(y + dy).toFixed(1)}" stroke="#e8f5e0" stroke-width=".6"/><circle cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="${(1.0 + trnd() * 0.6).toFixed(1)}"/>`;
    }
    const nd = Math.min(44, Math.round(40 * st.frost));
    for (let i = 0; i < nd; i++) {
      const x = Math.round(102 + trnd() * 96), y = Math.round(76 + trnd() * 140);
      fr += `<circle cx="${x}" cy="${y}" r="${(0.8 + trnd() * 0.9).toFixed(1)}"/>`;
    }
    fr += '</g>';
    h += fr;

    // -- specular highlight ----------------------------------------------------
    h += `<ellipse cx="136" cy="100" rx="22" ry="15" fill="#ffffff" opacity=".07"/>`;

    return h;
  }

  return { renderBudSvg, BUD_SIL, LEAFLET_PATH, CALYX_PATH };
});
