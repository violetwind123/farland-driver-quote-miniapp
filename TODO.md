# TODO

## Current Focus

Settle admin import tooling around safe auth before building Web admin screens.

## P2 Phases

### Phase P2-A: Docs and schema

- [x] Add customer trip schema
- [x] Add customer trip import batch schema
- [x] Add transfer sample JSON
- [x] Add charter sample JSON
- [x] Add mixed sample JSON
- [x] Add P2 customer system product doc

### Phase P2-B: claimCustomerInvite + customer_trip_access

- [x] Add claimCustomerInvite
- [ ] Move invite binding out of selectCustomerQuote
- [ ] Standardize customer_trip_access naming around `bind_mode`
- [ ] Make getCustomerTransportQuotes read only after authorized access

### Phase P2-C: getCustomerHome real aggregation stabilization

- [ ] Stabilize customer_trips aggregation
- [ ] Hide trip_only history after visible_until
- [ ] Render charter only if present

### Phase P2-D: Operator customer directory

- [ ] Add adminListCustomers
- [ ] Add adminUpdateCustomerList
- [ ] Add operator customer directory page

### Phase P2-E: JSON import

- [x] Add importCustomerTripJSON dry_run
- [x] Add import apply
- [x] Add audit logs

## Recent Update

### 2026-05-26

- Feature completed: made driver quick quote repeat submissions update the original quote.
- Files changed:
  - `cloudfunctions/submitQuickQuote`
  - `TODO.md`
- Notes:
  - Existing `driver_quotes` for the same `request_id` and `driver_id` are now updated instead of returning 409.
  - Repeat submissions reset the quote status to `submitted` and write `resubmitted_at` for operator review.
  - The response now includes `quote_id` for both create and update paths.
- Next recommended task:
  - Deploy `submitQuickQuote`, then test a driver opening the same quote card and updating the amount / note.

### 2026-05-26

- Feature completed: defaulted customer invite claims to trip-only access.
- Files changed:
  - `cloudfunctions/claimCustomerInvite`
  - `TODO.md`
- Notes:
  - Missing or unknown bind mode now resolves to `trip_only` instead of `farland_profile`.
  - Explicit `farland_profile` claims still require a display name and keep the persistent save behavior.
  - This aligns invite entry with the product direction that viewing a shared trip should not imply saving to My Farland.
- Next recommended task:
  - Deploy `claimCustomerInvite`, then test opening an invite without an explicit bind mode and saving explicitly to My Farland.

### 2026-05-23

- Feature completed: added assigned driver fallback from selected driver and vehicle records.
- Files changed:
  - `cloudfunctions/getCustomerTransportQuotes`
  - `cloudfunctions/getCustomerHome`
  - `TODO.md`
- Notes:
  - Customer read paths still prefer `transport_orders`, but now fall back to `ride_requests.selected_driver_id` / `selected_vehicle_id` when the assigned snapshot is missing.
  - The fallback is only used for assigned / confirmed requests and returns customer-safe driver / vehicle fields.
  - Customer frontend still does not read `drivers`, `vehicles`, or `driver_quotes` directly.
- Next recommended task:
  - Deploy `getCustomerTransportQuotes` and `getCustomerHome`, then retest assigned driver display for the request that already has `selected_driver_id`.

### 2026-05-23

- Feature completed: restored operator driver confirmation success when assigned snapshot write fails.
- Files changed:
  - `cloudfunctions/selectDriverQuote`
  - `TODO.md`
- Notes:
  - `selectDriverQuote` now updates `driver_quotes` and `ride_requests` before attempting the `transport_orders` customer-visible snapshot.
  - If snapshot write fails, operator confirmation still succeeds and writes `transport_order_snapshot_write_failed` to `audit_logs`.
  - The response includes `transport_order_saved` so QA can distinguish assignment success from customer snapshot failure.
- Next recommended task:
  - Deploy `selectDriverQuote`, retry confirmation, then inspect `transport_order_saved` and `audit_logs.transport_order_snapshot_write_failed`.

### 2026-05-23

- Feature completed: switched assigned transport order writes to deterministic request-id documents.
- Files changed:
  - `cloudfunctions/selectDriverQuote`
  - `TODO.md`
- Notes:
  - `saveTransportOrder` now writes `transport_orders/{request_id}` directly with `set`.
  - This removes the remaining query/add branch from operator confirmation and makes repeated confirmation attempts idempotent by request.
- Next recommended task:
  - Deploy `selectDriverQuote`, retry confirmation, and check `transport_orders` document id equals the request id.

### 2026-05-23

- Feature completed: removed indexed sort dependency from assigned transport order upsert.
- Files changed:
  - `cloudfunctions/selectDriverQuote`
  - `TODO.md`
- Notes:
  - `saveTransportOrder` no longer uses `orderBy('updated_at', 'desc')` when checking for an existing `transport_orders` row by `request_id`.
  - This avoids CloudBase index-related failures during operator driver confirmation.
- Next recommended task:
  - Deploy `selectDriverQuote`, retry confirmation, and verify `transport_order_id` is returned.

### 2026-05-23

- Feature completed: surfaced operator driver confirmation diagnostics in the Mini Program UI.
- Files changed:
  - `miniprogram/pages/operator/request-detail/request-detail.js`
  - `TODO.md`
- Notes:
  - Operator confirmation now shows a modal with `failed_step` / `error_code` when `selectDriverQuote` returns a structured failure.
  - Cloud function invocation failures now show the actual `errMsg` / message and log the full error to console.
- Next recommended task:
  - Preview / upload the Mini Program, retry confirmation, and use the modal content to identify whether the cloud function is stale, failing, or returning a business-state rejection.

### 2026-05-23

- Feature completed: added step-level diagnostics for operator driver confirmation failures.
- Files changed:
  - `cloudfunctions/selectDriverQuote`
  - `TODO.md`
- Notes:
  - `selectDriverQuote` now returns `failed_step` and writes `select_driver_quote_failed` audit logs when an unexpected exception occurs.
  - This distinguishes auth, quote loading, request loading, related quote loading, driver / vehicle resolution, `transport_orders` write, and final selection record update failures.
- Next recommended task:
  - Deploy `selectDriverQuote`, retry confirmation, and inspect the returned `failed_step` plus `audit_logs.select_driver_quote_failed` if it still fails.

### 2026-05-23

- Feature completed: relaxed operator driver confirmation status gate to avoid false selection failures.
- Files changed:
  - `cloudfunctions/selectDriverQuote`
  - `TODO.md`
- Notes:
  - `selectDriverQuote` now rejects only terminal / blocked request statuses for operator confirmation.
  - This keeps duplicate confirmation protection for assigned / confirmed requests while avoiding false blocks from historical or unexpected non-terminal statuses.
- Next recommended task:
  - Deploy `selectDriverQuote`, retest operator driver confirmation, and verify the response includes `transport_order_id`.

### 2026-05-23

- Feature completed: added assigned-driver read-path observability for RC QA.
- Files changed:
  - `cloudfunctions/getCustomerTransportQuotes`
  - `cloudfunctions/getCustomerHome`
  - `TODO.md`
- Notes:
  - Customer read paths now write audit logs when `transport_orders` reads fail.
  - Assigned / confirmed requests that have no readable assigned snapshot now write `transport_orders_missing_for_assigned_request`.
  - Customer-facing responses stay safe; diagnostics are recorded in `audit_logs` for operator / developer QA.
- Next recommended task:
  - Deploy `getCustomerTransportQuotes` and `getCustomerHome`, retest assigned-driver display, then inspect `audit_logs` if customer pages still show `待确认`.

### 2026-05-23

- Feature completed: aligned customer transfer detail assigned-driver display for assigned and confirmed states.
- Files changed:
  - `cloudfunctions/getCustomerTransportQuotes`
  - `miniprogram/pages/customer/transfer-detail/transfer-detail.js`
  - `miniprogram/pages/customer/transfer-detail/transfer-detail.wxml`
  - `TODO.md`
- Notes:
  - Customer transfer detail now reads and displays `transport_orders` when request status is `assigned` or `confirmed`.
  - Quote options are hidden for both finalized statuses, so customer detail and My Trip use the same assigned-driver state boundary.
- Next recommended task:
  - Deploy `getCustomerTransportQuotes`, preview / upload the transfer detail page, then retest confirmed requests with existing `transport_orders` rows.

### 2026-05-23

- Feature completed: allowed temporary invite viewers to select a customer quote without saving to My Farland.
- Files changed:
  - `cloudfunctions/selectCustomerQuote`
  - `miniprogram/pages/customer/transfer-detail/transfer-detail.js`
  - `miniprogram/pages/customer/transfer-detail/transfer-detail.wxml`
  - `miniprogram/pages/customer/transfer-detail/transfer-detail.wxss`
  - `TODO.md`
- Notes:
  - Valid invite links can now select a quote using the current WeChat OPENID without claiming the invite or creating `users` / `customer_trip_access`.
  - Selection records `selected_by_openid`, `selected_at`, `selected_access_source`, and non-binding request metadata.
  - Saving to My Farland remains optional and still uses `claimCustomerInvite`.
- Next recommended task:
  - Deploy `selectCustomerQuote`, preview / upload the customer transfer detail page, then test temporary selection and cross-WeChat conflict behavior.

### 2026-05-23

- Feature completed: fixed customer-visible assigned driver details after operator confirmation.
- Files changed:
  - `cloudfunctions/selectDriverQuote`
  - `cloudfunctions/getCustomerHome`
  - `TODO.md`
- Notes:
  - `selectDriverQuote` now writes a customer-safe `transport_orders` assignment snapshot when an operator confirms a driver.
  - `getCustomerHome` now reads assigned / confirmed `transport_orders` and returns `assigned_transport` for saved trip cards.
  - Customer pages still read assigned driver details from `transport_orders`, not directly from `driver_quotes`.
- Next recommended task:
  - Deploy `selectDriverQuote` and `getCustomerHome`, then create a fresh assigned request or backfill `transport_orders` for any already-assigned QA request before retesting customer pages.

### 2026-05-21

- Feature completed: added Mini Program operator customer trip import UI.
- Files changed:
  - `miniprogram/app.json`
  - `miniprogram/pages/operator/dashboard/dashboard.js`
  - `miniprogram/pages/operator/dashboard/dashboard.wxml`
  - `miniprogram/pages/operator/customer-import/customer-import.js`
  - `miniprogram/pages/operator/customer-import/customer-import.json`
  - `miniprogram/pages/operator/customer-import/customer-import.wxml`
  - `miniprogram/pages/operator/customer-import/customer-import.wxss`
  - `TODO.md`
- Notes:
  - Operator dashboard now links to a JSON import page.
  - Import page supports JSON paste, dry-run preview, optional access grant by `customer_user_id` or existing `request_id`, and confirmed write.
  - The page uses `wx.cloud.callFunction` only and does not directly access the database.
- Next recommended task:
  - Deploy `importCustomerTripJSON`, then test sample JSON dry-run and confirmed write in WeChat DevTools.

### 2026-05-21

- Feature completed: documented Web admin auth decision path before continuing admin-web.
- Files changed:
  - `docs/product/admin-web-auth-plan.md`
  - `AGENTS.md`
  - `TODO.md`
  - `admin-web/package.json`
- Notes:
  - Web admin cannot assume the Mini Program `wx.cloud.callFunction` OPENID chain.
  - Production `admin-web` screens are paused until a Web auth strategy is chosen.
  - Recommended next step is a Mini Program operator import UI first, because it reuses current operator OPENID and `requireRole`.
  - `admin-web/package.json` is only a placeholder scaffold; dependencies were not installed.
- Next recommended task:
  - Build `pages/operator/customer-import/customer-import` for JSON paste, dry-run preview, and confirmed write.

### 2026-05-21

- Feature completed: added `importCustomerTripJSON` dry-run trip import cloud function.
- Files changed:
  - `cloudfunctions/importCustomerTripJSON`
  - `docs/product/context.md`
  - `docs/product/p2-customer-system-and-trip-json.md`
  - `TODO.md`
- Notes:
  - Operator/super_admin can validate `customer-trip-v1` JSON with default `dry_run`.
  - Real writes require `dry_run: false`.
  - The function rejects sensitive customer-unsafe keys and does not accept frontend OPENID.
  - On write it upserts `customer_trips`, optionally grants `customer_trip_access` via `customer_user_id` or existing `request_id`, and writes an audit log.
- Next recommended task:
  - Add a minimal operator import UI with JSON paste, dry-run preview, and confirm write.

### 2026-05-21

- Feature completed: added `customer_trip_access` write/read path for customer home visibility.
- Files changed:
  - `cloudfunctions/claimCustomerInvite`
  - `cloudfunctions/getCustomerHome`
  - `docs/product/context.md`
  - `docs/product/p2-customer-system-and-trip-json.md`
  - `TODO.md`
- Notes:
  - `claimCustomerInvite` now creates or updates `customer_trip_access` after explicit customer confirmation.
  - `getCustomerHome` now reads active `customer_trip_access`, filters expired `visible_until`, reads `customer_trips`, and keeps migration fallback for older invite/request data.
  - Trip-only access expires in Cloud Functions rather than only being hidden in UI.
- Next recommended task:
  - Add `importCustomerTripJSON` with `dry_run` so operations can create `customer_trips` from validated JSON.

### 2026-05-21

- Feature completed: documented P2 customer system and standard trip JSON foundations.
- Files changed:
  - `AGENTS.md`
  - `docs/product/context.md`
  - `docs/product/p2-customer-system-and-trip-json.md`
  - `docs/schemas/customer-trip.schema.json`
  - `docs/samples/customer-trip-transfer.sample.json`
  - `docs/samples/customer-trip-charter.sample.json`
  - `TODO.md`
- Notes:
  - Security rules are now explicit: no frontend database access, no frontend OPENID, Cloud Function role checks, and no customer access to internal quote data.
  - Customer binding remains explicit with profile vs trip-only choice and required display name.
  - P2 data direction is `customer_trip_access`, `customer_trips`, `visible_until`, standard JSON, and `dry_run` imports.
  - Subpackages, image cloud compression, maps, payment, notifications, and external spreadsheet sync remain deferred.
- Next recommended task:
  - Implement `customer_trip_access` and update `getCustomerHome` to read real customer trips by access rules.

### 2026-05-21

- Feature completed: split customer invite claiming from read-only published quote access.
- Files changed:
  - `cloudfunctions/claimCustomerInvite`
  - `cloudfunctions/getCustomerHome`
  - `cloudfunctions/getCustomerTransportQuotes`
  - `miniprogram/pages/customer/home/home.js`
  - `miniprogram/pages/customer/home/home.wxml`
  - `miniprogram/pages/customer/home/home.wxss`
  - `miniprogram/pages/customer/transfer-detail/transfer-detail.js`
  - `miniprogram/pages/customer/transfer-detail/transfer-detail.wxml`
  - `miniprogram/pages/customer/transfer-detail/transfer-detail.wxss`
  - `TODO.md`
- Notes:
  - Customer invite claim is now explicit through `claimCustomerInvite` with profile vs trip-only binding.
  - `getCustomerTransportQuotes` no longer claims invites and no longer reads `driver_quotes`.
  - Customer Transfer Detail is read-only for P1.2A; it no longer calls `selectCustomerQuote`.
  - `getCustomerHome` no longer returns a fake Farland Guest itinerary for unbound users.
  - Operators can preview the customer homepage from request detail and return through an operator-only button.
- Next recommended task:
  - Deploy `claimCustomerInvite`, `getCustomerHome`, and `getCustomerTransportQuotes`, then preview the invite flow in WeChat DevTools.

## Immediate Stabilization

- [x] Restore operator/driver/customer role-based entry behavior
- [x] Add customer invite card flow from operator request detail
- [x] Add customer quote read-only detail backed by `customer_transport_quotes`
- [x] Add customer driver selection signal
- [x] Add operator confirmation after customer chooses a driver
- [x] Add operator driver-unavailable rejection path after customer selection
- [x] Show assigned driver details on customer page after operator confirmation
- [x] Show customer reselect notice after selected driver becomes unavailable
- [x] Split customer invite claim from quote read
- [x] Gate customer selection UI for read-only P1.2A
- [x] Add operator-only customer homepage preview return path
- [x] Add operator dashboard shortcut to hotel booking page
- [ ] Verify tabBar works in WeChat DevTools
- [ ] Verify image asset paths exist
- [ ] Test hotel request submission
- [ ] Test quick-quote token entry
- [ ] Test operator dashboard
- [ ] Test customer invite claim and read-only quote viewing on deployed cloud functions
- [ ] Confirm no frontend wx.cloud.database()

## Phase 0: Documentation

- [x] Add `AGENTS.md`
- [x] Add `docs/product/context.md`
- [x] Add `docs/product/farland-student-transport-itinerary-spec.md`
- [x] Add `docs/product/p1-1-data-boundary-customer-quotes.md`
- [x] Add `docs/product/p2-customer-system-and-trip-json.md`
- [x] Add `docs/schemas/customer-trip.schema.json`
- [x] Add transfer and charter customer trip JSON samples
- [x] Add initial `TODO.md`

## Phase 1: ICT Demo Data

- [x] Add mock trip data through `getCustomerHome`
- [x] Add mock daily itinerary data through `getCustomerHome`
- [x] Add mock transfer request data through `getCustomerHome`
- [x] Add mock transport quote data through `getCustomerHome`
- [x] Add mock transport order data through `getCustomerHome`
- [x] Add mock charter service data through `getCustomerHome`
- [x] Add mock activity events through `getCustomerHome`

## Phase 2: ICT Demo Client UI

- [x] My Trip page
- [x] Day View timeline
- [x] Transfer request card
- [x] Quote cards
- [x] Confirmed ride card
- [x] Charter display card
- [x] Transfer detail page

## Phase 3: ICT Demo Display Logic

- [x] Show request card before quote
- [x] Show quote options after published
- [x] Navigate from My Trip summary to Transfer Detail
- [x] Show driver details only after assignment
- [x] Show customer selected quote as pending operator confirmation
- [x] Replace quote options with assigned driver card after operator confirmation
- [x] Show driver-unavailable notice and allow customer reselection

## Long-Term Roadmap

These items are post-demo product direction. Do not implement them during ICT demo stabilization unless explicitly requested.

### Transfer Backend

- [ ] Add shared role helper before P1.1 backend work
- [ ] Create `transfer_request` backend
- [x] Add `reviewDriverQuote`
- [x] Add `createCustomerQuoteDraft`
- [x] Add `publishCustomerQuotesBatch`
- [ ] Add `withdrawCustomerQuotes`
- [x] Add `getCustomerTransportQuotes`
- [x] Add `selectCustomerQuote`
- [x] Publish curated `transport_quote` options through `customer_transport_quotes`
- [x] Select quote as customer intent signal
- [ ] Confirm `transport_order`
- [ ] Assign driver
- [x] Write audit logs for invite, approve/reject, draft, publish, read, and select
- [ ] Add audit logs for withdraw/order creation

### Long-Term Transport Product

- [ ] Production customer quote selection flow
- [ ] Transparent service fee quote flow
- [ ] Charter service backend
- [ ] Charter segment timeline integration
- [ ] Driver assignment release rules
- [ ] Customer notifications
- [ ] Payment
- [ ] Live map

## Phase 5: QA And Release

- [ ] Deploy `getCustomerHome`
- [ ] Deploy `createCustomerInvite`
- [ ] Deploy `claimCustomerInvite`
- [ ] Deploy `importCustomerTripJSON`
- [ ] Deploy `reviewDriverQuote`
- [ ] Deploy `createCustomerQuoteDraft`
- [ ] Deploy `publishCustomerQuotesBatch`
- [ ] Deploy `getCustomerTransportQuotes`
- [ ] Deploy `selectCustomerQuote`
- [ ] Deploy updated `getRequestDetail`
- [ ] Deploy updated `selectDriverQuote`
- [ ] Test customer hotel request flow
- [ ] Test My Trip mock data rendering
- [ ] Test Transfer Detail quote cards
- [ ] Test customer invite claim options
- [ ] Test read-only published quote viewing
- [ ] Test quote selection UI stays hidden in P1.2A
- [ ] Test operator sees customer selected quote
- [ ] Test operator confirms driver and customer sees assigned driver details
- [ ] Test operator marks driver unavailable and customer sees reselect compensation notice
- [ ] Regression test driver quick-quote token flow
- [ ] Regression test operator dashboard and request detail
- [ ] Confirm no frontend direct database access
- [ ] Confirm miniprogram package size under 2MB

## Change Log

### 2026-05-21

- Feature completed: updated README, TODO, and product context for current customer quote flow.
- Files changed:
  - `README.md`
  - `TODO.md`
  - `docs/product/context.md`
- Notes:
  - README now documents hotel, My Trip, customer invite, operator quote publishing, customer selection, and operator confirmation/rejection.
  - Product context now marks P1.2A customer quote flow as implemented and clarifies that customer selection is not a confirmed order.
  - TODO now reflects completed P1.2A flow and the next QA/deployment tasks.
- Next recommended task:
  - Commit and push the documentation updates after review.

### 2026-05-21

- Feature completed: implemented customer quote selection and operator confirmation flow.
- Commit:
  - `bc435ce Implement customer quote selection and operator confirmation flow`
- Files changed:
  - `cloudfunctions/createCustomerInvite`
  - `cloudfunctions/reviewDriverQuote`
  - `cloudfunctions/createCustomerQuoteDraft`
  - `cloudfunctions/publishCustomerQuotesBatch`
  - `cloudfunctions/getCustomerTransportQuotes`
  - `cloudfunctions/selectCustomerQuote`
  - `cloudfunctions/getRequestDetail/index.js`
  - `cloudfunctions/selectDriverQuote/index.js`
  - `miniprogram/pages/operator/request-detail/*`
  - `miniprogram/pages/customer/transfer-detail/*`
  - `miniprogram/pages/customer/home/*`
  - `miniprogram/pages/index/*`
- Notes:
  - Operators can send both driver and customer Mini Program cards.
  - Customer invite links bind by `cloud.getWXContext().OPENID`.
  - Operator can publish curated customer quote cards from reviewed driver quotes.
  - Customer can choose a driver option, which remains pending until operator confirmation.
  - Operator confirmation assigns the driver and exposes customer-safe driver details.
  - Operator driver-unavailable rejection cancels the selected customer quote and shows a customer reselect notice.
  - Customer pages still do not read `driver_quotes` directly.
- Next recommended task:
  - Deploy all changed cloud functions, then run the full operator-driver-customer QA checklist in WeChat DevTools.

### 2026-05-21

- Feature completed: added invite-only customer access for transfer quote detail.
- Files changed:
  - `cloudfunctions/createCustomerInvite`
  - `cloudfunctions/getCustomerTransportQuotes`
  - `miniprogram/pages/customer/transfer-detail/transfer-detail.js`
  - `miniprogram/pages/customer/transfer-detail/transfer-detail.wxml`
  - `TODO.md`
- Notes:
  - Operators can create one-time customer invite links for a `ride_requests` record.
  - First customer access claims the invite with `cloud.getWXContext().OPENID` and creates or updates a `customer` user record.
  - Already-claimed invites can be reopened only by the same customer OpenID.
  - Transfer Detail now calls `getCustomerTransportQuotes` instead of mock `getCustomerHome` data.
  - Customer pages still read only `customer_transport_quotes`; they never read `driver_quotes`.
- Next recommended task:
  - Add minimal operator UI to create/copy customer invite links after quotes are published.

### 2026-05-21

- Feature completed: added P1.2A backend foundation cloud functions for reviewed customer quote publishing.
- Files changed:
  - `cloudfunctions/reviewDriverQuote`
  - `cloudfunctions/createCustomerQuoteDraft`
  - `cloudfunctions/publishCustomerQuotesBatch`
  - `cloudfunctions/getCustomerTransportQuotes`
  - `TODO.md`
- Notes:
  - No mini-program UI, app routing, tabBar, quick-quote, or legacy `selectDriverQuote` logic was changed.
  - New functions keep operator review state separate from legacy `driver_quotes.quote_status`.
  - Customer-facing quote reads use `customer_transport_quotes` and never read `driver_quotes`.
  - Helpers are local to each cloud function directory so deployment does not depend on root-level shared code.
- Next recommended task:
  - Implement the minimal operator request-detail controls for review, draft creation, and batch publish.

### 2026-05-21

- Feature completed: documented P1.1 data boundary between internal driver quotes and customer-facing curated quotes.
- Files changed:
  - `AGENTS.md`
  - `docs/product/context.md`
  - `docs/product/p1-1-data-boundary-customer-quotes.md`
  - `TODO.md`
- Notes:
  - `driver_quotes` is explicitly internal-only.
  - `customer_transport_quotes` is the only future customer-visible quote source.
  - Operator review is required before customer quote publishing.
  - Farland service fee 10% must be calculated in Cloud Functions only.
- Next recommended task:
  - Keep the current ICT demo stable; do not implement P1.1 backend until explicitly requested.

### 2026-05-21

- Feature completed: stabilized customer entry and simplified My Trip home for demo review.
- Files changed:
  - `miniprogram/app.json`
  - `miniprogram/pages/index/index.js`
  - `miniprogram/pages/hotel/request/request.js`
  - `miniprogram/pages/hotel/request/request.wxml`
  - `miniprogram/pages/hotel/request/request.wxss`
  - `miniprogram/pages/customer/home/home.wxml`
  - `docs/TEST_CASES.md`
- Notes:
  - Hotel page is now the first registered page.
  - Index remains only as token fallback and immediately routes normal entry to the hotel tab.
  - Hotel requests no longer silently submit placeholder contact data.
  - My Trip home now keeps quote/charter detail out of the homepage and uses `我的用车` as the summary entry.
- Next recommended task:
  - Run WeChat DevTools preview and manually verify tabBar, hotel request contact prompt, and transfer detail navigation.

### 2026-05-21

- Feature completed: added project AI instructions and transport product context docs.
- Files changed:
  - `AGENTS.md`
  - `docs/product/context.md`
  - `docs/product/farland-student-transport-itinerary-spec.md`
  - `TODO.md`
- Notes:
  - Farland pricing rule is now explicit: driver/fleet quote + Farland service fee 10%.
  - Client-facing transport is defined as curated service options, not raw driver bidding.
- Next recommended task:
  - Run manual QA using `docs/TEST_CASES.md`, then fix UI issues discovered in WeChat DevTools.
