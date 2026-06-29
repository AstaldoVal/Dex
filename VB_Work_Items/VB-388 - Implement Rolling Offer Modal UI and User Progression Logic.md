# VB-388: Implement Rolling Offer Modal UI and User Progression Logic

## Properties
- State: Backlog
- Priority: high
- Identifier: VB-388
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Labels: Sandbox, Blocked, Business decision required
- Updated on: 2026-06-02T13:40:58.994Z
- Notion URL: https://app.notion.com/p/365509790d9a80a0a5fec6132c25a6f9

## Description
**Description:

**Design to be added here

Implement the Rolling Offer modal based on finalized designs, including the step progression system, user interactions, and state management.
The modal should support a configurable sequence of steps where each step can be either a Purchase Offer or a Free GC + SC Reward. Users progress through the offer one step at a time, with each completed step unlocking the next.
The UI must support the following step states:
• Active
• Locked
• Completed

User progression must be persisted so that users can continue where they left off when reopening the modal or revisiting the offer through the Store.
The modal should also be displayed within the Special Promotions tab in the Store while the offer remains active.

 **Special condition**: If user claimed all rewards/purchases within the Rolling offer - don't show again that liveops popup.

**Closing Logic for rolling modal**
• Modal closes if user manually closes it via the X button or;
• Modal closes once user finishes with the final step

**Store updates**
  • Show the rolling offer within the Special Promotions tab in the Store
  • If rolling offer expires - stop showing it in the Store
  • **Add design here**

**Context:**
N/A

**Analytic Events:**
`liveops_modal_viewed` - any liveop popup is displayed
Properties:
  • `popup_id`
  • `rolling_offer_id`
`
rolling_offer_step_completed` - user completes a step
Properties:
• `popup_id`
• `rolling_offer_id`
• `step_number`
• `step_type` (purchase, bonus)

**Acceptance Criteria:**
  • Rolling Offer modal supports Purchase and Bonus step types.
  • Steps display correctly in Active, Locked, and Completed states.
  • Only the currently active step is interactable.
  • Locked steps cannot be clicked or interacted with.
  • Completing a step immediately unlocks the next step.
  • Completed steps display the completed state.
  • Purchase steps trigger the existing purchase flow.
  • Bonus steps grant the configured GC/SC rewards.
  • User progression is persisted per user.
  • Progress is restored when reopening the modal.
  • Users cannot repeat completed steps.
  • Modal closes when:
      ◦ User clicks the Close (X) button.
      ◦ User completes the final step.
  • Rolling Offers appear in the Store Special Promotions tab.
  • Expired Rolling Offers are not shown in the Store.
  • Analytics events fire correctly:
      ◦ liveops_modal_viewed
      ◦ rolling_offer_step_completed
  • Purchase and reward flows complete without invalid state transitions.


**Additional Information:**
  • 

**ICE Score:** 56

## Page Content
Rolling Offer Modal UI & Progression Flow
