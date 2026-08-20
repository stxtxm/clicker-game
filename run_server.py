#!/usr/bin/env python3
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

# Change to the clicker-game directory
os.chdir('/home/timo/dev/clicker-game')

# Start server
server = HTTPServer(('', 8000), SimpleHTTPRequestHandler)
print(f"Server started on port 8000 in {os.getcwd()}", flush=True)
server.serve_forever()
