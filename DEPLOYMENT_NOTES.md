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
# --set-env-vars injects the Gmail SMTP creds into the Cloud Run runtime so
# Nodemailer can authenticate. .env is excluded from the image by .dockerignore,
# so without this flag the backend boots but every OTP send fails.
# (Full explanation of how env vars reach each side lives in Part 4.)
gcloud run deploy pos-api \
  --source . \
  --region asia-east1 \
  --set-env-vars EMAIL_USER=youremail@gmail.com,EMAIL_PASS="abcd efgh ijkl mnop"
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
## CI/CD Automation Steps

Walkthrough of every command run to wire up GitHub Actions → Workload Identity Federation → Cloud Run + Firebase Hosting. Two workflow files end up in `.github/workflows/` that fire on push based on which paths changed.

### Step 1 — Pre-flight checks

```bash
gcloud config get-value project
```
Confirms which GCP project `gcloud` will target. Every later command uses `--project=minipos-d9d92`, so we verify it matches the Firebase project.

```bash
gcloud auth list
```
Confirms which Google account `gcloud` is authenticated as. Needs to be the project owner (or have IAM Admin + Service Account Admin) for the next steps to work.

### Step 2a — Enable required APIs

```bash
gcloud services enable \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  --project=minipos-d9d92
```
Turns on the three APIs WIF depends on:
- `iamcredentials` — mints the short-lived tokens GitHub will exchange for.
- `cloudresourcemanager` — required to add project-level IAM bindings.
- `iam` — required to create the service account, pool, and provider.

### Step 2b — Create the deploy service account and grant roles

```bash
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Actions Deployer" \
  --project=minipos-d9d92
```
Creates the identity GitHub will impersonate. Email becomes `github-deployer@minipos-d9d92.iam.gserviceaccount.com`. No JSON key generated — that's the point of WIF.

```bash
for role in \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.writer \
  roles/firebasehosting.admin
do
  gcloud projects add-iam-policy-binding minipos-d9d92 \
    --member="serviceAccount:github-deployer@minipos-d9d92.iam.gserviceaccount.com" \
    --role="$role" \
    --condition=None
done
```
Binds the 5 roles `github-deployer` needs across both pipelines:

| Role | Purpose |
|---|---|
| `roles/run.admin` | Create/update the `pos-api` Cloud Run service |
| `roles/iam.serviceAccountUser` | Act as the Cloud Run runtime SA during deploy |
| `roles/cloudbuild.builds.editor` | Build the container via Cloud Build |
| `roles/artifactregistry.writer` | Push the built image to Artifact Registry |
| `roles/firebasehosting.admin` | Deploy `dist/` to Firebase Hosting |

```bash
gcloud projects get-iam-policy minipos-d9d92 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:github-deployer@minipos-d9d92.iam.gserviceaccount.com" \
  --format="value(bindings.role)"
```
Verification command. Prints just the role names bound to `github-deployer` — should show exactly 5 lines.

### Step 2c — Create the Workload Identity Pool and OIDC Provider

```bash
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions Pool" \
  --project=minipos-d9d92
```
Creates the pool — a container that holds external identity providers. `location=global` is fixed (pools aren't regional).

```bash
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub Actions Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == 'Jonathanhelga'" \
  --project=minipos-d9d92
```
Creates the OIDC provider inside the pool:
- `--issuer-uri` — trusts tokens signed by GitHub's official OIDC endpoint.
- `--attribute-mapping` — extracts the GitHub claims we'll use in IAM (subject, repository, repo owner).
- `--attribute-condition` — security guard: only mints tokens for repos owned by `Jonathanhelga`. Without this, any GitHub repo could potentially exchange tokens against the pool.

### Step 2d — Allow the GitHub repo to impersonate `github-deployer`

```bash
PROJECT_NUM=481588556736
REPO=Jonathanhelga/Small-Business-POS
MEMBER="principalSet://iam.googleapis.com/projects/${PROJECT_NUM}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${REPO}"
SA=github-deployer@minipos-d9d92.iam.gserviceaccount.com
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="$MEMBER" \
  --project=minipos-d9d92
```
The final WIF wire-up. Binds the `iam.workloadIdentityUser` role on the service account, scoped to OIDC tokens whose `repository` attribute equals `Jonathanhelga/Small-Business-POS`. Other repos can't impersonate.

**Why the shell-variable form:** zsh's bracketed-paste was mangling the long `principalSet://...` URL when passed inline. Building the URL out of short variables sidesteps the paste problem.

### Step 3 — Firebase Hosting auth

No commands. Skipped on purpose — because `github-deployer` already has `roles/firebasehosting.admin` from Step 2b, the same WIF-issued token deploys both Cloud Run and Firebase Hosting. No separate `firebase login:ci` token needed.

### Step 4 — Add GitHub Secrets and Variables

UI work only — done via `https://github.com/Jonathanhelga/Small-Business-POS/settings/secrets/actions`. Values added:

**Variables tab** (not sensitive, just IDs):
- `GCP_PROJECT_ID` = `minipos-d9d92`
- `GCP_PROJECT_NUMBER` = `481588556736`
- `GCP_WIF_PROVIDER` = `projects/481588556736/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- `GCP_SERVICE_ACCOUNT` = `github-deployer@minipos-d9d92.iam.gserviceaccount.com`

**Secrets tab** (masked in logs):
- `VITE_FIREBASE_API_KEY` — from local `.env`, injected at build time so `src/firebase.js` can initialize.
- `EMAIL_USER` — Gmail address for Nodemailer.
- `EMAIL_PASS` — Gmail app password (contains spaces — handled via `env:` block in the workflow).

`VITE_SERVER_URL` is **not** in secrets because `.env.production` is committed to git — Vite picks it up automatically at build time.

### Step 5 — Backend workflow file

Created `.github/workflows/deploy-backend.yml`. Triggers on push to `main` when `server/**` changes. Authenticates via WIF, then runs the same `gcloud run deploy` command from Part 1 of these notes, with `EMAIL_USER` / `EMAIL_PASS` passed as Cloud Run env vars via `--set-env-vars`.

Key YAML pieces:
- `permissions: id-token: write` — required for the workflow to mint a GitHub OIDC token. Forgetting this is the #1 WIF setup failure.
- `google-github-actions/auth@v2` with `workload_identity_provider` + `service_account` — performs the OIDC → GCP access-token exchange.
- `--set-env-vars="EMAIL_USER=${EMAIL_USER},EMAIL_PASS=${EMAIL_PASS}"` — quoted because the Gmail app password contains spaces.

### Step 6 — Frontend workflow file

Created `.github/workflows/deploy-frontend.yml`. Two trigger modes:
- `push` to `main` (when frontend paths change) → **production deploy** to `https://minipos-d9d92.web.app` via `firebase deploy --only hosting`.
- `pull_request` to `main` → **preview channel deploy** via `firebase hosting:channel:deploy pr-<N> --expires 7d`. A separate step parses the channel URL out of the CLI's `--json` output and posts it as a PR comment using `peter-evans/create-or-update-comment@v4`.

Key YAML pieces:
- Step-level `if: github.event_name == 'push'` vs `'pull_request'` — single workflow file, two behaviors.
- Build step injects `VITE_FIREBASE_API_KEY` into env so Vite can inline it into the bundle.
- `permissions: pull-requests: write` — needed for the auto-comment step on PRs.

### What's deployed-by-CI vs deployed-by-hand now

| Trigger | What happens | Workflow |
|---|---|---|
| Push to `main` touching `server/**` | Cloud Run redeploy | `deploy-backend.yml` |
| Push to `main` touching frontend files | Firebase Hosting production deploy | `deploy-frontend.yml` |
| PR to `main` touching frontend files | Preview channel + PR comment with URL | `deploy-frontend.yml` |
| Anything else | Nothing | — |

Old manual `gcloud run deploy` / `firebase deploy` commands still work — they're now a fallback, not the primary path.

## CI/CD Revisions — Frontend auth simplified

A follow-up session reworked the frontend pipeline. The backend workflow (`deploy-backend.yml`) is untouched — it still uses WIF, since `gcloud` picks up Application Default Credentials cleanly. The changes below all apply to `deploy-frontend.yml` only.

### Context changes that broke the first run

Two things shifted in the repo before the workflow ran:
- **Repo renamed** on GitHub: `Small-Business-POS` → `POSflow`. The push URL needed updating locally with `git remote set-url origin https://github.com/Jonathanhelga/POSflow.git`. GitHub redirects the old URL for a while, but relying on the redirect long-term is brittle.
- **Branch renamed**: working branch `clean-version` → `main` (so the workflow's `branches: [main]` trigger actually fires). Done with `git branch -m clean-version main` + `git branch --set-upstream-to=origin/main main` + `git remote set-head origin -a`.

Neither change requires touching the workflow YAML, but both have to happen before pushing to a renamed branch will trigger the pipeline.

### Issue 1 — `vite: not found` during build

Root cause: indentation bug. `npm ci` was nested under `actions/setup-node@v4`'s `with:` block, so it got silently ignored as an unknown input rather than running as its own step. The build then started with no `node_modules`, and `vite` wasn't on PATH.

Fix: pull `npm ci` out into its own step.

```yaml
- name: Set up Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm

- name: Install dependencies
  run: npm ci
```

Lesson: GitHub Actions doesn't error on unknown `with:` keys — it just drops them. A misplaced `run:` under `with:` produces zero feedback in the logs. If a step "did nothing," check the indentation of the step above.

### Issue 2 — `Failed to authenticate, have you run firebase login?`

This was the bigger one. Even after WIF auth succeeded (the `google-github-actions/auth@v2` step wrote `GOOGLE_APPLICATION_CREDENTIALS` correctly), the subsequent `firebase deploy --only hosting` call failed because the Firebase CLI didn't pick up the ADC file. Known papercut with `firebase-tools` + WIF — sometimes works, sometimes doesn't, depending on CLI version and exact role mix.

Two paths out:
1. Keep WIF and chase down the right combination of roles + CLI flags. Fragile.
2. Switch to the official `FirebaseExtended/action-hosting-deploy@v0` action, which authenticates via a service account key JSON passed as a secret.

Picked #2. Trades the "no static keys" property of WIF for "auth that actually works." Acceptable for a single-repo, single-project setup; if this grew to multiple Firebase projects, WIF would be worth fighting for.

### New auth flow (frontend only)

```yaml
- name: Deploy to Firebase Hosting (production)
  if: github.event_name == 'push'
  uses: FirebaseExtended/action-hosting-deploy@v0
  with:
    repoToken: ${{ secrets.GITHUB_TOKEN }}
    firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
    projectId: minipos-d9d92
    channelId: live
```

The PR-preview step uses the same action without `channelId` (creates a temporary channel automatically) and with `expires: 7d`. The action also posts the preview URL as a PR comment on its own — replaced the `jq` URL-parsing step + `peter-evans/create-or-update-comment@v4` that used to do that by hand.

### What got removed from the frontend workflow

- `permissions: id-token: write` — no more OIDC token minting; not needed.
- The entire `google-github-actions/auth@v2` step.
- The `npm install -g firebase-tools` step (the action bundles its own CLI).
- The hand-rolled `firebase hosting:channel:deploy` shell + `jq` parsing.
- The `peter-evans/create-or-update-comment@v4` step (the action does it).

Net diff: 87 lines → 68 lines on the workflow file. Plus the brittle auth path is gone.

### New secret to add: `FIREBASE_SERVICE_ACCOUNT`

Generated in Firebase Console → Project Settings → Service Accounts → "Generate new private key" (downloads a JSON file). The **entire JSON contents** go into the secret — not just the `private_key` field. Common mistake when setting this up: pasting only the `-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----` block. That fails with the same "Failed to authenticate" error as before, because the action can't construct a valid credential without `client_email`, `project_id`, etc.

Treat the downloaded JSON file like a credential:
- Don't save it inside the repo folder. `.gitignore` patterns (`*serviceAccount*.json`, `*firebase-adminsdk*.json`) catch the default filenames as a safety net, but don't rely on it.
- Once pasted into the GitHub secret, delete the local file.
- Rotate the key in Firebase Console if it ever gets exposed.

### What's still used vs no-longer-used

| Variable / Secret | Used by frontend workflow? | Used by backend workflow? |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` (secret) | **Yes** (new) | No |
| `VITE_FIREBASE_API_KEY` (secret) | Yes | No |
| `EMAIL_USER` / `EMAIL_PASS` (secrets) | No | Yes |
| `GCP_WIF_PROVIDER` (variable) | No (removed) | Yes |
| `GCP_SERVICE_ACCOUNT` (variable) | No (removed) | Yes |
| `GCP_PROJECT_ID` (variable) | No (now hardcoded to `minipos-d9d92`) | Yes |
| `GCP_PROJECT_NUMBER` (variable) | No | Effectively unused |

The three `GCP_*` variables still exist on the repo — leave them, they're free and the backend workflow references them. Only delete them if you ever remove the backend WIF path too.

### Final pipeline summary (updated)

| Trigger | What happens | Workflow | Auth method |
|---|---|---|---|
| Push to `main` touching `server/**` | Cloud Run redeploy | `deploy-backend.yml` | WIF |
| Push to `main` touching frontend files | Firebase Hosting production deploy | `deploy-frontend.yml` | Service account key JSON |
| PR to `main` touching frontend files | Preview channel + PR comment with URL | `deploy-frontend.yml` | Service account key JSON |

Mixed-auth setup is intentional: WIF works fine for `gcloud` (Cloud Run), the static key is the path of least resistance for `firebase-tools` (Hosting).
