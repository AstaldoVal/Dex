# VIP loyalty prototype

Low-fidelity clickable prototype for the VIP loyalty test assignment. Source wireframes: `04-Projects/VIP_Loyalty_Test_Assignment/04_lowfi_prototype.md` in the Dex repository.

## What is included

- **Player:** VIP Hub (progress, benefits, rules, next milestone), VIP levels and benefits, tier upgrade modal
- **Support and admin:** VIP player card, manual review queue (static table and filter demo)

No backend, no real data. English UI to match the wireframe labels in the document.

## Commands

```bash
cd apps/vip-loyalty-prototype
npm install
npm run dev
```

Production build:

```bash
npm run build
npm start
```

## Deploy (Vercel)

From this directory:

```bash
npx vercel deploy --prod --yes
```

## Tech

- Next.js (App Router), React, TypeScript
- Global CSS and CSS modules (no component library)
