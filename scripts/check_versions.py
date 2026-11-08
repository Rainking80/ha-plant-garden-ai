"""Keep the version numbers in sync and extract release notes.

manifest.json is the single source of truth; frontend/package.json and
pyproject.toml must carry the same version.

    python scripts/check_versions.py                 # all files agree?
    python scripts/check_versions.py --tag v0.1.0    # ... and match the git tag?
    python scripts/check_versions.py --changelog 0.1.0   # print that CHANGELOG section
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
import tomllib

ROOT = Path(__file__).resolve().parent.parent


def versions() -> dict[str, str]:
    manifest = json.loads((ROOT / "custom_components/plant_garden/manifest.json").read_text())
    package = json.loads((ROOT / "frontend/package.json").read_text())
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text())
    return {
        "custom_components/plant_garden/manifest.json": manifest["version"],
        "frontend/package.json": package["version"],
        "pyproject.toml": pyproject["project"]["version"],
    }


def changelog_section(version: str) -> str:
    text = (ROOT / "CHANGELOG.md").read_text()
    match = re.search(
        rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## \[|\Z)", text, re.MULTILINE | re.DOTALL
    )
    if not match:
        raise SystemExit(f"CHANGELOG.md has no section for {version}")
    return match.group(1).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", help="git tag such as v0.1.0 that must match")
    parser.add_argument("--changelog", metavar="VERSION", help="print release notes")
    args = parser.parse_args()

    if args.changelog:
        print(changelog_section(args.changelog))
        return 0

    found = versions()
    expected = found["custom_components/plant_garden/manifest.json"]
    problems = [f"{path}: {v} (expected {expected})" for path, v in found.items() if v != expected]
    if args.tag and args.tag.removeprefix("v") != expected:
        problems.append(f"git tag {args.tag} does not match version {expected}")
    if problems:
        print("Version mismatch:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 1
    print(f"All versions are {expected}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
