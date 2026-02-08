#!/usr/bin/env python3
"""
Google Calendar MCP Server for Dex

Connects to Google Calendar via OAuth2 (no macOS Calendar.app required).
Use when you want calendar access directly from Gmail/Google without adding
the account to Mac System Settings.

Tools (gcal_* prefix to avoid collision with Apple Calendar MCP):
- gcal_list_calendars: List all calendars
- gcal_get_events: Get events for a date range
- gcal_get_today: Today's events
- gcal_get_events_with_attendees: Events with attendee details
- gcal_get_next_event: Next upcoming event
- gcal_delete_event: Delete an event by title and date
- gcal_delete_event_series: Delete all events/series with a given title (whole recurring series or all single events in ~2 year window)

Setup:
  1. Google Cloud Console: enable Calendar API, create OAuth 2.0 Desktop client.
  2. Save credentials JSON; set GOOGLE_CALENDAR_CREDENTIALS_PATH (or use default).
  3. First run: browser opens for consent; token is stored for reuse.
"""

import os
import json
import logging
import re
from pathlib import Path
from datetime import datetime, date, timedelta
from typing import Optional

from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types

# Optional: Google API libs (install via pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib)
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    HAS_GOOGLE_DEPS = True
except ImportError:
    HAS_GOOGLE_DEPS = False

VAULT_PATH = Path(os.environ.get("VAULT_PATH", Path.cwd()))
PEOPLE_DIR = VAULT_PATH / "05-Areas" / "People"

# Read + write (required for gcal_delete_event). If you had readonly before, re-auth: remove google_calendar_token.json and run again.
SCOPES = ["https://www.googleapis.com/auth/calendar"]

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)


def _credentials_path() -> Path:
    path = os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_PATH")
    if path:
        return Path(path).expanduser()
    return Path.cwd() / "credentials.json"


def _token_path() -> Path:
    path = os.environ.get("GOOGLE_CALENDAR_TOKEN_PATH")
    if path:
        return Path(path).expanduser()
    return _credentials_path().parent / "google_calendar_token.json"


def get_credentials():
    """Load or obtain OAuth2 credentials. On first run opens browser for consent."""
    if not HAS_GOOGLE_DEPS:
        return None, "Google API libraries not installed. Run: pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib"
    creds_path = _credentials_path()
    token_path = _token_path()
    if not creds_path.exists():
        return None, f"Credentials file not found: {creds_path}. Download OAuth 2.0 Desktop client JSON from Google Cloud Console and save as credentials.json, or set GOOGLE_CALENDAR_CREDENTIALS_PATH."
    creds = None
    if token_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
        except Exception as e:
            logger.warning("Could not load token: %s", e)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                logger.warning("Token refresh failed: %s", e)
                creds = None
        if not creds:
            try:
                flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
                creds = flow.run_local_server(port=0)
            except Exception as e:
                return None, f"OAuth flow failed: {e}"
        try:
            token_path.parent.mkdir(parents=True, exist_ok=True)
            with open(token_path, "w") as f:
                f.write(creds.to_json())
        except OSError as e:
            logger.warning("Could not save token: %s", e)
    return creds, None


def _service():
    creds, err = get_credentials()
    if err:
        raise RuntimeError(err)
    return build("calendar", "v3", credentials=creds)


def _calendar_id_arg(calendar_id: str) -> str:
    """Use 'primary' for primary calendar."""
    return calendar_id if calendar_id and calendar_id.strip() else "primary"


def _parse_rfc3339(dt_str: str):
    """Parse RFC3339 from Calendar API (with or without Z)."""
    if not dt_str:
        return None
    if dt_str.endswith("Z"):
        dt_str = dt_str[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    except Exception:
        return None


def _format_event_time(event: dict) -> str:
    start = event.get("start") or {}
    dt = start.get("dateTime") or start.get("date")
    if not dt:
        return ""
    parsed = _parse_rfc3339(dt)
    if parsed:
        return parsed.strftime("%Y-%m-%d %H:%M")
    return dt


def _attendee_list(event: dict) -> list:
    attendees = []
    for a in event.get("attendees") or []:
        email = (a.get("email") or "").lower()
        name = (a.get("displayName") or email.split("@")[0].replace(".", " ").title()).strip()
        status = (a.get("responseStatus") or "needsAction").lower()
        attendees.append({"name": name, "email": email, "status": status})
    return attendees


def _find_person_page(name: str, email: str) -> Optional[str]:
    def norm(s: str) -> str:
        s = re.sub(r"[^\w\s-]", "", s)
        return re.sub(r"\s+", "_", s.strip())

    if not PEOPLE_DIR.exists():
        return None
    name_var = norm(name)
    email_name = norm(email.split("@")[0].replace(".", " ").title()) if "@" in email else None
    for folder in ["Internal", "External"]:
        folder_path = PEOPLE_DIR / folder
        if not folder_path.exists():
            continue
        for f in folder_path.glob("*.md"):
            stem = f.stem.lower().replace("_", " ").replace("-", " ")
            if name_var and name_var.lower().replace("_", " ") in stem:
                return str(f.relative_to(VAULT_PATH))
            if email_name and email_name.lower().replace("_", " ") in stem:
                return str(f.relative_to(VAULT_PATH))
            try:
                if email.lower() in f.read_text().lower():
                    return str(f.relative_to(VAULT_PATH))
            except OSError:
                pass
    return None


# --- MCP server ---
app = Server("dex-google-calendar-mcp")


@app.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="gcal_list_calendars",
            description="List all Google calendars available to the authenticated account",
            inputSchema={"type": "object", "properties": {}},
        ),
        types.Tool(
            name="gcal_get_events",
            description="Get events from a Google calendar for a date range. Use calendar_id from gcal_list_calendars or 'primary' for default.",
            inputSchema={
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string", "description": "Calendar ID (e.g. 'primary' or id from gcal_list_calendars)", "default": "primary"},
                    "start_date": {"type": "string", "description": "Start date YYYY-MM-DD (default: today)"},
                    "end_date": {"type": "string", "description": "End date YYYY-MM-DD (default: start_date + 1 day)"},
                    "limit": {"type": "integer", "description": "Max events to return", "default": 50},
                },
            },
        ),
        types.Tool(
            name="gcal_get_today",
            description="Get today's events from a Google calendar",
            inputSchema={
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string", "description": "Calendar ID", "default": "primary"},
                },
            },
        ),
        types.Tool(
            name="gcal_get_events_with_attendees",
            description="Get events with full attendee details (name, email, response status)",
            inputSchema={
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string", "description": "Calendar ID", "default": "primary"},
                    "start_date": {"type": "string", "description": "Start date YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "End date YYYY-MM-DD"},
                },
            },
        ),
        types.Tool(
            name="gcal_get_next_event",
            description="Get the next upcoming event from a Google calendar",
            inputSchema={
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string", "description": "Calendar ID", "default": "primary"},
                },
            },
        ),
        types.Tool(
            name="gcal_delete_event",
            description="Delete a Google Calendar event by its exact title and date. Finds the event on the given day and deletes it.",
            inputSchema={
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string", "description": "Calendar ID (e.g. 'primary')", "default": "primary"},
                    "title": {"type": "string", "description": "Exact title of the event to delete"},
                    "event_date": {"type": "string", "description": "Date of the event YYYY-MM-DD"},
                },
                "required": ["title", "event_date"],
            },
        ),
        types.Tool(
            name="gcal_delete_event_series",
            description="Delete all events (and recurring series) with the exact title. Removes the whole series if recurring, or all single events with that title in a ~2 year window.",
            inputSchema={
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string", "description": "Calendar ID (e.g. 'primary')", "default": "primary"},
                    "title": {"type": "string", "description": "Exact title of the event(s) or series to delete"},
                },
                "required": ["title"],
            },
        ),
    ]


@app.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    arguments = arguments or {}
    if not HAS_GOOGLE_DEPS:
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": "Google API libraries not installed. Run: pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib"
        }, indent=2))]

    try:
        service = _service()
    except RuntimeError as e:
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": str(e),
        }, indent=2))]

    try:
        if name == "gcal_list_calendars":
            items = service.calendarList().list().execute().get("items") or []
            calendars = [
                {"id": c.get("id"), "summary": c.get("summary"), "primary": c.get("primary")}
                for c in items
            ]
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "calendars": calendars,
                "count": len(calendars),
            }, indent=2))]

        calendar_id = _calendar_id_arg(arguments.get("calendar_id") or "primary")

        if name == "gcal_get_events" or name == "gcal_get_today":
            start_date = arguments.get("start_date") or datetime.now().strftime("%Y-%m-%d")
            if name == "gcal_get_today":
                end_date = start_date
            else:
                end_date = arguments.get("end_date") or (
                    datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=1)
                ).strftime("%Y-%m-%d")
            limit = arguments.get("limit", 50)
            time_min = datetime.strptime(start_date, "%Y-%m-%d").isoformat() + "Z"
            time_max = (datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)).isoformat() + "Z"
            events_result = (
                service.events()
                .list(
                    calendarId=calendar_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    maxResults=limit,
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
            events = []
            for ev in events_result.get("items") or []:
                events.append({
                    "title": ev.get("summary") or "(No title)",
                    "start": _format_event_time(ev),
                    "end": _parse_rfc3339((ev.get("end") or {}).get("dateTime") or (ev.get("end") or {}).get("date")),
                    "location": ev.get("location") or "",
                    "description": (ev.get("description") or "")[:200],
                })
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "calendar_id": calendar_id,
                "date_range": f"{start_date} to {end_date}",
                "events": events,
                "count": len(events),
            }, indent=2, cls=DateTimeEncoder))]

        if name == "gcal_get_events_with_attendees":
            start_date = arguments.get("start_date") or datetime.now().strftime("%Y-%m-%d")
            end_date = arguments.get("end_date") or (
                datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=1)
            ).strftime("%Y-%m-%d")
            time_min = datetime.strptime(start_date, "%Y-%m-%d").isoformat() + "Z"
            time_max = (datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)).isoformat() + "Z"
            events_result = (
                service.events()
                .list(
                    calendarId=calendar_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
            events = []
            for ev in events_result.get("items") or []:
                attendees = _attendee_list(ev)
                for a in attendees:
                    pp = _find_person_page(a["name"], a["email"])
                    a["has_person_page"] = pp is not None
                    a["person_page"] = pp
                events.append({
                    "title": ev.get("summary") or "(No title)",
                    "start": _format_event_time(ev),
                    "location": ev.get("location") or "",
                    "attendees": attendees,
                })
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "calendar_id": calendar_id,
                "date_range": f"{start_date} to {end_date}",
                "events": events,
                "count": len(events),
            }, indent=2, cls=DateTimeEncoder))]

        if name == "gcal_get_next_event":
            now = datetime.utcnow().isoformat() + "Z"
            events_result = (
                service.events()
                .list(
                    calendarId=calendar_id,
                    timeMin=now,
                    maxResults=1,
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
            items = events_result.get("items") or []
            if not items:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": True,
                    "next_event": None,
                    "message": "No upcoming events",
                }, indent=2))]
            ev = items[0]
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "next_event": {
                    "title": ev.get("summary") or "(No title)",
                    "start": _format_event_time(ev),
                    "location": ev.get("location") or "",
                    "attendees": _attendee_list(ev),
                },
            }, indent=2, cls=DateTimeEncoder))]

        if name == "gcal_delete_event":
            calendar_id = _calendar_id_arg(arguments.get("calendar_id") or "primary")
            title = (arguments.get("title") or "").strip()
            event_date_str = arguments.get("event_date") or ""
            if not title or not event_date_str:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "title and event_date are required",
                }, indent=2))]
            try:
                event_date = datetime.strptime(event_date_str, "%Y-%m-%d")
            except ValueError:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "event_date must be YYYY-MM-DD",
                }, indent=2))]
            time_min = event_date.replace(hour=0, minute=0, second=0, microsecond=0).isoformat() + "Z"
            time_max = (event_date + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat() + "Z"
            events_result = (
                service.events()
                .list(
                    calendarId=calendar_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    singleEvents=True,
                    orderBy="startTime",
                )
                .execute()
            )
            items = events_result.get("items") or []
            match = None
            for ev in items:
                if (ev.get("summary") or "").strip() == title:
                    match = ev
                    break
            if not match:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": f"No event found with title '{title}' on {event_date_str}",
                }, indent=2))]
            event_id = match.get("id")
            if not event_id:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "Event has no id",
                }, indent=2))]
            service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "message": f"Deleted event '{title}' on {event_date_str}",
                "calendar_id": calendar_id,
            }, indent=2))]

        if name == "gcal_delete_event_series":
            calendar_id = _calendar_id_arg(arguments.get("calendar_id") or "primary")
            title = (arguments.get("title") or "").strip()
            if not title:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "title is required",
                }, indent=2))]
            time_min = (datetime.utcnow() - timedelta(days=365)).isoformat() + "Z"
            time_max = (datetime.utcnow() + timedelta(days=730)).isoformat() + "Z"
            events_result = (
                service.events()
                .list(
                    calendarId=calendar_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    singleEvents=False,
                )
                .execute()
            )
            items = events_result.get("items") or []
            to_delete = []
            for ev in items:
                if (ev.get("summary") or "").strip() == title:
                    eid = ev.get("id")
                    if eid:
                        to_delete.append({"id": eid, "recurrence": bool(ev.get("recurrence"))})
            if not to_delete:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": f"No event or series found with title '{title}'",
                    "calendar_id": calendar_id,
                }, indent=2))]
            deleted = []
            for item in to_delete:
                try:
                    service.events().delete(calendarId=calendar_id, eventId=item["id"]).execute()
                    deleted.append(item["id"] + (" (series)" if item["recurrence"] else ""))
                except HttpError as e:
                    deleted.append(item["id"] + f" (error: {e})")
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "message": f"Deleted {len(deleted)} event/series with title '{title}'",
                "calendar_id": calendar_id,
                "deleted": deleted,
            }, indent=2))]

        return [types.TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}, indent=2))]

    except HttpError as e:
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": str(e),
        }, indent=2))]
    except Exception as e:
        logger.exception("gcal tool error")
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": str(e),
        }, indent=2))]


async def _main():
    logger.info("Starting Dex Google Calendar MCP Server")
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="dex-google-calendar-mcp",
                server_version="1.0.0",
                capabilities=app.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


def main():
    import asyncio
    asyncio.run(_main())


if __name__ == "__main__":
    main()
