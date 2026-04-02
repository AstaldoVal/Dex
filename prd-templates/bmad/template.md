# Product Requirements Document: {{project_name}}

**SOURCE:** .claude/config/bmad/templates/prd.md (BMAD Method v6 - Dex)
**ORIGINAL:** Yes

---

**Date:** {{date}}
**Author:** {{user_name}}
**Version:** 1.0
**Project Type:** {{project_type}}
**Project Level:** {{project_level}}
**Status:** Draft

---

## Document Overview

This Product Requirements Document (PRD) defines the functional and non-functional requirements for {{project_name}}. It serves as the source of truth for what will be built and provides traceability from requirements through implementation.

**Related Documents:**
- Product Brief: {{product_brief_path}}

---

## Executive Summary

{{executive_summary}}

---

## Product Goals

### Business Objectives

{{business_objectives}}

### Success Metrics

{{success_metrics}}

---

## Functional Requirements

Functional Requirements (FRs) define **what** the system does - specific features and behaviors.

Each requirement includes:
- **ID**: Unique identifier (FR-001, FR-002, etc.)
- **Priority**: Must Have / Should Have / Could Have / Won't Have (MoSCoW)
- **Description**: What the system should do
- **Acceptance Criteria**: How to verify it's complete

---

{{functional_requirements}}

---

## Non-Functional Requirements

Non-Functional Requirements (NFRs) define **how** the system performs - quality attributes and constraints.

---

{{non_functional_requirements}}

---

## Epics

Epics are logical groupings of related functionality that will be broken down into user stories during sprint planning (Phase 4).

Each epic maps to multiple functional requirements and will generate 2-10 stories.

---

{{epics}}

---

## User Stories (High-Level)

User stories follow the format: "As a [user type], I want [goal] so that [benefit]."

These are preliminary stories. Detailed stories will be created in Phase 4 (Implementation).

---

{{user_stories}}

---

## User Personas

{{user_personas}}

---

## User Flows

{{user_flows}}

---

## Dependencies

### Internal Dependencies

{{internal_dependencies}}

### External Dependencies

{{external_dependencies}}

---

## Assumptions

{{assumptions}}

---

## Out of Scope

{{out_of_scope}}

---

## Open Questions

{{open_questions}}

---

## Approval & Sign-off

### Stakeholders

{{stakeholders}}

### Approval Status

- [ ] Product Owner
- [ ] Engineering Lead
- [ ] Design Lead
- [ ] QA Lead

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {{date}} | {{user_name}} | Initial PRD |

---

## Appendix A: Requirements Traceability Matrix

| Epic ID | Epic Name | Functional Requirements | Story Count (Est.) |
|---------|-----------|-------------------------|-------------------|
{{traceability_matrix}}

---

## Appendix B: Prioritization Details

{{prioritization_details}}
