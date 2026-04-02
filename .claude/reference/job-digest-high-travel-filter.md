# Job digest: high-travel filter (Molex-style)

## Purpose

User does not consider roles that require traveling 40%+ of the time (e.g. "50% travel", "50% of the time"). Example: Molex and similar positions where the job requires being on the road half the time.

## Reference vacancy (canonical example)

- **Molex — Product Manager** (Bavaria, Germany): [LinkedIn 4349449717](https://www.linkedin.com/jobs/view/4349449717/)
- Текст: *"Location: Remote, with the opportunity to travel up to 50% of the time. Central Europe is preferred."*
- Такие вакансии отфильтровываются по паттерну «travel up to 50% of the time».

## Implementation

- **Function:** `requiresHighTravel(title, description)` in `.scripts/job-search/job-search-utils.cjs`
- **Used in:** `generate-search-digest.cjs`, `teal-resume-match-score.cjs`, `teal-resume-batch-from-export.cjs`

## Detected patterns

- Percentage + travel: "50% travel", "up to 50% travel", "40% travel", "travel 50%", "travel up to 60%"
- "X% of the time" in travel context (within ~80 chars of "travel/traveling/travelling")
- Phrases: "extensive travel", "significant travel", "heavy travel", "frequent travel", "substantial travel"
- Threshold: 40% and above (40–100%) triggers exclusion

## Digest stats

In search digest funnel, excluded jobs are counted as "Убрано высокие поездки (40%+ travel)".
