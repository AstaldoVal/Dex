#!/usr/bin/env python3
"""
Fetch Figma design structure, text, and screenshots from a design URL.

Uses Figma REST API (file_content:read). Requires FIGMA_ACCESS_TOKEN in environment
or in .env at repo root.

Usage:
  python3 .scripts/figma_fetch_design.py "https://www.figma.com/design/FILE_KEY/...?node-id=123-456"
  python3 .scripts/figma_fetch_design.py "URL1" "URL2" --output path/to/product.md --images path/to/captures

Output:
  - Markdown to stdout (or --output file) with file name, node names, text content, structure.
  - If --images DIR: PNG exports for each node saved to DIR (node_id.png).

Token: Figma → Settings → Personal access tokens → file_content:read.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

try:
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CONTEXT = ssl.create_default_context()

FIGMA_API_BASE = "https://api.figma.com/v1"


def load_env():
    """Load .env from repo root if present."""
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    env_path = repo_root / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip()
                if v.startswith('"') and v.endswith('"'):
                    v = v[1:-1]
                if k and k not in os.environ:
                    os.environ[k] = v


def parse_figma_url(url: str) -> tuple[str | None, list[str]]:
    """
    Parse Figma design URL into file_key and node_id(s).
    URL format: https://www.figma.com/design/FILE_KEY/Title?node-id=123-456
    API expects node id with colon: 123:456.
    """
    parsed = urlparse(url)
    if "figma.com" not in parsed.netloc:
        return None, []
    path = parsed.path.strip("/")
    parts = path.split("/")
    # design / FILE_KEY / name
    if len(parts) >= 2 and parts[0] == "design":
        file_key = parts[1]
    else:
        # file / FILE_KEY
        if len(parts) >= 2 and parts[0] == "file":
            file_key = parts[1]
        else:
            return None, []
    node_ids = []
    if parsed.query:
        for q in parsed.query.split("&"):
            if q.startswith("node-id="):
                raw = q.split("=", 1)[1].strip()
                # 1477-53238 -> 1477:53238
                api_id = raw.replace("-", ":", 1)
                node_ids.append(api_id)
    return file_key, node_ids


def figma_request(token: str, path: str, method: str = "GET") -> dict:
    """GET request to Figma API with token."""
    url = f"{FIGMA_API_BASE}{path}"
    req = Request(url, method=method)
    req.add_header("X-Figma-Token", token)
    try:
        with urlopen(req, timeout=30, context=_SSL_CONTEXT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        raise SystemExit(f"Figma API error {e.code}: {body}") from e
    except URLError as e:
        raise SystemExit(f"Request failed: {e.reason}") from e


def walk_node(node: dict, depth: int, lines: list[str]) -> None:
    """Recursively walk document tree and collect names + text."""
    indent = "  " * depth
    node_type = node.get("type", "?")
    name = node.get("name", "")
    if node_type == "TEXT" and "characters" in node:
        text = (node.get("characters") or "").strip()
        if text:
            lines.append(f"{indent}- **{name}** (TEXT): {text[:200]}{'…' if len(text) > 200 else ''}")
        else:
            lines.append(f"{indent}- {name} ({node_type})")
    else:
        if name:
            lines.append(f"{indent}- {name} ({node_type})")
    for child in node.get("children", []):
        walk_node(child, depth + 1, lines)


def extract_structure(data: dict, node_ids: list[str]) -> str:
    """Build markdown from file/nodes response."""
    lines = []
    name = data.get("name", "Figma file")
    lines.append(f"# {name}\n")
    lines.append(f"Last modified: {data.get('lastModified', 'N/A')}\n")

    # Single file: document is at top level
    doc = data.get("document")
    if doc:
        lines.append("## Document structure\n")
        walk_node(doc, 0, lines)
        lines.append("")
        return "\n".join(lines)

    # Nodes response: nodes map
    nodes_map = data.get("nodes", {})
    for nid in node_ids:
        block = nodes_map.get(nid)
        if block is None:
            lines.append(f"## Node {nid}\n(not found or null)\n")
            continue
        doc = block.get("document")
        if doc:
            lines.append(f"## Node {nid}\n")
            walk_node(doc, 0, lines)
            lines.append("")
    return "\n".join(lines)


def fetch_file_nodes(token: str, file_key: str, node_ids: list[str], depth: int = 5) -> dict:
    """GET /v1/files/:key?ids=...&depth=..."""
    ids_param = ",".join(node_ids) if node_ids else ""
    path = f"/files/{file_key}?depth={depth}"
    if ids_param:
        path += f"&ids={quote(ids_param)}"
    return figma_request(token, path)


def fetch_images(token: str, file_key: str, node_ids: list[str]) -> dict:
    """GET /v1/images/:key?ids=...&format=png. Returns node_id -> image URL."""
    if not node_ids:
        return {}
    ids_param = ",".join(node_ids)
    path = f"/images/{file_key}?ids={quote(ids_param)}&format=png"
    return figma_request(token, path)


def download_image(url: str, dest: Path) -> None:
    """Download URL to dest path."""
    req = Request(url)
    with urlopen(req, timeout=30, context=_SSL_CONTEXT) as resp:
        dest.write_bytes(resp.read())


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(description="Fetch Figma design structure and screenshots")
    parser.add_argument("urls", nargs="+", help="Figma design URL(s) (with optional node-id)")
    parser.add_argument("--output", "-o", help="Write markdown to file instead of stdout")
    parser.add_argument("--images", "-i", help="Directory to save PNG screenshots (one per node)")
    parser.add_argument("--depth", type=int, default=5, help="Tree depth for file request (default 5)")
    args = parser.parse_args()

    token = os.environ.get("FIGMA_ACCESS_TOKEN", "").strip()
    if not token:
        print("Error: FIGMA_ACCESS_TOKEN not set. Add to .env or environment.", file=sys.stderr)
        print("Get token: Figma → Settings → Personal access tokens (scope: file_content:read).", file=sys.stderr)
        return 1

    file_key = None
    all_node_ids = []

    for url in args.urls:
        key, nids = parse_figma_url(url)
        if not key:
            print(f"Warning: could not parse URL: {url}", file=sys.stderr)
            continue
        if file_key and key != file_key:
            print("Warning: all URLs must be from the same file; using first file key.", file=sys.stderr)
        file_key = file_key or key
        for nid in nids:
            if nid not in all_node_ids:
                all_node_ids.append(nid)

    if not file_key:
        print("Error: no valid Figma design URL found.", file=sys.stderr)
        return 1

    # If no node IDs from URLs, get full file (depth 2 to get pages and top-level frames)
    if not all_node_ids:
        data = fetch_file_nodes(token, file_key, [], depth=2)
        md = extract_structure(data, [])
    else:
        data = fetch_file_nodes(token, file_key, all_node_ids, depth=args.depth)
        md = extract_structure(data, all_node_ids)

    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(md, encoding="utf-8")
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        print(md)

    if args.images and all_node_ids:
        try:
            imgs = fetch_images(token, file_key, all_node_ids)
            images = imgs.get("images") or {}
            out_dir = Path(args.images)
            out_dir.mkdir(parents=True, exist_ok=True)
            for nid, url in images.items():
                if url:
                    safe_id = re.sub(r"[^\w\-]", "_", nid)
                    dest = out_dir / f"{safe_id}.png"
                    try:
                        download_image(url, dest)
                        print(f"Saved {dest}", file=sys.stderr)
                    except (URLError, OSError, TimeoutError) as e:
                        print(f"Skip image {nid}: {e}", file=sys.stderr)
                else:
                    print(f"No image for node {nid}", file=sys.stderr)
        except (URLError, OSError, TimeoutError) as e:
            print(f"Images fetch failed (structure was saved): {e}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
