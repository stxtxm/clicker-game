# Bud Clicker

A mobile-friendly idle grower: click the bud, craft products, sell for €, automate the whole chain, and expand your operation.

## How to Play

1. **Click the bud** (or press **Space**) to harvest weed (grams).
2. **Craft** weed into 8 market products in *Marché* — from 🚬 Joint Roulé (2g → 28 €) to 🌟 Live Rosin (300g → 8 500 €). Higher tiers convert weed at a better €/g but unlock at higher levels.
3. **Sell** raw weed (12 €/g) or crafted products. Prices scale with equipped strain (`priceMult`). Use the **x1/x10/x100/MAX** pills and **💸 Tout vendre** to move big stocks fast.
4. **Automate (sparingly)** in *Upgrades*: each **Chaîne** auto-crafts and sells its product at a hard cap of 1u/s — your manual stock is never sold for you. Big money stays in hand-made bulk sales.
5. **Spend cash on upgrades** — *Upgrades* tab holds hardware (click power, auto-production, storage) **and** all automation hires.
6. **Switch strains** in *Variétés* — 8 genetics with yield/price multipliers, unlocked by level.
7. **Progress** in *Progression* — level up and collect milestone bonuses. Use *Zone de danger* to hard-reset.

> **Stock plein ?** When weed hits the cap the bud pulses red, a clickable `⚠️ Stock plein` banner appears (jumps straight to the Marché) and clicks spawn a red `Plein !` — clicking is wasted until you sell or expand storage.

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
| Ciseaux Pro | +1g per click | 80 € |
| Système Auto | +1g per second | 350 € |
| Taille Expert | +5g per click | 900 € |
| Équipe de Serre | +15g per second | 3500 € |
| Éclairage Turbo | x2 weed production | 18000 € |
| Laboratoire+ | x2 all production | 90000 € |
| Boîte Étanche | +500g max weed | 500 € |
| Chambre Froide | +2500g max weed | 8500 € |

Cost = `BASE_COST * 2.1^(level - (harvest?1:0))`.

## Market Products

8 products in `PRODUCTS` (`js/game.js`). Crafting consumes weed from total stock; sale price = `price × strain.priceMult`. €/g improves with tier, so crafting big is always better than selling raw.

| Product | Weed | Base Price | €/g | Unlock |
|---------|------|-----------|-----|--------|
| 🚬 Joint Roulé | 2g | 28 € | 14 | 1 |
| 🛍️ Sachet Scellé | 6g | 90 € | 15 | 4 |
| 📦 Hash Conditionné | 12g | 200 € | 16.7 | 8 |
| 🍰 Space Cake | 25g | 450 € | 18 | 13 |
| 🍯 Résine Supérieure | 40g | 800 € | 20 | 19 |
| 💧 Huile Verte | 80g | 1 800 € | 22.5 | 26 |
| 💎 Shatter Pur | 150g | 3 800 € | 25.3 | 34 |
| 🌟 Live Rosin | 300g | 8 500 € | 28.3 | 45 |

Market actions support quantity presets **x1 / x10 / x100 / MAX** (craft & sell) plus a global **💸 Tout vendre**.

## Automation (Chaînes)

Adventure-Capitalist-style managers in `AUTOMATION` (`js/game.js`), listed in the **Upgrades** tab with the same card format as hardware: for every product there is **one** one-time hire (`auto-<productId>`) that unlocks the full chain at once:

- ⚙️ **Ouvrier** — auto-crafts **at most 1 unit/s** while weed lasts.
- 💰 **Dealer** — sells **exactly what the chain just crafted**, every tick.

Hard limits keeping the game interactive — automation never plays for you:

1. Throughput is capped at 1u/s per product → passive income = `price × strainMult` per second max.
2. Dealers never touch manual stock: hand-made bulk sales (craft x100/MAX + sell) stay the big-money interactive move.
3. Sustaining a tier needs huge weed income (joint 2g/s → rosin 300g/s), so late chains idle until your production catches up.
4. Costs ≈ `400× unit price`, unlocked 5 levels after the product itself:

| Chaîne | Cost | Unlock | Passive max |
|--------|------|--------|-------------|
| Joint Roulé | 11 200 € | 6 | 28 €/s (2g/s) |
| Sachet Scellé | 36 000 € | 9 | 90 €/s (6g/s) |
| Hash Conditionné | 80 000 € | 13 | 200 €/s (12g/s) |
| Space Cake | 180 000 € | 18 | 450 €/s (25g/s) |
| Résine Supérieure | 320 000 € | 24 | 800 €/s (40g/s) |
| Huile Verte | 720 000 € | 31 | 1 800 €/s (80g/s) |
| Shatter Pur | 1 520 000 € | 39 | 3 800 €/s (150g/s) |
| Live Rosin | 3 400 000 € | 50 | 8 500 €/s (300g/s) |

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
npm test        # node --test, 48 tests
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
