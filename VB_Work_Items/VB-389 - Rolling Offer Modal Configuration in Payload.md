# VB-389: Rolling Offer Modal Configuration in Payload

## Properties
- State: In Review
- Priority: high
- Identifier: VB-389
- Assignees: user://357d872b-594c-812f-a03d-00028d4f8082
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Updated on: 2026-06-09T07:29:34.455Z
- Notion URL: https://app.notion.com/p/365509790d9a80e1a037e7f319b64893

## Description
**Description:**
Add support for configurable Rolling Offers in Payload.

  1. Add a new section in Payload within the "Features Management" called "Rolling Offers".
  2. Admins should be able to create and manage Rolling Offers in this section.

**Rolling Offers Configuration**
For each Rolling Offer:
  • Admin can create/edit Rolling Offers
  • Rolling Offer contains exactly 6 configurable steps
  • Rolling Offer has a start and end date
• For each step admin selects:
    ◦ Step type:
        ▪ Purchase
        ▪ Bonus

**Purchase Step**
If Purchase is selected:
• Admin selects an existing Package from Payload
• Selected Package is used for the step configuration

**Bonus Step**
If Bonus is selected:
• Admin manually configures:
    ◦ GC amount
    ◦ SC amount

**Backend**
This ticket should cover the backend integration of the Rolling Offers:
  • On which step user is on (which rewards he unlocked/purchased etc.)
  • Wallet updates
  • Transaction history updates

**Acceptance Criteria:**
  • New "Rolling Offers" collection exists in Payload/Admin
  • Admin can create/edit Rolling Offers
  • Rolling Offer supports exactly 6 configurable steps
  • Admin can configure each step as Purchase or Bonus
  • Admin can select existing Packages for Purchase steps
  • Admin can manually configure GC/SC values for Bonus steps
  • Step order is preserved and displayed correctly
  • Rolling Offer progression is persisted per user
  • Users receive the correct reward/package for each completed step
  • Backend work for Rolling Offers is handled in the scope of this ticket
  • When the rolling offer expires, don't show it in the Store, and don't show the Liveops popup connected to it anymore

**ICE Score:** 56

## Page Content
(No additional page body content.)
