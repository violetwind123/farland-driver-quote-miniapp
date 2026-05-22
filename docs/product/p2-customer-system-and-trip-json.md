# P2 Customer System And Trip JSON

## Purpose

P2 turns the customer side from demo itinerary cards into a real customer system. The goal is to make these three rules explicit:

```text
who the customer is
what trips the customer can see
how operations writes standardized trip data
```

This document is engineering guidance. It does not override `AGENTS.md`, the P1.1 quote boundary, or current ICT demo guardrails.

## Adopted Engineering Rules

### Security

- Mini-program frontend must not use `wx.cloud.database()`.
- Frontend must not pass `openid`.
- Cloud Functions must read `cloud.getWXContext().OPENID`.
- Operator functions must require `operator` or `super_admin`.
- Customer functions must verify invite ownership, customer ownership, or `customer_trip_access`.
- Customer pages and customer-facing Cloud Functions must not read `driver_quotes`.
- Customer-facing responses must not include:
  - `driver_quotes`
  - `internal_note`
  - `operator_internal_note`
  - `driver_cost`
  - `margin`
  - raw quote pools
  - supplier private notes
- Key actions must write `audit_logs`.

### Customer Binding

Customer binding is explicit, not fully silent.

```text
customer opens invite card
-> page reads invite_code and request_id
-> if unclaimed, show a lightweight choice
-> customer chooses one:
   1. 绑定 Farland 服务档案
   2. 仅查看本次行程
-> customer enters display_name
-> Cloud Function binds OPENID after confirmation
```

Required fields:

- `invite_code`
- `request_id`
- `bind_type`: `profile` or `trip_only`
- `display_name`

Frontend must not create identity. It only collects the choice and display name.

### Customer Trip Access

Use `customer_trip_access` to control what a customer can see.

Current implementation note:

- `claimCustomerInvite` creates or updates a `customer_trip_access` record when an invite is claimed.
- `getCustomerHome` reads active `customer_trip_access` first, filters expired `visible_until`, then reads `customer_trips` and related request summaries.
- During migration, `getCustomerHome` may still fall back to claimed invites or `ride_requests.customer_openid` for older requests without access records.

Recommended shape:

```js
{
  customer_openid: '',
  customer_user_id: '',
  trip_id: '',
  request_id: '',
  access_type: 'profile' | 'trip_only',
  visible_from: '',
  visible_until: '',
  status: 'active' | 'expired' | 'revoked',
  source_invite_id: '',
  created_by: '',
  created_at: '',
  updated_at: ''
}
```

Rules:

- `profile` access can include current and historical trips granted to the customer.
- `trip_only` access is limited to the specific trip/request and must hide after `visible_until`.
- Expired or revoked access is rejected in Cloud Functions, not only hidden in frontend UI.
- Backend records and audit logs remain after customer visibility ends.

## Customer Trips

Use `customer_trips` as the customer-facing trip aggregate. It should be curated and client-safe.

Recommended top-level fields:

- `trip_id`
- `customer_display_name`
- `trip_type`: `transfer`, `charter`, `hotel`, or `mixed`
- `title`
- `city`
- `date_start`
- `date_end`
- `advisor`
- `participants`
- `hotel_requests`
- `transport_requests`
- `charter_services`
- `daily_itinerary`
- `benefits`
- `status`

Customer-facing trip data must be suitable for display without exposing internal supply or margin details.

## Standard JSON Import

Future trip imports must use a validated JSON schema.

Files:

- `docs/schemas/customer-trip.schema.json`
- `docs/samples/customer-trip-transfer.sample.json`
- `docs/samples/customer-trip-charter.sample.json`

Import flow:

```text
operator pastes or uploads JSON
-> importCustomerTripJSON({ dry_run: true })
-> Cloud Function validates schema
-> Cloud Function previews create/update/delete impact
-> operator confirms
-> importCustomerTripJSON({ dry_run: false })
-> write customer_trips / customer_trip_access
-> write audit_logs
```

Rules:

- Dry run is required before writing.
- Free-form itinerary notes can be converted by AI, but the system writes only validated JSON.
- CloudBase collections remain the source of truth.
- External spreadsheets are not the master database.

Current implementation note:

- `importCustomerTripJSON` accepts `trip` or `trip_json`.
- The function defaults to `dry_run: true`; writes require `dry_run: false`.
- The function rejects sensitive keys such as `openid`, `driver_quotes`, `internal_note`, `driver_cost`, and `margin`.
- Optional access grant must use `access.customer_user_id` or `access.request_id`; frontend must not pass OPENID.
- When writing, the function upserts `customer_trips`, optionally upserts `customer_trip_access`, and writes `audit_logs`.

## Operator Customer List

The operator customer list can resemble a cloud spreadsheet, but it should behave like a controlled operational tool.

Allowed:

- searchable list
- filters
- row drawer
- safe editable fields
- batch update through Cloud Function
- optimistic lock with `expected_updated_at`
- dry-run import preview

Not allowed:

- frontend direct database writes
- editing `openid`
- editing role from customer list
- external spreadsheet as source of truth

## Deferred

Do not implement these until explicitly requested:

- subpackage refactor
- image cloud compression trigger
- Redis/cache layer
- payment
- live map
- full notification system
- full CRM
- external spreadsheet sync

## Implementation Order

1. Document customer system and standard JSON schema.
2. Add transfer and charter sample JSON files.
3. Build `customer_trip_access`.
4. Make `getCustomerHome` read real customer trips through access rules.
5. Build operator customer list.
6. Add `importCustomerTripJSON` with `dry_run`.
7. Later: subpackages, image processing, notifications, maps.
