# P4 C3 · 091 Data-Driven Switch Plan

> Status: decision plan for the next implementation checkpoint. Do not treat this as permission to import, publish, update production data, or delete hardcode.

## Summary

C2 proved that a non-091 id source can pass all 36 visible 091 stop cards through the generic `normalizeSnapshotV2` day/timeline path without losing rich fields. C3 should now make the generic path structurally compatible with the hardcoded 091 snapshot, then prepare a guarded live-091 switch. Production write steps stay blocked until explicitly approved.

## Decisions

- **Canonical card source:** day-level cards are canonical. Target precedence for C3A is `itinerary_days[].destination_cards`, then `cards`, then `timeline_items`, then `items`. This is a deliberate C3A alignment: current `normalizeDay` still prefers `timeline_items`, then `items`, then `destination_cards`, then `cards`, while customer home normalization already prefers `destination_cards` first. Top-level `destination_cards` is a derived compatibility index, not an authoring source.
- **Top-level destination index:** add one shared generic helper, for example `getCanonicalDayCards(day)`, and use it both for normalized day output and for flattening `snapshot.destination_cards`. The flattened cards must preserve `day_no`, `date`, `sequence`, `card_id`, `card_type`, `travel_snapshot`, `ui_flags`, `source_refs`, and `parent_group_*`. Dedupe by `card_id`; if missing, synthesize from day + sequence.
- **Hotel summary dedupe:** top-level hotel/stay records and day hotel-arrival cards may both exist. Merge them into one `hotel_cards` entry by stable stay key: `hotel_stay_id || stay_id || hotel_id || linked_entity_id || normalized(name + check_in_date + check_out_date)`. Explicit top-level stay fields win; day cards fill missing display fields.
- **Flight summary dedupe:** merge top-level flight records and day flight cards by `flight_no + day_no + from + to + departure_time`. Explicit top-level flight fields win; timeline cards fill missing display fields.
- **091 switch path:** add a code-level switch so the real 091 trip can run the generic path only when explicitly enabled. Default remains current hardcoded 091 path until the approved production migration step.

## Implementation Sequence

### C3A · Code Support, No Production Write

- Update `buildCustomerTripVisibleDraft/index.js`:
  - introduce a shared canonical day-card source helper and align `normalizeDay` to the same precedence used by the derived top-level index;
  - add `deriveDestinationCards(normalizedDays)`;
  - include derived `destination_cards` in `normalizeSnapshotV2`;
  - update hotel/flight derivation to dedupe top-level records against day-derived cards using the keys above;
  - keep existing 091 hardcoded branch as default.
- Add a local verification script or extend the C2 script to assert:
  - generic 091B now has top-level `destination_cards.length === 36`;
  - day card counts remain `4,3,9,4,3,4,7,2`;
  - hotel cards no longer double from `6` to `14`;
  - flight cards no longer double from `1` to `2`;
  - no sensitive keys leak.
- Do not call import/publish/cloud database/DevTools upload.

### C3B · Live 091 Switch, Explicit Approval Required

- Prepare a 091 source JSON/data payload that carries all fields currently supplied by `trip091CardSystem.js`, including hotel dates, room/confirmation fields, route metadata, and customer display name.
- Before any write:
  - read and export the full original `customer_trips` document for doc id `bf757c4c6a2054f800350a925147b32e`;
  - verify `trip_no === external_trip_id === '2026XBC091'`;
  - dry-run build generic snapshot and confirm 36 top-level destination cards plus the expected day counts;
  - confirm no `driver_phone`, `plate_number`, `vehicle_summary`, or other blocked keys in the snapshot.
- Only after explicit user approval, rebuild draft and publish. Keep rollback by restoring the backed-up `draft_snapshot`, `published_snapshot`, `published_version`, `review_status`, and `visibility_status`.

## Acceptance Criteria

- Generic path output has the same 36 visible stop cards at both top-level and day-level.
- Generic hotel and flight summaries are deduped to the intended counts.
- Customer home/day-detail/hotel-detail can read from canonical day cards without relying on `091_*` card ids.
- No production data write occurs during C3A.
- C3B cannot run without explicit approval and a verified backup.

## Open Follow-Ups After C3

- C4 removes renderer fallbacks only after live 091 renders correctly from data: `resolveKnownTrip091Hotel*`, `get091RouteMetaOverride`, hardcoded customer name, and card-id-specific school/Day7 branches.
- C5 removes `trip091CardSystem.js` and the 091 hardcoded build branch only after the generic path has been stable through at least one reviewed refresh.
