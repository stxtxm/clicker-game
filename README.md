# Bud Clicker

A mobile-friendly idle grower: click the bud, craft concentrates, sell for €, and expand your operation.

## How to Play

1. **Click the bud** (or press **Space**) to harvest weed (grams).
2. **Craft** weed into concentrates in the *Marché*:
   - **Hash** — 5g weed → 1 hash (65 €/u)
   - **Résine** — 20g weed → 1 résine (280 €/u)
   > Weed must be crafted before selling — the harvest quick-sell was removed, you must go through the shop.
3. **Sell** weed (12 €/g), hash and résine for cash. Prices scale with equipped strain (`priceMult`).
4. **Spend cash on upgrades** — click power, auto-production and storage.
5. **Switch strains** in *Variétés* — 8 genetics with yield/price multipliers, unlocked by level.
6. **Progress** in *Progression* — level up and collect milestone bonuses. Use *Zone de danger* to hard-reset.

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
npm test        # node --test, 36 tests
```

- `test/game.test.js` — economy (costs, sell, craft, storage), strains + level gates, progression (curve, XP, milestones, productionMult), save/load
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

- **`js/game.js`** — no DOM. Exports `UPGRADES`, `STRAINS`, `BASE_COST`, `DEFAULT_LEVELS`, `HASH_CONVERT_COST`, `RESIN_CONVERT_COST`, `XP_BASE`, `XP_GROWTH`, `MILESTONES`, `mulberry32`, `maxWeedStorage`, `defaultState`, `getStrain`, `xpForLevel`, `levelFromXp`, `xpProgress`, `productionMult`, `earnXp`, `checkMilestones`, `perClick`, `perSecond`, `upgradeCost`, `buyUpgrade`, `craftProduct`, `sellStock`, `equipStrain`, `serialize`, `deserialize`. State under localStorage `budClicker`.
- **`js/bud.js`** — `renderBudSvg(strainId)` deterministic (seeds: calyxes 2024, pistils 99, trichomes 777).
- **`js/ui.js`** — wiring, `autoProduce` 1s, autosave 10s, Space-to-harvest, tabs, storage cap, shop extras (stockage & variétés débloquées dans le Marché).

## Customization

- **Strains** — edit `STRAINS` in `js/game.js` (palette, frost, unlock, cost, yield/price).
- **Economy** — edit `UPGRADES`, `BASE_COST`, `HASH/RESIN_CONVERT_COST` in `js/game.js`.
- **Progression** — edit `XP_BASE`/`XP_GROWTH`, `MILESTONES` in `js/game.js`.
- **Leaf layout** — fan positions in `renderBudSvg` (`js/bud.js`), keep inside 300×300 viewBox.
