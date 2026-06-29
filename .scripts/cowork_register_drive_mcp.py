#!/usr/bin/env python3
"""
One-shot bootstrap: register the local Dex Google Drive MCP server in
Claude Desktop (Cowork) so it's available in every new chat alongside
the Anthropic-hosted Drive connector.

What it does:
  1. Opens ~/Library/Application Support/Claude/claude_desktop_config.json
     (creates it if missing).
  2. Backs it up to claude_desktop_config.json.bak-YYYYMMDD-HHMMSS.
  3. Merges in an "mcpServers"."dex-google-drive-work" entry that runs
     core/mcp/google_drive_server.py with VAULT_PATH + work credentials.
  4. Does NOT touch any other MCP entries you already have.

Safe to run multiple times — it replaces only the dex-google-drive-work key.

Usage:
  python3 .scripts/cowork_register_drive_mcp.py
  python3 .scripts/cowork_register_drive_mcp.py --name dex-google-drive-personal --profile personal
  python3 .scripts/cowork_register_drive_mcp.py --dry-run        # show diff, no write

After running:
  1. Fully quit Claude Desktop (Cmd+Q).
  2. Reopen Claude. Start a new Cowork chat.
  3. The MCP tool gdrive_list_shared_drives is now available.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

HOME = Path.home()
CONFIG_PATH = HOME / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
REPO = Path(__file__).resolve().parent.parent


def build_entry(profile: str) -> dict:
    """Return the mcpServers entry pointing at core/mcp/google_drive_server.py."""
    env = {"VAULT_PATH": str(REPO)}
    if profile == "personal":
        # google_drive_server.py defaults to Credentials/personal/* — no env override needed.
        pass
    else:
        cred_dir = REPO / "Credentials" / profile
        env["GOOGLE_DRIVE_CREDENTIALS_PATH"] = str(cred_dir / "credentials.json")
        env["GOOGLE_DRIVE_TOKEN_PATH"] = str(cred_dir / "google_drive_token.json")
    return {
        "type": "stdio",
        "command": "python3",
        "args": [str(REPO / "core" / "mcp" / "google_drive_server.py")],
        "env": env,
    }


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        print(f"Note: {CONFIG_PATH} does not exist yet — will create a fresh file.")
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(
            f"Refusing to overwrite: {CONFIG_PATH} is not valid JSON ({e}).\n"
            f"Fix it manually first, then re-run this script."
        )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--name", default="dex-google-drive-work",
                    help="mcpServers key to register (default: dex-google-drive-work)")
    ap.add_argument("--profile", default="google-work",
                    help="Credentials profile under Credentials/ (default: google-work)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print proposed config, do not write")
    args = ap.parse_args()

    # Sanity-check the credentials exist (only for non-personal which uses defaults).
    if args.profile != "personal":
        cred_dir = REPO / "Credentials" / args.profile
        if not (cred_dir / "credentials.json").exists():
            print(f"WARN: {cred_dir/'credentials.json'} not found. "
                  f"OAuth flow will fail on first MCP call.")
        if not (cred_dir / "google_drive_token.json").exists():
            print(f"INFO: {cred_dir/'google_drive_token.json'} not found. "
                  f"First Drive call will open a browser for consent.")

    entry = build_entry(args.profile)
    config = load_config()
    config.setdefault("mcpServers", {})

    previous = config["mcpServers"].get(args.name)
    config["mcpServers"][args.name] = entry

    if args.dry_run:
        print("=== Proposed entry ===")
        print(json.dumps({args.name: entry}, indent=2, ensure_ascii=False))
        if previous == entry:
            print("\n(no change — already registered with identical settings)")
        elif previous is not None:
            print("\n=== Replacing previous entry ===")
            print(json.dumps({args.name: previous}, indent=2, ensure_ascii=False))
        return 0

    # Backup
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if CONFIG_PATH.exists():
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = CONFIG_PATH.with_suffix(f".json.bak-{stamp}")
        shutil.copy2(CONFIG_PATH, backup)
        print(f"Backup: {backup}")

    CONFIG_PATH.write_text(
        json.dumps(config, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote: {CONFIG_PATH}")
    print(f"Registered mcpServers['{args.name}'] → {entry['args'][0]}")
    print()
    print("Next steps:")
    print("  1. Fully quit Claude Desktop (Cmd+Q in the menu bar).")
    print("  2. Reopen Claude. Start a NEW chat (existing chats won't see the new MCP).")
    print("  3. Ask: \"вызови gdrive_list_shared_drives\".")
    print()
    print("If the first call says token expired or browser opens — that's normal,")
    print("it's the OAuth refresh. Just sign in once.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
