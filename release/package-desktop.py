"""Package clean desktop sources, without local state or browser profiles."""
from pathlib import Path
import shutil
out = Path('desktop-package')
out.mkdir(exist_ok=True)
for name in ['cartoptimizer', 'tests']:
    shutil.copytree(name, out / name, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
for name in ['README.md', 'AGENTS.md', 'pyproject.toml', 'Start-Sabadchin.cmd']:
    shutil.copy2(name, out / name)
