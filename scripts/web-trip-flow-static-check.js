#!/usr/bin/env node
/**
 * Web-authoritative trip flow static check.
 *
 * Feeds a web-style customer_trips SOURCE document (the canonical payload the
 * web side is expected to write) through the real cloud-function transforms and
 * asserts the "source -> build draft -> publish -> customer view" closure:
 *   - normalizeSnapshotV2 (buildCustomerTripVisibleDraft) builds the expected
 *     structure and strips the customer's own contact info + internal/supplier
 *     fields, while keeping customer-safe fields (hotel front-desk phone).
 *   - normalizePublishedSnapshot (getCustomerTripByInvite) — the customer share
 *     open path — also emits no customer PII.
 *
 * No cloud calls, no production data: the cloud modules are VM-loaded with a
 * stubbed wx-server-sdk, exactly like run-trip091b-normalizer-experiment.js.
 *
 * Usage: node scripts/web-trip-flow-static-check.js
 * Exit 0 on pass, 1 on any failed assertion.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DRAFT_INDEX = path.join(ROOT, 'cloudfunctions/buildCustomerTripVisibleDraft/index.js');
const INVITE_INDEX = path.join(ROOT, 'cloudfunctions/getCustomerTripByInvite/index.js');

function loadPrivate(indexPath, exportExpr) {
  const source = fs.readFileSync(indexPath, 'utf8');
  const localRequire = createRequire(indexPath);
  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: 'local',
    init() {},
    getWXContext() { return {}; },
    database() {
      const command = { in() { return {}; }, inc() { return {}; } };
      return { command };
    },
  };
  const moduleObject = { exports: {} };
  const sandbox = {
    console, Buffer, Date, JSON, Number, RegExp, Set, String, Array, Object, Math,
    module: moduleObject,
    exports: moduleObject.exports,
    require(request) {
      if (request === 'wx-server-sdk') return fakeCloud;
      return localRequire(request);
    },
  };
  sandbox.global = sandbox;
  const instrumented = `${source}\nmodule.exports.__private__ = ${exportExpr};`;
  vm.runInNewContext(instrumented, sandbox, { filename: indexPath });
  return moduleObject.exports.__private__;
}

// ---- forbidden-key deep scan -------------------------------------------------
const CONTACT_KEYS = ['phone', 'mobile', 'wechat', 'wechat_id', 'weixin', 'email', 'contact'];
const INTERNAL_KEYS = ['internal_note', 'internal_notes', 'operator_note', 'supplier_note',
  'supplier_notes', 'cost', 'driver_cost', 'margin', 'driver_quotes', 'openid', 'customer_openid'];

function findKeyPaths(node, targetKeys, prefix = '') {
  const hits = [];
  if (Array.isArray(node)) {
    node.forEach((item, i) => hits.push(...findKeyPaths(item, targetKeys, `${prefix}[${i}]`)));
  } else if (node && typeof node === 'object') {
    Object.keys(node).forEach((key) => {
      const p = prefix ? `${prefix}.${key}` : key;
      if (targetKeys.includes(key)) hits.push(p);
      hits.push(...findKeyPaths(node[key], targetKeys, p));
    });
  }
  return hits;
}

// ---- assertions --------------------------------------------------------------
let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); } else { console.error(`  ✗ ${msg}`); failed += 1; }
}

// ---- web-style SOURCE fixture (canonical customer_trips payload + PII) --------
const webSource = {
  schema_version: '1.0.0',
  external_trip_id: 'WEB-TEST-001',
  trip_id: 'WEB-TEST-001',
  trip_no: 'WEB-TEST-001',
  trip_type: 'mixed',
  customer_profile_id: 'prof_123',
  source_type: 'cloudflare_ops',
  source_id: 'ops_abc',
  source: { source_type: 'cloudflare_ops', source_id: 'ops_abc' },
  title: '美东访校行程',
  city: 'New York',
  country: 'US',
  timezone: 'America/New_York',
  status: 'active',
  start_at: '2026-08-01T10:00:00-04:00',
  end_at: '2026-08-03T16:00:00-04:00',
  summary: 'web-authored test trip',
  // customer object carries PII that MUST be stripped from the customer-visible snapshot
  customer: { display_name: '张女士', name: '张女士', phone: '13800000000', wechat_id: 'zhang_wx', email: 'zhang@example.com' },
  customer_display_name: '张女士',
  customer_phone: '13800000000',
  advisor: { name: 'Farland 顾问' },
  hotels: [{
    hotel_id: 'h1', name: 'Test Hotel', phone: '212-555-1000',
    check_in_date: '2026-08-01', check_out_date: '2026-08-02', linked_day_no: 1,
    supplier_note: 'internal supplier note',
  }],
  itinerary_days: [
    { day_no: 1, date: '2026-08-01', city: 'New York', title: 'Day 1', timeline_items: [{ item_id: 'i1', title: 'NYU', internal_note: 'secret' }] },
    { day_no: 2, date: '2026-08-02', city: 'New York', title: 'Day 2', timeline_items: [{ item_id: 'i2', title: 'Columbia' }] },
  ],
  flights: [], documents: [], transfers: [], charter_services: [],
};

console.log('web-trip-flow-static-check');
console.log('Step A · build draft (normalizeSnapshotV2)');
const build = loadPrivate(BUILD_DRAFT_INDEX, '{ normalizeSnapshotV2, stripCustomerContact }');
const draft = build.normalizeSnapshotV2(webSource);

assert(Array.isArray(draft.itinerary_days) && draft.itinerary_days.length === 2, 'draft has 2 itinerary days');
assert(Array.isArray(draft.hotel_cards || draft.hotels) && (draft.hotel_cards || draft.hotels).length >= 1, 'draft has hotel card(s)');
assert(draft.customer && (draft.customer.display_name === '张女士'), 'draft keeps customer display_name');

const customerContactHits = findKeyPaths(draft.customer || {}, CONTACT_KEYS);
assert(customerContactHits.length === 0, `draft.customer has NO contact keys (found: ${customerContactHits.join(', ') || 'none'})`);

const hotelCards = draft.hotel_cards || draft.hotels || [];
const hotelHasPhone = hotelCards.some((h) => h && (h.phone === '212-555-1000'));
assert(hotelHasPhone, 'hotel front-desk phone is preserved (customer-safe)');

const internalHits = findKeyPaths(draft, INTERNAL_KEYS);
assert(internalHits.length === 0, `draft has NO internal/supplier/cost keys (found: ${internalHits.join(', ') || 'none'})`);

console.log('Step B · customer share view (normalizePublishedSnapshot)');
const invite = loadPrivate(INVITE_INDEX, '{ normalizePublishedSnapshot }');
// simulate publish: the published snapshot is the built draft
const customerView = invite.normalizePublishedSnapshot(draft);
const viewCustomerContactHits = findKeyPaths(customerView.customer || {}, CONTACT_KEYS);
assert(viewCustomerContactHits.length === 0, `customer view: customer has NO contact keys (found: ${viewCustomerContactHits.join(', ') || 'none'})`);
const viewInternalHits = findKeyPaths(customerView, INTERNAL_KEYS);
assert(viewInternalHits.length === 0, `customer view has NO internal/supplier/cost keys (found: ${viewInternalHits.join(', ') || 'none'})`);
assert(Array.isArray(customerView.itinerary_days) && customerView.itinerary_days.length === 2, 'customer view keeps 2 days');

console.log(failed ? `\nFAILED: ${failed} assertion(s)` : '\nPASS: web source flows through build + customer view with no customer PII');
process.exit(failed ? 1 : 0);
