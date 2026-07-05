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

function canonicalTripId(trip, fallback = '') {
  return safeString(trip && (trip.trip_id || trip.external_trip_id || trip.trip_no || fallback)).trim();
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

// 找到客户在此请求下可访问的行程(客户显式传 trip_id / external_trip_id;或从其绑定的 access 记录反查)。
async function resolveAccessibleTripIds({ inputTripId, openid, userId, now }) {
  const tripIds = new Set();
  if (inputTripId) {
    // 校验客户对这条行程确有 access
    const candidates = tripIdCandidates(null, inputTripId);
    const access = await findActiveAccess({ tripIds: candidates, openid, userId, now });
    if (access) {
      tripIdCandidates(null, inputTripId).forEach((id) => tripIds.add(id));
      const accessTripId = safeString(access.trip_id).trim();
      if (accessTripId) tripIds.add(accessTripId);
    }
    return Array.from(tripIds);
  }
  // 未传 trip_id:枚举该 openid/userId 的全部 active access -> 其 trip_id
  const queries = [];
  if (openid) {
    queries.push(db.collection('customer_trip_access').where({ openid, status: 'active' }).limit(50).get().catch(() => ({ data: [] })));
    queries.push(db.collection('customer_trip_access').where({ customer_openid: openid, status: 'active' }).limit(50).get().catch(() => ({ data: [] })));
  }
  if (userId) {
    queries.push(db.collection('customer_trip_access').where({ user_id: userId, status: 'active' }).limit(50).get().catch(() => ({ data: [] })));
    queries.push(db.collection('customer_trip_access').where({ customer_user_id: userId, status: 'active' }).limit(50).get().catch(() => ({ data: [] })));
  }
  if (!queries.length) return [];
  const results = await Promise.all(queries);
  results.flatMap((res) => res.data || [])
    .filter((access) => isVisibleAccess(access, now))
    .forEach((access) => {
      const id = safeString(access.trip_id).trim();
      if (id) tripIds.add(id);
    });
  return Array.from(tripIds);
}

// 只取 status==='confirmed' 的访校预约;其余态(submitted/materials_needed/conflict/cancelled 等)客户侧直接消失。
async function findConfirmedVisits(tripIds) {
  const safeTripIds = Array.from(new Set((tripIds || []).map((id) => safeString(id).trim()).filter(Boolean)));
  if (!safeTripIds.length) return [];
  const queries = [
    db.collection('visit_bookings').where({ external_trip_id: _.in(safeTripIds), status: 'confirmed' }).limit(200).get().catch(() => ({ data: [] })),
    db.collection('visit_bookings').where({ trip_id: _.in(safeTripIds), status: 'confirmed' }).limit(200).get().catch(() => ({ data: [] })),
  ];
  const results = await Promise.all(queries);
  const seen = new Set();
  const visits = [];
  results.flatMap((res) => res.data || []).forEach((visit) => {
    // 二次门控:即便查询意外命中,也只放行 confirmed
    if (safeString(visit.status).trim() !== 'confirmed') return;
    const id = visit._id || visit.external_visit_id || '';
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    visits.push(visit);
  });
  return visits;
}

function sortVisits(a, b) {
  const aDate = safeString(a && a.confirmedSlot && a.confirmedSlot.date);
  const bDate = safeString(b && b.confirmedSlot && b.confirmedSlot.date);
  const dateDiff = aDate.localeCompare(bDate);
  if (dateDiff) return dateDiff;
  const aStart = safeString(a && a.confirmedSlot && a.confirmedSlot.start);
  const bStart = safeString(b && b.confirmedSlot && b.confirmedSlot.start);
  return aStart.localeCompare(bStart);
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const inputTripId = safeString(event.trip_id || event.external_trip_id || event.trip_no).trim();
  const now = new Date();
  const nowIso = now.toISOString();

  const user = await findUserByOpenid(OPENID);
  const tripIds = await resolveAccessibleTripIds({
    inputTripId,
    openid: OPENID,
    userId: user ? user._id : '',
    now,
  });

  if (!tripIds.length) {
    // 无任何可访问行程 = 无访校可见(不泄漏是否存在)
    return {
      success: true,
      code: 0,
      visits: [],
      weatherSource: 'NOAA · NWS',
      message: '暂无已确认的访校安排。',
    };
  }

  const confirmedVisits = await findConfirmedVisits(tripIds);
  const visits = confirmedVisits.sort(sortVisits).map(buildCustomerVisitView);

  await writeAuditLog({
    actor_openid: OPENID,
    actor_user_id: user ? user._id : '',
    actor_role: user ? (user.role || '') : 'temporary_guest',
    action: 'customer_visit_list_opened',
    target_type: 'visit_booking',
    target_id: tripIds.join(','),
    detail: {
      trip_ids: tripIds,
      confirmed_count: visits.length,
      access_source: 'customer_trip_access',
    },
    created_at: nowIso,
  });

  return {
    success: true,
    code: 0,
    visits,
    weatherSource: 'NOAA · NWS',
  };
};
