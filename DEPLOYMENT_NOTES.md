# Deployment Notes — POS App

Notes from the session that deployed the backend to Google Cloud Run and the frontend to Firebase Hosting. Written as a learning record, not polished docs.

## Final state

- **Backend (Express, OTP service):** https://pos-api-481588556736.asia-east1.run.app (Cloud Run, region `asia-east1`)
- **Frontend (Vite SPA):** https://minipos-d9d92.web.app (Firebase Hosting, project `minipos-d9d92`)

## Part 1 — Backend to Cloud Run

### Files involved
- `server/Dockerfile` — container recipe (Node 20 alpine, `npm ci --omit=dev`, runs `node server.js` on port 8080)
- `server/.dockerignore` — files excluded from the image
- `server/package.json` — server dependencies

### Commands run

```bash
# From server/ directory — generate the lock file that npm ci needs
cd server
npm install

# Deploy. Run from INSIDE server/ with --source .
gcloud run deploy pos-api --source . --region asia-east1
```

### Issues hit and what they meant

**Issue 1: `build step 0 "gcr.io/cloud-builders/docker" failed: step exited with non-zero status: 1`**

Root cause: the Dockerfile uses `npm ci --omit=dev`. `npm ci` is the "clean install" command — it refuses to run unless a `package-lock.json` exists, because its whole purpose is reproducible installs from a locked dependency tree. `server/` didn't have a lock file.

Fix: `cd server && npm install` once locally → generated `package-lock.json` → committed it to the build context → next deploy worked.

Lesson: if you ever switch a Dockerfile to use `npm install` instead, builds get non-reproducible (devs might end up with different transitive versions). Keep `npm ci` and keep the lock file.

**Issue 2: `ERROR: (gcloud.run.deploy) could not find source [./server]`**

Root cause: I was already `cd`'d into `server/`, then ran `gcloud run deploy ... --source ./server`. That resolves to `server/server/`, which doesn't exist.

Fix: when running from inside `server/`, use `--source .`. When running from the project root, use `--source ./server`. Either works.

### About `.dockerignore`

Added belt-and-suspenders patterns for credential files: `*serviceAccount*.json`, `*.pem`, `*.key`. The image already excluded `serviceAccountKey.json` by name, but broader patterns protect against future filename variants.

### About Firebase Admin credentials on Cloud Run

`serviceAccountKey.json` is **not** in the image (good — credentials in container images are a leak waiting to happen). On Cloud Run, `firebase-admin` auto-discovers credentials via Application Default Credentials, using the Cloud Run runtime service account's IAM permissions. That's why OTP writes to Firestore work without us configuring anything explicitly.

### Verifying the deploy

```bash
# Service exists?
gcloud run services list

# Hit the root
curl -i https://pos-api-481588556736.asia-east1.run.app/
# Expected: HTTP 404 "Cannot GET /" with x-powered-by: Express header.
# That's HEALTHY — means the container is up and Express is responding.
# The 404 is because we only defined POST /api/send-otp and POST /api/verify-otp.

# Live log stream (run in a separate terminal during testing)
gcloud run services logs tail pos-api --region asia-east1
```

## Part 2 — Testing local frontend against the remote backend

Goal: confirm the deployed Cloud Run service works before deploying the frontend on top of it.

### Vite env file precedence (highest priority wins)
1. `.env.development.local`
2. `.env.local`
3. `.env.development`
4. `.env`

Files are **merged**, not replaced. Only the specific variables defined in higher-priority files override the lower ones.

### What we did

Created `.env.development.local`:
```
VITE_SERVER_URL=https://pos-api-481588556736.asia-east1.run.app
```

Then restarted `npm run dev` (Vite only reads env files on startup, not on hot reload).

Verified by opening browser DevTools → Network tab → triggering signup → confirmed the `/api/send-otp` request went to the Cloud Run URL, not localhost.

Ran the full signup flow end to end:
- Email arrived ✓
- `/api/verify-otp` returned 200 ✓
- Firebase Auth account created ✓

To go back to local backend: delete `.env.development.local`. `.env` (pointing at `localhost:3000`) takes over again.

## Part 3 — Frontend to Firebase Hosting

### Files involved
- `firebase.json` — added a `hosting` block
- `.firebaserc` — already pointed at project `minipos-d9d92`

### The `hosting` block we added

```json
"hosting": {
  "public": "dist",
  "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
  "rewrites": [
    { "source": "**", "destination": "/index.html" }
  ]
}
```

**`public: "dist"`** — the folder Firebase uploads. Vite's build output folder is `dist/`. The field is named `public` (Firebase's term for "the public-facing files"), but the value is build-tool-specific. CRA would be `"build"`. Next.js export would be `"out"`.

**`ignore`** — standard boilerplate. Don't upload the config file itself, dotfiles like `.DS_Store`, or `node_modules` (dependencies are already bundled into `dist/`).

**`rewrites`** — for SPAs only. Says: "for any URL path, serve `index.html`." Without this, deep links like `/dashboard` would 404 because there's no `dashboard.html` file. Your JS handles routing after `index.html` loads.

### Commands run

```bash
# Verify CLI is installed and you're authed
firebase --version
firebase projects:list

# Build the production bundle
npm run build
# Output goes to dist/. Reads .env.production, so the bundle has the Cloud Run URL baked in.

# Deploy
firebase deploy --only hosting
```

### About the bundle size warning

Vite warned that `index-*.js` is over 500 kB. Most of it is the Firebase SDK. Gzipped (260 kB on the wire), it's fine for now. Code-splitting can wait until there's a reason to optimize.

## Part 4 — Environment variables: how each side gets its secrets

Two completely separate mechanisms — they happen to share a `.env` file in local dev, but in production they have nothing to do with each other.

### Frontend: `VITE_*` vars are inlined at build time

When you run `npm run build`, Vite does this:

1. Reads env files in order of precedence: `.env.production.local` → `.env.production` → `.env.local` → `.env` (higher overrides lower; files are merged, not replaced).
2. Scans your source code for every reference to `import.meta.env.VITE_*`.
3. **Literally substitutes the variable with the string value** before writing the output to `dist/assets/*.js`.

So `import.meta.env.VITE_FIREBASE_API_KEY` becomes the actual key string `"AIzaSyBU9..."` baked directly into the minified JS bundle. After deploy, anyone visiting the site can open DevTools → Sources and see it. That's expected for Firebase web apps — the API key identifies the project, not the user. Real security comes from Firestore Rules + Firebase Auth.

**Critical detail:** only variables prefixed with `VITE_` are exposed to the frontend. Vite refuses to inline anything else. That's why `EMAIL_USER` and `EMAIL_PASS` (which live in the same `.env`) never reach the browser bundle — they don't have the prefix, so Vite ignores them entirely.

In our case the relevant vars are:
- `VITE_FIREBASE_API_KEY` — used by `src/firebase.js` to initialize the Firebase Web SDK
- `VITE_SERVER_URL` — used by signup code to know where to POST OTP requests (set in `.env.production` to the Cloud Run URL)

Build-time means: once `dist/` is built, the values are frozen. Changing `.env` after the build does nothing — you have to rebuild.

### Backend: secrets are injected as Cloud Run environment variables at deploy time

The Express server reads `process.env.EMAIL_USER` and `process.env.EMAIL_PASS` inside `server/emailServices.js` to authenticate with Gmail SMTP. These vars must exist in the running container's environment.

Locally, they come from `.env` (loaded via `dotenv`). On Cloud Run, `.env` is **not** in the image (excluded by `.dockerignore`), so we have to inject them at deploy time using `--set-env-vars`:

```bash
# From inside server/
gcloud run deploy pos-api \
  --source . \
  --region asia-east1 \
  --set-env-vars EMAIL_USER=youremail@gmail.com,EMAIL_PASS="abcd efgh ijkl mnop"
```

Cloud Run stores these on the service definition and injects them into `process.env` every time a container instance boots. Once set, they persist across redeploys unless you change them.

Useful follow-up commands:

```bash
# Inspect what env vars are currently set on the service
gcloud run services describe pos-api --region asia-east1 --format="value(spec.template.spec.containers[0].env)"

# Update just one variable without redeploying source
gcloud run services update pos-api --region asia-east1 \
  --update-env-vars EMAIL_PASS="new app password here"

# Remove a variable
gcloud run services update pos-api --region asia-east1 --remove-env-vars OLD_VAR
```

For more sensitive secrets later (e.g. a payment-provider key), graduate to **Google Secret Manager** + `--set-secrets` instead of `--set-env-vars`. That keeps the secret out of the service YAML and lets you rotate it without touching the deploy command.

### Summary table

| Variable          | Where it's used        | How it reaches production           |
|-------------------|------------------------|-------------------------------------|
| `VITE_FIREBASE_API_KEY` | Frontend (`src/firebase.js`) | Inlined into `dist/` at `npm run build` |
| `VITE_SERVER_URL` | Frontend (signup OTP fetch)  | Inlined into `dist/` at `npm run build` (from `.env.production`) |
| `EMAIL_USER`      | Backend (`emailServices.js`) | Cloud Run env var via `--set-env-vars` at `gcloud run deploy` |
| `EMAIL_PASS`      | Backend (`emailServices.js`) | Cloud Run env var via `--set-env-vars` at `gcloud run deploy` |

## Loose ends to revisit

- **CORS** — backend currently sends `Access-Control-Allow-Origin: *`. Now that there's a real frontend origin (`https://minipos-d9d92.web.app`), tighten this to that one origin in `server/server.js`.
- **`CLAUDE.md`** — the "Known gaps" section still says backend URL is hardcoded to `localhost:3000`. That's no longer true; the frontend reads `VITE_SERVER_URL` from env. Update it.
- **Switching dev back to local backend** — delete `.env.development.local` when done testing against the deployed backend.
- **Custom domain** — Firebase Hosting also gave you `https://minipos-d9d92.firebaseapp.com`. Both are free. A custom domain (e.g. `app.yourdomain.com`) requires DNS setup in the Firebase console.

## Mental model recap

```
Browser
  ↓ HTTPS
Firebase Hosting (CDN, serves dist/index.html + JS + CSS)
  ↓ JS bundle loads, executes
  ↓ Direct Firebase SDK calls (Auth, Firestore reads/writes)  ──→  Firebase
  ↓ fetch() to VITE_SERVER_URL for OTP                          ──→  Cloud Run (Express)
                                                                      ↓ Nodemailer
                                                                      ↓ firebase-admin (ADC)
                                                                      ↓ Firestore /otps
```

Two backends in play:
- **Firebase** — direct from browser, used for everything except OTP. Auth handled by Firestore Rules (the `ownerId == request.auth.uid` checks).
- **Cloud Run (Express)** — only touched during signup, to gate Firebase account creation behind email-OTP verification. The OTP never reaches the browser.
