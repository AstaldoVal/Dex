# VB-379: Improve Visibility of Aggregator Issues in Better Stack Monitoring

## Properties
- State: Todo
- Priority: medium
- Identifier: VB-379
- Assignees: user://2e1d872b-594c-8163-9ff2-00026e4256a6
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Updated on: 2026-05-25T08:34:02.580Z
- Notion URL: https://app.notion.com/p/364509790d9a80e4b727fefcf212abd2

## Description
**Description:**
Enhance observability in Better Stack to ensure aggregator-related issues are clearly visible, quickly identifiable, and easy to debug.
Currently, aggregator failures or degraded performance are not sufficiently highlighted, making it difficult to detect issues in real time. The goal is to improve logging, alerting, and dashboard visibility for aggregator workflows.
Scope of work:
• Ensure aggregator errors are properly logged with consistent structure
• Add or improve alerts for:
    ◦ Increased error rates
    ◦ Latency spikes
    ◦ Failed aggregation jobs
• Improve tagging/labels so aggregator issues can be filtered easily in Better Stack
• Create or update a dedicated dashboard/section for aggregator health
• Validate that alerts trigger correctly in test scenarios

**Context:**
N/A

**Analytic Events:**
N/A

**Acceptance Criteria:**
  • Aggregator errors are clearly visible in Better Stack logs with consistent metadata
  • Alerts are triggered for predefined error and latency thresholds
  • A dedicated view or filter exists for aggregator-related logs/metrics
  • Dashboard shows key health metrics (errors, latency, success rate)
  • A test failure scenario successfully triggers an alert end-to-end


**Additional Information:**
  • 

**ICE Score:**  67

## Page Content
(No additional page body content.)
