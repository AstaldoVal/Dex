# VB-487: Fix Missing `paymentNameError` Event for KYC Verified Users with Mismatched Cardholder Name

## Properties
- State: Todo
- Priority: medium
- Identifier: VB-487
- Assignees: user://2e1d872b-594c-816d-ba9c-00022ce0a130
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Updated on: 2026-06-11T15:17:00.551Z
- Notion URL: https://app.notion.com/p/37c509790d9a809aa232cf5eaebec791

## Description
**Description:**
Investigate and fix an issue where the `paymentNameError` event is not triggered when a KYC-verified user completes a purchase using a cardholder name that does not match their verified identity

**Reproduction Scenario**
1. User completes KYC verification.
2. Platform automatically updates the user's profile name to the verified KYC name (e.g., John Doe).
3. User completes a payment using a card with a different cardholder name (e.g., Wrong 2).
4. Purchase is processed successfully.
5. Expected: `paymentNameError` event should be triggered because the payment cardholder name does not match the verified user name.
6. Actual: `paymentNameError` event is not triggered.**

Expected Behavior**
For KYC-verified users, cardholder names should be validated against the verified KYC name. Any mismatch should trigger the `paymentNameError` event and follow the existing name mismatch handling logic.


**Acceptance Criteria:**
  •  `paymentNameError` is triggered when a KYC-verified user's cardholder name does not match their verified KYC name.
  • The event contains the same properties and payload as other name mismatch scenarios.
  • Existing name validation behavior remains unchanged for non-KYC users.
  • QA verifies the event is triggered for the reported scenario and appears correctly in analytics.


**Additional Information:**
  • 

**ICE Score:** 36

## Page Content
(No additional page body content.)
