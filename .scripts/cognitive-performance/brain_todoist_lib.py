#!/usr/bin/env python3
"""Shared Todoist helpers for Brain Protocol daily checklists."""
from __future__ import annotations

import datetime as dt
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import zoneinfo
from pathlib import Path
from typing import Any

API_BASE = "https://api.todoist.com/api/v1"


class TodoistError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, body: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.body = body


def repo_root(start: Path | None = None) -> Path:
    here = (start or Path(__file__)).resolve()
    for parent in [here, *here.parents]:
        if (parent / "package.json").is_file():
            return parent
    raise TodoistError(f"Could not find DEX root above {here}")


def load_brain_cfg(root: Path) -> dict:
    path = root / "05-Areas/Cognitive_Performance/brain-protocol-config.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_todoist_cfg(root: Path, brain_cfg: dict) -> dict:
    merged = dict(brain_cfg.get("todoist") or {})
    yaml_path = root / "System/integrations/todoist.yaml"
    if yaml_path.is_file():
        try:
            import yaml  # type: ignore

            data = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
            if isinstance(data, dict):
                merged.update({k: v for k, v in data.items() if v is not None})
        except Exception:
            pass
    return merged


def resolve_api_token(root: Path, todoist_cfg: dict | None = None) -> str:
    for key in ("TODOIST_API_TOKEN", "TODOIST_API_KEY"):
        val = (os.environ.get(key) or "").strip()
        if val:
            return val

    cfg = todoist_cfg or {}
    for field in ("api_token", "api_key", "token"):
        val = (cfg.get(field) or "").strip()
        if val:
            return val

    yaml_path = root / "System/integrations/todoist.yaml"
    if yaml_path.is_file():
        raw = yaml_path.read_text(encoding="utf-8")
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" not in line:
                continue
            k, _, v = line.partition(":")
            if k.strip() in {"api_token", "api_key", "token"}:
                val = v.strip().strip("'\"")
                if val:
                    return val

    config_path = root / "System/integrations/config.yaml"
    if config_path.is_file():
        raw = config_path.read_text(encoding="utf-8")
        in_todoist = False
        for line in raw.splitlines():
            if line.startswith("todoist:"):
                in_todoist = True
                continue
            if in_todoist:
                if line and not line.startswith(" ") and not line.startswith("\t"):
                    break
                if "api_key:" in line or "api_token:" in line:
                    val = line.split(":", 1)[1].strip().strip("'\"")
                    if val:
                        return val

    raise TodoistError(
        "Todoist API token not found. Run: npm run cognitive:brain-todoist-setup -- <token>"
    )


def api_request(
    token: str,
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
    body: dict | None = None,
) -> Any:
    url = API_BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = None
    headers = {"Authorization": f"Bearer {token}"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method.upper(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            if not raw.strip():
                return None
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise TodoistError(f"Todoist HTTP {e.code}: {detail[:400]}", status=e.code, body=detail) from e


def list_projects(token: str) -> list[dict]:
    data = api_request(token, "GET", "/projects")
    if isinstance(data, dict) and "results" in data:
        return list(data["results"])
    if isinstance(data, list):
        return data
    return []


def ensure_project(token: str, name: str) -> str:
    for project in list_projects(token):
        if (project.get("name") or "").strip() == name.strip():
            return str(project["id"])
    created = api_request(token, "POST", "/projects", body={"name": name.strip()})
    if not isinstance(created, dict) or "id" not in created:
        raise TodoistError(f"Unexpected create project response: {created!r}")
    return str(created["id"])


def list_project_tasks(token: str, project_id: str) -> list[dict]:
    data = api_request(token, "GET", "/tasks", params={"project_id": project_id})
    if isinstance(data, dict) and "results" in data:
        return list(data["results"])
    if isinstance(data, list):
        return data
    return []


def list_completed_tasks(token: str, project_id: str, *, limit: int = 200) -> list[dict]:
    """Recently completed tasks in project (active list excludes these)."""
    data = api_request(
        token,
        "GET",
        "/tasks/completed",
        params={"project_id": project_id, "limit": str(limit)},
    )
    if isinstance(data, dict):
        return list(data.get("items") or data.get("results") or [])
    if isinstance(data, list):
        return data
    return []


def close_task(token: str, task_id: str) -> None:
    api_request(token, "POST", f"/tasks/{task_id}/close")


def delete_task(token: str, task_id: str) -> None:
    api_request(token, "DELETE", f"/tasks/{task_id}")


def marker_for(event_id: str, day: str, note_marker: str) -> str:
    return f"{note_marker} id={event_id} date={day}"


def task_matches_marker(task: dict, needle: str) -> bool:
    desc = (task.get("description") or "") + "\n" + (task.get("content") or "")
    return needle in desc


def find_task_for_event(
    tasks: list[dict], *, event_id: str, day: str, note_marker: str
) -> dict | None:
    needle = marker_for(event_id, day, note_marker)
    for task in tasks:
        if task_matches_marker(task, needle):
            return task
    return None


def event_title_content(ev: dict, title_marker: str) -> str:
    return f"{ev.get('title') or 'Brain'} {title_marker}".strip()


def completed_on_day(item: dict, day: dt.date, tz_name: str) -> bool:
    raw = item.get("completed_at") or ""
    if not raw:
        return False
    try:
        ts = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return ts.astimezone(zoneinfo.ZoneInfo(tz_name)).date() == day
    except ValueError:
        return False


def event_completed_today(
    completed_items: list[dict],
    ev: dict,
    *,
    day: dt.date,
    tz_name: str,
    title_marker: str,
    note_marker: str,
) -> bool:
    """True if user already completed this Brain event today (incl. archived copies)."""
    needle = marker_for(ev.get("id") or "", day.isoformat(), note_marker)
    title = event_title_content(ev, title_marker)
    for item in completed_items:
        if not completed_on_day(item, day, tz_name):
            continue
        blob = (item.get("content") or "") + "\n" + (item.get("description") or "")
        if needle in blob or title in (item.get("content") or ""):
            return True
    return False


def resolve_event_task_state(
    active_tasks: list[dict],
    completed_items: list[dict],
    ev: dict,
    *,
    day: dt.date,
    tz_name: str,
    title_marker: str,
    note_marker: str,
) -> tuple[dict | None, bool]:
    """Return (active_task_or_none, done_today)."""
    eid = ev.get("id") or ""
    day_str = day.isoformat()
    active = find_task_for_event(active_tasks, event_id=eid, day=day_str, note_marker=note_marker)
    done = event_completed_today(
        completed_items,
        ev,
        day=day,
        tz_name=tz_name,
        title_marker=title_marker,
        note_marker=note_marker,
    )
    if active and is_task_done(active):
        done = True
    return active, done


def skip_todoist(ev: dict, brain_cfg: dict) -> bool:
    if ev.get("todoist") is False:
        return True
    exclude = (brain_cfg.get("todoist") or {}).get("exclude_event_ids") or []
    return (ev.get("id") or "") in exclude


def events_for_date(brain_cfg: dict, day: dt.date, *, for_todoist: bool = False) -> list[dict]:
    weekday = day.weekday()
    out = []
    for ev in brain_cfg.get("events") or []:
        if for_todoist and skip_todoist(ev, brain_cfg):
            continue
        weekdays = ev.get("weekdays") or list(range(7))
        if weekday in weekdays:
            out.append(ev)
    out.sort(key=lambda e: e.get("start") or "99:99")
    return out


def slot_datetimes(
    day: dt.date, ev: dict, tz_name: str
) -> tuple[dt.datetime, dt.datetime]:
    tz = zoneinfo.ZoneInfo(tz_name)
    sh, sm = map(int, (ev.get("start") or "09:00").split(":"))
    duration = int(ev.get("duration_minutes") or 30)
    start = dt.datetime.combine(day, dt.time(sh, sm), tzinfo=tz)
    end = start + dt.timedelta(minutes=duration)
    return start, end


def build_task_payload(
    ev: dict,
    *,
    day: dt.date,
    brain_cfg: dict,
    todoist_cfg: dict,
    project_id: str,
) -> dict:
    tz_name = brain_cfg.get("timezone") or "Europe/Lisbon"
    note_marker = brain_cfg.get("note_marker") or "[BRAIN_PROTOCOL]"
    title_marker = brain_cfg.get("title_marker") or "[BRAIN]"
    start, _end = slot_datetimes(day, ev, tz_name)
    day_str = day.isoformat()
    marker = marker_for(ev.get("id") or "", day_str, note_marker)

    desc_parts = []
    if ev.get("description"):
        desc_parts.append(str(ev["description"]).strip())
    desc_parts.append(marker)
    description = "\n\n".join(desc_parts)

    content = f"{ev.get('title') or 'Brain'} {title_marker}".strip()
    if (ev.get("id") or "") == "human-garage-28":
        try:
            from brain_human_garage_reset import description_with_day, display_title

            root = repo_root()
            content = f"{display_title(root, ev, day)} {title_marker}".strip()
            description = description_with_day(root, ev, day) + "\n\n" + marker
        except Exception:
            pass
    priority = int(todoist_cfg.get("priority") or 3)
    duration = int(ev.get("duration_minutes") or 30)
    mode = (todoist_cfg.get("calendar_mode") or "date_only").strip().lower()

    body: dict[str, Any] = {
        "content": content,
        "description": description,
        "project_id": project_id,
        "priority": max(1, min(4, priority)),
    }

    slot_line = f"Слот: {ev.get('start') or ''} · {duration} мин"
    if slot_line not in description:
        body["description"] = description + "\n\n" + slot_line

    if mode == "timed":
        body["due_datetime"] = start.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        body["duration"] = duration
        body["duration_unit"] = "minute"
    else:
        body["due_date"] = day_str

    label = (todoist_cfg.get("label") or "").strip()
    if label:
        body["labels"] = [label]

    return body


def update_task(token: str, task_id: str, body: dict) -> dict:
    updated = api_request(token, "POST", f"/tasks/{task_id}", body=body)
    if not isinstance(updated, dict):
        raise TodoistError(f"Unexpected update task response: {updated!r}")
    return updated


def task_has_due_time(task: dict) -> bool:
    due = task.get("due") or {}
    if due.get("datetime"):
        return True
    return "T" in str(due.get("date") or "")


def retime_tasks_to_date_only(
    token: str,
    tasks: list[dict],
    *,
    day: str,
    note_marker: str,
) -> int:
    """Convert timed Brain tasks for `day` to due_date-only (Fantastical dedupe)."""
    changed = 0
    for task in tasks:
        desc = (task.get("description") or "") + "\n" + (task.get("content") or "")
        if note_marker not in desc or f"date={day}" not in desc:
            continue
        if not task_has_due_time(task):
            continue
        update_task(token, str(task["id"]), {"due_date": day})
        changed += 1
    return changed


def _parse_task_marker(desc: str, note_marker: str) -> tuple[str, str] | None:
    if note_marker not in desc:
        return None
    event_id = ""
    day = ""
    for line in desc.splitlines():
        if line.startswith(f"{note_marker} id="):
            rest = line[len(f"{note_marker} id=") :].strip()
            if " date=" in rest:
                event_id, day = rest.split(" date=", 1)
            else:
                event_id = rest
        elif line.startswith("date=") and not day:
            day = line.removeprefix("date=").strip()
    if event_id and day:
        return event_id, day
    return None


def retime_tasks_to_timed(
    token: str,
    tasks: list[dict],
    *,
    brain_cfg: dict,
    todoist_cfg: dict,
    note_marker: str,
) -> int:
    """Set due_datetime + duration on Brain tasks from config slot times."""
    events_by_id = {str(ev.get("id") or ""): ev for ev in brain_cfg.get("events") or []}
    changed = 0
    for task in tasks:
        desc = task.get("description") or ""
        parsed = _parse_task_marker(desc, note_marker)
        if not parsed:
            continue
        event_id, day_str = parsed
        ev = events_by_id.get(event_id)
        if not ev:
            continue
        day = dt.date.fromisoformat(day_str)
        payload = build_task_payload(
            ev,
            day=day,
            brain_cfg=brain_cfg,
            todoist_cfg={**todoist_cfg, "calendar_mode": "timed"},
            project_id=str(task.get("project_id") or ""),
        )
        body = {
            "due_datetime": payload["due_datetime"],
            "duration": payload["duration"],
            "duration_unit": payload["duration_unit"],
        }
        if task_has_due_time(task):
            due = task.get("due") or {}
            current = str(due.get("datetime") or due.get("date") or "")
            if current.startswith(body["due_datetime"][:16]):
                continue
        update_task(token, str(task["id"]), body)
        changed += 1
    return changed


def create_task(token: str, body: dict) -> dict:
    created = api_request(token, "POST", "/tasks", body=body)
    if not isinstance(created, dict):
        raise TodoistError(f"Unexpected create task response: {created!r}")
    return created


def is_task_done(task: dict) -> bool:
    if task.get("is_completed") is True:
        return True
    if task.get("checked") is True:
        return True
    return False


def is_recurring_task(task: dict) -> bool:
    due = task.get("due") or {}
    if due.get("is_recurring") is True:
        return True
    recurring = str(due.get("string") or "").lower()
    return bool(recurring and ("every" in recurring or "кажд" in recurring))


def is_brain_task(task: dict, *, note_marker: str, title_marker: str) -> bool:
    content = task.get("content") or ""
    desc = task.get("description") or ""
    blob = desc + "\n" + content
    return note_marker in blob or title_marker in content


def completion_log_path(root: Path) -> Path:
    return root / "System/state/brain-completions.jsonl"


def append_completion_log(root: Path, entry: dict) -> None:
    """Append completion/miss event (skip exact duplicate date+event_id+status)."""
    path = completion_log_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    key = (entry.get("date"), entry.get("event_id"), entry.get("status"))
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                prev = json.loads(line)
            except json.JSONDecodeError:
                continue
            prev_key = (prev.get("date"), prev.get("event_id"), prev.get("status"))
            if prev_key == key:
                return
    if "recorded_at" not in entry:
        entry = {**entry, "recorded_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def load_completion_log(root: Path) -> list[dict]:
    path = completion_log_path(root)
    if not path.is_file():
        return []
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def completion_status_for_day(root: Path, day: dt.date) -> dict[str, str]:
    day_str = day.isoformat()
    out: dict[str, str] = {}
    for row in load_completion_log(root):
        if row.get("date") != day_str:
            continue
        eid = str(row.get("event_id") or "")
        status = str(row.get("status") or "")
        if eid and status:
            out[eid] = status
    return out


def _row_title_for_event(root: Path, ev: dict, day: dt.date) -> str:
    try:
        from brain_human_garage_reset import display_title

        return display_title(root, ev, day)
    except Exception:
        return str(ev.get("title") or "")


def refresh_daily_markdown_for_day(
    root: Path,
    *,
    brain_cfg: dict,
    day: dt.date,
    completed_items: list[dict],
    tz_name: str,
    title_marker: str,
    note_marker: str,
) -> Path:
    day_events = events_for_date(brain_cfg, day, for_todoist=True)
    statuses = completion_status_for_day(root, day)
    rows: list[dict] = []
    for ev in day_events:
        eid = ev.get("id") or ""
        _active, done_today = resolve_event_task_state(
            [],
            completed_items,
            ev,
            day=day,
            tz_name=tz_name,
            title_marker=title_marker,
            note_marker=note_marker,
        )
        missed = statuses.get(eid) == "missed"
        done = bool(done_today) or statuses.get(eid) == "completed"
        rows.append(
            {
                "event_id": eid,
                "title": _row_title_for_event(root, ev, day),
                "start": ev.get("start"),
                "done": done,
                "missed": missed and not done,
            }
        )
    return write_daily_markdown(root, day=day, rows=rows)


def rollover_stale_tasks(
    token: str,
    root: Path,
    *,
    tasks: list[dict],
    today: dt.date,
    brain_cfg: dict,
    completed_items: list[dict],
    note_marker: str,
    title_marker: str,
    tz_name: str,
) -> dict[str, Any]:
    """
    Remove incomplete Brain tasks from before `today`.
    - dated tasks → log miss + close
    - recurring legacy tasks → delete (close would spawn next instance)
    """
    events_by_id = {str(ev.get("id") or ""): ev for ev in brain_cfg.get("events") or []}
    closed = 0
    deleted_recurring = 0
    closed_orphans = 0
    affected_days: set[dt.date] = set()
    errors: list[str] = []

    for task in tasks:
        if is_task_done(task):
            continue
        if not is_brain_task(task, note_marker=note_marker, title_marker=title_marker):
            continue

        task_id = str(task.get("id") or "")
        if not task_id:
            continue

        if is_recurring_task(task):
            try:
                delete_task(token, task_id)
                deleted_recurring += 1
                append_completion_log(
                    root,
                    {
                        "date": today.isoformat(),
                        "event_id": "_legacy_recurring",
                        "status": "removed_recurring",
                        "title": task.get("content") or "",
                        "task_id": task_id,
                    },
                )
            except TodoistError as exc:
                errors.append(f"delete_recurring {task_id}: {exc}")
            continue

        parsed = _parse_task_marker(task.get("description") or "", note_marker)
        if not parsed:
            try:
                close_task(token, task_id)
                closed_orphans += 1
            except TodoistError as exc:
                errors.append(f"close_orphan {task_id}: {exc}")
            continue

        event_id, day_str = parsed
        try:
            task_day = dt.date.fromisoformat(day_str)
        except ValueError:
            continue
        if task_day >= today:
            continue

        ev = events_by_id.get(event_id) or {}
        try:
            append_completion_log(
                root,
                {
                    "date": day_str,
                    "event_id": event_id,
                    "status": "missed",
                    "title": (task.get("content") or ev.get("title") or event_id),
                    "task_id": task_id,
                },
            )
            close_task(token, task_id)
            closed += 1
            affected_days.add(task_day)
        except TodoistError as exc:
            errors.append(f"rollover {event_id} {day_str}: {exc}")

    md_paths: list[str] = []
    for day in sorted(affected_days):
        path = refresh_daily_markdown_for_day(
            root,
            brain_cfg=brain_cfg,
            day=day,
            completed_items=completed_items,
            tz_name=tz_name,
            title_marker=title_marker,
            note_marker=note_marker,
        )
        md_paths.append(str(path.relative_to(root)))

    return {
        "closed_missed": closed,
        "closed_orphans": closed_orphans,
        "deleted_recurring": deleted_recurring,
        "affected_days": [d.isoformat() for d in sorted(affected_days)],
        "markdown_updated": md_paths,
        "errors": errors,
    }


def write_daily_markdown(
    root: Path,
    *,
    day: dt.date,
    rows: list[dict],
) -> Path:
    out_dir = root / "05-Areas/Cognitive_Performance/brain-daily"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{day.isoformat()}.md"
    weekday_names = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ]
    lines = [
        f"# Brain Protocol · {day.isoformat()} ({weekday_names[day.weekday()]})",
        "",
        "Источник: Todoist (галочки в Todoist / Fantastical). Календарь Google — зеркало по времени.",
        "",
    ]
    for row in rows:
        start = row.get("start") or ""
        title = row.get("title") or ""
        eid = row.get("event_id") or ""
        if row.get("missed"):
            lines.append(f"- [-] {start} {title} — `{eid}` *(пропуск)*")
        else:
            box = "x" if row.get("done") else " "
            lines.append(f"- [{box}] {start} {title} — `{eid}`")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path
