/**
 * Tests for the SVG bud renderer (js/bud.js).
 * Run with: `npm test`  (or `node --test test/`)
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const Game = require('../js/game.js');
const Bud = require('../js/bud.js');

const STRAIN_IDS = Game.STRAINS.map((s) => s.id);

/** Very small XML well-formedness check for the tags the renderer emits. */
function assertWellFormed(svg) {
  // Tags that must have a matching close tag.
  const containers = ['defs', 'g', 'filter', 'linearGradient', 'radialGradient', 'clipPath'];
  const stack = [];
  const re = /<\s*(\/?)\s*([a-zA-Z]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)\s*>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const [, close, name, , selfClose] = m;
    if (selfClose === '/') continue;
    if (close === '/') {
      assert.strictEqual(stack.pop(), name, `unexpected </${name}>`);
    } else if (containers.includes(name)) {
      stack.push(name);
    }
  }
  assert.deepStrictEqual(stack, [], 'unclosed tags: ' + stack.join(','));
}

test('renders a valid bud for every strain', () => {
  for (const id of STRAIN_IDS) {
    const svg = Bud.renderBudSvg(id);
    assert.ok(typeof svg === 'string' && svg.length > 1000, id);
    assert.ok(svg.startsWith('<defs>'), id + ': starts with defs');
    assert.ok(svg.includes('</defs>'), id + ': closes defs');
    assertWellFormed(svg);
  }
});

test('unknown strain falls back to the first one', () => {
  const fallback = Bud.renderBudSvg('does-not-exist');
  assert.strictEqual(fallback, Bud.renderBudSvg('green'));
});

test('rendering is deterministic (same strain -> same SVG)', () => {
  for (const id of STRAIN_IDS) {
    assert.strictEqual(Bud.renderBudSvg(id), Bud.renderBudSvg(id));
  }
  // Distinct strains produce distinct output.
  const outputs = new Set(STRAIN_IDS.map((id) => Bud.renderBudSvg(id)));
  assert.strictEqual(outputs.size, STRAIN_IDS.length);
});

test('no NaN or undefined leaks into the markup', () => {
  for (const id of STRAIN_IDS) {
    const svg = Bud.renderBudSvg(id);
    assert.ok(!svg.includes('NaN'), id);
    assert.ok(!svg.includes('undefined'), id);
    assert.ok(!svg.includes('null'), id);
  }
});

test('every url(...) gradient reference is prefixed with # (regression: black leaves)', () => {
  for (const id of STRAIN_IDS) {
    const svg = Bud.renderBudSvg(id);
    const refs = [...svg.matchAll(/\burl\(\s*["']?([^"')]+)["']?\s*\)/g)];
    assert.ok(refs.length > 0, id + ': some url() refs expected');
    for (const ref of refs) {
      assert.ok(ref[1].startsWith('#'), `${id}: bad gradient ref ${ref[1]}`);
    }
  }
});

test('structural counts (calyxes, fan leaflets, sugar leaves, fans)', () => {
  for (const id of STRAIN_IDS) {
    const svg = Bud.renderBudSvg(id);
    assert.strictEqual((svg.match(/href="#calyx"/g) || []).length, 42, id);
    // the fan <def> holds 7 leaflets; it is shared by both fan leaves
    assert.strictEqual((svg.match(/href="#leafA"/g) || []).length, 7, id);
    // 5 crown (F) + 8 side (L) sugar leaves
    assert.strictEqual((svg.match(/href="#leafF"/g) || []).length, 5, id);
    assert.strictEqual((svg.match(/href="#leafL"/g) || []).length, 8, id);
    // 2 fan leaves placed behind the bud
    assert.strictEqual((svg.match(/href="#fan"/g) || []).length, 2, id);
  }
});

test('all required gradient/clip ids are defined', () => {
  for (const id of STRAIN_IDS) {
    const svg = Bud.renderBudSvg(id);
    for (const gid of ['lgd', 'lgm', 'lgl', 'lgf', 'lgFan',
                       'cxD', 'cxM', 'cxL', 'frostVeil', 'occ']) {
      assert.ok(svg.includes(`id="${gid}"`), `${id}: gradient ${gid}`);
    }
    assert.ok(svg.includes('id="budClip"'), id);
    assert.ok(svg.includes('id="crumple"'), id);
    assert.ok(svg.includes('id="noiseFrost"'), id);
  }
});

test('each strain palette color appears in its render', () => {
  for (const st of Game.STRAINS) {
    const svg = Bud.renderBudSvg(st.id);
    assert.ok(svg.includes(st.m[0]), st.id + ': mid color present');
    assert.ok(svg.includes(st.d[1]), st.id + ': dark color present');
    assert.ok(svg.includes(st.pistil), st.id + ': pistil color present');
    assert.ok(svg.includes(st.vein), st.id + ': vein color present');
  }
});

test('frost scaling caps the trichome dot count', () => {
  const counts = {};
  for (const st of Game.STRAINS) {
    const svg = Bud.renderBudSvg(st.id);
    // dots = plain <circle> inside the white trichome <g>, minus the 13 stalked ones
    const group = svg.match(/<g fill="#ffffff">(.*?)<\/g>/s)[1];
    const stalked = (group.match(/<line/g) || []).length;
    const circles = (group.match(/<circle/g) || []).length;
    const dots = circles - stalked;
    counts[st.id] = dots;
    assert.ok(dots <= 44, st.id + ': capped at 44, got ' + dots);
    assert.strictEqual(stalked, 13, st.id + ': 13 stalked trichomes');
  }
  // more frost on blue, less on green
  assert.ok(counts.blue > counts.green, 'blue frostier than green');
});

test('trichome stalked caps and pistils are deterministic', () => {
  const svg = Bud.renderBudSvg('green');
  const lines = (svg.match(/<line/g) || []).length;
  const circleGroups = svg.match(/<g fill="#ffffff">(.*?)<\/g>/s)[1];
  const stalked = (circleGroups.match(/<line/g) || []).length;
  assert.strictEqual(stalked, 13);
  assert.ok(lines > 13); // petiole + vein + stalks + pistil hairs
});