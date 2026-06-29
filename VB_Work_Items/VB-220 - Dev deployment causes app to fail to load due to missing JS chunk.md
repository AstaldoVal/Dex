# VB-220: Dev deployment causes app to fail to load due to missing JS chunk

## Properties
- State: Todo
- Priority: medium
- Identifier: VB-220
- Assignees: user://2e1d872b-594c-8163-9ff2-00026e4256a6, user://2e1d872b-594c-816d-ba9c-00022ce0a130
- Created By: user://2e1d872b-594c-8134-b843-0002f4e216ac
- Subscribers: user://2e1d872b-594c-8167-b7b7-000242cca160, user://2e1d872b-594c-8134-b843-0002f4e216ac
- Created on: 2026-04-13
- Updated on: 2026-05-12 08:46:29Z
- Notion URL: https://app.notion.com/342509790d9a818db227cc282023e98f

## Description
**Description:**
During deployment on Dev, user sees "Oops, an error occurred" and the app fails to load due to a ChunkLoadError.
**Context:**
https://share.zight.com/E0upoBw7
https://share.zight.com/nOux9rqN
https://share.zight.com/2NuOveGj
**Analytic events:**
N/A
**Acceptance Criteria:**
- During and right after deployment, the app must not fail to initialize due to missing or mismatched JS chunks.
- If a chunk mismatch happens, the user must be recovered automatically (for example by forcing a refresh or reloading assets) instead of being stuck on an error state.
**Additional details:**
- Type: Bug
- Created by: Tigran
- UX/UI impact: Yes
**Additional information:**
Environment: Dev  
Reproducibility: During deployments / intermittent  
Error details: ChunkLoadError, "Unexpected token '<'" (chunk URL returns HTML instead of JS)
**ICE score:**
48

## Page Content
(Body not retrieved: page fetch resolved to a different record. Description above is complete and authoritative.)
