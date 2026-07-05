const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;
const TRIP_091_DOC_ID = 'bf757c4c6a2054f800350a925147b32e';
const TRIP_091_NO = '2026XBC091';

// canonical source 必填(对齐 docs/schema/customer-trip.schema.json 的 required)
const REQUIRED_FIELDS = [
  'external_trip_id', 'trip_type', 'title', 'status',
  'city', 'country', 'timezone', 'start_at', 'end_at',
];
// status 枚举(对齐 schema);'discarded' 等运营生命周期态不得由 web 写,否则可隐藏已发布行程
const ALLOWED_STATUS = ['draft', 'active', 'completed', 'cancelled', 'archived'];

// customer 子对象只保留展示字段;联系方式提到顶层,不进快照
const CUSTOMER_CONTACT_KEYS = [
  'phone', 'mobile', 'tel', 'telephone', 'wechat', 'wechat_id', 'weixin',
  'email', 'contact', 'contact_phone', 'contact_mobile', 'contact_info',
];
// 出现即拒(fail-closed):web 不得写快照 / 司机身份
const REJECT_TOP_KEYS = ['draft_snapshot', 'published_snapshot'];
const REJECT_SENSITIVE_KEYS = [
  'driver_name', 'driver_phone', 'plate_number', 'vehicle_summary',
  'driver_id', 'driver_openid', 'driver_user_id',
];
// 深度剥离(静默):内部/成本/供应商 token
const STRIP_KEYS = [
  'internal_note', 'internal_notes', 'operator_note', 'operator_notes', 'operator_internal_note',
  'supplier_note', 'supplier_notes', 'supplier_private_note', 'supplier_private_notes',
  'cost', 'driver_cost', 'margin', 'driver_quotes', 'driver_quote', 'raw_quote_pool',
  'little_majia_id', 'goods_uniq_id', 'supplier_id', 'sub_supplier_id', 'shopper_product_id',
  'raw_imported_json', 'raw_json', 'source_raw_text', 'source_pdf_text', 'openid', 'customer_openid',
];

function envValue(name) {
  return String((process.env && process.env[name]) || '').trim();
}
function text(value) {
  return value == null ? '' : String(value).trim();
}
function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
function normalizeHeaders(headers) {
  return Object.keys(headers || {}).reduce((acc, key) => {
    const value = headers[key];
    acc[String(key).toLowerCase()] = Array.isArray(value) ? value[0] : value;
    return acc;
  }, {});
}
function hmacSha256(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function createError(errorCode, message, code) {
  const error = new Error(message || errorCode);
  error.error_code = errorCode;
  error.code = code || 400;
  return error;
}

// itinerary_sheet:web 生成的手机版行程单图,写在 customer_trips 顶层,两层读取共用。
// 后端持久 URL 仅允许 https/cloud;wxfile 是设备本地临时路径,不能作 web 持久 URL。
const ITINERARY_SHEET_URL_SCHEMES = ['https:', 'cloud:'];
const MAX_ITINERARY_SHEET_BYTES = 6 * 1024 * 1024;
function itinerarySheetSchemeAllowed(url) {
  const m = /^([a-z][a-z0-9+.-]*:)/i.exec(text(url));
  return m ? ITINERARY_SHEET_URL_SCHEMES.includes(m[1].toLowerCase()) : false;
}
function safeCloudPathSegment(value, fallback) {
  const cleaned = text(value).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return cleaned || fallback;
}
function decodePngBase64(value) {
  let raw = text(value);
  if (!raw) return null;
  raw = raw.replace(/^data:image\/png;base64,/i, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(raw)) {
    throw createError('VALIDATION_ERROR', 'itinerary_sheet.png_base64 must be valid base64 PNG data.', 400);
  }
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length || buffer.length > MAX_ITINERARY_SHEET_BYTES) {
    throw createError('VALIDATION_ERROR', 'itinerary_sheet.png_base64 is empty or too large.', 400);
  }
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw createError('VALIDATION_ERROR', 'itinerary_sheet.png_base64 must be a PNG image.', 400);
  }
  return buffer;
}
async function persistItinerarySheetIfNeeded(payload) {
  const sheet = isPlainObject(payload && payload.itinerary_sheet) ? payload.itinerary_sheet : null;
  if (!sheet || itinerarySheetSchemeAllowed(sheet.png_url)) return payload;
  if (!text(sheet.png_base64)) return payload;

  const buffer = decodePngBase64(sheet.png_base64);
  const orderNo = safeCloudPathSegment(sheet.order_no || payload.external_trip_id || payload.trip_no || payload.trip_id, 'trip');
  const version = safeCloudPathSegment(sheet.version || sheet.source_hash || Date.now(), 'latest');
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const cloudPath = `customer-itinerary-sheets/${orderNo}/v${version}-${contentHash}.png`;
  const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buffer });
  const pngUrl = text(uploadRes && (uploadRes.fileID || uploadRes.fileId));
  if (!pngUrl || !itinerarySheetSchemeAllowed(pngUrl)) {
    throw createError('STORAGE_UPLOAD_FAILED', 'Failed to persist itinerary_sheet PNG.', 500);
  }
  return {
    ...payload,
    itinerary_sheet: {
      ...sheet,
      png_url: pngUrl,
      png_base64: undefined,
      format: text(sheet.format) || 'png',
    },
  };
}
function normalizeItinerarySheetSource(value) {
  if (!isPlainObject(value) || !itinerarySheetSchemeAllowed(value.png_url)) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const out = {
    png_url: text(value.png_url),
    width: num(value.width),
    height: num(value.height),
    order_no: text(value.order_no),
    version: num(value.version),
    generated_at: text(value.generated_at),
    source_hash: text(value.source_hash),
  };
  Object.keys(out).forEach((k) => { if (out[k] === undefined || out[k] === '') delete out[k]; });
  return out.png_url ? out : null;
}

// 与 opsUpsertRideRequest 一致的 HTTP 事件解析(HTTP 触发 or 直连 callFunction 回退)
function parseEvent(event) {
  const headers = normalizeHeaders((event && (event.headers || event.header)) || {});
  let rawBody = event && (event.rawBody || event.body);
  if (event && event.isBase64Encoded && typeof rawBody === 'string') {
    rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
  }
  if (rawBody == null && event && event.external_trip_id) {
    rawBody = JSON.stringify(event);
  }
  if (typeof rawBody !== 'string') {
    rawBody = JSON.stringify(rawBody || {});
  }
  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    throw createError('INVALID_JSON', 'Invalid JSON body.', 400);
  }
  return { headers, rawBody, payload };
}

// HMAC 门控:签名覆盖 `${timestamp}.${rawBody}`(时间戳纳入,防重放),仅 web 服务端持有 secret
function verifyRequest(headers, rawBody) {
  const sharedSecret = envValue('OPS_SYNC_SHARED_SECRET') || envValue('MINIAPP_SYNC_SHARED_SECRET');
  if (!sharedSecret) {
    throw createError('CONFIG_MISSING', 'OPS_SYNC_SHARED_SECRET is not set.', 500);
  }
  const expectedAccessToken = envValue('OPS_SYNC_ACCESS_TOKEN') || envValue('TCB_ACCESS_TOKEN');
  if (expectedAccessToken) {
    const auth = text(headers.authorization || headers.Authorization);
    const received = auth.replace(/^Bearer\s+/i, '');
    if (!received || !safeEqual(received, expectedAccessToken)) {
      throw createError('UNAUTHORIZED', 'Bad sync access token.', 401);
    }
  }
  const timestamp = text(headers['x-ops-sync-timestamp']);
  const timestampMs = timestamp ? new Date(timestamp).getTime() : 0;
  if (!timestampMs || Number.isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    throw createError('BAD_TIMESTAMP', 'Sync timestamp is missing or expired.', 401);
  }
  const signature = text(headers['x-ops-sync-signature'] || headers['x-farland-signature']).replace(/^sha256=/i, '');
  const expected = hmacSha256(sharedSecret, `${timestamp}.${rawBody}`);
  if (!signature || !safeEqual(signature, expected)) {
    throw createError('BAD_SIGNATURE', 'Bad sync signature.', 401);
  }
}

// 深度查找禁用键(命中即拒)
function deepFindKey(node, keys) {
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = deepFindKey(item, keys);
      if (hit) return hit;
    }
  } else if (isPlainObject(node)) {
    for (const key of Object.keys(node)) {
      if (keys.includes(key)) return key;
      const hit = deepFindKey(node[key], keys);
      if (hit) return hit;
    }
  }
  return '';
}

// 深度剥离禁用键(静默)
function deepStrip(node, keys) {
  if (Array.isArray(node)) return node.map((item) => deepStrip(item, keys));
  if (!isPlainObject(node)) return node;
  return Object.keys(node).reduce((acc, key) => {
    if (keys.includes(key)) return acc;
    acc[key] = deepStrip(node[key], keys);
    return acc;
  }, {});
}

function validatePayload(payload) {
  if (!isPlainObject(payload)) throw createError('VALIDATION_ERROR', 'Payload must be an object.', 400);
  if (payload.schema_version && payload.schema_version !== '1.0.0') {
    throw createError('SCHEMA_VERSION_UNSUPPORTED', 'schema_version must be 1.0.0.', 400);
  }
  const missing = REQUIRED_FIELDS.filter((field) => !text(payload[field]));
  if (!isPlainObject(payload.customer) || !text(payload.customer.display_name)) missing.push('customer.display_name');
  if (!isPlainObject(payload.source) || !text(payload.source.source_type)) missing.push('source.source_type');
  if (missing.length) {
    const error = createError('VALIDATION_ERROR', 'Missing required source fields.', 400);
    error.missing = missing;
    throw error;
  }
  // status 必须是合法枚举:挡住 web 写 'discarded' 等运营态隐藏已发布行程
  if (!ALLOWED_STATUS.includes(text(payload.status))) {
    throw createError('VALIDATION_ERROR', `status must be one of ${ALLOWED_STATUS.join('/')}.`, 400);
  }
  // web 不得写快照
  for (const key of REJECT_TOP_KEYS) {
    if (payload[key] !== undefined && isPlainObject(payload[key]) && Object.keys(payload[key]).length) {
      throw createError('SNAPSHOT_NOT_ALLOWED', `${key} must not be written by the web side; operator builds it.`, 400);
    }
  }
  // 司机身份禁止出现
  const sensitiveHit = deepFindKey(payload, REJECT_SENSITIVE_KEYS);
  if (sensitiveHit) {
    throw createError('SENSITIVE_FIELD_PRESENT', `Driver identity field not allowed: ${sensitiveHit}.`, 400);
  }
  // 091 保护
  const ids = [payload.external_trip_id, payload.trip_id, payload.trip_no].map((v) => text(v));
  if (ids.includes(TRIP_091_NO)) {
    throw createError('TRIP_091_PROTECTED', '091 is a hardcoded trip and cannot be written via web sync.', 409);
  }
  // itinerary_sheet(可选):给了 png_url 就必须是持久 URL(https/cloud),拒 wxfile/http/data/相对路径
  if (isPlainObject(payload.itinerary_sheet) && text(payload.itinerary_sheet.png_url)
      && !itinerarySheetSchemeAllowed(payload.itinerary_sheet.png_url)) {
    throw createError('VALIDATION_ERROR', 'itinerary_sheet.png_url must be an https:// or cloud:// URL.', 400);
  }
  if (isPlainObject(payload.itinerary_sheet) && text(payload.itinerary_sheet.png_base64)
      && text(payload.itinerary_sheet.format || 'png').toLowerCase() !== 'png') {
    throw createError('VALIDATION_ERROR', 'itinerary_sheet.format must be png.', 400);
  }
}

// 只组装白名单 canonical source 字段;customer 剥离联系方式并提到顶层;深度剥内部/成本/供应商
function buildSourceDoc(payload) {
  const stripped = deepStrip(payload, STRIP_KEYS);
  const rawCustomer = isPlainObject(stripped.customer) ? stripped.customer : {};
  const displayName = text(rawCustomer.display_name) || text(rawCustomer.name);
  const source = {
    schema_version: '1.0.0',
    external_trip_id: text(stripped.external_trip_id),
    trip_id: text(stripped.trip_id) || text(stripped.external_trip_id),
    trip_no: text(stripped.trip_no) || text(stripped.external_trip_id),
    trip_type: text(stripped.trip_type),
    customer_profile_id: text(stripped.customer_profile_id),
    source_type: (stripped.source && text(stripped.source.source_type)) || 'web_ops',
    source_id: (stripped.source && text(stripped.source.source_id)) || '',
    title: text(stripped.title),
    city: text(stripped.city),
    country: text(stripped.country),
    timezone: text(stripped.timezone),
    status: text(stripped.status) || 'active',
    status_text: text(stripped.status_text),
    start_at: text(stripped.start_at),
    end_at: text(stripped.end_at),
    date_start: text(stripped.start_at),
    date_end: text(stripped.end_at),
    summary: text(stripped.summary),
    // customer 子对象:只保留展示名,禁止联系方式
    customer: { display_name: displayName, name: displayName },
    customer_display_name: displayName,
    customer_name: displayName,
    // 联系方式只进顶层运营元数据(快照不复制)
    customer_phone: text(rawCustomer.phone),
    customer_wechat_id: text(rawCustomer.wechat_id),
    source: { source_type: (stripped.source && text(stripped.source.source_type)) || 'web_ops', source_id: (stripped.source && text(stripped.source.source_id)) || '' },
    advisor: isPlainObject(stripped.advisor) ? stripped.advisor : {},
    hotels: Array.isArray(stripped.hotels) ? stripped.hotels : [],
    hotel_requests: Array.isArray(stripped.hotels) ? stripped.hotels : [],
    itinerary_days: Array.isArray(stripped.itinerary_days) ? stripped.itinerary_days : [],
    daily_itinerary: Array.isArray(stripped.itinerary_days) ? stripped.itinerary_days : [],
    flights: Array.isArray(stripped.flights) ? stripped.flights : [],
    transfers: Array.isArray(stripped.transfers) ? stripped.transfers : [],
    charter_services: Array.isArray(stripped.charter_services) ? stripped.charter_services : [],
    documents: Array.isArray(stripped.documents) ? stripped.documents : [],
  };
  // 二次保险:customer 子对象绝不含联系方式
  CUSTOMER_CONTACT_KEYS.forEach((k) => { delete source.customer[k]; });
  // 手机版行程单图:顶层字段(scheme 已校验),仅在有效时写入,不入快照
  const itinerarySheet = normalizeItinerarySheetSource(stripped.itinerary_sheet);
  if (itinerarySheet) source.itinerary_sheet = itinerarySheet;
  return source;
}

function unique(values) {
  return Array.from(new Set((values || []).map((value) => text(value)).filter(Boolean)));
}

function buildDateText(start, end) {
  return [text(start), text(end)].filter(Boolean).join(' - ');
}

function buildDailySummaryCards(sourceDoc) {
  const days = Array.isArray(sourceDoc.itinerary_days) ? sourceDoc.itinerary_days : [];
  return days.map((day, index) => {
    const dayNo = Number(day.day_no || index + 1);
    const timelineItems = Array.isArray(day.timeline_items)
      ? day.timeline_items
      : (Array.isArray(day.items) ? day.items : []);
    const hotel = isPlainObject(day.hotel) ? day.hotel : null;
    const transportSummary = isPlainObject(day.transport_summary) ? day.transport_summary : null;
    return deepStrip({
      id: `day_${dayNo}`,
      day_no: dayNo,
      date: text(day.date),
      weekday: text(day.weekday),
      title: text(day.title) || `Day ${dayNo}`,
      city: text(day.city),
      start_time_text: text(day.start_time_text || day.estimated_departure_time || day.estimated_departure_time_raw || day.start_time),
      estimated_departure_time_raw: text(day.estimated_departure_time_raw),
      estimated_departure_time: text(day.estimated_departure_time),
      hotel_badge: hotel ? text(hotel.name || hotel.hotel_name || hotel.title) : '',
      transport_badge: transportSummary ? text(transportSummary.title || transportSummary.vehicle_summary || transportSummary.vehicle_class) : '',
      highlight_items: timelineItems.map((item) => text(item && item.title)).filter(Boolean).slice(0, 2),
      item_count: timelineItems.length,
      clickable: true,
    }, STRIP_KEYS);
  });
}

function buildTripSummary(sourceDoc, hotelCards, flightCards) {
  const days = Array.isArray(sourceDoc.itinerary_days) ? sourceDoc.itinerary_days : [];
  const transfers = Array.isArray(sourceDoc.transfers) ? sourceDoc.transfers : [];
  const charterServices = Array.isArray(sourceDoc.charter_services) ? sourceDoc.charter_services : [];
  const dateRange = buildDateText(sourceDoc.start_at || sourceDoc.date_start, sourceDoc.end_at || sourceDoc.date_end);
  return deepStrip({
    trip_id: sourceDoc.trip_id || sourceDoc.external_trip_id || '',
    external_trip_id: sourceDoc.external_trip_id || sourceDoc.trip_id || '',
    trip_no: sourceDoc.trip_no || sourceDoc.external_trip_id || sourceDoc.trip_id || '',
    title: sourceDoc.title || 'Farland 行程',
    date_range_text: dateRange,
    city_route_text: unique(days.map((day) => day && day.city)).join(' → ') || sourceDoc.city || '',
    days_count: days.length,
    hotels_count: hotelCards.length,
    flights_count: flightCards.length,
    transport_count: transfers.length + charterServices.length,
    next_day_label: days[0] ? `Day ${days[0].day_no || 1}: ${days[0].title || days[0].city || ''}` : '',
  }, STRIP_KEYS);
}

function buildDraftSnapshot(sourceDoc) {
  const days = Array.isArray(sourceDoc.itinerary_days) ? deepStrip(sourceDoc.itinerary_days, STRIP_KEYS) : [];
  const hotelCards = Array.isArray(sourceDoc.hotels) ? deepStrip(sourceDoc.hotels, STRIP_KEYS) : [];
  const flightCards = Array.isArray(sourceDoc.flights) ? deepStrip(sourceDoc.flights, STRIP_KEYS) : [];
  const transfers = Array.isArray(sourceDoc.transfers) ? deepStrip(sourceDoc.transfers, STRIP_KEYS) : [];
  const charterServices = Array.isArray(sourceDoc.charter_services) ? deepStrip(sourceDoc.charter_services, STRIP_KEYS) : [];
  const documents = Array.isArray(sourceDoc.documents)
    ? deepStrip(sourceDoc.documents.filter((doc) => doc && doc.visible_to_customer !== false), STRIP_KEYS)
    : [];
  const dateRange = buildDateText(sourceDoc.start_at || sourceDoc.date_start, sourceDoc.end_at || sourceDoc.date_end);
  return deepStrip({
    snapshot_model_version: 2,
    trip_id: sourceDoc.trip_id || sourceDoc.external_trip_id || '',
    external_trip_id: sourceDoc.external_trip_id || sourceDoc.trip_id || '',
    trip_no: sourceDoc.trip_no || sourceDoc.external_trip_id || sourceDoc.trip_id || '',
    title: sourceDoc.title || 'Farland 行程',
    trip_type: sourceDoc.trip_type || '',
    status: sourceDoc.status || 'active',
    city: sourceDoc.city || '',
    country: sourceDoc.country || '',
    timezone: sourceDoc.timezone || '',
    start_at: sourceDoc.start_at || sourceDoc.date_start || '',
    end_at: sourceDoc.end_at || sourceDoc.date_end || '',
    summary: sourceDoc.summary || '',
    customer: {
      display_name: sourceDoc.customer_display_name || (sourceDoc.customer && sourceDoc.customer.display_name) || '',
      name: sourceDoc.customer_name || (sourceDoc.customer && sourceDoc.customer.name) || '',
    },
    advisor: deepStrip(sourceDoc.advisor || {}, STRIP_KEYS),
    hero: {
      title: sourceDoc.title || 'Farland 行程',
      trip_no: sourceDoc.trip_no || sourceDoc.external_trip_id || sourceDoc.trip_id || '',
      date_range: dateRange,
      city_summary: sourceDoc.city || '',
    },
    trip_summary: buildTripSummary(sourceDoc, hotelCards, flightCards),
    daily_summary_cards: buildDailySummaryCards(sourceDoc),
    hotel_cards: hotelCards,
    flight_cards: flightCards,
    itinerary_days: days,
    hotels: hotelCards,
    flights: flightCards,
    transfers,
    charter_services: charterServices,
    documents,
  }, STRIP_KEYS);
}

function hasSnapshot(snapshot) {
  return isPlainObject(snapshot) && Object.keys(snapshot).length > 0;
}

function buildAutoPublishLifecycle(draftSnapshot, now, previousVersion = 0, options = {}) {
  const existingVersion = Number(previousVersion || 0);
  const nextVersion = options.keepVersion ? Math.max(1, existingVersion) : existingVersion + 1;
  return {
    review_status: 'approved',
    visibility_status: 'published',
    warning_codes: [],
    critical_warning_codes: [],
    published_version: nextVersion || 1,
    draft_snapshot: draftSnapshot,
    published_snapshot: draftSnapshot,
    reviewed_by: 'web_ops',
    reviewed_by_openid: '',
    reviewed_at: now,
    published_by: 'web_ops',
    published_by_openid: '',
    published_at: now,
    auto_published_by: 'web_ops',
    auto_published_at: now,
  };
}

exports.main = async (event = {}) => {
  try {
    const { headers, rawBody, payload } = parseEvent(event);
    verifyRequest(headers, rawBody);
    validatePayload(payload);

    const persistedPayload = await persistItinerarySheetIfNeeded(payload);
    const sourceDoc = buildSourceDoc(persistedPayload);
    const sourceHash = stableHash(sourceDoc);
    const externalTripId = sourceDoc.external_trip_id;
    const now = new Date().toISOString();
    const draftSnapshot = buildDraftSnapshot(sourceDoc);

    const existingRes = await db.collection('customer_trips')
      .where({ external_trip_id: externalTripId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const existing = existingRes.data && existingRes.data[0];

    if (existing && existing._id === TRIP_091_DOC_ID) {
      return { success: false, code: 409, error_code: 'TRIP_091_PROTECTED', message: '091 cannot be written via web sync.' };
    }

    // 幂等:同 external_trip_id + 同 source_hash → 不重写；若旧记录缺客户版快照,补齐自动启用。
    if (existing && text(existing.source_hash) === sourceHash) {
      const discarded = existing.visibility_status === 'discarded';
      const needsDraftBackfill = !hasSnapshot(existing.draft_snapshot);
      const needsPublishBackfill = !discarded && (
        existing.visibility_status !== 'published'
        || existing.review_status !== 'approved'
        || !hasSnapshot(existing.published_snapshot)
        || !(Number(existing.published_version || 0) > 0)
      );
      if (needsDraftBackfill || needsPublishBackfill) {
        const lifecycle = needsPublishBackfill
          ? buildAutoPublishLifecycle(draftSnapshot, now, existing.published_version, {
            keepVersion: Number(existing.published_version || 0) > 0 && hasSnapshot(existing.published_snapshot),
          })
          : { draft_snapshot: draftSnapshot };
        await db.collection('customer_trips').doc(existing._id).update({
          data: {
            ...lifecycle,
            updated_by: 'web_ops',
            updated_at: now,
          },
        });
        await writeAudit(needsPublishBackfill ? 'ops_sync_customer_trip_auto_publish_backfilled' : 'ops_sync_customer_trip_draft_backfilled', existing._id, externalTripId, sourceHash, now);
        return {
          success: true, code: 0, idempotent: true, action: needsPublishBackfill ? 'auto_published_backfilled' : 'draft_backfilled',
          trip_id: existing.trip_id || existing.external_trip_id || externalTripId,
          external_trip_id: externalTripId,
          review_status: needsPublishBackfill ? 'approved' : (existing.review_status || 'pending_review'),
          visibility_status: needsPublishBackfill ? 'published' : (existing.visibility_status || 'hidden'),
          published_version: needsPublishBackfill
            ? (lifecycle.published_version || 1)
            : (existing.published_version || 0),
          auto_published: Boolean(needsPublishBackfill),
        };
      }
      return {
        success: true, code: 0, idempotent: true, action: 'unchanged',
        trip_id: existing.trip_id || existing.external_trip_id || externalTripId,
        external_trip_id: externalTripId,
        review_status: existing.review_status || 'pending_review',
        visibility_status: existing.visibility_status || 'hidden',
        published_version: existing.published_version || 0,
        auto_published: existing.review_status === 'approved' && existing.visibility_status === 'published' && hasSnapshot(existing.published_snapshot),
      };
    }

    const baseWrite = {
      ...sourceDoc,
      source_hash: sourceHash,
      updated_by: 'web_ops',
      updated_at: now,
    };

    if (!existing) {
      // 新建:Web 仍只发送 canonical source;小程序侧构建安全快照后直接发布给客户可见入口。
      const initialLifecycle = buildAutoPublishLifecycle(draftSnapshot, now, 0);
      const created = await db.collection('customer_trips').add({
        data: {
          ...baseWrite,
          ...initialLifecycle,
          created_by: 'web_ops',
          created_at: now,
        },
      });
      await writeAudit('ops_sync_customer_trip_created_auto_published', created._id, externalTripId, sourceHash, now);
      return {
        success: true, code: 0, action: 'created',
        trip_id: sourceDoc.trip_id, external_trip_id: externalTripId,
        review_status: initialLifecycle.review_status,
        visibility_status: initialLifecycle.visibility_status,
        published_version: initialLifecycle.published_version,
        auto_published: true,
      };
    }

    const discarded = existing.visibility_status === 'discarded';
    if (discarded) {
      await db.collection('customer_trips').doc(existing._id).update({
        data: {
          ...baseWrite,
          draft_snapshot: draftSnapshot,
          review_status: 'pending_review',
          visibility_status: 'hidden',
        },
      });
      await writeAudit('ops_sync_customer_trip_updated_hidden_from_discarded', existing._id, externalTripId, sourceHash, now);
      return {
        success: true, code: 0, action: 'updated_hidden',
        trip_id: sourceDoc.trip_id, external_trip_id: externalTripId,
        review_status: 'pending_review',
        visibility_status: 'hidden',
        published_version: existing.published_version || 0,
        auto_published: false,
      };
    }

    // 更新:Web 仍只写 canonical source;小程序侧重建安全快照后直接替换客户可见版本。
    const lifecycle = buildAutoPublishLifecycle(draftSnapshot, now, existing.published_version || 0);
    await db.collection('customer_trips').doc(existing._id).update({
      data: {
        ...baseWrite,
        ...lifecycle,
      },
    });
    await writeAudit('ops_sync_customer_trip_updated_auto_published', existing._id, externalTripId, sourceHash, now);
    return {
      success: true, code: 0, action: 'auto_published',
      trip_id: sourceDoc.trip_id, external_trip_id: externalTripId,
      review_status: lifecycle.review_status,
      visibility_status: lifecycle.visibility_status,
      published_version: lifecycle.published_version,
      auto_published: true,
    };
  } catch (error) {
    return {
      success: false,
      code: error.code || 500,
      error_code: error.error_code || 'OPS_UPSERT_CUSTOMER_TRIP_FAILED',
      message: error.message || '行程同步失败',
      missing: error.missing || undefined,
    };
  }
};

async function writeAudit(action, targetId, externalTripId, sourceHash, now) {
  await db.collection('audit_logs').add({
    data: {
      actor_openid: '', actor_user_id: 'web_ops', actor_role: 'system',
      action, target_type: 'customer_trip', target_id: targetId,
      detail: { external_trip_id: externalTripId, source_hash: sourceHash, source_system: 'web_ops' },
      created_at: now,
    },
  }).catch(() => null);
}
