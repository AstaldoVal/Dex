# VB-32: Show Wallet Locked Modal for Blocked GC/SC Wallets

## Properties
- State: Backlog
- Priority: none
- Identifier: VB-32
- Created By: user://2e1d872b-594c-8134-b843-0002f4e216ac
- Created on: 2025-12-30
- Updated on: 2026-04-14T15:30:19.118Z
- Notion URL: https://app.notion.com/342509790d9a818eab79ffa50560d0ef

## Description
Description:
When a Payload admin locks a user's Golden Coins or Sweepstakes Coins wallet, the user must see a clear "Wallet Locked" modal instead of experiencing endless game loading.
If the active wallet is locked and the user attempts to open a game, the game must not launch; instead, show the modal with the following copy:
Modal Copy:
Title: Wallet Locked
Body: This wallet is temporarily unavailable. Switch to another wallet to continue playing.
Primary button: Switch Wallet
Small text: Locked due to account or security checks
The modal must follow existing product standards: modal width, padding, spacing, fonts, icon style, and button layout.
Context:
https://share.zight.com/NQuGZXkA
https://share.zight.com/RBupd2oG
Analytic events:
N/A
Acceptance Criteria:
If GC or SC wallet is locked in Payload, and the user tries to launch a game with that wallet selected, the game must not start and must show the "Wallet Locked" modal.
Modal displays the exact copy listed in the desciption and follows the product's modal design rules.
If the user taps Switch Wallet, open the wallet selector.
No endless loading state should occur when a locked wallet is active.
Additional details:
Type: Feature Improvement
Created by: Tigran
UX/UI impact: Yes
Additional information:
N/A
ICE score:
81

## Page Content
(No additional page body content.)
