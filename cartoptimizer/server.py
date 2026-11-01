"""Dependency-free loopback web application. Run: python -m cartoptimizer"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import argparse
import json
from pathlib import Path
from threading import BoundedSemaphore
from urllib.parse import urlsplit
import webbrowser

from .adapters.digikala import fetch_product
from .models import ValidationError, normalize_snapshot
from .optimizer import optimize

WEB = Path(__file__).parent / 'web'
EXAMPLE = Path(__file__).parent / 'demo.json'
BUSY = BoundedSemaphore(2)


class Handler(BaseHTTPRequestHandler):
    server_version = 'CartOptimizer/0.1'

    def allowed_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def respond(self, status, body, content_type='application/json; charset=utf-8'):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.allowed_host():
            return self.respond(403, {'error': 'Use the localhost application URL'})
        path = urlsplit(self.path).path
        if path == '/api/demo':
            return self.respond(200, EXAMPLE.read_bytes())
        assets = {'/': ('index.html', 'text/html; charset=utf-8'),
                  '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
                  '/style.css': ('style.css', 'text/css; charset=utf-8')}
        if path not in assets:
            return self.respond(404, {'error': 'Not found'})
        filename, mime = assets[path]
        self.respond(200, (WEB / filename).read_bytes(), mime)

    def do_POST(self):
        origin = self.headers.get('Origin')
        if not self.allowed_host() or (origin and origin not in (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}')):
            return self.respond(403, {'error': 'Requests must originate from this local app'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.respond(415, {'error': 'Use application/json'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1_000_000:
                return self.respond(413, {'error': 'Request must be between 1 byte and 1 MB'})
            data = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError):
            return self.respond(400, {'error': 'Invalid JSON request'})
        if not BUSY.acquire(blocking=False):
            return self.respond(429, {'error': 'Optimizer is busy. Try again shortly.'})
        try:
            if self.path == '/api/optimize':
                self.respond(200, optimize(data))
            elif self.path == '/api/validate':
                self.respond(200, {'valid': True, 'snapshot': normalize_snapshot(data)})
            elif self.path == '/api/product':
                if not isinstance(data, dict):
                    raise ValidationError('Product request must be an object')
                self.respond(200, fetch_product(data.get('url')))
            else:
                self.respond(404, {'error': 'Not found'})
        except (ValidationError, RecursionError) as exc:
            self.respond(400, {'error': str(exc) if isinstance(exc, ValidationError) else 'Snapshot is too complex'})
        except Exception:
            self.respond(500, {'error': 'Unexpected application error; check the local terminal'})
            import traceback
            traceback.print_exc()
        finally:
            BUSY.release()

    def log_message(self, format, *args):
        # No request bodies, product names, coupon codes or account details in logs.
        pass


def main():
    parser = argparse.ArgumentParser(description='Digikala Supermarket Cart Optimizer')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    with ThreadingHTTPServer(('127.0.0.1', args.port), Handler) as server:
        url = f'http://127.0.0.1:{server.server_port}'
        print(f'Cart Optimizer: {url}\nPress Ctrl+C to stop.', flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
