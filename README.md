# Bud Clicker

A simple, mobile-friendly clicker game: click the bud, stack up buds, sell them, and buy upgrades to grow your production.

## How to Play

1. **Click the bud** (or press **Space**) to harvest buds (points).
2. **Sell your buds** for cash:
   - **Buds** — $10 each
   - **Premium buds** — $50 each (rarely drop from your regular stock, 5% chance)
3. **Spend cash on upgrades** to click harder, earn per second, and multiply your output.
4. **Switch strains** in the *Variétés* tab — 4 colors/leaf shapes with different frostiness, each unlocked at a player level.
5. **Progress in the *Progression* tab** — level up, earn permanent milestone bonuses, and prestige for permanent production multipliers.

## Progression

Every harvested bud is 1 **XP**, earned forever. XP drives a hybrid level curve (level N needs `60*(N-1)²*1.15^(N-1)` lifetime XP): fast early levels, then each one costs noticeably more.

- **Levels**: each level adds **+10%** to all production. Strains unlock at levels 3, 6 and 10.
- **Strains**: each owned strain beyond the first adds **+5%** production.
- **Milestones**: permanent bonuses at lifetime-XP thresholds (100 → +5%, 1K → +10%, 10K → +15%, 100K → +25%, 1M → +50%).
- **Prestige ("Nouvelle génération")**: from 10K lifetime XP, resets cash and upgrades but banks **genomes** (+25% production each, `floor(sqrt(xp/10000))` per run). Strains, level, XP and milestones are kept.

All bonuses multiply together.

## Upgrades

| Upgrade | Effect | Base Cost |
|---------|--------|-----------|
| Scissors | +1 bud per click | $50 |
| Auto | +1 bud per second | $200 |
| Expert | +5 buds per click | $500 |
| Crew | +10 buds per second | $2,000 |
| Turbo | x2 buds per click | $10,000 |
| Mega | x2 all production | $50,000 |

Each upgrade level doubles its cost (Harvest cost = `50 * 2^level`).

## Running the Game

No build step, no dependencies. Serve the folder and open it:

```bash
./start.sh                 # restarts the background server (port 8000)
python3 -m http.server 8000
```

Then open `http://localhost:8000`, or over Tailscale e.g. `http://100.126.62.102:8000`.

### Server scripts

- `server.py` — HTTP server that prints local and Tailscale URLs on startup
- `run_server.py` — minimal HTTP server, chdirs into the game folder first
- `start.sh` — restarts the server in the background (kills the previous instance)

## Running the Tests

```bash
npm test        # node --test, 37 tests
```

Test files:
- `test/cloud.test.js` — GitHub Gist API calls (mock fetch), pack/unpack round-trip
- `test/game.test.js` — economy (upgrade costs, sell prices, buying), strains + level gates, progression (level curve, XP, milestones, prestige), save/load round-trip
- `test/bud.test.js` — SVG validity, determinism, `url(#…)` reference regression, structural counts (calyxes, pistils, frost dots, fan leaves)

## Project Structure

```
clicker-game/
├── index.html        # UI + CSS, loads the three modules
├── js/game.js        # Pure logic + data (UMD: window.BudGame / require())
├── js/bud.js         # Pure SVG renderer, deterministic (UMD: window.BudRender)
├── js/ui.js          # DOM glue: events, loops, save/load, boot
├── test/             # node:test suite
├── package.json      # npm test
├── server.py         # Optional HTTP server with Tailscale support
├── run_server.py     # Minimal HTTP server
├── start.sh          # Background server launcher
└── README.md
```

### Modules

- **`js/game.js`** — no DOM, fully testable. Exports `UPGRADES`, `STRAINS`, `BASE_COST`, `DEFAULT_LEVELS`, `PREMIUM_DROP_CHANCE`, `PREMIUM_DROP_COST`, `XP_BASE`, `XP_GROWTH`, `PRESTIGE_BASE`, `MILESTONES`, and the pure functions `getStrain`, `xpForLevel`, `levelFromXp`, `xpProgress`, `productionMult`, `earnXp`, `checkMilestones`, `prestigeGain`, `canPrestige`, `prestige`, `perClick`, `perSecond`, `upgradeCost`, `buyUpgrade`, `sellStock`, `equipStrain`, `serialize`, `deserialize`. State is created by `defaultState()` and its shape is saved under the localStorage key `budClicker`.
- **`js/bud.js`** — `renderBudSvg(strainId)` returns the full `<svg>` string for a strain. Deterministic (seeded RNG: calyxes `2024`, pistils `99`, trichomes `777`), so tests can assert exact structure.
- **`js/ui.js`** — browser-only glue: wires events (no inline `onclick`), runs `autoProduce` every 1s, autosaves every 10s, handles Space-to-harvest and tab switching.

## Customization

- **Strains** — edit `STRAINS` in `js/game.js` (each entry drives the bud gradient, pistil color, sugar-leaf color, frostiness in `js/bud.js`, plus the unlock level and cash price).
- **Economy** — edit `UPGRADES`, `BASE_COST`, `PREMIUM_DROP_CHANCE/COST` in `js/game.js`.
- **Progression curve** — edit `XP_BASE` / `XP_GROWTH` (level speed + steepness), `PRESTIGE_BASE` (first prestige threshold), `MILESTONES` (permanent bonuses) in `js/game.js`.
- **Leaf layout** — the fan positions/scales live in `renderBudSvg` in `js/bud.js`; keep the fans inside the 300x300 viewBox or they get clipped by the container.

Edit and refresh; no rebuild needed.