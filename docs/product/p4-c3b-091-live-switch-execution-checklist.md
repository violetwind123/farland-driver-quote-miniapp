# P4 C3B · 091 Live Data-Driven Switch Execution Checklist

> Status: execution checklist only. This document is **not** approval to write production data, publish, upload, clean history, or change permissions.
>
> Target trip: `2026XBC091`
> Target document id: `bf757c4c6a2054f800350a925147b32e`

## Goal

Move the live 091 trip from the hardcoded `trip091CardSystem.js` build path to the generic `normalizeSnapshotV2` data-driven path, while preserving customer-visible behavior and keeping a full-document rollback path.

This is the first P4 C-track step that can touch production data. It must be gated more strictly than C0-C3A, which were docs, code support, and local experiments only.

## Non-Negotiable Gates

- Do not write production data until the user explicitly approves the write step.
- Do not publish until the user explicitly approves the publish step.
- Do not upload Mini Program frontend or deploy cloud functions as part of this checklist unless separately approved.
- Do not run historical cleanup, permission changes, or unrelated collection writes.
- Do not touch demo trip `2026FEEDEMO01` or unrelated `customer_trips` records.
- Every production write must target only document id `bf757c4c6a2054f800350a925147b32e`, with both `trip_no` and `external_trip_id` equal to `2026XBC091`.

## Pre-Write Decisions Required

These decisions must be recorded before Phase 3 approval. They are not blockers
for maintaining this checklist, but they are blockers for the official 091
write/publish steps.

1. Driver / vehicle display source:
   - The generic snapshot path intentionally strips driver and vehicle identity
     fields from customer-trip snapshots.
   - If 091 must continue showing driver name, phone, vehicle, or plate after
     C3B, that display must come from the `transport_orders` customer-safe
     projection, not from the itinerary snapshot.
   - Do not approve the official 091 write until the user explicitly accepts
     either:
     - driver/vehicle details may temporarily disappear from snapshot-driven
       091 preview, or
     - driver/vehicle details have been verified through `transport_orders`.
2. 091B evidence trip retention:
   - `FARLAND-091B-DATA` / `881bf3f16a26434a004f43666a3ada22` is a real hidden
     `customer_trips` record created for C3B evidence.
   - It is not customer-visible while `visibility_status === hidden`, but it can
     appear in operator trip-management lists.
   - Decide whether to retain it as durable migration evidence or clean it up in
     a separately approved data-cleanup task after C3B.
3. Editable scope before C4:
   - C3B is expected to unlock data-driven time/order/location changes in the
     build path.
   - Hotel-date and reservation editing may still be affected by existing
     renderer fallback code until C4 removes `resolveKnownTrip091Hotel*` and
     related 091-specific content overrides.

## Required Inputs

- Current committed code includes C3A support:
  - top-level `destination_cards` derivation in generic path;
  - hotel/flight summary dedupe;
  - non-091 timeline-only regression coverage.
- Current 091 source payload is complete enough to replace hardcoded fields:
  - all day cards and top-level summary fields;
  - hotel dates, room type/summary, confirmation visibility policy;
  - travel snapshots and route metadata;
  - customer display name;
  - no driver or vehicle identity in the snapshot source.
- Production environment target is confirmed in WeChat DevTools / CloudBase before any write.

## Phase 0 · Preflight Read-Only Checks

Run these before asking for write approval.

- Confirm git state:
  - clean except intentionally excluded local assets;
  - C3A commit `a695821` is present;
  - no unreviewed code changes mixed into the migration.
- Confirm target trip identity by reading the full `customer_trips` document:
  - `_id === 'bf757c4c6a2054f800350a925147b32e'`;
  - `trip_no === '2026XBC091'`;
  - `external_trip_id === '2026XBC091'`.
- Confirm current customer-visible state:
  - `published_snapshot` exists;
  - current customer home can still render;
  - current day detail and hotel detail still render.
- Confirm C3A generic local evidence still passes:
  - `node --check scripts/run-trip091b-normalizer-experiment.js`;
  - `node scripts/run-trip091b-normalizer-experiment.js --out /tmp/farland-091b-c3b-preflight`.

## Phase 0A · 091B Sandbox Import And Simulator Evidence

This phase records non-live 091B evidence only. It is **not** approval to overwrite, publish, or otherwise mutate the official `2026XBC091` trip.

Completed evidence:

- `buildCustomerTripVisibleDraft` C3B switch version was deployed for verification:
  - the switch is default-off;
  - ordinary calls still use the hardcoded 091 path;
  - the generic path requires the explicit switch flag and confirmation token.
- Bad-token guard was verified against official 091:
  - bad token returned `TRIP_091_GENERIC_SWITCH_TOKEN_REQUIRED`;
  - no write occurred.
- Official 091 generic switch was attempted without publish flags and correctly blocked before write:
  - returned `TRIP_091_SNAPSHOT_GUARDRAIL_FAILED`;
  - validation showed the current live 091 document does not yet contain the full data-driven source (`destination_cards_count: 1`, `day_counts: [0]`);
  - no write occurred.
  - this is the expected pre-backfill state and confirms the guardrail blocks
    switching before complete 091 source data is present.
- 091B experiment source was imported as a new hidden draft trip:
  - `trip_id` / `external_trip_id`: `FARLAND-091B-DATA`;
  - `customer_trip_id`: `881bf3f16a26434a004f43666a3ada22`;
  - `review_status`: `pending_review`;
  - `visibility_status`: `hidden`;
  - `published_version`: `0`;
  - warning codes: `flight_segment_detected`.
- 091B draft was built through the generic path and read back with:
  - `snapshot_model_version: 2`;
  - top-level `destination_cards.length === 36`;
  - total day `timeline_items.length === 36`;
  - day counts exactly `4,3,9,4,3,4,7,2`;
  - `hotel_cards.length === 6`;
  - `flight_cards.length === 1`;
  - sensitive-field scan count `0`.
- WeChat DevTools simulator opened the 091B operator trip detail page successfully:
  - title: `091B Data Pipeline Experiment`;
  - status: `pending_review / hidden / v0`;
  - inline draft preview displayed daily summaries, daily itinerary cards, hotels, and flight data;
  - Day 7 displayed White House, Lincoln Memorial, U.S. Capitol, Capitol Hill, Library of Congress, and Supreme Court exterior as separate itinerary nodes.

Known non-blocking simulator finding:

- `customer-trip-detail` reported `setData` payload size around `1468 KB` for the rich 091B draft. This does not block C3B proof, but it should be treated as the same operator-detail payload/performance thread already observed during rich 091 preview work, and revisited before broad use of very large rich snapshots.

Conclusion:

- The generic pipeline can carry the 091B canonical source end to end into a draft and operator simulator preview.
- Official 091 still requires a separate, explicitly approved backfill/write step before the generic switch can pass guardrails.

## Phase 1 · Full Production Backup

This is mandatory before any production mutation.

Backup requirements:

- Export the full original `customer_trips` document, not only snapshots.
- Backup must include:
  - source/import fields;
  - `draft_snapshot`;
  - `published_snapshot`;
  - status/version fields;
  - timestamps;
  - warnings;
  - any operational metadata present on the document.
- Store backup as an immutable local JSON artifact under a timestamped filename, for example:
  - `/tmp/farland-091-c3b-backup/customer_trips_bf757c4c6a2054f800350a925147b32e_YYYYMMDD-HHMMSS.json`
- Record:
  - document id;
  - environment id;
  - backup timestamp;
  - SHA-256 hash of the backup file;
  - byte size.

Backup validation:

- Parse the backup JSON successfully.
- Reconfirm `trip_no` and `external_trip_id`.
- Confirm backup includes both current `draft_snapshot` and `published_snapshot` if they exist.
- Keep the backup path and hash in the execution notes before moving forward.

## Phase 2 · Generic Dry-Run Validation

This phase is read-only or local-only unless explicitly approved otherwise.

Build the candidate generic snapshot from the prepared 091 source payload and validate:

- `snapshot_model_version === 2`.
- Top-level `destination_cards.length === 36`.
- Day-level visible card counts are exactly:
  - `4,3,9,4,3,4,7,2`.
- Grouped attraction rows remain split into individual visible cards:
  - Day 3 New York grouped attractions;
  - Day 6 Chicago/Northwestern items;
  - Day 7 Washington DC items.
- `hotel_cards.length === 6` unless the source deliberately changes stay count.
- `flight_cards.length === 1` unless the source deliberately changes flight count.
- `daily_summary_cards.length === 8`.
- All destination cards have:
  - `card_id`;
  - `card_type`;
  - `sequence`;
  - `time_snapshot`;
  - `display_snapshot`;
  - `travel_snapshot`;
  - `ui_flags`.
- All non-meeting, non-flight destination cards retain:
  - `route_check_id`;
  - Google Maps / route snapshot fields required by customer rendering.
- Hotel cards and hotel arrival cards include:
  - check-in date;
  - check-out date;
  - room summary/type;
  - confirmation visibility rule.

Sensitive-field scan must pass recursively across the candidate snapshot:

- No `driver_name`.
- No `driver_phone`.
- No `driver_openid`.
- No `driver_user_id`.
- No `plate_number`.
- No `vehicle_summary`.
- No `vehicle_id`.
- No `quote_price`.
- No `operator_openid`.
- No raw source/debug payloads.

Output required before approval:

- Candidate snapshot summary JSON.
- Card count table by day.
- Card count table by type.
- Hotel/flight count summary.
- Sensitive-field scan result.
- Diff summary against the current published snapshot, with expected differences separated from unexpected differences.

## Phase 3 · Approval Request For Production Write

Do not proceed unless the user explicitly approves this exact step.

Approval request must include:

- Backup path and hash.
- Target document id and identity confirmation.
- Dry-run validation summary.
- Expected customer-visible changes.
- Known remaining hardcoded renderer fallbacks that still exist until C4.
- Rollback command/steps summary.

Ask for explicit approval in concrete terms:

```text
Approve C3B production write for customer_trips/bf757c4c6a2054f800350a925147b32e?
This will update the live 091 source/draft path but will not publish until separately approved.
```

## Phase 4 · Production Write, No Publish Yet

Only after Phase 3 approval:

- Re-read the target document immediately before write.
- Reconfirm id and trip identity.
- Write the generic 091 source/draft update using the approved mechanism.
- Do not touch unrelated collections.
- Do not publish automatically.
- Record:
  - write timestamp;
  - operator/tool used;
  - fields changed;
  - resulting draft version/status.

Post-write validation:

- Re-read the full target document.
- Confirm `draft_snapshot` exists and is non-empty.
- Confirm top-level `destination_cards.length === 36`.
- Confirm day card counts `4,3,9,4,3,4,7,2`.
- Re-run sensitive-field scan on the stored draft snapshot.
- Confirm `published_snapshot` remains the previous live customer version until publish approval.

## Phase 5 · Preview Verification Before Publish

No publish yet.

Verify operator preview:

- Customer home renders 091 with the generic draft data.
- Day detail renders expected card counts and time fields.
- Hotel detail renders check-in/check-out, room type, and confirmation policy.
- Day 7 transport/route metadata is acceptable or explicitly listed as remaining C4/A3 follow-up.

If DevTools preview is available, perform preview-level checks:

- Operator trip detail opens.
- Customer-facing preview opens.
- 091 customer home loads.
- Date axis and day switching still work.
- Day detail card carousel still works.
- Hotel detail still matches card data.

Record all issues. Blocking issues must be fixed before asking for publish approval.

## Phase 6 · Approval Request For Publish

Do not publish unless the user explicitly approves.

Approval request must include:

- Post-write validation summary.
- Preview findings.
- Any known non-blocking deviations.
- Rollback readiness confirmation.

Ask for explicit approval in concrete terms:

```text
Approve publishing the generic 091 snapshot for customer visibility?
This will replace the live customer-visible published snapshot for 2026XBC091.
```

## Phase 7 · Publish And Post-Publish Validation

Only after Phase 6 approval:

- Publish 091 using the approved publish mechanism.
- Re-read `customer_trips`.
- Confirm:
  - `visibility_status === 'published'`;
  - `published_snapshot` exists and is non-empty;
  - top-level `published_snapshot.destination_cards.length === 36`;
  - day card counts remain `4,3,9,4,3,4,7,2`;
  - no sensitive fields in `published_snapshot`.
- Verify customer view reads from `published_snapshot`.
- Record final published version and timestamp.

## Rollback Plan

Rollback must restore the full original document from Phase 1.

Rollback triggers:

- wrong target document detected;
- card count mismatch after write;
- sensitive-field leak;
- customer home fails to render;
- day detail/hotel detail blocking regression;
- user requests rollback.

Rollback steps:

1. Stop all further writes/publishes.
2. Reconfirm target document id.
3. Restore the full backup JSON document, not only snapshot fields.
4. Re-read the target document.
5. Confirm identity and restored status/version fields.
6. Confirm previous `published_snapshot` is restored.
7. Re-open customer preview and verify it matches pre-C3B behavior.
8. Record rollback timestamp and backup hash used.

Rollback also requires explicit user approval unless the user previously grants emergency rollback permission for this exact C3B run.

## Completion Criteria

C3B is complete only when:

- The live 091 trip uses the generic data-driven build path.
- The customer-visible published snapshot has exactly 36 destination cards.
- Day counts are `4,3,9,4,3,4,7,2`.
- Customer home, day detail, and hotel detail render from data without depending on the build hardcode.
- Full backup and rollback artifact are retained.
- No unrelated trip or collection was modified.

## Follow-Up After C3B

- C4: remove renderer fallbacks only after live 091 renders correctly from data.
- A3: backfill any schema gaps exposed during C3B/C4, especially route metadata and Day 7 wording.
- C5: remove `trip091CardSystem.js` and 091 build branch only after generic 091 is stable through a reviewed refresh.
