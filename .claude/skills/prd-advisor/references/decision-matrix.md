# PRD Structure Decision Matrix

Use this to recommend sections based on product type, audience, and domain.

---

## Product Type × Audience

### MVP / Early-stage product

| Audience | Base Template | Must-Have | Recommended | Skip |
|----------|---------------|-----------|-------------|------|
| Dev | Peter Yang, Aakash core | Problem, Goals (output + inputs), Key Features, Launch plan | Non-goals, User stories | Impact Sizing Model, Narrative, Technical Requirements (unless critical) |
| Exec | Amazon PR/FAQ or Aha Presentation | Problem, Vision, Success metrics, Core features | Strategic alignment, Personas | Detailed Requirements, Acceptance criteria |

### Feature in existing product

| Audience | Base Template | Must-Have | Recommended | Skip |
|----------|---------------|-----------|-------------|------|
| Dev | Peter Yang, Aakash core | Problem, Goals, Requirements (user stories + P0/P1), Launch plan | Acceptance criteria, Non-goals | Full Background, Narrative, Impact Sizing |
| Cross-functional | Aha Agile PRD | Objective, Background, Features/Stories, UX link, Open questions | Constraints, Dependencies | Release planning sections |

### New product (beyond MVP)

| Audience | Base Template | Must-Have | Recommended | Skip |
|----------|---------------|-----------|-------------|------|
| Exec/Investors | Amazon PR/FAQ | Press release, External FAQs, Internal FAQs (TAM, demand) | Strategic narrative | Detailed Requirements |
| Dev | Aakash 14, ChatPRD | Problem, High Level Approach, Goals, Key Features, Key Flows, Launch Plan | Narrative, Solution Alignment, Key Logic | Impact Sizing (until validated) |

### Release planning

| Audience | Base Template | Must-Have | Recommended | Skip |
|----------|---------------|-----------|-------------|------|
| Cross-functional | Aha Release Requirements | Name, Target date, Status, Overview, Team, Features, Milestones, Dependencies | Personas, Strategic alignment | Detailed Requirements |

---

## Domain Adjustments

### B2B / SaaS
- Add: Technical Considerations, Data Requirements, Integration Points
- Emphasize: Non-functional requirements, Security, Scalability
- Templates: Aakash 14, Ofri Yehuda (Data Requirements, User flows)

### Enterprise
- Add: Compliance, Security, Data Storage & Privacy
- Emphasize: Assumptions, Dependencies, Risks
- Templates: ChatPRD (Technical Requirements), Ofri Yehuda

### Consumer / B2C
- Emphasize: User flows, Narrative, UX highlights
- Lighter: Technical specifications
- Templates: Peter Yang, ChatPRD (User Experience)

---

## Constraint-Based Overrides

### Speed to market (minimal doc)
- Base: Peter Yang
- Must-have only: Problem, Goals, Key Features (P0), Launch plan
- Skip: Narrative, Impact Sizing, Future Considerations, Appendix

### Experiment / A/B test
- Base: Peter Yang
- Must-have: Problem, Goals, Requirements (test experience), Launch plan with Success criteria, Eligibility, Test vs Control, Ramp plan
- Skip: Impact Sizing, Key Milestones table

### Regulatory / compliance
- Add: Data Storage & Privacy, Security Measures, Out of scope (explicit boundaries)
- Templates: ChatPRD Technical Requirements, Ofri Yehuda (Data Requirements, Out of scope)

---

## Template Sources (Summary)

| Template | Best For | Key Sections |
|----------|----------|--------------|
| Peter Yang | Features, experiments, lean | Problem, Goals, Requirements (P0/P1), Meeting notes, Launch plan, Appendix |
| Aakash core | Dev handoff | Problem, Goals, User stories, Functional Requirements, Acceptance criteria, Non-functional |
| Aakash 14 | Strategic features, B2B | Problem, Approach, Narrative, Goals, Metrics, Impact Sizing, Non-goals, Solution Alignment, Key Features, Future, Key Flows, Key Logic, Launch, Milestones |
| ChatPRD 6-section | Full product | Background, Objectives, Features, UX, Milestones, Technical |
| ChatPRD chat variant | Lean narrative | TL;DR, Goals, User Stories, Functional Requirements, UX, Narrative, Success Metrics, Technical, Milestones |
| Amazon PR/FAQ | Vision, investors | Press release, External FAQs, Internal FAQs |
| Aha Agile | Incremental delivery | Objective, Background, Features, UX, Constraints, Open questions |
| Aha Presentation | Exec alignment | 19 elements (Vision, Metrics, Personas, Use cases, Assumptions, etc.) |
| Aha Release | Release planning | Name, Date, Status, Overview, Team, Personas, Features, Milestones, Dependencies |
| Ofri Yehuda | Detailed spec | Overview, Success Criteria, Assumptions, Requirements, Data, User flows, Wireframes, Out of scope |
| Atlassian | Confluence-based | Objective, Success metrics, Assumptions + Options, Supporting docs, Open questions, Out of scope |
