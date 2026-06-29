# VB-493: 3OAK freespins completion shows provider error and winnings not credited

## Properties
- State: Backlog
- Priority: 
- Identifier: VB-493
- Created By: user://2e1d872b-594c-81fd-89a4-0002b69205bc
- Labels: Sandbox
- Updated on: 2026-06-12T15:55:45.000Z
- Notion URL: https://app.notion.com/p/37d509790d9a80539207e275419800ea

## Description
**Description:**
On Stage, when user receives freespins and plays them fully, an internal provider error message appears. SC winnings from the freespins are not added to the user balance, and no transaction appears in Payload. The issue reproduces only with 3OAK provider on Stage (only provider eligible to grant freespins there) and is not reproduced on Prod with the same provider.

**Context:**
[https://share.zight.com/jkuwd0XZ#summary](https://share.zight.com/jkuwd0XZ#summary)

**Analytic Events:**
N/A

**Acceptance Criteria:**
  • After user finishes playing all freespins, no provider error message must be shown.
  • SC winnings from freespins must be credited to the user balance and redeemable balance after freespins completion.
  • A corresponding transaction for freespins winnings must be created and visible in Payload.


**Additional Information:**
Environment: Stage  Reproducibility: Always  Provider: 3OAK  Console error: Error: Can only be used on: [https://vegasbonanza.com/](https://vegasbonanza.com/)  Notes: No SC credited, no transaction in Payload  Not reproduced: Prod with the same provider

**ICE Score:** 27

## Page Content
(No additional page body content.)
