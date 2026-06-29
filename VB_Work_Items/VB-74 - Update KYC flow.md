# VB-74: Update KYC flow

## Properties
- State: Backlog
- Priority: low
- Identifier: VB-74
- Created By: user://2e1d872b-594c-8134-b843-0002f4e216ac
- Created on: 2026-03-14
- Updated on: 2026-04-17T08:49:20.355Z
- Notion URL: https://app.notion.com/342509790d9a81739d64e111e6258561

## Description
Description: Change the KYC flow so that the SSN step is part of the standard KYC, together with ID and PoA, creating a unified 3-step verification flow presented one step at a time.
1. Account Verification Modal — Full Redesign
Layout & Navigation
Replace the current "show all steps at once" layout with a step-by-step flow — users can only see and interact with the current step
Add a progress bar at the top of the modal showing progression through the three steps: Identity → Proof of Address → SSN
Users cannot see or access the next step until the previous one is completed and approved
Add clear messaging throughout the flow that verification is fully automated and typically approved within a few minutes
Step 1: Identity (ID Verification)
(Existing step — no copy changes required)
Step 2: Proof of Address
Updated copy:
To verify your address, you must submit a utility bill, bank statement, or credit card statement. This document is required to confirm your residential address, which will also be used in a later step to help verify your SSN.
Please ensure the information is accurate and up to date.
The document must:
Be a high-quality scan or photograph
Clearly show your full name and current address
Be dated within the last 90 days
Remove any disclaimer referencing a third-party provider (e.g. "Verified by [Provider]" with external links). Keep copy focused solely on the utility/document requirement
Step 3: Social Security Number
Copy:
Step 3: Social Security Number
To complete the full verification, you must provide your Social Security Number (SSN).
What You'll Do:
Enter your SSN in the secure field
Your information is securely encrypted and used to comply with regulatory and financial requirements.
Button: Submit SSN
Behavior:
The Submit SSN button is disabled until both Step 1 (ID) and Step 2 (PoA) have been completed and approved
If PoA (Step 2) is approved in less than 5 seconds, automatically advance to the SSN step without requiring user interactionIf both steps are approved but the user has not yet completed the SSN step, the main button on the Redemptions page should display "Verify" and remain active, allowing the user to return and complete the SSN step at any time
2. "Enter Your Name" Modal — Copy Update
Updated copy:
Please ensure your full name matches your SSN details, as it's required by law to verify your SSN to process redemptions over $600. Please make sure the address you provide in the later step is accurate.
3. Redemption Gate
Users cannot submit any redemption requests until all three KYC steps are completed and approved:
Identity (ID)
Proof of Address
SSN
If any step is incomplete, the redemption action is blocked
4. History Table
The SSN step must appear as a separate, trackable entry in the history/activity table, consistent with how ID and PoA steps are currently tracked
Type: Feature Improvement Created by: Adnan UX/UI Impact: Yes ICE Score: 81
Acceptance Criteria
KYC modal displays one step at a time with a progress bar at the top (Identity → Proof of Address → SSN)
Users cannot view or access the next step until the current step is approved
All steps include messaging that verification is fully automated and approved within a few minutes
Third-party provider disclaimers/links are removed from all steps/modals (Veriff disclaimer)
Copy for the Enter Your Name modal is updated as specified
Copy for Step 2 (PoA) and Step 3 (SSN) in the Account Verification modal is updated as specified
Submit SSN button is disabled until Steps 1 and 2 are both approved
SSN step opens automatically if PoA is approved within 5 seconds
Redemptions page shows "Verify" CTA (active) if Steps 1–2 are approved but SSN is not yet completed
Users cannot make redemption requests until all three KYC steps are passed
SSN step is tracked separately in the history table

## Page Content
(No additional page body content.)
