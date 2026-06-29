# VB-339: Auto-Apply VIP Label in Chatwoot for High-Value Users

## Properties
- State: On HOLD
- Priority: high
- Identifier: VB-339
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Labels: Sandbox
- Updated on: 2026-05-12T08:18:02.517Z
- Notion URL: https://app.notion.com/p/35a509790d9a80b9b111dd005a5d12a5

## Description
**Description:**
When a new email conversation is created in Chatwoot, automatically check the user in the backend to determine whether they qualify as a **VIP**.
A VIP user is defined as:
• Top **1% spender**, and
• Top **5% NGR**
If the user meets the criteria, use the Chatwoot API to automatically add the **VIP** label to the conversation. This will help support agents quickly identify high-value users and prioritize handling.
Chatwoot Labels API: [https://developers.chatwoot.com/api-reference/conversations/add-labels](https://developers.chatwoot.com/api-reference/conversations/add-labels)

**Context:**
Chatwoot Labels API: [https://developers.chatwoot.com/api-reference/conversations/add-labels](https://developers.chatwoot.com/api-reference/conversations/add-labels)

**Analytic Events:**
N/A

**Acceptance Criteria:**
  • New incoming email conversations trigger a backend VIP eligibility check.
  • Users meeting VIP criteria receive the **VIP** label on the Chatwoot conversation automatically.
  • Non-VIP users do not receive the label.
  • Label is added successfully via Chatwoot API without manual action.
  • Errors are logged for failed checks or failed label application.


**Additional Information:**
  • 

**ICE Score:** 54

## Page Content
(No additional page body content.)
