# TODO

## Current Focus

Prepare the ICT demo version while preserving internal driver quote MVP.

## Immediate Stabilization

- [ ] Verify tabBar works in WeChat DevTools
- [ ] Remove custom tabBar config if no custom-tab-bar exists
- [ ] Verify image asset paths exist
- [ ] Simplify My Trip page for demo
- [ ] Keep Transfer Detail as optional hidden flow
- [ ] Test hotel request submission
- [ ] Test quick-quote token entry
- [ ] Test operator dashboard
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
- [ ] Replace request card with confirmed ride card after order confirmation
- [ ] Add selectable mock state for accepted quote

## Long-Term Roadmap

These items are post-demo product direction. Do not implement them during ICT demo stabilization unless explicitly requested.

### Transfer Backend

- [ ] Add shared role helper before P1.1 backend work
- [ ] Create `transfer_request` backend
- [ ] Add `reviewDriverQuote`
- [ ] Add `createCustomerQuoteDraft`
- [ ] Add `publishCustomerQuotesBatch`
- [ ] Add `withdrawCustomerQuotes`
- [ ] Add `getCustomerTransportQuotes`
- [ ] Add `selectCustomerQuote`
- [ ] Publish curated `transport_quote` options
- [ ] Select quote
- [ ] Confirm `transport_order`
- [ ] Assign driver
- [ ] Write `activity_event` records
- [ ] Add audit logs for approve/reject/draft/publish/withdraw/select/order creation

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
- [ ] Test customer hotel request flow
- [ ] Test My Trip mock data rendering
- [ ] Test Transfer Detail quote cards
- [ ] Test quote selection toast
- [ ] Regression test driver quick-quote token flow
- [ ] Regression test operator dashboard and request detail
- [ ] Confirm no frontend direct database access
- [ ] Confirm miniprogram package size under 2MB

## Change Log

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
