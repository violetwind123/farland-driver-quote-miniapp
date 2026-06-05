#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  buildTrip091CardSystem,
  validateTrip091CardSystem,
} = require('../cloudfunctions/buildCustomerTripVisibleDraft/lib/trip091CardSystem');

const outputPath = process.argv[2] || path.join('/tmp', '2026XBC091-draft_snapshot.json');
const snapshot = buildTrip091CardSystem({
  trip_no: '2026XBC091',
  trip_id: '2026XBC091',
  external_trip_id: '2026XBC091',
  customer: {
    display_name: '王女士',
    name: '王女士',
  },
});
const validation = validateTrip091CardSystem(snapshot);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

const summary = {
  outputPath,
  total: validation.total_destination_cards,
  day_counts: validation.day_counts.join(','),
  by_type: validation.by_type,
  warning_card_ids: validation.time_warning_card_ids,
  missing_common_schema_count: validation.missing_common_schema_count,
  ui_flag_leak_count: validation.ui_flag_leak_count,
  source_ref_missing_count: validation.source_ref_missing_count,
  valid: validation.valid,
};

console.log(JSON.stringify(summary, null, 2));

if (!validation.valid) {
  process.exit(1);
}
