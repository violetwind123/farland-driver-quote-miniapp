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
  return source;
}

exports.main = async (event = {}) => {
  try {
    const { headers, rawBody, payload } = parseEvent(event);
    verifyRequest(headers, rawBody);
    validatePayload(payload);

    const sourceDoc = buildSourceDoc(payload);
    const sourceHash = stableHash(sourceDoc);
    const externalTripId = sourceDoc.external_trip_id;
    const now = new Date().toISOString();

    const existingRes = await db.collection('customer_trips')
      .where({ external_trip_id: externalTripId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const existing = existingRes.data && existingRes.data[0];

    if (existing && existing._id === TRIP_091_DOC_ID) {
      return { success: false, code: 409, error_code: 'TRIP_091_PROTECTED', message: '091 cannot be written via web sync.' };
    }

    // 幂等:同 external_trip_id + 同 source_hash → 不重写
    if (existing && text(existing.source_hash) === sourceHash) {
      return {
        success: true, code: 0, idempotent: true, action: 'unchanged',
        trip_id: existing.trip_id || existing.external_trip_id || externalTripId,
        external_trip_id: externalTripId,
        review_status: existing.review_status || 'pending_review',
        visibility_status: existing.visibility_status || 'hidden',
        published_version: existing.published_version || 0,
      };
    }

    const baseWrite = {
      ...sourceDoc,
      source_hash: sourceHash,
      updated_by: 'web_ops',
      updated_at: now,
    };

    if (!existing) {
      // 新建:生命周期种子,快照留空
      const created = await db.collection('customer_trips').add({
        data: {
          ...baseWrite,
          review_status: 'pending_review',
          visibility_status: 'hidden',
          warning_codes: [],
          critical_warning_codes: [],
          published_version: 0,
          draft_snapshot: {},
          published_snapshot: {},
          created_by: 'web_ops',
          created_at: now,
        },
      });
      await writeAudit('ops_sync_customer_trip_created', created._id, externalTripId, sourceHash, now);
      return {
        success: true, code: 0, action: 'created',
        trip_id: sourceDoc.trip_id, external_trip_id: externalTripId,
        review_status: 'pending_review', visibility_status: 'hidden', published_version: 0,
      };
    }

    // 更新:只改 source 字段,保留运营端已建/已发布状态边界(draft/published/version 不由 web 写)
    const published = (existing.published_version || 0) > 0;
    // discarded 只认运营态 visibility_status(source 的 status 由 web 写,不能据它改可见性)
    const discarded = existing.visibility_status === 'discarded';
    await db.collection('customer_trips').doc(existing._id).update({
      data: {
        ...baseWrite,
        // 已发布过 → 标记待复核(客户仍看旧 published,直到运营重新发布);未发布 → 待复核
        review_status: published && !discarded ? 'needs_review' : 'pending_review',
        visibility_status: discarded ? 'hidden' : (existing.visibility_status || 'hidden'),
        // 不触碰 published_version / draft_snapshot / published_snapshot
      },
    });
    await writeAudit('ops_sync_customer_trip_updated', existing._id, externalTripId, sourceHash, now);
    return {
      success: true, code: 0, action: 'updated',
      trip_id: sourceDoc.trip_id, external_trip_id: externalTripId,
      review_status: published && !discarded ? 'needs_review' : 'pending_review',
      visibility_status: discarded ? 'hidden' : (existing.visibility_status || 'hidden'),
      published_version: existing.published_version || 0,
      note: published ? 'Customer still sees the last published version until an operator republishes.' : '',
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
