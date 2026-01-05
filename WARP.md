# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project overview

Prasadam Connect is a React + Vite PWA that uses Firebase Authentication (phone OTP) for login and a Python Flask API to mediate all data access to Firestore. The frontend talks only to Firebase Auth and the Flask API; the Flask API uses the Firebase Admin SDK to read/write Firestore and enforce validation, uniqueness, and access rules.

High level flow:
- Users authenticate via Firebase Phone Auth in the React app.
- After OTP verification, the frontend calls the Flask API to create/update user profiles and record login history in Firestore.
- Students use a dashboard to view real-time prasadam offerings (from Firestore) and create orders (through the Flask API), which also decrements stock in Firestore.
- Supply owners use a separate portal (same React app) to manage supply batches, announcements, analytics, and QR validation tools, all via the Flask API.

## Local development commands

All commands below are run from the repo root unless noted.

### Frontend (React/Vite)

Prereqs: Node 18+ and a Firebase project with Phone Auth + Firestore enabled (see `README.md` for full Firebase setup and required `VITE_` env vars).

- Install dependencies:
  ```bash
  npm install
  ```

- Run the Vite dev server (PWA frontend):
  ```bash
  npm run dev
  ```
  By default Vite serves on `http://localhost:5173`.

- Build the production bundle:
  ```bash
  npm run build
  ```

- Preview the built app locally:
  ```bash
  npm run preview
  ```

- Configure the frontend to talk to a local API (if you are not using the default):
  - The API base URL is controlled by `VITE_API_URL` in the root `.env`.
  - If omitted, `src/api.js` defaults to `http://localhost:5001`.
  - Ensure this matches the Flask port you run below.

### Backend API (Flask / Firestore)

All backend commands are run from the `api` subdirectory.

- (Optional) Quick dependency check:
  ```bash
  cd api
  python3 check_dependencies.py
  ```

- Create/activate a virtualenv and install dependencies:
  ```bash
  cd api
  python3 -m venv venv
  source venv/bin/activate  # Windows: venv\Scripts\activate
  pip install -r requirements.txt
  ```

- Or use the automated setup script (if on a Unix-like shell):
  ```bash
  cd api
  chmod +x setup.sh
  ./setup.sh
  ```

- Configure Firebase Admin credentials (local dev):
  - Generate a Firebase service account key in the Firebase Console.
  - Save it as `api/serviceAccountKey.json`.
  - Alternatively, use Application Default Credentials via `gcloud auth application-default login`.

- Run the Flask API in development:
  ```bash
  cd api
  source venv/bin/activate
  python3 app.py
  ```
  The default port is taken from `PORT` or falls back to `5001`. Make sure this matches `VITE_API_URL` used by the frontend.

- Run the Flask API via `flask run` instead of `python app.py` (optional):
  ```bash
  cd api
  source venv/bin/activate
  export FLASK_APP=app.py
  export FLASK_ENV=development
  flask run  # honors $PORT if set, otherwise Flask's default
  ```

### Firestore rules / indexes

The Firebase CLI is used for Firestore security rules and indexes as wired in `firebase.json`:

- Deploy Firestore rules and indexes (requires `firebase-tools` and a configured project):
  ```bash
  firebase deploy --only firestore:rules,firestore:indexes
  ```

### Testing and diagnostics

There is no JavaScript test runner configured (no `npm test` script); the only automated checks today are Python-side diagnostics.

- Verify Firestore connectivity and basic write/read operations:
  ```bash
  cd api
  python3 test_firestore.py
  ```

- Lightweight dependency/installation checks:
  ```bash
  cd api
  python3 check_dependencies.py
  ```

## Frontend architecture

### Entry point and routing

- `src/main.jsx` bootstraps React, registers the service worker (`src/sw.js`), and sets up `BrowserRouter` routes:
  - `/student/login` → `Login.jsx` (student phone login / registration).
  - `/supply-owner/login` → `SupplyOwnerLogin.jsx` (supply owner login only).
  - `/student/*` and `/supply-owner/*` → `App.jsx` (role-specific dashboards for the same authenticated user, driven by their Firestore profile).
  - `/` simply redirects to `/student/login`.

This means unauthenticated flows are handled entirely in `Login.jsx` / `SupplyOwnerLogin.jsx`, while `App.jsx` assumes a Firebase-authenticated user.

### Firebase client and reCAPTCHA

- `src/firebase.js` initializes the Firebase JS SDK using Vite env vars (`VITE_FIREBASE_*`) and exports:
  - `auth` – used throughout for `onAuthStateChanged` and `signInWithPhoneNumber`.
  - `db` – Firestore client used directly by the frontend for the student-facing offerings list.
- It also defines `getOrCreateRecaptcha(containerId)` and `clearRecaptcha()`, which:
  - Maintain a single global `RecaptchaVerifier` instance on `window._rfpwaRecaptchaVerifier`.
  - Use a simple mutex (`_isInitializing`) to avoid race conditions if multiple components try to initialize reCAPTCHA at once.
  - Expect a hidden DOM container (`#recaptcha-container` or `#recaptcha-container-supply-owner`) that is kept mounted even when the form changes.

Any changes to phone auth should reuse these helpers rather than creating new `RecaptchaVerifier` instances directly.

### Phone login & registration flows

- `src/Login.jsx` implements the student login/registration wizard:
  - Maintains `mode` (`login` vs `register`) and `step` (`phone` → `otp` → optional `complete-registration`).
  - Normalizes all phone numbers to E.164 using a shared `COUNTRIES` list and `normalizePhoneNumber`, stripping local formatting and leading zeros.
  - Before sending an OTP, calls `checkUserExists` (via the API) to:
    - In register mode: prevent creating a duplicate account and prompt to switch to login instead.
    - In login mode: prompt to switch to registration when no user exists.
  - After OTP verification (`verifyOtp`):
    - In register mode: uses `createUserWithLogin` (backend transaction) to create the user and record login history in a single step.
    - In login mode: ensures the user exists via `checkUserExists`, then calls `recordLogin` and routes to `/student`.
  - Handles several race conditions around another user registering the same phone number between checks by:
    - Re-checking `checkUserExists` at multiple points.
    - Showing a confirmation modal and signing out if the backend detects a duplicate.

- `src/SupplyOwnerLogin.jsx` implements a similar OTP flow for supply owners but **only** supports login, not registration:
  - Before sending OTP and again after verification it enforces `checkUserExists(phone)`.
  - On success it calls `recordLogin` and routes to `/supply-owner`.
  - Error handling is stricter: if user existence cannot be verified, it signs out and resets to the phone step.

Both components rely on the backend’s `validate_phone` logic in `api/app.py` being aligned with the frontend’s `normalizePhoneNumber` (both expect E.164, `+` followed by 10–15 digits). If you change one side, keep the other consistent.

### Dashboard application (`App.jsx`)

`src/App.jsx` houses the bulk of the logged-in experience and is used for **both** student and supply-owner routes. It pivots on the user’s Firestore profile:

- Auth & routing:
  - Subscribes to Firebase Auth via `onAuthStateChanged`.
  - Redirects unauthenticated users to the appropriate login route depending on whether they are under `/student` or `/supply-owner`.
  - Fetches the user profile from the backend via `getUserProfile(uid)` and keeps it in `userProfile` state.
  - Interprets `userProfile.role === 'supplyOwner'` to decide whether to render the student dashboard or the supply-owner dashboard.

- Real-time offerings feed (student view):
  - Uses the Firestore JS SDK directly, subscribing to `collection(db, 'offerings')` via `onSnapshot`.
  - Normalizes `availableAt` timestamps and sorts offerings by most recent availability.
  - Tracks previous offering statuses to raise in-app toasts when new offerings appear or are restocked.
  - The student UI presents a list of offerings with quantity, reservation fee, status, and an action button that calls `createOrder`.

- Orders (student view):
  - Fetches orders from the backend via `getOrders(uid)` and enriches them with offering titles when missing.
  - Groups multiple orders for the same offering into a single carousel card with combined quantity and per-order cancellation controls.
  - Cancelling an order calls the backend `cancelOrder(orderId, uid)`, which also restores the offering’s available quantity; the frontend immediately updates local state and then refetches from the API.
  - The detailed order modal is opened via `handleShowOrder` and shows timestamps, fee/refund info, and status.

- Subscription management (student view):
  - Reads `userProfile.subscription` and uses `updateSubscription({ uid, action, waived })` to activate or cancel a subscription.
  - The backend owns all next-renewal calculations (`renewsAt`) and the `waived` flag; the frontend simply presents the current state.

- Supply owner portal:
  - Becomes active when `userProfile.role === 'supplyOwner'` and the user is under a `/supply-owner/*` route.
  - Uses a tabbed interface controlled by `activeSupplyTab`:
    - **Overview** – aggregates metrics from `getSupplyAnalytics(uid)` plus recent future offerings, batches, and orders.
    - **Manage Supply** – logs batches via `createSupplyBatch` and lists all `supplyBatches` documents for the owner from `getSupplyBatches(uid)`.
    - **Announcements** – schedules future offerings via `createFutureOffering` and lists them via `getFutureOfferings(uid)`.
    - **Orders** – lists all orders for this owner via `getSupplyOrders(uid, limit)`.
    - **Analytics** – shows rolled-up metrics returned by `/api/supply/analytics/<uid>`.
    - **QR Tools** – validates order QR codes via `validateOrderQr` and manages event-style QR codes via `createCustomQr` and `getCustomQrCodes`.
    - **Profile** – reuses the same `profileCard` used for the student to edit name/email/address (phone is immutable).

Changes to backend endpoints that touch offerings, orders, subscription, or supply collections will typically require aligned updates in `src/api.js` and `App.jsx`.

### HTTP API client

- `src/api.js` is the single place where the frontend calls the Flask API. It defines:
  - `API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'`.
  - A shared `apiRequest(endpoint, options)` helper that:
    - Adds JSON headers, stringifies bodies, and attempts to parse JSON responses.
    - Throws `Error` objects with `status`, `statusText`, and any backend `error`/`message` field on non-2xx responses.

The exported functions map almost 1:1 to Flask routes, e.g.:
- Auth / identity: `checkUserExists`, `createUserWithLogin`, `registerUser`, `recordLogin`, `getLoginHistory`, `getUserProfile`, `updateUserProfile`, `updateSubscription`, `unregisterUser`, `healthCheck`.
- Student orders: `getOfferings`, `createOrder`, `getOrders`, `cancelOrder`.
- Supply owner tools: `createSupplyBatch`, `getSupplyBatches`, `createFutureOffering`, `getFutureOfferings`, `getSupplyOrders`, `getSupplyAnalytics`, `validateOrderQr`, `createCustomQr`, `getCustomQrCodes`.

When adding or changing backend endpoints, extend this module rather than calling `fetch` directly from components. Frontend error messages are generally surfaced directly from the backend’s `error` field, so keep backend error strings user-friendly where appropriate.

### PWA service worker

- `src/sw.js` implements a minimal offline caching strategy:
  - Caches a fixed list of assets (root, `index.html`, manifest, and key `src/*` files) under `CACHE_NAME = 'rfpwa-cache-v2'`.
  - On `fetch`:
    - Serves cached responses when available, otherwise fetches from the network and caches successful (200) responses.
    - Skips caching for Firebase and Google endpoints.
    - When offline and a request for HTML is not cached, falls back to cached `index.html`.
- `src/main.jsx` registers this service worker on window load when `serviceWorker` is supported.

If you change entry points or add critical assets, update the `ASSETS` array so they are available offline.

## Backend architecture (Flask / Firestore)

All backend logic currently lives in a single module: `api/app.py`.

### Initialization & configuration

- CORS is configured via `flask-cors` to permit all origins for `/api/*` routes (methods: GET/POST/PUT/DELETE/OPTIONS). An `after_request` hook also injects CORS headers so local development works even if upstream proxies are misconfigured.
- A `before_request` hook returns a simple JSON response for any `OPTIONS` request, ensuring smooth preflight handling.
- Firebase Admin initialization:
  - Prefers a `GOOGLE_APPLICATION_CREDENTIALS` path if set.
  - Otherwise tries `serviceAccountKey.json` in the `api` directory.
  - Falls back to `ApplicationDefault()` credentials for environments where gcloud ADC is configured.
- Firestore client `db` is shared across all routes.
- The process-level default port is taken from `PORT` env var or defaults to `5001` when running via `python app.py`.

### Core helper functions

`app.py` defines a set of utilities used across routes:
- Timestamp helpers (`serialize_timestamp`, `parse_iso_datetime`) to normalize Firestore timestamps to ISO strings and parse them back.
- Input validation helpers for email (`validate_email`) and E.164 phone numbers (`validate_phone`).
- Key-normalization helpers (`normalize_phone_for_path`, `normalize_email_for_path`) to safely use phone/email values as Firestore document IDs in `users_by_phone` and `users_by_email`.
- IP-address validation and extraction (`validate_ip_address`, `get_client_ip_address`) used to attach client IP information to login history.

### Identity, registration, and login history

The API treats Firebase Auth as the source of truth for authentication but persists user metadata and login events in Firestore:

- `POST /api/create-user-with-login` (`create_user_with_login`):
  - Transactionally creates:
    - A `users/{uid}` document with profile and subscription defaults.
    - Uniqueness markers in `users_by_phone/{normalized_phone}` and `users_by_email/{normalized_email}`.
    - A `loginHistory` entry with user agent and IP.
  - Fails with a 409 if any of the user, phone, or email already exist, and the frontend maps this into race-condition handling.

- `POST /api/register` (`register_user`):
  - Simpler non-transactional registration path that checks for existing users, phones, and emails via collection queries; kept primarily for compatibility.

- `POST /api/check-user` (`check_user`):
  - Returns `exists: true/false` for a given E.164 phone number by querying `users`.

- `POST /api/login-history` (`record_login`) and `GET /api/login-history/<uid>`:
  - Append login entries and retrieve a limited, most-recent-first list (with an adjustable `limit` query parameter in the GET).

- `GET /api/user/<uid>` and `PUT /api/user/<uid>`:
  - Fetch and update user profiles.
  - Strips a list of sensitive fields before returning JSON payloads.
  - Email updates enforce uniqueness by coordinating with the `users_by_email` marker collection.

- `POST /api/subscription` (`update_subscription`):
  - Activates or cancels the user’s subscription and updates `subscription.active`, `subscription.renewsAt`, `subscription.waived`, and `subscription.monthlyFeeCents`.

- `POST /api/unregister` (`unregister_user`):
  - Deletes the `users/{uid}` document; this is used as a rollback/cleanup endpoint and does **not** yet clean marker collections.

### Offerings and student orders

- `GET /api/offerings` (`list_offerings`):
  - Returns all offerings (optionally filtered by `status` query param) from the `offerings` collection, ordered by `availableAt` when possible.

- `POST /api/orders` (`create_order`):
  - Transactionally:
    - Verifies the user exists and the offering is available and not sold out.
    - Decrements `availableQuantity` on the offering (and sets its status to `sold-out` when it reaches zero).
    - Creates an `orders/{orderId}` document containing `uid`, `offeringId`, `offeringTitle`, `ownerUid`, `feeCents`, `launchFeeRefund` flag, and a fresh `qrToken`.

- `GET /api/orders/<uid>` (`list_orders_for_user`):
  - Lists up to 50 orders for a given student UID from the `orders` collection.
  - Attempts to order by `createdAt` descending but falls back to an unordered query and in-memory sorting if the required Firestore index is missing.

- `POST /api/orders/<order_id>/cancel` (`cancel_order`):
  - Validates that the order exists and belongs to the calling UID.
  - Rejects cancellation when the status is already in a terminal state (collected/completed/cancelled/refunded).
  - Marks the order as `cancelled` and restores `availableQuantity` for the corresponding offering, flipping its status back to `available` when appropriate.

- `POST /api/orders/validate` (`validate_order_qr`):
  - Supply owners submit `uid` plus the `qrToken` scanned from a student’s QR code.
  - Verifies that the QR token corresponds to an order for this owner and that it has not already been collected.
  - Marks the order as `collected` and sets `collectedAt`.

These routes underpin the student ordering carousel and the supply-owner QR validation tab.

### Supply owner tools (batches, announcements, analytics)

- `POST /api/supply/batches` and `GET /api/supply/batches/<uid>`:
  - Manage `supplyBatches` documents for each owner, tracking quantities, remaining quantities, expiration, and notes.

- `POST /api/supply/future-offerings` and `GET /api/supply/future-offerings/<uid>`:
  - Manage `futureOfferings` documents, representing scheduled upcoming prasadam announcements that power the supply-owner overview and announcements tab.

- `GET /api/supply/orders/<uid>`:
  - Returns recent orders for a specific supply owner’s offerings, again using an index-optional pattern (tries `order_by(createdAt)` and falls back if needed).

- `GET /api/supply/analytics/<uid>`:
  - Aggregates metrics across orders and offerings for a given owner, including:
    - `totalOrders`, `pendingOrders`, `collectedOrders`, `refundedOrders`, `totalFeesCents`, `uniqueStudents`, `activeOfferings`, `upcomingOfferings`.
  - These metrics are consumed directly by the supply-owner overview and analytics screens in `App.jsx`.

### Custom QR codes

- `POST /api/qrcodes` and `GET /api/qrcodes/<uid>`:
  - Provide a simple event-style QR code system using the `qrCodes` collection.
  - Each QR code document stores `ownerUid`, `qrToken`, `title`, `purpose`, optional `expiresAt`, and `createdAt`.
  - The frontend renders these as QR codes and lists them in the QR tools tab.

### Health check and diagnostics

- `GET /health`:
  - Simple JSON health check used by the frontend’s `healthCheck()` helper for connectivity diagnostics.

## Data model (Firestore collections)

Inferred from `api/app.py` and the frontend, the primary collections are:
- `users` – per-user profile documents (`uid`, `name`, `email`, `phoneNumber`, `address`, `subscription` metadata).
- `users_by_phone` / `users_by_email` – marker collections used solely for uniqueness enforcement.
- `loginHistory` – login events with `uid`, `phoneNumber`, timestamp, user agent, and IP address.
- `offerings` – prasadam offerings with availability window, quantity, status, fee information, and `ownerUid`.
- `orders` – individual student reservations linked to `uid`, `offeringId`, `ownerUid`, and `qrToken`.
- `supplyBatches` – supply-owner inventory batches.
- `futureOfferings` – scheduled future prasadam announcements.
- `qrCodes` – supply-owner generated QR codes for events or special purposes.

When introducing new features, reuse these collections where it makes sense (e.g., augmenting `orders` with additional fields) rather than creating parallel structures, and update both `api/app.py` and `src/api.js` together.
