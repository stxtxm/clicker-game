#!/bin/bash
# Start the clicker game server in background

cd /home/timo/dev/clicker-game

# Kill any existing server
pkill -f "python3.*http.server" 2>/dev/null
pkill -f "server.py" 2>/dev/null

# Start new server in background
nohup python3 -m http.server 8000 > /tmp/clicker-server.log 2>&1 &

echo "✅ Clicker Game server started!"
echo "   Local: http://localhost:8000"
echo "   Tailscale: http://100.126.62.102:8000"
echo "   Logs: /tmp/clicker-server.log"
echo "   PID: $!"

# Disown the process so it keeps running
disown
