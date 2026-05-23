# P3 Release Candidate Execution Checklist

This checklist is for Release Candidate deployment and device QA. It does not define new product features.

## 1. Cloud Functions To Deploy

Critical cloud functions:

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

Optional if testing JSON import:

- `importCustomerTripJSON`

## 2. Mini Program Preview / Upload

Checklist:

- Pull latest `main`.
- Open WeChat DevTools.
- Compile successfully.
- Preview customer home.
- Preview customer transfer detail.
- Preview operator request detail.
- Preview driver quick quote.
- Upload experience version if QA passes.

## 3. Operator QA

Test:

1. Operator opens dashboard.
2. Operator creates ride request.
3. Operator generates driver quote card.
4. Operator sees driver submitted quote.
5. Operator reviews quote.
6. Operator creates customer quote draft.
7. Operator publishes customer quote.
8. Operator generates customer invite card.
9. Operator sees selected customer quote.

## 4. Driver QA

Test:

1. Driver opens quick quote card.
2. Driver submits quote.
3. Driver revisits quote page.
4. Operator sees quote.
5. Invalid / cancelled / expired token states are handled.

## 5. Customer QA

Test:

1. Customer opens invite card.
2. Customer sees temporary shared trip / quote.
3. Customer can view quote detail.
4. Customer cannot select quote before saving.
5. Customer saves to Farland trip.
6. Customer enters display name.
7. Customer can select quote after saving.
8. Customer My Trip shows saved trip.
9. Second WeChat behavior is safe.
10. Expired / revoked invite behavior is safe.

## 6. Security QA

Confirm:

- No frontend `wx.cloud.database()`.
- No frontend `OPENID` trust.
- Customer pages do not read `driver_quotes`.
- Customer pages do not expose `internal_note`.
- Customer pages do not expose `operator_internal_note`.
- Customer pages do not expose `driver_cost`.
- Customer pages do not expose `margin`.

## 7. Rollback Readiness

If customer invite flow breaks:

- Revert latest customer flow commit.
- Redeploy previous `claimCustomerInvite`, `getCustomerHome`, and `getCustomerTransportQuotes`.

If operator quote flow breaks:

- Revert request-detail UI / backend related commit.

If driver quote flow breaks:

- Revert quick-quote / `submitQuickQuote` changes.

Rollback rule:

- Do not delete production data during rollback unless explicitly approved.

## 8. QA Result Template

Cloud functions deployed:

- yes / no

Mini Program preview completed:

- yes / no

Operator QA:

- pass / fail

Driver QA:

- pass / fail

Customer QA:

- pass / fail

Security QA:

- pass / fail

Issues found:

- none / list

Release candidate decision:

- ready / not ready
