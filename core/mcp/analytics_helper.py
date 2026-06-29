#!/usr/bin/env python3
"""
Dex Analytics Helper

Shared utilities for analytics across Dex skills and MCPs.
Handles consent checking, journey metadata calculation, and event firing.

Privacy Principles:
- Only tracks Dex built-in features, not user customizations
- Tracks THAT features were used, not WHAT users did with them
- Never sends content, names, notes, or conversations

Usage in skills:
    from analytics_helper import fire_event, check_consent, mark_feature_used
"""

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# Local-only analytics configuration
ANALYTICS_TRANSPORT_MODE = os.environ.get("DEX_ANALYTICS_TRANSPORT", "local").strip().lower()
LOCAL_ANALYTICS_PATH = os.environ.get("DEX_ANALYTICS_LOG", "System/analytics/events.jsonl")


def get_vault_path() -> Path:
    """Get vault path from environment or default."""
    vault = os.environ.get('VAULT_PATH', os.path.expanduser('~/Dex'))
    return Path(vault)


def get_analytics_log_path() -> Path:
    """Return path for local analytics events JSONL."""
    path = Path(LOCAL_ANALYTICS_PATH)
    if not path.is_absolute():
        path = get_vault_path() / path
    return path


def get_analytics_transport() -> Dict[str, Any]:
    """
    Resolve analytics transport in a privacy-first local-only mode.

    We intentionally do not send data to third-party endpoints.
    """
    log_path = get_analytics_log_path()
    return {
        "mode": "local" if ANALYTICS_TRANSPORT_MODE != "disabled" else "disabled",
        "configured": ANALYTICS_TRANSPORT_MODE != "disabled",
        "endpoint": str(log_path),
        "headers": {},
        "reason": "local_only",
    }


def load_usage_log() -> Dict[str, Any]:
    """Parse usage_log.md into structured data."""
    usage_path = get_vault_path() / 'System' / 'usage_log.md'
    if not usage_path.exists():
        return {}
    
    with open(usage_path, 'r') as f:
        content = f.read()
    
    data = {
        'features': {},
        'metadata': {},
    }
    
    # Parse checkboxes for feature adoption
    checkbox_pattern = r'- \[([ x])\] (.+)'
    for match in re.finditer(checkbox_pattern, content):
        checked = match.group(1) == 'x'
        feature = match.group(2).strip()
        data['features'][feature] = checked
    
    # Parse metadata section
    metadata_patterns = {
        'consent_asked': r'\*\*Consent asked:\*\* (\w+)',
        'consent_decision': r'\*\*Consent decision:\*\* ([\w-]+)',
        'consent_date': r'\*\*Consent date:\*\* (.+)',
        'setup_date': r'\*\*Setup date:\*\* (.+)',
    }
    
    for key, pattern in metadata_patterns.items():
        match = re.search(pattern, content)
        if match:
            value = match.group(1).strip()
            if value and value not in ['(not yet prompted)', '(not yet run)', '(set during onboarding)', 
                                        '(not yet decided)', '(not yet determined)', '(not yet active)']:
                data['metadata'][key] = value
    
    return data


def check_consent() -> str:
    """
    Check analytics consent status.
    
    Returns:
        'pending' - Not yet asked
        'opted-in' - User agreed
        'opted-out' - User declined
    """
    data = load_usage_log()
    decision = data.get('metadata', {}).get('consent_decision', 'pending')
    return decision


def is_beta_activated() -> bool:
    """Check if the analytics beta feature is activated."""
    try:
        import yaml
    except ImportError:
        return False
    
    profile_path = get_vault_path() / 'System' / 'user-profile.yaml'
    if not profile_path.exists():
        return False
    
    with open(profile_path, 'r') as f:
        profile = yaml.safe_load(f) or {}
    
    beta = profile.get('beta', {})
    activated = beta.get('activated', {})
    return 'analytics' in activated


def is_analytics_enabled() -> bool:
    """
    Check if analytics is enabled.
    
    Requires BOTH:
    1. Analytics beta feature activated
    2. User opted in to consent
    """
    if not is_beta_activated():
        return False
    return check_consent() == 'opted-in'


def load_user_profile() -> dict:
    """Load user profile from yaml."""
    try:
        import yaml
    except ImportError:
        return {}
    
    profile_path = get_vault_path() / 'System' / 'user-profile.yaml'
    if profile_path.exists():
        with open(profile_path, 'r') as f:
            return yaml.safe_load(f) or {}
    return {}


def calculate_journey_metadata() -> Dict[str, Any]:
    """
    Calculate journey metadata from usage_log.md.
    
    Returns dict with:
        - days_since_setup: int
        - feature_adoption_score: int (out of 57)
        - journey_stage: str (new/exploring/established/power_user)
        - most_active_area: str
    """
    data = load_usage_log()
    features = data.get('features', {})
    
    # Count features by area - matches usage_log.md sections (57 total features)
    areas = {
        'core_workflows': [
            'Daily planning', 'Daily review', 'Weekly planning', 'Weekly review',
            'Quarterly planning', 'Quarterly review', 'Getting started', 'Journaling'
        ],
        'meetings': [
            'Meeting prep', 'Meeting processing', 'Person page created', 
            'Person page updated', 'Company page created', 'Granola connected'
        ],
        'tasks': [
            'Task created', 'Task completed', 'Task updated', 
            'Priority set', 'Goal created', 'Pillar alignment'
        ],
        'organization': [
            'Inbox triage', 'Learning capture', 'Project tracking', 
            'Product brief', 'Project page created'
        ],
        'journaling': [
            'Journaling setup', 'Morning journal', 'Evening journal', 'Weekly journal'
        ],
        'career': [
            'Career setup', 'Career coaching', 'Resume builder', 
            'Career evidence', 'Promotion readiness', 'Skills gap'
        ],
        'discovery': [
            'Feature discovery', 'What\'s new', 'Backlog review', 
            'Improvement workshop', 'Idea captured', 'Dex updated', 'Learnings reviewed'
        ],
        'integrations': [
            'Calendar connected', 'Calendar synced', 'Granola connected',
            'Obsidian enabled', 'Pi used', 'ScreenPipe'
        ],
        'ai_config': [
            'AI setup', 'Budget cloud', 'Offline mode', 'Smart routing', 'AI status'
        ],
        'advanced': [
            'Prompt improvement', 'Custom MCP', 'MCP integrated', 'Demo mode'
        ],
    }
    
    area_scores = {}
    total_used = 0
    
    for area, area_features in areas.items():
        count = 0
        for af in area_features:
            for feature_name, checked in features.items():
                if af.lower() in feature_name.lower() and checked:
                    count += 1
                    break
        area_scores[area] = count
        total_used += count
    
    # Determine most active area
    most_active = max(area_scores.items(), key=lambda x: x[1]) if area_scores else ('none', 0)
    
    # Calculate days since setup
    setup_date_str = data.get('metadata', {}).get('setup_date')
    if setup_date_str and setup_date_str not in ['(set during onboarding)', '']:
        try:
            setup_date = datetime.strptime(setup_date_str, '%Y-%m-%d')
            days = (datetime.now() - setup_date).days
        except:
            days = 0
    else:
        days = 0
    
    # Determine journey stage
    if days <= 7:
        stage = 'new'
    elif days <= 30:
        stage = 'exploring'
    elif days <= 90:
        stage = 'established'
    else:
        stage = 'power_user'
    
    return {
        'days_since_setup': days,
        'feature_adoption_score': total_used,
        'journey_stage': stage,
        'most_active_area': most_active[0] if most_active[1] > 0 else 'none',
    }


def get_visitor_info() -> Dict[str, str]:
    """Get visitor ID and account ID from user-profile.yaml."""
    profile = load_user_profile()
    analytics = profile.get('analytics', {})
    
    # Generate anonymous visitor ID from name
    name = profile.get('name', 'anonymous')
    visitor_id = hashlib.sha256(name.encode()).hexdigest()[:16]
    
    # Account ID from email domain or default
    account_id = profile.get('email_domain', 'dex-users')
    
    return {
        'visitor_id': visitor_id,
        'account_id': account_id
    }


def log_event_locally(event_name: str, properties: Optional[Dict[str, Any]] = None, source: str = "analytics_helper") -> Dict[str, Any]:
    """Append analytics event to local JSONL log."""
    visitor_info = get_visitor_info()
    event_props = properties or {}
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event_name,
        "visitor_id": visitor_info["visitor_id"],
        "account_id": visitor_info["account_id"],
        "source": source,
        "properties": event_props,
    }
    log_path = get_analytics_log_path()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return {"logged_locally": True, "path": str(log_path)}


def fire_event(event_name: str, properties: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Fire an analytics event to Pendo.
    
    Only fires if user has opted in. Automatically includes journey metadata.
    
    Args:
        event_name: Name of the event (e.g., 'daily_plan_completed')
        properties: Additional event properties (counts, categories only - no content!)
    
    Returns:
        Result dict with success status
    """
    if not is_analytics_enabled():
        return {'fired': False, 'reason': 'analytics_disabled'}
    
    transport = get_analytics_transport()
    if transport.get("mode") == "disabled":
        return {'fired': False, 'reason': 'transport_disabled'}

    visitor_info = get_visitor_info()
    journey = calculate_journey_metadata()
    profile = load_user_profile()
    
    # Build properties with journey context
    event_props = {
        'journey_stage': journey['journey_stage'],
        'days_since_setup': journey['days_since_setup'],
        'feature_adoption_score': journey['feature_adoption_score'],
        'most_active_area': journey['most_active_area'],
        'role': profile.get('role_group', 'unknown'),
        'company_size': profile.get('company_size', 'unknown'),
        **(properties or {})
    }
    
    try:
        local_result = log_event_locally(event_name, event_props, source="fire_event")
        return {
            'fired': True,
            'event': event_name,
            'transport_mode': transport.get('mode'),
            **local_result,
        }
    except Exception as e:
        return {'fired': False, 'error': str(e)}


def update_consent(decision: str):
    """
    Update usage_log.md with consent decision.
    
    Args:
        decision: 'opted-in' or 'opted-out'
    """
    usage_path = get_vault_path() / 'System' / 'usage_log.md'
    if not usage_path.exists():
        return
    
    with open(usage_path, 'r') as f:
        content = f.read()
    
    today = datetime.now().strftime('%Y-%m-%d')
    
    # Update consent fields
    content = re.sub(
        r'\*\*Consent asked:\*\* \w+',
        '**Consent asked:** true',
        content
    )
    content = re.sub(
        r'\*\*Consent decision:\*\* [\w-]+',
        f'**Consent decision:** {decision}',
        content
    )
    content = re.sub(
        r'\*\*Consent date:\*\* .+',
        f'**Consent date:** {today}',
        content
    )
    
    with open(usage_path, 'w') as f:
        f.write(content)


def mark_feature_used(feature_name: str):
    """Mark a feature as used in usage_log.md."""
    usage_path = get_vault_path() / 'System' / 'usage_log.md'
    if not usage_path.exists():
        return
    
    with open(usage_path, 'r') as f:
        content = f.read()
    
    # Find and check the checkbox for this feature
    # Pattern: - [ ] Feature name... → - [x] Feature name...
    pattern = rf'- \[ \] ([^(\n]*{re.escape(feature_name)}[^(\n]*)'
    
    def replace_checkbox(match):
        return f'- [x] {match.group(1)}'
    
    new_content = re.sub(pattern, replace_checkbox, content, flags=re.IGNORECASE)
    
    if new_content != content:
        with open(usage_path, 'w') as f:
            f.write(new_content)


# Event name constants for consistency
class Events:
    # Lifecycle
    SESSION_STARTED = 'session_started'
    ONBOARDING_COMPLETED = 'onboarding_completed'
    ANALYTICS_CONSENT_GIVEN = 'analytics_consent_given'
    
    # Core Skills
    DAILY_PLAN_COMPLETED = 'daily_plan_completed'
    DAILY_REVIEW_COMPLETED = 'daily_review_completed'
    WEEK_PLAN_COMPLETED = 'week_plan_completed'
    WEEK_REVIEW_COMPLETED = 'week_review_completed'
    QUARTER_PLAN_COMPLETED = 'quarter_plan_completed'
    MEETING_PREP_COMPLETED = 'meeting_prep_completed'
    
    # Tasks
    TASK_CREATED = 'task_created'
    TASK_COMPLETED = 'task_completed'
    
    # People & Meetings
    PERSON_PAGE_CREATED = 'person_page_created'
    MEETING_PROCESSED = 'meeting_processed'
    
    # Career
    CAREER_COACH_SESSION = 'career_coach_session'
    
    # Discovery
    LEVEL_UP_VIEWED = 'level_up_viewed'
    IDEA_CAPTURED = 'idea_captured'


if __name__ == '__main__':
    # Test the helper
    print("Consent status:", check_consent())
    print("\nJourney metadata:")
    for k, v in calculate_journey_metadata().items():
        print(f"  {k}: {v}")
