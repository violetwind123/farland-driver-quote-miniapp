# P2-B / P2-E Implementation Review

## Scope

This review inspects the current P2-B and P2-E implementation after P2-A documentation and schema standardization.

No product code, cloud functions, routing, tabBar, or Mini Program pages were changed for this review.

Reviewed areas:

- `cloudfunctions/claimCustomerInvite`
- `cloudfunctions/importCustomerTripJSON`
- `cloudfunctions/getCustomerHome`
- `cloudfunctions/getCustomerTransportQuotes`
- `cloudfunctions/selectCustomerQuote`
- customer Mini Program pages
- operator import Mini Program page

## Current Status

### claimCustomerInvite

Status: exists.

Current behavior:

- Reads caller identity from `cloud.getWXContext().OPENID` through local `getCaller`.
- Validates `invite_code` + `request_id`.
- Rejects expired invites.
- Rejects already-claimed invites when the claimed OPENID differs from the current OPENID.
- Accepts `bind_type`, currently normalized to `trip_only` or `profile`.
- Requires no frontend OPENID.
- Writes `customer_invites.status = claimed`.
- Writes `ride_requests.customer_openid/customer_name/customer_phone/customer_bind_type`.
- Creates or updates `users` only for `profile`.
- Upserts `customer_trip_access`.
- Writes `audit_logs` best-effort.

Gaps against P2-A standard:

- P2-A standard uses `bind_mode = trip_only | farland_profile`; implementation uses `bind_type/access_type = trip_only | profile`.
- Default `bind_type` is `profile`, while P2-A says card entry should default to `trip_only`.
- `display_name` falls back to invite/request/default names instead of requiring a customer-entered value at cloud-function level.
- `customer_trip_access` fields use `customer_openid/customer_user_id/access_type/source_invite_id`; P2-A target names are `openid/user_id/bind_mode/invite_id`.
- `customer_trip_access.trip_id` may be empty when the source request has no `customer_trip_id` or `trip_id`.
- Access upsert errors are swallowed, so invite claim can succeed without a visibility row.
- There is a small formatting issue around `related_request_id` indentation, not behaviorally significant.

Risk:

- Medium. The function centralizes binding, but naming/defaults differ from the P2-A standard and access creation can silently fail.

### importCustomerTripJSON

Status: exists.

Current behavior:

- Requires `operator` or `super_admin` through `requireRole`.
- Defaults to `dry_run: true`.
- Supports apply via `dry_run: false`.
- Accepts `trip` or `trip_json`.
- Performs custom validation for the older `customer-trip-v1` shape.
- Rejects sensitive keys such as `openid`, `driver_quotes`, `internal_note`, `driver_cost`, and `margin`.
- Upserts `customer_trips`.
- Optionally upserts `customer_trip_access` using `access.customer_user_id` or `access.request_id`.
- Writes audit log best-effort on apply.
- Does not accept frontend-provided OPENID as the customer identity.

Gaps against P2-A standard:

- P2-A schema now uses `schema_version = 1.0.0` and root fields such as `external_trip_id`, `start_at`, `end_at`, `transfer`, `charter`, `hotels`, `itinerary_days`, and `documents`.
- Implementation still validates the earlier `customer-trip-v1` shape with `trip_id`, `date_start`, `date_end`, `hotel_requests`, `transport_requests`, `charter_services`, and `daily_itinerary`.
- Implementation does not use the JSON Schema files under `docs/schema`.
- Function input is `trip` / `trip_json`; P2-A target documents `payload`.
- Access values use `access_type = trip_only | profile`, not `bind_mode = trip_only | farland_profile`.
- No import batch schema support yet.
- Semantic validations such as `start_at < end_at`, timezone validity, and document visibility rules are not implemented.

Risk:

- High for future imports. The function works for the previous sample format but is now out of sync with the committed P2-A schema standard.

### getCustomerHome

Status: exists and has real aggregation.

Current behavior:

- Reads OPENID server-side.
- Reads `users`, `customer_trip_access`, `customer_invites`, and `ride_requests`.
- Marks expired active `customer_trip_access` rows as `expired`.
- Computes visible request IDs from active access plus migration fallbacks.
- Reads `customer_trips` for visible trip IDs.
- Reads `customer_transport_quotes` for visible request IDs.
- Aggregates `daily_itinerary`, `hotel_requests`, `charter_services`, and `benefits` into the existing home response shape.
- Returns empty state instead of fake guest itinerary when no access exists.

Gaps against P2-A standard:

- Uses `access_type = profile` rather than `bind_mode = farland_profile`.
- Treats missing `visible_until` as visible forever, including for trip-only rows. P2-A says `trip_only` must have `visible_until`.
- Uses claimed invites and `ride_requests.customer_openid` as migration fallback. This is acceptable temporarily but should be retired after migration.
- Does not currently populate `transportation_appointments` or `transport_orders` from `customer_trips`.
- Charter visibility is structurally safe because empty arrays render as empty, but richer render rules are not fully standardized.
- Customer trip field names follow older `date_start/date_end/daily_itinerary` samples, not the newer P2-A schema `start_at/end_at/itinerary_days`.

Risk:

- Medium. The access-control direction is right, but schema/naming drift means future imports may not render as intended.

### getCustomerTransportQuotes

Status: exists and is mostly read-only.

Current behavior:

- Reads caller OPENID through helper.
- Allows operator preview.
- If request is not owned by caller, verifies `invite_code` is already claimed by that caller.
- Reads only `customer_transport_quotes`.
- Does not read `driver_quotes`.
- Marks `published` quotes as `viewed`.
- Reads assigned transport from `transport_orders`, not `driver_quotes`.
- Writes `customer_quotes_read` audit log best-effort.

Gaps against P2-A standard:

- Authorization still relies on `ride_requests.customer_openid` and `customer_invites`, not `customer_trip_access`.
- It does not expose an `access_state` / `binding_required` response for unclaimed invite states.
- It does not consult `customer_trip_access.visible_until`.

Risk:

- Medium. It no longer silently claims invite and avoids `driver_quotes`, but the future source-of-truth access model is not fully enforced.

### selectCustomerQuote

Status: exists and contains identity-binding behavior.

Current behavior:

- Reads OPENID server-side.
- Selects `customer_transport_quotes`.
- If `ride_requests.customer_openid` is missing and `invite_code` is present, it:
  - reads `customer_invites`,
  - accepts `unused` invites or invites already claimed by the same OPENID,
  - writes `ride_requests.customer_openid/customer_name/customer_phone`,
  - marks `customer_invites.status = claimed`.
- Does not create `customer_trip_access`.
- Writes `customer_quote_selected` audit log.

Risk:

- High technical debt. This directly violates the P2-A target boundary that `selectCustomerQuote` must not perform identity binding in the final architecture.

Recommended handling:

- Do not change it blindly because current customer selection may be a deployed compatibility path.
- Next fix should gate identity binding behind migration compatibility or remove it only after `claimCustomerInvite` is fully deployed and customer pages never call selection before claim.

### Mini Program Frontend

Status: no direct database access found.

Findings:

- Search of `miniprogram/` found no `wx.cloud.database()` usage.
- Customer pages call `claimCustomerInvite` for explicit invite claim.
- Transfer detail no longer calls `selectCustomerQuote`; customer quote selection UI is effectively read-only and shows a contact-advisor toast.
- Operator import page calls `importCustomerTripJSON`.

Potential concern:

- Operator import page currently targets the implemented `customer-trip-v1` function contract, not the newly documented P2-A `1.0.0` schema contract.

## Required Fixes

1. Align naming before more features:
   - Decide whether implementation migrates to `bind_mode = trip_only | farland_profile`.
   - If yes, update functions and migration notes together.

2. Align import contract:
   - Update `importCustomerTripJSON` to validate `docs/schema/customer-trip.schema.json`.
   - Accept P2-A `schema_version = 1.0.0`.
   - Support `customer-trip-import-batch.schema.json` or explicitly defer batch import.

3. Remove identity binding from `selectCustomerQuote`:
   - After `claimCustomerInvite` is deployed and pages enforce claim before reads/selections.
   - Keep a migration note for legacy invite links.

4. Make `getCustomerTransportQuotes` authorize via `customer_trip_access`:
   - Use invite only as bootstrap or migration fallback.
   - Respect `visible_until`.

5. Make `getCustomerHome` schema-compatible:
   - Support P2-A `start_at/end_at`, `hotels`, `itinerary_days`, `transfer`, and `charter`.
   - Keep compatibility for old `date_start/date_end` fields while migration is active.

## Recommended Implementation Order

1. Deploy and smoke-test current `claimCustomerInvite`, `getCustomerHome`, `getCustomerTransportQuotes`, and `importCustomerTripJSON` before any refactor.
2. Decide canonical naming: `profile` vs `farland_profile`, `access_type` vs `bind_mode`.
3. Update `importCustomerTripJSON` to the new P2-A schema first, because import is not yet a customer-critical path.
4. Update operator import page to match the new schema and show schema version clearly.
5. Add `customer_trip_access` authorization to `getCustomerTransportQuotes`.
6. Remove or migration-gate binding behavior from `selectCustomerQuote`.
7. Stabilize `getCustomerHome` rendering for transfer, charter, mixed, hotels, documents, and visibility.
8. Only then begin `adminListCustomers` / customer directory work.

## Do-Not-Change List

- Do not change tabBar or app routing while fixing access semantics.
- Do not modify driver quick-quote token flow.
- Do not expose `driver_quotes` to customer pages.
- Do not make external spreadsheets the source of truth.
- Do not build production `admin-web` screens until Web auth is settled.
- Do not add payment, maps, push notification, Redis/cache, or full CRM in this phase.

## Answers To Review Questions

1. Does `claimCustomerInvite` exist?
   - Yes.

2. Does `claimCustomerInvite` handle trip-only, profile, display name, same OPENID reopen, different OPENID rejection?
   - Partially. It handles `trip_only` and `profile`, accepts/display-name fallback, allows same OPENID reopen, rejects different OPENID. It does not use `farland_profile` naming and does not strictly require display name in cloud function.

3. Does `importCustomerTripJSON` exist?
   - Yes.

4. Does `importCustomerTripJSON` support dry-run, apply, schema validation, audit logs, no direct AI write?
   - Partially. It supports dry-run/apply, custom validation, audit logs, and operator confirmation path. It does not validate against the newly committed P2-A JSON Schema files.

5. Does `getCustomerHome` correctly read access, hide trip-only after visible_until, render charter only if present, avoid internal notes?
   - Partially. It reads access and expires rows with elapsed `visible_until`. It treats missing `visible_until` as visible. It does not intentionally return internal notes, and empty charter arrays are safe. Rendering is not yet aligned to the new P2-A schema.

6. Does `selectCustomerQuote` still bind invite identity?
   - Yes. This is high-priority technical debt.

7. Does any Mini Program frontend use `wx.cloud.database()`?
   - No results found.

8. Does any frontend pass OPENID?
   - No explicit frontend OPENID pass was found in the reviewed customer/operator import paths.

9. Are customer pages reading `driver_quotes` anywhere?
   - No customer page direct read was found. Customer-facing quote cloud function also does not read `driver_quotes`.
