# VB-200: Send Purchase Outcome (e.g., Rejected) to SEON for Rule Evaluation

## Properties
- State: Backlog
- Priority: none
- Identifier: VB-200
- Created By: user://2e1d872b-594c-8134-b843-0002f4e216ac
- Created on: 2026-04-06
- Updated on: 2026-04-14T15:34:10.126Z
- Notion URL: https://app.notion.com/342509790d9a81429bf7ed9837d45681

## Description
**Description:**
Enable sending purchase outcome data (e.g., rejected/failed payments) from Finix to SEON after the transaction result is received. This allows SEON to use real transaction outcomes for rule evaluation, fraud scoring, and future decisioning.
**Context:**
N/A
**Analytic events:**
N/A
**Acceptance Criteria:**
- System retrieves purchase result (e.g., success, rejected) from Finix
- Purchase outcome is sent to SEON after transaction completion
- SEON receives and processes the outcome for rule evaluation
- Mapping between Finix statuses and SEON fields is clearly defined
- No impact on existing payment flow or performance
- Errors in sending data to SEON are logged and do not block the user flow
- Data is consistently sent for all relevant transactions
**Additional details:**
- Type: Feature Improvement
- Created by: Olga
- UX/UI impact: Yes
**Additional information:**
N/A
**ICE score:**
27

## Page Content
(No additional page body content.)
