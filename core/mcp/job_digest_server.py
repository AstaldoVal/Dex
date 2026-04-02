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
import traceback
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

# Try to import OpenAI for summary generation
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

try:
    from openai_usage_logger import log_openai_call, eval_job_summary as _eval_job_summary
    HAS_USAGE_LOGGER = True
except ImportError:
    HAS_USAGE_LOGGER = False

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
JOB_SUMMARY_KEYWORD_RULES_PATH = VAULT_PATH / ".claude" / "reference" / "job-summary-keyword-rules.md"
JOB_SUMMARY_SKILL_PATH = VAULT_PATH / ".claude" / "skills" / "job-summary" / "SKILL.md"
JOB_SEARCH_DIR = VAULT_PATH / "00-Inbox" / "Job_Search"
SUMMARY_ERROR_LOG = JOB_SEARCH_DIR / "teal" / "summary-errors.log"
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


def _join_phrases_naturally(phrases: List[str]) -> str:
    """Join skill phrases for readable sentence (a, b, c, and d). No count limit."""
    if not phrases:
        return ""
    if len(phrases) == 1:
        return phrases[0]
    if len(phrases) == 2:
        return phrases[0] + " and " + phrases[1]
    return ", ".join(phrases[:-1]) + ", and " + phrases[-1]


def _phrase_supported_by_cv(phrase: str, cv_text: str) -> bool:
    """
    True only if the phrase is backed by the CV: exact/substring match or majority of
    significant words appear in CV. Ensures we never claim experience that isn't in the CV.
    """
    if not cv_text or not phrase:
        return False
    pl = phrase.strip().lower()
    cv = cv_text.lower()
    if pl in cv:
        return True
    words = [w for w in pl.split() if len(w) > 2]
    if not words:
        return pl in cv
    matches = sum(1 for w in words if w in cv)
    return matches >= max(1, (len(words) * 2 + 1) // 2)


def _phrase_supported_by_sources(phrase: str, cv_text: Optional[str], confirmed_facts: Optional[str]) -> bool:
    """
    True if the phrase is backed by CV or confirmed-facts (per job-summary-keyword-rules).
    Red/Yellow may be added only when supported by one of these sources.
    """
    if cv_text and _phrase_supported_by_cv(phrase, cv_text):
        return True
    if confirmed_facts:
        return _phrase_supported_by_cv(phrase, confirmed_facts)
    return False


def _best_jd_phrase(skill_phrase: str, job_description: str) -> str:
    """
    Return exact or closest phrasing from job_description for a skill term (per job-summary-keyword-rules:
    use exact JD phrasing for Yellow/Red, do not paraphrase).
    """
    if not job_description or not skill_phrase:
        return skill_phrase
    jd_lower = job_description.lower()
    phrase_lower = skill_phrase.strip().lower()
    # Exact phrase in JD (preserve original casing from JD)
    if phrase_lower in jd_lower:
        start = jd_lower.index(phrase_lower)
        return job_description[start : start + len(skill_phrase.strip())]
    # Find first significant word from phrase in JD and return a short window from JD
    words = [w for w in phrase_lower.split() if len(w) > 2]
    for w in words:
        if w in jd_lower:
            idx = jd_lower.index(w)
            start = max(0, idx - 25)
            end = min(len(job_description), idx + len(w) + 35)
            snippet = job_description[start:end].strip()
            # Prefer a clean 3–6 word slice
            parts = snippet.split()
            if len(parts) > 6:
                for i, p in enumerate(parts):
                    if p.lower() == w:
                        from_idx = max(0, i - 1)
                        to_idx = min(len(parts), i + 4)
                        return " ".join(parts[from_idx:to_idx])
            return snippet if len(snippet) < 80 else snippet[:77] + "..."
    return skill_phrase


# When focus_gap is True, we ADD red/yellow but NEVER drop green (all green must stay so score does not degrade).

# Max chars for AI context (avoid token overflow). JD is never truncated so AI has full wording.
MAX_CV_FOR_AI = 6000
MAX_CONFIRMED_FACTS_FOR_AI = 3000
MAX_SHORT_SUMMARIES_FOR_AI = 4000
MAX_KEYWORD_RULES_FOR_AI = 2500
MAX_SKILL_RULES_FOR_AI = 3500


def _truncate(s: str, max_len: int) -> str:
    s = (s or "").strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 80 ].strip() + "\n\n[... truncated for context ...]"


# Patterns that must not appear in AI-type resume summary (no compliance, no Pin-Up, no iGaming).
_AI_SUMMARY_FORBIDDEN_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"\bcompliance\b", re.I), "compliance"),
    (re.compile(r"\b(risk\s+reduction|reduced\s+risk)\b", re.I), "risk reduction"),
    (re.compile(r"\bregulatory\b", re.I), "regulatory"),
    (re.compile(r"\bpin[- ]?up\b", re.I), "Pin-Up"),
    (re.compile(r"\bpinup\b", re.I), "Pin-Up"),
    (re.compile(r"\bat\s+pin\b", re.I), "at Pin-Up"),
    (re.compile(r"\bi[- ]?gaming\b", re.I), "iGaming"),
    (re.compile(r"\bgambling\b", re.I), "gambling"),
]


def _summary_violates_ai_constraints(summary: str) -> Tuple[bool, List[str]]:
    """
    Check if summary mentions compliance or Pin-Up experience (forbidden in AI-type resume).
    Returns (True, list of violation descriptions) if any forbidden content is found.
    """
    if not summary or not summary.strip():
        return False, []
    text = summary
    violations: List[str] = []
    for pattern, label in _AI_SUMMARY_FORBIDDEN_PATTERNS:
        if pattern.search(text):
            violations.append(label)
    return bool(violations), violations


def _build_summary_prompt(
    job_description: str,
    job_title: str,
    company: str,
    cv_content: str,
    confirmed_facts: str,
    short_summaries_ref: str,
    keyword_rules: str,
    skill_rules: str,
    skills_report: Optional[Dict[str, List[str]]],
    focus_gap: bool,
    job_type: str = "ai",
    revision_exclude_compliance_pinup: bool = False,
    current_summary: Optional[str] = None,
    previous_eval_notes: Optional[str] = None,
) -> Tuple[str, str]:
    """Build system and user prompts with all rules and inputs for AI summary generation."""
    jd = (job_description or "").strip()
    cv = _truncate(cv_content, MAX_CV_FOR_AI)
    cf = _truncate(confirmed_facts, MAX_CONFIRMED_FACTS_FOR_AI)
    short_ref = _truncate(short_summaries_ref, MAX_SHORT_SUMMARIES_FOR_AI)
    kw_rules = _truncate(keyword_rules, MAX_KEYWORD_RULES_FOR_AI)
    sk_rules = _truncate(skill_rules, MAX_SKILL_RULES_FOR_AI)

    system = f"""You are an expert resume writer. Your task is to write a short resume summary (professional summary) tailored to a specific job vacancy. Output only the summary and suggested questions; no commentary.

## Rules you MUST follow

{sk_rules}

## Keyword strategy (Red / Yellow / Green)

{kw_rules}

## Format and tone reference

{short_ref}

## Constraints (strict)

- Use ONLY facts from the CV and confirmed-facts below. Do not invent experience, companies, or metrics.
- No more than 3 paragraphs for the summary. No bold in the summary text. FORBIDDEN: the character — (em dash, Unicode U+2014). Never use it in the summary; use a comma or period instead. Before outputting, ensure the summary contains no —.
- Use exact phrasing from the Job Description for skills and requirements where it fits natural prose (do not paraphrase key terms). This maximizes ATS match.
- **Green phrases (already matched):** Include Green phrases from the keyword report in the same or very close wording, spread across the summary in readable sentences. Do not drop greens without reason. Do NOT cram every Green into one sentence or pair redundant synonyms (e.g. "lifecycles" and "full development lifecycle" in the same breath; that is tautology). Red and Yellow are added in addition to Green, not instead of them.
- Opening: title/level + 12+ years of experience + 1–2 domains that match the job. Never state fewer than 12 years.
- Language: English only. No mixed languages (e.g. no German terms like "Priorisierung", "Weiterentwicklung", "umsetzbare"). CSPO: mention only for Product Owner roles or when the job asks for Scrum/Agile certification; omit for PM roles.

## Style (critical)

- Write in natural, human prose. The reader must feel they are reading a person's summary, not a list of keywords. Weave required phrases (Green/Red/Yellow) into flowing, readable sentences. Do not stuff keywords at the cost of readability.
- **No tautology or keyword laundry lists:** In one sentence or two adjacent short sentences, do not express the same concept twice with overlapping words (bad: "lifecycles" and "the full development lifecycle" together; bad: stacking "roadmap", "vision", "planning" as three parallel nouns with no verb). Use one clear formulation per idea. Avoid sentences that are only a comma-separated run of JD keywords; every sentence needs normal grammar (subject + predicate).
- **Candidate as subject, not a job posting:** When describing what the person does, use "I", "I have", "my experience", or "In my roles" as appropriate. Do not use impersonal lines that read like copied responsibilities (e.g. "Work connects business needs…" with no I/my). Do not fake a paragraph as "Experience spans A and B: noun, noun, noun, noun" after a colon; use full sentences with verbs. Avoid vague "stronger" or "better" without a baseline; prefer concrete verbs (tightened, aligned, delivered). Avoid ambiguous stacks like "reporting people can trust"; use "reporting that stakeholders rely on" or "reliable reporting for decisions".
- **No repeated paragraph openers or duplicated blocks:** Do not begin two or more paragraphs with the same first word or the same stock opener (e.g. "Solid professional experience…" twice). Vary how each paragraph starts. Do not copy-paste the same theme into two paragraphs (e.g. data governance described twice with overlapping wording). Each paragraph = one distinct angle (role and scope; then e.g. data/domain; then delivery and Agile impact).
- **Capitalization:** Write like a normal person. Do NOT capitalize words mid-sentence for emphasis. Only capitalize: (1) the first word of a sentence, (2) proper nouns (company names, product names). Keep common terms lowercase: revenue growth, portfolio, conversions, retention, LTV, ARPU, churn, product initiatives, forecasting, etc. Wrong: "Revenue Growth", "Conversions", "Retention". Right: "revenue growth", "conversions", "retention".
- Separate every paragraph with a blank line. Output exactly: Paragraph one text here.

Paragraph two text here.

Paragraph three text here.
- The summary will be pasted into Teal's React-based editor; blank lines between paragraphs are required so that paragraph breaks render correctly. If you output paragraphs without a blank line between them, the pasted text will appear as one block.
"""
    if job_type != "igaming":
        system += """
- **Non-iGaming vacancy:** Do not mention iGaming, Pin-Up, gambling, or years of experience in iGaming. This resume version does not list that experience; mentioning it could raise questions. Emphasize other domains (B2B SaaS, fintech, platform, APIs, product lifecycle) that match the job.
"""
    if revision_exclude_compliance_pinup:
        system += """
- **CRITICAL (revision):** This summary is for an AI/non-gaming resume. You MUST NOT mention: compliance experience, compliance initiatives, risk reduction, regulatory work, or any experience at Pin-Up (or Pin Up). Use only experience from other domains (B2B SaaS, platform, product lifecycle, APIs, etc.). Do not include any of the above; if the previous draft included them, remove entirely.
"""


    red = (skills_report or {}).get("red") or []
    yellow = (skills_report or {}).get("yellow") or []
    green = (skills_report or {}).get("green") or []

    skills_block = ""
    if red or yellow or green:
        skills_block = "\n## Keyword report from resume-vs-JD analysis (use this to tailor the summary)\n\n"
        skills_block += "- **Red (missing in resume):** Add in summary only if you find support in CV or confirmed-facts; use exact JD phrasing once.\n"
        skills_block += "- **Yellow (present but not phrased like JD):** Weave into summary using exact JD phrasing (backed by CV/confirmed-facts).\n"
        skills_block += "- **Green (already matched):** Keep these phrases in the summary in same or very close wording.\n\n"
        if red:
            skills_block += "Red: " + ", ".join(red[:20]) + "\n"
        if yellow:
            skills_block += "Yellow: " + ", ".join(yellow[:20]) + "\n"
        if green:
            skills_block += "Green: " + ", ".join(green[:25]) + "\n"
        if focus_gap:
            skills_block += "\n**Focus:** This is an update pass. Keep green phrases in the summary (same or very close wording) without tautology or keyword-stacking; do not drop greens without reason. Then add red and yellow with exact JD phrasing where supported by CV/confirmed-facts. The goal is to improve the score with readable prose, not to repeat the same idea twice or list every green in one sentence.\n"
        if focus_gap and current_summary and current_summary.strip():
            skills_block += "\n**Incremental update:** The resume already contains the summary below. Do NOT remove or rephrase it. Your output must preserve this text and only ADD the Red/Yellow phrases from the report (exact JD phrasing) where they fit. Keep every sentence from the current summary; add new phrases to close the gap.\n\n## Current summary in the resume\n\n" + _truncate(current_summary.strip(), MAX_SHORT_SUMMARIES_FOR_AI) + "\n\n"

    user = f"""## Job description

{jd}

## Job title and company

Title: {job_title or 'N/A'}
Company: {company or 'N/A'}

## CV (resume) — use only this and confirmed-facts as source of truth

{cv}

## Confirmed facts (allowed in addition to CV)

{cf}
{skills_block}
"""
    avoid_block = ""
    if previous_eval_notes and previous_eval_notes.strip():
        avoid_block = "\n**Avoid (from previous attempt):** " + previous_eval_notes.strip() + "\n\n"
    user += avoid_block + """Write the resume summary (3 paragraphs max, no bold, NO em dash — never use the character —; use comma or period instead, exact JD phrasing for skills where it fits prose). Put a blank line between each paragraph (double newline). Use natural, readable prose; do not keyword-stuff. Do not use tautology (e.g. lifecycles + full development lifecycle in one sentence). Do not start two paragraphs with the same first word (ignore leading articles the/a/an) or reuse the same stock phrase as a paragraph opener. Do not duplicate a whole idea across paragraphs. Use normal capitalization only (sentence start and proper nouns); do not capitalize words mid-sentence (e.g. write "revenue growth", "retention", "conversions", not "Revenue Growth", "Retention", "Conversions"). Then on a new line write exactly: ---SUGGESTED_QUESTIONS---
Then list 2–4 suggested interview questions (one per line). Do not output anything else."""

    return system, user


def _generate_summary_via_ai(system_prompt: str, user_prompt: str) -> Optional[Tuple[str, List[str], Dict[str, int]]]:
    """Call OpenAI to generate summary and suggested questions. Returns (summary, questions, usage_dict) or None. usage_dict has prompt_tokens, completion_tokens, total_tokens."""
    if not HAS_OPENAI:
        return None
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        return None
    try:
        client = OpenAI(api_key=api_key.strip())
        completion = client.chat.completions.create(
            model="gpt-5.2",
            max_completion_tokens=3000,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        usage = getattr(completion, "usage", None)
        usage_dict: Dict[str, int] = {}
        if usage:
            usage_dict = {
                "prompt_tokens": getattr(usage, "prompt_tokens", 0) or 0,
                "completion_tokens": getattr(usage, "completion_tokens", 0) or 0,
                "total_tokens": getattr(usage, "total_tokens", 0) or 0,
            }
            logger.info(
                "OpenAI summary tokens: prompt=%s completion=%s total=%s",
                usage_dict["prompt_tokens"],
                usage_dict["completion_tokens"],
                usage_dict["total_tokens"],
            )
        raw = (completion.choices[0] and completion.choices[0].message and completion.choices[0].message.content) or ""
        if not raw.strip():
            return None
        raw = raw.strip()
        sep = "---SUGGESTED_QUESTIONS---"
        if sep in raw:
            summary_part, rest = raw.split(sep, 1)
            summary = summary_part.strip()
            questions = [q.strip() for q in rest.strip().split("\n") if q.strip()][:4]
        else:
            summary = raw
            questions = []
        if not summary:
            return None
        # Strict: no em dash (U+2014) or en dash (U+2013) as punctuation in summary
        if "—" in summary:
            summary = re.sub(r"\s*—\s*", ", ", summary)
        if "–" in summary:
            summary = re.sub(r"\s*–\s*", ", ", summary)
        # Normalize paragraph breaks for Teal's React editor: ensure single blank line between paragraphs
        paragraphs = [p.strip() for p in summary.split("\n\n") if p.strip()]
        if paragraphs:
            summary = "\n\n".join(paragraphs)
        return (
            summary,
            questions if questions else ["How would you approach the first 90 days in this role?", "What does success look like for this product area in the next 12 months?"],
            usage_dict,
        )
    except Exception as e:
        logger.warning("AI summary generation failed: %s", e)
        return None


def _generate_summary_text(
    job_type: str,
    keywords: Dict[str, List[str]],
    job_title: str,
    company: str,
    skills_report: Optional[Dict[str, List[str]]] = None,
    cv_content: Optional[str] = None,
    confirmed_facts: Optional[str] = None,
    job_description: Optional[str] = None,
    short_summaries_ref: Optional[str] = None,
    focus_gap: bool = False,
) -> Tuple[str, List[str]]:
    """
    Generate 3-paragraph summary and suggested questions. Uses:
    - confirmed_facts: allowed claims; Red/Yellow supported by CV or confirmed_facts.
    - job_description: exact JD phrasing for Red/Yellow/Green (keyword-rules).
    - focus_gap: when True, summary is built from latest report: red/yellow in full, green limited
      so the update clearly targets the gap and score can move.
    """
    all_kw = (keywords.get("hard") or []) + (keywords.get("soft") or [])
    kw_str = ", ".join(all_kw[:6]) if all_kw else "product strategy, roadmap, and cross-functional delivery"

    red: List[str] = []
    yellow: List[str] = []
    green: List[str] = []
    if skills_report:
        red = [p.strip() for p in (skills_report.get("red") or []) if p and len(p.strip()) > 1]
        yellow = [p.strip() for p in (skills_report.get("yellow") or []) if p and len(p.strip()) > 1]
        green = [p.strip() for p in (skills_report.get("green") or []) if p and len(p.strip()) > 1]
        # Red/Yellow only if supported by CV or confirmed-facts (per job-summary-keyword-rules).
        if cv_content or confirmed_facts:
            red = [p for p in red if _phrase_supported_by_sources(p, cv_content, confirmed_facts)]
            yellow = [p for p in yellow if _phrase_supported_by_sources(p, cv_content, confirmed_facts)]
        else:
            red, yellow = [], []

    # Use exact JD phrasing for Red/Yellow/Green when job_description is available (Teal matches better).
    if job_description:
        red = [_best_jd_phrase(p, job_description) for p in red]
        yellow = [_best_jd_phrase(p, job_description) for p in yellow]
        green = [_best_jd_phrase(p, job_description) for p in green]
    # Never drop green: keeping all green preserves the current match score; we only add red/yellow.
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
    p2_base = (
        f"This role ({title_ref}) emphasizes {kw_str}. "
        "My experience includes product strategy and vision, backlog prioritization, user stories and acceptance criteria, "
        "and data-driven decisions using analytics and user research."
    )

    # Build p2 from latest report: red/yellow first (close the gap); green reinforcement (short when focus_gap).
    p2_add: List[str] = []
    if red:
        p2_add.append("I have experience with " + _join_phrases_naturally(red) + ".")
    if yellow:
        p2_add.append("I have applied " + _join_phrases_naturally(yellow) + " in product and platform delivery.")
    if green:
        p2_add.append("My profile aligns with " + _join_phrases_naturally(green) + ".")
    if p2_add:
        p2 = p2_base + " " + " ".join(p2_add)
    else:
        p2 = p2_base

    p3 = (
        "I partner with engineering, design, sales, and marketing; I mentor PMs, contribute to hiring, "
        "and have improved team efficiency through process and Scrum adoption. "
        "Comfortable in fast-paced and regulated environments."
    )

    summary = f"{p1}\n\n{p2}\n\n{p3}"
    # short-summaries + SKILL: no em dash (—) or en dash (–); use commas or periods instead.
    if "—" in summary:
        summary = re.sub(r"\s*—\s*", ", ", summary)
    if "–" in summary:
        summary = re.sub(r"\s*–\s*", ", ", summary)

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
    company: str = "",
    skills_report: Optional[Dict[str, List[str]]] = None,
    focus_gap: bool = False,
    current_summary: Optional[str] = None,
    summary_round: Optional[int] = None,
    previous_eval_notes: Optional[str] = None,
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
        skills_report: Optional from Teal Job Matcher: {"red": [], "yellow": [], "green": []}
                      (latest report after current score). Used to close the gap.
        focus_gap: When True, summary is built from the latest report: emphasize red/yellow
                   (exact JD phrasing), minimal green list so the update moves the score.
        current_summary: When focus_gap is True, the summary already in the resume. The model
                         preserves it and only adds Red/Yellow phrases (incremental update, 3–4 iterations).
    
    Returns:
        Dict with:
        - job_type: 'igaming' or 'ai'
        - cv_path: Path to selected CV
        - summary: Generated 3-paragraph summary
        - suggested_questions: 2-4 interview prep questions
        - keywords: Extracted keywords

    For job_type 'ai', the summary is validated: if it mentions compliance, Pin-Up,
    iGaming, or gambling, it is sent back for one revision with an explicit instruction
    to exclude those; the revised summary is returned.
    """
    try:
        return _generate_job_summary_impl(job_description, job_title, job_url, company, skills_report, focus_gap, current_summary, summary_round, previous_eval_notes)
    except Exception as e:
        try:
            SUMMARY_ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
            with open(SUMMARY_ERROR_LOG, "a", encoding="utf-8") as f:
                f.write("\n--- job_digest_server " + datetime.now().isoformat() + " ---\n")
                traceback.print_exc(file=f)
        except Exception:
            pass
        raise


def _generate_job_summary_impl(
    job_description: str,
    job_title: str,
    job_url: str,
    company: str,
    skills_report: Optional[Dict[str, List[str]]],
    focus_gap: bool = False,
    current_summary: Optional[str] = None,
    summary_round: Optional[int] = None,
    previous_eval_notes: Optional[str] = None,
) -> Dict[str, Any]:
    """Implementation of generate_job_summary; exceptions are logged by the caller."""
    # Normalize skills_report to avoid KeyError/type errors from Teal
    if skills_report is not None and not isinstance(skills_report, dict):
        skills_report = None
    if skills_report is not None:
        skills_report = {
            "red": list(skills_report.get("red") or []) if isinstance(skills_report.get("red"), list) else [],
            "yellow": list(skills_report.get("yellow") or []) if isinstance(skills_report.get("yellow"), list) else [],
            "green": list(skills_report.get("green") or []) if isinstance(skills_report.get("green"), list) else [],
        }

    # Detect job type
    job_type = _detect_job_type(job_description or "", job_title or "")

    # Select CV
    cv_path = _select_cv(job_type)
    cv_content = _read_file(cv_path)

    if not cv_content:
        return {
            "error": f"CV file not found: {cv_path}",
            "job_type": job_type
        }

    # All four sources: confirmed-facts, short-summaries, keyword-rules, SKILL (for AI prompt).
    confirmed_facts = _read_file(CONFIRMED_FACTS_PATH) or ""
    short_summaries_ref = _read_file(SHORT_SUMMARIES_PATH) or ""
    keyword_rules = _read_file(JOB_SUMMARY_KEYWORD_RULES_PATH) or ""
    skill_rules = _read_file(JOB_SUMMARY_SKILL_PATH) or ""

    # Extract keywords (for template fallback and output)
    keywords = _extract_keywords(job_description or "")

    # 1) AI-only path: assemble all rules and inputs, send to OpenAI, get summary.
    if not HAS_OPENAI or not os.environ.get("OPENAI_API_KEY"):
        return {
            "error": "OPENAI_API_KEY not configured or openai package not available; summary cannot be generated.",
            "job_type": job_type,
            "cv_path": str(cv_path),
            "keywords": keywords,
            "job_title": job_title,
            "company": company,
            "job_url": job_url,
        }

    system_prompt, user_prompt = _build_summary_prompt(
        job_description or "",
        job_title or "",
        company or "",
        cv_content,
        confirmed_facts,
        short_summaries_ref,
        keyword_rules,
        skill_rules,
        skills_report,
        focus_gap,
        job_type,
        revision_exclude_compliance_pinup=False,
        current_summary=current_summary,
        previous_eval_notes=previous_eval_notes,
    )
    ai_result = _generate_summary_via_ai(system_prompt, user_prompt)
    if not ai_result:
        return {
            "error": "AI summary generation failed; no summary returned from OpenAI.",
            "job_type": job_type,
            "cv_path": str(cv_path),
            "keywords": keywords,
            "job_title": job_title,
            "company": company,
            "job_url": job_url,
        }

    summary, suggested_questions, openai_usage = ai_result
    request_id = f"{company or 'unknown'}_{(job_title or 'unknown')[:80]}".replace("/", "_")
    if HAS_USAGE_LOGGER and openai_usage:
        eval_score, eval_notes = _eval_job_summary(summary, job_type)
        log_openai_call(
            "job_summary",
            "gpt-5.2",
            prompt_tokens=openai_usage.get("prompt_tokens"),
            completion_tokens=openai_usage.get("completion_tokens"),
            total_tokens=openai_usage.get("total_tokens"),
            max_tokens_limit=3000,
            request_id=request_id,
            iteration=1,
            summary_round=summary_round,
            eval_score=eval_score,
            eval_notes=eval_notes or None,
        )

    # For AI-type resume: summary must not mention compliance or Pin-Up; if it does, regenerate once with strict constraint.
    if job_type == "ai" and summary:
        violates, violation_labels = _summary_violates_ai_constraints(summary)
        if violates:
            logger.info(
                "AI summary contained forbidden content for AI resume: %s; requesting revision.",
                violation_labels,
            )
            rev_system, rev_user = _build_summary_prompt(
                job_description or "",
                job_title or "",
                company or "",
                cv_content,
                confirmed_facts,
                short_summaries_ref,
                keyword_rules,
                skill_rules,
                skills_report,
                focus_gap,
                job_type,
                revision_exclude_compliance_pinup=True,
                current_summary=current_summary,
                previous_eval_notes=None,
            )
            rev_user = (
                rev_user
                + "\n\n**Revision:** The previous draft incorrectly included compliance and/or Pin-Up experience. Rewrite the summary so it does NOT mention: compliance, risk reduction, regulatory work, or any experience at Pin-Up. Use only experience from other domains (B2B SaaS, platform, APIs, product lifecycle)."
            )
            rev_result = _generate_summary_via_ai(rev_system, rev_user)
            if rev_result and rev_result[0]:
                summary = rev_result[0]
                rev_usage = rev_result[2]
                if HAS_USAGE_LOGGER and rev_usage:
                    eval_score, eval_notes = _eval_job_summary(summary, job_type)
                    log_openai_call(
                        "job_summary",
                        "gpt-5.2",
                        prompt_tokens=rev_usage.get("prompt_tokens"),
                        completion_tokens=rev_usage.get("completion_tokens"),
                        total_tokens=rev_usage.get("total_tokens"),
                        max_tokens_limit=3000,
                        request_id=request_id,
                        iteration=2,
                        summary_round=summary_round,
                        eval_score=eval_score,
                        eval_notes=(eval_notes or "") + ";revision",
                    )
                if rev_usage and openai_usage:
                    openai_usage = {
                        "prompt_tokens": (openai_usage.get("prompt_tokens") or 0) + (rev_usage.get("prompt_tokens") or 0),
                        "completion_tokens": (openai_usage.get("completion_tokens") or 0) + (rev_usage.get("completion_tokens") or 0),
                        "total_tokens": (openai_usage.get("total_tokens") or 0) + (rev_usage.get("total_tokens") or 0),
                    }
                suggested_questions = rev_result[1] if rev_result[1] else suggested_questions

    result: Dict[str, Any] = {
        "job_type": job_type,
        "cv_path": str(cv_path),
        "keywords": keywords,
        "job_title": job_title,
        "company": company,
        "job_url": job_url,
        "summary": summary,
        "suggested_questions": suggested_questions,
    }
    if openai_usage:
        result["openai_usage"] = openai_usage
    return result


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
