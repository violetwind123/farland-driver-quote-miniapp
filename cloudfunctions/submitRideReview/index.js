const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const INVITES_COLLECTION = 'service_review_invites';
const REVIEWS_COLLECTION = 'ride_service_reviews';
const EVENTS_COLLECTION = 'service_review_events';

// 服务端白名单,须与客户端 review-card TAG_OPTIONS 保持一致
const ALLOWED_TAGS = new Set([
  '守时准点',
  '驾驶平稳',
  '车内整洁',
  '沟通顺畅',
  '安排合理',
  '服务热情',
  '等待较久',
  '行程偏紧',
  '有待改进',
]);

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function safeDocId(value) {
  return safeString(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // 已存在时报错,忽略
  }
}

async function findInvite(inviteCode) {
  const code = safeString(inviteCode).trim();
  if (!code) return null;
  const res = await db.collection(INVITES_COLLECTION)
    .where({ invite_code: code })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return (res.data && res.data[0]) || null;
}

function validateInvite(invite) {
  if (!invite) return { ok: false, error_code: 'INVITE_NOT_FOUND', message: '评价卡不存在或已失效' };
  if (invite.status !== 'active') return { ok: false, error_code: 'INVITE_INACTIVE', message: '评价卡已撤销或失效' };
  if (invite.expires_at) {
    const expires = new Date(invite.expires_at);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
      return { ok: false, error_code: 'INVITE_EXPIRED', message: '评价卡已过期' };
    }
  }
  return { ok: true };
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => safeString(tag).trim())
    .filter((tag) => ALLOWED_TAGS.has(tag))
    .slice(0, 10);
}

async function distinctOpenedOpenids(inviteId) {
  const res = await db.collection(EVENTS_COLLECTION)
    .where({ invite_id: inviteId, event: 'opened' })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }));
  const seen = new Set();
  (res.data || []).forEach((row) => {
    if (row.openid) seen.add(row.openid);
  });
  return seen;
}

// opened 事件用确定性 doc id 写入(同 openid 不会产生重复行)
async function recordEventOnce(invite, openid, eventName, extra = {}) {
  const docId = safeDocId(`${invite._id}__${openid}__${eventName}`);
  await db.collection(EVENTS_COLLECTION).doc(docId).set({
    data: {
      invite_id: invite._id,
      invite_code: invite.invite_code,
      trip_id: invite.trip_id,
      day_no: Number(invite.day_no),
      openid,
      event: eventName,
      created_at: new Date().toISOString(),
      ...extra,
    },
  }).catch(() => null);
}

async function findDayDate(tripId, dayNo) {
  for (const field of ['trip_id', 'external_trip_id', 'trip_no']) {
    const res = await db.collection('customer_trips')
      .where({ [field]: tripId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const trip = res.data && res.data[0];
    if (trip) {
      const snapshot = trip.published_snapshot || trip.draft_snapshot || {};
      const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
      const day = days.find((item, index) => (item.day_no || index + 1) === dayNo);
      return day ? safeString(day.date) : '';
    }
  }
  return '';
}

// 司机质量沉淀:经 ride_requests(带 trip 别名字段)→ transport_orders(request_id)两步关联。
// transport_orders 文档本身不带 trip_id,直接按 trip 查永远空(沿用 getCustomerTripByInvite 的两步模式)。
async function collectTripTransports(tripId) {
  const requestResults = await Promise.all(['trip_id', 'external_trip_id', 'trip_no'].map((field) => db
    .collection('ride_requests')
    .where({ [field]: tripId, status: _.in(['assigned', 'confirmed']) })
    .limit(20)
    .get()
    .catch(() => ({ data: [] }))));
  const seen = new Set();
  const requests = requestResults.flatMap((res) => res.data || []).filter((request) => {
    const requestId = request._id || request.request_id || '';
    if (!requestId || seen.has(requestId)) return false;
    seen.add(requestId);
    return true;
  });

  const transports = [];
  for (const request of requests.slice(0, 10)) {
    const requestId = request._id || request.request_id || '';
    const byDoc = await db.collection('transport_orders').doc(requestId).get().catch(() => null);
    const docOrder = byDoc && byDoc.data;
    if (docOrder && ['assigned', 'confirmed'].includes(docOrder.order_status)) {
      transports.push({ order: docOrder, request });
      continue;
    }
    const queryRes = await db.collection('transport_orders')
      .where({ request_id: requestId, order_status: _.in(['assigned', 'confirmed']) })
      .limit(5)
      .get()
      .catch(() => ({ data: [] }));
    const latest = (queryRes.data || [])
      .sort((a, b) => safeString(b.updated_at).localeCompare(safeString(a.updated_at)))[0];
    if (latest) transports.push({ order: latest, request });
  }
  return transports;
}

function transportIds(entry) {
  const order = entry.order || {};
  const driver = order.driver || {};
  return {
    transport_order_id: order._id || order.request_id || (entry.request && entry.request._id) || '',
    driver_id: order.driver_id || order.driver_user_id || driver.user_id || driver._id || '',
    vehicle_id: order.vehicle_id || '',
  };
}

// 归因规则:仅当 service_date 与当天匹配,或全程只有唯一一辆车(无歧义)时关联;否则留空。
// 宁可空白,不可错归因(低分挂错司机比挂空更糟)。
async function findDayTransport(tripId, dayDate) {
  const transports = await collectTripTransports(tripId);
  if (!transports.length) return {};
  if (dayDate) {
    const matched = transports.find((entry) => {
      const serviceDate = safeString((entry.order && entry.order.service_date) || (entry.request && entry.request.service_date));
      return serviceDate && serviceDate.slice(0, 10) === dayDate.slice(0, 10);
    });
    if (matched) return transportIds(matched);
  }
  const distinctDrivers = new Set(transports.map((entry) => transportIds(entry).driver_id).filter(Boolean));
  if (transports.length === 1 || distinctDrivers.size === 1) {
    return transportIds(transports[0]);
  }
  return {};
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const invite = await findInvite(event.invite_code);
  const validation = validateInvite(invite);
  if (!validation.ok) {
    return { success: false, code: 403, error_code: validation.error_code, message: validation.message };
  }

  const rating = Number(event.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, code: 422, error_code: 'RATING_INVALID', message: '请选择 1-5 星评分' };
  }
  const tags = normalizeTags(event.tags);
  const text = safeString(event.text).trim().slice(0, 500);

  const tripId = invite.trip_id;
  const dayNo = Number(invite.day_no);

  // max_openids 门控(与 getRideReviewContext 一致):直连提交不能绕过查看人数上限
  await ensureCollection(EVENTS_COLLECTION);
  const openedSet = await distinctOpenedOpenids(invite._id);
  if (invite.max_openids > 0 && !openedSet.has(OPENID) && openedSet.size >= invite.max_openids) {
    return { success: false, code: 403, error_code: 'INVITE_OPENID_LIMIT', message: '该评价卡查看人数已达上限' };
  }
  if (!openedSet.has(OPENID)) {
    await recordEventOnce(invite, OPENID, 'opened');
  }

  await ensureCollection(REVIEWS_COLLECTION);

  // 同 openid 同 trip 同 day 幂等:已提交直接返回
  const existingRes = await db.collection(REVIEWS_COLLECTION)
    .where({ trip_id: tripId, day_no: dayNo, openid: OPENID })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const existing = existingRes.data && existingRes.data[0];
  if (existing) {
    return {
      success: true,
      code: 0,
      already_submitted: true,
      message: '您已提交过该日评价',
      my_review: { rating: existing.rating, tags: existing.tags || [], text: existing.text || '' },
    };
  }

  const nowIso = new Date().toISOString();
  const dayDate = await findDayDate(tripId, dayNo);
  const transport = await findDayTransport(tripId, dayDate);

  const reviewData = {
    trip_id: tripId,
    external_trip_id: invite.external_trip_id || tripId,
    trip_no: invite.trip_no || tripId,
    day_no: dayNo,
    day_date: dayDate,
    openid: OPENID,
    rating,
    tags,
    text,
    invite_id: invite._id,
    invite_code: invite.invite_code,
    transport_order_id: transport.transport_order_id || '',
    driver_id: transport.driver_id || '',
    vehicle_id: transport.vehicle_id || '',
    needs_follow_up: rating <= 2,
    submitted_at: nowIso,
  };
  // 确定性 doc id:并发双击/重放都落在同一文档,天然去重(同 openid 覆盖自己)
  const reviewDocId = safeDocId(`rsr__${tripId}__${dayNo}__${OPENID}`);
  await db.collection(REVIEWS_COLLECTION).doc(reviewDocId).set({ data: reviewData });

  await recordEventOnce(invite, OPENID, 'submitted', { review_id: reviewDocId });

  // 注意:打开/提交评价均不创建 customer_trip_access(临时查看 ≠ 客户绑定)
  return {
    success: true,
    code: 0,
    already_submitted: false,
    review_id: reviewDocId,
    message: '感谢您的反馈',
  };
};
