#!/usr/bin/env python3
"""
Job Digest MCP Server for Dex

Automatically generates resume summaries for job vacancies.
Determines job type (iGaming/compliance vs AI/other) and selects appropriate CV.
Generates 3-paragraph summary using job-summary skill logic.

Tools:
- generate_job_summary: Generate summary for a single job vacancy
- generate_digest_summaries: Generate summaries for all jobs in a digest file
- detect_job_type: Detect if job is iGaming/compliance or AI/other
"""

import os
import re
import json
import logging
import time
from pathlib import Path
from typing import Optional, Dict, List, Any, Tuple
from datetime import datetime

from mcp.server.fastmcp import FastMCP

# Try to import Playwright for LinkedIn page parsing
try:
    from playwright.sync_api import sync_playwright, Browser, Page, BrowserContext
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

# Note: Summary generation is done by Claude in Cursor context, not via direct API calls

mcp = FastMCP("Job Digest")

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Paths
VAULT_PATH = Path(os.environ.get("VAULT_PATH", Path.cwd()))
CV_AI_PATH = VAULT_PATH / "CV Examples" / "Roman Matsukatov - CV.md"
CV_IGAMING_PATH = VAULT_PATH / "CV Examples" / "Product Manager (Gambling Platform, Early-Stage) - Compliance Focus.md"
CONFIRMED_FACTS_PATH = VAULT_PATH / ".claude" / "skills" / "resume-summary-custom" / "references" / "confirmed-facts.md"
SHORT_SUMMARIES_PATH = VAULT_PATH / ".claude" / "skills" / "resume-summary-custom" / "references" / "short-summaries-examples.md"
JOB_SEARCH_DIR = VAULT_PATH / "00-Inbox" / "Job_Search"
DIGESTS_DIR = JOB_SEARCH_DIR / "digests"
DATA_DIR = JOB_SEARCH_DIR / "data"
JOBS_DIR = DATA_DIR / "jobs"
# Same profile as filter-digest-remote-playwright.cjs (npm run job-search:linkedin-login)
LINKEDIN_PROFILE_DIR = JOB_SEARCH_DIR / ".playwright-linkedin"


def _read_file(path: Path) -> Optional[str]:
    """Read file content."""
    try:
        if path.exists():
            return path.read_text(encoding='utf-8')
    except Exception as e:
        logger.error(f"Error reading {path}: {e}")
    return None


def _detect_job_type(job_description: str, job_title: str = "") -> str:
    """
    Detect if job is iGaming/compliance or AI/other.
    Returns: 'igaming' or 'ai'
    """
    text = (job_description + " " + job_title).lower()
    
    # iGaming/compliance keywords
    igaming_keywords = [
        'igaming', 'gambling', 'casino', 'sportsbook', 'betting', 'wagering',
        'compliance', 'regulatory', 'mga', 'ukgc', 'curacao', 'gaming license',
        'responsible gaming', 'player protection', 'aml', 'kyc', 'gaming platform',
        'live casino', 'bingo', 'lottery', 'slot', 'poker', 'betting platform'
    ]
    
    # AI/tech keywords
    ai_keywords = [
        'ai', 'artificial intelligence', 'llm', 'machine learning', 'ml',
        'chatbot', 'nlp', 'vector database', 'semantic search', 'agentic',
        'openai', 'azure openai', 'gpt', 'claude', 'generative ai',
        'data science', 'data analytics', 'search', 'retrieval', 'rag'
    ]
    
    igaming_score = sum(1 for keyword in igaming_keywords if keyword in text)
    ai_score = sum(1 for keyword in ai_keywords if keyword in text)
    
    # If iGaming keywords are present and score is higher, it's iGaming
    if igaming_score > 0 and igaming_score >= ai_score:
        return 'igaming'
    
    # Default to AI/other for tech roles
    return 'ai'


def _select_cv(job_type: str) -> Path:
    """Select appropriate CV based on job type."""
    if job_type == 'igaming':
        return CV_IGAMING_PATH
    else:
        return CV_AI_PATH


def _parse_job_description_from_linkedin(job_url: str) -> Optional[Dict[str, str]]:
    """
    Parse job description from LinkedIn job page using Playwright.
    
    Returns dict with:
    - job_description: Full job description text
    - job_title: Job title
    - company: Company name
    - location: Job location
    """
    if not HAS_PLAYWRIGHT:
        logger.warning("Playwright not available. Install with: pip install playwright && playwright install chromium")
        return None
    
    # Prefer same profile as filter script (npm run job-search:linkedin-login)
    use_persistent = LINKEDIN_PROFILE_DIR.exists()
    context_state_file = VAULT_PATH / ".claude" / "linkedin" / "context_state.json" if not use_persistent else None
    
    if use_persistent or (context_state_file and context_state_file.exists()):
        pass
    else:
        logger.warning("LinkedIn session not found. Run: npm run job-search:linkedin-login")
        return None
    
    try:
        with sync_playwright() as playwright:
            if use_persistent:
                context = playwright.chromium.launch_persistent_context(
                    str(LINKEDIN_PROFILE_DIR),
                    headless=True,
                    args=["--no-sandbox"],
                )
                if not context.pages:
                    page = context.new_page()
                else:
                    page = context.pages[0]
            else:
                browser = playwright.chromium.launch(headless=True)
                context_options = {
                    "viewport": {"width": 1920, "height": 1080},
                    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                }
                context = browser.new_context(**context_options)
                with open(context_state_file, "r") as f:
                    state = json.load(f)
                    context.add_cookies(state.get("cookies", []))
                page = context.new_page()
            to_close = context if use_persistent else browser
            
            try:
                # Navigate to job page
                page.goto(job_url, wait_until="domcontentloaded", timeout=30000)
                # Wait for job description block to be rendered (LinkedIn loads it via JS)
                try:
                    page.wait_for_selector(
                        'div[class*="jobs-description"], div[class*="jobs-box__html-content"], section[class*="description"]',
                        timeout=20000
                    )
                except Exception:
                    pass
                time.sleep(3)
                
                # Check if logged in (if redirected to login, we can't parse)
                if "login" in page.url.lower() or "authwall" in page.url.lower():
                    logger.warning("Not logged into LinkedIn. Run: npm run job-search:linkedin-login")
                    to_close.close()
                    return None
                
                # Extract job description (LinkedIn DOM varies; try multiple strategies)
                description_selectors = [
                    'div[class*="jobs-description-content__text"]',
                    'div[class*="jobs-box__html-content"]',
                    'div[class*="description__text"]',
                    'section[class*="jobs-description"] div[class*="text"]',
                    '.jobs-description-content__text',
                    '[data-test-id="job-poster-description"]',
                    'div.jobs-description__content',
                    'section[class*="description"]',
                ]
                job_description = ""
                for selector in description_selectors:
                    try:
                        loc = page.locator(selector)
                        if loc.count() > 0:
                            job_description = loc.first.inner_text()
                            if job_description and len(job_description.strip()) > 100:
                                break
                    except Exception:
                        continue
                # Fallback: try JSON-LD in page
                if not job_description or len(job_description.strip()) < 100:
                    try:
                        script_ld = page.locator('script[type="application/ld+json"]')
                        for i in range(script_ld.count()):
                            txt = script_ld.nth(i).inner_text()
                            if '"description"' in txt and '"jobPosting"' in txt:
                                import re
                                m = re.search(r'"description"\s*:\s*"((?:[^"\\]|\\.)*)"', txt)
                                if m:
                                    import html
                                    job_description = html.unescape(m.group(1).encode().decode('unicode_escape'))
                                    if len(job_description) > 100:
                                        break
                    except Exception:
                        pass
                # Fallback: main content area or longest text block (LinkedIn SPA)
                if not job_description or len(job_description.strip()) < 100:
                    try:
                        main = page.locator("main")
                        if main.count() > 0:
                            job_description = main.first.inner_text()
                        if (not job_description or len(job_description.strip()) < 100) and page.locator("[class*='scaffold-layout']").count() > 0:
                            job_description = page.locator("[class*='scaffold-layout__main']").first.inner_text()
                    except Exception:
                        pass
                
                # Extract job title
                title_selectors = [
                    'h1[class*="jobs-unified-top-card__job-title"]',
                    'h1[class*="job-title"]',
                    'h2[class*="job-title"]',
                    '[data-test-id="job-poster-name"]'
                ]
                
                job_title = ""
                for selector in title_selectors:
                    try:
                        element = page.locator(selector).first
                        if element.count() > 0:
                            job_title = element.inner_text()
                            if job_title:
                                break
                    except Exception:
                        continue
                
                # Extract company name
                company_selectors = [
                    'a[class*="jobs-unified-top-card__company-name"]',
                    'a[class*="job-details-jobs-unified-top-card__company-name"]',
                    '[data-test-id="job-poster-name"]',
                    'span[class*="jobs-unified-top-card__company-name"]'
                ]
                
                company = ""
                for selector in company_selectors:
                    try:
                        element = page.locator(selector).first
                        if element.count() > 0:
                            company = element.inner_text()
                            if company:
                                break
                    except Exception:
                        continue
                
                # Extract location
                location_selectors = [
                    'span[class*="jobs-unified-top-card__bullet"]',
                    'span[class*="jobs-unified-top-card__primary-description"]',
                    '[data-test-id="job-poster-location"]'
                ]
                
                location = ""
                for selector in location_selectors:
                    try:
                        element = page.locator(selector).first
                        if element.count() > 0:
                            location = element.inner_text()
                            if location:
                                break
                    except Exception:
                        continue
                
                to_close.close()
                
                if not job_description or len(job_description.strip()) < 100:
                    debug_dir = JOB_SEARCH_DIR / "debug"
                    if debug_dir.exists():
                        try:
                            (debug_dir / "last-linkedin-job-page.html").write_text(
                                page.content()[:300000], encoding="utf-8", errors="replace"
                            )
                        except Exception:
                            pass
                    logger.warning(f"Could not extract job description from {job_url}")
                    return None
                
                return {
                    "job_description": job_description.strip(),
                    "job_title": job_title.strip() if job_title else "",
                    "company": company.strip() if company else "",
                    "location": location.strip() if location else ""
                }
                
            except Exception as e:
                logger.error(f"Error parsing LinkedIn job page: {e}")
                to_close.close()
            return None
                
    except Exception as e:
        logger.error(f"Error launching browser: {e}")
        return None


def _extract_keywords(job_description: str) -> Dict[str, List[str]]:
    """Extract keywords from job description."""
    text = job_description.lower()
    
    # Hard skills
    hard_keywords = [
        'product lifecycle', 'product life-cycle', 'product lifecycle management',
        'data literacy', 'soft launch', 'post-launch', 'funnels', 'activation',
        'onboarding', 'dashboard', 'product requirements', 'product performance',
        'revenue goals', 'lifecycle management', 'user feedback', 'customer feedback',
        'value propositions', 'positioning', 'monitoring', 'refining'
    ]
    
    # Soft skills
    soft_keywords = [
        'accountable', 'accountability', 'analyzing metrics', 'leverage data',
        'monitor and analyze', 'quantitative and qualitative', 'hands-on',
        'rolling up sleeves', 'collaboratively', 'iterating', 'ideation',
        'business impact', 'measurable', 'management experience',
        'technical and non-technical', 'reliability', 'deliverables',
        'end-to-end', 'prioritization', 'roadmap', 'strategies'
    ]
    
    found_hard = [kw for kw in hard_keywords if kw in text]
    found_soft = [kw for kw in soft_keywords if kw in text]
    
    return {
        'hard': found_hard,
        'soft': found_soft
    }


def _generate_summary_text(
    job_type: str,
    keywords: Dict[str, List[str]],
    job_title: str,
    company: str
) -> Tuple[str, List[str]]:
    """
    Generate 3-paragraph summary and suggested questions from job type and keywords.
    Uses CV/confirmed-facts-aligned templates only (12+ years, iGaming 5+ when relevant).
    """
    all_kw = (keywords.get("hard") or []) + (keywords.get("soft") or [])
    kw_str = ", ".join(all_kw[:6]) if all_kw else "product strategy, roadmap, and cross-functional delivery"

    if job_type == "igaming":
        p1 = (
            "Senior Product Manager with 12+ years in product development and management, "
            "including 5+ years in iGaming B2B and compliance. Experience across UKGC, MGA, Curacao, "
            "and other regulated markets; platform migrations, payments, and product lifecycle."
        )
    else:
        p1 = (
            "Senior Product Manager with 12+ years in product development and management, "
            "with strong fit for B2B SaaS, platform, and API product roles. Experience driving "
            "product lifecycle, roadmap, and cross-functional delivery with engineering, design, and GTM."
        )

    title_ref = job_title if job_title and job_title not in ("View job", "Jobs similar to Head of Product at Gypsy Collective") else "this role"
    p2 = (
        f"This role ({title_ref}) emphasizes {kw_str}. "
        "My experience includes product strategy and vision, backlog prioritization, user stories and acceptance criteria, "
        "and data-driven decisions using analytics and user research."
    )

    p3 = (
        "I partner with engineering, design, sales, and marketing; I mentor PMs, contribute to hiring, "
        "and have improved team efficiency through process and Scrum adoption. "
        "Comfortable in fast-paced and regulated environments."
    )

    summary = f"{p1}\n\n{p2}\n\n{p3}"

    q1 = "How would you approach the first 90 days in this role?"
    q2 = "What does success look like for this product area in the next 12 months?"
    q3 = "What are the main challenges or trade-offs the team is facing right now?"
    questions = [q1, q2, q3]
    if all_kw:
        q0 = f"Can you tell me about a time you drove {all_kw[0].replace('_', ' ')} in a previous role?"
        questions.insert(0, q0)
    suggested_questions = questions[:4]

    return summary, suggested_questions


@mcp.tool()
def detect_job_type(job_description: str, job_title: str = "") -> str:
    """
    Detect if job is iGaming/compliance or AI/other.
    
    Args:
        job_description: Full job description text
        job_title: Job title (optional)
    
    Returns:
        'igaming' for iGaming/compliance roles, 'ai' for AI/tech roles
    """
    return _detect_job_type(job_description, job_title)


@mcp.tool()
async def generate_job_summary(
    job_description: str,
    job_title: str = "",
    job_url: str = "",
    company: str = ""
) -> Dict[str, Any]:
    """
    Generate resume summary for a job vacancy.
    
    Automatically:
    1. Detects job type (iGaming/compliance vs AI/other)
    2. Selects appropriate CV
    3. Generates 3-paragraph summary with keyword matching
    
    Args:
        job_description: Full job description text
        job_title: Job title (optional, helps with detection)
        job_url: Job URL (optional, for reference)
        company: Company name (optional)
    
    Returns:
        Dict with:
        - job_type: 'igaming' or 'ai'
        - cv_path: Path to selected CV
        - summary: Generated 3-paragraph summary
        - suggested_questions: 2-4 interview prep questions
        - keywords: Extracted keywords
    """
    # Detect job type
    job_type = _detect_job_type(job_description, job_title)
    
    # Select CV
    cv_path = _select_cv(job_type)
    cv_content = _read_file(cv_path)
    
    if not cv_content:
        return {
            "error": f"CV file not found: {cv_path}",
            "job_type": job_type
        }
    
    # Read confirmed facts
    confirmed_facts = _read_file(CONFIRMED_FACTS_PATH) or ""
    
    # Extract keywords
    keywords = _extract_keywords(job_description)
    
    # Generate summary text and questions (template-based, CV-aligned)
    summary, suggested_questions = _generate_summary_text(
        job_type, keywords, job_title, company
    )
    
    return {
        "job_type": job_type,
        "cv_path": str(cv_path),
        "keywords": keywords,
        "job_title": job_title,
        "company": company,
        "job_url": job_url,
        "summary": summary,
        "suggested_questions": suggested_questions,
    }


@mcp.tool()
async def parse_linkedin_job(job_url: str) -> Dict[str, Any]:
    """
    Parse job description from LinkedIn job page URL.
    Prepares data for automatic summary generation in Cursor context.
    
    Args:
        job_url: LinkedIn job page URL (e.g., https://www.linkedin.com/jobs/view/123456)
    
    Returns:
        Dict with job_description, job_title, company, location, and prepared summary data
    """
    import asyncio
    loop = asyncio.get_event_loop()
    parsed_data = await loop.run_in_executor(None, _parse_job_description_from_linkedin, job_url)
    
    if not parsed_data:
        return {
            "error": "Could not parse job description from LinkedIn. Make sure you're logged in via linkedin_login MCP tool.",
            "job_url": job_url
        }
    
    # Detect job type and prepare summary data
    job_type = _detect_job_type(parsed_data["job_description"], parsed_data.get("job_title", ""))
    cv_path = _select_cv(job_type)
    cv_content = _read_file(cv_path)
    confirmed_facts = _read_file(CONFIRMED_FACTS_PATH) or ""
    keywords = _extract_keywords(parsed_data["job_description"])
    
    return {
        "job_url": job_url,
        "job_type": job_type,
        "cv_path": str(cv_path),
        "cv_content": cv_content,
        "confirmed_facts": confirmed_facts,
        "keywords": keywords,
        **parsed_data
    }


@mcp.tool()
async def generate_digest_summaries(digest_file: str) -> Dict[str, Any]:
    """
    Generate summaries for all jobs in a digest file.
    
    Reads LinkedIn jobs digest file and generates summary for each job.
    Updates the file with summaries appended to each job entry.
    
    Args:
        digest_file: Path to digest file (e.g., 'linkedin-jobs-2026-02-06.md')
                    or relative path from Job_Search directory
    
    Returns:
        Dict with:
        - processed: Number of jobs processed
        - summaries: List of generated summaries
        - updated_file: Path to updated file
    """
    # Resolve file path
    if Path(digest_file).is_absolute():
        digest_path = Path(digest_file)
    else:
        digest_path = DIGESTS_DIR / digest_file
    
    if not digest_path.exists():
        return {
            "error": f"Digest file not found: {digest_path}"
        }
    
    # Read digest file
    content = _read_file(digest_path)
    if not content:
        return {
            "error": f"Could not read digest file: {digest_path}"
        }
    
    # Parse jobs from markdown
    # Format: - [ ] [Title · Company · Type](URL)
    job_pattern = r'- \[ \] \[([^\]]+)\]\(([^\)]+)\)'
    jobs = []
    
    for match in re.finditer(job_pattern, content):
        title_line = match.group(1)
        url = match.group(2)
        
        # Parse title line: "Title · Company · Type"
        parts = [p.strip() for p in title_line.split('·')]
        title = parts[0] if len(parts) > 0 else ""
        company = parts[1] if len(parts) > 1 else ""
        work_type = parts[2] if len(parts) > 2 else ""
        
        jobs.append({
            "title": title,
            "company": company,
            "work_type": work_type,
            "url": url
        })
    
    if not jobs:
        return {
            "error": "No jobs found in digest file",
            "processed": 0
        }
    
    # Generate summaries (for now, return job data - actual summary generation requires Claude)
    summaries = []
    for job in jobs:
        job_type = _detect_job_type(job.get("title", ""), job.get("title", ""))
        cv_path = _select_cv(job_type)
        
        summaries.append({
            "title": job["title"],
            "company": job["company"],
            "url": job["url"],
            "job_type": job_type,
            "cv_selected": str(cv_path),
            "note": "Job description needed for summary generation. Use generate_job_summary with full JD, or use /job-summary skill in Cursor."
        })
    
    return {
        "processed": len(jobs),
        "summaries": summaries,
        "digest_file": str(digest_path),
        "note": "To generate full summaries, provide job descriptions. Use generate_job_summary tool for each job with full JD text."
    }


if __name__ == "__main__":
    mcp.run()
