# VB-267: Refunded payment not reflected in platform and Payload

## Properties
- State: Todo
- Priority: low
- Identifier: VB-267
- Assignees: user://2e1d872b-594c-8163-9ff2-00026e4256a6
- Created By: user://2e1d872b-594c-81fd-89a4-0002b69205bc
- Updated on: 2026-04-22 09:09:40Z
- Notion URL: https://app.notion.com/349509790d9a80b0ba78db57b94a512d

## Description
Description:
On Stage, when Payload admin refunds a payment, the refund is marked as succeed on Finix side, but in our platform and Payload no changes are reflected. The payment is still visible in Purchase history on My account page, and in Payload user profile it is still shown in purchase history instead of moving to refunded history. On Dev it works correctly. Potentially the same issue can exist on Prod.

Context:
https://share.zight.com/6qulNOpl
https://share.zight.com/E0upR2vG
https://share.zight.com/qGuWZ0GN

Analytic Events:
N/A

Acceptance Criteria:
• After a payment refund succeeds in Finix, the payment must be removed from My account purchase history in the platform.
  • After a payment refund succeeds in Finix, in Payload user profile the payment must be removed from purchase history and appear in refunded history.  
  • Refund status must be reflected consistently across Finix, platform UI, and Payload.  


Additional Information:
  • Environment: Stage  
  • Note: Stage is using live payments environment (Finix)  
  • User ID (Stage): 7c5bb2bb-dc1e-47ec-b178-016c194919bb  
  • Email: t.baghdasaryan+vocym@vegasbonanza.com  
  • Payment ID: a821a0d5-864b-439b-9dc8-8a8f05cebd52  
  • Finix refund status: succeed

ICE Score: 48

## Page Content
(Body not retrieved: page fetch resolved to a different record. Description above is complete and authoritative.)
