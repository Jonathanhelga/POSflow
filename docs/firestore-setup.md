# Firestore Setup — What Was Added and Why

## What you just did

You wired the project up to the **Firebase CLI** and committed your Firestore configuration as code. Four new files now sit at the repo root:

| File | Purpose |
|---|---|
| `.firebaserc` | Pins this working directory to the Firebase project `minipos-d9d92`. The CLI reads this so you don't have to pass `--project` every time. |
| `firebase.json` | Tells the CLI *what* to deploy and where the source files live. Right now it only configures the Firestore service (rules + indexes + region `asia-east1`). |
| `firestore.rules` | The **security rules** — server-side access control. This closes the "client-only tenant isolation" gap that was flagged in `CLAUDE.md`. |
| `firestore.indexes.json` | Composite index definitions. Firestore needs these whenever a query filters on one field *and* sorts/filters on another. |

Until now, every query was filtered by `where('ownerId', '==', uid)` in the browser, but nothing stopped a malicious client from skipping that filter and reading everyone's data. With `firestore.rules` deployed, Firestore itself rejects any request that doesn't match the owner.

You can deploy these with:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

---

## How the security rules are built

### 1. Header

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    ...
  }
}
```

- `rules_version = '2'` — required for modern rules features (e.g. recursive wildcards, `request.time`).
- `service cloud.firestore` — these rules apply to Firestore (not Storage or RTDB).
- `match /databases/{database}/documents` — the entry path every Firestore rule sits under. `{database}` is a placeholder that matches the default database.

### 2. The `match` block — picking which documents a rule covers

```
match /inventory/{docId} {
  ...
}
```

`match` selects a path in the database tree. Anything in `{curly braces}` is a **wildcard variable** filled in by whatever path the client sends:

- `/users/{uid}` → `uid` becomes whatever document ID is being accessed.
- `/inventory/{docId}` → `docId` becomes the inventory document's ID.

You don't need to use the wildcard variable in the condition — `{docId}` is just there because the path needs *something* in that slot.

### 3. The `allow` line — which operations and under what condition

```
allow read, update, delete: if request.auth != null
                            && request.auth.uid == resource.data.ownerId;
allow create: if request.auth != null
              && request.auth.uid == request.resource.data.ownerId;
```

There are six granular operations you can list after `allow`:

| Keyword | Covers |
|---|---|
| `read` | shorthand for `get` + `list` |
| `write` | shorthand for `create` + `update` + `delete` |
| `get` | reading a single document |
| `list` | running a query |
| `create` | new document |
| `update` | modifying an existing document |
| `delete` | removing a document |

The condition after `if` must evaluate to `true` for the request to go through. **If no rule matches, access is denied by default** — that's why every collection needs its own `match`.

### 4. The three magic objects in conditions

This is the core of how the rules think:

| Object | What it is | When it exists |
|---|---|---|
| `request.auth` | The signed-in user's auth info, or `null` if not logged in. | Always available. |
| `request.auth.uid` | Just the Firebase user ID, pulled out of `request.auth`. | Whenever the user is signed in. |
| `resource.data` | The document **as it currently exists in Firestore**. | `read`, `update`, `delete` (not `create` — the doc doesn't exist yet). |
| `request.resource.data` | The document **the client is trying to write**. | `create`, `update` (not `read` or `delete` — nothing is being written). |

That asymmetry is why `create` uses `request.resource.data.ownerId` (we're inspecting the *incoming* document to make sure the user isn't trying to plant a doc under someone else's `ownerId`), while `read/update/delete` use `resource.data.ownerId` (the doc already exists, so we check the *stored* owner).

### 5. The pattern repeated for each collection

`inventory`, `orders`, and `customers` all follow the same shape:

```
match /<collection>/{docId} {
  allow read, update, delete:
      if request.auth != null && request.auth.uid == resource.data.ownerId;
  allow create:
      if request.auth != null && request.auth.uid == request.resource.data.ownerId;
}
```

Translated into plain English: *"You must be signed in, AND the `ownerId` field on the document must equal your user ID."*

`users/{uid}` is slightly different — there's no `ownerId` field because the document **is** the user's profile. The owner is encoded in the path itself, so the check is `request.auth.uid == uid` (the path wildcard).

### 6. What's still missing

The current rules check ownership but don't validate the **shape** of incoming data. A user could still write `inventory` docs with garbage fields, missing required fields, or wrong types. A more defensive version would add things like:

```
allow create: if request.auth != null
              && request.auth.uid == request.resource.data.ownerId
              && request.resource.data.keys().hasAll(['name', 'sku', 'price', 'stock'])
              && request.resource.data.price is number
              && request.resource.data.stock is int;
```

That's a natural next step once the basic ownership model is deployed and working.

---

## How the indexes file works

Firestore auto-creates **single-field** indexes for you. But the moment a query combines `where()` on one field with `orderBy()` on another — or two `where()` filters on different fields — you need a **composite index**.

`firestore.indexes.json` is the declarative form of those. Each entry says: *"for this collection, build an index over these fields in this order."*

Your current indexes support the queries the app already runs:

- `inventory` — filter by `ownerId`, sort by `lastUpdated`.
- `orders` — filter by `ownerId`, sort by `createdAt` (both ascending and descending versions, since order history likely shows newest first while another view shows oldest first).
- `customers` — filter by `ownerId`, sort by `name`.

The trailing `__name__` field is Firestore's internal document-ID tiebreaker — the CLI adds it automatically.

If you ever add a new owner-scoped query that sorts on a new field, Firestore will fail the query at runtime and log a console link that auto-generates the right index entry — you then paste it into this file.
