# Forbidden tools (project rules)

Tools and approaches that must **not** be used in this project. Check this file before adding automation or suggesting solutions.

---

## Playwright / browser automation on LinkedIn

**Rule:** Do not use Playwright, Puppeteer, Selenium, or any headless/automated browser to open, navigate, or scrape LinkedIn.

- Applies to: linkedin.com (job view pages, job search, login, any LinkedIn UI).
- Reason: User requirement; automation on LinkedIn is not allowed.
- Allowed instead:
  - Dex Chrome extension only: user opens the open-links page (or retry page) in their real browser; extension captures job pages and POSTs to the local server.
  - Scripts that serve HTML (e.g. `generate-digest-open-links.cjs --serve`) and open a URL in the default browser via `open -a "Google Chrome"` (or `open`) are fine.
  - Scripts that process exported/captured data (inject into digest, filter from JSON) are fine.
- Script name note: `fetch-job-descriptions.cjs` does **not** use Playwright on LinkedIn; it only starts the server and opens the open-links/retry URL in the user's browser.

---

## Adding entries

Add new forbidden tools here with: what is forbidden, scope, reason, and what to use instead.
