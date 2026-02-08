#!/usr/bin/env python3
"""
Gmail MCP Server for Dex

Connects to Gmail via OAuth2. Enables reading, managing, and sending emails.

Tools (gmail_* prefix):
- Reading: gmail_list_messages, gmail_get_message, gmail_search, gmail_get_unread
- Management: gmail_mark_as_read, gmail_archive, gmail_add_label, gmail_list_labels
- Sending: gmail_send_reply
- Intelligence: gmail_extract_tasks, gmail_classify_emails, gmail_apply_smart_filters

Setup:
  1. Google Cloud Console: enable Gmail API, create OAuth 2.0 Desktop client.
  2. Save credentials JSON; set GMAIL_CREDENTIALS_PATH (or use default).
  3. First run: browser opens for consent; token is stored for reuse.
"""

import os
import json
import logging
import base64
import email
import re
import html
from email.mime.text import MIMEText
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from collections import defaultdict

from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types

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

# Gmail API scopes - read, modify, and send emails
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://mail.google.com/"
]

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _credentials_path() -> Path:
    path = os.environ.get("GMAIL_CREDENTIALS_PATH") or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_PATH")
    if path:
        return Path(path).expanduser()
    return Path.cwd() / "credentials.json"


def _token_path() -> Path:
    path = os.environ.get("GMAIL_TOKEN_PATH")
    if path:
        return Path(path).expanduser()
    return _credentials_path().parent / "gmail_token.json"


def get_credentials():
    """Load or obtain OAuth2 credentials. On first run opens browser for consent."""
    if not HAS_GOOGLE_DEPS:
        return None, "Google API libraries not installed. Run: pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib"
    creds_path = _credentials_path()
    token_path = _token_path()
    if not creds_path.exists():
        return None, (
            f"Credentials file not found: {creds_path}. "
            "Download OAuth 2.0 Desktop client JSON from Google Cloud Console (enable Gmail API) "
            "and save as credentials.json, or set GMAIL_CREDENTIALS_PATH."
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


def _service():
    creds, err = get_credentials()
    if err:
        raise RuntimeError(err)
    return build("gmail", "v1", credentials=creds)


def decode_message_body(msg_data: Dict[str, Any]) -> str:
    """Decode email body from Gmail API message format."""
    payload = msg_data.get("payload", {})
    body = ""
    
    # Handle multipart messages
    if "parts" in payload:
        for part in payload["parts"]:
            mime_type = part.get("mimeType", "")
            data = part.get("body", {}).get("data")
            if data:
                try:
                    decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
                    if mime_type == "text/plain":
                        body = decoded
                        break
                    elif mime_type == "text/html" and not body:
                        body = decoded
                except Exception as e:
                    logger.warning(f"Error decoding part: {e}")
    else:
        # Single part message
        data = payload.get("body", {}).get("data")
        if data:
            try:
                body = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
            except Exception as e:
                logger.warning(f"Error decoding body: {e}")
    
    return body


def format_message(msg_data: Dict[str, Any]) -> Dict[str, Any]:
    """Format Gmail message for display."""
    payload = msg_data.get("payload", {})
    headers = {h["name"]: h["value"] for h in payload.get("headers", [])}
    
    # Check if unread
    label_ids = msg_data.get("labelIds", [])
    is_unread = "UNREAD" in label_ids
    
    return {
        "id": msg_data.get("id"),
        "threadId": msg_data.get("threadId"),
        "snippet": msg_data.get("snippet", ""),
        "subject": headers.get("Subject", ""),
        "from": headers.get("From", ""),
        "to": headers.get("To", ""),
        "date": headers.get("Date", ""),
        "body": decode_message_body(msg_data),
        "is_unread": is_unread,
        "label_ids": label_ids,
    }


def classify_email(subject: str, from_addr: str, body: str, snippet: str) -> str:
    """Classify email into category."""
    text = f"{subject} {snippet} {body}".lower()
    from_lower = from_addr.lower()
    
    # Priority categories
    if "linkedin" in from_lower or "job" in text or "application" in text or "interview" in text:
        if "linkedin" in from_lower and ("job" in text or "position" in text):
            return "Job Alerts (LinkedIn)"
        if "thank you" in text and ("application" in text or "interest" in text):
            return "Job Application Responses"
    
    if "security" in text or "google" in from_lower or "payment" in text:
        return "Security & Google Services"
    
    # Financial
    financial_domains = ["binance", "whitebit", "revolut", "kucoin", "bank", "broker", "paypal", "stripe"]
    if any(domain in from_lower for domain in financial_domains):
        return "Financial & Transactions"
    
    # Shopping
    shopping_keywords = ["delivery", "shipped", "order", "amazon", "purchase", "receipt"]
    if any(keyword in text for keyword in shopping_keywords):
        return "Shopping & Deliveries"
    
    # Educational
    if "newsletter" in text or "subscribe" in text or "ai" in text or "ml" in text:
        return "Educational & Content Newsletters"
    
    # Services
    services_domains = ["discord", "postman", "goodreads", "rapidapi", "supermemory", "eventbrite"]
    if any(domain in from_lower for domain in services_domains):
        return "Services & Tools"
    
    # Local services
    local_keywords = ["mcdonalds", "vodafone", "remax", "continente"]
    if any(keyword in from_lower for keyword in local_keywords):
        return "Local Services & Utilities"
    
    return "Other"


def extract_tasks_from_email(subject: str, body: str, snippet: str) -> List[Dict[str, str]]:
    """Extract action items/tasks from email content."""
    tasks = []
    text = f"{subject}\n{body}\n{snippet}"
    
    # Clean HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    
    # Patterns for task detection
    patterns = [
        r'(?:can you|please|could you|need to|should|must|have to)\s+([^.!?]+[.!?])',
        r'(?:action required|action item|todo|task):\s*([^.!?]+[.!?])',
        r'(?:by|before|until)\s+([^.!?]+?)\s*:?\s*([^.!?]+[.!?])',
        r'(?:review|approve|respond|prepare|schedule|complete)\s+([^.!?]+[.!?])',
    ]
    
    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE | re.MULTILINE)
        for match in matches:
            task_text = match.group(0).strip()
            if len(task_text) > 10 and len(task_text) < 200:  # Reasonable length
                tasks.append({
                    "text": task_text,
                    "context": snippet[:200] if snippet else ""
                })
    
    # Deduplicate
    seen = set()
    unique_tasks = []
    for task in tasks:
        task_lower = task["text"].lower()
        if task_lower not in seen:
            seen.add(task_lower)
            unique_tasks.append(task)
    
    return unique_tasks[:5]  # Max 5 tasks per email


# Initialize the MCP server
app = Server("dex-gmail-mcp")


@app.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """List all available Gmail tools"""
    return [
        types.Tool(
            name="gmail_list_messages",
            description="List recent messages from Gmail inbox",
            inputSchema={
                "type": "object",
                "properties": {
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of messages to return (default: 10)",
                        "default": 10
                    },
                    "query": {
                        "type": "string",
                        "description": "Gmail search query (e.g., 'from:example@gmail.com', 'subject:meeting')"
                    }
                }
            }
        ),
        types.Tool(
            name="gmail_get_message",
            description="Get full content of a specific email message by ID",
            inputSchema={
                "type": "object",
                "properties": {
                    "message_id": {
                        "type": "string",
                        "description": "Gmail message ID"
                    }
                },
                "required": ["message_id"]
            }
        ),
        types.Tool(
            name="gmail_search",
            description="Search emails using Gmail search syntax",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Gmail search query (e.g., 'from:john@example.com', 'subject:meeting', 'is:unread')"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 10)",
                        "default": 10
                    }
                },
                "required": ["query"]
            }
        ),
        types.Tool(
            name="gmail_get_unread",
            description="Get unread messages from inbox",
            inputSchema={
                "type": "object",
                "properties": {
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of messages (default: 10)",
                        "default": 10
                    }
                }
            }
        ),
        types.Tool(
            name="gmail_mark_as_read",
            description="Mark one or more messages as read",
            inputSchema={
                "type": "object",
                "properties": {
                    "message_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of message IDs to mark as read"
                    }
                },
                "required": ["message_ids"]
            }
        ),
        types.Tool(
            name="gmail_archive",
            description="Archive one or more messages (remove from inbox)",
            inputSchema={
                "type": "object",
                "properties": {
                    "message_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of message IDs to archive"
                    }
                },
                "required": ["message_ids"]
            }
        ),
        types.Tool(
            name="gmail_add_label",
            description="Add label(s) to one or more messages",
            inputSchema={
                "type": "object",
                "properties": {
                    "message_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of message IDs"
                    },
                    "label_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of label IDs to add (use gmail_list_labels to get IDs)"
                    }
                },
                "required": ["message_ids", "label_ids"]
            }
        ),
        types.Tool(
            name="gmail_list_labels",
            description="List all labels in Gmail account",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
        types.Tool(
            name="gmail_send_reply",
            description="Send a reply to an email message",
            inputSchema={
                "type": "object",
                "properties": {
                    "message_id": {
                        "type": "string",
                        "description": "ID of the message to reply to"
                    },
                    "body": {
                        "type": "string",
                        "description": "Reply body text"
                    },
                    "subject": {
                        "type": "string",
                        "description": "Reply subject (default: Re: <original subject>)"
                    }
                },
                "required": ["message_id", "body"]
            }
        ),
        types.Tool(
            name="gmail_extract_tasks",
            description="Extract action items/tasks from email messages",
            inputSchema={
                "type": "object",
                "properties": {
                    "message_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of message IDs to extract tasks from"
                    }
                },
                "required": ["message_ids"]
            }
        ),
        types.Tool(
            name="gmail_classify_emails",
            description="Classify emails into categories (Priority, Financial, Shopping, etc.)",
            inputSchema={
                "type": "object",
                "properties": {
                    "message_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of message IDs to classify"
                    }
                },
                "required": ["message_ids"]
            }
        ),
        types.Tool(
            name="gmail_apply_smart_filters",
            description="Apply smart filters: auto-archive marketing emails, mark priority as read",
            inputSchema={
                "type": "object",
                "properties": {
                    "message_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of message IDs to process"
                    },
                    "auto_archive_marketing": {
                        "type": "boolean",
                        "description": "Automatically archive marketing emails (default: false)",
                        "default": False
                    },
                    "auto_mark_priority_read": {
                        "type": "boolean",
                        "description": "Automatically mark priority emails as read (default: false)",
                        "default": False
                    }
                },
                "required": ["message_ids"]
            }
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
        if name == "gmail_list_messages":
            max_results = arguments.get("max_results", 10)
            query = arguments.get("query", "")
            
            messages_result = service.users().messages().list(
                userId="me",
                maxResults=max_results,
                q=query
            ).execute()
            
            messages = messages_result.get("messages", [])
            formatted_messages = []
            
            for msg in messages:
                msg_data = service.users().messages().get(
                    userId="me",
                    id=msg["id"],
                    format="full"
                ).execute()
                formatted_messages.append(format_message(msg_data))
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "messages": formatted_messages,
                "count": len(formatted_messages)
            }, indent=2))]

        elif name == "gmail_get_message":
            message_id = arguments.get("message_id")
            if not message_id:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "message_id is required"
                }, indent=2))]
            
            msg_data = service.users().messages().get(
                userId="me",
                id=message_id,
                format="full"
            ).execute()
            
            formatted = format_message(msg_data)
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "message": formatted
            }, indent=2))]

        elif name == "gmail_search":
            query = arguments.get("query")
            if not query:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "query is required"
                }, indent=2))]
            
            max_results = arguments.get("max_results", 10)
            
            messages_result = service.users().messages().list(
                userId="me",
                maxResults=max_results,
                q=query
            ).execute()
            
            messages = messages_result.get("messages", [])
            formatted_messages = []
            
            for msg in messages:
                msg_data = service.users().messages().get(
                    userId="me",
                    id=msg["id"],
                    format="full"
                ).execute()
                formatted_messages.append(format_message(msg_data))
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "query": query,
                "messages": formatted_messages,
                "count": len(formatted_messages)
            }, indent=2))]

        elif name == "gmail_get_unread":
            max_results = arguments.get("max_results", 10)
            
            messages_result = service.users().messages().list(
                userId="me",
                maxResults=max_results,
                q="is:unread"
            ).execute()
            
            messages = messages_result.get("messages", [])
            formatted_messages = []
            
            for msg in messages:
                msg_data = service.users().messages().get(
                    userId="me",
                    id=msg["id"],
                    format="full"
                ).execute()
                formatted_messages.append(format_message(msg_data))
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "messages": formatted_messages,
                "count": len(formatted_messages)
            }, indent=2))]

        elif name == "gmail_mark_as_read":
            message_ids = arguments.get("message_ids", [])
            if not message_ids:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "message_ids is required"
                }, indent=2))]
            
            # Remove UNREAD label from messages
            for msg_id in message_ids:
                service.users().messages().modify(
                    userId="me",
                    id=msg_id,
                    body={"removeLabelIds": ["UNREAD"]}
                ).execute()
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "marked_as_read": len(message_ids),
                "message_ids": message_ids
            }, indent=2))]

        elif name == "gmail_archive":
            message_ids = arguments.get("message_ids", [])
            if not message_ids:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "message_ids is required"
                }, indent=2))]
            
            # Remove INBOX label (archives the message)
            for msg_id in message_ids:
                service.users().messages().modify(
                    userId="me",
                    id=msg_id,
                    body={"removeLabelIds": ["INBOX"]}
                ).execute()
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "archived": len(message_ids),
                "message_ids": message_ids
            }, indent=2))]

        elif name == "gmail_add_label":
            message_ids = arguments.get("message_ids", [])
            label_ids = arguments.get("label_ids", [])
            if not message_ids or not label_ids:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "message_ids and label_ids are required"
                }, indent=2))]
            
            # Add labels to messages
            for msg_id in message_ids:
                service.users().messages().modify(
                    userId="me",
                    id=msg_id,
                    body={"addLabelIds": label_ids}
                ).execute()
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "labeled": len(message_ids),
                "message_ids": message_ids,
                "label_ids": label_ids
            }, indent=2))]

        elif name == "gmail_list_labels":
            labels_result = service.users().labels().list(userId="me").execute()
            labels = labels_result.get("labels", [])
            
            formatted_labels = [
                {
                    "id": label.get("id"),
                    "name": label.get("name"),
                    "type": label.get("type")
                }
                for label in labels
            ]
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "labels": formatted_labels,
                "count": len(formatted_labels)
            }, indent=2))]

        elif name == "gmail_send_reply":
            message_id = arguments.get("message_id")
            body = arguments.get("body")
            subject = arguments.get("subject")
            
            if not message_id or not body:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "message_id and body are required"
                }, indent=2))]
            
            # Get original message to extract headers
            original_msg = service.users().messages().get(
                userId="me",
                id=message_id,
                format="full"
            ).execute()
            
            payload = original_msg.get("payload", {})
            headers = {h["name"]: h["value"] for h in payload.get("headers", [])}
            
            # Extract original subject and from
            original_subject = headers.get("Subject", "")
            reply_to = headers.get("From", "")
            thread_id = original_msg.get("threadId")
            
            # Prepare reply subject
            reply_subject = subject or f"Re: {original_subject}"
            if not reply_subject.startswith("Re:"):
                reply_subject = f"Re: {reply_subject}"
            
            # Create message
            message = MIMEText(body)
            message["To"] = reply_to
            message["Subject"] = reply_subject
            
            # Encode message
            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
            
            # Send reply
            send_result = service.users().messages().send(
                userId="me",
                body={
                    "raw": raw_message,
                    "threadId": thread_id
                }
            ).execute()
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "sent": True,
                "message_id": send_result.get("id"),
                "thread_id": thread_id,
                "to": reply_to,
                "subject": reply_subject
            }, indent=2))]

        elif name == "gmail_extract_tasks":
            message_ids = arguments.get("message_ids", [])
            if not message_ids:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "message_ids is required"
                }, indent=2))]
            
            all_tasks = []
            for msg_id in message_ids:
                msg_data = service.users().messages().get(
                    userId="me",
                    id=msg_id,
                    format="full"
                ).execute()
                
                formatted = format_message(msg_data)
                tasks = extract_tasks_from_email(
                    formatted["subject"],
                    formatted["body"],
                    formatted["snippet"]
                )
                
                for task in tasks:
                    task["message_id"] = msg_id
                    task["from"] = formatted["from"]
                    task["subject"] = formatted["subject"]
                    task["date"] = formatted["date"]
                    task["gmail_link"] = f"https://mail.google.com/mail/u/0/#inbox/{msg_id}"
                
                all_tasks.extend(tasks)
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "tasks": all_tasks,
                "count": len(all_tasks)
            }, indent=2))]

        elif name == "gmail_classify_emails":
            message_ids = arguments.get("message_ids", [])
            if not message_ids:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "message_ids is required"
                }, indent=2))]
            
            classified = defaultdict(list)
            
            for msg_id in message_ids:
                msg_data = service.users().messages().get(
                    userId="me",
                    id=msg_id,
                    format="full"
                ).execute()
                
                formatted = format_message(msg_data)
                category = classify_email(
                    formatted["subject"],
                    formatted["from"],
                    formatted["body"],
                    formatted["snippet"]
                )
                
                classified[category].append({
                    "message_id": msg_id,
                    "subject": formatted["subject"],
                    "from": formatted["from"],
                    "date": formatted["date"],
                    "is_unread": formatted["is_unread"],
                    "snippet": formatted["snippet"][:200]
                })
            
            result = {
                category: {
                    "emails": emails,
                    "count": len(emails)
                }
                for category, emails in classified.items()
            }
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "categories": result,
                "total": len(message_ids)
            }, indent=2))]

        elif name == "gmail_apply_smart_filters":
            message_ids = arguments.get("message_ids", [])
            auto_archive_marketing = arguments.get("auto_archive_marketing", False)
            auto_mark_priority_read = arguments.get("auto_mark_priority_read", False)
            
            if not message_ids:
                return [types.TextContent(type="text", text=json.dumps({
                    "success": False,
                    "error": "message_ids is required"
                }, indent=2))]
            
            to_archive = []
            to_mark_read = []
            
            for msg_id in message_ids:
                msg_data = service.users().messages().get(
                    userId="me",
                    id=msg_id,
                    format="full"
                ).execute()
                
                formatted = format_message(msg_data)
                category = classify_email(
                    formatted["subject"],
                    formatted["from"],
                    formatted["body"],
                    formatted["snippet"]
                )
                
                # Marketing emails to archive
                marketing_categories = [
                    "Shopping & Deliveries",
                    "Local Services & Utilities",
                    "Educational & Content Newsletters"
                ]
                if auto_archive_marketing and category in marketing_categories:
                    to_archive.append(msg_id)
                
                # Priority emails to mark as read
                priority_categories = [
                    "Job Application Responses",
                    "Job Alerts (LinkedIn)",
                    "Security & Google Services",
                    "Financial & Transactions"
                ]
                if auto_mark_priority_read and category in priority_categories and formatted["is_unread"]:
                    to_mark_read.append(msg_id)
            
            # Execute actions
            archived_count = 0
            if to_archive:
                for msg_id in to_archive:
                    try:
                        service.users().messages().modify(
                            userId="me",
                            id=msg_id,
                            body={"removeLabelIds": ["INBOX"]}
                        ).execute()
                        archived_count += 1
                    except Exception as e:
                        logger.warning(f"Failed to archive {msg_id}: {e}")
            
            marked_read_count = 0
            if to_mark_read:
                for msg_id in to_mark_read:
                    try:
                        service.users().messages().modify(
                            userId="me",
                            id=msg_id,
                            body={"removeLabelIds": ["UNREAD"]}
                        ).execute()
                        marked_read_count += 1
                    except Exception as e:
                        logger.warning(f"Failed to mark as read {msg_id}: {e}")
            
            return [types.TextContent(type="text", text=json.dumps({
                "success": True,
                "archived": archived_count,
                "marked_as_read": marked_read_count,
                "to_archive": to_archive,
                "to_mark_read": to_mark_read
            }, indent=2))]

        else:
            return [types.TextContent(type="text", text=json.dumps({
                "success": False,
                "error": f"Unknown tool: {name}"
            }, indent=2))]

    except HttpError as e:
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": f"Gmail API error: {e.content.decode() if hasattr(e, 'content') else str(e)}"
        }, indent=2))]
    except Exception as e:
        logger.exception("Error in gmail tool")
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": str(e)
        }, indent=2))]


async def _main():
    """Async main entry point for the MCP server."""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="gmail-mcp",
                server_version="1.0.0",
                capabilities=app.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


def main():
    """Sync entry point for console script."""
    import asyncio
    asyncio.run(_main())


if __name__ == "__main__":
    main()
