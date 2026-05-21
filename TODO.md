# TODO

## Current Focus

Stabilize the customer quote selection and operator confirmation flow after P1.2A implementation.

## Immediate Stabilization

- [x] Restore operator/driver/customer role-based entry behavior
- [x] Add customer invite card flow from operator request detail
- [x] Add customer quote read-only detail backed by `customer_transport_quotes`
- [x] Add customer driver selection signal
- [x] Add operator confirmation after customer chooses a driver
- [x] Add operator driver-unavailable rejection path after customer selection
- [x] Show assigned driver details on customer page after operator confirmation
- [x] Show customer reselect notice after selected driver becomes unavailable
- [ ] Verify tabBar works in WeChat DevTools
- [ ] Verify image asset paths exist
- [ ] Test hotel request submission
- [ ] Test quick-quote token entry
- [ ] Test operator dashboard
- [ ] Test full customer quote selection flow on real deployed cloud functions
- [ ] Confirm no frontend wx.cloud.database()

## Phase 0: Documentation

- [x] Add `AGENTS.md`
- [x] Add `docs/product/context.md`
- [x] Add `docs/product/farland-student-transport-itinerary-spec.md`
- [x] Add `docs/product/p1-1-data-boundary-customer-quotes.md`
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
- [ ] Test quote selection pending state
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
