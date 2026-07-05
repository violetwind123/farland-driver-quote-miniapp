#!/usr/bin/env node
/**
 * opsUpsertCustomerTrip static/integration test.
 * VM-loads the cloud function with a stubbed wx-server-sdk (in-memory db),
 * exercises the HMAC gate + validation + PII stripping + idempotent upsert.
 * No cloud calls, no production data.
 *
 * Usage: node scripts/ops-upsert-customer-trip-test.js  (exit 0 pass / 1 fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { createRequire } = require('module');

const SECRET = 'test-shared-secret';
process.env.OPS_SYNC_SHARED_SECRET = SECRET;
const INDEX = path.resolve(__dirname, '../cloudfunctions/opsUpsertCustomerTrip/index.js');

// ---- in-memory customer_trips store -----------------------------------------
function makeDb(store) {
  return {
    command: { in() { return {}; }, inc() { return {}; } },
    collection(name) {
      store[name] = store[name] || [];
      const rows = store[name];
      return {
        where(query) {
          return {
            limit() {
              return {
                async get() {
                  const data = rows.filter((r) => Object.keys(query).every((k) => r[k] === query[k]));
                  return { data };
                },
              };
            },
          };
        },
        async add({ data }) {
          const _id = `doc_${rows.length + 1}`;
          rows.push({ _id, ...data });
          return { _id };
        },
        doc(id) {
          return {
            async get() { const r = rows.find((x) => x._id === id); return { data: r || null }; },
            async update({ data }) {
              const r = rows.find((x) => x._id === id);
              if (r) Object.assign(r, data);
              return {};
            },
          };
        },
      };
    },
  };
}

function loadMain(store) {
  const source = fs.readFileSync(INDEX, 'utf8');
  const localRequire = createRequire(INDEX);
  const db = makeDb(store);
  const fakeCloud = { DYNAMIC_CURRENT_ENV: 'local', init() {}, getWXContext() { return {}; }, database() { return db; } };
  const moduleObject = { exports: {} };
  const sandbox = {
    console, Buffer, Date, JSON, Number, RegExp, Set, String, Array, Object, Math, process,
    module: moduleObject, exports: moduleObject.exports,
    require(r) { return r === 'wx-server-sdk' ? fakeCloud : localRequire(r); },
  };
  sandbox.global = sandbox;
  vm.runInNewContext(source, sandbox, { filename: INDEX });
  return moduleObject.exports.main;
}

// ---- helpers -----------------------------------------------------------------
function signedEvent(payloadObj, { ts, secret = SECRET, sign = true } = {}) {
  const body = JSON.stringify(payloadObj);
  const timestamp = ts || new Date().toISOString();
  const headers = { 'x-ops-sync-timestamp': timestamp };
  if (sign) headers['x-ops-sync-signature'] = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { headers, body };
}

const validPayload = {
  schema_version: '1.0.0',
  external_trip_id: 'WEB-INT-001',
  trip_type: 'mixed',
  title: '美东访校',
  status: 'active',
  city: 'New York', country: 'US', timezone: 'America/New_York',
  start_at: '2026-08-01T10:00:00-04:00', end_at: '2026-08-03T16:00:00-04:00',
  customer: { display_name: '张女士', phone: '13800000000', wechat_id: 'zh_wx', email: 'z@e.com' },
  source: { source_type: 'cloudflare_ops', source_id: 'ops_1' },
  advisor: { name: 'Farland' },
  itinerary_sheet: { png_url: 'https://cdn.myfarland.com/mobile-itinerary/web-int-001.png', order_no: 'MI-001', width: 1080, height: 2400 },
  hotels: [{ hotel_id: 'h1', name: 'Riu', phone: '212-555', check_in_date: '2026-08-01', supplier_note: 'x', linked_day_no: 1 }],
  itinerary_days: [{ day_no: 1, date: '2026-08-01', title: 'D1', timeline_items: [{ item_id: 'i1', title: 'NYU', internal_note: 'secret' }] }],
};
const noSheetPayload = (() => {
  const cloned = JSON.parse(JSON.stringify(validPayload));
  delete cloned.itinerary_sheet;
  cloned.external_trip_id = 'WEB-INT-NO-SHEET';
  return cloned;
})();

let failed = 0;
async function check(name, fn) {
  try { const ok = await fn(); if (ok) console.log(`  ✓ ${name}`); else { console.error(`  ✗ ${name}`); failed += 1; } }
  catch (e) { console.error(`  ✗ ${name} (threw: ${e.message})`); failed += 1; }
}

(async () => {
  console.log('opsUpsertCustomerTrip test');

  // 1. valid signed payload with mobile itinerary sheet → created + auto-published, PII stripped
  await check('valid payload with itinerary_sheet → created + auto-published', async () => {
    const store = {}; const main = loadMain(store);
    const r = await main(signedEvent(validPayload));
    const doc = (store.customer_trips || [])[0];
    return r.success && r.action === 'created' && r.auto_published === true
      && r.review_status === 'approved' && r.visibility_status === 'published'
      && r.published_version === 1
      && doc && doc.published_snapshot && doc.published_snapshot.itinerary_sheet
      && doc.published_snapshot.itinerary_sheet.png_url === validPayload.itinerary_sheet.png_url;
  });

  await check('payload without itinerary_sheet → hidden pending draft lifecycle', async () => {
    const store = {}; const main = loadMain(store);
    const r = await main(signedEvent(noSheetPayload));
    const doc = (store.customer_trips || [])[0];
    return r.success && r.action === 'created' && r.auto_published === false
      && r.review_status === 'pending_review' && r.visibility_status === 'hidden'
      && doc && Object.keys(doc.published_snapshot).length === 0;
  });

  await check('customer PII stripped to top-level', async () => {
    const store = {}; const main = loadMain(store);
    await main(signedEvent(validPayload));
    const doc = store.customer_trips[0];
    return doc.customer.display_name === '张女士' && doc.customer.phone === undefined
      && doc.customer.wechat_id === undefined && doc.customer.email === undefined
      && doc.customer_phone === '13800000000' && doc.customer_wechat_id === 'zh_wx';
  });

  await check('published_snapshot customer has no PII', async () => {
    const store = {}; const main = loadMain(store);
    await main(signedEvent(validPayload));
    const doc = store.customer_trips[0];
    const customer = doc.published_snapshot && doc.published_snapshot.customer;
    return customer && customer.display_name === '张女士'
      && customer.phone === undefined
      && customer.wechat_id === undefined
      && doc.published_snapshot.customer_phone === undefined
      && doc.published_snapshot.customer_wechat_id === undefined;
  });

  await check('internal_note / supplier_note deep-stripped from source', async () => {
    const store = {}; const main = loadMain(store);
    await main(signedEvent(validPayload));
    const doc = store.customer_trips[0];
    const s = JSON.stringify(doc);
    return !s.includes('internal_note') && !s.includes('supplier_note') && s.includes('212-555'); // hotel phone kept
  });

  // 2. missing signature → 401
  await check('missing signature → BAD_SIGNATURE 401', async () => {
    const main = loadMain({});
    const r = await main(signedEvent(validPayload, { sign: false }));
    return !r.success && r.code === 401 && r.error_code === 'BAD_SIGNATURE';
  });

  // 3. expired timestamp → 401
  await check('expired timestamp → BAD_TIMESTAMP 401', async () => {
    const main = loadMain({});
    const oldTs = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const r = await main(signedEvent(validPayload, { ts: oldTs }));
    return !r.success && r.code === 401 && r.error_code === 'BAD_TIMESTAMP';
  });

  // 4. tampered body (signature over different body) → 401
  await check('tampered body → BAD_SIGNATURE', async () => {
    const main = loadMain({});
    const ev = signedEvent(validPayload);
    ev.body = ev.body.replace('美东访校', '被篡改');
    const r = await main(ev);
    return !r.success && r.error_code === 'BAD_SIGNATURE';
  });

  // 5. published_snapshot present → rejected
  await check('published_snapshot in payload → rejected', async () => {
    const main = loadMain({});
    const r = await main(signedEvent({ ...validPayload, published_snapshot: { itinerary_days: [{}] } }));
    return !r.success && r.error_code === 'SNAPSHOT_NOT_ALLOWED';
  });

  // 5b. status='discarded'(运营态)→ rejected(web 不得隐藏已发布行程)
  await check("status='discarded' → rejected (enum)", async () => {
    const main = loadMain({});
    const r = await main(signedEvent({ ...validPayload, status: 'discarded' }));
    return !r.success && r.error_code === 'VALIDATION_ERROR';
  });

  // 6. 091 external_trip_id → rejected
  await check('091 external_trip_id → rejected', async () => {
    const main = loadMain({});
    const r = await main(signedEvent({ ...validPayload, external_trip_id: '2026XBC091' }));
    return !r.success && r.error_code === 'TRIP_091_PROTECTED';
  });

  // 7. driver identity present → rejected
  await check('driver identity field → rejected', async () => {
    const main = loadMain({});
    const bad = JSON.parse(JSON.stringify(validPayload));
    bad.itinerary_days[0].timeline_items[0].driver_phone = '139...';
    const r = await main(signedEvent(bad));
    return !r.success && r.error_code === 'SENSITIVE_FIELD_PRESENT';
  });

  // 8. missing required field → validation error
  await check('missing required field → VALIDATION_ERROR', async () => {
    const main = loadMain({});
    const { title, ...noTitle } = validPayload;
    const r = await main(signedEvent(noTitle));
    return !r.success && r.error_code === 'VALIDATION_ERROR' && (r.missing || []).includes('title');
  });

  // 9. duplicate external_trip_id, same content → idempotent
  await check('duplicate same payload → idempotent unchanged', async () => {
    const store = {}; const main = loadMain(store);
    await main(signedEvent(validPayload));
    const r2 = await main(signedEvent(validPayload));
    return r2.success && r2.idempotent === true && r2.action === 'unchanged' && store.customer_trips.length === 1;
  });

  // 10. update existing published trip with itinerary_sheet → auto-publish new version
  await check('update published trip with itinerary_sheet → auto-published new version', async () => {
    const store = {}; const main = loadMain(store);
    await main(signedEvent(validPayload));
    const doc = store.customer_trips[0];
    const oldVersion = doc.published_version;
    const edited = { ...validPayload, title: '美东访校(改)' };
    const r = await main(signedEvent(edited));
    return r.success && r.action === 'updated' && r.review_status === 'approved'
      && r.auto_published === true
      && doc.published_version === oldVersion + 1
      && doc.published_snapshot.title === '美东访校(改)'
      && doc.title === '美东访校(改)' && doc.visibility_status === 'published';
  });

  // 11. update existing published trip without sheet → old review boundary preserved
  await check('update published trip without itinerary_sheet → needs_review, published preserved', async () => {
    const store = {}; const main = loadMain(store);
    await main(signedEvent(noSheetPayload));
    const doc = store.customer_trips[0];
    doc.published_version = 3;
    doc.visibility_status = 'published';
    doc.published_snapshot = { itinerary_days: [{ day_no: 1 }], marker: 'PUBLISHED_V3' };
    const edited = { ...noSheetPayload, title: '无行程单改动' };
    const r = await main(signedEvent(edited));
    return r.success && r.action === 'updated' && r.review_status === 'needs_review'
      && doc.published_version === 3 && doc.published_snapshot.marker === 'PUBLISHED_V3'
      && doc.title === '无行程单改动' && doc.visibility_status === 'published';
  });

  console.log(failed ? `\nFAILED: ${failed}` : '\nPASS: all opsUpsertCustomerTrip cases');
  process.exit(failed ? 1 : 0);
})();
