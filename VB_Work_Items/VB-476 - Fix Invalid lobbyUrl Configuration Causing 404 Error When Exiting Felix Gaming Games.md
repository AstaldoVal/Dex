# VB-476: Fix Invalid `lobbyUrl` Configuration Causing 404 Error When Exiting Felix Gaming Games

## Properties
- State: On HOLD
- Priority: high
- Identifier: VB-476
- Assignees: user://2e1d872b-594c-8167-b7b7-000242cca160
- Updated on: 2026-06-10T12:04:52.085Z
- Notion URL: https://app.notion.com/p/37a509790d9a80edb2b5c7b0d6e9bd16

## Description
**Description:**
Felix gaming provider,** clicking on the home icon **and then **leave button **(provider end) returns error message .[https://share.zight.com/d5uqdb4P#summary](https://share.zight.com/d5uqdb4P#summary)

Currently, players receive a 404 error when using the Home/Leave button in Felix Gaming games.
Investigation with Felix Gaming confirmed that they are correctly using the `lobbyUrl` parameter provided during game launch. The issue is that the configured `lobbyUrl` points to an invalid Alea redirect URL:
`https://play.aleaplay.com/redirect/v1/lobby?...`
This URL does not resolve to a valid destination, causing the redirect to fail.
Update the game launch configuration to pass a valid casino lobby URL as the `lobbyUrl` parameter so that players are redirected back to the casino lobby when exiting a game.

**Context:**
[https://share.zight.com/Qwumv05W](https://share.zight.com/Qwumv05W)

**Analytic Events:**
N/A

**Acceptance Criteria:**
  • A valid casino lobby URL is configured and passed as the `lobbyUrl` parameter during Felix Gaming game launch.
  • The configured `lobbyUrl` resolves successfully and does not return a 404 error.
  • When a player clicks the Home/Leave button in a Felix Gaming game, they are redirected to the casino lobby page.
  



**Additional Information:**
  • 

**ICE Score:** 32

## Page Content
Felix gaming provider,** clicking on the home icon **and then **leave button **(provider end) returns error message.[https://share.zight.com/d5uqdb4P#summary](https://share.zight.com/d5uqdb4P#summary)
Felix gaming provider,** clicking on the home icon **and then **leave button **(provider end) returns error message.[https://share.zight.com/d5uqdb4P#summary](https://share.zight.com/d5uqdb4P#summary)
