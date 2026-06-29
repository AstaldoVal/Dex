# VB-298: Game is not available error after claiming coins from Not Enough Coins modal

## Properties
- State: Todo
- Priority: medium
- Identifier: VB-298
- Assignees: user://2e1d872b-594c-816d-ba9c-00022ce0a130
- Created By: user://2e1d872b-594c-81fd-89a4-0002b69205bc
- Updated on: 2026-05-07 11:36:16Z
- Notion URL: https://app.notion.com/351509790d9a80e195ebf02de7926570

## Description
Description:
On Prod, when user claims coins from the Not Enough Coins modal, the platform shows our “Game is not available” error message. This happens only when VPN is enabled. Using Octo browser without VPN enabled works correctly. After page reload, the game opens correctly. The issue is specific for Playson (maybe more) provider, not for all.

Context:
https://share.zight.com/Z4uRpkgK#summary

Analytic Events:
N/A

Acceptance Criteria:
  •  Claiming coins from the Not Enough Coins modal must not trigger “Game is not available” error.
  • After claiming coins, user must be able to open/continue the game without requiring page reload.  
  • The flow must work consistently regardless of VPN usage (VPN on or off).  

Additional Information:
  • Environment: Prod 
  • Reproducibility: Always (with VPN enabled)  
  • User: t.baghdasaryan+qulivezu@vegasbonanza.com  
  • Provider: Playson

ICE Score: 48.00

## Page Content
(No additional page body content.)
