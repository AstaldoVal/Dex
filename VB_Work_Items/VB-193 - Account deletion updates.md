# VB-193: Account deletion updates

## Properties
- State: On HOLD
- Priority: high
- Identifier: VB-109
- Assignees: user://2e1d872b-594c-816d-ba9c-00022ce0a130
- Created By: user://2e1d872b-594c-8134-b843-0002f4e216ac
- Labels: Blocked
- Updated on: 2026-04-23T11:00:33.723Z
- Created on: 2026-03-22
- Notion URL: https://app.notion.com/p/342509790d9a81ee882aea4346ca4dca

## Description
**Description:**
Introduce "Deleted" Account State & Data Handling on Account Deletion

Background
Currently when a user deletes their account, it gets marked as suspended. This is incorrect — suspended and deleted are two different states. This ticket introduces a proper deleted state and defines all associated behavior.
suspended means the account is temporarily or permanently disabled but data remains intact and the account may be reinstated. deleted means the account was closed at the user's request and is irreversible. Deleted accounts must never be reactivatable.
Login Attempt on a Deleted Account
If a user tries to log in to a deleted account, show a modal with the following copy:
Title: Account Deleted
Description: Your account and personal data have been removed. Some data may be retained where required by applicable law or regulatory obligations.
Button: Ok
Data Handling on Deletion
The following must be triggered automatically when an account transitions to deleted.
Keep — name, email, phone, DOB, address from user_profiles, all kyc_verifications and kyc_verification_logs, bank_accounts (Finix), fraud_assessments and user_fraud_profiles, and any SEON & Veriff raw data. These must be flagged as belonging to a deleted account.
Anonymize — anonymize or de-identify all analytics and behavioral data.
Delete — GPS location from user_profiles, marketing preferences and email opt-ins, push and device tokens, user's wallet/balances, all active session and auth tokens. Tokens must be invalidated immediately upon deletion. Do not send any transactional or campaign emails to this user.
For pending redemptions - move them to rejected.
Any account can be deleted by Admins (via Payload). Users can delete their own accounts through "My Account" section - this remains unchanged.

**Context:**
N/A

**Analytic events:**
N/A

**Acceptance Criteria:**
- deleted is a distinct account state, separate from suspended- Deleted accounts cannot be logged into, recovered, or reactivated under any circumstances
- Attempting to log in to a deleted account shows a modal with the title "Account Deleted", the specified description, and an Ok button that dismisses it
- On deletion, the following are retained and flagged as belonging to a deleted account: name, email, phone, DOB and address from user_profiles, kyc_verifications and kyc_verification_logs, bank_accounts, fraud_assessments, user_fraud_profiles, and all SEON & Veriff raw data
- On deletion, all analytics and behavioral data is anonymized or de-identified
- On deletion, the following are permanently deleted: GPS location from user_profiles, marketing preferences and email opt-ins, push and device tokens, the user's wallet and balances, and any pending redemption requests
- All active session and auth tokens are invalidated immediately at the moment of deletion
- No transactional or campaign emails are sent to the user after their account is deleted
-Admins can delete any account through Payload
-User can delete his/hers own account through the "My Account" section on the Platform
**Additional details:**
- Type: Feature Improvement
- Created by: Adnan
- UX/UI impact: Yes
**Additional information:**
N/A
**ICE score:**
52.5

## Page Content
(No additional page body content.)
