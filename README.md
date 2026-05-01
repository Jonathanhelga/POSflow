# Mini PoOoS — Point-of-Sale Web Application

A full-stack, cloud-based Point-of-Sale system built for small retail businesses. Handles inventory management, order processing, barcode generation, and thermal receipt printing — all from the browser, with zero frontend frameworks.

> **Background:** This project started in September 2025 as a migration from an offline Electron + MySQL desktop app to a modern web-based architecture. Early development was done without version control — a lesson learned. All commits from that point forward reflect intentional, incremental feature development and security hardening.

---

## Why This Project Exists

Most POS software is either expensive, bloated with features small shops don't need, or locked into proprietary hardware. Mini PoOoS is purpose-built for small retail businesses (originally an electric parts shop in Indonesia) that need:

- A cashier interface that works on any device with a browser
- Barcode scanning with a USB scanner — no special SDK, no mobile app
- Printable receipts on standard 58mm/80mm thermal printers
- Inventory tracking with low-stock alerts
- Cloud sync so data isn't trapped on a single machine

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JavaScript (ES6 Modules) — no React, no Vue, no Angular |
| **Build Tool** | Vite 6 |
| **Backend** | Express.js 5 (Node.js) |
| **Database** | Cloud Firestore (Firebase) |
| **Authentication** | Firebase Auth + custom server-side OTP email verification |
| **Email Service** | Nodemailer (Gmail SMTP) |
| **Barcode** | JsBarcode (SVG generation) + html2canvas (PNG export) |
| **Currency** | Indonesian Rupiah (IDR) via `Intl.NumberFormat` |

---

## Features

### Authentication & Onboarding
- **Email sign-up with OTP verification** — a 6-digit code is sent via Gmail SMTP, verified entirely server-side (the OTP never reaches the frontend)
- **Server-side OTP security** — codes are stored in-memory with a 5-minute TTL, single-use deletion, and expiration enforcement
- **4-step setup wizard** — guides new users through business identity, financial settings (tax rate, invoice prefix), and printer configuration before reaching the POS interface
- **Firebase Auth session management** — persistent login state via `onAuthStateChanged`, automatic UI rendering based on auth status

### Point-of-Sale Interface
- **Item grid with color-coded buttons** — each product appears as a tappable button, themed by user-assigned color tags (cobalt, sage, slate, rose, charcoal)
- **Real-time search** — filter products by name, SKU, supplier, or last update date with 300ms debounced input
- **Order cart management** — add items via grid click or barcode scan, edit quantities with double-click, remove individual items, or reset the entire order
- **Dynamic tax calculation** — subtotal, tax (pulled from the business profile), and grand total update live as items are added or removed
- **Stock validation on submit** — each item's quantity is checked against current Firestore stock levels before the order is committed

### Barcode System
- **USB barcode scanner integration** — listens globally on the document for rapid keystroke sequences terminated by Enter; works without focusing any specific input field; ignores input when the user is typing in a form field
- **Scan-to-order** — scanning a product SKU adds it to the current order (or increments its quantity if already in the cart)
- **Barcode label generator** — select any inventory item, optionally upload a product photo, choose from 4 label sizes (58x40mm sticker to A4), and export as a high-resolution PNG (3x pixel density via html2canvas)
- **SVG barcode rendering** — generates CODE128 barcodes from SKU values using JsBarcode

### Inventory Management
- **Full CRUD** — add items with SKU, name, cost/sell price, stock quantity, unit of measure (10 options: pieces, kg, liters, meters, etc.), minimum stock threshold, supplier info, and description
- **Stock update panel** — two-panel modal with searchable item list on the left, detail view + incoming quantity input on the right
- **Low-stock alerts** — items below their minimum threshold display an "ALERT" badge; items above show "GOOD"
- **Atomic stock operations** — uses Firestore `increment()` for safe concurrent stock updates

### Receipt & Order History
- **Thermal receipt layout** — complete bill format including shop name, address, contact details, cashier name, invoice number, itemized table, tax breakdown, and custom footer message
- **Configurable paper sizes** — supports 58mm (small thermal) and 80mm (standard thermal) printers
- **Order history browser** — card-based list of past orders with full bill preview; click any order to see its complete receipt
- **Print integration** — triggers `window.print()` with the bill preview in view, ready for thermal printer output

### Business Profile
- **Editable business settings** — update business name, address, phone, Instagram, email, tax rate, invoice prefix, paper size, and receipt footer at any time
- **Live tax sync** — changing the tax rate in the profile immediately updates the order form calculations
- **User avatar** — displays the first letter of the user's email as a profile indicator

---

## Architecture

### Project Structure

```
Point-of-Sale_Firebase/
├── index.html              # Single-page app (all HTML templates, 767 lines)
├── package.json
├── server/
│   ├── server.js           # Express API — OTP send & verify endpoints
│   └── emailServices.js    # Nodemailer transport + OTP generation
├── src/
│   ├── main.js             # App entry — CSS imports, auth state listener, module init
│   ├── firebase.js         # Firestore & Auth — all database operations
│   ├── auth-handler.js     # Sign-up/login UI logic, OTP flow, form validation
│   ├── control_wizard.js   # 4-step wizard navigation and view switching
│   ├── loggedIn-user.js    # Post-login initialization — loads profile, sets up modules
│   ├── order-add_item.js   # Order cart — add/edit/remove items, submit with stock check
│   ├── search_item.js      # Item search (debounced) + global barcode scanner listener
│   ├── item_ui.js          # Item grid rendering — color-coded buttons
│   ├── add_item_ui.js      # New item creation form
│   ├── inventory_update.js # Stock management — two-panel detail + update view
│   ├── barcode-generator.js# Label generator — item select, photo upload, size pick, export
│   ├── order_history.js    # Order list + thermal receipt preview + print
│   ├── profile.js          # Business profile editing + logout
│   ├── modal-handler.js    # Modal open/close with CSS animations
│   └── formatRupiah.js     # IDR currency formatter (Intl.NumberFormat)
└── styles/
    ├── variables.css        # Design tokens — colors, spacing, shadows, animations
    ├── container.css        # POS layout — 30% sidebar + 70% main grid
    ├── setupWizard.css      # Onboarding wizard overlay
    └── [9 more module-specific CSS files]
```

### Design Decisions

**No frontend framework** — every DOM update is explicit `createElement` + `appendChild` / `textContent`. This was a deliberate choice to build strong JavaScript fundamentals rather than depending on framework abstractions. The tradeoff is more verbose rendering code, but the app's complexity is manageable at this scale and the bundle stays minimal.

**Modular architecture** — each feature lives in its own ES6 module with a clear `init*()` entry point. Modules communicate through direct function imports, not a global event bus or state store. This keeps the dependency graph readable.

**Template cloning** — HTML `<template>` elements are defined in `index.html` and cloned with `content.cloneNode(true)` for the wizard forms. Dynamic content within modals is built programmatically using safe DOM APIs (no `innerHTML` with user data).

**CSS design tokens** — all colors, spacing, shadows, and animation timings are defined as reusable values in `variables.css`. Modal animations use CSS keyframes (`slideInFromRight`, `popIn`) triggered by class toggling from JavaScript.

**Atomic batch writes** — order submission uses Firestore `writeBatch()` to create the order document and decrement stock for every item in a single atomic operation. If any part fails, nothing is committed — no partial orders, no phantom stock deductions.

---

## Database Schema (Cloud Firestore)

### `/users/{uid}`
| Field | Type | Description |
|-------|------|-------------|
| `username` | string | Display name / cashier name on receipts |
| `business_name` | string | Shop name (appears on bill header) |
| `business_address` | string | Full address |
| `business_phone` | string | Contact number |
| `business_instagram` | string | Social media handle |
| `business_email` | string | Business contact email |
| `tax_rate` | number | Sales tax percentage |
| `invoice_prefix` | string | Prefix for invoice numbers |
| `printer_size` | string | `"58"` or `"80"` (mm) |
| `receipt_footer` | string | Custom footer message on receipts |
| `created_at` | string | ISO 8601 timestamp |
| `ownerId` | string | Firebase Auth UID (for query filtering) |

### `/inventory/{docId}`
| Field | Type | Description |
|-------|------|-------------|
| `sku` | string | Unique product identifier (used for barcodes) |
| `itemName` | string | Product name |
| `costPrice` | number | Purchase cost (IDR) |
| `sellPrice` | number | Retail price (IDR) |
| `stockLevel` | number | Current quantity in stock |
| `minStockLevel` | number | Alert threshold |
| `unit` | string | Unit of measure (`pcs`, `kg`, `m`, `l`, etc.) |
| `supplier` | string | Supplier name |
| `description` | string | Product details |
| `tagColor` | string | UI button color class |
| `createdAt` | Timestamp | Firestore server timestamp |
| `lastUpdated` | Timestamp | Firestore server timestamp |
| `ownerId` | string | Owner's Firebase Auth UID |

### `/orders/{docId}`
| Field | Type | Description |
|-------|------|-------------|
| `items` | array | `[{ id, name, price, quantity, subtotal }]` |
| `totalQuantity` | number | Sum of all item quantities |
| `subtotal` | number | Total before tax |
| `taxRate` | number | Tax percentage at time of sale |
| `taxAmount` | number | Calculated tax amount |
| `totalPrice` | number | Grand total (subtotal + tax) |
| `createdAt` | Timestamp | Firestore server timestamp |
| `ownerId` | string | Owner's Firebase Auth UID |

All collections use `ownerId` for tenant-level data isolation — each user only sees their own inventory, orders, and profile.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- A Firebase project with Firestore and Authentication enabled
- A Gmail account with an [App Password](https://support.google.com/accounts/answer/185833) for OTP emails

### Setup

```bash
# Clone the repository
git clone https://github.com/<your-username>/Point-of-Sale_Firebase.git
cd Point-of-Sale_Firebase

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Configure your `.env`:
```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
VITE_FIREBASE_API_KEY=your-firebase-api-key
```

Update the Firebase config in `src/firebase.js` with your own project credentials.

### Run

```bash
# Start both frontend (Vite) and backend (Express) concurrently
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend + backend concurrently |
| `npm run client` | Start Vite dev server only |
| `npm run server` | Start Express backend only |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/send-otp` | Sends a 6-digit OTP to the provided email. Body: `{ email }` |
| `POST` | `/api/verify-otp` | Verifies the OTP server-side. Body: `{ email, otp }`. Single-use, 5-min TTL |

---

## Security Considerations

**What's implemented:**
- Server-side OTP verification — codes never sent to the frontend
- Single-use OTP tokens with 5-minute expiration
- XSS mitigation — recent refactor replaced `innerHTML` with safe DOM construction (`createElement`, `textContent`, `appendChild`) across all modules
- Atomic batch writes — prevents partial order/stock corruption
- Firebase Auth for credential management (hashing, session tokens handled by Firebase SDK)
- `ownerId` field on all documents for data isolation

**Known limitations (actively being addressed):**
- Firestore Security Rules need to be implemented to enforce `ownerId == request.auth.uid` at the database level
- No rate limiting on the OTP endpoint
- Backend server URL is hardcoded to `localhost:3000` (needs environment variable for production)

---

## Roadmap

- [ ] Firestore Security Rules enforcement
- [ ] Sales analytics dashboard (daily revenue, top-selling items)
- [ ] Order history date filtering
- [ ] CSV/Excel export for orders and inventory
- [ ] Deploy to Firebase Hosting + Cloud Run
- [ ] Google Sign-In integration

---

## Commit History Highlights

The git history reflects iterative, feature-driven development with a focus on security hardening in recent commits:

- `e58a910` — **refactor:** replace `innerHTML` with safe DOM creation across all POS modules (XSS mitigation)
- `2d8c9e6` — **feat:** add scan-to-order with stock validation
- `d51cc42` — **fix:** move OTP verification server-side (previously returned to frontend)
- `8a90706` — **feat:** implement barcode generator with item selection, size picker, and save-to-device
- `83c0ed1` — **feat:** add inventory update modal with stock alerts
- `927784d` — **feat:** add tax-aware order totals and toast notifications
- `d272eed` — **feat:** track order histories and handle tax based on business profile

---

## License

ISC
