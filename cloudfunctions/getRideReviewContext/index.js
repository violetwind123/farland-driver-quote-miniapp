const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const INVITES_COLLECTION = 'service_review_invites';
const REVIEWS_COLLECTION = 'ride_service_reviews';
const EVENTS_COLLECTION = 'service_review_events';

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

function validateInvite(invite, tripId, dayNo) {
  if (!invite) return { ok: false, error_code: 'INVITE_NOT_FOUND', message: '评价卡不存在或已失效' };
  if (invite.status !== 'active') return { ok: false, error_code: 'INVITE_INACTIVE', message: '评价卡已撤销或失效' };
  if (invite.expires_at) {
    const expires = new Date(invite.expires_at);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
      return { ok: false, error_code: 'INVITE_EXPIRED', message: '评价卡已过期' };
    }
  }
  if (tripId && safeString(invite.trip_id) !== tripId && safeString(invite.external_trip_id) !== tripId && safeString(invite.trip_no) !== tripId) {
    return { ok: false, error_code: 'INVITE_TRIP_MISMATCH', message: '评价卡与行程不匹配' };
  }
  if (dayNo && Number(invite.day_no) !== dayNo) {
    return { ok: false, error_code: 'INVITE_DAY_MISMATCH', message: '评价卡与日期不匹配' };
  }
  return { ok: true };
}

async function findTrip(tripId) {
  const safeTripId = safeString(tripId).trim();
  if (!safeTripId) return null;
  for (const field of ['trip_id', 'external_trip_id', 'trip_no']) {
    const res = await db.collection('customer_trips')
      .where({ [field]: safeTripId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (res.data && res.data.length) return res.data[0];
  }
  return null;
}

// 只挑客户安全字段,不透传整个快照
function buildDayContext(trip, dayNo) {
  const snapshot = trip && trip.visibility_status === 'published' && trip.published_snapshot
    ? trip.published_snapshot
    : null;
  const base = {
    // 未发布时不回退 trip.title(顶层字段含导入期草稿内容),只给通用名
    trip_title: (snapshot && snapshot.title) || 'Farland 行程',
    trip_no: (trip && (trip.trip_no || trip.external_trip_id)) || '',
    day_no: dayNo,
    date: '',
    day_title: '',
    city: '',
    stops: [],
  };
  if (!snapshot || !Array.isArray(snapshot.itinerary_days)) return base;
  const day = snapshot.itinerary_days.find((item, index) => Number(item.day_no || index + 1) === Number(dayNo));
  if (!day) return base;
  const items = Array.isArray(day.timeline_items) ? day.timeline_items : [];
  return {
    ...base,
    date: safeString(day.date),
    day_title: safeString(day.title || day.city),
    city: safeString(day.city),
    stops: items.slice(0, 5).map((item) => safeString(item.title)).filter(Boolean),
  };
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

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const inviteCode = safeString(event.invite_code).trim();
  const tripIdParam = safeString(event.trip_id).trim();
  const dayNoParam = Number(event.day_no || 0);

  const invite = await findInvite(inviteCode);
  const validation = validateInvite(invite, tripIdParam, dayNoParam);
  if (!validation.ok) {
    return { success: false, code: 403, error_code: validation.error_code, message: validation.message };
  }

  const dayNo = Number(invite.day_no);

  // max_openids 门控:打开者集合内的 openid 永远可进;新 openid 超额则拒
  await ensureCollection(EVENTS_COLLECTION);
  const openedSet = await distinctOpenedOpenids(invite._id);
  if (invite.max_openids > 0 && !openedSet.has(OPENID) && openedSet.size >= invite.max_openids) {
    return { success: false, code: 403, error_code: 'INVITE_OPENID_LIMIT', message: '该评价卡查看人数已达上限' };
  }

  const trip = await findTrip(invite.trip_id);
  const dayContext = buildDayContext(trip, dayNo);

  // 我的提交状态(同 openid 同 day 只能交一次)
  const myReviewRes = await db.collection(REVIEWS_COLLECTION)
    .where({ trip_id: invite.trip_id, day_no: dayNo, openid: OPENID })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const myReview = (myReviewRes.data && myReviewRes.data[0]) || null;

  // 记录打开事件(确定性 doc id:同 openid 并发首开也只产生一行);不创建 customer_trip_access
  if (!openedSet.has(OPENID)) {
    const eventDocId = safeDocId(`${invite._id}__${OPENID}__opened`);
    await db.collection(EVENTS_COLLECTION).doc(eventDocId).set({
      data: {
        invite_id: invite._id,
        invite_code: invite.invite_code,
        trip_id: invite.trip_id,
        day_no: dayNo,
        openid: OPENID,
        event: 'opened',
        created_at: new Date().toISOString(),
      },
    }).catch(() => null);
  }

  return {
    success: true,
    code: 0,
    trip_id: invite.trip_id,
    day_no: dayNo,
    context: dayContext,
    already_submitted: Boolean(myReview),
    my_review: myReview
      ? { rating: myReview.rating, tags: myReview.tags || [], text: myReview.text || '' }
      : null,
  };
};
