# VB-468: Customer IO setup improvements

## Properties
- State: In Review
- Priority: high
- Identifier: VB-468
- Assignees: user://2e1d872b-594c-8163-9ff2-00026e4256a6
- Notion URL: https://app.notion.com/376509790d9a80f9bc0fef618098d681

## Description
Description:
We’ve identified multiple issues with our current CIO setup. This task covers fixing all of those.

  1. Inside Customer IO, we’re not tracking any events except CIO events. What we should track additionally:
  • User’s last visit and sign up activity: https://share.zight.com/rRuYrrrv#comments
  • Custom events for purchase success and withdrawal, together with the amounts: https://fly.customer.io/workspaces/188776/journeys/people/e8c20b019b66ccd002/activity

  2. Incorrect setup of goals
  • We don’t need to send events such as first_purchase and second_purchase. We need to send an event with each top up transaction (as stated in #1), but also which purchase this is for the user (first, second, third, etc.) - as a user property. E.g. purchaseSuccess event with a parameter purchase_count which can be: 1, 2, 3…
  • https://fly.customer.io/workspaces/188776/journeys/campaigns/66/overview?channels=email-twilio-webhook-slack - this means, Goal here won’t be “first_purchase_completed” but purchaseSuccess with param purchase_count = 1. All conditioning logic should be done on the CIO side.

To summarize #1 and #2 regarding top ups - send one purchase event and update user property what’s the total top up amount ($10, $20,…), and what’s total top up count (1, 2, 3…). This allows proper segmentation on CIO side without devs intervention. 

  3. All conditional logic should be done on CIO side
  • https://fly.customer.io/workspaces/188776/journeys/campaigns/76/overview?channels=email-twilio-webhook-slack 
  • Replace current setup: “People will enter this campaign every time they perform the event: daily_bonus_sequence” - with a new setup where conditional logic is handled on CIO side - we need to double check for the daily bonus sequence if it’s doable on CIO side and if it makes sense even to switch to that new logic there
  • What are the exact events needed to exit the daily bonus sequence? Send those as custom events to CIO, and setup conditions there.

  4. Same logic needs to be applied for all other email sequences
  • Update all other email sequence, and move the conditional logic to the CIO side fully
  • Work together with Plamen and Adnan to achieve this

!!UPDATE 10.06.!!

We want to be able to achieve/create the following segments in CIO:
  1. Signed up but have not verified phone number - phone verified user property is false, and user completed sign up
  2. Verified phone number but have not made FTD - phone verified user property is true, and purchase success never sent for this user
  3. Made purchase attempt but it was not successful - purchase fail sent - user leaves segment if he makes a successful purchase
  4. FTD user (never made second deposit) - purchase count user property = 1
  5. Made first redemption - withdrawal count user property = 1
  6. Inactive for 7 days after FTD - last visit > 7 days + purchase count user property = 1 (or maybe to ≥ 1 - need to discuss)
  7. Inactive for 7 days after first withdrawal - last visit > 7 days + withdrawal count user property = 1 (or maybe to ≥ 1 - need to discuss)
  8. Current loyalty level: Silver - user property loyalty tier = Silver
  9. Current loyalty level: Gold - user property loyalty tier = Gold
  10. Current loyalty level: Emerald - user property loyalty tier = Emerald
  11. Current loyalty level: Diamond - user property loyalty tier = Diamond

Acceptance Criteria:
  • Sign up and last visit activity is properly tracked in CIO
  • Purchase success and Redemption approved events are sent to CIO, each time they occur
  • Both Purchase success and Redemption approved events are sent with parameters for: purchase/redemption count (1, 2, 3,…) and purchase/redemption amount ($10, $20,…)
  • Apart from getting single events for the above, we should be able to identify total top ups and withdrawals amount for each user in CIO - this will be used for segmentation purposes
  • All conditional logic, as explained in the description is moved from the code to CIO, by sending individual events to CIO and setting up the logic there
  • All segments from UPDATE 10.06. are achievable and created in CIO

ICE Score: 133.33

## Page Content
(Body not retrieved: page fetch resolved to a different record. Description above is complete and authoritative.)
