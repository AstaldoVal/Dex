# VB-36: Legal pages re-acceptance modal

## Properties
- State: Backlog
- Priority: none
- Identifier: VB-36
- Created By: user://2e1d872b-594c-8134-b843-0002f4e216ac
- Created on: 2025-12-30
- Updated on: 2026-04-14T15:30:25.138Z
- Notion URL: https://app.notion.com/342509790d9a816c9aaaf5e8f56d228f

## Description
Description:
Design a blocking modal shown when Terms & Conditions, Privacy Policy, or Sweepstakes Rules are updated and require re-acceptance.
Users must accept before continuing to use the app.
Copy in modal:
Title: "[Doc Name] Updated"
Body: "We've updated our [Doc Name]. Please review and accept to continue."
Link: "View full document" (+ optional "Summary of changes")
Checkbox: "I agree to the new [Doc Name]"
Buttons:
Accept (enabled only when checkbox is ticked)
Decline (logs out / blocks use)
Context:
https://drive.google.com/file/d/17063BoeeBW6W2WRSICCnPCJVId5w9Q6G/view
Analytic events:
N/A
Acceptance Criteria:
Modal appears when user login/open VB  when a legal page is updated.
Users cannot proceed until they click Accept.
Accept button stays disabled until checkbox is ticked.
Additional details:
Type: New Feature
Created by: Adnan
UX/UI impact: Yes
Additional information:
N/A
ICE score:
24

## Page Content
(No additional page body content.)
