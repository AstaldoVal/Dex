#!/usr/bin/env python3
"""
Linear webhook receiver:
- Issue created in Linear -> create task in Dex (03-Tasks/Tasks.md) and add link in linear_sync.json.
- Issue updated to Done in Linear -> mark linked Dex task done.

Requires: VAULT_PATH (repo root). For "create" we create linear_sync.json if missing.
Linear sends POST to this server; you must expose it (e.g. ngrok) and add the URL in
Linear -> Settings -> API -> Webhooks.

Run: VAULT_PATH=/path/to/Dex python core/mcp/linear_webhook_listener.py
     Listens on 0.0.0.0:8765, path POST /linear-webhook
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from http.server import HTTPServer, BaseHTTPRequestHandler

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))
os.environ.setdefault("VAULT_PATH", str(REPO_ROOT))

VAULT_PATH = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
SYNC_FILE = VAULT_PATH / "03-Tasks" / "linear_sync.json"
TASKS_FILE = VAULT_PATH / "03-Tasks" / "Tasks.md"


def _generate_task_id() -> str:
    """Generate task-YYYYMMDD-XXX by scanning 03-Tasks/Tasks.md and linear_sync."""
    date_str = datetime.now().strftime("%Y%m%d")
    existing = []
    if TASKS_FILE.exists():
        for m in re.findall(rf"\^task-{date_str}-(\d{{3}})", TASKS_FILE.read_text()):
            existing.append(int(m))
    if SYNC_FILE.exists():
        try:
            data = json.loads(SYNC_FILE.read_text(encoding="utf-8"))
            for tid in (data.get("task_to_linear") or {}).keys():
                match = re.match(r"task-\d{8}-(\d{3})", tid)
                if match:
                    existing.append(int(match.group(1)))
        except Exception:
            pass
    next_num = max(existing, default=0) + 1
    return f"task-{date_str}-{next_num:03d}"


def _handle_issue_create(data: dict) -> tuple[int, str]:
    """Create a Dex task from Linear issue and add sync link."""
    issue_id = data.get("id")
    title = (data.get("title") or "").strip() or "Untitled"
    identifier = (data.get("identifier") or "").strip()
    description = (data.get("description") or "").strip()

    if not issue_id:
        return 200, "ignored (no issue id)"

    # Already linked?
    if SYNC_FILE.exists():
        try:
            sync = json.loads(SYNC_FILE.read_text(encoding="utf-8"))
            if (sync.get("linear_id_to_task") or {}).get(issue_id):
                return 200, "ignored (issue already linked)"
        except Exception:
            pass

    task_id = _generate_task_id()
    task_line = f"- [ ] **{title}** ^{task_id}"
    task_line += "\n\t- From Linear"
    if identifier:
        task_line += f" ({identifier})"
    if description:
        task_line += f"\n\t- {description[:500]}" + ("..." if len(description) > 500 else "")
    task_line += "\n\t- Priority: P2"

    TASKS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if TASKS_FILE.exists():
        content = TASKS_FILE.read_text(encoding="utf-8")
        if "## Next Week" in content:
            parts = content.split("## Next Week", 1)
            new_content = parts[0] + "## Next Week\n" + task_line + "\n" + parts[1]
        else:
            new_content = content.rstrip() + "\n\n" + task_line + "\n"
        TASKS_FILE.write_text(new_content, encoding="utf-8")
    else:
        TASKS_FILE.write_text("# Tasks\n\n## Next Week\n" + task_line + "\n", encoding="utf-8")

    sync = {}
    if SYNC_FILE.exists():
        try:
            sync = json.loads(SYNC_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    sync.setdefault("task_to_linear", {})[task_id] = identifier or issue_id
    sync.setdefault("task_to_linear_id", {})[task_id] = issue_id
    sync.setdefault("linear_id_to_task", {})[issue_id] = task_id
    SYNC_FILE.parent.mkdir(parents=True, exist_ok=True)
    SYNC_FILE.write_text(json.dumps(sync, ensure_ascii=False, indent=0), encoding="utf-8")

    return 200, f"created task {task_id} from Linear issue {identifier or issue_id}"


def _handle_issue_update_done(data: dict) -> tuple[int, str]:
    """Mark linked Dex task done when Linear issue is set to Done."""
    issue_id = data.get("id")
    if not issue_id:
        return 200, "ignored (no issue id)"
    state = data.get("state")
    state_type = (state.get("type") if isinstance(state, dict) else None) or ""
    if state_type.lower() != "completed":
        return 200, "ignored (state not completed)"
    if not SYNC_FILE.exists():
        return 200, "ignored (no linear_sync.json)"
    try:
        sync = json.loads(SYNC_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        return 500, f"sync file error: {e}"
    linear_id_to_task = sync.get("linear_id_to_task") or {}
    task_id = linear_id_to_task.get(issue_id)
    if not task_id:
        return 200, "ignored (issue not linked to Dex task)"
    from core.mcp.work_server import update_task_status_everywhere

    result = update_task_status_everywhere(task_id, completed=True)
    if not result.get("success"):
        return 500, result.get("error", "update failed")
    return 200, f"synced task {task_id} -> done"


def handle_linear_webhook(body: dict) -> tuple[int, str]:
    """Process Linear webhook payload. Returns (status_code, message)."""
    action = body.get("action")
    resource_type = body.get("type")
    if resource_type != "Issue":
        return 200, "ignored (not Issue)"
    data = body.get("data") or {}

    if action == "create":
        return _handle_issue_create(data)
    if action == "update":
        return _handle_issue_update_done(data)
    return 200, "ignored (action not create/update)"


class LinearWebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path.rstrip("/") != "/linear-webhook":
            self.send_response(404)
            self.end_headers()
            return
        content_length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body.decode("utf-8"))
        except Exception:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid JSON")
            return
        status, msg = handle_linear_webhook(data)
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(msg.encode("utf-8"))

    def log_message(self, format, *args):
        print(f"[linear-webhook] {args[0]}")


def main():
    port = int(os.environ.get("LINEAR_WEBHOOK_PORT", "8765"))
    server = HTTPServer(("0.0.0.0", port), LinearWebhookHandler)
    print(f"Linear webhook server listening on http://0.0.0.0:{port}/linear-webhook")
    print("VAULT_PATH =", VAULT_PATH)
    server.serve_forever()


if __name__ == "__main__":
    main()
