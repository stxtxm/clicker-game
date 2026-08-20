# Bud Clicker

A simple, mobile-friendly clicker game: click the bud, stack up buds, sell them, and buy upgrades to grow your production.

## How to Play

1. **Click the bud** (or press **Space**) to harvest buds (points).
2. **Sell your buds** for cash:
   - **Buds** — $10 each
   - **Premium buds** — $50 each (rarely drop from your regular stock, 5% chance)
3. **Spend cash on upgrades** to click harder, earn per second, and multiply your output.
4. **Switch strains** in the *Strains* tab — 4 colors/leaf shapes with different frostiness.

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
npm test        # node --test, 27 tests
```

Test files:
- `test/game.test.js` — economy (upgrade costs, sell prices, buying), strains, save/load round-trip
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

- **`js/game.js`** — no DOM, fully testable. Exports `UPGRADES`, `STRAINS`, `BASE_COST`, `DEFAULT_LEVELS`, `PREMIUM_DROP_CHANCE`, `PREMIUM_DROP_COST`, and the pure functions `getStrain`, `perClick`, `perSecond`, `upgradeCost`, `buyUpgrade`, `sellStock`, `equipStrain`, `serialize`, `deserialize`. State is created by `defaultState()` and its shape is saved under the localStorage key `budClicker`.
- **`js/bud.js`** — `renderBudSvg(strainId)` returns the full `<svg>` string for a strain. Deterministic (seeded RNG: calyxes `2024`, pistils `99`, trichomes `777`), so tests can assert exact structure.
- **`js/ui.js`** — browser-only glue: wires events (no inline `onclick`), runs `autoProduce` every 1s, autosaves every 10s, handles Space-to-harvest and tab switching.

## Customization

- **Strains** — edit `STRAINS` in `js/game.js` (each entry drives the bud gradient, pistil color, sugar-leaf color and frostiness in `js/bud.js`).
- **Economy** — edit `UPGRADES`, `BASE_COST`, `PREMIUM_DROP_CHANCE/COST` in `js/game.js`.
- **Leaf layout** — the fan positions/scales live in `renderBudSvg` in `js/bud.js`; keep the fans inside the 300x300 viewBox or they get clipped by the container.

Edit and refresh; no rebuild needed.