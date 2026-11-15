"""Smoke-test the real one-file EXE from an empty directory, not the source tree."""
import hashlib
import json
from pathlib import Path
import os
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
    subprocess.run([str(exe), '--check-browser'], cwd=folder, env=env, check=True, timeout=90)
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
        for p in (root / 'cartoptimizer/web').iterdir():
            if p.suffix not in {'.html', '.css', '.js', '.ttf', '.txt'} or p.name == 'map.html':
                continue
            with urlopen(base + ('/' if p.name == 'index.html' else '/' + p.name), timeout=10) as reply:
                assert reply.read() == p.read_bytes(), p.name
        with urlopen(base + '/api/demo') as reply:
            demo = reply.read()
        request = Request(base + '/api/optimize', data=demo, headers={'Content-Type': 'application/json'})
        with urlopen(request) as reply:
            result = json.load(reply)
        assert result['total'] == 3750000, result
        print('EXE: frozen browser driver, version, shared assets/fonts and optimization passed')
    finally:
        process.terminate()
        process.wait(timeout=20)
print('EXE SHA256:', hashlib.sha256(exe.read_bytes()).hexdigest())
