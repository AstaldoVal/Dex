# VB-378: Release Process Guide for Staging and Production (Including Rollback Procedure)

## Properties
- State: Backlog
- Priority: medium
- Identifier: VB-378
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Labels: Sandbox
- Updated on: 2026-05-18T10:31:29.599Z
- Notion URL: https://app.notion.com/p/364509790d9a80f494f7ea070127cc8b

## Description
**Description:**
Create a clear, step-by-step internal document describing how to perform releases to Staging and Production environments, including pre-release checks, deployment steps, and rollback procedures in case of issues.
The document should cover:
• Prerequisites before release (code freeze, approvals, QA sign-off)
• Step-by-step deployment process for **Staging**
• Validation steps in Staging (smoke tests, key flows, monitoring)
• Step-by-step deployment process for **Production**
• Post-release monitoring in Production (error rates, performance, logs)
• Rollback procedure for both Staging and Production (when to trigger, how to revert, responsibilities)
• Communication flow (who to notify before/after release)
• Links to relevant tools (CI/CD, dashboards, logs, repositories)

The goal is to ensure any engineer or product team member can safely execute a release or rollback without ambiguity.

**Context:**
N/A

**Analytic Events:**
N/A

**Acceptance Criteria:**
  • Document clearly separates Staging and Production release steps
  • Includes a defined rollback process for both environments
  • Includes a checklist of pre-release and post-release validation steps
  • Specifies roles/responsibilities during release
  • Can be followed end-to-end by a new engineer without additional context
  • Reviewed and approved by engineering lead 


**Additional Information:**
  • 

**ICE Score:**  37

## Page Content
(No additional page body content.)
