# P4 C2 · 091B Local Normalizer Experiment

> Local-only evidence for C2. This report does not perform import, publish, database writes, upload, or DevTools actions.

## Command

```bash
node scripts/run-trip091b-normalizer-experiment.js --out /tmp/farland-091b-experiment
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
| Hotel cards | 6 | 14 | diff |
| Flight cards | 1 | 2 | diff |
| Top-level destination_cards | 36 | 0 | missing in generic |
| Sensitive key residue | 0 expected | 0 | clean |

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


## C2 Findings

1. A data-driven 091B source can preserve the 36 visible stop cards through the generic normalizer at the day/timeline level.
2. The generic builder still does not derive a top-level `destination_cards` array. If downstream code depends on it, C3 needs either a top-level flattening derivation or a customer-read fallback to day `timeline_items`.
3. The generic builder double-derives hotel/flight summary cards when both top-level cards and day timeline cards are present. C3/A3 should define the canonical source of truth and dedupe rule before real 091 migration.
4. The 091B id and card-id remap avoid the known trip/card-id hardcode triggers.
5. Hotel brand name content triggers still exist in customer renderers, but the 091B data carries hotel dates and confirmation fields directly, so those renderer fallbacks should be redundant once C3/C4 removes them.
6. No production write was attempted. The next step is Claude review of this local evidence, then decide whether C2 needs a no-write DevTools preview fixture or can proceed to the C3 schema/flattening decision.

## Output Files

- `/tmp/farland-091b-experiment/trip091-hardcoded-snapshot.json`
- `/tmp/farland-091b-experiment/trip091b-source.json`
- `/tmp/farland-091b-experiment/trip091b-generic-snapshot.json`
- `/tmp/farland-091b-experiment/trip091b-summary.json`

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
