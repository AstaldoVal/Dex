# VB-217: Fix Password Reset Flow in Payload for Admin Users

## Properties
- State: In progress
- Priority: medium
- Identifier: VB-451
- Assignees: user://220d872b-594c-8171-9599-00029c0dad47
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Updated on: 2026-06-11T10:15:43.760Z
- Notion URL: https://app.notion.com/p/375509790d9a80e6bac0fcb1e1c0b968

## Description
**Description:**
Investigate and fix the issue where the password reset functionality does not work for admin users in Payload.
Currently, when an admin user clicks **Forgot Password**, enters their email address, and submits the request, no password reset email is received. This appears to be a longstanding issue and may have neve been implemented.

Pleae investigate the root cause, verify whether reset emails are being generated and sent correctly, and ensure the password reset flow works as expected for all admin users.

**Context:**
[https://dev.vb-hq.com/admin/login](https://dev.vb-hq.com/admin/login)

**Analytic Events:**
N/A 

**Acceptance Criteria:**
  • Admin users can successfully submit a password reset request using the Forgot Password flow.
  • A password reset email is sent to the provided admin email address.
  • The password reset link allows the admin user to set a new password successfully.
  • The flow is working in DEV. Stage and prod environments.


**Additional Information:**
  • 

**ICE Score:** 35

## Page Content
(No additional page body content.)
