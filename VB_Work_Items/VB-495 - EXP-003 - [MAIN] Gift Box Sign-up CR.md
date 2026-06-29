# VB-495: EXP-003 - [MAIN] Gift Box Sign-up CR

## Properties
- State: In progress
- Priority: high
- Identifier: VB-495
- Assignees: user://2e1d872b-594c-8163-9ff2-00026e4256a6
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Updated on: 2026-06-13 05:47:49Z
- Notion URL: https://app.notion.com/37d509790d9a8019ad99f5b5848b7a5f

## Description
**Description:**
Run an A/B experiment to evaluate the impact of introducing a Gift Box CTA on the main landing page. The goal is to understand whether highlighting a bonus incentive at the top of the funnel increases user sign-up conversion rate.

Currently, users can start registration through the existing CTAs on the main page. This experiment introduces an additional Gift Box entry point, similar to the CCC experience, which directs users into the standard registration flow.

The Gift Box CTA will be displayed on the main page and, when clicked, will trigger the same registration flow as all existing sign-up buttons. Users will first see the existing Terms & Conditions modal that is currently shown before registration.

**Control (A)** — Existing main page experience without Gift Box CTA
**Variant (B)** — Main page experience with Gift Box CTA displayed

**UX/UI**
• Add a Gift Box element to the main page (similar to CCC implementation)
• Clicking the Gift Box opens the existing Terms & Conditions modal
• After accepting Terms & Conditions, users continue through the standard registration flow
• No changes to the registration flow itself

**Traffic Split:** 50/50
**Experiment Property**
GrowthBook Property Name: `ab_main_giftbox_signup`
Values:
• `control`
• `variant`

**Primary Metrics:**
• **Sign-up Conversion Rate** — % of users who complete registration after viewing the main page
• **Gift Box CTR** — % of users who click the Gift Box CTA after viewing the main page
**Secondary Metrics:**
• **Terms Acceptance Rate** — % of users who accept Terms & Conditions after clicking the Gift Box
• **Registration Start Rate** — % of users who enter the registration flow after viewing the main page
• **Purchase Conversion Rate** — % of users who make a purchase after registration
**Analytic Events:**
Existing events should be used where possible.
New event: `giftBoxClicked`
Event should fire when a user clicks the Gift Box CTA.

**Context:**
 user://37bd872b-594c-810e-90be-00027067935a can you add design icon here 


**Acceptance Criteria:**
  • A/B test is live and splits eligible users evenly between control and variant
  • Gift Box CTA is displayed only for users assigned to the variant
  • Clicking the Gift Box opens the existing Terms & Conditions modal
  • After accepting Terms & Conditions, users enter the standard registration flow
  • Existing registration flow behavior remains unchanged
  • `giftBoxClicked` event is fired and sent to Mixpanel when users click the Gift Box
  • Main page view → registration completion conversion can be measured by experiment variant
  • Users remain consistently assigned to the same varian
  • tExperiment data is available in Mixpanel and GrowthBook for analysis


**Additional Information:**
  • 

**ICE Score:**  150

## Page Content
### Verified in Prod (#1)
Devices: MacBook Air Chrome, iPhone 13 Safari
#### Results
ℹ️ The ticket was verified in production immediately, as it had already been deployed overnight.
- 🟢 AC1: Passed
	- The GrowthBook experiment is configured, and traffic is split 50/50 between the control and variant A groups.
- 🟢 AC2: Passed
	- The Gift Box is visible only to users in the variant A group.
	- The control group remains exactly the same as before.
- 🟢 AC3: Passed
	- Clicking/tapping anywhere on the Gift Box opens the T&C modal.
- 🟢 AC4: Passed
	- Once the user accepts the T&C, the sign-up flow continues.
- 🟢 AC5: Passed
	- No changes.
- 🔴 AC6: Failed
	- No `giftBoxClicked` event exists in MP, so nothing is triggered.
- 🟠 AC7 & AC9: Not sure this is QA-related
	- However, even if the `giftBoxClicked` event does not exist, the experiment property and its value are available in the `signUpCompleted` event, which can help with measurement until `giftBoxClicked` is added.
- 🟢 AC8: Passed
	- The user remains in the same variant unless they switch devices/browsers or clear all browser data (works as expected with the current solution).
- Add Results:
	- 🟢 User successfully receives a 150% welcome bonus if they register via the Gift Box.
	- ℹ️ The gift box is floating a bit, which looks nice.
#### Attachments
Variant A
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/0326e11b-9afb-4206-a6d2-3ba2570940fe/experiment_console_1.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/e0444001-de2a-4134-9c68-33e2e7f47614/1_Box_desktop_.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/6a8c0478-e2c5-4b3d-9e42-7160d6c6b270/1_welcome_bonus_150.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/3f10e00b-ce9e-4d88-8f13-dbe10a6dd40f/1_mobile.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/96294593-a86e-42c3-8b75-ef623b8c8eb9/1_bonus.png)
Control
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/9eb909b8-3a19-4755-9d4a-752fa230885c/0_console.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/5e00a0d8-7e4d-43dd-8f4a-c4b75a6c5347/0_no_box.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/19b15903-54bd-4afe-8327-a21718404faa/0_mobile.png)
MP no event exist
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/7514107d-8015-4bf7-ba1d-4a995b5bcf67/No_event_exist.png)
MP experiment data in events
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/c1a75b61-dadf-45d3-909c-f624fe12627e/Screenshot_2026-06-13_at_09.40.00.png)
Growthbook
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/a8696077-386a-46a9-8090-7ee30685ca2a/growthbook.png)
