# VB-292: Sweepstakes Coins info text flickers after clicking Submit ID

## Properties
- State: Todo
- Priority: low
- Identifier: VB-292
- Assignees: user://2e1d872b-594c-8183-b36f-00021573ead3
- Created By: user://2e1d872b-594c-81fd-89a4-0002b69205bc
- Updated on: 2026-06-01 08:15:43Z
- Notion URL: https://app.notion.com/350509790d9a80e3812aefb2674bb6ef

## Description
Description:
When user clicks the Submit ID button, the text “Sweepstakes Coins can be redeemed for real prizes. Sweepstakes Coins must be played at least once before they can be redeemed (SC 1.00 for $1 USD).” briefly flickers in the background.

Context:
https://share.zight.com/yAuN9gN7#summary

Analytic Events:
N/A

Acceptance Criteria:
• After clicking Submit ID, the Sweepstakes Coins info text must not flicker in the background.  

Additional Information:
  • Environment: DEV, Stage
  • Reproducibility: Always

ICE Score:

## Page Content
### Reverified in Dev (#2)
#### Results
- ❌ The issue persists
- ℹ️ The issue happens only on the first attempt. If the user closes the Veriff iframe and clicks the Submit ID button again, the issue does not reproduce.
#### Attachments
[Recording](https://share.zight.com/E0upmJLb#summary)

---

### Verified in Dev (#1)
#### Results
- ❌ The issue is not fixed
- ❌ Text still flickering briefly when user clicks on the submit ID button
#### Attachments
[Recording](https://share.zight.com/X6u1nzzg)
