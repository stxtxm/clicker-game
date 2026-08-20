#!/usr/bin/env python3
"""
Serveur HTTP simple pour le Clicker Game
Accessible sur:
- localhost:8000
- [IP_TAILSCALE]:8000 (via Tailscale)
"""

from http.server import SimpleHTTPRequestHandler, HTTPServer
import socket
import threading
import webbrowser
import time

PORT = 8000

def get_tailscale_ip():
    """Récupère l'IP Tailscale de la machine"""
    try:
        import subprocess
        result = subprocess.run(['ip', 'addr', 'show', 'tailscale0'], 
                              capture_output=True, text=True)
        for line in result.stdout.split('\n'):
            if 'inet ' in line and 'tailscale' in line:
                return line.split()[1].split('/')[0]
    except:
        pass
    return None

def get_local_ip():
    """Récupère l'IP locale"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
    except:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

class MyHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.path = '/index.html'
        return super().do_GET()
    
    def log_message(self, format, *args):
        # Désactive les logs pour éviter le spam
        pass

def run_server():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, MyHandler)
    
    tailscale_ip = get_tailscale_ip()
    local_ip = get_local_ip()
    
    print("\n" + "="*60)
    print("🎮 Clicker Game Server")
    print("="*60)
    print(f"\n📍 Local:   http://localhost:{PORT}")
    print(f"📍 Local IP: http://{local_ip}:{PORT}")
    
    if tailscale_ip:
        print(f"📍 Tailscale: http://{tailscale_ip}:{PORT}")
        print("\n✨ Le jeu est accessible via Tailscale sur tous tes appareils !")
    else:
        print("\n⚠️  Tailscale non détecté. Installation: tailscale up")
    
    print("\nAppuie sur Ctrl+C pour arrêter le serveur\n")
    print("="*60 + "\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n👋 Arrêt du serveur...")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
