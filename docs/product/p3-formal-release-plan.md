# P3 Formal Release Candidate Plan

This plan defines the release candidate boundary for moving the Farland Mini Program from prototype / MVP into formal version preparation.

No new product feature is required by this plan. Formal release work should focus on deployment, data readiness, permissions, QA, and rollback readiness.

## 1. Current Stable Scope

The current stable product scope includes:

- Hotel request page
- Customer invite card
- Temporary invite view
- Save to Farland trip
- Customer quote detail
- Save-before-select quote flow
- Operator request detail
- Driver quote submission
- Customer home / My Trip
- Customer trip JSON import foundation

## 2. Production Definition

The mini program can be treated as a formal production-ready version only when:

- Customer can reliably enter through an advisor-shared card.
- Customer can view trip / quote content safely.
- Customer can save trip to My Farland.
- Operator can generate customer invite.
- Operator can review and publish customer quote.
- Driver quote flow remains stable.
- No customer page exposes internal data.
- Cloud functions are deployed and tested.
- Manual QA checklist passes.

## 3. Must-Fix Before Formal Release

Required before formal release:

- Cloud functions redeployed:
  - `claimCustomerInvite`
  - `getCustomerHome`
  - `getCustomerTransportQuotes`
  - `selectCustomerQuote`
  - `importCustomerTripJSON` if using trip JSON import
- Verify customer temporary invite view.
- Verify save-before-select flow.
- Verify My Trip saved trip behavior.
- Verify operator invite generation.
- Verify driver quote submission.
- Verify quote amount formatting.
- Verify customer data security.
- Verify no frontend `wx.cloud.database()`.
- Verify no frontend `OPENID` trust.
- Verify no customer `driver_quotes` exposure.

## 4. Database / Collections Checklist

### `users`

- Purpose: stores operator, driver, and customer profile records used for identity and role-aware access.
- Already used: yes.
- Required for formal release: yes.
- Sensitive fields not returned to customer pages: internal role metadata, private phone values not intended for the customer, internal status notes.

### `ride_requests`

- Purpose: stores advisor / operator-created transportation requests.
- Already used: yes.
- Required for formal release: yes.
- Sensitive fields not returned to customer pages: internal notes, operator notes, driver quote pool references, internal cost, margin, fallback logic.

### `driver_quotes`

- Purpose: stores internal supply quotes submitted by drivers for operator review.
- Already used: yes.
- Required for formal release: yes, for internal operator workflow only.
- Sensitive fields not returned to customer pages: all raw driver quote records, driver private notes, internal costs, quote review metadata, non-published supplier data.

### `customer_invites`

- Purpose: stores advisor / operator-generated invite access for customer card entry.
- Already used: yes.
- Required for formal release: yes.
- Sensitive fields not returned to customer pages: internal creator metadata, revoked / expired operational details beyond customer-safe status text.

### `customer_trip_access`

- Purpose: stores customer access grants for saved trips and trip-only visibility.
- Already used: yes.
- Required for formal release: yes.
- Sensitive fields not returned to customer pages: raw OpenID bindings for other users, audit metadata, internal operator notes.

### `customer_transport_quotes`

- Purpose: stores operator-curated customer-visible transportation quote options.
- Already used: yes.
- Required for formal release: yes.
- Sensitive fields not returned to customer pages: draft / withdrawn / rejected quotes, internal driver quote linkage, operator-only review notes, margin.

### `customer_trips`

- Purpose: stores customer-visible itinerary records and imported trip JSON output.
- Already used: yes.
- Required for formal release: yes, if My Trip is part of the formal customer flow.
- Sensitive fields not returned to customer pages: raw import payloads, AI validation errors, internal advisor notes, supplier-private fields.

### `transport_orders`

- Purpose: stores confirmed or assigned transportation order state after customer quote selection and operator confirmation.
- Already used: partially / foundation.
- Required for formal release: required if assigned driver details are shown as production behavior.
- Sensitive fields not returned to customer pages: internal cost, margin, fallback supplier logic, unassigned driver candidates, cancellation internals.

### `hotel_requests`

- Purpose: stores customer hotel request submissions.
- Already used: yes.
- Required for formal release: yes, for current hotel request page scope.
- Sensitive fields not returned to customer pages: internal handling notes, supplier private notes, margin, non-customer-facing processing metadata.

### `audit_logs`

- Purpose: stores audit records for operator actions and sensitive workflow transitions.
- Already used: yes.
- Required for formal release: yes.
- Sensitive fields not returned to customer pages: all audit log records and operator action metadata.

## 5. Cloud Function Deployment Checklist

### Critical

- `login`
- `createCustomerInvite`
- `claimCustomerInvite`
- `getCustomerHome`
- `getCustomerTransportQuotes`
- `selectCustomerQuote`
- `createCustomerQuoteDraft`
- `publishCustomerQuotesBatch`
- `reviewDriverQuote`
- `submitQuickQuote`
- `getQuoteInviteByToken`
- `getOperatorRequests`
- `getOperatorDashboardSummary`
- `createRideRequest`

### Optional / Later

- `importCustomerTripJSON`
- `adminListCustomers`
- `adminUpdateCustomerList`

## 6. Customer Flow QA

QA flow:

```text
Advisor creates request
-> operator generates customer invite
-> customer opens invite card
-> customer views temporary trip / quote
-> customer saves to Farland trip
-> customer selects quote
-> operator sees selected quote
-> operator confirms driver / order
```

Pass checks:

- Customer can open the advisor-shared card.
- Temporary invite view shows customer-safe trip / quote content.
- Customer can save to My Farland with display name.
- Customer cannot persistently select quote before saving.
- Customer can select quote after saving.
- Customer home / My Trip shows saved trip content.
- Customer quote amounts show two decimals.
- Customer never sees internal cost, margin, internal notes, raw driver quote pool, or private supplier notes.

Fail checks:

- Invite card cannot open.
- Quote detail shows blank totals, `NaN`, or raw integer formatting where money should be fixed to two decimals.
- Customer can select quote before saving.
- Customer page exposes `driver_quotes`, internal notes, driver cost, or margin.
- Saved trip is not visible in My Trip after successful claim.

## 7. Operator Flow QA

QA flow:

```text
operator creates request
-> sends quote invite to drivers
-> driver submits quote
-> operator reviews quote
-> operator creates customer quote draft
-> operator publishes customer quote
-> operator generates customer invite
-> customer views / saves / selects
```

Pass checks:

- Operator can create request.
- Request appears in operator request hall.
- Request detail loads reliably.
- Driver quote card can be generated.
- Submitted driver quotes appear in request detail.
- Operator can review quote and create customer quote draft.
- Operator can publish customer quote.
- Operator can generate customer invite.
- Operator can see customer selected quote after selection.
- Selection / confirmation buttons are visually prominent and functional.

Fail checks:

- Request creation fails.
- Request detail cannot load.
- Driver quote card token is invalid.
- Review, draft, publish, or invite generation actions fail.
- Operator page loses customer invite area or driver quote flow.

## 8. Driver Flow QA

QA flow:

```text
driver receives quote card
-> opens quick quote
-> submits quote
-> revisits quote page
-> quote updates or shows current submitted status
```

Pass checks:

- Driver can open shared quick-quote card by token.
- Token entry remains `pages/driver/quick-quote/quick-quote?token=xxx`.
- Driver can submit quote.
- Submitted quote appears for operator review.
- Revisiting the quote page shows current submitted status or allows the intended update path.
- Invalid, expired, or cancelled token states show customer-safe / driver-safe messaging.

Fail checks:

- Token card cannot open.
- Submission fails.
- Driver sees customer private information, other drivers' quotes, internal notes, or operator margin.
- Operator cannot see submitted quote.

## 9. Security QA

Must confirm:

- Customer cannot read `driver_quotes`.
- Customer cannot read `internal_note`.
- Customer cannot read `operator_internal_note`.
- Customer cannot read `driver_cost`.
- Customer cannot read `margin`.
- Invite expired / revoked behavior is handled safely.
- Wrong `OPENID` behavior for saved trip blocks unauthorized access.
- Operator preview behavior does not create customer identity binding.
- No frontend database access.
- Frontend does not pass trusted `OPENID`; cloud functions must read `cloud.getWXContext().OPENID`.
- Customer pages only show published, viewed, selected, or confirmed customer-visible quotes.

## 10. Manual Deployment Steps

1. Pull latest `main`.
2. Deploy required cloud functions in WeChat DevTools / CloudBase console.
3. Rebuild / preview mini program.
4. Test with operator account.
5. Test with driver account.
6. Test with customer WeChat account.
7. Upload experience version.
8. Record QA results.

## 11. Rollback Plan

If customer invite flow breaks:

- Revert latest customer flow commit.
- Redeploy previous `claimCustomerInvite`, `getCustomerTransportQuotes`, and `getCustomerHome`.

If operator quote flow breaks:

- Revert request-detail UI-related commit.
- Redeploy affected operator cloud functions only if backend behavior changed.

If driver quote flow breaks:

- Revert `submitQuickQuote` / quick-quote-related change.
- Redeploy `submitQuickQuote` and preview the driver quick-quote page again.

Rollback rules:

- Keep database data.
- Do not delete records during rollback unless explicitly approved.
- Prefer redeploying the last known good cloud function version over manual database mutation.
- Record rollback commit, deployed cloud function versions, and QA result after rollback.

## 12. Known Deferred Items

These are not required for formal release:

- payment
- live map
- push notifications
- full CRM
- external spreadsheet sync
- admin web
- subpackage refactor
- Redis/cache
- automatic AI import
- full hotel API integration

## 13. Release Decision Checklist

Formal release can proceed only if:

- All critical cloud functions deployed.
- Customer invite QA passes.
- Save-before-select QA passes.
- Driver quote QA passes.
- Operator publish QA passes.
- Security QA passes.
- No known P0/P1 issue remains.
