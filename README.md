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

> **Pas de cap de stock** : la weed s'accumule librement, cliquer n'est jamais bloqué. Au-delà d'un plancher (60s de production), le brut se dégrade lentement (1%/s) — vendre ou fabriquer reste la bonne idée, sans mur ni bannière.

### The strategic loop

- **Early**: click, sell raw weed at local price peaks, buy Ciseaux/Système Auto.
- **Mid**: unlock craft tiers for better €/g; ride market swings; buy a first Chaîne only when its passive beats what you earn by hand.
- **Late**: chains trickle while you play the market for spikes; strains multiply everything.

## Boucle de progression (simulée)

`test/playthrough.test.js` plays the REAL game logic like a player — 2.5 clicks/s,
crafts the best unlocked product, sells at favorable market pulses, goes AFK 3 min
every 8 min, dumps on return, buys upgrades cheapest-first, distribution paliers,
strains and chains when unlocked + affordable — and asserts pacing:

| Milestone (optimal play) | Target |
|---|---|
| First upgrade | ≤ 1 min |
| Level 10 | 5–20 min |
| First Chaîne | 2–15 min |
| Level 20 | 9–60 min |
| Level 30 | 14–90 min |
| 1M lifetime | 4–20 min |
| 10M lifetime | ≥ 9 min |
| Runaway guard | < 5 P€ / 2h |

An optimal sim ≈ 2-4× faster than a real player. The levers, in order of impact:
**chainShare** (`dist1/2/3`, ×1.9 growth) gate le revenu idle ; **spoilage doux** (1%/s du surplus) remplace le cap et borne l'économie sans jamais bloquer ;
**strain costs** (10 variétés) et **XP_GROWTH 1.42** espacent les unlocks ;
**12 produits** + **14 upgrades** + **9 jalons** rallongent la courbe.

## Progression

Every **produced** gram is XP — **plus aucun cap** : cliquer n'est jamais bloqué. XP drives a hybrid curve (level N needs `150*(N-1)²*1.42^(N-1)` XP) — **allongée** vers 75 niveaux.

- **Levels**: each level adds **+8%** to all production. Strains unlock at 1, 4, 8, 13, 19, 26, 34, 45, 52, 62.
- **Strains**: `yieldMult` multiplies weed per click/second, `priceMult` the sale prices — 10 variétés (Green→Gelato 33), gated by coûts exponentiels (Purple 4K → Gelato 2Md€).
- **Milestones**: 9 jalons à 200→+5%, 2.5K→+10%, 30K→+15%, 350K→+25%, 4M→+40%, 50M→+75%, 150M→+60%, 400M→+80%, 1Md→+100%.
- **Pas de cap de stock** : `addWeed` garde tout. La pression est remplacée par :
  - **Spoilage doux** — au-delà de `max(500g, 60s de prod/s)`, le brut se dégrade de **1%/s** (`applySpoil`) : thésauriser n'est plus rentable, mais rien ne bloque jamais ;
  - **chainShare** — les chaînes ne convertissent que 15% + paliers Distribution du flux produit : le vrai gate late-game est l'automatisation achetable, pas un mur.

All bonuses multiply (`level × strain × milestones × tier`).

## Upgrades

| Upgrade | Effect | Base Cost | Growth |
|---------|--------|-----------|--------|
| Ciseaux Pro | +1g per click | 120 € | 1.35 |
| Système Auto | +1g per second | 550 € | 1.35 |
| Doigts Agiles | clicks gain +8% of your prod./s (per level) | 1 200 € | 1.35 |
| Taille Expert | +5g per click | 4 000 € | 1.35 |
| Brume Foliaire | +2g per second | 12 000 € | 1.35 |
| Trimmer Pro | +5g per click | 25 000 € | 1.35 |
| Équipe de Serre | +15g per second | 25 000 € | 1.35 |
| Injecteur CO₂ | +15g per second | 180 000 € | 1.35 |
| Éclairage Turbo | x2 weed production | 90 000 € | 1.35 |
| Chambre UV | x1.4 production globale | 500 000 € | 1.35 |
| Laboratoire+ | x2 production globale | 750 000 € | 1.35 |
| Réseau Local | +3% flux chaînes | 4 000 € | **1.9** |
| Logistique Régionale | +6% flux chaînes | 240 000 € | **1.9** |
| Entrepôts Nationaux | +10% flux chaînes | 2 000 000 € | **1.9** |

Cost = `BASE_COST * growth^(level - (harvest?1:0))`. Hardware grows ×1.35/level ; distribution grows ×1.9/level — le sink late-game élargit l'automatisation au lieu d'un cap artificiel.

**Bulk & ROI (AdvCap)** — `x1 / x10` toggle dans Upgrades, `upgradeBulkCost` (somme géométrique), `buyUpgradeBulk`, `timeToAfford` affiché `(12s / 3m)` à côté du coût. Le joueur voit instantanément le prochain palier rentable.

**Paliers (Cookie/AdvCap)** — tous les **40** niveaux d'un même upgrade → `×2` permanent (stack : 40→×2, 80→×4). Affiché sur la carte avec compte à rebours ; bordure dorée quand proche. Espacés pour lisser le late-game ; cliquer reste utile via `Doigts Agiles`.

**Offline (AdvCap)** — `lastSeen` timestamp, `offlineTick` à 50% pendant jusqu'à 8h (cap 28 800s), spoilage appliqué au retour. Toast `+Xg +Y€` si >30s d'absence.

## Market Pulse

All prices (weed included) oscillate between **-30% and +30%** of their base on independent ~2 min sine cycles (`MARKET` in `js/game.js`, deterministic in time — no state). The Marché shows each price with its trend (↗ rising / ↘ falling / → peak or trough). Selling a MAX stock at +30% instead of -30% is a 1.86× difference: timing matters more than volume.

**Ruées (spikes)** — ~1 fois/70s, un marché **débloqué** aléatoire (weed inclus) passe `×1.6` pendant 15s (`SPIKE_*` dans `js/game.js`, état `spikeUntil/spikeProduct/spikeNextAt`, `isSpikeActive/spikeMult/maybeTriggerSpike`). Déclenché dans `autoProduce` (1.4%/s), toast `🔥 Ruée sur X !` + carte dorée `spike` + prix `🔥`. Jamais sur un produit encore verrouillé par le niveau.

## Market Products

12 products in `PRODUCTS` (`js/game.js`). Crafting consumes weed from total stock; sale price = `price × strain.priceMult × pulse × spike`. €/g improves with tier, so crafting big beats selling raw — mais demande du weed et du niveau.

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
| 🔋 Vape Cart | 600g | 12 500 € | 20.8 | 52 |
| 💠 THC Diamonds | 1200g | 26 000 € | 21.7 | 60 |
| 🌙 Moonrock | 2500g | 55 000 € | 22 | 68 |
| 🥤 Soda THC | 5000g | 115 000 € | 23 | 75 |

Market actions support quantity presets **x1 / x10 / x100 / MAX** (craft & sell) plus a global **💸 Tout vendre**.

## Automation (Chaînes)

Adventure-Capitalist-style managers in `AUTOMATION` (`js/game.js`), listed in the **Upgrades** tab with the same card format as hardware: for every product there is **one** one-time hire (`auto-<productId>`) that unlocks the full chain at once:

- ⚙️ **Ouvrier** — converts up to **15% of the grams that actually entered storage** this tick (`CHAIN_FLOW_SHARE`). When your stock is full the chains pause — they never drain your pile or your hand-made stock.
- 💰 **Dealer** — sells **exactly the chain's fresh output** at the current market price (pulse included). Your hoarded stock stays yours.

The trade-off — idle comfort vs strategic leak:

1. Money flows proportionally to production even while AFK, but hoarded stock slowly leaks, sometimes at a -30% pulse: craft-and-hoard forever is not free.
2. Hand-made bulk sales (craft x100/MAX + sell at a +30% peak) still beat the continuous conversion — timing your big sale is the challenge.
3. With 3 chains ~45% of the flow is auto-converted; the rest accumulates, keeping storage and manual peak-sales relevant.
4. Costs ≈ `400× unit price` (B1, was 500×), unlocked 4 levels after the product itself (was 5):

| Chaîne | Cost | Unlock | Passive max |
|--------|------|--------|-------------|
| Joint Roulé | 5 600 € | 5 | 14 €/s (2g/s) |
| Sachet Scellé | 18 400 € | 8 | 46 €/s (6g/s) |
| Hash Conditionné | 46 000 € | 12 | 115 €/s (12g/s) |
| Space Cake | 116 000 € | 17 | 290 €/s (25g/s) |
| Résine Supérieure | 220 000 € | 23 | 550 €/s (40g/s) |
| Huile Verte | 480 000 € | 30 | 1 200 €/s (80g/s) |
| Shatter Pur | 1 040 000 € | 38 | 2 600 €/s (150g/s) |
| Live Rosin | 2 320 000 € | 49 | 5 800 €/s (300g/s) |
| Vape Cart | 5 000 000 € | 56 | 12 500 €/s (600g/s) |
| THC Diamonds | 10 400 000 € | 64 | 26 000 €/s (1200g/s) |
| Moonrock | 22 000 000 € | 72 | 55 000 €/s (2500g/s) |
| Soda THC | 46 000 000 € | 79 | 115 000 €/s (5000g/s) |

ROI is uniform (~400 s at full speed); the gating factor is weed supply. Owned cards show `✓ Actif`; higher tiers show their level gate.

`autoTick()` runs every second after weed production with deliberate ordering:

1. Crafters work **most expensive product first** — when weed is scarce, the best €/g conversion wins.
2. Dealers then empty their product's stock (freshly crafted units included), so a craft+sell pair is fully idle income.

Automation grants no XP (consistent with manual craft/sell). Owned flags live in `state.auto = { craft: {<productId>: true}, sell: {…} }` and are sanitized on load. Full chain example at endgame: Ouvrier+Dealer Live Rosin ≈ 8 500 €/s before strain multipliers.

## Strains

10 genetics (Green Dream → Gelato 33), each with `yieldMult`/`priceMult` and its own bud palette. See `STRAINS` in `js/game.js` (unlocks 1,4,8,13,19,26,34,45,52,62).

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
- `test/e2e.test.js` — drives the REAL game in headless chromium (12 scenarios: harvest click/space, tabs, market render & trends, sell, qty pills, craft+sell, upgrade buy, automation level lock, no-cap accumulation, save persistence, hard reset). Skips gracefully if no browser; CI provides one.
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

- **`js/game.js`** — no DOM. Exports `UPGRADES`, `STRAINS`, `PRODUCTS`, `AUTOMATION`, `BASE_COST`, `COST_GROWTH`, `STORAGE_GROWTH`, `DEFAULT_LEVELS`, `XP_BASE`, `XP_GROWTH`, `MILESTONES`, `TIER_EVERY`, `mulberry32`, `addWeed`, `defaultState`, `getStrain`, `getProduct`, `productUnitPrice`, `xpForLevel`, `levelFromXp`, `xpProgress`, `productionMult`, `earnXp`, `checkMilestones`, `perClick`, `perSecond`, `upgradeCost`, `buyUpgrade`, `hasAuto`, `buyAutomation`, `autoTick`, `craftProduct`, `sellStock`, `equipStrain`, `serialize`, `deserialize`, `tierMult`, `isSpikeActive`, `spikeMult`, `maybeTriggerSpike`, `chainShare`, `CHAIN_FLOW_SHARE`, `applySpoil`, `SPOIL_RATE`, `offlineTick`, `upgradeBulkCost`, `buyUpgradeBulk`, `timeToAfford`. State under localStorage `budClicker` (+ `lastSeen`, `spike*`).
- **`js/bud.js`** — `renderBudSvg(strainId)` deterministic (seeds: calyxes 2024, pistils 99, trichomes 777).
- **`js/ui.js`** — wiring, market rendering (`renderMarket` qty pills), automation hires rendered in the Upgrades view (`renderAutomation`), `autoProduce` 1s (weed growth + `autoTick` + `applySpoil`), autosave 10s, Space-to-harvest, tabs.

### View layout

- **Récolte** — bud, stats, strain badge. Pas de cap, pas de bannière.
- **Marché** — quantity pills, 💸 Tout vendre, the 9 product cards. Nothing else.
- **Upgrades** — deux sous-onglets : 🔧 **Matériel** (14 upgrades, bulk x1/x10, paliers ×2) et ⚙️ **Chaînes** (12 automatisations, achat unique). Une seule liste mise à jour par tick (celle visible).
- **Variétés** — buy/equip strains.
- **Progression** — XP, milestones, hard-reset.

## Customization

- **Strains** — edit `STRAINS` in `js/game.js` (palette, frost, unlock, cost, yield/price).
- **Economy** — edit `UPGRADES` and `PRODUCTS` in `js/game.js`; automation costs derive from product prices.
- **Progression** — edit `XP_BASE`/`XP_GROWTH`, `MILESTONES` in `js/game.js`.
- **Leaf layout** — fan positions in `renderBudSvg` (`js/bud.js`), keep inside 300×300 viewBox.
