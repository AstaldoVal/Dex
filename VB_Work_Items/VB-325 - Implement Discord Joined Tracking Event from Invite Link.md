# VB-325: Implement Discord Joined Tracking Event from Invite Link

## Properties
- State: Backlog
- Priority: medium
- Identifier: VB-325
- Labels: Sandbox
- Updated on: 2026-05-06 09:21:19Z
- Notion URL: https://app.notion.com/358509790d9a80adad88cb264d531ca9

## Description
Description:
Investigate and implement tracking for a new analytics event discordJoined that triggers when a user successfully joins the Discord server through the provided invite link.
The goal is to measure conversion from platform traffic to actual Discord community joins. Review Discord tracking capabilities, invite link attribution, and any required webhook/API integration to confirm feasibility.

Context:
N/A

Analytic Events:
  • discordJoined that triggers when a user successfully joins the Discord server through the provided invite link.

Acceptance Criteria:
  • Feasibility of tracking successful Discord joins via invite link is confirmed.
  • discordJoined event is implemented if technically supported.
  • Event triggers only on successful server joins, not link clicks.
  • Invite link source/campaign attribution is included when available.
  • Event is visible in analytics platform (e.g. Mixpanel).


Additional Information:
  • 

ICE Score: 72

## Page Content
(Body not retrieved: page fetch resolved to a different record. Description above is complete and authoritative.)
