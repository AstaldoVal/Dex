# Matt Pocock skills (vendored subset)

Upstream: [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).

Pinned commit: `9603c1c` (2026-07-16 10:03:12 +0100).

Included for Dex:

- `skills/engineering/grill-with-docs`
- `skills/engineering/domain-modeling` (dependency of grill-with-docs)
- `skills/productivity/grilling` (dependency of grill-with-docs / grill-me)
- `skills/productivity/grill-me`

Working copies used by Cursor/Claude live under `.claude/skills/<name>/`.

Refresh:

```bash
# from a fresh clone of mattpocock/skills at a new commit
# re-copy the four skill folders into this tree, then re-copy into .claude/skills/
```
