---
name: task-bundle-job_search
description: Router category `job_search` — read .claude/reference/task-skill-bundles.md then only listed paths.
---

# Task bundle: job_search

1. Read `.claude/reference/task-skill-bundles.md` and find the section `### job_search`.
2. `Read` each repository path listed there that matches the user task (do not load unrelated packages).
3. Deeper material under `Skills_library/` is loaded only when the map or the user points you there.

Canonical router: `.cursor/rules/dex-task-skill-router.mdc`.
