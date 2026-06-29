# VB-466: Churned user - Email sequence

## Properties
- State: Backlog
- Priority: high
- Identifier: VB-466
- Assignees: user://2e1d872b-594c-8167-b7b7-000242cca160
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Labels: Blocked
- Notion URL: https://app.notion.com/379509790d9a8080a993f9912a55ecad

## Description
Description:
Implement four email sequences for churned players. Segments of churned players:
  • No session in 7 days
  • No session in 14 days
  • No session in 30 days
  • No session in 60 days

For each of these segments, we’ve prepared a separated Churned user email sequence: https://docs.google.com/spreadsheets/d/13UqLQP54mBUktQy1Umv8HeiGtj9r_qFxANY3DCS6M4Q/edit?gid=1306930225#gid=1306930225

The idea for all is the same - each email is giving out free spins.

  • For the 7 day segment, there are only 3 emails, and free spins totaling 2 SC.
  • 14 days segment has 5 emails, and 3 SC of free spins.
  • 30 days segment has 7 emails, and 4 SC of free spins.
  • 60 days segment has 10 emails, and 5 SC of free spins.

Trigger for each sequence is - user didn’t start any sessions for X days (7, 14, 30, 60). Each of these sequences can be sent only once per user (so same user can’t get the Churned 1 week sequence two times). This should be possible to set from CIO side.

Exit for each sequence is - user starts a session.

For each sequence, user can only claim the free spins once.

Acceptance Criteria:
  • Four new sequences for churned users implemented
  • Triggers for each sequence: churned (no session) for 7 days, 14 days, 30 days and 60 days
  • Each sequence is giving out free spins
  • User can only claim the free spins once, for each sequence
  • Exit criteria for each sequence is session started

ICE Score: 192.00

## Page Content
(No additional page body content.)
