#!/usr/bin/env python3
"""
LinkedIn MCP Server for Dex

⚠️ WARNING: Uses browser automation (Playwright) - NO official LinkedIn API.
This may violate LinkedIn's Terms of Service. Use at your own risk.
Account suspension is possible if LinkedIn detects automation.

Tools (linkedin_* prefix):
- linkedin_login: Login to LinkedIn (opens browser, saves session)
- linkedin_follow_company: Follow a company by LinkedIn URL
- linkedin_follow_companies_batch: Follow multiple companies from a list of URLs
- linkedin_get_company_info: Get company name and basic info from URL

Setup:
  1. Install dependencies: pip install -r core/mcp/requirements-linkedin.txt
  2. Install Playwright browsers: playwright install chromium
  3. Use linkedin_login first to authenticate (browser opens, you login manually)
  4. Session is saved and reused for subsequent operations

Note: Playwright sync API is run in a thread pool (asyncio.to_thread) to avoid
"Sync API inside asyncio loop" error when MCP runs in async context.
"""

import asyncio
import os
import json
import logging
import time
from pathlib import Path
from typing import Optional, List
from urllib.parse import urlparse, parse_qs

from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types

try:
    from playwright.sync_api import sync_playwright, Browser, Page, BrowserContext
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

VAULT_PATH = Path(os.environ.get("VAULT_PATH", Path.cwd()))
SESSION_DIR = VAULT_PATH / ".claude" / "linkedin"
SESSION_DIR.mkdir(parents=True, exist_ok=True)

# Session file stores browser context state
SESSION_FILE = SESSION_DIR / "browser_session.json"
CONTEXT_STATE_FILE = SESSION_DIR / "context_state.json"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Rate limiting: wait between actions to avoid detection
DEFAULT_DELAY_SECONDS = 3  # Wait 3 seconds between actions
MAX_BATCH_SIZE = 10  # Max companies per batch to avoid overwhelming


def _get_browser_context(playwright, headless: bool = False) -> BrowserContext:
    """Get or create browser context with saved session state."""
    browser = playwright.chromium.launch(headless=headless)
    
    # Try to load saved context state (cookies, localStorage)
    context_options = {
        "viewport": {"width": 1920, "height": 1080},
        "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    
    context = browser.new_context(**context_options)
    
    # Load saved state if exists
    if CONTEXT_STATE_FILE.exists():
        try:
            with open(CONTEXT_STATE_FILE, "r") as f:
                state = json.load(f)
                context.add_cookies(state.get("cookies", []))
        except Exception as e:
            logger.warning(f"Could not load context state: {e}")
    
    return context


def _save_context_state(context: BrowserContext):
    """Save browser context state (cookies) for reuse."""
    try:
        cookies = context.cookies()
        state = {"cookies": cookies}
        with open(CONTEXT_STATE_FILE, "w") as f:
            json.dump(state, f, indent=2)
        logger.info(f"Saved {len(cookies)} cookies to {CONTEXT_STATE_FILE}")
    except Exception as e:
        logger.warning(f"Could not save context state: {e}")


def _wait_for_linkedin_load(page: Page, timeout: int = 30000):
    """Wait for LinkedIn page to load (handles various loading states)."""
    try:
        # Wait for main content or login form
        page.wait_for_load_state("networkidle", timeout=timeout)
        time.sleep(2)  # Extra wait for dynamic content
    except Exception:
        pass  # Continue even if timeout


def _is_logged_in(page: Page) -> bool:
    """Check if user is logged into LinkedIn."""
    try:
        # Check for common logged-in indicators
        if page.locator("text=Sign in").count() > 0:
            return False
        if page.locator('[data-control-name="nav.settings"]').count() > 0:
            return True
        if page.locator('[aria-label="Me"]').count() > 0:
            return True
        # Check URL - if we're on feed or profile, we're logged in
        url = page.url
        if "linkedin.com/feed" in url or "linkedin.com/in/" in url:
            return True
        return False
    except Exception:
        return False


def _extract_company_slug(url: str) -> Optional[str]:
    """Extract company slug from LinkedIn URL."""
    # Examples:
    # https://www.linkedin.com/company/100hp-gaming/
    # https://www.linkedin.com/company/100hp-gaming/posts/
    # https://linkedin.com/company/example/
    try:
        parsed = urlparse(url)
        path_parts = [p for p in parsed.path.split("/") if p]
        if "company" in path_parts:
            idx = path_parts.index("company")
            if idx + 1 < len(path_parts):
                return path_parts[idx + 1]
    except Exception:
        pass
    return None


def _run_playwright_tool_sync(name: str, arguments: dict) -> str:
    """
    Run Playwright-based tool in a synchronous context.
    Returns JSON string for the response. Called from async handler via asyncio.to_thread().
    """
    with sync_playwright() as playwright:
        headless = arguments.get("headless", False)
        context = _get_browser_context(playwright, headless=headless)
        page = context.new_page()

        try:
            if name == "linkedin_login":
                page.goto("https://www.linkedin.com/login")
                _wait_for_linkedin_load(page)

                if _is_logged_in(page):
                    _save_context_state(context)
                    return json.dumps({"success": True, "message": "Already logged in. Session saved."}, indent=2)

                logger.info("Browser opened. Please login manually in the browser window.")
                logger.info("Waiting for login... (checking every 5 seconds, max 5 minutes)")

                for _ in range(60):
                    time.sleep(5)
                    if _is_logged_in(page):
                        _save_context_state(context)
                        return json.dumps({"success": True, "message": "Login successful! Session saved."}, indent=2)

                return json.dumps({"success": False, "error": "Login timeout. Please login manually and try again."}, indent=2)

            page.goto("https://www.linkedin.com/feed")
            _wait_for_linkedin_load(page)

            if not _is_logged_in(page):
                return json.dumps({"success": False, "error": "Not logged in. Run linkedin_login first."}, indent=2)

            if name == "linkedin_follow_company":
                company_url = (arguments.get("company_url") or "").strip()
                if not company_url:
                    return json.dumps({"success": False, "error": "company_url is required"}, indent=2)

                delay = arguments.get("delay_seconds", DEFAULT_DELAY_SECONDS)
                page.goto(company_url)
                _wait_for_linkedin_load(page)

                follow_selectors = [
                    'button:has-text("Follow")',
                    'button[aria-label*="Follow"]',
                    'button[data-control-name="follow"]',
                    'button:has-text("+ Follow")',
                ]
                followed = False
                for selector in follow_selectors:
                    try:
                        button = page.locator(selector).first
                        if button.count() > 0:
                            button.click()
                            followed = True
                            logger.info(f"Clicked Follow button using selector: {selector}")
                            break
                    except Exception:
                        continue

                if not followed:
                    if page.locator('button:has-text("Following")').count() > 0:
                        return json.dumps({"success": True, "message": "Already following this company", "company_url": company_url}, indent=2)
                    return json.dumps({"success": False, "error": "Could not find Follow button. Company page may require login or have restrictions.", "company_url": company_url}, indent=2)

                time.sleep(delay)
                _save_context_state(context)
                return json.dumps({"success": True, "message": "Successfully followed company", "company_url": company_url}, indent=2)

            if name == "linkedin_follow_companies_batch":
                company_urls = arguments.get("company_urls") or []
                if not company_urls:
                    return json.dumps({"success": False, "error": "company_urls array is required"}, indent=2)

                delay = arguments.get("delay_seconds", 5)
                max_companies = min(arguments.get("max_companies", MAX_BATCH_SIZE), MAX_BATCH_SIZE)
                urls_to_process = company_urls[:max_companies]
                results = []

                for i, url in enumerate(urls_to_process, 1):
                    logger.info(f"Processing {i}/{len(urls_to_process)}: {url}")
                    try:
                        page.goto(url)
                        _wait_for_linkedin_load(page)
                        follow_selectors = [
                            'button:has-text("Follow")',
                            'button[aria-label*="Follow"]',
                            'button[data-control-name="follow"]',
                        ]
                        followed = False
                        for selector in follow_selectors:
                            try:
                                button = page.locator(selector).first
                                if button.count() > 0:
                                    button.click()
                                    followed = True
                                    break
                            except Exception:
                                continue
                        if followed:
                            results.append({"url": url, "status": "followed"})
                        elif page.locator('button:has-text("Following")').count() > 0:
                            results.append({"url": url, "status": "already_following"})
                        else:
                            results.append({"url": url, "status": "failed", "error": "Could not find Follow button"})
                        if i < len(urls_to_process):
                            time.sleep(delay)
                    except Exception as e:
                        results.append({"url": url, "status": "error", "error": str(e)})
                        time.sleep(delay)

                _save_context_state(context)
                return json.dumps({"success": True, "processed": len(results), "results": results}, indent=2)

            if name == "linkedin_get_company_info":
                company_url = (arguments.get("company_url") or "").strip()
                if not company_url:
                    return json.dumps({"success": False, "error": "company_url is required"}, indent=2)

                page.goto(company_url)
                _wait_for_linkedin_load(page)
                company_name = None
                name_selectors = [
                    'h1.org-top-card-summary__title',
                    'h1[data-anonymize="company-name"]',
                    'h1.text-heading-xlarge',
                ]
                for selector in name_selectors:
                    try:
                        element = page.locator(selector).first
                        if element.count() > 0:
                            company_name = element.inner_text().strip()
                            break
                    except Exception:
                        continue
                return json.dumps({"success": True, "company_url": company_url, "company_name": company_name or "Unknown"}, indent=2)

            return json.dumps({"error": f"Unknown tool: {name}"}, indent=2)
        finally:
            context.close()


# --- MCP server ---
app = Server("dex-linkedin-mcp")


@app.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="linkedin_login",
            description="Login to LinkedIn. Opens browser window - you must login manually. Session is saved for reuse. ⚠️ WARNING: Browser automation may violate LinkedIn ToS.",
            inputSchema={
                "type": "object",
                "properties": {
                    "headless": {"type": "boolean", "description": "Run browser in headless mode (default: false - visible browser)", "default": False},
                },
            },
        ),
        types.Tool(
            name="linkedin_follow_company",
            description="Follow a company on LinkedIn by its company page URL. ⚠️ WARNING: May violate LinkedIn ToS. Use delays between actions.",
            inputSchema={
                "type": "object",
                "properties": {
                    "company_url": {"type": "string", "description": "Full LinkedIn company page URL (e.g. https://www.linkedin.com/company/example/)"},
                    "delay_seconds": {"type": "number", "description": "Seconds to wait after action (default: 3)", "default": 3},
                },
            },
        ),
        types.Tool(
            name="linkedin_follow_companies_batch",
            description="Follow multiple companies from a list of LinkedIn URLs. Processes in batches with delays. ⚠️ WARNING: High risk of account suspension.",
            inputSchema={
                "type": "object",
                "properties": {
                    "company_urls": {"type": "array", "items": {"type": "string"}, "description": "List of LinkedIn company page URLs"},
                    "delay_seconds": {"type": "number", "description": "Seconds to wait between each follow (default: 5)", "default": 5},
                    "max_companies": {"type": "number", "description": "Max companies to process in one batch (default: 10)", "default": 10},
                },
            },
        ),
        types.Tool(
            name="linkedin_get_company_info",
            description="Get company name and basic info from LinkedIn company page URL (read-only, no follow action).",
            inputSchema={
                "type": "object",
                "properties": {
                    "company_url": {"type": "string", "description": "LinkedIn company page URL"},
                },
            },
        ),
    ]


@app.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    arguments = arguments or {}

    if not HAS_PLAYWRIGHT:
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": "Playwright not installed. Run: pip install -r core/mcp/requirements-linkedin.txt && playwright install chromium"
        }, indent=2))]

    try:
        # Run sync Playwright in a thread to avoid blocking asyncio event loop
        result_text = await asyncio.to_thread(_run_playwright_tool_sync, name, arguments)
        return [types.TextContent(type="text", text=result_text)]
    except Exception as e:
        logger.exception("LinkedIn tool error")
        return [types.TextContent(type="text", text=json.dumps({
            "success": False,
            "error": str(e),
        }, indent=2))]


async def _main():
    logger.info("Starting Dex LinkedIn MCP Server")
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="dex-linkedin-mcp",
                server_version="1.0.0",
                capabilities=app.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


def main():
    asyncio.run(_main())


if __name__ == "__main__":
    main()
