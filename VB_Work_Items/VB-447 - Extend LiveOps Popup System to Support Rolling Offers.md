# VB-447: Extend LiveOps Popup System to Support Rolling Offers

## Properties
- State: In Review
- Priority: high
- Identifier: VB-447
- Assignees: user://357d872b-594c-812f-a03d-00028d4f8082
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Notion URL: https://app.notion.com/373509790d9a80dfacebfe73e8eb5dff

## Description
Description:
Extend the existing LiveOps Popup configuration to support a new popup type called Rolling Offer.
When creating or editing a LiveOps Popup, admin should be able to select the Rolling Offer type and link it to an existing Rolling Offer configuration 
Since Rolling Offers use a fixed design, certain existing LiveOps fields ( image, template) should become non-editable when the Rolling Offer type is selected.
Rolling Offers should fully utilize the existing LiveOps scheduling, priority, frequency, and visibility logic. 
Completed or expired Rolling Offers should no longer be displayed to users.

Acceptance Criteria:
  • New LiveOps Popup type "Rolling Offer" is available.
  • When Rolling Offer is selected:
      ◦ A Rolling Offer selection dropdown is displayed.
      ◦ Existing Rolling Offers can be selected.
  • Image field becomes disabled/non-editable.
  • Template field becomes disabled/non-editable.
  • Linked Rolling Offer configuration is saved correctly.
  • Rolling Offer popups respect existing LiveOps:
      ◦ Scheduling
      ◦ Frequency rules
      ◦ Priority rules
      ◦ Visibility rules
  • LiveOps popup opens the linked Rolling Offer modal.
  • If a user completes all steps within a Rolling Offer, the associated LiveOps popup is no longer displayed.
  • If a Rolling Offer expires, the associated LiveOps popup is no longer displayed.
  • Existing LiveOps popup functionality remains unaffected for other popup types.

ICE Score:  67

## Page Content
(No additional page body content.)
