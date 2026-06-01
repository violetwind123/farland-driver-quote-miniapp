# Farland Single Transfer Production Readiness Review

## 1. Review Scope

This document records the current production-readiness baseline and remaining gaps for the single-transfer workflow.

It reflects the current `main` state after these commits:

- `8f86a50 Make driver confirmation require transport order snapshot`
- `e9508d6 Auto-claim advisor invites for registered customers`
- `08f38fe Allow operators to assign existing customers`
- `9589d0c Read assigned transport orders by request id`

This is not a new feature spec. It is the execution baseline for the next production hardening tasks.

## 2. Required Deployment Baseline

For the current single-transfer RC hardening baseline, these cloud functions must be deployed together:

```text
selectDriverQuote
getCustomerTransportQuotes
getCustomerHome
claimCustomerInvite
assignCustomerToRideRequest
searchCustomersForOperator
getRequestDetail
```

Reason:

- `selectDriverQuote` owns final driver confirmation and the canonical `transport_orders/{request_id}` snapshot.
- `getCustomerTransportQuotes` and `getCustomerHome` own customer-facing assigned driver reads and `assigned_transport_source`.
- `claimCustomerInvite` owns registered-customer auto-link and explicit invite save.
- `assignCustomerToRideRequest` and `searchCustomersForOperator` own operator manual customer assignment.
- `getRequestDetail` owns operator request detail and customer assignment visibility.

Frontend preview / upload must include:

```text
pages/customer/home/home
pages/customer/transfer-detail/transfer-detail
pages/operator/request-detail/request-detail
```

For a fresh environment or full single-transfer QA, also verify the baseline chain:

```text
login
createRideRequest
createQuoteInvite
submitQuickQuote
reviewDriverQuote
createCustomerQuoteDraft
publishCustomerQuotesBatch
createCustomerInvite
selectCustomerQuote
cancelRideRequest
```

## 3. Target Single-Transfer Workflow

The final workflow should be:

```text
operator creates ride request
-> operator sends driver quote card
-> driver submits quote
-> driver quote returns to operator request detail
-> operator reviews driver quote
-> operator creates customer quote draft
-> operator publishes customer-visible quote
-> customer opens shared card
-> customer selects quote
-> customer selection returns to operator request detail
-> operator confirms driver
-> transport_orders is created as execution snapshot
-> customer sees assigned driver / vehicle / phone
-> trip is completed
-> operator sends review card
-> customer submits review
-> review links back to actual driver / service quality
```

The product must continue to feel like advisor-led Farland service coordination, not a public ride-hailing marketplace.

## 4. Truth Source Rules

The formal data boundaries are:

```text
ride_requests = customer demand / operational request
driver_quotes = internal supplier quotes for operator review
customer_transport_quotes = customer-visible curated quote options
transport_orders = assigned driver / vehicle / execution snapshot
customer_trip_access = customer My Trip access
ride_service_reviews = post-trip service feedback
```

Customer pages must not read or expose raw `driver_quotes`, internal cost, margin, internal notes, supplier private notes, or raw quote pools.

## 5. Completed Production Baseline

### 5.1 Driver Confirmation Snapshot

Completed in `8f86a50`.

Current baseline:

- `selectDriverQuote` writes `transport_orders/{request_id}` as the deterministic execution snapshot.
- Driver confirmation does not return degraded success when the snapshot path fails.
- The response includes `transport_order_saved: true` only after the snapshot path succeeds.
- Assigned / confirmed requests support idempotent same-quote confirmation and repair of missing same-quote snapshots.

Remaining concern:

- Operator UI still needs a visible transport order health / repair section.

### 5.2 Assigned Driver Display

Completed in `565e736` and hardened in `9589d0c`.

Current baseline:

- Customer Home and Transfer Detail can show driver, vehicle, and phone after operator confirmation.
- `getCustomerHome` and `getCustomerTransportQuotes` now read `transport_orders/{request_id}` before using the legacy query path.
- The response includes `assigned_transport_source`:
  - `transport_orders`
  - `fallback_driver_vehicle`
  - `none`

Remaining concern:

- Fallback remains necessary for legacy or incomplete data, but formal QA should treat `fallback_driver_vehicle` as a warning state.

### 5.3 Registered Customer Auto-Link

Completed in `e9508d6` and hardened in `08f38fe`.

Current baseline:

- Existing registered customers can open an advisor-shared trip card and automatically save / link the request to My Farland.
- The frontend does not pass `OPENID`; `claimCustomerInvite` resolves identity through CloudBase context.
- Unregistered customers still use temporary viewing or explicit save / registration.
- `customer_invites.claimed_openid` is no longer treated as an exclusive card lock for all viewers.

Remaining concern:

- Manual QA should cover multiple WeChat users opening the same valid invite.

### 5.4 Operator Manual Customer Assignment

Completed in `08f38fe`.

Current baseline:

- Operators can search active customer users through `searchCustomersForOperator`.
- Operators can assign an existing customer to a ride request through `assignCustomerToRideRequest`.
- Assignment writes `customer_trip_access` with `granted_source: "operator_manual"`.
- `ride_requests` keeps customer summary fields for compatibility.
- Request Detail includes a `客户归属` section.

Remaining concern:

- Request Detail should later show customer history and richer customer context, but this is not required for the current RC hardening step.

## 6. Remaining Business Logic Gaps

### Gap A: Request Status Machine Is Incomplete

Required formal statuses:

```text
quoting
quoted
customer_published
customer_selected
assigned
confirmed
in_progress
completed
cancelled
```

Required status transitions:

```text
createRideRequest -> quoting
submitQuickQuote -> quoted
publishCustomerQuotesBatch -> customer_published
selectCustomerQuote -> customer_selected
selectDriverQuote -> assigned
operator second confirmation -> confirmed
operator starts service / service day -> in_progress
operator marks done -> completed
cancelRideRequest -> cancelled
```

Current risk:

Some pages infer status from the existence of quotes or transport snapshots instead of a complete `ride_requests.status` progression.

### Gap B: Customer Quote Selection Concurrency

Current product rule:

```text
Temporary invite viewers can view and select a customer-visible quote.
Only one final selected customer quote should win per request.
```

Remaining risk:

`selectCustomerQuote` still needs stronger transaction or compare-and-set protection for near-simultaneous selection by multiple viewers.

Target behavior:

```text
First valid selection wins.
Same OPENID re-selecting the same quote is idempotent.
Different OPENID or different quote after selection returns conflict.
```

### Gap C: Operator Transport Order Health / Repair UI

Operator Request Detail should show execution snapshot health:

```text
transport order snapshot: exists / missing / fallback / incomplete
assigned driver snapshot
assigned_transport_source
repair action if snapshot is missing or incomplete
```

Target repair behavior:

```text
If ride_requests.status is assigned but transport_orders/{request_id} is missing,
operator can trigger repair from the selected driver quote.
```

This is an operator safety tool, not a customer feature.

### Gap D: Ride Request Execution Fields Are Incomplete

Formal creation fields should include:

```text
customer name / customer reference
service date
pickup time
pickup location
dropoff location
passengers
luggage
vehicle requirement
city / region
flight number
school name
hotel name
customer-visible note
internal note
```

Current risk:

Customer pages can still show `待确认` or `-` because the creation flow does not always collect structured execution fields.

### Gap E: Post-Trip Review Is Not Implemented

The P5 service review plan exists, but the implementation is still pending.

Required collections:

```text
service_review_invites
ride_service_reviews
service_review_events
```

Required cloud functions:

```text
createRideReviewInvite
getRideReviewContext
submitRideReview
listRideReviewsForOperator
```

Important rule:

Reviews must link to `transport_orders`, not raw `driver_quotes`, because the customer reviews the actual completed service.

### Gap F: Today Card Still Contains Mock-Based Itinerary Projection

Customer Home has a P4 Today Card experience, but its current Day 1 content is still partly mock-based.

Production direction:

```text
customer_trip_access
+ ride_requests
+ transport_orders
+ customer_trips / itinerary_days
-> customer-visible Today Card
```

Driver, vehicle, and phone information must continue to come from `transport_orders`.

### Gap G: Service Completion Lifecycle Is Missing

`assigned` means the driver is assigned. It does not mean the ride is complete.

Formal service lifecycle should support:

```text
assigned = driver assigned
confirmed = pre-departure confirmation completed
in_progress = service in progress
completed = service completed
cancelled = request cancelled
```

Review eligibility should start after `completed`, or after an operator manually marks the service complete.

### Gap H: Operator Customer Search Has First-100 Coverage Risk

Current baseline:

```text
searchCustomersForOperator
-> users.where({ role: "customer", status: "active" }).limit(100)
-> in-function keyword filtering
```

Current risk:

When active customers exceed 100, operators may search for a real customer and get no result because the matching customer was not included in the first 100 rows.

Production direction:

```text
1. Prefer exact lookup by phone / wechat_id / customer_profile_id when keyword looks exact.
2. Support paginated customer search or prefix-indexed normalized fields.
3. Track zero-result search rate and customer total count.
4. Do not expose OPENID to the frontend.
```

This is a scalability and operations-risk gap, not a customer-facing feature.

## 7. Monitoring And Audit Checklist

The current production-hardening baseline should be monitored through cloud-function logs, `audit_logs`, and periodic server-side audit jobs.

### 7.1 Key Health Metrics

Track:

```text
assigned_requests_without_transport_order
assigned_transport_fallback_rate
transport_orders_missing_for_assigned_request
transport_orders_read_failed
select_driver_quote_failed_count
duplicate_active_trip_access_count
invite_claim_role_conflict_count
customer_selected_unconfirmed_age
operator_customer_search_zero_rate
auto_claim_success_rate
```

Suggested interpretation:

- Any assigned request without `transport_orders/{request_id}` is a critical issue.
- `assigned_transport_source = fallback_driver_vehicle` should be treated as a warning, not a normal steady state.
- `customer_selected_quote_id` should be used for monitoring customer-selected / operator-unconfirmed requests until the status machine is completed.
- A rising customer-search zero-result rate may indicate the first-100 search limit is affecting operators.

### 7.2 Recommended Audit Jobs

Recommended future audit cloud functions:

```text
auditAssignedTransportHealth
auditCustomerTripAccess
auditCustomerSelectionLag
auditInviteClaims
auditDriverQuoteOrphans
auditSearchCoverage
```

Minimum checks:

```text
ride_requests.status in assigned/confirmed -> transport_orders.doc(request_id) exists
transport_orders.doc(request_id) has driver_name / driver_phone / vehicle_model
customer_trip_access has no duplicate active invite access for the same request/invite/openid
only one active primary_customer access exists per request/customer assignment
customer_selected_quote_id does not stay unconfirmed beyond the operating SLA
expired or revoked invites do not create new access
operator customer searches do not show a persistent high zero-result rate
```

### 7.3 Operational Handling

If an assigned request is missing `transport_orders/{request_id}`:

```text
1. Treat the request as snapshot-unhealthy.
2. Do not delete production records.
3. Repair from the selected driver quote and selected request metadata.
4. Write an audit log for the repair source and repaired_at time.
5. Recheck customer pages and assigned_transport_source.
```

If duplicate active `customer_trip_access` rows are found:

```text
1. Keep the canonical operator_manual primary row when present.
2. For invite access, keep the earliest valid active row.
3. Revoke redundant active rows instead of deleting them.
4. Write audit logs for any repair.
```

If registered-customer auto-link fails:

```text
1. Check whether the current user is an active customer profile.
2. Check ROLE_CONFLICT cases.
3. Check whether customer_trip_access was created with granted_source = invite_auto.
4. Confirm the frontend did not pass or trust OPENID.
```

## 8. Recommended Implementation Priority

Use this order:

```text
P0-B: Complete ride_requests status transitions
P0-C: Add customer quote selection concurrency guard
P1-C: Add operator transport order health / repair UI
P1-D: Improve operator customer search coverage beyond first-100 in-memory filtering
P2-A: Standardize ride request execution fields
P2-B: Add assigned / confirmed / in_progress / completed lifecycle actions
P3-A: Implement P5 service review MVP
P4-A: Replace mock Today Card with real trip/order projection
```

Do not re-implement already completed baseline items unless QA finds a concrete defect.

## 9. Do-Not-Do Before P0/P1 Are Stable

Do not implement these before status, concurrency, and execution snapshot health are stable:

```text
payment
live map
push notification
public review wall
full CRM
admin web
driver marketplace ranking
AI sentiment analysis
automatic rating incentives
external spreadsheet sync as source of truth
```

## 10. QA Focus For Next RC Pass

### Assigned Driver Snapshot

Check:

```text
operator confirms driver
transport_orders/{request_id} exists
assigned_transport_source = transport_orders
customer sees driver / vehicle / phone
operator can identify fallback or missing snapshot state
```

### Customer Access

Check:

```text
unregistered viewer can temporarily view valid invite
registered customer auto-saves valid invite
operator can manually assign existing customer
same invite can be opened by multiple valid viewers
customer_trip_access controls My Trip visibility
```

### Operator Customer Assignment

Check:

```text
operator searches active customers
search results never include operators / drivers / inactive users
operator assigns customer to ride request
customer_trip_access.granted_source = operator_manual
old active primary customer access is revoked when replacing the primary customer
assigned customer can see the request in My Trip
```

### Customer Quote Selection

Check:

```text
customer selected quote appears in operator request detail
conflicting second selection returns conflict
same customer repeat selection is idempotent
operator confirms the driver linked to the selected customer quote
```

### Status Machine

Check each stage after implementation:

```text
quoting
quoted
customer_published
customer_selected
assigned
confirmed
in_progress
completed
cancelled
```

### Deployment Verification

Check:

```text
all required deployment baseline functions are redeployed
customer home frontend is uploaded / previewed
customer transfer detail frontend is uploaded / previewed
operator request detail frontend is uploaded / previewed
docs/design-assets remains untracked and uncommitted
```

## 11. Next Recommended Task

The next code task should be:

```text
P1-C: Add operator transport order health / repair UI
```

Suggested minimal scope:

```text
cloudfunctions/getRequestDetail/index.js
miniprogram/pages/operator/request-detail/request-detail.js
miniprogram/pages/operator/request-detail/request-detail.wxml
miniprogram/pages/operator/request-detail/request-detail.wxss
待办事项.md
```

Goal:

```text
operator can see whether the customer-visible assigned driver data comes from:
- transport_orders
- fallback_driver_vehicle
- none
```

Do not start post-trip review until transport order health, request status machine, and customer quote selection conflict handling are stable.
