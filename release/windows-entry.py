"""Portable Windows entry point; browser check also validates the frozen driver."""
import json
import hashlib
import sys
from cartoptimizer.server import main

if __name__ == '__main__':
    if sys.argv[1:] == ['--check-browser']:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as engine:
            for channel in ('chrome', 'msedge'):
                try:
                    browser = engine.chromium.launch(channel=channel, headless=True)
                except Exception:
                    continue
                try:
                    page = browser.new_page()
                    page.set_content('<title>Sabadchin browser check</title>')
                    assert page.title() == 'Sabadchin browser check'
                    from cartoptimizer.desktop import WEB
                    assets = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in WEB.iterdir() if p.is_file()}
                    print(json.dumps({'browser': channel, 'version': browser.version, 'assets': assets}))
                finally:
                    browser.close()
                break
            else:
                raise SystemExit('Install Microsoft Edge or Google Chrome to use live search.')
    else:
        main()
