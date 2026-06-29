# VB-460: Aggressive popups offering a/b/c/d experiment

## Properties
- State: In progress
- Priority: high
- Identifier: VB-460
- Assignees: user://357d872b-594c-812f-a03d-00028d4f8082
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Labels: Blocked
- Notion URL: https://app.notion.com/376509790d9a80388827f0ddbd4ddab3

## Description
Description:
To run this experiment, first condition is to build the following 5 popups:
  • Purchase 1 - https://share.zight.com/7Ku54N65
  • Purchase 2 -  https://share.zight.com/NQuPL9jv
  • Purchase 3 - https://share.zight.com/OAuD0vjl
  • Purchase 4 - https://share.zight.com/7Ku54Njv
  • Purchase 5 - https://share.zight.com/kpuq9vO8

Assets: https://drive.google.com/drive/u/0/folders/1aNPauBpwTJAmzOoIavcUBegtxpSbT8RT

Purchase 1: $9.99, 20 SC, 250K GC
Purchase 2: $4.99, 11 SC, 150K GC
Purchase 3: $39.99, 85 SC, 800K GC
Purchase 4: $99.99, 200 SC, 3M GC
Purchase 5: $3.99, 10 SC, 100K GC

Run the experiment via Growthbook. Experiment title: “Aggressive popups offering”.

Variants:
  • Control (A): none of these popups are shown
  • B: During onboarding, after starter pack popup, show popups Purchase 1, Purchase 2 and Purchase 3
  • C: During onboarding, after starter pack popup, show popups Purchase 1, Purchase 2, Purchase 3 and Purchase 4
  • D: During onboarding, after starter pack popup, show popups Purchase 1, Purchase 2, Purchase 3, Purchase 4 and Purchase 5

If user purchases any offer (starter pack, one of these 5 offers, any other offer on the platform) - stop showing these popups. If user purchases any offer during the flow, don’t show any offers afterwards.

These new offers should not be in the store.

The flow should only be executed on session 1. These popups should be last in the line of popups (after starter pack, welcome bonus, daily bonus, etc.).

Analytic Events:
New event:
  • purchasePopupDisplayed - parameters: purchase ID

Acceptance Criteria:
  • New 5 popups created as per design
  • ABCD experiment started
  • Control group doesn’t show any of the new popups
  • B variant shows Purchase 1, 2 and 3 popups
  • C variant shows Purchase 1, 2, 3, and 4 popups
  • D variant shows Purchase 1, 2, 3, 4 and 5 popups
  • New popups for variants B, C and D are only shown within first session
  • New popups are only shown after all current popups
  • If user makes any purchase, no further popups are shown
  • New analytic event sent to Mixpanel
  • Experiment executed via Growthbook
  • If user clicks on an offer, but doesn’t finish purchasing and goes back, flow continues
  • Experiment should be fired on the main page (landing page) viewed. It means, we segment the traffic on the very first main page visit

ICE Score: 225.00

## Page Content
(No additional page body content.)
