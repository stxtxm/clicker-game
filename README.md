# Bud Clicker

> **Rejoindre le projet ?** Lis [`AGENTS.md`](AGENTS.md) — tout y est : stack, workflow git (branches → PR → CI → squash), conventions, boucle d'équilibrage.

A mobile-friendly idle grower: click the bud, craft products, sell for €, automate the whole chain, and expand your operation.

## How to Play

1. **Click the bud** (or press **Space**) to harvest weed (grams). Clicking never becomes obsolete: *Doigts Agiles* upgrades add a share of your per-second production to every click.
2. **Watch the market** — every commodity pulses ±30% on a ~2 min cycle (↗ rising / ↘ falling). Time your bulk sales for peaks: that is where the real money is.
3. **Craft** weed into 8 market products in *Marché* — from 🚬 Joint Roulé (2g → 14 €) to 🌟 Live Rosin (300g → 5 800 €). Higher tiers convert weed at a better €/g but unlock at higher levels.
4. **Sell** raw weed or crafted products with the **x1/x10/x100/MAX** pills and **💸 Tout vendre**.
5. **Automate (sparingly)** in *Upgrades*: each **Chaîne** auto-crafts and sells its product at a hard cap of 1u/s at the *current* market price — your manual stock is never sold for you.
6. **Spend cash on upgrades** — click power, auto-production, storage.
7. **Switch strains** in *Variétés* — 8 genetics with yield/price multipliers, unlocked by level.
8. **Progress** in *Progression* — level up and collect milestone bonuses. Use *Zone de danger* to hard-reset.

> **Stock plein ?** When weed hits the cap the bud pulses red and a clickable `⚠️ Stock plein` banner appears (jumps straight to the Marché) — clicking is wasted until you sell or expand storage.

### The strategic loop

- **Early**: click, sell raw weed at local price peaks, buy Ciseaux/Système Auto.
- **Mid**: unlock craft tiers for better €/g; ride market swings; buy a first Chaîne only when its passive beats what you earn by hand.
- **Late**: chains trickle while you play the market for spikes; strains multiply everything.

## Boucle de progression (simulée)

`test/playthrough.test.js` plays the REAL game logic like a player — 2.5 clicks/s,
crafts the best unlocked product, sells at favorable market pulses, goes AFK 3 min
every 8 min, dumps on return, buys upgrades cheapest-first, storage after capped
sessions, strains and chains when unlocked + affordable — and asserts pacing:

| Milestone (optimal play) | Target |
|---|---|
| First upgrade | ≤ 1 min |
| Level 10 | 6–20 min |
| First Chaîne | 3–15 min |
| Level 20 | 20–60 min |
| 1M lifetime | 6–20 min |
| 10M lifetime | ≥ 9 min |
| 2h ceiling | < 10 B€ lifetime |

An optimal sim ≈ 2-4× faster than a real player. The levers, in order of impact:
**storage cost growth (×3.0)** — income ≈ cap × €/g, so storage gates everything;
**strain costs** (exponential income jumps); **XP_GROWTH 1.32** (level gates);
**product €/g ladder** (crafting depth). Tune those, re-run the sim, compare.

## Progression

Every **produced** gram is XP — stored grams count fully, grams lost to a full stock count for 25%: a full stock slows you without ever hard-locking progression. XP drives a hybrid curve (level N needs `150*(N-1)²*1.28^(N-1)` XP): fast early, then steep.

- **Levels**: each level adds **+8%** to all production. Strains unlock at 1, 4, 8, 13, 19, 26, 34, 45.
- **Strains**: `yieldMult` multiplies weed per click/second, `priceMult` the sale prices — together they are the big progression jumps, gated by steep costs (Purple 4 K€ → Widow 200 M€).
- **Milestones**: permanent bonuses at 200 → +5%, 2.5K → +10%, 30K → +15%, 350K → +25%, 4M → +40%, 50M → +75%.
- **Storage**: `maxWeedStorage()` = (1200 + 700×BoîteÉtanche + 3500×ChambreFroide) × (1 + 1%/level). Harvest is capped, toast `Stock plein !` when full. Income ≈ cap × €/g, so **storage is the main money sink**: its cost grows ×3.0 per level (see Upgrades).

All bonuses multiply.

## Upgrades

| Upgrade | Effect | Base Cost | Growth |
|---------|--------|-----------|--------|
| Ciseaux Pro | +1g per click | 150 € | 1.85 |
| Système Auto | +1g per second | 750 € | 1.85 |
| Doigts Agiles | clicks gain +8% of your prod./s (per level) | 1 200 € | 1.85 |
| Taille Expert | +5g per click | 4 000 € | 1.85 |
| Équipe de Serre | +15g per second | 25 000 € | 1.85 |
| Éclairage Turbo | x2 weed production | 90 000 € | 1.85 |
| Laboratoire+ | x2 all production | 750 000 € | 1.85 |
| Boîte Étanche | +700g max weed | 4 000 € | **3.0** |
| Chambre Froide | +3500g max weed | 240 000 € | **3.0** |

Cost = `BASE_COST * growth^(level - (harvest?1:0))`. Hardware grows ×1.85/level; storage grows ×3.0/level because income scales with cap — each storage level must take meaningfully longer to pay back.

## Market Pulse

All prices (weed included) oscillate between **-30% and +30%** of their base on independent ~2 min sine cycles (`MARKET` in `js/game.js`, deterministic in time — no state). The Marché shows each price with its trend (↗ rising / ↘ falling / → peak or trough). Selling a MAX stock at +30% instead of -30% is a 1.86× difference: timing matters more than volume.

## Market Products

8 products in `PRODUCTS` (`js/game.js`). Crafting consumes weed from total stock; sale price = `price × strain.priceMult × pulse`. €/g improves with tier, so crafting big beats selling raw — but only worth it when the market cooperates.

| Product | Weed | Base Price | €/g | Unlock |
|---------|------|-----------|-----|--------|
| 🚬 Joint Roulé | 2g | 14 € | 7 | 1 |
| 🛍️ Sachet Scellé | 6g | 46 € | 7.7 | 4 |
| 📦 Hash Conditionné | 12g | 115 € | 9.6 | 8 |
| 🍰 Space Cake | 25g | 290 € | 11.6 | 13 |
| 🍯 Résine Supérieure | 40g | 550 € | 13.8 | 19 |
| 💧 Huile Verte | 80g | 1 200 € | 15 | 26 |
| 💎 Shatter Pur | 150g | 2 600 € | 17.3 | 34 |
| 🌟 Live Rosin | 300g | 5 800 € | 19.3 | 45 |

Market actions support quantity presets **x1 / x10 / x100 / MAX** (craft & sell) plus a global **💸 Tout vendre**.

## Automation (Chaînes)

Adventure-Capitalist-style managers in `AUTOMATION` (`js/game.js`), listed in the **Upgrades** tab with the same card format as hardware: for every product there is **one** one-time hire (`auto-<productId>`) that unlocks the full chain at once:

- ⚙️ **Ouvrier** — auto-crafts **at most 1 unit/s** while weed lasts.
- 💰 **Dealer** — sells up to **2u/s**: the chain's fresh output first, then dips **1u/s into your manual stock at the current market price** (pulse included).

The trade-off — idle comfort vs strategic leak:

1. Passive income flows even with zero weed production, but your hoarded stock slowly leaks, sometimes at a -30% pulse: craft-and-hoard forever is no longer free.
2. Hand-made bulk sales (craft x100/MAX + sell at a peak) still beat the dealer's dribble — timing your big sale before the leak eats it is the challenge.
3. Sustaining a tier needs huge weed income (joint 2g/s → rosin 300g/s), so late chains idle until your production catches up.
4. Costs ≈ `500× unit price`, unlocked 5 levels after the product itself:

| Chaîne | Cost | Unlock | Passive max |
|--------|------|--------|-------------|
| Joint Roulé | 7 000 € | 6 | 14 €/s (2g/s) |
| Sachet Scellé | 23 000 € | 9 | 46 €/s (6g/s) |
| Hash Conditionné | 57 500 € | 13 | 115 €/s (12g/s) |
| Space Cake | 145 000 € | 18 | 290 €/s (25g/s) |
| Résine Supérieure | 275 000 € | 24 | 550 €/s (40g/s) |
| Huile Verte | 600 000 € | 31 | 1 200 €/s (80g/s) |
| Shatter Pur | 1 300 000 € | 39 | 2 600 €/s (150g/s) |
| Live Rosin | 2 900 000 € | 50 | 5 800 €/s (300g/s) |

ROI is uniform (~400 s at full speed); the gating factor is weed supply. Owned cards show `✓ Actif`; higher tiers show their level gate.

`autoTick()` runs every second after weed production with deliberate ordering:

1. Crafters work **most expensive product first** — when weed is scarce, the best €/g conversion wins.
2. Dealers then empty their product's stock (freshly crafted units included), so a craft+sell pair is fully idle income.

Automation grants no XP (consistent with manual craft/sell). Owned flags live in `state.auto = { craft: {<productId>: true}, sell: {…} }` and are sanitized on load. Full chain example at endgame: Ouvrier+Dealer Live Rosin ≈ 8 500 €/s before strain multipliers.

## Strains

8 genetics, each with `yieldMult`/`priceMult` and its own bud palette. See `STRAINS` in `js/game.js`.

## Running the Game

No build step. Serve the folder:

```bash
./start.sh                 # restarts background server (port 8000)
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

### Server scripts

- `server.py` — prints local + Tailscale URLs
- `run_server.py` — minimal server, chdirs first
- `start.sh` — restarts background server

## Running the Tests

```bash
npm test        # node --test — 70 unit + playthrough + e2e (e2e skips without a browser)
```

- `test/game.test.js` — economy (costs, sell, craft, storage), strains + level gates, progression (curve, XP, milestones, productionMult), market products (catalog, qty craft/sell, pulse bounds & trends), automation (hires, level gate, autoTick ordering & isolation, save roundtrip), edge cases & save corruption hardening
- `test/playthrough.test.js` — simulated optimal player (see « Boucle de progression ») asserting the pacing curve
- `test/e2e.test.js` — drives the REAL game in headless chromium (13 scenarios: harvest click/space, tabs, market render & trends, sell, qty pills, craft+sell, upgrade buy, automation level lock, storage-full banner & navigation, save persistence, hard reset). Skips gracefully if no browser; CI provides one.
- `test/bud.test.js` — SVG validity, determinism, `url(#…)` regression, structural counts (72 calyxes, 116 bracts total via rows, fan leaves, sugar leaves)

## CI & Branch Policy

- Every PR targeting `master` runs the full suite (unit + playthrough + e2e) via GitHub Actions: `.github/workflows/ci.yml`. Merge with **Squash and merge**.
- `master` is protected: no direct pushes, PR required, checks must pass. (Settings → Branches → Branch protection / Rulesets.)

## Project Structure

```
clicker-game/
├── index.html        # UI + CSS
├── js/game.js        # Pure logic (UMD: window.BudGame)
├── js/bud.js         # Pure SVG renderer (UMD: window.BudRender)
├── js/ui.js          # DOM glue: events, autoProduce, save/load, tabs
├── test/             # node:test suite
├── package.json
├── server.py
├── run_server.py
├── start.sh
└── README.md
```

### Modules

- **`js/game.js`** — no DOM. Exports `UPGRADES`, `STRAINS`, `PRODUCTS`, `AUTOMATION`, `BASE_COST`, `DEFAULT_LEVELS`, `XP_BASE`, `XP_GROWTH`, `MILESTONES`, `mulberry32`, `maxWeedStorage`, `defaultState`, `getStrain`, `getProduct`, `productUnitPrice`, `xpForLevel`, `levelFromXp`, `xpProgress`, `productionMult`, `earnXp`, `checkMilestones`, `perClick`, `perSecond`, `upgradeCost`, `buyUpgrade`, `hasAuto`, `buyAutomation`, `autoTick`, `craftProduct`, `sellStock`, `equipStrain`, `serialize`, `deserialize`. State under localStorage `budClicker`.
- **`js/bud.js`** — `renderBudSvg(strainId)` deterministic (seeds: calyxes 2024, pistils 99, trichomes 777).
- **`js/ui.js`** — wiring, market rendering (`renderMarket` qty pills), automation hires rendered in the Upgrades view (`renderAutomation`), `autoProduce` 1s (weed growth + `autoTick`), autosave 10s, Space-to-harvest, tabs, storage-full feedback (pulsing bud + warning banner), stock-full click guard.

### View layout

- **Récolte** — bud, stats, strain badge, stock-full banner.
- **Marché** — quantity pills, 💸 Tout vendre, the 9 product cards. Nothing else.
- **Upgrades** — hardware + automation (8 product chains), same card format.
- **Variétés** — buy/equip strains.
- **Progression** — XP, milestones, hard-reset.

## Customization

- **Strains** — edit `STRAINS` in `js/game.js` (palette, frost, unlock, cost, yield/price).
- **Economy** — edit `UPGRADES` and `PRODUCTS` in `js/game.js`; automation costs derive from product prices.
- **Progression** — edit `XP_BASE`/`XP_GROWTH`, `MILESTONES` in `js/game.js`.
- **Leaf layout** — fan positions in `renderBudSvg` (`js/bud.js`), keep inside 300×300 viewBox.
