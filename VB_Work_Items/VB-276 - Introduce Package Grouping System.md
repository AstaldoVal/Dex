# VB-276: Introduce Package Grouping System

## Properties
- State: Todo
- Priority: medium
- Identifier: VB-276
- Assignees: user://2e1d872b-594c-816d-ba9c-00022ce0a130, user://2e1d872b-594c-8167-b7b7-000242cca160
- Created By: user://2e1d872b-594c-814a-900e-0002d08138f0
- Updated on: 2026-05-12 08:46:32Z
- Notion URL: https://app.notion.com/34b509790d9a8060b046cb828c2932e7

## Description
Description:
Introduce a package grouping system at the database level to replace the current logic of identifying starter packs via slug comparison.
Each package should be assigned to a predefined group (e.g., starter-pack, store-package, etc.). All existing logic that depends on identifying starter packs should be updated to use this new grouping instead of slug-based checks.
This approach will make the system more scalable and support future experiments across different package types.

Context:
N/A

Analytic Events:
N/A

Acceptance Criteria:
  • A new package group field is added to the packages collection.
  • Packages can be assigned to predefined groups (e.g., starter-pack, store-package).
  • All logic that detects starter packs is updated to use package group instead of slug.
  • Existing starter pack packages are correctly mapped to the new group.
  • System supports adding new groups for future  packages.


Additional Information:
  • 

ICE Score: 53

## Page Content
(No additional page body content.)
