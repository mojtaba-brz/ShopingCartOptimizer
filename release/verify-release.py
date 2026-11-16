"""Verify the bundled version and every shared asset before distribution."""
import json
from pathlib import Path
import re
import sys
import zipfile
root = Path(__file__).resolve().parents[1]
version = json.loads((root/'cartoptimizer/release.json').read_text())
replacements = re.findall(r"\.replace\('([^']*)', '([^']*)'\)", (root/'android/app/build.gradle').read_text())
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert json.loads(archive.read('assets/release.json')) == version
    for path in (root/'cartoptimizer/web').iterdir():
        if path.suffix not in {'.html','.css','.js','.ttf','.woff2','.txt','.json'}:
            continue
        actual = archive.read('assets/'+path.name)
        if path.suffix in {'.html','.css','.js'}:
            expected = path.read_text()
            for before,after in replacements:
                expected = expected.replace(before,after)
            assert actual.decode().replace('\r\n','\n') == expected, path.name
        else:
            assert actual == path.read_bytes(), path.name
print('Bundled version and shared assets verified:', version['version'])
