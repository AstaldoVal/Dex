#!/usr/bin/env python3
"""
Google Drive MCP Server for Dex

Connects to Google Drive via OAuth2. Enables search, list files/folders,
read file content, and extract information from documents.

Tools (gdrive_* prefix):
- gdrive_list_files: List files and folders in a folder or root
- gdrive_search: Search files by name or full-text query
- gdrive_get_metadata: Get metadata for a file or folder
- gdrive_read_file: Read/export file content (Docs → text, Sheets → CSV, binaries → base64 or skip)
- gdrive_get_folder_info: Get folder metadata and list direct children
- gdrive_list_shared_drives: List Shared Drives (Team Drives) the current account has access to, with names and IDs. Read-only.
- gdrive_create_doc: Create a new Google Doc with optional title, content, and parent folder (saved to Drive)

Setup:
  1. Google Cloud Console: enable Drive API and Docs API, create OAuth 2.0 Desktop client.
  2. Save credentials JSON; set GOOGLE_DRIVE_CREDENTIALS_PATH (or use default under Credentials/personal/).
  3. First run: browser opens for consent; token is stored for reuse.
  4. After adding gdrive_create_doc: if you get 403 on create, delete the token file and run again to
     re-consent with new scopes. Token locations (see mcp.json and _token_path()):
     - google-drive-mcp (no env): token = Credentials/personal/google_drive_token.json
     - google-drive-work-mcp: token = GOOGLE_DRIVE_TOKEN_PATH, e.g. Credentials/google-work/google_drive_token.json
"""

import os
import json
import logging
import sys
from pathlib import Path

_CORE_DIR = Path(__file__).resolve().parent.parent
if str(_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(_CORE_DIR))
from credentials_paths import default_personal_credentials_json, default_personal_drive_token
from typing import Optional

from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload
    from googleapiclient.errors import HttpError
    import io
    HAS_GOOGLE_DEPS = True
except ImportError:
    HAS_GOOGLE_DEPS = False

# Drive API v3 + Docs API (create and edit documents)
SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",  # create/manage files created by app
    "https://www.googleapis.com/auth/documents",   # create and edit Google Docs
]

# Export MIME for native Google types
EXPORT_MIMES = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}

# Max content size to return as text (avoid token overflow)
MAX_TEXT_SIZE = 500_000  # ~500k chars

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _credentials_path() -> Path:
    path = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH")
    if path:
        return Path(path).expanduser()
    return default_personal_credentials_json()


def _token_path() -> Path:
    path = os.environ.get("GOOGLE_DRIVE_TOKEN_PATH")
    if path:
        return Path(path).expanduser()
    return default_personal_drive_token()


def get_credentials():
    """Load or obtain OAuth2 credentials. On first run opens browser for consent."""
    if not HAS_GOOGLE_DEPS:
        return None, "Google API libraries not installed. Run: pip install -r core/mcp/requirements-google-drive.txt"
    creds_path = _credentials_path()
    token_path = _token_path()
    if not creds_path.exists():
        return None, (
            f"Credentials file not found: {creds_path}. "
            "Download OAuth 2.0 Desktop client JSON from Google Cloud Console (enable Drive API) "
            "and save as credentials.json, or set GOOGLE_DRIVE_CREDENTIALS_PATH."
        )
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


def _drive_service():
    creds, err = get_credentials()
    if err:
        raise RuntimeError(err)
    return build("drive", "v3", credentials=creds)


def _docs_service():
    creds, err = get_credentials()
    if err:
        raise RuntimeError(err)
    return build("docs", "v1", credentials=creds)


def _service():
    """Alias for backward compatibility."""
    return _drive_service()


def _file_fields_list():
    return "nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink, parents, trashed)"


def _file_fields_meta():
    # Include owners to reliably distinguish personal vs work account files.
    return (
        "id, name, mimeType, modifiedTime, createdTime, size, webViewLink, "
        "parents, trashed, description, owners(displayName,emailAddress,me)"
    )

def _drive_account_user(service):
    about = service.about().get(fields="user(displayName,emailAddress)").execute()
    return (about or {}).get("user") or {}


# --- MCP server ---
app = Server("dex-google-drive-mcp")


@app.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="gdrive_list_files",
            description="List files and folders in a Google Drive folder. Use folder_id from a previous call or 'root' for My Drive root.",
            inputSchema={
                "type": "object",
                "properties": {
                    "folder_id": {"type": "string", "description": "Folder ID or 'root' for root of My Drive", "default": "root"},
                    "page_size": {"type": "integer", "description": "Max items per page", "default": 20},
                    "order_by": {"type": "string", "description": "Sort: modifiedTime desc, name, createdTime desc", "default": "modifiedTime desc"},
                    "include_trashed": {"type": "boolean", "description": "Include trashed items", "default": False},
                },
            },
        ),
        types.Tool(
            name="gdrive_search",
            description="Search Google Drive by file name or full-text in document body. Returns matching files with metadata.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query: file name or text to find inside documents"},
                    "name_only": {"type": "boolean", "description": "If true, search by file name only (name contains query). If false, full-text search inside documents.", "default": False},
                    "page_size": {"type": "integer", "description": "Max results", "default": 20},
                    "mime_type": {"type": "string", "description": "Optional: filter by MIME type (e.g. application/vnd.google-apps.document for Docs)"},
                    "folder_id": {"type": "string", "description": "Optional: limit search to folder ID"},
                },
            },
        ),
        types.Tool(
            name="gdrive_get_account",
            description="Return current Google account identity used by this MCP server (displayName, emailAddress).",
            inputSchema={"type": "object", "properties": {}},
        ),
        types.Tool(
            name="gdrive_get_metadata",
            description="Get full metadata for a file or folder (id, name, mimeType, size, dates, link, parents).",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_id": {"type": "string", "description": "File or folder ID from list/search"},
                },
            },
        ),
        types.Tool(
            name="gdrive_read_file",
            description="Read file content. Exports Google Docs to plain text, Sheets to CSV, other text files as-is. Large binaries return size note; optional base64.",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_id": {"type": "string", "description": "File ID"},
                    "max_chars": {"type": "integer", "description": "Max characters to return (default 500000)", "default": 500000},
                    "export_format": {"type": "string", "description": "For Docs: text/plain or text/html. For Sheets: text/csv. Ignored for non-export types.", "default": "text/plain"},
                },
            },
        ),
        types.Tool(
            name="gdrive_get_folder_info",
            description="Get folder metadata and list its direct children (first page). Use folder_id or 'root'.",
            inputSchema={
                "type": "object",
                "properties": {
                    "folder_id": {"type": "string", "description": "Folder ID or 'root'", "default": "root"},
                    "page_size": {"type": "integer", "description": "Max children to return", "default": 50},
                },
            },
        ),
        types.Tool(
            name="gdrive_list_shared_drives",
            description="List all Shared Drives (Team Drives) the current OAuth account has access to. Returns id, name, createdTime, and hidden flag. Read-only — uses Drive API drives().list().",
            inputSchema={
                "type": "object",
                "properties": {
                    "page_size": {"type": "integer", "description": "Max Shared Drives per page (1-100). Default 100.", "default": 100},
                    "query": {"type": "string", "description": "Optional Drive search query (e.g. \"name contains 'Banda'\" or \"hidden = false\"). Drive API drives.list q syntax.", "default": ""},
                    "use_domain_admin_access": {"type": "boolean", "description": "If true, list ALL Shared Drives in the Workspace domain (requires admin scope). Default false.", "default": False},
                },
            },
        ),
        types.Tool(
            name="gdrive_create_doc",
            description="Create a new Google Doc in Drive with the given title and optional body text. Optionally place it in a folder. Returns file id and webViewLink.",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Document title (required)"},
                    "content": {"type": "string", "description": "Plain text or HTML-like content to insert into the document body. Newlines and basic formatting preserved."},
                    "folder_id": {"type": "string", "description": "Optional. Google Drive folder ID where to create the doc. If omitted, doc is created in My Drive root."},
                    "expected_owner_email": {
                        "type": "string",
                        "description": "Optional safety check. If set, doc creation fails unless current OAuth account email matches this value.",
                    },
                },
                "required": ["title"],
            },
        ),
    ]


def _build_query(parent_id: Optional[str], q_extra: Optional[str], include_trashed: bool) -> str:
    parts = []
    if parent_id and parent_id != "root":
        parts.append(f"'{parent_id}' in parents")
    else:
        parts.append("'root' in parents")
    if not include_trashed:
        parts.append("trashed = false")
    if q_extra:
        parts.append(q_extra)
    return " and ".join(parts)


@app.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    arguments = arguments or {}
    if not HAS_GOOGLE_DEPS:
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": "Google API libraries not installed. Run: pip install -r core/mcp/requirements-google-drive.txt"
        }, indent=2))]

    try:
        service = _service()
    except RuntimeError as e:
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": str(e),
        }, indent=2))]

    try:
        if name == "gdrive_list_files":
            folder_id = (arguments.get("folder_id") or "root").strip()
            page_size = min(int(arguments.get("page_size") or 20), 100)
            order_by = arguments.get("order_by") or "modifiedTime desc"
            include_trashed = bool(arguments.get("include_trashed", False))
            q = _build_query(folder_id if folder_id != "root" else None, None, include_trashed)
            result = (
                service.files()
                .list(
                    q=q,
                    pageSize=page_size,
                    orderBy=order_by,
                    fields=_file_fields_list(),
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                )
                .execute()
            )
            files = result.get("files") or []
            items = []
            for f in files:
                items.append({
                    "id": f.get("id"),
                    "name": f.get("name"),
                    "mimeType": f.get("mimeType"),
                    "modifiedTime": f.get("modifiedTime"),
                    "size": f.get("size"),
                    "webViewLink": f.get("webViewLink"),
                    "is_folder": f.get("mimeType") == "application/vnd.google-apps.folder",
                })
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "folder_id": folder_id,
                "files": items,
                "count": len(items),
                "nextPageToken": result.get("nextPageToken"),
            }, indent=2))]

        if name == "gdrive_search":
            query = (arguments.get("query") or "").strip()
            if not query:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "query is required",
                }, indent=2))]
            name_only = bool(arguments.get("name_only", False))
            page_size = min(int(arguments.get("page_size") or 20), 100)
            mime_type = (arguments.get("mime_type") or "").strip()
            folder_id = (arguments.get("folder_id") or "").strip()
            q_parts = ["trashed = false"]
            # Escape single quote in query for Drive q syntax
            safe_query = query.replace("\\", "\\\\").replace("'", "\\'")
            if name_only:
                q_parts.append(f"name contains '{safe_query}'")
            else:
                q_parts.append(f"fullText contains '{safe_query}'")
            if mime_type:
                q_parts.append(f"mimeType = '{mime_type}'")
            if folder_id:
                q_parts.append(f"'{folder_id}' in parents")
            q = " and ".join(q_parts)
            result = (
                service.files()
                .list(
                    q=q,
                    pageSize=page_size,
                    fields=_file_fields_list(),
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                )
                .execute()
            )
            files = result.get("files") or []
            items = [{"id": f.get("id"), "name": f.get("name"), "mimeType": f.get("mimeType"), "modifiedTime": f.get("modifiedTime"), "webViewLink": f.get("webViewLink")} for f in files]
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "query": query,
                "files": items,
                "count": len(items),
                "nextPageToken": result.get("nextPageToken"),
            }, indent=2))]

        if name == "gdrive_get_account":
            user = _drive_account_user(service)
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "account": {
                    "displayName": user.get("displayName"),
                    "emailAddress": user.get("emailAddress"),
                },
            }, indent=2))]

        if name == "gdrive_get_metadata":
            file_id = (arguments.get("file_id") or "").strip()
            if not file_id:
                return [types.TextContent(type="text", text=json.dumps({"success": False, "error": "file_id is required"}, indent=2))]
            meta = service.files().get(
                fileId=file_id,
                fields=_file_fields_meta(),
                supportsAllDrives=True,
            ).execute()
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "file": meta,
            }, indent=2))]

        if name == "gdrive_read_file":
            file_id = (arguments.get("file_id") or "").strip()
            if not file_id:
                return [types.TextContent(type="text", text=json.dumps({"success": False, "error": "file_id is required"}, indent=2))]
            max_chars = min(int(arguments.get("max_chars") or MAX_TEXT_SIZE), 1_000_000)
            export_format = (arguments.get("export_format") or "text/plain").strip()

            meta = service.files().get(
                fileId=file_id,
                fields="id, name, mimeType, size",
                supportsAllDrives=True,
            ).execute()
            mime = meta.get("mimeType") or ""
            size = int(meta.get("size") or 0)

            # Native Google types: export
            if mime in EXPORT_MIMES:
                export_mime = export_format if export_format in ("text/plain", "text/html", "text/csv") else EXPORT_MIMES[mime]
                try:
                    # google-api-python-client: files().export() does not accept
                    # supportsAllDrives (unlike files().get()); omit to avoid TypeError.
                    content = service.files().export(
                        fileId=file_id,
                        mimeType=export_mime,
                    ).execute()
                    if isinstance(content, bytes):
                        text = content.decode("utf-8", errors="replace")
                    else:
                        text = content
                    if len(text) > max_chars:
                        text = text[:max_chars] + "\n\n... [truncated]"
                    return [types.TextContent(type="text", text=json.dumps({
                        "success": True,
                        "file_id": file_id,
                        "name": meta.get("name"),
                        "mimeType": mime,
                        "exported_as": export_mime,
                        "content": text,
                        "truncated": len(text) >= max_chars,
                    }, indent=2, ensure_ascii=False))]
                except HttpError as e:
                    return [types.TextContent(type="text", text=json.dumps({
                        "success": False,
                        "error": str(e),
                        "hint": "Export may not be supported for this file type.",
                    }, indent=2))]

            # Binary or unknown: try get_media for small text-like files
            if size > 10 * 1024 * 1024:  # 10 MB
                return [types.TextContent(type="text", text=json.dumps({
                    "success": True,
                    "file_id": file_id,
                    "name": meta.get("name"),
                    "mimeType": mime,
                    "size_bytes": size,
                    "content": None,
                    "message": "File too large to return as text. Use Drive UI or download link.",
                }, indent=2))]

            try:
                buf = io.BytesIO()
                # get_media() likewise does not accept supportsAllDrives in older clients.
                request = service.files().get_media(fileId=file_id)
                downloader = MediaIoBaseDownload(buf, request)
                done = False
                while not done:
                    _, done = downloader.next_chunk()
                raw = buf.getvalue()
            except HttpError as e:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": str(e),
                }, indent=2))]

            # Try decode as text
            try:
                text = raw.decode("utf-8", errors="replace")
                if len(text) > max_chars:
                    text = text[:max_chars] + "\n\n... [truncated]"
                return [types.TextContent(type="text", text=json.dumps({
                    "success": True,
                    "file_id": file_id,
                    "name": meta.get("name"),
                    "mimeType": mime,
                    "content": text,
                    "truncated": len(text) >= max_chars,
                }, indent=2, ensure_ascii=False))]
            except Exception:
                pass
            # Binary
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "file_id": file_id,
                "name": meta.get("name"),
                "mimeType": mime,
                "size_bytes": len(raw),
                "content": None,
                "message": "Binary file. Use webViewLink to open in browser or download manually.",
            }, indent=2))]

        if name == "gdrive_get_folder_info":
            folder_id = (arguments.get("folder_id") or "root").strip()
            page_size = min(int(arguments.get("page_size") or 50), 100)
            meta = service.files().get(
                fileId=folder_id,
                fields=_file_fields_meta(),
                supportsAllDrives=True,
            ).execute()
            q = _build_query(folder_id, None, False)
            result = (
                service.files()
                .list(
                    q=q,
                    pageSize=page_size,
                    orderBy="modifiedTime desc",
                    fields=_file_fields_list(),
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                )
                .execute()
            )
            files = result.get("files") or []
            children = [{"id": f.get("id"), "name": f.get("name"), "mimeType": f.get("mimeType"), "modifiedTime": f.get("modifiedTime"), "is_folder": f.get("mimeType") == "application/vnd.google-apps.folder"} for f in files]
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "folder": meta,
                "children": children,
                "children_count": len(children),
                "nextPageToken": result.get("nextPageToken"),
            }, indent=2))]

        if name == "gdrive_list_shared_drives":
            page_size = max(1, min(int(arguments.get("page_size") or 100), 100))
            query = (arguments.get("query") or "").strip()
            use_admin = bool(arguments.get("use_domain_admin_access", False))
            drives_collected: list[dict] = []
            page_token = None
            while True:
                kwargs = {
                    "pageSize": page_size,
                    "fields": "nextPageToken, drives(id,name,createdTime,hidden,colorRgb)",
                }
                if query:
                    kwargs["q"] = query
                if use_admin:
                    kwargs["useDomainAdminAccess"] = True
                if page_token:
                    kwargs["pageToken"] = page_token
                resp = service.drives().list(**kwargs).execute()
                for d in (resp.get("drives") or []):
                    drives_collected.append({
                        "id": d.get("id"),
                        "name": d.get("name"),
                        "createdTime": d.get("createdTime"),
                        "hidden": bool(d.get("hidden")),
                        "colorRgb": d.get("colorRgb"),
                    })
                page_token = resp.get("nextPageToken")
                if not page_token:
                    break
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "count": len(drives_collected),
                "drives": drives_collected,
            }, indent=2, ensure_ascii=False))]

        if name == "gdrive_create_doc":
            title = (arguments.get("title") or "").strip()
            if not title:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "title is required",
                }, indent=2))]
            content = (arguments.get("content") or "").strip()
            folder_id = (arguments.get("folder_id") or "").strip() or None
            expected_owner_email = (arguments.get("expected_owner_email") or "").strip().lower()
            drive_svc = _drive_service()
            docs_svc = _docs_service()
            account = _drive_account_user(drive_svc)
            account_email = (account.get("emailAddress") or "").strip().lower()
            if expected_owner_email and account_email != expected_owner_email:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "account_mismatch",
                    "expected_owner_email": expected_owner_email,
                    "actual_owner_email": account_email or None,
                    "message": "Refusing to create doc in unexpected account.",
                }, indent=2))]
            # Create blank Doc via Docs API (file appears in Drive)
            create_body = {"title": title}
            new_doc = docs_svc.documents().create(body=create_body).execute()
            doc_id = new_doc.get("documentId")
            if not doc_id:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "Docs API did not return documentId",
                }, indent=2))]
            # Insert content at index 1 (start of body in a new doc)
            if content:
                # Chunk to avoid API limits; insertText has practical limit ~50k chars per request
                chunk_size = 40000
                insert_index = 1
                for i in range(0, len(content), chunk_size):
                    chunk = content[i : i + chunk_size]
                    docs_svc.documents().batchUpdate(
                        documentId=doc_id,
                        body={
                            "requests": [
                                {
                                    "insertText": {
                                        "location": {"index": insert_index},
                                        "text": chunk,
                                    }
                                }
                            ]
                        },
                    ).execute()
                    insert_index += len(chunk)
            # Optionally move to folder (Drive API)
            if folder_id and folder_id != "root":
                try:
                    drive_svc.files().update(
                        fileId=doc_id,
                        addParents=folder_id,
                        supportsAllDrives=True,
                    ).execute()
                except HttpError as e:
                    logger.warning("Could not set parent folder: %s", e)
            # Get web link
            meta = drive_svc.files().get(
                fileId=doc_id,
                fields="id, name, webViewLink, mimeType, owners(displayName,emailAddress,me)",
                supportsAllDrives=True,
            ).execute()
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "file_id": doc_id,
                "name": meta.get("name"),
                "webViewLink": meta.get("webViewLink"),
                "mimeType": meta.get("mimeType"),
                "owners": meta.get("owners") or [],
                "created_by_account": {
                    "displayName": account.get("displayName"),
                    "emailAddress": account.get("emailAddress"),
                },
                "message": "Google Doc created. Open webViewLink to edit.",
            }, indent=2, ensure_ascii=False))]

        return [types.TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}, indent=2))]

    except HttpError as e:
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": str(e),
        }, indent=2))]
    except Exception as e:
        logger.exception("gdrive tool error")
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": str(e),
        }, indent=2))]


async def _main():
    logger.info("Starting Dex Google Drive MCP Server")
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="dex-google-drive-mcp",
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
