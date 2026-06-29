# VB-461: EXP-001 - [PWA] Install SC Incentive

## Properties
- State: In progress
- Priority: high
- Identifier: VB-461
- Assignees: user://357d872b-594c-812f-a03d-00028d4f8082
- EXP-ID: 001
- Notion URL: https://app.notion.com/376509790d9a80ec9076f2919cb872f0

## Description
Description:

Run an A/B/C experiment to evaluate the impact of a PWA incentive strategy. The goal is to understand whether offering a reward increases PWA installs and improves downstream engagement and retention metrics. ABC will be testing different GC incentives to see if there is any impact.

The experiment splits eligible users into three groups:
Control (A) — 1 SC and 100,000 GC incentive for installing the PWA
Variant B — 1 SC and 150,000 GC incentive for installing the PWA
Variant C — 1 SC and 200,000 GC incentive for installing the PWA

UXUI
iOS: https://app.visily.ai/projects/053f7780-4e4a-4f3c-b0d3-6c77a0fbfc6a/boards/2540826/elements/1285746137
Android/Desktop: https://app.visily.ai/projects/053f7780-4e4a-4f3c-b0d3-6c77a0fbfc6a/boards/2540826/elements/1285747257 

Design assets https://drive.google.com/drive/u/0/folders/1teOope5ahmyloQ-iCgfpbzODJxfgj_xw

Currently, users don’t get any rewards for installing the PWA. We are changing the experience within this ticket so that the users will receive the above rewards for installing and opening the PWA. If the user gets the reward, that is displayed within the PWA on first session start after login.

• Reward is granted once per account, don’t propose to users ho have PWA already installed. Except a case when a user has PWA installed but logs in from browser, then we can grant him a reward even if PWA has already installed
• A reward modal is shown on first PWA session confirming the reward was received (reuse existing “Rewards Added” modal) 
• UI updates apply to: Add to Home Screen button, modals that prompt user to install PWA, Rewards Added modal
• Send experiment variant to CIO so marketing team can have different email scenarios
• Wallet top-up is tracked in the transactions, as any other wallet change

UI
Follow the Visily board pasted above for the UXUI.
  • Remove timer from UI we will launch this experiment without time
  • Reduce size of the “Rewards Added” modal - it should be same size as the PWA instructions modal
  • Update “Rewards Added” modal so that it has GC and SC icons, and once reward is claimed, the animation of the GC/SC flying towards the wallet will play
  •  Copy changes: “Maybe Later" CTA should be "I don't want bonus coins"
  •  CTA "Add to Home Screen" should be "Add to home screen now"
  •  Text below raccoon "Enjoying Vegas Bonanza? Install this web app.." should be "Enjoying Vegas Bonanza? Add this web app to your device for easy access and get 100,000 GC and 1 SC for FREE!”

Traffic Split: 33/33/33 (even)
Experiment Property
GrowthBook Property Name: abc_pwa_install_incentive
Values:
  • control
  • variant_b
  • variant_с

Primary Metrics:
• PWA Install Rate — % of eligible new users who install the PWA after seeing the install prompt
• D1 Retention — % of users who return to the app 1 day after PWA install
• D7 Retention — % of users who return to the app 7 days after PWA install
• D30 Retention — % of users who return to the app 30 days after PWA install
• Purchase Conversion Rate — % of users who make a purchase within 30 days of PWA install

Secondary Metrics:
• Reward Claim Rate — % of users who installed the PWA within the 15-minute window and received the GC/SC reward (bonusReward event)
• Timer Expiry Rate — % of users who saw the PWA install prompt but did not install within 15 minutes
• First Session GC Spend — average GC spent by reward recipients during their first PWA session

Analytic Events:
New event: bonusReward
Parameters:
  • bonus_type (pwa)
  • gc_amount
  • sc_amount

Event should be fired and sent to Mixpanel when users wallet tops up due to opening the PWA for the first time.

Acceptance Criteria:
  • A/B/C test is live and splits eligible users evenly across active variants
  • Reward is granted once per account; existing PWA users are excluded
  • Reward modal is displayed on first PWA session confirming the received reward
  • Add to Home Screen button, and PWA installation modals display the reward offer
  • UI changes are implemented based on description
  • bonusReward analytic event is fired to Mixpanel on wallet top-up
  • Wallet top-up is reflected as a standard platform transaction
  • Email copies promoting PWA are updated to include the reward messaging (Email Marketing — task should not be closed until complete)
  • Users remain consistently assigned to the same variant

ICE Score: 204.00a

## Page Content
Теперь напиши предложение по апдейту структуры дашбордов mixpanel, которые касаются исключительно AB-тестов. Напиши простым, но понятным языком, линкуя эту идею к структуре с переименованием экспериментов.
