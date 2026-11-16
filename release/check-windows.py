"""Smoke-test the real one-file EXE from an empty directory, not the source tree."""
import hashlib
import json
from pathlib import Path
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parents[1]
exe = Path(sys.argv[1]).resolve()
version = json.loads((root / 'cartoptimizer/release.json').read_text())['version']
with tempfile.TemporaryDirectory() as folder:
    env = {**os.environ, 'LOCALAPPDATA': str(Path(folder) / 'state')}
    probe = subprocess.run([str(exe), '--check-browser'], cwd=folder, env=env, check=True, timeout=90, stdout=subprocess.PIPE, text=True)
    found = json.loads(probe.stdout)
    expected = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (root / 'cartoptimizer/web').iterdir() if p.is_file()}
    assert found['assets'] == expected, 'Frozen web/retrieval assets do not match the source'
    print('Frozen browser:', found['browser'], found['version'])
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen([str(exe), '--port', str(port), '--no-browser'], cwd=folder, env=env)
    base = f'http://127.0.0.1:{port}'
    try:
        for _ in range(120):
            if process.poll() is not None:
                raise RuntimeError('EXE exited before serving the interface')
            try:
                with urlopen(base + '/assets/release.json', timeout=2) as reply:
                    assert json.load(reply)['version'] == version
                break
            except OSError:
                time.sleep(.5)
        else:
            raise RuntimeError('EXE did not start its local server')
        web = root / 'cartoptimizer/web'
        paths = {'/', '/Amiri-Regular.ttf', '/Amiri-Bold.ttf', '/Amiri-OFL.txt', '/Vazirmatn.woff2', '/Inter.woff2', '/Vazirmatn-OFL.txt', '/Inter-OFL.txt', '/languages.json'}
        paths.update(re.findall(r'(?:src|href)="(/[^" ]+)"', (web / 'index.html').read_text(encoding='utf-8')))
        for path in sorted(paths):
            with urlopen(base + path, timeout=10) as reply:
                assert reply.read() == (web / ('index.html' if path == '/' else path[1:])).read_bytes(), path
        with urlopen(base + '/api/demo') as reply:
            demo = reply.read()
        request = Request(base + '/api/optimize', data=demo, headers={'Content-Type': 'application/json'})
        with urlopen(request) as reply:
            result = json.load(reply)
        assert result['total'] == 3750000, result
        print('EXE: frozen browser driver, version, shared assets/fonts and optimization passed')
        if '--live' in sys.argv[2:]:
            def post(path, data):
                with urlopen(Request(base+path, data=json.dumps(data).encode(), headers={'Content-Type':'application/json'}), timeout=30) as reply:
                    return json.load(reply)
            post('/api/live/location', {'latitude':35.757535,'longitude':51.40994,'address':'Tehran Vanak public test point'})
            job = post('/api/live/search', {'items':[{'id':'milk','name':'شیر','query':'شیر','quantity':1}]})
            visited_stores = set()
            for _ in range(200):
                with urlopen(base+'/api/live/status?id='+job['id'], timeout=10) as reply:
                    status=json.load(reply)
                visited_stores.update(t['store'] for t in status.get('tasks',[]) if t.get('kind')=='store' and t.get('store'))
                print('Frozen live search:', json.dumps({k:status.get(k) for k in ('state','detail','products','stores','error')}, ensure_ascii=True), flush=True)
                if status['state'] != 'running': break
                time.sleep(1)
            assert status['state']=='done' and status.get('products',0)>0 and status.get('stores',0)>0, status
            assert visited_stores, 'No full-store search task was observed'
            print('EXE: live public guest product/store search passed; full-store tasks:', len(visited_stores))

    finally:
        # One-file PyInstaller executables launch a child that owns the server.
        if process.poll() is None:
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], check=True, stdout=subprocess.DEVNULL)
        process.wait(timeout=20)
print('EXE SHA256:', hashlib.sha256(exe.read_bytes()).hexdigest())
