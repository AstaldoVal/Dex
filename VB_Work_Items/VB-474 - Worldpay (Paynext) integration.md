# VB-474: Worldpay (Paynext) integration

> Note: The URL provided for ticket 474 (37a509790d9a80089a63f5caa48153a4) resolves in Notion to a different page whose own identifier is VB-457 and whose canonical URL is https://app.notion.com/p/376509790d9a802e8557e66bbae98b35. The content below is what that URL actually returns.

## Properties
- State: Backlog
- Priority: 
- Identifier: VB-457
- Labels: Sandbox
- Updated on: 2026-06-08T08:15:48.929Z
- Notion URL: https://app.notion.com/p/376509790d9a802e8557e66bbae98b35

## Description
**Description:**
The actual integration of Worldpay is handled on Paynext side.

Our main objective is to make sure everything works and runs smoothly without any issues. If any additional work will be needed from VB team, this task should be updated. Right now, nothing extra is needed except testing everything and preparing the following ab experiment:

Launch a new experiment via Paynext, where 50% of the traffic gets Nuvei, and 50% gets **Worldpay**.

**Acceptance Criteria:**
  • Payments are working as expected, with no differences compared to Nuvei (Paynext) or Finix
  • Connection with Seon re. payments is handled properly, as with other PSPs
  • Saving cards, purchasing with saved cards, removing saved cards verified
  • Adding new cards verified
  • Apple pay verified
  • Tracking in Mixpanel, Tableau and Paynext dashboard verified
  • Refunds verified
  • Purchases are blocked if Seon’s risk score is 40+
  • AB experiment between Nuvei and Worldpay launched
  • Traffic is properly split, 50-50




**ICE Score:** 266.67

## Page Content
(No additional page body content.)
