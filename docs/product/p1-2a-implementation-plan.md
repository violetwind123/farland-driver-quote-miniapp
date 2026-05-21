# Farland P1.2A Implementation Plan

## Purpose

P1.2A is the smallest safe implementation slice for real customer-visible transportation quotes.

It proves this production rule:

```text
driver_quotes
-> operator review
-> customer_transport_quotes draft
-> operator batch publish
-> customer transfer-detail reads published customer_transport_quotes
```

This phase is read-only for customers. It does not implement customer quote selection or transport orders.

## Current Repo Reality

Customer pages already exist in the current project:

- `pages/customer/home/home`
- `pages/customer/transfer-detail/transfer-detail`
- `pages/customer/benefits/benefits`

Do not create duplicate customer pages.

Use the existing `pages/customer/transfer-detail/transfer-detail` page for read-only customer quote display.

Do not modify:

- `app.json`
- tabBar
- app entry routing
- driver quick-quote token flow

## Scope

Implement only P1.2A:

- `reviewDriverQuote`
- `createCustomerQuoteDraft`
- `publishCustomerQuotesBatch`
- `getCustomerTransportQuotes`
- minimal audit logging
- minimal operator UI in existing request detail page
- existing customer transfer-detail reads real published quotes

Do not implement yet:

- `selectCustomerQuote`
- `confirmTransportOrder`
- `transport_orders`
- payment
- map
- `withdrawCustomerQuotes`
- customer portal redesign
- subpackages
- Redis or external cache
- dashboard refactor
- driver home refactor

## Non-Negotiable Rules

- Customer pages must never read `driver_quotes`.
- Customer-facing cloud functions must never return `driver_quotes`.
- Farland service fee 10% must be calculated only in cloud functions.
- Frontend must not calculate `client_total`.
- Frontend must not pass or trust `openid`.
- Use `cloud.getWXContext().OPENID` inside cloud functions.
- Keep legacy `selectDriverQuote` flow intact.
- Do not remove existing `选择该司机` legacy logic for old requests.
- Do not add frontend `wx.cloud.database()`.

## Driver Quote Review State

Do not repurpose `driver_quotes.quote_status` for operator review.

Existing code already uses `quote_status` for legacy flow states such as:

- `submitted`
- `updated`
- `selected`
- `rejected`

Add separate review fields to `driver_quotes`:

```js
operator_review_status: "pending" | "approved" | "rejected",
operator_review_note: "",
operator_rejection_reason: "",
operator_reviewed_by: "",
operator_reviewed_by_openid: "",
operator_reviewed_at: "",
latest_customer_quote_id: "",
customer_quote_draft_count: 0
```

Keep existing `quote_status` unchanged.

## Customer Quote Collection

Create or use collection:

```text
customer_transport_quotes
```

Minimal fields:

```js
{
  request_id,
  source_driver_quote_id,
  customer_openid,

  quote_status, // draft | published

  title,
  operator_explanation,
  included_items,
  excluded_items,
  valid_until,
  is_recommended,

  driver_quote_amount,
  farland_service_fee_rate,
  farland_service_fee_amount,
  client_total,
  currency,

  vehicle_type_snapshot,
  vehicle_model_snapshot,
  seats_snapshot,
  luggage_capacity_snapshot,
  driver_name_snapshot,

  created_by,
  created_by_openid,
  created_at,
  updated_at,

  published_by,
  published_by_openid,
  published_at
}
```

Return compatibility alias from cloud functions:

```js
client_visible_total = client_total
```

Draft creation must be upsert-like for:

```text
request_id + source_driver_quote_id
```

If a draft already exists for the same driver quote and request, update it. Do not create duplicate drafts.

## Customer Access Assumption

The current demo does not have a full customer auth model.

For P1.2A:

- Use `customer_openid` when available.
- Allow operator preview only for `operator` or `super_admin`.
- If `customer_openid` is missing and no token/access mechanism exists yet, do not broadly expose quotes.
- Do not create a permissive fallback that lets any user read customer quotes.

Token-based customer access can be added later as a separate task.

## Cloud Functions

### `reviewDriverQuote`

Path:

```text
cloudfunctions/reviewDriverQuote/index.js
```

Input:

```js
{
  request_id,
  driver_quote_id,
  action: "approve" | "reject",
  review_note,
  rejection_reason
}
```

Rules:

- operator / super_admin only
- read `driver_quotes` by `driver_quote_id`
- verify `request_id` matches
- approve sets `operator_review_status = approved`
- reject sets `operator_review_status = rejected`
- rejection requires `rejection_reason`
- do not modify `quote_status`
- write audit log

### `createCustomerQuoteDraft`

Path:

```text
cloudfunctions/createCustomerQuoteDraft/index.js
```

Input:

```js
{
  request_id,
  driver_quote_id,
  title,
  operator_explanation,
  included_items,
  excluded_items,
  valid_until,
  is_recommended
}
```

Rules:

- operator / super_admin only
- require `driver_quotes.operator_review_status === "approved"`
- require positive driver quote price
- calculate 10% service fee in cloud function
- reject frontend-supplied `client_total`
- create or update one draft per `request_id + source_driver_quote_id`
- set `quote_status = draft`
- update `driver_quotes.latest_customer_quote_id`
- write audit log

Pricing:

```text
driver_quote_amount = driver_quotes.quote_price
farland_service_fee_rate = 0.1
farland_service_fee_amount = round(driver_quote_amount * 0.1, 2)
client_total = round(driver_quote_amount + farland_service_fee_amount, 2)
```

### `publishCustomerQuotesBatch`

Path:

```text
cloudfunctions/publishCustomerQuotesBatch/index.js
```

Input:

```js
{
  request_id
}
```

Rules:

- operator / super_admin only
- find all `customer_transport_quotes` where `request_id` and `quote_status = draft`
- reject if no drafts exist
- publish all drafts
- set `quote_status = published`
- set `published_by`, `published_by_openid`, `published_at`, `updated_at`
- write audit log
- return `published_count`

### `getCustomerTransportQuotes`

Path:

```text
cloudfunctions/getCustomerTransportQuotes/index.js
```

Input:

```js
{
  request_id
}
```

Rules:

- use `cloud.getWXContext().OPENID`
- verify `customer_openid` matches, or allow operator preview only for `operator` / `super_admin`
- return only published quotes
- limit quotes to max 3
- return `has_published_quotes`
- never read or return `driver_quotes`
- return empty state if none published

Return shape:

```js
{
  success: true,
  request_id,
  has_published_quotes,
  request_summary,
  quotes: [
    {
      _id,
      title,
      operator_explanation,
      included_items,
      excluded_items,
      valid_until,
      is_recommended,
      currency,
      driver_quote_amount,
      farland_service_fee_amount,
      client_total,
      client_visible_total,
      vehicle_type_snapshot,
      vehicle_model_snapshot,
      seats_snapshot,
      luggage_capacity_snapshot,
      driver_name_snapshot
    }
  ]
}
```

## Audit Logs

Use or create `audit_logs`.

Keep the first version minimal:

```js
{
  actor_openid,
  actor_user_id,
  actor_role,
  action,
  target_type,
  target_id,
  related_request_id,
  related_driver_quote_id,
  related_customer_quote_id,
  detail,
  created_at
}
```

Actions:

- `driver_quote_review_approved`
- `driver_quote_review_rejected`
- `customer_quote_draft_created`
- `customer_quote_draft_updated`
- `customer_quotes_published`
- `customer_quotes_read`

## Helper Deployment Rule

Cloud functions deploy from their own directories.

Do not assume a root-level `_shared` directory will automatically deploy with every function.

For P1.2A, either:

- place minimal `lib/auth.js` and `lib/audit.js` inside each new function directory, or
- use a known deploy step that copies shared helpers into each function directory.

Do not block P1.2A on a large shared-library refactor.

## Operator UI

Modify existing files only:

- `miniprogram/pages/operator/request-detail/request-detail.js`
- `miniprogram/pages/operator/request-detail/request-detail.wxml`
- `miniprogram/pages/operator/request-detail/request-detail.wxss`

Do not redesign the page.

Add minimal actions on each driver quote card.

If `operator_review_status` is missing or `pending`:

- `审核通过`
- `拒绝`

If `operator_review_status === "approved"` and no draft exists:

- `生成客户报价草稿`

If draft exists:

- show chip: `客户草稿已生成`

Add one quote-section-level button:

```text
发布客户报价
```

This calls:

```js
publishCustomerQuotesBatch({ request_id })
```

Feature flag:

```js
request.use_customer_quote_flow === true
```

If the flag is absent or false:

- keep current legacy UI
- keep current legacy `选择该司机` behavior

If the flag is true:

- show review / draft / publish actions
- optionally hide legacy select action for that request

## Customer UI

Modify existing files only:

- `miniprogram/pages/customer/transfer-detail/transfer-detail.js`
- `miniprogram/pages/customer/transfer-detail/transfer-detail.wxml`
- `miniprogram/pages/customer/transfer-detail/transfer-detail.wxss`

Do not create new customer pages.

Behavior:

- call `getCustomerTransportQuotes`
- if `has_published_quotes === false`, show:

```text
Farland 正在为您确认用车方案
```

- if quotes exist, show read-only quote cards
- hide selection button, or leave disabled / toast-only placeholder
- do not persist selection
- do not create `transport_orders`

## Duplicate Quote Drift

Before implementation finishes, check `submitQuickQuote` behavior.

The README says repeated submission for the same `request_id + driver_id` should update the original quote.

If current code returns conflict instead, document the drift or fix it in a separate small patch.

Do not mix that fix into P1.2A unless it becomes necessary for the P1.2A flow to work.

## Validation

Run:

```bash
node --check cloudfunctions/reviewDriverQuote/index.js
node --check cloudfunctions/createCustomerQuoteDraft/index.js
node --check cloudfunctions/publishCustomerQuotesBatch/index.js
node --check cloudfunctions/getCustomerTransportQuotes/index.js
git diff --check
git status --short
```

Confirm:

- no frontend `wx.cloud.database()`
- no frontend OPENID trust
- no `transport_orders`
- no `selectCustomerQuote`
- no `confirmTransportOrder`
- no payment / map
- legacy `selectDriverQuote` still works

## Acceptance Criteria

P1.2A is complete only if:

- operator can approve / reject a driver quote without changing legacy `quote_status`
- operator can create or update a customer quote draft from an approved driver quote
- operator can publish all drafts for a request in one action
- customer transfer-detail can fetch published quotes from `customer_transport_quotes`
- empty state is shown if nothing is published
- customer cannot see raw `driver_quotes`
- no customer selection is persisted
- no `transport_orders` are created
- no frontend database access is introduced
- no frontend `openid` trust is introduced
- legacy `selectDriverQuote` still works for non-customer-flow requests

## Future Phases

After P1.2A is stable:

### P1.2B

- `selectCustomerQuote`
- optimistic locking / conflict handling
- customer-visible selected state

### P1.2C

- `transport_orders`
- operator confirmation
- change / withdraw rules
- customer notification

### P1.2D

- payment
- map
- richer customer portal

