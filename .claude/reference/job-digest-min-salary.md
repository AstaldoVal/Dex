# Job digest: minimum salary filter

## Purpose

User minimum: **7000 EUR per month** (84,000 EUR/year equivalent). Vacancies that **explicitly state** a lower salary are excluded (e.g. Careerwise Salesforce PM at £70K/yr).

## Implementation

- **Threshold:** `MIN_SALARY_EUR_YEAR = 84000` in `.scripts/job-search/job-search-utils.cjs`
- **Functions:** `parseSalaryToEurYear(description)`, `isBelowMinSalary(description)`
- **Rates (approximate):** GBP→EUR 1.18, USD→EUR 1.05 (no live FX)
- **Used in:** `generate-search-digest.cjs`, `teal-resume-match-score.cjs`, `teal-resume-batch-from-export.cjs`

## Behaviour

- Only excludes when salary is **stated in the job text**. If no salary is mentioned, the job is not excluded.
- Parsed formats: £70K/yr, £70,000, €60,000, $90,000, "70,000 Salary", ranges (uses higher bound).
- Example: £70,000/yr → ~82,600 EUR/year < 84,000 → excluded.

## Reference example

- **Careerwise — Salesforce Product Manager** (UK Remote): £70,000/yr → below 7k EUR/month equivalent → excluded.
