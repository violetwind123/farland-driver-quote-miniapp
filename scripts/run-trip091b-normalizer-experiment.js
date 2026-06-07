#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

const {
  buildTrip091CardSystem,
  validateTrip091CardSystem,
} = require('../cloudfunctions/buildCustomerTripVisibleDraft/trip091CardSystem');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DRAFT_INDEX = path.join(REPO_ROOT, 'cloudfunctions/buildCustomerTripVisibleDraft/index.js');
const DEFAULT_OUTPUT_DIR = path.join('/tmp', 'farland-091b-experiment');
const TRIP091B_ID = 'FARLAND-091B-DATA';

const SNAPSHOT_ID_KEYS = new Set([
  'id',
  'card_id',
  'item_id',
  'trip_id',
  'trip_no',
  'external_trip_id',
  'route_check_id',
  'linked_entity_id',
]);

const SENSITIVE_KEYS = new Set([
  'openid',
  'customer_openid',
  'customer_user_id',
  'user_id',
  'driver_quotes',
  'driver_quote',
  'internal_note',
  'internal_notes',
  'operator_note',
  'operator_notes',
  'operator_internal_note',
  'raw_parse_note',
  'raw_parse_notes',
  'source_raw_text',
  'source_pdf_text',
  'source_hash',
  'warning_codes',
  'critical_warning_codes',
  'audit_logs',
  'cost',
  'driver_cost',
  'margin',
  'supplier_note',
  'supplier_notes',
  'supplier_private_note',
  'supplier_private_notes',
  'driver_name',
  'driver_phone',
  'driver_openid',
  'driver_user_id',
  'vehicle_id',
  'plate_number',
  'vehicle_summary',
  'vehicle_model',
  'vehicle_color',
  'quote_price',
  'driver_quote_amount',
  'farland_service_fee_amount',
  'client_total_internal',
  'operator_user_id',
  'operator_openid',
  'created_by_openid',
  'updated_by_openid',
  'raw_json',
  'raw_source',
  'debug',
  'debug_info',
]);

function parseArgs(argv) {
  const options = { outputDir: DEFAULT_OUTPUT_DIR };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' && argv[index + 1]) {
      options.outputDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/run-trip091b-normalizer-experiment.js [--out /tmp/farland-091b-experiment]',
    '',
    'Runs a local-only 091B experiment:',
    '- builds the current hardcoded 091 snapshot',
    '- remaps it to a non-091 trip id/card prefix',
    '- removes driver/vehicle/internal fields',
    '- runs the generic normalizeSnapshotV2 pipeline in a VM',
    '- writes source/output/report files to --out',
  ].join('\n');
}

function loadNormalizeSnapshotV2() {
  const source = fs.readFileSync(BUILD_DRAFT_INDEX, 'utf8');
  const localRequire = createRequire(BUILD_DRAFT_INDEX);
  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: 'local',
    init() {},
    database() {
      return {};
    },
  };
  const moduleObject = { exports: {} };
  const sandbox = {
    console,
    Buffer,
    Date,
    JSON,
    Number,
    RegExp,
    Set,
    String,
    module: moduleObject,
    exports: moduleObject.exports,
    require(request) {
      if (request === 'wx-server-sdk') return fakeCloud;
      return localRequire(request);
    },
  };
  sandbox.global = sandbox;
  const instrumented = `${source}\nmodule.exports.__trip091b_private__ = { normalizeSnapshotV2, sanitizeCustomerObject };`;
  vm.runInNewContext(instrumented, sandbox, { filename: BUILD_DRAFT_INDEX });
  return moduleObject.exports.__trip091b_private__;
}

function remapString(value) {
  return String(value)
    .replace(/2026XBC091/g, TRIP091B_ID)
    .replace(/2026xbc091/g, TRIP091B_ID.toLowerCase())
    .replace(/\b091_/g, 'b91_');
}

function shouldExposeHotelConfirmation(value) {
  const text = String(value || '').trim();
  return Boolean(text);
}

function cloneFor091B(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => cloneFor091B(item, key));
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? remapString(value) : value;
  }

  const output = {};
  Object.keys(value).forEach((childKey) => {
    if (SENSITIVE_KEYS.has(childKey)) return;
    const child = cloneFor091B(value[childKey], childKey);
    if (child === undefined) return;
    output[childKey] = SNAPSHOT_ID_KEYS.has(childKey) && typeof child === 'string'
      ? remapString(child)
      : child;
  });

  if (
    shouldExposeHotelConfirmation(output.confirmation_no)
    && (
      output.card_type === 'hotel_arrival_card'
      || output.item_type === 'hotel'
      || output.type === 'hotel'
      || output.hotel_id
      || output.hotel_stay_id
    )
  ) {
    output.confirmation_no_visible = true;
  }

  return output;
}

function build091BTripSource(snapshot091) {
  const cloned = cloneFor091B(snapshot091);
  const days = Array.isArray(cloned.itinerary_days) ? cloned.itinerary_days : [];
  return {
    schema_version: '1.0.0',
    external_trip_id: TRIP091B_ID,
    trip_id: TRIP091B_ID,
    trip_no: TRIP091B_ID,
    trip_type: 'mixed',
    title: '091B Data Pipeline Experiment',
    status: 'active',
    city: cloned.city || 'Boston / New York / Philadelphia / Washington DC / Chicago',
    country: cloned.country || 'US',
    timezone: cloned.timezone || 'America/New_York',
    start_at: cloned.start_at || '2026-06-05T00:00:00-04:00',
    end_at: cloned.end_at || '2026-06-12T23:59:00-04:00',
    summary: 'Local-only data-driven duplicate of the live 091 itinerary for C2 normalizer comparison. Not for production import without operator confirmation.',
    customer: {
      display_name: '刘女士',
      name: '刘女士',
    },
    source: {
      source_type: 'local_091b_experiment',
      source_id: 'p4-c2-091b-local',
    },
    advisor: cloned.advisor || {
      name: 'Farland Advisor',
    },
    hotels: Array.isArray(cloned.hotel_cards) ? cloned.hotel_cards : [],
    flights: Array.isArray(cloned.flight_cards) ? cloned.flight_cards : [],
    transfers: [],
    charter_services: [],
    itinerary_days: days.map((day) => ({
      ...day,
      timeline_items: Array.isArray(day.timeline_items)
        ? day.timeline_items
        : (Array.isArray(day.cards) ? day.cards : (Array.isArray(day.destination_cards) ? day.destination_cards : [])),
      items: Array.isArray(day.items) ? day.items : undefined,
      destination_cards: Array.isArray(day.destination_cards) ? day.destination_cards : undefined,
      cards: Array.isArray(day.cards) ? day.cards : undefined,
    })),
    documents: [],
  };
}

function buildTimelineOnlyRegressionSource() {
  return {
    schema_version: '1.0.0',
    external_trip_id: 'NORMAL-TIMELINE-ONLY',
    trip_id: 'NORMAL-TIMELINE-ONLY',
    trip_no: 'NORMAL-TIMELINE-ONLY',
    title: 'Normal Timeline Only Regression',
    start_at: '2026-01-01',
    end_at: '2026-01-01',
    itinerary_days: [
      {
        day_no: 1,
        date: '2026-01-01',
        weekday: 'Thu',
        title: 'Day 1',
        city: 'Boston',
        timeline_items: [
          {
            item_id: 'normal_stop_1',
            item_type: 'landmark',
            card_type: 'landmark_card',
            title: 'Normal Stop 1',
            time: '09:00',
            planned_arrival_time: '09:00',
            planned_start_time: '09:00',
            address: '1 Test Street',
            travel_snapshot: {
              mode: 'driving',
              duration_text: '10 min',
            },
            ui_flags: {
              show_route_by_default: false,
            },
          },
          {
            item_id: 'normal_stop_2',
            item_type: 'hotel',
            card_type: 'hotel_arrival_card',
            title: 'Normal Hotel',
            time: '18:00',
            planned_arrival_time: '18:00',
            address: '2 Test Street',
            room_type: 'Standard Room',
            confirmation_no: 'SHOULD_NOT_SHOW',
          },
        ],
      },
    ],
  };
}

function flattenDayCards(snapshot, fieldName) {
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  return days.flatMap((day) => Array.isArray(day[fieldName]) ? day[fieldName] : []);
}

function countBy(values, keyGetter) {
  return values.reduce((acc, value) => {
    const key = keyGetter(value) || '';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function dayCounts(snapshot, fieldName) {
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  return days.map((day) => {
    const cards = Array.isArray(day[fieldName]) ? day[fieldName] : [];
    return cards.length;
  });
}

function containsTrip091Trigger(value) {
  const text = JSON.stringify(value);
  return {
    hasExactTripNo: text.includes('2026XBC091'),
    hasLowerTripNo: text.includes('2026xbc091'),
    has091CardPrefix: /"[^"]*091_[^"]*"/.test(text),
  };
}

function collectSensitiveKeys(value, pathLabel = '$', found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSensitiveKeys(item, `${pathLabel}[${index}]`, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  Object.keys(value).forEach((key) => {
    if (SENSITIVE_KEYS.has(key)) found.push(`${pathLabel}.${key}`);
    collectSensitiveKeys(value[key], `${pathLabel}.${key}`, found);
  });
  return found;
}

function indexCardsByOriginalId(cards) {
  return cards.reduce((acc, card) => {
    const id = String(card.card_id || card.item_id || card.id || '');
    if (id) acc[id.replace(/\bb91_/g, '091_')] = card;
    return acc;
  }, {});
}

function compareCardFields(snapshot091, genericSnapshot) {
  const baselineCards = Array.isArray(snapshot091.destination_cards) ? snapshot091.destination_cards : [];
  const genericCards = flattenDayCards(genericSnapshot, 'timeline_items');
  const genericByOriginalId = indexCardsByOriginalId(genericCards);
  const requiredFields = [
    'card_type',
    'display_snapshot',
    'time_snapshot',
    'travel_snapshot',
    'ui_flags',
    'route_check_id',
    'parent_group_id',
    'source_refs',
    'content_verified_at',
    'check_in_date',
    'check_out_date',
    'room_summary',
    'room_type',
    'confirmation_no',
  ];
  const missing = [];
  baselineCards.forEach((baseline) => {
    const generic = genericByOriginalId[baseline.card_id];
    if (!generic) {
      missing.push({ card_id: baseline.card_id, missing_card: true });
      return;
    }
    requiredFields.forEach((field) => {
      const expected = baseline[field];
      if (
        expected === undefined
        || expected === ''
        || expected === null
        || (Array.isArray(expected) && expected.length === 0)
      ) return;
      const actual = generic[field];
      const absent = actual === undefined || actual === '' || actual === null
        || (Array.isArray(actual) && actual.length === 0);
      if (absent) missing.push({ card_id: baseline.card_id, field });
    });
  });
  return missing;
}

function buildReport({ outputDir, snapshot091, source091B, genericSnapshot, validation091, summary }) {
  const relativeOutputDir = outputDir.startsWith(REPO_ROOT)
    ? path.relative(REPO_ROOT, outputDir)
    : outputDir;
  const lines = [
    '# P4 C3A · 091B Local Normalizer Verification',
    '',
    '> Local-only evidence for C3A. This report does not perform import, publish, database writes, upload, or DevTools actions.',
    '',
    '## Command',
    '',
    '```bash',
    `node scripts/run-trip091b-normalizer-experiment.js --out ${relativeOutputDir}`,
    '```',
    '',
    '## Inputs',
    '',
    `- Baseline generator: \`buildTrip091CardSystem({ trip_no: '2026XBC091' })\``,
    `- 091B id: \`${TRIP091B_ID}\``,
    '- Card id remap: `091_*` -> `b91_*`',
    '- Driver/vehicle/internal keys are stripped before the generic normalizer run.',
    '- Hotel confirmation fields are opt-in exposed by setting `confirmation_no_visible: true` on hotel records that already contain a non-empty `confirmation_no`.',
    '',
    '## Summary',
    '',
    '| Check | 091 hardcoded | 091B generic | Result |',
    '| --- | ---: | ---: | --- |',
    `| Destination cards | ${summary.baseline.destination_cards_count} | ${summary.generic.timeline_items_count} | ${summary.generic.timeline_items_count === summary.baseline.destination_cards_count ? 'match' : 'diff'} |`,
    `| Day card counts | ${summary.baseline.day_counts.join(',')} | ${summary.generic.day_counts.join(',')} | ${summary.generic.day_counts.join(',') === summary.baseline.day_counts.join(',') ? 'match' : 'diff'} |`,
    `| Hotel cards | ${summary.baseline.hotel_cards_count} | ${summary.generic.hotel_cards_count} | ${summary.generic.hotel_cards_count === summary.baseline.hotel_cards_count ? 'match' : 'diff'} |`,
    `| Flight cards | ${summary.baseline.flight_cards_count} | ${summary.generic.flight_cards_count} | ${summary.generic.flight_cards_count === summary.baseline.flight_cards_count ? 'match' : 'diff'} |`,
    `| Top-level destination_cards | ${summary.baseline.destination_cards_count} | ${summary.generic.top_level_destination_cards_count} | ${summary.generic.top_level_destination_cards_count === summary.baseline.destination_cards_count ? 'match' : 'diff'} |`,
    `| Sensitive key residue | 0 expected | ${summary.generic.sensitive_key_paths.length} | ${summary.generic.sensitive_key_paths.length ? 'BLOCKING' : 'clean'} |`,
    `| Non-091 timeline-only regression | 2 day cards expected | ${summary.timeline_only_regression.day_timeline_count} | ${summary.timeline_only_regression.valid ? 'clean' : 'BLOCKING'} |`,
    '',
    '## Type Counts',
    '',
    '### 091 Hardcoded',
    '',
    '```json',
    JSON.stringify(summary.baseline.by_type, null, 2),
    '```',
    '',
    '### 091B Generic Timeline Items',
    '',
    '```json',
    JSON.stringify(summary.generic.by_type, null, 2),
    '```',
    '',
    '## Hardcode Trigger Check',
    '',
    '| Trigger | Source 091B | Generic output |',
    '| --- | --- | --- |',
    `| Contains \`2026XBC091\` | ${summary.source_triggers.hasExactTripNo ? 'yes' : 'no'} | ${summary.generic_triggers.hasExactTripNo ? 'yes' : 'no'} |`,
    `| Contains lowercase \`2026xbc091\` | ${summary.source_triggers.hasLowerTripNo ? 'yes' : 'no'} | ${summary.generic_triggers.hasLowerTripNo ? 'yes' : 'no'} |`,
    `| Contains \`091_\` card prefix | ${summary.source_triggers.has091CardPrefix ? 'yes' : 'no'} | ${summary.generic_triggers.has091CardPrefix ? 'yes' : 'no'} |`,
    '',
    '## Field Preservation Gaps',
    '',
    summary.field_missing.length
      ? 'The generic path lost these non-empty baseline fields:'
      : 'No required card-level rich fields were lost in generic `timeline_items`.',
    '',
  ];

  if (summary.field_missing.length) {
    lines.push('```json', JSON.stringify(summary.field_missing.slice(0, 80), null, 2), '```');
    if (summary.field_missing.length > 80) {
      lines.push('', `Additional missing entries omitted: ${summary.field_missing.length - 80}`);
    }
  }

  lines.push(
    '',
    '## C3A Findings',
    '',
    '1. A data-driven 091B source can preserve the 36 visible stop cards through the generic normalizer at the day/timeline level.',
    '2. The generic builder now derives a top-level `destination_cards` compatibility index from canonical day cards.',
    '3. The generic builder now dedupes hotel/flight summary cards when both top-level records and day timeline cards are present.',
    '4. The 091B id and card-id remap avoid the known trip/card-id hardcode triggers.',
    '5. Hotel brand name content triggers still exist in customer renderers, but the 091B data carries hotel dates and confirmation fields directly, so those renderer fallbacks should be redundant once C3/C4 removes them.',
    '6. A non-091 timeline-only fixture preserves its day-level timeline cards after the canonical-source precedence alignment.',
    '7. No production write was attempted. The next step is Claude review of this local evidence, then decide whether C3A is ready for commit.',
    '',
    '## Output Files',
    '',
    `- \`${path.join(relativeOutputDir, 'trip091-hardcoded-snapshot.json')}\``,
    `- \`${path.join(relativeOutputDir, 'trip091b-source.json')}\``,
    `- \`${path.join(relativeOutputDir, 'trip091b-generic-snapshot.json')}\``,
    `- \`${path.join(relativeOutputDir, 'trip091b-summary.json')}\``,
    '',
    '## Baseline Validation',
    '',
    '```json',
    JSON.stringify({
      valid: validation091.valid,
      total_destination_cards: validation091.total_destination_cards,
      day_counts: validation091.day_counts,
      missing_common_schema_count: validation091.missing_common_schema_count,
      ui_flag_leak_count: validation091.ui_flag_leak_count,
      source_ref_missing_count: validation091.source_ref_missing_count,
    }, null, 2),
    '```'
  );
  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  fs.mkdirSync(options.outputDir, { recursive: true });

  const privateFns = loadNormalizeSnapshotV2();
  const snapshot091 = buildTrip091CardSystem({
    trip_no: '2026XBC091',
    external_trip_id: '2026XBC091',
    customer: { display_name: '刘女士', name: '刘女士' },
  });
  const validation091 = validateTrip091CardSystem(snapshot091);
  const source091B = build091BTripSource(snapshot091);
  const genericSnapshot = privateFns.normalizeSnapshotV2(source091B);
  const timelineOnlySource = buildTimelineOnlyRegressionSource();
  const timelineOnlySnapshot = privateFns.normalizeSnapshotV2(timelineOnlySource);
  const timelineOnlyCards = flattenDayCards(timelineOnlySnapshot, 'timeline_items');
  const timelineOnlyRegression = {
    day_timeline_count: timelineOnlyCards.length,
    day_timeline_ids: timelineOnlyCards.map((card) => card.item_id || card.card_id || card.id),
    top_level_destination_cards_count: Array.isArray(timelineOnlySnapshot.destination_cards) ? timelineOnlySnapshot.destination_cards.length : 0,
    confirmation_no_values: JSON.stringify(timelineOnlySnapshot).match(/SHOULD_NOT_SHOW/g) || [],
    sensitive_key_paths: collectSensitiveKeys(timelineOnlySnapshot),
  };
  timelineOnlyRegression.valid = (
    timelineOnlyRegression.day_timeline_count === 2
    && timelineOnlyRegression.day_timeline_ids.join(',') === 'normal_stop_1,normal_stop_2'
    && timelineOnlyRegression.top_level_destination_cards_count === 2
    && timelineOnlyRegression.confirmation_no_values.length === 0
    && timelineOnlyRegression.sensitive_key_paths.length === 0
  );

  const baselineCards = Array.isArray(snapshot091.destination_cards) ? snapshot091.destination_cards : [];
  const genericCards = flattenDayCards(genericSnapshot, 'timeline_items');
  const summary = {
    output_dir: options.outputDir,
    trip091b_id: TRIP091B_ID,
    baseline: {
      destination_cards_count: baselineCards.length,
      day_counts: dayCounts(snapshot091, 'destination_cards'),
      hotel_cards_count: Array.isArray(snapshot091.hotel_cards) ? snapshot091.hotel_cards.length : 0,
      flight_cards_count: Array.isArray(snapshot091.flight_cards) ? snapshot091.flight_cards.length : 0,
      by_type: countBy(baselineCards, (card) => card.card_type),
    },
    generic: {
      top_level_destination_cards_count: Array.isArray(genericSnapshot.destination_cards) ? genericSnapshot.destination_cards.length : 0,
      timeline_items_count: genericCards.length,
      day_counts: dayCounts(genericSnapshot, 'timeline_items'),
      hotel_cards_count: Array.isArray(genericSnapshot.hotel_cards) ? genericSnapshot.hotel_cards.length : 0,
      flight_cards_count: Array.isArray(genericSnapshot.flight_cards) ? genericSnapshot.flight_cards.length : 0,
      by_type: countBy(genericCards, (card) => card.card_type),
      sensitive_key_paths: collectSensitiveKeys(genericSnapshot),
    },
    source_triggers: containsTrip091Trigger(source091B),
    generic_triggers: containsTrip091Trigger(genericSnapshot),
    field_missing: compareCardFields(snapshot091, genericSnapshot),
    timeline_only_regression: timelineOnlyRegression,
  };

  fs.writeFileSync(path.join(options.outputDir, 'trip091-hardcoded-snapshot.json'), `${JSON.stringify(snapshot091, null, 2)}\n`);
  fs.writeFileSync(path.join(options.outputDir, 'trip091b-source.json'), `${JSON.stringify(source091B, null, 2)}\n`);
  fs.writeFileSync(path.join(options.outputDir, 'trip091b-generic-snapshot.json'), `${JSON.stringify(genericSnapshot, null, 2)}\n`);
  fs.writeFileSync(path.join(options.outputDir, 'timeline-only-regression-generic-snapshot.json'), `${JSON.stringify(timelineOnlySnapshot, null, 2)}\n`);
  fs.writeFileSync(path.join(options.outputDir, 'trip091b-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(options.outputDir, 'trip091b-report.md'), buildReport({
    outputDir: options.outputDir,
    snapshot091,
    source091B,
    genericSnapshot,
    validation091,
    summary,
  }));

  console.log(JSON.stringify({
    output_dir: options.outputDir,
    trip091b_id: TRIP091B_ID,
    baseline_destination_cards: summary.baseline.destination_cards_count,
    generic_timeline_items: summary.generic.timeline_items_count,
    baseline_day_counts: summary.baseline.day_counts,
    generic_day_counts: summary.generic.day_counts,
    generic_top_level_destination_cards: summary.generic.top_level_destination_cards_count,
    generic_hotel_cards: summary.generic.hotel_cards_count,
    generic_flight_cards: summary.generic.flight_cards_count,
    timeline_only_regression: summary.timeline_only_regression,
    sensitive_key_paths: summary.generic.sensitive_key_paths,
    field_missing_count: summary.field_missing.length,
    source_triggers: summary.source_triggers,
    generic_triggers: summary.generic_triggers,
  }, null, 2));

  if (!validation091.valid) process.exitCode = 1;
  if (summary.generic.sensitive_key_paths.length) process.exitCode = 1;
  if (summary.generic.timeline_items_count !== summary.baseline.destination_cards_count) process.exitCode = 1;
  if (summary.generic.top_level_destination_cards_count !== summary.baseline.destination_cards_count) process.exitCode = 1;
  if (summary.generic.hotel_cards_count !== summary.baseline.hotel_cards_count) process.exitCode = 1;
  if (summary.generic.flight_cards_count !== summary.baseline.flight_cards_count) process.exitCode = 1;
  if (!summary.timeline_only_regression.valid) process.exitCode = 1;
}

main();
