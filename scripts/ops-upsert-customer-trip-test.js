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

function makeFakeHttps(store) {
  return {
    get(url, callback) {
      store.__fetches = store.__fetches || [];
      store.__fetches.push(String(url && url.href ? url.href : url));
      const handlers = {};
      const response = {
        statusCode: store.__fetchStatus || 200,
        headers: store.__fetchHeaders || { 'content-type': 'image/jpeg' },
        on(event, handler) { handlers[event] = handler; return response; },
        resume() {},
      };
      const request = {
        on() { return request; },
        setTimeout() { return request; },
        destroy(error) {
          if (handlers.error && error) handlers.error(error);
        },
      };
      process.nextTick(() => {
        callback(response);
        if (handlers.data) handlers.data(store.__fetchBuffer || Buffer.from('ffd8ffe000104a464946', 'hex'));
        if (handlers.end) handlers.end();
      });
      return request;
    },
  };
}

function loadMain(store) {
  const source = fs.readFileSync(INDEX, 'utf8');
  const localRequire = createRequire(INDEX);
  const db = makeDb(store);
  const fakeCloud = {
    DYNAMIC_CURRENT_ENV: 'local',
    init() {},
    getWXContext() { return {}; },
    database() { return db; },
    async uploadFile({ cloudPath, fileContent }) {
      store.__uploads = store.__uploads || [];
      store.__uploads.push({ cloudPath, size: fileContent.length });
      return { fileID: `cloud://test-env/${cloudPath}` };
    },
  };
  const moduleObject = { exports: {} };
  const sandbox = {
    console, Buffer, Date, JSON, Number, RegExp, Set, String, Array, Object, Math, process,
    module: moduleObject, exports: moduleObject.exports,
    require(r) {
      if (r === 'wx-server-sdk') return fakeCloud;
      if (r === 'https') return makeFakeHttps(store);
      return localRequire(r);
    },
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
  itinerary_sheet: { png_url: 'https://cdn.myfarland.com/mobile-itinerary/web-int-001.png', order_no: 'LEGACY-IGNORED', width: 1080, height: 2400 },
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

  // 1. valid signed payload with legacy itinerary_sheet → created structured snapshot and auto-published
  await check('valid payload ignores legacy itinerary_sheet → created and auto-published', async () => {
    const store = {}; const main = loadMain(store);
    const r = await main(signedEvent(validPayload));
    const doc = (store.customer_trips || [])[0];
    return r.success && r.action === 'created' && r.auto_published === true
      && r.review_status === 'approved' && r.visibility_status === 'published'
      && r.published_version === 1
      && doc && doc.draft_snapshot && !doc.draft_snapshot.itinerary_sheet
      && doc.draft_snapshot.itinerary_days && doc.draft_snapshot.itinerary_days.length === 1
      && doc.published_snapshot && !doc.published_snapshot.itinerary_sheet
      && doc.published_snapshot.itinerary_days && doc.published_snapshot.itinerary_days.length === 1;
  });

  await check('payload without legacy itinerary_sheet → published customer-visible lifecycle', async () => {
    const store = {}; const main = loadMain(store);
    const r = await main(signedEvent(noSheetPayload));
    const doc = (store.customer_trips || [])[0];
    return r.success && r.action === 'created' && r.auto_published === true
      && r.review_status === 'approved' && r.visibility_status === 'published'
      && doc && doc.draft_snapshot && doc.draft_snapshot.itinerary_days
      && doc.published_snapshot && doc.published_snapshot.itinerary_days;
  });

  await check('customer PII stripped to top-level', async () => {
    const store = {}; const main = loadMain(store);
    await main(signedEvent(validPayload));
    const doc = store.customer_trips[0];
    return doc.customer.display_name === '张女士' && doc.customer.phone === undefined
      && doc.customer.wechat_id === undefined && doc.customer.email === undefined
      && doc.customer_phone === '13800000000' && doc.customer_wechat_id === 'zh_wx';
  });

  await check('draft_snapshot customer has no PII', async () => {
    const store = {}; const main = loadMain(store);
    await main(signedEvent(validPayload));
    const doc = store.customer_trips[0];
    const customer = doc.draft_snapshot && doc.draft_snapshot.customer;
    return customer && customer.display_name === '张女士'
      && customer.phone === undefined
      && customer.wechat_id === undefined
      && doc.draft_snapshot.customer_phone === undefined
      && doc.draft_snapshot.customer_wechat_id === undefined;
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

  // 10. update existing published trip with legacy itinerary_sheet → auto-publish fresh customer-visible version
  await check('update published trip with legacy itinerary_sheet → auto-published fresh version', async () => {
    const store = {}; const main = loadMain(store);
    await main(signedEvent(validPayload));
    const doc = store.customer_trips[0];
    doc.published_version = 2;
    doc.visibility_status = 'published';
    doc.review_status = 'approved';
    doc.published_snapshot = { title: '旧发布版', marker: 'PUBLISHED_V2' };
    const edited = { ...validPayload, title: '美东访校(改)' };
    const r = await main(signedEvent(edited));
    return r.success && r.action === 'auto_published' && r.review_status === 'approved'
      && r.visibility_status === 'published' && r.auto_published === true
      && doc.published_version === 3
      && doc.published_snapshot.marker === undefined
      && doc.published_snapshot.title === '美东访校(改)'
      && doc.draft_snapshot.title === '美东访校(改)'
      && doc.title === '美东访校(改)' && doc.visibility_status === 'published';
  });

  // 11. update existing published trip without legacy sheet → auto-publish fresh customer-visible version
  await check('update published trip without legacy itinerary_sheet → auto-published fresh version', async () => {
    const store = {}; const main = loadMain(store);
    await main(signedEvent(noSheetPayload));
    const doc = store.customer_trips[0];
    doc.published_version = 3;
    doc.visibility_status = 'published';
    doc.published_snapshot = { itinerary_days: [{ day_no: 1 }], marker: 'PUBLISHED_V3' };
    const edited = { ...noSheetPayload, title: '无行程单改动' };
    const r = await main(signedEvent(edited));
    return r.success && r.action === 'auto_published' && r.review_status === 'approved'
      && r.visibility_status === 'published' && r.auto_published === true
      && doc.published_version === 4 && doc.published_snapshot.marker === undefined
      && doc.published_snapshot.title === '无行程单改动'
      && doc.title === '无行程单改动' && doc.visibility_status === 'published';
  });

  // 12. valid itinerary_sheet (https/cloud) → written to TOP-LEVEL customer_trips doc, still excluded from snapshots
  await check('itinerary_sheet https/cloud → written top-level, excluded from snapshots', async () => {
    const store = {}; const main = loadMain(store);
    const p = { ...validPayload, itinerary_sheet: { png_url: 'cloud://prod/itin/2026NBC102.png', width: 750, height: 5200, order_no: '2026NBC102', version: 3, evil_extra: 'x' } };
    const r = await main(signedEvent(p));
    const doc = store.customer_trips[0];
    return r.success
      && doc.itinerary_sheet && doc.itinerary_sheet.png_url === 'cloud://prod/itin/2026NBC102.png'
      && doc.itinerary_sheet.version === 3 && doc.itinerary_sheet.evil_extra === undefined
      && !doc.draft_snapshot.itinerary_sheet && !doc.published_snapshot.itinerary_sheet;
  });

  // 13. itinerary_sheet with non-persistent scheme (http/wxfile/data) → VALIDATION_ERROR, nothing written
  await check('itinerary_sheet http/wxfile scheme → VALIDATION_ERROR', async () => {
    const store = {}; const main = loadMain(store);
    const r = await main(signedEvent({ ...validPayload, itinerary_sheet: { png_url: 'http://a/x.png' } }));
    const r2 = await main(signedEvent({ ...validPayload, itinerary_sheet: { png_url: 'wxfile://tmp/x.png' } }));
    return !r.success && r.error_code === 'VALIDATION_ERROR'
      && !r2.success && r2.error_code === 'VALIDATION_ERROR';
  });

  // 14. itinerary_sheet png_base64 → uploaded to CloudBase storage, DB keeps only cloud:// URL/meta
  await check('itinerary_sheet png_base64 → uploaded and stored as cloud url only', async () => {
    const store = {}; const main = loadMain(store);
    const pngBase64 = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
    const p = {
      ...validPayload,
      itinerary_sheet: {
        format: 'png',
        width: 750,
        height: 4958,
        order_no: '2026NBC102',
        version: 4,
        generated_at: '2026-07-05T12:00:00-04:00',
        png_base64: pngBase64,
      },
    };
    const r = await main(signedEvent(p));
    const doc = store.customer_trips[0];
    return r.success
      && store.__uploads && store.__uploads.length === 1
      && /customer-itinerary-sheets\/2026NBC102\/v4-/.test(store.__uploads[0].cloudPath)
      && doc.itinerary_sheet && doc.itinerary_sheet.png_url.startsWith('cloud://test-env/customer-itinerary-sheets/2026NBC102/v4-')
      && doc.itinerary_sheet.width === 750 && doc.itinerary_sheet.height === 4958
      && doc.itinerary_sheet.png_base64 === undefined
      && !doc.draft_snapshot.itinerary_sheet && !doc.published_snapshot.itinerary_sheet;
  });

  // 15. itinerary_sheet image_url(JPEG) → fetched server-side and stored as CloudBase URL
  await check('itinerary_sheet image_url jpeg → fetched and stored as cloud url only', async () => {
    const store = {}; const main = loadMain(store);
    const p = {
      ...validPayload,
      external_trip_id: 'WEB-INT-IMAGE-URL',
      itinerary_sheet: {
        format: 'jpeg',
        width: 750,
        order_no: '2026NBC096',
        generated_at: '2026-07-06T13:20:00-04:00',
        image_url: 'https://www.myfarland.com/sheet/trip_dcfb7ae57fde435e?k=22bc16d81483',
      },
    };
    const r = await main(signedEvent(p));
    const doc = store.customer_trips[0];
    return r.success
      && store.__fetches && store.__fetches[0] === p.itinerary_sheet.image_url
      && store.__uploads && store.__uploads.length === 1
      && /customer-itinerary-sheets\/2026NBC096\/v2026-07-06T13-20-00-04-00-[a-f0-9]{16}\.jpg/.test(store.__uploads[0].cloudPath)
      && doc.itinerary_sheet && doc.itinerary_sheet.png_url.startsWith('cloud://test-env/customer-itinerary-sheets/2026NBC096/')
      && doc.itinerary_sheet.format === 'jpeg'
      && doc.itinerary_sheet.image_url === undefined
      && doc.itinerary_sheet.width === 750
      && !doc.draft_snapshot.itinerary_sheet && !doc.published_snapshot.itinerary_sheet;
  });

  // 16. itinerary_sheet png_base64 must be a PNG
  await check('itinerary_sheet png_base64 non-png → VALIDATION_ERROR', async () => {
    const store = {}; const main = loadMain(store);
    const r = await main(signedEvent({ ...validPayload, itinerary_sheet: { format: 'png', png_base64: Buffer.from('not png').toString('base64') } }));
    return !r.success && r.error_code === 'VALIDATION_ERROR' && !(store.__uploads && store.__uploads.length);
  });

  // 17. itinerary_sheet image_url must be HTTPS
  await check('itinerary_sheet image_url non-https → VALIDATION_ERROR', async () => {
    const store = {}; const main = loadMain(store);
    const r = await main(signedEvent({ ...validPayload, itinerary_sheet: { format: 'jpeg', image_url: 'http://www.myfarland.com/sheet/x' } }));
    return !r.success && r.error_code === 'VALIDATION_ERROR' && !(store.__fetches && store.__fetches.length);
  });

  console.log(failed ? `\nFAILED: ${failed}` : '\nPASS: all opsUpsertCustomerTrip cases');
  process.exit(failed ? 1 : 0);
})();
