# Farland P1.1 Data Boundary And Customer Quote Flow

## Purpose

This document locks the product and technical boundary between internal driver quotes and customer-facing transportation quotes.

Current state:

```text
Driver quote flow works.
Operator can view and select driver quotes.
Customer-facing My Trip / Transfer Detail currently uses mock/demo data.
```

P1.1 is documentation and boundary alignment first. Do not write UI or backend code until this boundary is accepted.

## Core Rule

Customer-facing transportation information must be reviewed and curated by Farland operations before the customer sees it.

```text
Customer must never directly read driver_quotes.
Customer sees only reviewed, customer-safe, Farland-curated information.
```

Internal supply-side flow:

```text
ride_request -> driver_quotes -> operator review
```

Customer-visible flow:

```text
transfer_request -> customer_transport_quotes -> transport_orders
```

These two layers must remain separate.

## Entity Boundary

### `driver_quotes`

Internal supply quote record.

Visibility:

```text
operator / super_admin: read/write
driver: own submitted quote where appropriate
customer: no access ever
```

Customer pages and customer-facing cloud functions must never read `driver_quotes` directly.

Internal-only examples:

- driver phone snapshot
- operator notes
- raw quote pool
- non-selected driver quotes
- internal reliability judgment
- supplier private notes

### `transfer_requests`

Customer-facing transportation demand record.

Purpose:

```text
Stores what the customer needs.
Can be created by customer in future, or by operator on behalf of customer.
Visible to customer and operator.
```

Visibility:

```text
customer: own request only
operator: all requests
driver: no access
```

Typical customer-visible card:

```text
接送需求已提交
Boston College -> Boston Marriott Cambridge
2026-06-03 17:30
3人｜3件行李｜中文沟通优先
由 Farland 顾问代您提交
```

### `customer_transport_quotes`

Customer-facing curated quote record.

Purpose:

```text
Stores customer-visible transportation quote options reviewed and published by Farland operations.
```

Visibility:

```text
operator / super_admin: read/write
customer: read own published quotes only
driver: no access
```

This is the only quote collection customer pages can read.

Required fields include:

- `transfer_request_id`
- `source_ride_request_id`
- `source_driver_quote_id`
- `customer_id`
- `customer_openid`
- `title`
- `vehicle_class`
- `vehicle_desc`
- `capacity_text`
- `driver_profile_teaser`
- `driver_quote_amount`
- `farland_service_fee_rate`
- `farland_service_fee_amount`
- `client_total`
- `currency`
- `included_items`
- `excluded_items`
- `wait_time_rule`
- `cancel_rule`
- `operator_explanation`
- `is_recommended`
- `quote_status`
- `published_by`
- `published_at`
- `valid_until`

Customer-visible wording example:

```text
Farland 推荐｜商务 SUV 返程方案
司机报价：USD 220
Farland 服务费 10%：USD 22
预计总价：USD 242
推荐说明：性价比高，含 60 分钟等待，适合家长同行与行李较多场景。
```

### `transport_orders`

Customer-confirmed transportation order.

Purpose:

```text
Stores the final confirmed execution record after customer selects or confirms a quote.
```

Visibility:

```text
operator / super_admin: read/write
customer: read own order only
driver: assigned driver can see assigned execution info in future
```

Driver details release rule:

```text
Before assigned:
  driver phone and plate hidden

After assigned:
  driver display name, phone, vehicle model, and plate can be customer-visible
```

## Pricing Rules

Farland service fee is fixed at 10% for this phase.

```text
Farland service fee = driver quote amount * 10%
Client total = driver quote amount + Farland service fee
```

All pricing calculations must happen in Cloud Functions.

Forbidden:

- calculating service fee in WXML
- calculating service fee in frontend JS
- accepting frontend-supplied `client_total`
- allowing a customer page to derive totals from `driver_quotes`

Allowed operator edits:

- customer-facing explanation
- included / excluded items
- validity time
- recommended quote marker

## Operator Review Requirement

No customer-facing quote can be published automatically from `driver_quotes`.

Before publishing to customer, operator must confirm:

- driver quote is valid
- vehicle fits passenger and luggage count
- date and time are correct
- route is correct
- price is reasonable
- included / excluded items are clear
- customer-facing explanation is safe and understandable
- internal notes are not exposed
- driver phone and plate are hidden unless assignment is confirmed

Every customer-facing quote should include `operator_explanation`.

Examples:

```text
推荐：性价比最高，含 60 分钟等待，适合学生返校和家长同行。
推荐：空间更大，适合 4 人以上或行李较多的家庭。
推荐：司机熟悉 Boston 学校路线，服务稳定。
```

## State Machines

### `driver_quotes`

```text
submitted -> reviewed -> selected -> used_in_customer_quote
```

Terminal states:

```text
rejected
withdrawn
expired
cancelled
```

### `customer_transport_quotes`

```text
draft -> published -> viewed -> selected -> confirmed
```

Terminal states:

```text
expired
withdrawn
cancelled
declined
```

Customer can only see:

```text
published
viewed
selected
confirmed
```

Customer cannot see:

```text
draft
withdrawn
internal rejected quotes
```

### `transport_orders`

```text
pending_confirmation -> confirmed -> assigned -> in_progress -> completed
```

Terminal states:

```text
cancelled
failed
no_show
```

## Future Cloud Function Plan

Do not implement until explicitly requested.

### `publishCustomerQuote`

Permission:

```text
operator / super_admin only
```

Responsibilities:

1. Require operator or super_admin role.
2. Read `driver_quotes` by `driver_quote_id`.
3. Verify driver quote belongs to the related internal request.
4. Verify quote is not cancelled, rejected, or expired.
5. Calculate 10% service fee on server.
6. Create `customer_transport_quotes`.
7. Update `driver_quotes.quote_status = used_in_customer_quote`.
8. Write audit log.

Must not allow frontend-supplied totals.

### `getCustomerTransportQuotes`

Permission:

```text
customer own data only
operator preview only if explicitly allowed
```

Responsibilities:

1. Get `OPENID`.
2. Verify customer owns transfer request or has token access.
3. Query `customer_transport_quotes` where status is `published`, `viewed`, `selected`, or `confirmed`.
4. Mark quote as viewed if first opened.
5. Return customer-safe fields only.

Must never read or return `driver_quotes`.

### `selectCustomerQuote`

Permission:

```text
customer own quote only
```

Responsibilities:

1. Verify customer can access quote.
2. Verify quote status is `published` or `viewed`.
3. Set selected quote status to `selected`.
4. Mark other quotes for same transfer request as declined or unselected.
5. Create or prepare `transport_order` in `pending_confirmation`.
6. Write audit log.

### `confirmTransportOrder`

Permission:

```text
operator / super_admin, or customer if payment/confirmation flow exists later
```

Responsibilities:

1. Verify selected customer quote.
2. Create final `transport_order`.
3. Copy customer-safe execution data.
4. Keep driver details hidden until assigned.
5. Write audit log.

## Current Demo Boundary

Current code status:

```text
pages/customer/transfer-detail is demo/mock only.
getCustomerHome returns mock transportation quote data.
```

Rules:

- Do not connect Transfer Detail directly to `driver_quotes`.
- Transfer Detail must only read mock data or future `customer_transport_quotes`.
- My Trip home may show `已收到 3 个优选用车方案` and `查看用车方案`.
- My Trip home must not display all quote cards or raw quote pools.

Suggested code comment for future implementation:

```js
// P1.1 NOTE:
// This page currently uses demo data only.
// Production customer-facing quotes must come from customer_transport_quotes.
// Never read driver_quotes from customer-facing pages or customer-facing cloud functions.
```

## Security Rules

Mini Program frontend must not use:

```js
wx.cloud.database()
```

Customer frontend must not receive:

- `driver_quotes`
- `internal_cost`
- `margin`
- `operator_internal_note`
- raw quote pool
- supplier private notes
- driver phone before assignment
- vehicle plate before assignment

## Audit Logs

Important future events should write to `audit_logs`:

- operator reviewed driver quote
- operator published customer quote
- customer viewed quote
- customer selected quote
- transport order created
- driver assigned
- quote withdrawn
- request cancelled

## P1.1 Acceptance Criteria

Before implementation, documentation must state:

1. `driver_quotes` is internal only.
2. `customer_transport_quotes` is the only customer-facing quote source.
3. Service fee is calculated in Cloud Functions only.
4. Operator review is required before publishing customer quotes.
5. Transfer Detail is demo/mock only until `customer_transport_quotes` is implemented.
6. Customers cannot read `driver_quotes`.
7. My Trip home should not display raw quote pools.
8. Customers see reviewed itinerary, quote, and order data only.

## Future Implementation Order

When P1.1 implementation is explicitly requested:

1. Add shared role helper.
2. Add `publishCustomerQuote`.
3. Add `getCustomerTransportQuotes`.
4. Add `selectCustomerQuote`.
5. Add audit logs.
6. Only then connect Transfer Detail to `customer_transport_quotes`.

