const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ===== SHARED CUSTOMER VISIT VIEW (keep character-identical across getCustomerVisitList / getCustomerVisitDetail) =====
// 客户端字段黑名单(永不下发到客户侧;§1/§2 内部区)。allowlist 组装后再 strip 一次 = 双重强制。
const VISIT_CUSTOMER_BLACKLIST = new Set([
  'visitOffice',
  'contactPerson',
  'advisorNotes',
  'materials',
  'requestedSlots',
  'timeline',
  'status',
  'students',
  'confirmation',
  'conflictWith',
  'source_hash',
]);

function isPlainObjectView(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

// 深度剥离黑名单键(静默);作用于最终投影对象,兜底 allowlist 之外的任何泄漏。
function stripVisitBlacklist(value) {
  if (Array.isArray(value)) {
    return value.map(stripVisitBlacklist);
  }
  if (!isPlainObjectView(value)) return value;
  return Object.keys(value).reduce((acc, key) => {
    if (VISIT_CUSTOMER_BLACKLIST.has(key)) return acc;
    acc[key] = stripVisitBlacklist(value[key]);
    return acc;
  }, {});
}

// 唯一客户可见投影:先 allowlist 精确挑字段,再 sanitizeCustomerObject + VISIT_CUSTOMER_BLACKLIST strip(第二次强制)。
function buildCustomerVisitView(booking) {
  const doc = isPlainObjectView(booking) ? booking : {};
  const school = isPlainObjectView(doc.school) ? doc.school : {};
  const confirmedSlot = isPlainObjectView(doc.confirmedSlot) ? doc.confirmedSlot : {};
  const meetingPoint = isPlainObjectView(doc.meetingPoint) ? doc.meetingPoint : {};
  const arrival = isPlainObjectView(doc.arrival) ? doc.arrival : {};
  const weather = isPlainObjectView(doc.weather) ? doc.weather : {};
  // 第一次强制:只挑白名单字段进对象(allowlist build)
  const allowlisted = {
    school: {
      nameCn: school.nameCn == null ? '' : String(school.nameCn),
      nameEn: school.nameEn == null ? '' : String(school.nameEn),
    },
    confirmedSlot: {
      date: confirmedSlot.date == null ? '' : String(confirmedSlot.date),
      start: confirmedSlot.start == null ? '' : String(confirmedSlot.start),
      end: confirmedSlot.end == null ? '' : String(confirmedSlot.end),
      tz: confirmedSlot.tz == null ? '' : String(confirmedSlot.tz),
    },
    visitType: doc.visitType == null ? '' : String(doc.visitType),
    meetingPoint: {
      name: meetingPoint.name == null ? '' : String(meetingPoint.name),
      addressEn: meetingPoint.addressEn == null ? '' : String(meetingPoint.addressEn),
      mapUrl: meetingPoint.mapUrl == null ? '' : String(meetingPoint.mapUrl),
    },
    arriveEarlyMin: arrival.arriveEarlyMin == null ? '' : arrival.arriveEarlyMin,
    transportNote: arrival.transportNote == null ? '' : String(arrival.transportNote),
    weather: {
      icon: weather.icon == null ? '' : String(weather.icon),
      high: weather.high == null ? '' : weather.high,
      low: weather.low == null ? '' : weather.low,
      precip: weather.precip == null ? '' : weather.precip,
    },
    weatherSource: 'NOAA · NWS',
  };
  // 第二次强制:sanitize(通用敏感键)+ VISIT_CUSTOMER_BLACKLIST 深度 strip
  return stripVisitBlacklist(sanitizeCustomerObject(allowlisted));
}
// ===== END SHARED CUSTOMER VISIT VIEW =====


const BLOCKED_SNAPSHOT_KEYS = new Set([
  'openid',
  'customer_openid',
  'customer_user_id',
  'user_id',
  'customer_phone',
  'customer_wechat_id',
  'draft_snapshot',
  'raw_imported_json',
  'raw_json',
  'raw_parse_note',
  'raw_parse_notes',
  'source_raw_text',
  'source_pdf_text',
  'ai_warnings',
  'warning_codes',
  'critical_warning_codes',
  'operator_note',
  'operator_notes',
  'internal_note',
  'internal_notes',
  'operator_internal_note',
  'supplier_note',
  'supplier_notes',
  'supplier_private_note',
  'supplier_private_notes',
  'driver_quotes',
  'driver_quote',
  'raw_quote_pool',
  'cost',
  'driver_cost',
  'margin',
  'audit_logs',
]);

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeCustomerObject(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeCustomerObject).filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return value;
  return Object.keys(value).reduce((acc, key) => {
    if (BLOCKED_SNAPSHOT_KEYS.has(key)) return acc;
    const sanitized = sanitizeCustomerObject(value[key]);
    if (sanitized !== undefined) acc[key] = sanitized;
    return acc;
  }, {});
}

// 客户自己的联系方式不进可转发响应(第三方拿到分享链接即见)。只作用于 customer 对象,不动酒店电话。
const CUSTOMER_CONTACT_KEYS = [
  'phone', 'mobile', 'tel', 'telephone', 'wechat', 'wechat_id', 'weixin',
  'email', 'contact', 'contact_phone', 'contact_mobile', 'contact_info',
];
function stripCustomerContact(value) {
  if (!isPlainObject(value)) return value;
  return Object.keys(value).reduce((acc, key) => {
    if (CUSTOMER_CONTACT_KEYS.includes(key)) return acc;
    acc[key] = value[key];
    return acc;
  }, {});
}

function toTime(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isVisibleAccess(access, now) {
  if (!access || access.status !== 'active') return false;
  const bindMode = access.bind_mode || access.access_type || '';
  if (bindMode === 'farland_profile' || bindMode === 'profile') return true;
  const visibleUntil = toTime(access.visible_until);
  return !visibleUntil || visibleUntil >= now.getTime();
}

function tripIdCandidates(trip, fallback = '') {
  return Array.from(new Set([
    safeString(fallback).trim(),
    safeString(trip && trip.trip_id).trim(),
    safeString(trip && trip.external_trip_id).trim(),
    safeString(trip && trip.trip_no).trim(),
    safeString(trip && trip._id).trim(),
  ].filter(Boolean)));
}

async function writeAuditLog(data) {
  return db.collection('audit_logs').add({ data }).catch(() => null);
}

async function findUserByOpenid(openid) {
  if (!openid) return null;
  const res = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return res.data[0] || null;
}

// 访校预约挂在父客户行程下:external_trip_id(+trip_id)链接到 customer_trips。复用既有 customer_trip_access 门控。
async function findActiveAccess({ tripIds, openid, userId, now }) {
  const queries = [];
  tripIds.forEach((tripId) => {
    if (openid) {
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, openid, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, customer_openid: openid, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
    }
    if (userId) {
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, user_id: userId, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, customer_user_id: userId, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
    }
  });
  if (!queries.length) return null;
  const results = await Promise.all(queries);
  const records = results.flatMap((res) => res.data || []);
  return records.find((access) => isVisibleAccess(access, now)) || null;
}

async function findVisitById(visitId) {
  const safeVisitId = safeString(visitId).trim();
  if (!safeVisitId) return null;
  const queries = [
    { external_visit_id: safeVisitId },
    { visit_id: safeVisitId },
  ];
  for (const query of queries) {
    const res = await db.collection('visit_bookings')
      .where(query)
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (res.data[0]) return res.data[0];
  }
  const byDoc = await db.collection('visit_bookings').doc(safeVisitId).get().catch(() => null);
  return byDoc && byDoc.data ? byDoc.data : null;
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const visitId = safeString(event.visit_id || event.external_visit_id).trim();
  if (!visitId) {
    return { success: false, code: 422, error_code: 'VISIT_ID_REQUIRED', message: '请提供 visit_id' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const [visit, user] = await Promise.all([
    findVisitById(visitId),
    findUserByOpenid(OPENID),
  ]);

  // 未确认 / 不存在:对客户一律 404-等待态,不泄漏内部状态或存在性
  if (!visit || safeString(visit.status).trim() !== 'confirmed') {
    return {
      success: true,
      code: 0,
      waiting: true,
      visit: null,
      weatherSource: 'NOAA · NWS',
      message: 'Farland 顾问正在为您核对访校安排,确认后将在这里显示。',
    };
  }

  // 门控:客户须对访校所挂的父行程有 active access
  const tripIds = tripIdCandidates(visit, safeString(visit.external_trip_id || visit.trip_id));
  const activeAccess = await findActiveAccess({
    tripIds,
    openid: OPENID,
    userId: user ? user._id : '',
    now,
  });
  if (!activeAccess) {
    return {
      success: true,
      code: 0,
      waiting: true,
      visit: null,
      weatherSource: 'NOAA · NWS',
      message: 'Farland 顾问正在为您核对访校安排,确认后将在这里显示。',
    };
  }

  await writeAuditLog({
    actor_openid: OPENID,
    actor_user_id: user ? user._id : '',
    actor_role: user ? (user.role || '') : 'temporary_guest',
    action: 'customer_visit_detail_opened',
    target_type: 'visit_booking',
    target_id: visit._id || visitId,
    detail: {
      visit_id: visit.external_visit_id || visit._id || visitId,
      trip_ids: tripIds,
      access_source: 'customer_trip_access',
    },
    created_at: nowIso,
  });

  return {
    success: true,
    code: 0,
    waiting: false,
    visit: buildCustomerVisitView(visit),
    weatherSource: 'NOAA · NWS',
  };
};
