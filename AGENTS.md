# AGENTS.md

## Commands

- `npm run dev` — Vite frontend (`:5173`) + Express backend (`:3000`) concurrently
- `npm run client` / `npm run server` — individual dev servers
- `npm run build` — production build to `dist/`
- No tests, linter, or formatter configured

## Architecture

**Vanilla JS + Vite SPA** (no React/Vue/Angular). Express backend is OTP-only — all data/auth goes direct to Firebase from the browser.

**Entrypoint:** `src/main.js` registers `onAuthStateChanged`. Two states:
- Signed out → show `#setup-wizard`, route to `signUp` view
- Signed in → call `initLoggedInApp(user)` (guarded by `initialized` flag) which calls:
  `renderLoggedInState`, `initInsights`, `initOrderHistory`, `initInventoryUpdate`, `initManageItem`, `initBarcodeGenerator`, `initCustomerCheckout`, `initClock`

`renderLoggedInState(user)` (in `loggedIn-user.js`) additionally sets up the item grid, search, barcode listener, order form, and profile — these are not in individual `init*` modules.

**Modules** (`src/*.js`) expose `init*` functions, communicate via direct ES6 imports. No event bus, no store.

## Key constraints (easy to miss)

- **`src/firebase.js` is the ONLY point of contact** for Firestore/Auth. No other module reads/writes Firebase directly.
- **No `innerHTML` with user/DB data.** Use `createElement` + `textContent` + `appendChild` only (XSS mitigation, commit `e58a910`).
- **`search_item.js` owns the canonical `allItems` array.** `order-add_item.js` and `inventory_update.js` import from it — do not reintroduce parallel caches. Note: `barcode-generator.js` has its own local `allItems` (legacy deviation).
- **`search_item.js` owns the global USB barcode-scanner listener** — rapid keystrokes + Enter = SKU scan, unless user is in a form field.
- **All money is IDR**, stored as raw numbers in Firestore. Format via `src/formatRupiah.js` (`Intl.NumberFormat('id-ID')`).

## Firebase

- Client reads/writes use `ownerId == user.uid` for tenant isolation. `firestore.rules` enforces this server-side.
- Collections: `/users/{uid}`, `/inventory/{docId}`, `/orders/{docId}`, `/customers/{docId}`. `/otps/{email}` is admin-SDK only (denied to clients in rules).
- Order submission uses `writeBatch()` to atomically create order + decrement stock via `increment()`.
- Composite indexes live in `firestore.indexes.json`. New collections need entries in both the client query and the indexes file.

## Auth & OTP

- Sign-up: email + 6-digit OTP, verified server-side. The OTP never reaches the frontend.
- Frontend reads backend URL from `VITE_SERVER_URL` (`import.meta.env.VITE_SERVER_URL`). `.env` → localhost:3000, `.env.production` → Cloud Run URL.
- Server endpoints rate-limited via `express-rate-limit` (5/15min send, 10/15min verify).

## HTML/CSS

- All HTML in `index.html` (~42KB), including `<template>` elements cloned via `content.cloneNode(true)`.
- CSS per-feature in `styles/` + `variables.css` for design tokens.
- Modal show/hide: class-toggle `is-active`/`is-hidden` with CSS keyframe animations.

## Third-party libs (module-scoped)

- **Chart.js** — only `src/sales_insight.js`
- **JsBarcode + html2canvas** — only `src/barcode-generator.js`
- Don't pull these into other modules without factoring out shared setup.

## CI/CD (triggers + auth)

| Trigger | Deploys | Auth method |
|---|---|---|
| Push to `main` touching `server/**` | Cloud Run (`pos-api`) via `deploy-backend.yml` | WIF (OIDC → ADC) |
| Push to `main` touching frontend files | Firebase Hosting via `deploy-frontend.yml` | Firebase service account key JSON |
| PR to `main` touching frontend files | Preview channel + comment via `deploy-frontend.yml` | Firebase service account key JSON |

Frontend build needs `VITE_FIREBASE_API_KEY` as a GitHub secret — it's inlined at build time.

## Related files

- `CLAUDE.md` — prior instruction file (overlapping content, keep in sync)
- `DEPLOYMENT_NOTES.md` — full deployment walkthrough
- `.claude/skills/` — task-specific skills for landing page, modals, etc.
- `docs/firestore-setup.md` — initial Firestore project setup
- `improvement.txt`, `RED-FLAG_DOCS.txt` — scratch notes, not authoritative
