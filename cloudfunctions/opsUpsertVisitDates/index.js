const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;
// 091 保护(约定沿用):无 091 学校,但保留拒绝路径,不新增 091 分支
const TRIP_091_NO = '2026XBC091';

// 访校可约行(visit_bookable_dates)必填
const REQUIRED_FIELDS = ['school_slug', 'name', 'name_en', 'location', 'visit_type', 'status'];
// status 枚举(对齐读 fn STATUS_MAP);其它态默认 neutral,web 不得写运营内部态
const ALLOWED_STATUS = ['bookable', 'limited', 'advance_required'];

// 出现即拒(fail-closed):司机身份
const REJECT_SENSITIVE_KEYS = [
  'driver_name', 'driver_phone', 'plate_number', 'vehicle_summary',
  'driver_id', 'driver_openid', 'driver_user_id',
];
// 深度剥离(静默):内部/成本/供应商 token + 访校黑名单
const STRIP_KEYS = [
  'internal_note', 'internal_notes', 'operator_note', 'operator_notes', 'operator_internal_note',
  'supplier_note', 'supplier_notes', 'supplier_private_note', 'supplier_private_notes',
  'cost', 'driver_cost', 'margin', 'driver_quotes', 'driver_quote', 'raw_quote_pool',
  'little_majia_id', 'goods_uniq_id', 'supplier_id', 'sub_supplier_id', 'shopper_product_id',
  'raw_imported_json', 'raw_json', 'source_raw_text', 'source_pdf_text', 'openid', 'customer_openid',
  // 访校专属黑名单:绝不进客户可读集合
  'visitOffice', 'contactPerson', 'advisorNotes', 'materials', 'requestedSlots',
  'timeline', 'internal_status', 'booking_portal_token', 'quota', 'supplier_note',
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

// HTTP 事件解析(HTTP 触发 or 直连 callFunction 回退);直连回退 key off school_slug
function parseEvent(event) {
  const headers = normalizeHeaders((event && (event.headers || event.header)) || {});
  let rawBody = event && (event.rawBody || event.body);
  if (event && event.isBase64Encoded && typeof rawBody === 'string') {
    rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
  }
  if (rawBody == null && event && event.school_slug) {
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

// 访校行校验:改写自 trip 版,去掉 customer.display_name / source.source_type 子对象检查
function validatePayload(payload) {
  if (!isPlainObject(payload)) throw createError('VALIDATION_ERROR', 'Payload must be an object.', 400);
  if (payload.schema_version && payload.schema_version !== '1.0.0') {
    throw createError('SCHEMA_VERSION_UNSUPPORTED', 'schema_version must be 1.0.0.', 400);
  }
  const missing = REQUIRED_FIELDS.filter((field) => !text(payload[field]));
  if (missing.length) {
    const error = createError('VALIDATION_ERROR', 'Missing required visit-date fields.', 400);
    error.missing = missing;
    throw error;
  }
  // status 必须是合法枚举:挡住 web 写内部态
  if (!ALLOWED_STATUS.includes(text(payload.status))) {
    throw createError('VALIDATION_ERROR', `status must be one of ${ALLOWED_STATUS.join('/')}.`, 400);
  }
  // 司机身份禁止出现(fail-closed)
  const sensitiveHit = deepFindKey(payload, REJECT_SENSITIVE_KEYS);
  if (sensitiveHit) {
    throw createError('SENSITIVE_FIELD_PRESENT', `Driver identity field not allowed: ${sensitiveHit}.`, 400);
  }
  // 091 保护(约定沿用):访校无 091 学校,但保留拒绝路径
  const ids = [payload.school_slug, payload.external_id, payload.trip_no].map((v) => text(v));
  if (ids.includes(TRIP_091_NO)) {
    throw createError('TRIP_091_PROTECTED', '091 is a hardcoded trip and cannot be written via web sync.', 409);
  }
}

// 只组装白名单访校行字段;深度剥内部/成本/供应商 + 访校黑名单
function buildSourceDoc(payload) {
  const stripped = deepStrip(payload, STRIP_KEYS);
  const rawDates = Array.isArray(stripped.dates) ? stripped.dates : [];
  const dates = rawDates
    .map((d) => (isPlainObject(d) ? { iso: text(d.iso), label: text(d.label) } : null))
    .filter((d) => d && (d.iso || d.label));
  const durationMin = Number(stripped.duration_min || 0);
  return {
    schema_version: '1.0.0',
    school_slug: text(stripped.school_slug),
    name: text(stripped.name),
    name_en: text(stripped.name_en),
    location: text(stripped.location),
    visit_type: text(stripped.visit_type),
    duration_min: Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 0,
    status: text(stripped.status),
    dates,
    sync_label: text(stripped.sync_label),
    synced_at: text(stripped.synced_at),
    region_tag: text(stripped.region_tag),
    is_ivy: stripped.is_ivy === true,
    has_info_session: stripped.has_info_session === true,
  };
}

exports.main = async (event = {}) => {
  try {
    const { headers, rawBody, payload } = parseEvent(event);
    verifyRequest(headers, rawBody);
    validatePayload(payload);

    const sourceDoc = buildSourceDoc(payload);
    const sourceHash = stableHash(sourceDoc);
    const schoolSlug = sourceDoc.school_slug;
    const now = new Date().toISOString();

    const existingRes = await db.collection('visit_bookable_dates')
      .where({ school_slug: schoolSlug })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const existing = existingRes.data && existingRes.data[0];

    // 幂等:同 school_slug + 同 source_hash → 不重写
    if (existing && text(existing.source_hash) === sourceHash) {
      return {
        success: true, code: 0, idempotent: true, action: 'unchanged',
        school_slug: schoolSlug,
      };
    }

    const baseWrite = {
      ...sourceDoc,
      source_hash: sourceHash,
      updated_by: 'web_ops',
      updated_at: now,
    };

    if (!existing) {
      const created = await db.collection('visit_bookable_dates').add({
        data: { ...baseWrite, created_by: 'web_ops', created_at: now },
      });
      await writeAudit('ops_sync_visit_dates_created', created._id, schoolSlug, sourceHash, now);
      return { success: true, code: 0, action: 'created', school_slug: schoolSlug };
    }

    await db.collection('visit_bookable_dates').doc(existing._id).update({ data: baseWrite });
    await writeAudit('ops_sync_visit_dates_updated', existing._id, schoolSlug, sourceHash, now);
    return { success: true, code: 0, action: 'updated', school_slug: schoolSlug };
  } catch (error) {
    return {
      success: false,
      code: error.code || 500,
      error_code: error.error_code || 'OPS_UPSERT_VISIT_DATES_FAILED',
      message: error.message || '访校日期同步失败',
      missing: error.missing || undefined,
    };
  }
};

async function writeAudit(action, targetId, schoolSlug, sourceHash, now) {
  await db.collection('audit_logs').add({
    data: {
      actor_openid: '', actor_user_id: 'web_ops', actor_role: 'system',
      action, target_type: 'visit_bookable_dates', target_id: targetId,
      detail: { school_slug: schoolSlug, source_hash: sourceHash, source_system: 'web_ops' },
      created_at: now,
    },
  }).catch(() => null);
}
