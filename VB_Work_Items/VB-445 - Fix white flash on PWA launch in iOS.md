# VB-445: Fix white flash on PWA launch in iOS

## Properties
- State: In Review
- Priority: medium
- Identifier: VB-445
- Assignees: user://220d872b-594c-8171-9599-00029c0dad47
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Notion URL: https://app.notion.com/373509790d9a807d958aeae9c3fffaae

## Description
Description:
When opening the PWA on iOS devices ( iPhone 13) via Chrome/Safari, users observe a brief white flash before the app shell loads. 

The issue likely occurs during the initial paint phase before the app’s background color and root styles are applied, or due to missing/incorrect splash screen configuration in the iOS PWA manifest / HTML meta setup.

We need to investigate and eliminate the white screen flash by ensuring proper startup theming and splash handling across iOS PWA launch flows.

note: you can try to add slash screen with VB logo instead of white flash (which we have it on game loading) similar to Chumba Casino

Context:
https://drive.google.com/file/d/1eo__VYjnz7d22zB7JHzln7NbXvk5JP-5/view?usp=drive_open&t=3.209

Analytic Events:
N/A

Acceptance Criteria:
  • No visible white flash appears when launching the PWA on iOS (iPhone 13 and similar devices).

Additional Information:
  • 

ICE Score: 27

## Page Content
(Body not retrieved: page fetch resolved to a different record. Description above is complete and authoritative.)
