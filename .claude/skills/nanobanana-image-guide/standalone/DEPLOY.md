# Deploy to external guide

This folder is **self-contained** and ready to deploy as a standalone guide (Notion, Confluence, GitHub repo, custom site, etc.).

## What to copy

Copy the entire **standalone** folder. It includes:

- `README.md` — main entry point with installation for all vendors
- `SKILL.md` — for Cursor/Manus (skills)
- `Image_Guide_Playbook.md` — universal playbook for pasting/attaching
- `platforms/` — vendor-specific instructions (Cursor, Claude, Gemini, OpenClaw)
- `SOURCES.md` — attribution
- `DEPLOY.md` — this file

## Deployment options

1. **GitHub repo:** Create a repo, copy the folder contents to the root (or a `guide/` subfolder). README.md becomes the repo README.

2. **Notion/Confluence:** Create a page, paste README.md as the main content. Add child pages for each platform under `platforms/`, or paste the relevant Custom_Instructions/README content.

3. **Custom site / docs:** Use README.md as the landing page. Link to `platforms/<vendor>/` for vendor-specific install steps.

4. **Direct share:** Zip the folder and share. Recipients follow README.md for their platform.

## After deployment

When you have the deployment URL (e.g. `https://your-guide.example.com/nanobanana-image-guide`), you can:
- Update any internal links if the structure changes
- Add the URL to README.md as "Live guide: …" for easy access
