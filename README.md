Farland Driver Quote Mini Program is an internal WeChat Mini Program for Farland operator-to-driver quote collection.

## MVP Scope

The product is not a public ride-hailing platform. Current MVP only supports:

- Operator creates a simplified quote request.
- Operator shares a Mini Program quote card to driver WeChat groups.
- Driver opens quick quote by token.
- Driver submits or views quote result.
- Operator reviews quotes and selects one driver.
- Operator may cancel a request with a structured cancellation reason.
- Driver home is a personal center, not an order hall.

Out of scope for now:

- Customer quote
- Dispatch order
- Payment
- Map or tracking
- Finance/margin tools
- Driver available order hall

## Pages

### Auth

- `pages/auth/login/login`

### Operator

- `pages/operator/dashboard/dashboard`
  - Lightweight control center.
  - Loads summary only.
- `pages/operator/request-hall/request-hall`
  - Loads request list by tab.
- `pages/operator/create-request/create-request`
  - Creates simplified quote request.
- `pages/operator/request-detail/request-detail`
  - Shows request, invite/share button, quotes, selection, cancellation, quote summary copy.
- `pages/operator/driver-summary/driver-summary`
  - Loads regional driver/vehicle summary only.
- `pages/operator/drivers-by-region/drivers-by-region`
  - Read-only driver and vehicle list for one region.

### Driver

- `pages/driver/quick-quote/quick-quote`
  - Token entry from shared Mini Program card.
- `pages/driver/home/home`
  - Driver personal center: profile, WeCom hint, vehicle info, current quotes, selected orders.

## Cloud Functions

- `login`
- `getOperatorRequests`
  - `mode: "summary"` returns dashboard summary only.
  - `mode: "requests"` returns request list for request hall.
  - `mode: "driver_summary"` returns regional driver summary.
- `createRideRequest`
- `getRequestDetail`
- `createQuoteInvite`
- `getQuoteInviteByToken`
- `submitQuickQuote`
- `selectDriverQuote`
- `cancelRideRequest`
- `getDriverHome`
- `updateDriverVehicle`
- `getDriverProfile`
- `getDriversByRegion`

## Database Collections

Use exactly these six collections:

- `users`
- `drivers`
- `vehicles`
- `ride_requests`
- `quote_invites`
- `driver_quotes`

Recommended production permission:

- Frontend pages should not directly read/write collections.
- All collections should be accessible through cloud functions only.
- No `wx.cloud.database()` should appear in `miniprogram/` frontend files.

## Key Rules

- Driver quote entry must be:
  - `pages/driver/quick-quote/quick-quote?token=xxx`
- Shared quote cards must never route drivers to operator pages.
- `openid` must come from `cloud.getWXContext().OPENID`.
- Frontend must not send `openid`, `driver_id`, or `request_id` for quote submission.
- `getQuoteInviteByToken` must not return:
  - `internal_note`
  - other driver quotes
  - customer price
  - margin
  - operator internal fields
- One `request_id + driver_id` has at most one active quote record; repeated submissions update the existing quote.
- `driver_quotes` must save driver and vehicle snapshots.

## Deployment Checklist

1. Confirm `project.config.json` has:
   - `miniprogramRoot: "miniprogram/"`
   - `cloudfunctionRoot: "cloudfunctions/"`
2. Confirm `miniprogram/app.js` uses the correct CloudBase `env`.
3. Create the six database collections.
4. Set collection permissions to cloud-function-only access.
5. Deploy each cloud function with dependencies installed in cloud.
6. Reopen WeChat DevTools and clear cache after structural changes.
7. Confirm no frontend file uses `wx.cloud.database()`.

## Manual Test Checklist

### Operator

1. Login as operator.
2. Dashboard loads summary only.
3. Tap each summary card and verify it opens request hall with the correct tab.
4. Tap driver information and verify it opens driver summary.
5. Create a quote request.
6. Open request detail.
7. Confirm visible share button appears only after token is ready.
8. Share quote card and confirm path includes quick-quote token.
9. Select one quote; selected quote becomes `selected`, others become `rejected`, request becomes `assigned`.
10. Cancel an eligible request with reason; old invite becomes cancelled.
11. Copy quote summary from request detail.

### Driver

1. Open shared quick-quote card with valid token.
2. Unregistered driver submits driver, vehicle, and quote information.
3. Registered driver sees own driver and vehicle profile.
4. Driver cannot submit again after final result where submission is locked.
5. Driver sees selected result if selected.
6. Driver sees not-selected result if rejected.
7. Cancelled token shows cancellation message, not operator dashboard.
8. Invalid token shows invalid quote link.
9. Driver home shows profile, WeCom hint, vehicle info, current quotes, and selected orders.
10. Vehicle edit is locked when active quoting or selected orders exist.
