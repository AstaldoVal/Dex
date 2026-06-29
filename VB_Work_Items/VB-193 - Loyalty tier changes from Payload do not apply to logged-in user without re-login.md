# VB-193: Loyalty tier changes from Payload do not apply to logged-in user without re-login

## Properties
- State: Todo
- Priority: low
- Identifier: VB-193
- Assignees: user://2e1d872b-594c-816d-ba9c-00022ce0a130
- Created By: user://2e1d872b-594c-8134-b843-0002f4e216ac
- Created on: 2026-04-06
- Updated on: 2026-05-12T08:44:53.231Z
- Notion URL: https://app.notion.com/342509790d9a81aa87ffc917853260d1

## Description
**Description:**
When Payload admin changes a user loyalty tier level and saves it, the new level is not applied for that user if they are currently logged in. Page refresh does not update it either. The user sees the updated tier only after logging out and logging back in. This should work instantly or at least after page refresh.
**Context:**
https://share.zight.com/8LuAob0E
**Analytic events:**
N/A
**Acceptance Criteria:**
- After admin updates and saves user loyalty tier level in Payload, the user must receive the updated tier without requiring logout/login.
- At minimum, a page refresh must be enough for the user to see the updated tier.
**Additional details:**
- Type: Feature Improvement
- Created by: Tigran
- UX/UI impact: Yes
**Additional information:**
Platform: Payload
Environment: Dev
Reproducibility: Always
**ICE score:**
27

## Page Content
(No additional page body content.)
