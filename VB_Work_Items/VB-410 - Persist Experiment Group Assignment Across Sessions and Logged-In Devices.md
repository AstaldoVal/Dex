# VB-410: Persist Experiment Group Assignment Across Sessions and Logged-In Devices

## Properties
- State: In Review
- Priority: high
- Identifier: VB-410
- Assignees: user://2e1d872b-594c-816d-ba9c-00022ce0a130
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Updated on: 2026-06-12 12:17:28Z
- Notion URL: https://app.notion.com/36b509790d9a8046bf2bcd5397462f9d

## Description
**Description:**
Currently, users can be reassigned to a different experiment group after logging out, starting a new session, or logging in on another device. This creates inconsistent experiment exposure and affects experiment data reliability.
Update experiment assignment logic to ensure users remain assigned to their original experiment group once assigned (e.g. group 0 or group 8).
Experiment assignment should persist:
• Across logout/login
• Across new sessions
• Across different devices only when the user logs into the same account
• Until the experiment ends or assignment is manually reset

Investigate the current reassignment behavior and implement a stable persistence mechanism tied to the authenticated user account rather than session or device state.


**Context:**
N/A

**Analytic Events:**
N/A

**Acceptance Criteria:**
• User keeps the same experiment group assignment after logout/login and when logging in from another device.


**Additional Information:**
  • 

**ICE Score:** 34

## Page Content
(No additional page body content.)
