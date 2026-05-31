# Feature Spec: Custom Order Fields at Checkout

**Status:** In progress (Phase 1 not started yet)
**Owner:** project owner
**Last updated:** 2026-05-29

---

## 1. Goal

In the **Customer Checkout modal**, let the cashier attach arbitrary extra fields to a
single order at checkout time — beyond the existing "Order Note" text input.

Each extra field has:
- a **custom label** the cashier types (e.g. `"Pickup date"`), and
- one of three **types**: `Multiple Choice`, `Date`, `Time`.

Example: label = `"Delivery date"`, type = `Date`, value = `2026-06-05`.

### Why
- Cashiers need to capture order-specific info that doesn't fit the fixed schema
  (pickup date, delivery time, size choice, etc.) without us shipping a code change
  for every new field. NoSQL/Firestore lets us do this with no schema migration.
- These fields must eventually be **query targets** — e.g. "show me all orders with
  Delivery date = 2026-06-05" — so the storage shape must be Firestore-queryable.

---

## 2. Key concepts

There are two distinct things, do not conflate them:

| Concept | Lives where | Lifetime | Purpose |
|---|---|---|---|
| **Field definition** | User's account (the "library") | Persistent, reusable | Defines a field once (label + type + options). Re-attachable to future orders without recreating. |
| **Field value** | The specific order document | Per-order | The actual value the cashier entered for this one order. |

A definition is created **once** (on first use). After that the cashier picks it from
the library and just fills in the value — they do **not** redefine it.

---

## 3. Data model (LOCKED — hard to change later)

### 3.1 The critical Firestore constraint

> **Firestore cannot query inside an array of objects.**
> Storing fields as a list like `[{label, value}, ...]` makes
> "find all orders where Delivery date = X" effectively impossible.

Therefore values are stored as a **map keyed by a stable field id**, which Firestore
*can* query via dot-path notation.

### 3.2 On each order document (`/orders/{docId}`)

Values for this order, keyed by the field's stable `id`:

```js
customFields: {
  delivery_date: { label: "Delivery date", type: "date",   value: "2026-06-05" },
  pickup_time:   { label: "Pickup time",   type: "time",   value: "17:00" },
  size:          { label: "Size",          type: "choice", value: "M" }
}
```

Future query example:
```js
where('customFields.delivery_date.value', '==', '2026-06-05')
// (will likely need a composite index in firestore.indexes.json)
```

`label` and `type` are denormalized onto the order so the order is self-describing
(order history can render it without loading the library).

### 3.3 On the user document (`/users/{uid}`)

The reusable library. A plain **array** is fine here because we only ever read the
*whole* library at once — we never query inside it. Storing it on the user doc means
**no new Firestore security rules are required** (that path is already locked to the
owning user).

```js
orderFieldLibrary: [
  { id: "delivery_date", label: "Delivery date", type: "date" },
  { id: "pickup_time",   label: "Pickup time",   type: "time" },
  { id: "size",          label: "Size",          type: "choice", options: ["S", "M", "L"] }
]
```

- `id` — stable slug derived from the label (e.g. `"Delivery date"` → `delivery_date`),
  must be unique within the library.
- `options` — present only for `type: "choice"`.

### 3.4 Value normalization (so values stay queryable)

| Type | Stored value format | Example |
|---|---|---|
| `date` | ISO date string `YYYY-MM-DD` (sortable, range-queryable) | `"2026-06-05"` |
| `time` | 24-hour `HH:MM` string | `"17:00"` |
| `choice` | the selected option string (must be one of `options`) | `"M"` |

---

## 4. UX

The custom fields live inside the **"Order Details"** section of the checkout modal,
alongside the existing "Order Note" input. The section grows taller and scrolls
vertically as fields are added. (Note: the modal already has a pinned header + footer
with the middle scrolling — see `styles/customer_checkout_modal.css`.)

### 4.1 Adding a field
- A `[+] Add field` button sits below the section
  (`#js-checkout-add-field`, `.c-checkout__add-field` in `index.html`).
- Clicking it opens a **type picker** (Multiple Choice / Date / Time).
- Choosing a type appends a new **label-input + value-input row** to the section.

### 4.2 Multiple Choice option entry (DECIDED)
When creating a `Multiple Choice` field for the first time, options are entered via a
**chip list**: a single text input + "Add" button; each option becomes a removable
chip with an `×`. (Chosen over comma-separated string — cleaner, avoids comma-in-option
ambiguity, matches the app's polished UI.)

### 4.3 Re-using a saved field
The cashier picks an existing definition from the library and just fills the value —
no redefining.

---

## 5. Relevant existing code

| File | Role |
|---|---|
| `index.html` (~line 475+) | "Order Details" section + `#js-checkout-add-field` button live here. All HTML + `<template>`s live in this one file. |
| `src/customer_checkout.js` | Checkout modal logic. `getCheckoutFormData()` builds the order payload — `customFields` gets folded in here. `openCustomerCheckout()` is where the library should be loaded. |
| `src/firebase.js` | `submitOrder(orderPayload, uid)` writes the order via `writeBatch`. `fetchUserProfile(uid)` reads the user doc (where the library lives). |
| `styles/customer_checkout_modal.css` | Modal styling; pinned header/footer + scrolling body already done. |

### Conventions to follow (from CLAUDE.md)
- Vanilla JS, no framework. Build DOM with `createElement` + `textContent` + `appendChild`.
- **Never** use `innerHTML` with user/DB data (XSS).
- Standalone module-level functions, **no nested functions**.
- All Firestore access goes through `src/firebase.js`; new collections/queries must
  respect `ownerId == uid` tenant isolation (the library avoids this by living on the
  user doc).

---

## 6. Build plan (phased — guide one phase at a time)

- [ ] **Phase 1 — UI only, in-memory.** Type picker, new-field creation flow
      (incl. the chip builder), appending/removing field rows. No Firebase yet.
- [ ] **Phase 2 — Library persistence.** Read `orderFieldLibrary` from the user doc
      on modal open (so saved fields are re-attachable); save new definitions on first use.
- [ ] **Phase 3 — Write values on checkout.** Fold `customFields` map into
      `getCheckoutFormData()` → `submitOrder()`.
- [ ] **Phase 4 (later) — Query + display.** Show custom fields in order history;
      add query support + any needed composite indexes.

---

## 7. Decisions log

- **Storage = map keyed by stable id, NOT array of objects** — because Firestore can't
  query inside arrays of objects. (§3.1)
- **Library stored as array on the user doc** — only read wholesale, never queried;
  avoids needing new security rules. (§3.3)
- **Multiple Choice options entered via removable chip list.** (§4.2)
- **Field `id` is a slug derived from the label**, unique within the library. (§3.3)
- **Definitions created once, then re-attached** — cashier doesn't redefine on reuse. (§2)

## 8. Open questions / TODO
- Slug collision handling when two labels slugify to the same id.
- Editing/deleting a definition from the library (out of scope for now?).
- Validation rules (required fields? empty values allowed?).
- Composite index definitions for Phase 4 queries.
