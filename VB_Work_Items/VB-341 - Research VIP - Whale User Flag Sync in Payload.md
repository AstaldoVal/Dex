# VB-341: Research VIP / Whale User Flag Sync in Payload

## Properties
- State: On HOLD
- Priority: high
- Identifier: VB-341
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Labels: Sandbox
- Notion URL: https://app.notion.com/35a509790d9a80cb9a00d67a632cd47f

## Description
**Description:**
Conduct technical research on the best approach to identify VIP / Whale users and store this status directly on user accounts in Payload.
VIP / Whale criteria should follow the same logic used for Chatwoot VIP users:
• Top **1% spender**
• Top **5% NGR**
Evaluate options for calculating and syncing this data (for example weekly batch update, scheduled cron job, event-based updates, or hybrid approach). Determine how the flag should be stored in Payload, how often it should refresh, and what systems can consume it (Chatwoot, CRM, internal admin tools, etc.).
The goal is to create a scalable source of truth for high-value user segmentation.


**Context:**
N/A

**Analytic Events:**
N/A

**Acceptance Criteria:**
  • Research completed for possible sync/update approaches.
  • Recommended method for calculating VIP / Whale status is documented.
  • Suggested refresh frequency (e.g. weekly) is provided.
  • Payload data model changes required for storing the flag are identified.
  • Risks, dependencies, and next implementation steps are shared with product team.


**Additional Information:**
  • 

**ICE Score:** 54

## Page Content
(No additional page body content.)
