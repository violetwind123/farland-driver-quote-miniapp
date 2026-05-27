# Farland Mini Program

Farland Mini Program is an advisor-led WeChat Mini Program for hotel requests, customer itinerary visibility, and internal driver quote coordination.

It is not a public ride-hailing marketplace. Customers see Farland-curated service options, not raw driver bidding.

## Current Scope

The current version supports:

- Customer-facing hotel booking entry.
- Customer-facing My Trip page.
- Operator request creation and request detail management.
- Driver quick quote by Mini Program card token.
- Operator review and customer publishing of driver quotes.
- Invite-only customer access to transfer quote detail.
- Customer quote selection as a request signal.
- Operator final driver confirmation or driver rejection.
- Customer-visible assigned driver details after operator confirmation.
- Customer-visible driver-unavailable notice and reselect flow after operator rejection.

Still out of scope:

- Payment.
- Live map or tracking.
- Customer self-dispatch.
- Public driver bidding.
- Customer access to raw `driver_quotes`.
- Full `transport_orders` backend.
- Automated SMS or external notification system.

## Core Product Flow

### Driver Quote Flow

```text
operator creates ride request
→ operator shares driver quote card
→ driver submits quote
→ operator reviews quote
→ operator publishes curated customer quote
→ customer views published quote
→ customer chooses a driver option
→ operator confirms driver or marks driver unavailable
```

### Customer Quote Visibility

Customers never read `driver_quotes` directly.

Customer-facing quote data comes from:

```text
customer_transport_quotes
```

Pricing is calculated in cloud functions:

```text
client_total = driver_quote_amount + Farland service fee
Farland service fee = driver_quote_amount * 10%
```

## Pages

### Entry And Auth

- `pages/index/index`
  - Preload / routing entry.
  - Routes driver, operator, and customer by access context.
- `pages/auth/login/login`
  - Operator login fallback.

### Customer

- `pages/hotel/request/request`
  - Default customer tab.
  - Hotel request UI.
- `pages/customer/home/home`
  - My Trip customer tab.
  - Shows customer-safe itinerary and transport summaries.
- `pages/customer/transfer-detail/transfer-detail`
  - Invite-bound customer transfer quote detail.
  - Shows published customer quotes.
  - Lets customer choose a driver option.
  - Shows pending confirmation, assigned driver, or driver-unavailable notice.
- `pages/customer/benefits/benefits`
  - Customer benefits page.

### Operator

- `pages/operator/dashboard/dashboard`
  - Operator control center.
- `pages/operator/request-hall/request-hall`
  - Request list by status.
- `pages/operator/create-request/create-request`
  - Creates simplified quote request.
- `pages/operator/request-detail/request-detail`
  - Request detail.
  - Share to driver.
  - Share to customer.
  - Review, reject, publish, confirm, or cancel.
- `pages/operator/driver-summary/driver-summary`
  - Regional driver/vehicle summary.
- `pages/operator/drivers-by-region/drivers-by-region`
  - Read-only driver and vehicle list for one region.

### Driver

- `pages/driver/quick-quote/quick-quote`
  - Token entry from shared Mini Program card.
- `pages/driver/home/home`
  - Driver personal center.

## Cloud Functions

### Access And Home

- `login`
- `checkEntryAccess`
- `getOperatorRequests`
- `getCustomerHome`
- `getDriverHome`

### Request And Invite

- `createRideRequest`
- `getRequestDetail`
- `createQuoteInvite`
- `createCustomerInvite`
- `getQuoteInviteByToken`
- `cancelRideRequest`

### Driver Quote

- `submitQuickQuote`
- `reviewDriverQuote`
- `createCustomerQuoteDraft`
- `publishCustomerQuotesBatch`
- `selectCustomerQuote`
- `selectDriverQuote`

### Driver Directory

- `getDriverProfile`
- `getDriversByRegion`
- `getDriverHome`
- `updateDriverVehicle`

## Database Collections

Core collections:

- `users`
- `drivers`
- `vehicles`
- `ride_requests`
- `quote_invites`
- `driver_quotes`
- `customer_invites`
- `customer_transport_quotes`
- `audit_logs`

Frontend pages should not directly read or write collections. Use cloud functions only.

## Key Rules

- Use `cloud.getWXContext().OPENID` for identity.
- Do not accept `OPENID` from frontend input.
- Do not use `wx.cloud.database()` in `miniprogram/`.
- Driver quote entry must remain:
  - `pages/driver/quick-quote/quick-quote?token=xxx`
- Customer transfer entry is invite-bound:
  - `pages/customer/transfer-detail/transfer-detail?request_id=xxx&invite_code=xxx`
- Customers can see only published/selected/confirmed customer quotes.
- Customers cannot see draft, withdrawn, rejected, or internal driver quotes.
- Operator final confirmation is required before driver phone and plate are shown.
- If a customer-selected driver becomes unavailable, customer sees a reselect notice.

## Deployment Checklist

1. Confirm `project.config.json` has:
   - `miniprogramRoot: "miniprogram/"`
   - `cloudfunctionRoot: "cloudfunctions/"`
2. Confirm `miniprogram/app.js` uses the correct CloudBase `env`.
3. Create required database collections.
4. Set collection permissions to cloud-function-only access.
5. Deploy updated cloud functions:
   - `checkEntryAccess`
   - `getRequestDetail`
   - `createCustomerInvite`
   - `reviewDriverQuote`
   - `createCustomerQuoteDraft`
   - `publishCustomerQuotesBatch`
   - `getCustomerTransportQuotes`
   - `selectCustomerQuote`
   - `selectDriverQuote`
   - `cancelRideRequest`
6. Reopen WeChat DevTools and clear cache after structural changes.
7. Confirm no frontend file uses `wx.cloud.database()`.

## Manual Test Checklist

### Operator

1. Login as operator.
2. Create a ride request.
3. Open request detail.
4. Share driver quote card.
5. Confirm driver quote appears after driver submission.
6. Reject an unselected quote and confirm it does not notify customer.
7. Publish a quote to customer.
8. Share customer card.
9. Confirm customer selection appears as `客户已选择`.
10. Confirm driver and verify customer sees assigned driver details.
11. Mark a customer-selected driver as unavailable and verify customer sees the reselect notice.
12. Cancel an eligible request and verify customer/driver-safe cancellation text.

### Customer

1. Open customer card with `request_id` and `invite_code`.
2. Confirm invite binds to the current WeChat identity.
3. Confirm published quotes render.
4. Select a driver.
5. Confirm UI changes to `待确认`.
6. After operator confirmation, confirm assigned driver details display.
7. After operator marks driver unavailable, confirm the reselect notice displays:
   - `司机因个人行程调整无法接待，Farland 已为您补偿20元，请您重新选择司机。`
8. Re-select another driver option.

### Driver

1. Open shared quick-quote card with valid token.
2. Submit driver, vehicle, and quote information.
3. Confirm existing driver profile prefills when available.
4. Confirm cancelled token shows cancellation message.
5. Confirm invalid token shows invalid quote link.
6. Confirm driver home remains a personal center, not an order hall.

## Validation Commands

```bash
node --check cloudfunctions/createCustomerInvite/index.js
node --check cloudfunctions/createCustomerQuoteDraft/index.js
node --check cloudfunctions/getCustomerTransportQuotes/index.js
node --check cloudfunctions/publishCustomerQuotesBatch/index.js
node --check cloudfunctions/reviewDriverQuote/index.js
node --check cloudfunctions/selectCustomerQuote/index.js
node --check miniprogram/pages/operator/request-detail/request-detail.js
node --check miniprogram/pages/customer/transfer-detail/transfer-detail.js
git diff --check
```
