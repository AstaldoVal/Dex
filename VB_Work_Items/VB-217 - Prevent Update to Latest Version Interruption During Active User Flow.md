# VB-217: Prevent “Update to Latest Version” Interruption During Active User Flow

## Properties
- State: On HOLD
- Priority: high
- Identifier: VB-217
- Assignees: user://220d872b-594c-8171-9599-00029c0dad47
- Created By: user://2e1d872b-594c-8134-b843-0002f4e216ac
- Created on: 2026-04-13
- Updated on: 2026-04-24T08:51:36.188Z
- Notion URL: https://app.notion.com/342509790d9a81829d5fc4fc46362af9

## Description
**Description:**
After production deployment, users currently in an active session (e.g., onboarding) see an "update to the latest version" message that interrupts and breaks the flow. This should not happen mid-journey. Users should be allowed to complete their current flow without disruption. Update prompts or reloads should only occur at safe points (e.g., before login, after flow completion, or on next session).
**Context:**
https://share.zight.com/WnuvqKxg
**Analytic events:**
N/A
**Acceptance Criteria:**
- Users in an active flow (e.g., onboarding) do not see update/reload prompts after deployment.
- No forced reload or version update occurs while a user is mid-flow.
- User can complete onboarding (or any active flow) without interruption.
- Update prompt (if required) is shown only at safe points (e.g., before login or after flow completion).
- On next session or page reload, the latest version is loaded correctly.
**Additional details:**
- Type: Bug
- Created by: Olga
- UX/UI impact: Yes
**Additional information:**
Environment: Prod
**ICE score:**
48

## Page Content
(No additional page body content.)
