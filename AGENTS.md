# Farland Mini Program Agent Instructions

## Product Positioning

Farland is an advisor-led travel operation mini-program for high-end student and family travel. It is not a public ride-hailing marketplace.

For stable product context, read:

- `docs/product/context.md`
- `docs/product/p1-1-data-boundary-customer-quotes.md`
- `docs/product/farland-student-transport-itinerary-spec.md`
- `docs/product/p2-customer-system-and-trip-json.md`
- `docs/product/p2-customer-system-trip-json.md`
- `docs/product/admin-web-auth-plan.md`

## Current ICT Demo Priority

For the current ICT demo, prioritize:

- hotel booking page visual stability
- My Trip page as a clean customer itinerary page
- customer-safe assigned transportation display
- points, benefits, and advisor contact
- preserving the internal driver quote MVP

Do not implement unless explicitly requested:

- full customer quote selection flow
- `transfer_request` backend
- `transport_quote` backend
- `transport_order` backend
- payment
- live map
- customer self-dispatch
- customer driver bidding

Keep Transfer Detail as an optional or hidden demo flow, not the primary customer homepage.

## P1.1 Data Boundary

For customer-facing transportation quote work, follow `docs/product/p1-1-data-boundary-customer-quotes.md`.

Non-negotiable boundary:

```text
driver_quotes = internal supply quotes for operator review
customer_transport_quotes = customer-visible curated quotes after operator publish
transport_orders = confirmed customer transportation orders
```

Do not connect customer pages or customer-facing cloud functions directly to `driver_quotes`.

Any customer-visible quote must be published by an operator first. Farland service fee 10% must be calculated in Cloud Functions, not frontend JS or WXML.

P1.1 quote publishing workflow:

```text
driver_quotes submitted
-> operator reviews each quote one by one
-> approved quote becomes customer_transport_quotes draft
-> operator edits customer-visible explanation
-> operator batch publishes selected draft quotes
-> customer can view published quotes
```

Customers can only see `published`, `viewed`, `selected`, or `confirmed` customer quotes. Customers never see `draft`, `withdrawn`, `rejected`, or internal driver quotes.

Operators may withdraw `published` or `viewed` customer quotes with `withdraw_reason`. Selected quotes cannot be silently withdrawn; they require customer notification or a quote-change flow. Confirmed quotes require order cancellation or modification flow.

Every approve, reject, publish, and withdraw action must write an audit log.

Client-facing transport should feel like curated Farland service options, not raw driver bidding. Operations can manage driver quotes, assignments, substitutions, and internal notes, but clients should see a clean service flow:

```text
transfer_request -> transport_quote -> transport_order
```

## Non-Negotiable Product Rules

- Do not expose raw driver quote pools to clients.
- Do not describe the product as driver bidding, ride hailing, nearby drivers, or instant dispatch.
- Driver details, phone numbers, vehicle plate numbers, and exact assignment information are client-visible only after assignment is real.
- Internal cost, margin, internal notes, supplier private notes, and fallback logic are never client-visible.
- Client-facing quote cards must show:
  - driver quote
  - Farland service fee at 10%
  - estimated total
- The Farland service fee should be presented as service coordination, not hidden markup.
- Clients should see their request immediately after submission, even if Farland is still sourcing options.
- Quote selected does not mean driver assigned.
- Confirmed order does not always mean driver details are released.

## Client-Facing Vocabulary

Use:

- 接送需求已提交
- Farland 正在为您确认用车方案
- 已收到优选用车方案
- 司机报价
- Farland 服务费 10%
- 预计总价
- 已选择方案，等待最终确认
- 接送已预约
- 已分配司机
- 由 Farland 严选车队提供

Avoid:

- 司机抢单
- 司机竞价
- 最低价司机
- 附近司机
- 立即叫车
- 保证升级
- 保证最低价
- 保证有车

## Development Rules

- Keep changes narrowly scoped to the requested files.
- Do not rewrite app routing or tabBar unless explicitly requested.
- Do not modify the existing driver quick-quote token flow unless explicitly requested.
- Do not modify quote submission, driver selection, or cancellation cloud functions unless explicitly requested.
- Do not add frontend direct database access. Mini-program pages must not use `wx.cloud.database()`.
- Frontend must not pass `openid`; Cloud Functions must read `cloud.getWXContext().OPENID`.
- Role permissions are enforced in Cloud Functions. Frontend role checks are only UI hints.
- Prefer mock data first before connecting backend logic.
- Keep UI iOS-like, premium, restrained, and clean.
- Use Farland primary color `#6672A8`.
- Avoid OTA-style promotion layouts, heavy shadows, and large purple blocks.
- After completing a feature, update `TODO.md` with date, feature completed, files changed, notes, and the next recommended task.

## Customer System Guardrails

- Before implementing P2 customer trip features, read `docs/product/p2-customer-system-trip-json.md`.
- Customer binding is explicit, not fully silent:
  `invite_code` -> choose `绑定 Farland 服务档案` or `仅查看本次行程` -> enter display name -> Cloud Function binds OPENID.
- `display_name` is required for customer invite claim.
- Future customer trip visibility must use `customer_trip_access`.
- Trip-only access must use `visible_until`; expired trips are hidden from customer reads by Cloud Functions, while backend records and audit logs remain.
- Future itinerary import must use validated standard JSON and must support `dry_run` before writing.
- Operator customer management can look like a cloud table, but CloudBase collections remain the source of truth.
- Do not build production `admin-web` screens until the Web auth strategy in `docs/product/admin-web-auth-plan.md` is chosen.
- Do not create duplicate customer pages.
- Do not let customer pages read `driver_quotes`.
- Do not use external spreadsheets as the source of truth.
- AI-generated JSON must be validated before import.
- Invite binding should be centralized in future `claimCustomerInvite`.
- `selectCustomerQuote` must not perform identity binding in the final architecture.
- Do not implement subpackage refactors, image cloud compression triggers, payment, live map, notifications, full CRM, or external spreadsheet sync unless explicitly requested.

## Current Architecture Guardrails

- Customer visible tabs are `酒店预订` and `我的行程`.
- Driver quote flow remains hidden behind shared quote cards:
  `pages/driver/quick-quote/quick-quote?token=xxx`
- Operator backend remains internal and should not appear in customer navigation.
- `app.js` must only initialize CloudBase and must not auto-route by role.

## Testing Expectations

After code changes:

- Run syntax checks for changed JavaScript files where possible.
- Search mini-program frontend for `wx.cloud.database()` if data access is touched.
- Verify customer UI does not expose internal cost, margin, internal notes, or raw driver quote pools.
- Verify driver quote card path still opens quick-quote with token.
- Verify package-size-sensitive image assets remain compressed.
