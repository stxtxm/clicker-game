# Bud Clicker

A mobile-friendly idle grower: click the bud, craft products, sell for €, automate the whole chain, and expand your operation.

## How to Play

1. **Click the bud** (or press **Space**) to harvest weed (grams). Clicking never becomes obsolete: *Doigts Agiles* upgrades add a share of your per-second production to every click.
2. **Watch the market** — every commodity pulses ±30% on a ~2 min cycle (↗ rising / ↘ falling). Time your bulk sales for peaks: that is where the real money is.
3. **Craft** weed into 8 market products in *Marché* — from 🚬 Joint Roulé (2g → 18 €) to 🌟 Live Rosin (300g → 7 650 €). Higher tiers convert weed at a better €/g but unlock at higher levels.
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

## Progression

Every harvested gram is 1 **XP**, earned forever. XP drives a hybrid curve (level N needs `150*(N-1)²*1.28^(N-1)` XP): fast early, then steep.

- **Levels**: each level adds **+8%** to all production. Strains unlock at 1, 4, 8, 13, 19, 26, 34, 45.
- **Strains**: `yieldMult` multiplies weed per click/second.
- **Milestones**: permanent bonuses at 200 → +5%, 2.5K → +10%, 30K → +15%, 350K → +25%, 4M → +40%, 50M → +75%.
- **Storage**: `maxWeedStorage()` = 1000 + 500×BoîteÉtanche + 2500×ChambreFroide. Harvest is capped, toast `Stock plein !` when full.

All bonuses multiply.

## Upgrades

| Upgrade | Effect | Base Cost |
|---------|--------|-----------|
| Ciseaux Pro | +1g per click | 100 € |
| Système Auto | +1g per second | 500 € |
| Doigts Agiles | clicks gain +8% of your prod./s (per level) | 800 € |
| Taille Expert | +5g per click | 2 500 € |
| Équipe de Serre | +15g per second | 12 000 € |
| Éclairage Turbo | x2 weed production | 60 000 € |
| Laboratoire+ | x2 all production | 400 000 € |
| Boîte Étanche | +500g max weed | 600 € |
| Chambre Froide | +2500g max weed | 15 000 € |

Cost = `BASE_COST * COST_GROWTH^(level - (harvest?1:0))`, `COST_GROWTH = 1.75` — gentler than a doubling, no dead-end walls.

## Market Pulse

All prices (weed included) oscillate between **-30% and +30%** of their base on independent ~2 min sine cycles (`MARKET` in `js/game.js`, deterministic in time — no state). The Marché shows each price with its trend (↗ rising / ↘ falling / → peak or trough). Selling a MAX stock at +30% instead of -30% is a 1.86× difference: timing matters more than volume.

## Market Products

8 products in `PRODUCTS` (`js/game.js`). Crafting consumes weed from total stock; sale price = `price × strain.priceMult × pulse`. €/g improves with tier, so crafting big beats selling raw — but only worth it when the market cooperates.

| Product | Weed | Base Price | €/g | Unlock |
|---------|------|-----------|-----|--------|
| 🚬 Joint Roulé | 2g | 18 € | 9 | 1 |
| 🛍️ Sachet Scellé | 6g | 60 € | 10 | 4 |
| 📦 Hash Conditionné | 12g | 150 € | 12.5 | 8 |
| 🍰 Space Cake | 25g | 380 € | 15.2 | 13 |
| 🍯 Résine Supérieure | 40g | 720 € | 18 | 19 |
| 💧 Huile Verte | 80g | 1 600 € | 20 | 26 |
| 💎 Shatter Pur | 150g | 3 400 € | 22.7 | 34 |
| 🌟 Live Rosin | 300g | 7 650 € | 25.5 | 45 |

Market actions support quantity presets **x1 / x10 / x100 / MAX** (craft & sell) plus a global **💸 Tout vendre**.

## Automation (Chaînes)

Adventure-Capitalist-style managers in `AUTOMATION` (`js/game.js`), listed in the **Upgrades** tab with the same card format as hardware: for every product there is **one** one-time hire (`auto-<productId>`) that unlocks the full chain at once:

- ⚙️ **Ouvrier** — auto-crafts **at most 1 unit/s** while weed lasts.
- 💰 **Dealer** — sells **exactly what the chain just crafted**, every tick.

Hard limits keeping the game interactive — automation never plays for you:

1. Throughput is capped at 1u/s per product → passive income = `price × strainMult × pulse` per second max.
2. Dealers never touch manual stock: hand-made bulk sales (craft x100/MAX + sell at a peak) stay the big-money interactive move.
3. Sustaining a tier needs huge weed income (joint 2g/s → rosin 300g/s), so late chains idle until your production catches up.
4. Costs ≈ `400× unit price`, unlocked 5 levels after the product itself:

| Chaîne | Cost | Unlock | Passive max |
|--------|------|--------|-------------|
| Joint Roulé | 7 200 € | 6 | 18 €/s (2g/s) |
| Sachet Scellé | 24 000 € | 9 | 60 €/s (6g/s) |
| Hash Conditionné | 60 000 € | 13 | 150 €/s (12g/s) |
| Space Cake | 152 000 € | 18 | 380 €/s (25g/s) |
| Résine Supérieure | 288 000 € | 24 | 720 €/s (40g/s) |
| Huile Verte | 640 000 € | 31 | 1 600 €/s (80g/s) |
| Shatter Pur | 1 360 000 € | 39 | 3 400 €/s (150g/s) |
| Live Rosin | 3 060 000 € | 50 | 7 650 €/s (300g/s) |

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
npm test        # node --test, 50 tests
```

- `test/game.test.js` — economy (costs, sell, craft, storage), strains + level gates, progression (curve, XP, milestones, productionMult), market products (catalog, qty craft/sell), automation (hires, autoTick ordering & isolation, save roundtrip), save/load
- `test/bud.test.js` — SVG validity, determinism, `url(#…)` regression, structural counts (72 calyxes, 116 bracts total via rows, fan leaves, sugar leaves)

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

- **`js/game.js`** — no DOM. Exports `UPGRADES`, `STRAINS`, `PRODUCTS`, `AUTOMATION`, `BASE_COST`, `DEFAULT_LEVELS`, `XP_BASE`, `XP_GROWTH`, `MILESTONES`, `mulberry32`, `maxWeedStorage`, `defaultState`, `getStrain`, `getProduct`, `productUnitPrice`, `xpForLevel`, `levelFromXp`, `xpProgress`, `productionMult`, `earnXp`, `checkMilestones`, `perClick`, `perSecond`, `upgradeCost`, `buyUpgrade`, `hasAuto`, `buyAutomation`, `autoTick`, `craftProduct`, `sellStock`, `sellByStrain`, `equipStrain`, `serialize`, `deserialize`. State under localStorage `budClicker`.
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
