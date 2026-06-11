const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { requireRole } = require('./auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const INVITES_COLLECTION = 'service_review_invites';
const DEFAULT_EXPIRES_DAYS = 14;
const MAX_OPENIDS_CAP = 50; // 与查看人数统计的扫描窗口(100)保持安全余量

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

// 加密随机,非 Math.random(邀请码是唯一凭证)
function generateReviewInviteCode() {
  return `RV${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateReviewInviteCode();
    const existing = await db.collection(INVITES_COLLECTION)
      .where({ invite_code: code })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (!existing.data || !existing.data.length) return code;
  }
  return `RV${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
}

function buildReviewPath(tripId, dayNo, inviteCode) {
  return `/pages/customer/review-card/review-card?trip_id=${encodeURIComponent(tripId)}&day_no=${dayNo}&invite_code=${encodeURIComponent(inviteCode)}`;
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // 已存在时报错,忽略
  }
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
  const byDoc = await db.collection('customer_trips').doc(safeTripId).get().catch(() => null);
  return byDoc && byDoc.data ? byDoc.data : null;
}

function isActiveInvite(invite, now) {
  if (!invite || invite.status !== 'active') return false;
  if (!invite.expires_at) return true;
  const expires = new Date(invite.expires_at);
  return Number.isNaN(expires.getTime()) || expires.getTime() > now;
}

function findPublishedDay(trip, dayNo) {
  const snapshot = trip && trip.published_snapshot;
  const days = snapshot && Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  return days.find((day, index) => Number(day.day_no || index + 1) === Number(dayNo));
}

exports.main = async (event = {}) => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const tripId = safeString(event.trip_id || event.external_trip_id || event.trip_no).trim();
  const dayNo = Number(event.day_no || 0);
  if (!tripId) {
    return { success: false, code: 422, error_code: 'TRIP_ID_REQUIRED', message: '请提供 trip_id' };
  }
  if (!Number.isInteger(dayNo) || dayNo < 1 || dayNo > 60) {
    return { success: false, code: 422, error_code: 'DAY_NO_INVALID', message: 'day_no 无效' };
  }

  const trip = await findTrip(tripId);
  if (!trip) {
    return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在' };
  }
  // 评价卡发给行程中的客户群,行程必须已发布;也避免未发布草稿内容经评价上下文外泄
  if (trip.visibility_status !== 'published') {
    return { success: false, code: 409, error_code: 'TRIP_NOT_PUBLISHED', message: '行程尚未发布，发布后才能发送每日评价卡' };
  }
  if (!findPublishedDay(trip, dayNo)) {
    return { success: false, code: 409, error_code: 'REVIEW_DAY_NOT_PUBLISHED', message: '该日期尚未发布，不能生成评价卡' };
  }
  const canonicalTripId = trip.trip_id || trip.external_trip_id || tripId;

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  await ensureCollection(INVITES_COLLECTION);

  // 同一 trip + day 复用现有有效评价卡(Day1/Day2 各自独立)
  const existingRes = await db.collection(INVITES_COLLECTION)
    .where({ trip_id: canonicalTripId, day_no: dayNo, status: 'active' })
    .limit(10)
    .get()
    .catch(() => ({ data: [] }));
  const existing = (existingRes.data || [])
    .filter((invite) => isActiveInvite(invite, now))
    .sort((a, b) => safeString(b.created_at).localeCompare(safeString(a.created_at)))[0];

  if (existing) {
    return {
      success: true,
      code: 0,
      reused: true,
      trip_id: canonicalTripId,
      day_no: dayNo,
      invite_id: existing._id,
      invite_code: existing.invite_code,
      share_path: buildReviewPath(canonicalTripId, dayNo, existing.invite_code),
      expires_at: existing.expires_at || '',
    };
  }

  const expiresDays = Number(event.expires_in_days) > 0 ? Number(event.expires_in_days) : DEFAULT_EXPIRES_DAYS;
  const expiresAt = new Date(now + expiresDays * 24 * 60 * 60 * 1000).toISOString();
  const maxOpenids = Number(event.max_openids) > 0
    ? Math.min(Math.floor(Number(event.max_openids)), MAX_OPENIDS_CAP)
    : 0;
  const inviteCode = await generateUniqueInviteCode();

  const inviteData = {
    invite_code: inviteCode,
    trip_id: canonicalTripId,
    external_trip_id: trip.external_trip_id || canonicalTripId,
    trip_no: trip.trip_no || trip.external_trip_id || canonicalTripId,
    day_no: dayNo,
    status: 'active',
    expires_at: expiresAt,
    max_openids: maxOpenids,
    created_by: auth.user._id,
    created_by_openid: auth.openid,
    created_at: nowIso,
    updated_at: nowIso,
  };
  const addRes = await db.collection(INVITES_COLLECTION).add({ data: inviteData });

  await db.collection('audit_logs').add({
    data: {
      actor_openid: auth.openid,
      actor_user_id: auth.user._id,
      actor_role: auth.user.role,
      action: 'service_review_invite_created',
      target_type: 'service_review_invite',
      target_id: addRes._id,
      detail: {
        trip_id: canonicalTripId,
        day_no: dayNo,
        invite_code: inviteCode,
        expires_at: expiresAt,
        max_openids: maxOpenids,
      },
      created_at: nowIso,
    },
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    reused: false,
    trip_id: canonicalTripId,
    day_no: dayNo,
    invite_id: addRes._id,
    invite_code: inviteCode,
    share_path: buildReviewPath(canonicalTripId, dayNo, inviteCode),
    expires_at: expiresAt,
  };
};
