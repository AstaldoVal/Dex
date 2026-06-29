---
name: job-search-igaming-step10
description: Step 10 Teal apply for iGaming PM/PO vacancies — skills hygiene, tone bullets, eval gates. Use when running teal-apply on packages with jd_themes igaming or iGaming skills_add.
---

# iGaming step 10 (Teal apply)

## When to use

Cowork `feedback.json` for **iGaming / aggregator / casino B2B** roles (`meta.jd_themes` includes `igaming`, or `skills_add` targets **iGaming & Compliance**).

`enrichApplyForStep10()` runs automatically when loading feedback — do not hand-edit the same rules per package unless Cowork output is wrong.

## Automatic hygiene (code)

| Issue | Behavior |
|--------|----------|
| **Figma / UI junk in iGaming & Compliance** | `skills_remove` gets Figma, Lucidchart, etc.; `pruneNonDomainChipsFromIgamingCategory` + `finalizeIgamingCategoryHygiene` after skills apply |
| **Curacao + Curaçao both on** | `canonicalSkillNormKey` + dedupe; `resolveCuracaoLicenseDuplicates` keeps ASCII **Curacao** |
| **Held / Acted as tone** | Pin-Up **Held vertical…**: `work_experience` toggle off + `bullets_add` with **Owned vertical…** (replace-bullet often misses DOM); other soft verbs via `buildToneRewrites()` |
| **Substack / GitHub header** | `contact_header.omit_substack_github: true` (set in feedback or deferred mention) |

## Run apply

From `Development/DEX`:

```bash
node .scripts/job-search/run-job-search-watched.cjs --flow step10 --step 10 --stage apply \
  --run-key <unique> --stall-ms 120000 -- \
  node .scripts/job-search/teal-apply-resume-feedback.cjs \
  --package-dir "00-Inbox/Job_Search/teal/cowork-review/<package>" \
  --export-pdf
```

- One Chrome profile per `--run-key` (never shared `pkill` on all profiles).
- Success = log contains **`step-10-eval PASS`** (live Teal extract, not offline-only).

## Eval gates (fail = fix and re-run)

- Figma enabled under iGaming & Compliance
- Curacao and Curaçao both enabled in iGaming
- Pin-Up enabled bullet still starts with `Held vertical performance`
- 16 domain skills from `skills_add` ON in iGaming only (not PM / AI)

## Regression test

```bash
node .scripts/job-search/test-igaming-hygiene.cjs
node .scripts/job-search/test-cowork-feedback-pipeline.cjs
```

## Files

- `resume-feedback-utils.cjs` — `enrichIgamingApplyHygiene`, `IGAMING_STANDARD_BULLET_REWRITES`
- `teal-resume-skills.cjs` — `finalizeIgamingCategoryHygiene`, `resolveCuracaoLicenseDuplicates`
- `teal-apply-deferred-v1.cjs` — tone rewrites + heal cleanup
- `step-10-eval.cjs` — `verifyIgamingCategoryHygiene`, `verifyIgamingToneBullets`
