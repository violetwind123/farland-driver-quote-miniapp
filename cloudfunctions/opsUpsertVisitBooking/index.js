const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;
// 091 保护:访校预约与 trip 分属不同 collection,但仍拒绝把 visit 键到 091(external_trip_id/trip_id)。
const TRIP_091_DOC_ID = 'bf757c4c6a2054f800350a925147b32e';
const TRIP_091_NO = '2026XBC091';

// canonical source 必填(对齐 docs/schema/visit-booking.schema.json 的 required)
// external_visit_id 为 web 侧唯一去重键;external_trip_id 绑定父 customer_trips(客户端访校可见性复用 trip 的 access)。
const REQUIRED_FIELDS = [
  'external_visit_id', 'external_trip_id', 'school', 'visitType', 'status',
];
// status 枚举(对齐 §2 的 8 态);web 只能写这些态,运营生命周期态(如 discarded)不得由 web 写。
const ALLOWED_STATUS = [
  'pending_query', 'available', 'submitted', 'awaiting_school',
  'confirmed', 'materials_needed', 'conflict', 'cancelled',
];

// 出现即拒(fail-closed):web 不得写司机身份(访校无司机,fail-closed 兜底)。
const REJECT_SENSITIVE_KEYS = [
  'driver_name', 'driver_phone', 'plate_number', 'vehicle_summary',
  'driver_id', 'driver_openid', 'driver_user_id',
];
// 深度剥离(静默):内部/成本/供应商 token —— VisitBooking §1 无成本字段,保留作为防御下限。
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

// 与 opsUpsertCustomerTrip 一致的 HTTP 事件解析(HTTP 触发 or 直连 callFunction 回退)
function parseEvent(event) {
  const headers = normalizeHeaders((event && (event.headers || event.header)) || {});
  let rawBody = event && (event.rawBody || event.body);
  if (event && event.isBase64Encoded && typeof rawBody === 'string') {
    rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
  }
  if (rawBody == null && event && event.external_visit_id) {
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

// HMAC 门控:签名覆盖 `${timestamp}.${rawBody}`(时间戳纳入,防重放),仅 web 服务端持有 secret。
// 与 opsUpsertCustomerTrip 字节级一致:同 secret / 同 headers / 同 signature base。
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
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = payload[field];
    // school 为对象:需存在且带 nameCn(§1 学校名主键是 school.nameCn,非 school.name)。
    if (field === 'school') return !isPlainObject(value) || !text(value.nameCn);
    return !text(value);
  });
  // confirmedSlot 仅在 status==='confirmed' 时必填(唯一客户可见时间)。
  if (text(payload.status) === 'confirmed') {
    const slot = payload.confirmedSlot;
    if (!isPlainObject(slot) || !text(slot.date) || !text(slot.start)) {
      missing.push('confirmedSlot');
    }
  }
  if (missing.length) {
    const error = createError('VALIDATION_ERROR', 'Missing required source fields.', 400);
    error.missing = missing;
    throw error;
  }
  // status 必须是合法枚举:挡住 web 写非 §2 态。
  if (!ALLOWED_STATUS.includes(text(payload.status))) {
    throw createError('VALIDATION_ERROR', `status must be one of ${ALLOWED_STATUS.join('/')}.`, 400);
  }
  // 司机身份禁止出现(访校无司机,fail-closed)。
  const sensitiveHit = deepFindKey(payload, REJECT_SENSITIVE_KEYS);
  if (sensitiveHit) {
    throw createError('SENSITIVE_FIELD_PRESENT', `Driver identity field not allowed: ${sensitiveHit}.`, 400);
  }
  // 091 保护:visit 绝不能键到 091 行程。
  const ids = [payload.external_visit_id, payload.external_trip_id, payload.trip_id, payload.trip_no, payload.visit_id]
    .map((v) => text(v));
  if (ids.includes(TRIP_091_NO)) {
    throw createError('TRIP_091_PROTECTED', '091 is a hardcoded trip and cannot be written via web sync.', 409);
  }
}

// 组装 FULL VisitBooking(§1,含内部字段):collection 存全量;客户侧读函数(getCustomerVisit*)独立执行白名单。
// deepStrip 剥内部/成本/供应商 token 作为防御下限。
function buildSourceDoc(payload) {
  const stripped = deepStrip(payload, STRIP_KEYS);
  const school = isPlainObject(stripped.school) ? stripped.school : {};
  const confirmedSlot = isPlainObject(stripped.confirmedSlot) ? stripped.confirmedSlot : {};
  const meetingPoint = isPlainObject(stripped.meetingPoint) ? stripped.meetingPoint : {};
  const arrival = isPlainObject(stripped.arrival) ? stripped.arrival : {};
  const visitOffice = isPlainObject(stripped.visitOffice) ? stripped.visitOffice : {};
  const contactPerson = isPlainObject(stripped.contactPerson) ? stripped.contactPerson : {};
  const confirmation = isPlainObject(stripped.confirmation) ? stripped.confirmation : {};
  const weather = isPlainObject(stripped.weather) ? stripped.weather : {};

  const source = {
    schema_version: '1.0.0',
    external_visit_id: text(stripped.external_visit_id),
    visit_id: text(stripped.visit_id) || text(stripped.external_visit_id),
    // 父行程绑定:客户端访校可见性复用 customer_trip_access(openid<->trip_id)。
    external_trip_id: text(stripped.external_trip_id),
    trip_id: text(stripped.trip_id) || text(stripped.external_trip_id),
    // school:§1 主键 nameCn(+ optional nameEn / city / campus)。
    school: {
      nameCn: text(school.nameCn),
      nameEn: text(school.nameEn),
      city: text(school.city),
      campus: text(school.campus),
    },
    visitType: text(stripped.visitType),
    status: text(stripped.status),
    status_text: text(stripped.status_text),
    // requestedSlots:提交时的备选(内部)。
    requestedSlots: Array.isArray(stripped.requestedSlots)
      ? stripped.requestedSlots.map((s) => ({ date: text(s && s.date), time: text(s && s.time) }))
      : [],
    // confirmedSlot:唯一客户可见时间。
    confirmedSlot: {
      date: text(confirmedSlot.date),
      start: text(confirmedSlot.start),
      end: text(confirmedSlot.end),
      tz: text(confirmedSlot.tz),
    },
    // students:客户 PII(内部)。
    students: Array.isArray(stripped.students)
      ? stripped.students.map((st) => ({ id: text(st && st.id), name: text(st && st.name), grade: text(st && st.grade) }))
      : [],
    meetingPoint: {
      name: text(meetingPoint.name),
      addressEn: text(meetingPoint.addressEn),
      mapUrl: text(meetingPoint.mapUrl),
    },
    arrival: {
      arriveEarlyMin: Number.isFinite(Number(arrival.arriveEarlyMin)) && text(arrival.arriveEarlyMin) !== ''
        ? Number(arrival.arriveEarlyMin)
        : null,
      parkingNote: text(arrival.parkingNote),
      transportNote: text(arrival.transportNote),
    },
    // visitOffice / contactPerson / advisorNotes:内部区(仅运营)。
    visitOffice: {
      name: text(visitOffice.name),
      email: text(visitOffice.email),
      phone: text(visitOffice.phone),
      portalUrl: text(visitOffice.portalUrl),
    },
    contactPerson: {
      name: text(contactPerson.name),
      role: text(contactPerson.role),
      email: text(contactPerson.email),
    },
    // confirmation:确认函(fileID/fileUrl 内部,fileUrl 由 getTempFileURL 在运营详情内解析)。
    confirmation: {
      fileID: text(confirmation.fileID),
      fileUrl: text(confirmation.fileUrl),
      confirmationNo: text(confirmation.confirmationNo),
      uploadedBy: text(confirmation.uploadedBy),
      uploadedAt: text(confirmation.uploadedAt),
    },
    // materials:材料清单(内部)。
    materials: Array.isArray(stripped.materials)
      ? stripped.materials.map((m) => ({
          name: text(m && m.name),
          required: !!(m && m.required),
          status: text(m && m.status),
        }))
      : [],
    advisorNotes: text(stripped.advisorNotes),
    // conflictWith:同学生时间重叠自动判定(内部并行标记)。
    conflictWith: text(stripped.conflictWith) || null,
    // timeline:操作时间线(内部)。
    timeline: Array.isArray(stripped.timeline)
      ? stripped.timeline.map((t) => ({ ts: text(t && t.ts), actor: text(t && t.actor), action: text(t && t.action) }))
      : [],
    // weather:NOAA/NWS T-1 拉取(客户可见提示 icon/high/low/precip)。
    weather: {
      icon: text(weather.icon),
      high: text(weather.high),
      low: text(weather.low),
      precip: text(weather.precip),
    },
    weatherSource: text(stripped.weatherSource) || 'NOAA · NWS',
    source: {
      source_type: (stripped.source && text(stripped.source.source_type)) || 'web_ops',
      source_id: (stripped.source && text(stripped.source.source_id)) || '',
    },
  };
  return source;
}

exports.main = async (event = {}) => {
  try {
    const { headers, rawBody, payload } = parseEvent(event);
    verifyRequest(headers, rawBody);
    validatePayload(payload);

    const sourceDoc = buildSourceDoc(payload);
    const sourceHash = stableHash(sourceDoc);
    const externalVisitId = sourceDoc.external_visit_id;
    const now = new Date().toISOString();

    const existingRes = await db.collection('visit_bookings')
      .where({ external_visit_id: externalVisitId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const existing = existingRes.data && existingRes.data[0];

    // 091 doc-id 兜底:即便某历史 doc 撞了 091 docId,也拒绝改写。
    if (existing && existing._id === TRIP_091_DOC_ID) {
      return { success: false, code: 409, error_code: 'TRIP_091_PROTECTED', message: '091 cannot be written via web sync.' };
    }

    // 幂等:同 external_visit_id + 同 source_hash → 不重写。
    if (existing && text(existing.source_hash) === sourceHash) {
      return {
        success: true, code: 0, idempotent: true, action: 'unchanged',
        visit_id: existing.visit_id || existing.external_visit_id || externalVisitId,
        external_visit_id: externalVisitId,
        status: existing.status || sourceDoc.status,
      };
    }

    const baseWrite = {
      ...sourceDoc,
      source_hash: sourceHash,
      updated_by: 'web_ops',
      updated_at: now,
    };

    if (!existing) {
      const created = await db.collection('visit_bookings').add({
        data: {
          ...baseWrite,
          created_by: 'web_ops',
          created_at: now,
        },
      });
      await writeAudit('ops_sync_visit_booking_created', created._id, externalVisitId, sourceHash, now);
      return {
        success: true, code: 0, action: 'created',
        visit_id: sourceDoc.visit_id, external_visit_id: externalVisitId,
        status: sourceDoc.status,
      };
    }

    await db.collection('visit_bookings').doc(existing._id).update({
      data: { ...baseWrite },
    });
    await writeAudit('ops_sync_visit_booking_updated', existing._id, externalVisitId, sourceHash, now);
    return {
      success: true, code: 0, action: 'updated',
      visit_id: sourceDoc.visit_id, external_visit_id: externalVisitId,
      status: sourceDoc.status,
    };
  } catch (error) {
    return {
      success: false,
      code: error.code || 500,
      error_code: error.error_code || 'OPS_UPSERT_VISIT_BOOKING_FAILED',
      message: error.message || '访校预约同步失败',
      missing: error.missing || undefined,
    };
  }
};

async function writeAudit(action, targetId, externalVisitId, sourceHash, now) {
  await db.collection('audit_logs').add({
    data: {
      actor_openid: '', actor_user_id: 'web_ops', actor_role: 'system',
      action, target_type: 'visit_booking', target_id: targetId,
      detail: { external_visit_id: externalVisitId, source_hash: sourceHash, source_system: 'web_ops' },
      created_at: now,
    },
  }).catch(() => null);
}
