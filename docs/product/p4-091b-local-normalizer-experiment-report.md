# P4 C3A · 091B Local Normalizer Verification

> Local-only evidence for C3A. This report does not perform import, publish, database writes, upload, or DevTools actions.

## Command

```bash
node scripts/run-trip091b-normalizer-experiment.js --out /tmp/farland-091b-c3a
```

## Inputs

- Baseline generator: `buildTrip091CardSystem({ trip_no: '2026XBC091' })`
- 091B id: `FARLAND-091B-DATA`
- Card id remap: `091_*` -> `b91_*`
- Driver/vehicle/internal keys are stripped before the generic normalizer run.
- Hotel confirmation fields are opt-in exposed by setting `confirmation_no_visible: true` on hotel records that already contain a non-empty `confirmation_no`.

## Summary

| Check | 091 hardcoded | 091B generic | Result |
| --- | ---: | ---: | --- |
| Destination cards | 36 | 36 | match |
| Day card counts | 4,3,9,4,3,4,7,2 | 4,3,9,4,3,4,7,2 | match |
| Hotel cards | 6 | 6 | match |
| Flight cards | 1 | 1 | match |
| Top-level destination_cards | 36 | 36 | match |
| Sensitive key residue | 0 expected | 0 | clean |
| Non-091 timeline-only regression | 2 day cards expected | 2 | clean |

## Type Counts

### 091 Hardcoded

```json
{
  "school_visit_card": 10,
  "hotel_arrival_card": 8,
  "landmark_card": 12,
  "museum_card": 3,
  "custom_activity_card": 1,
  "meeting_card": 1,
  "flight_card": 1
}
```

### 091B Generic Timeline Items

```json
{
  "school_visit_card": 10,
  "hotel_arrival_card": 8,
  "landmark_card": 12,
  "museum_card": 3,
  "custom_activity_card": 1,
  "meeting_card": 1,
  "flight_card": 1
}
```

## Hardcode Trigger Check

| Trigger | Source 091B | Generic output |
| --- | --- | --- |
| Contains `2026XBC091` | no | no |
| Contains lowercase `2026xbc091` | no | no |
| Contains `091_` card prefix | no | no |

## Field Preservation Gaps

No required card-level rich fields were lost in generic `timeline_items`.


## C3A Findings

1. A data-driven 091B source can preserve the 36 visible stop cards through the generic normalizer at the day/timeline level.
2. The generic builder now derives a top-level `destination_cards` compatibility index from canonical day cards.
3. The generic builder now dedupes hotel/flight summary cards when both top-level records and day timeline cards are present.
4. The 091B id and card-id remap avoid the known trip/card-id hardcode triggers.
5. Hotel brand name content triggers still exist in customer renderers, but the 091B data carries hotel dates and confirmation fields directly, so those renderer fallbacks should be redundant once C3/C4 removes them.
6. A non-091 timeline-only fixture preserves its day-level timeline cards after the canonical-source precedence alignment.
7. No production write was attempted. The next step is Claude review of this local evidence, then decide whether C3A is ready for commit.

## Output Files

- `/tmp/farland-091b-c3a/trip091-hardcoded-snapshot.json`
- `/tmp/farland-091b-c3a/trip091b-source.json`
- `/tmp/farland-091b-c3a/trip091b-generic-snapshot.json`
- `/tmp/farland-091b-c3a/trip091b-summary.json`

## Baseline Validation

```json
{
  "valid": true,
  "total_destination_cards": 36,
  "day_counts": [
    4,
    3,
    9,
    4,
    3,
    4,
    7,
    2
  ],
  "missing_common_schema_count": 0,
  "ui_flag_leak_count": 0,
  "source_ref_missing_count": 1
}
```
