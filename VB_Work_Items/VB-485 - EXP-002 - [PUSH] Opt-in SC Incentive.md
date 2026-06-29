# VB-485: EXP-002 - [PUSH] Opt-in SC Incentive

## Properties
- State: In progress
- Priority: high
- Identifier: VB-485
- Assignees: user://2e1d872b-594c-8183-b36f-00021573ead3
- Created By: user://2e1d872b-594c-8183-b36f-00021573ead3
- EXP-ID: 002
- Updated on: 2026-06-12T22:25:52.250Z
- Notion URL: https://app.notion.com/p/37c509790d9a8017ab99c0fa0360378e

## Description
**Description:**
Run an A/B experiment to evaluate which notification subscription messaging drives the highest notification opt-in rate.
The core purpose of this experiment is to test different value propositions and copy while keeping the reward consistent across all variants.
All users will be offered the same reward:
• **100,000 GC**
• **1 SC**

**Experiment
Traffic Split**
50 / 50

The difference between variants should be the messaging displayed within the notification subscription modal.
  • `Control:` “Subscribe for free: get GC 100,000 + SC 1 instantly. One tap, yours now.”
  • `variant_a:` ”One-time offer: subscribe now and get GC 100,000 + SC 1 dropped into your account”


Texts setup in GrowthBook and sent via the integration to On*eSignal  ( only one option can be set via one signal and another variant need to be hardcoded)*

A dedicated promotional modal will be shown before the Daily Bonus modal.  
**See design: **
[https://share.zight.com/Koub0BlK](https://share.zight.com/Koub0BlK) - with subscribe modal
[https://share.zight.com/Z4uXdYKd](https://share.zight.com/Z4uXdYKd) - modal when user didn’t subscribe to push notification
[https://share.zight.com/eDu4Q1Rj](https://share.zight.com/eDu4Q1Rj) - modal when user subscribe to  to push notification


**Design assets**: [https://drive.google.com/drive/u/0/folders/1b_ZLkr2fM2y-uRLjeg1yWgzOKFaLkt-8](https://drive.google.com/drive/u/0/folders/1b_ZLkr2fM2y-uRLjeg1yWgzOKFaLkt-8)

**Flow Requirements**
• Show the notification subscription incentive modal before the Daily Bonus modal.
• Display the copy corresponding to the user's assigned experiment variant.
• All variants should use the same reward amount:
    ◦ 100,000 GC
    ◦ 1 SC
• Users remain assigned to the same variant throughout the experiment.
• Users who already have notifications enabled should not see the offer.
• Reward can only be granted once per account.**

Primary Metric
Notification Opt-in Rate **— The percentage of eligible users who subscribed to notifications after seeing the modal. This is the direct measure of the experiment's hypothesis: which message copy drives the highest subscription rate.
**
Secondary Metrics
  • Reward Claim Rate** — The percentage of opted-in users who then claimed their reward by clicking the button in the post-subscription popup. Measures the quality of engagement beyond the initial opt-in.
**  • Modal CTA Click Rate **— The percentage of users who clicked the CTA button out of those shown the modal. Since the OS permission dialog appears after the CTA click, this metric captures intent at the modal level — before the OS dialog drop-off.
**  • Modal Close Rate** — The percentage of users who dismissed the modal without clicking the CTA. Complements Opt-in Rate by showing how repelling each variant's copy is, not just how attractive it is.
**  • Push Notification CTR** — The percentage of opted-in users who click on push notifications after subscribing. Measures whether the opt-ins are translating into real engagement value, not just a one-time reward grab.
**  • Notification Opt-out Rate (7 days post opt-in)** — The percentage of users who unsubscribed from notifications within 7 days. A high opt-out rate signals that a variant attracted users motivated only by the reward, not genuine interest in notifications.
**  • Daily Bonus Claim Rate (guardrail) **— Tracks whether showing the notification modal before the Daily Bonus modal negatively impacts daily bonus engagement.
**  • D1 Retention (guardrail)** — The percentage of users who return to the app the next day. Ensures the incentive isn't attracting one-time users who churn after claiming the reward.
**  • D7 Retention (guardrail)** — Same as D1 but over a 7-day window. A stronger signal for sustained engagement post opt-in.
**  • Purchase Conversion Rate (guardrail)** — Ensures that push notifications post opt-in are driving monetization and not just engagement noise.**
**
**Acceptance Criteria:**
  • A/B/ test is live and users are evenly distributed across variants.
  • Users see the copy associated with their assigned variant.
  • Eligible users are shown the notification subscription incentive modal before the Daily Bonus modal.
  • Users remain consistently assigned to the same variant.
  • Users with notifications already enabled are excluded.
  • Clicking the CTA button triggers the OS-level native push notification permission dialog.
  • Users who click "Later" on the OS permission dialog are not granted the reward and are returned to the notification modal or dismissed to the Daily Bonus modal.
  • Reward is only granted after the user completes **both** steps: subscribes via the OS permission dialog **and** clicks the claim button in the post-subscription popup.
  • Reward can only be claimed once per account.
  • Users who dismiss the modal via "No thanks" are not shown the modal again in the same session and proceed to the Daily Bonus modal.


**Additional Information:**
  • **Context - **[https://share.zight.com/DOu0Xgyg](https://share.zight.com/DOu0Xgyg)

**ICE Score:**  300

## Page Content
(No additional page body content.)
