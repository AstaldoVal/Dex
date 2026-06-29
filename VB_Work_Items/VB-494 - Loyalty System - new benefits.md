# VB-494: Loyalty System - new benefits

## Properties
- State: Backlog
- Priority: 
- Identifier: VB-494
- Updated on: 2026-06-12T18:00:27.996Z
- Notion URL: https://app.notion.com/p/37d509790d9a8014951ffc78e5be8acd

## Description
**Description:**
Implement the following benefits to our Loyalty System. Which tier receives which benefit is defined in another task. This task is about making the functionality of each benefit.

  1. 24/7 Customer Support - this is a benefit that doesn’t require any functional work. We just need to be able to display it across different loyalty tiers.
  2. Level Up Reward - whenever user reaches a new tier, display a popup where user can claim the level up GC/SC reward. Modal doesn’t have a close button, and only one CTA “Claim”. Once user claims the reward, the GC/SC flying animation plays and user’s balance gets topped up. Exact rewards (GC/SC values) are defined in the Tiers section in the Payload.
  3. Monthly Rewards - at the beginning of each month, eligible users receive a monthly GC/SC top-up during their next session. Rewards are distributed at the beginning of the next month, at 12:00 AM UTC. The modal, same as the Level Up one doesn’t have an X button to close, and only has a Claim button. After claiming, flying GC/SC animation plays. The exact rewards are defined in the Tiers section in Payload. If a reward is set to 0 for a tier, users in that tier won’t receive anything and won’t see the modal. If a user skips a month (doesn’t claim - doesn’t have a session) - that reward is voided, and another one is earned for the following month.
  4. Birthday Gift

**Context:**


**Analytic Events:**


**Acceptance Criteria:**
• 


**Additional Information:**
  • 

**ICE Score:**

## Page Content
(No additional page body content.)
