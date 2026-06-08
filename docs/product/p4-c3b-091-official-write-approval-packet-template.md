# P4 C3B · 091 Official Write Approval Packet Template

> Status: template only. This document is not approval to write production data,
> publish, upload, clean historical data, change permissions, or delete data.
>
> Target trip: `2026XBC091`
> Target document id: `bf757c4c6a2054f800350a925147b32e`

Use this packet immediately before asking for the official C3B write approval.
Every field below should be filled from read-only checks, local validation, or
simulator verification before any production mutation.

## 1. Target Identity

- Environment:
- Collection: `customer_trips`
- Document id: `bf757c4c6a2054f800350a925147b32e`
- `trip_no` readback:
- `external_trip_id` readback:
- Current `visibility_status`:
- Current `review_status`:
- Current `published_version`:
- Readback timestamp:

Identity is valid only if both `trip_no` and `external_trip_id` are exactly
`2026XBC091`.

## 2. Pre-Write Decisions

Driver / vehicle display source:

- Decision:
  - `temporary_snapshot_removal_accepted`, or
  - `transport_orders_customer_safe_projection_verified`
- Evidence / note:

If `transport_orders_customer_safe_projection_verified` is chosen, record the
approved transport task or readback evidence here. Do not infer this from
`trip091CardSystem.js` hardcoded driver data.

091B evidence trip:

- Retain hidden 091B evidence trip:
- Clean up later in separately approved task:
- Confirm retained 091B remains `visibility_status === hidden`:
- Confirm retained 091B was never published/shared:

Editable scope before C4:

- User understands C3B primarily unlocks time/order/location data path:
- User understands hotel-date/reservation renderer fallbacks remain until C4:

## 3. Full Backup Record

- Backup path:
- Backup byte size:
- Backup SHA-256:
- Backup timestamp:
- Backup parser check passed:
- Backup includes `draft_snapshot`:
- Backup includes `published_snapshot`:
- Backup identity check passed:

The backup must be the full original `customer_trips` document, not only
snapshot fields.

## 4. Generic Candidate Validation

Candidate source / artifact:

- Source path or readback reference:
- Candidate build method:
- Candidate timestamp:

Required counts:

| Check | Expected | Actual | Pass |
| --- | ---: | ---: | --- |
| top-level `destination_cards.length` | 36 |  |  |
| total day `timeline_items.length` | 36 |  |  |
| day counts | `4,3,9,4,3,4,7,2` |  |  |
| `daily_summary_cards.length` | 8 |  |  |
| `hotel_cards.length` | 6 |  |  |
| `flight_cards.length` | 1 |  |  |
| recursive sensitive-field hits | 0 |  |  |
| `validateTrip091WriteSnapshot(candidate, { require_generator_validation: false }).valid` | `true` |  |  |

Confirm `daily_summary_cards.length === 8` during the first dry-run. The expected
value is one summary card per itinerary day.

Required fields spot check:

- Destination cards contain `card_id`, `card_type`, `sequence`:
- Destination cards contain `time_snapshot`, `display_snapshot`:
- Destination cards contain `travel_snapshot`, `ui_flags`:
- Non-meeting, non-flight cards retain `route_check_id`:
- Hotel cards include check-in/check-out dates:
- Hotel cards include room summary/type:
- Hotel confirmation visibility policy is respected:

Expected differences from current published snapshot:

- If `temporary_snapshot_removal_accepted` is chosen, driver and vehicle
  identity fields are no longer present in the itinerary snapshot.

Unexpected differences:

- 

## 5. Simulator Verification Before Write

No write is allowed based on simulator verification alone; this section is only
supporting evidence for the approval request.

- WeChat DevTools project path: `/Users/admin/farland-driver-quote-miniapp`
- Operator trip management opens:
- 091B/customer trip detail opens:
- Draft inline preview renders:
- Customer-facing preview opens read-only:
- Home/date axis/day switching behaves:
- Day-detail card carousel behaves:
- Hotel-detail data matches card data:
- Console warnings/errors and relevance:

## 6. Rollback Readiness

- Full-document restore procedure reviewed:
- Backup path/hash copied into rollback notes:
- Rollback identity checks listed:
- Rollback preview verification listed:
- Emergency rollback permission:
  - `not_granted`, or
  - `granted_for_this_exact_c3b_run`

Rollback still requires explicit user approval unless emergency rollback
permission is granted for this exact C3B run.

## 7. Production Write Approval Prompt

Ask the user with this exact target and effect:

```text
Approve C3B production write for customer_trips/bf757c4c6a2054f800350a925147b32e?
This will update the live 091 source/draft path but will not publish until separately approved.
```

Do not proceed unless the user explicitly approves this exact write step.

## 8. Publish Approval Prompt

This is a separate later approval after post-write validation and simulator
preview pass.

```text
Approve publishing the generic 091 snapshot for customer visibility?
This will replace the live customer-visible published snapshot for 2026XBC091.
```

Do not publish during the write step.
