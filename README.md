# Bud Clicker

A simple, mobile-friendly clicker game: click the bud, stack up buds, sell them, and buy upgrades to grow your production.

## How to Play

1. **Click the bud** to harvest buds (points).
2. **Sell your buds** for cash:
   - **Buds** — $10 each
   - **Premium buds** — $50 each (rarely drop from your regular stock)
3. **Spend cash on upgrades** to click harder, earn per second, and multiply your output.

## Upgrades

| Upgrade | Effect | Base Cost |
|---------|--------|-----------|
| Scissors | +1 bud per click | $50 |
| Auto | +1 bud per second | $200 |
| Expert | +5 buds per click | $500 |
| Crew | +10 buds per second | $2,000 |
| Turbo | x2 buds per click | $10,000 |
| Mega | x2 all production | $50,000 |

Each upgrade level doubles its cost.

## Running the Game

The game is a single static HTML file — no build step, no dependencies.

```bash
# From anywhere on this machine
./start.sh

# Or manually
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

The game is also reachable over the local network / Tailscale, e.g. `http://100.126.62.102:8000`.

### Server scripts

- `server.py` — HTTP server that prints local and Tailscale URLs on startup
- `run_server.py` — minimal HTTP server, chdirs into the game folder first
- `start.sh` — restarts the server in the background (kills the previous instance)

## Project Structure

```
clicker-game/
├── index.html    # The whole game (UI, logic, styling)
├── server.py     # Optional HTTP server with Tailscale support
├── run_server.py # Minimal HTTP server
├── start.sh      # Background server launcher
└── README.md
```

## Customization

All game data lives in the `<script>` block of `index.html`:

- `s.prices` — sell prices
- `c` — base upgrade costs
- `s.levels` — starting upgrade levels
- the `ap()` function — auto-production and premium-bud drop logic

Edit and refresh; no rebuild needed.