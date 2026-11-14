"""Local shopping-cart optimizer. Engine amounts are integer Iranian rials."""
import json
from pathlib import Path

__version__ = json.loads(Path(__file__).with_name("release.json").read_text(encoding="utf-8"))["version"]
