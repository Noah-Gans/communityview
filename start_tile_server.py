#!/usr/bin/env python3
"""
Simple tile server with CORS headers enabled
Run this script to serve tiles from the current directory with CORS support
"""
import http.server
import socketserver
from urllib.parse import urlparse

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers to allow cross-origin requests
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()
    
    def do_OPTIONS(self):
        # Handle preflight requests
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, format, *args):
        # Custom logging to see what's being requested
        print(f"[{self.address_string()}] {format % args}")

PORT = 8004

if __name__ == "__main__":
    import os
    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        print(f"🚀 Tile server starting at http://localhost:{PORT}")
        print(f"📁 Serving tiles from: {os.getcwd()}")
        print(f"✅ CORS headers enabled")
        print(f"🛑 Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped")

