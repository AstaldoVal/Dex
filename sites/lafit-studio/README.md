# LA Fit Studio, concept site

Static single page, no build step. Concept rebuild of lafit.studio that keeps the studio's own design (Cormorant Garamond + Inter, the purple palette, 2px corners, hero photo with Ken Burns, eyebrows, italic accent words, glyph icons, loader, lux.js motion) and adds:

- one-screen weekly timetable with filters, today highlighted, past classes dimmed (Lisbon time)
- next-class widget in the hero
- prices on the home page (single, multipass, kids, online)
- one booking path: studio classes go to Gymcatch, Cliffside and kids go to WhatsApp, as on the live site
- coaches, first-visit steps, FAQ
- schema.org HealthClub with offers and opening hours, plus FAQPage
- EN / RU / UA / PT on one page, auto-picked from the browser language

`noindex` is set on purpose (meta tag + X-Robots-Tag header). Timetable and prices were taken from the class pages on lafit.studio in November 2026; edit the `S` and `C` arrays in `index.html` when they change.

The Gymcatch web embed is not included because it only works on a domain registered in the Gymcatch portal. On lafit.studio it can go back under the timetable.

Deploy: `npx vercel deploy sites/lafit-studio --prod`, or import the repo in Vercel with Root Directory `sites/lafit-studio`, framework preset Other.
