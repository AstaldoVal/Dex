#!/usr/bin/env python3
"""
Move ~/.cursor/skills when it is the Antigravity mega-repo (sickn33/antigravity-awesome-skills)
out of Cursor's discovery path and recreate an empty ~/.cursor/skills.

Default: --dry-run (prints plan only). Use --apply to execute.

Does not touch ~/.cursor/skills-cursor (Cursor-managed pack).
Does not toggle Cursor UI "third-party" (no stable file key found in repo automation).
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import textwrap
from datetime import datetime, timezone
from pathlib import Path


def git_remote(root: Path) -> str | None:
    if not (root / ".git").exists():
        return None
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def count_skill_md(root: Path) -> int:
    n = 0
    for p in root.rglob("SKILL.md"):
        if p.is_file():
            n += 1
    return n


def is_antigravity_pack(root: Path, remote: str | None) -> bool:
    if remote and "antigravity-awesome-skills" in remote.lower():
        return True
    if remote and "sickn33" in remote.lower() and "skills" in remote.lower():
        return True
    readme = root / "README.md"
    if readme.is_file():
        try:
            head = readme.read_text(encoding="utf-8", errors="replace")[:4000]
        except OSError:
            head = ""
        if "Antigravity Awesome Skills" in head or "antigravity-awesome-skills" in head.lower():
            return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--apply",
        action="store_true",
        help="Actually move the directory (default is dry-run only)",
    )
    ap.add_argument(
        "--archive-root",
        type=Path,
        default=None,
        help="Parent folder for archive (default: ~/Development/_cursor_global_skills_archive)",
    )
    args = ap.parse_args()

    home = Path.home()
    src = home / ".cursor" / "skills"
    archive_parent = args.archive_root or (home / "Development" / "_cursor_global_skills_archive")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = archive_parent / f"antigravity-awesome-skills_{stamp}"

    if not src.is_dir():
        print(f"Nothing to do: missing {src}")
        return 0

    remote = git_remote(src)
    n_md = count_skill_md(src)
    if n_md == 0:
        print(f"Nothing to do: no SKILL.md under {src} (already empty or post-rehome).")
        return 0

    detected = is_antigravity_pack(src, remote)

    print("--- rehome_antigravity_global_skills ---")
    print(f"source:      {src}")
    print(f"git origin:  {remote or '(none)'}")
    print(f"SKILL.md:    {n_md}")
    print(f"detected:    {'antigravity-like' if detected else 'unknown layout'}")
    print(f"destination: {dest}")

    if not detected and n_md > 100:
        print(
            "\nRefusing: ~/.cursor/skills looks like a large non-Antigravity tree "
            "(no matching origin/README). Move it manually if you still want this.",
            file=sys.stderr,
        )
        return 2

    if not detected and n_md > 0:
        print(
            "\nRefusing: small or unknown ~/.cursor/skills without Antigravity markers. "
            "Use a manual move if this is intentional.",
            file=sys.stderr,
        )
        return 2

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to move.")
        return 0

    archive_parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        print(f"Destination already exists: {dest}", file=sys.stderr)
        return 3

    shutil.move(str(src), str(dest))
    src.mkdir(parents=True, exist_ok=True)
    readme = src / "README_DEX_AUTOMATION.txt"
    readme.write_text(
        textwrap.dedent(
            f"""
            This ~/.cursor/skills directory was recreated by Dex automation.

            The previous contents (Antigravity Awesome Skills clone) were moved to:
              {dest}

            Cursor loads global skills only from this path. Managed Cursor skills may
            still live under ~/.cursor/skills-cursor (see Cursor docs / UI).

            To regenerate an inventory report from the DEX repo:
              npm run cursor:skills-inventory
            """
        ).strip()
        + "\n",
        encoding="utf-8",
    )
    print(f"\nDone. Moved to:\n  {dest}\nRecreated empty:\n  {src}\nWrote:\n  {readme}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
