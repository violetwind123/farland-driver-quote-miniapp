const cloud = require('wx-server-sdk');
const { requireRole } = require('./auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const INVITES_COLLECTION = 'service_review_invites';
const REVIEWS_COLLECTION = 'ride_service_reviews';

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

// 写入方(createRideReviewInvite/submitRideReview)按 canonical trip_id 存,
// 读取方必须做同样的别名解析,否则用 trip_no/_id 进入的页面会静默查空
async function resolveTripIds(rawTripId) {
  const ids = new Set([rawTripId]);
  for (const field of ['trip_id', 'external_trip_id', 'trip_no']) {
    const res = await db.collection('customer_trips')
      .where({ [field]: rawTripId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const trip = res.data && res.data[0];
    if (trip) {
      [trip.trip_id, trip.external_trip_id, trip.trip_no, trip._id]
        .map((value) => safeString(value).trim())
        .filter(Boolean)
        .forEach((value) => ids.add(value));
      return Array.from(ids);
    }
  }
  const byDoc = await db.collection('customer_trips').doc(rawTripId).get().catch(() => null);
  const trip = byDoc && byDoc.data;
  if (trip) {
    [trip.trip_id, trip.external_trip_id, trip.trip_no, trip._id]
      .map((value) => safeString(value).trim())
      .filter(Boolean)
      .forEach((value) => ids.add(value));
  }
  return Array.from(ids);
}

function maskOpenid(openid) {
  const value = safeString(openid);
  if (!value) return '';
  if (value.length <= 10) return `${value.slice(0, 3)}...${value.slice(-2)}`;
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function buildReviewPath(tripId, dayNo, inviteCode) {
  return `/pages/customer/review-card/review-card?trip_id=${encodeURIComponent(tripId)}&day_no=${dayNo}&invite_code=${encodeURIComponent(inviteCode)}`;
}

function isActiveInvite(invite, now) {
  if (!invite || invite.status !== 'active') return false;
  if (!invite.expires_at) return true;
  const expires = new Date(invite.expires_at);
  return Number.isNaN(expires.getTime()) || expires.getTime() > now;
}

exports.main = async (event = {}) => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const tripId = safeString(event.trip_id || event.external_trip_id || event.trip_no).trim();
  if (!tripId) {
    return { success: false, code: 422, error_code: 'TRIP_ID_REQUIRED', message: '请提供 trip_id' };
  }

  const now = Date.now();
  const tripIds = await resolveTripIds(tripId);
  const [reviewsRes, invitesRes] = await Promise.all([
    db.collection(REVIEWS_COLLECTION)
      .where({ trip_id: _.in(tripIds) })
      .limit(200)
      .get()
      .catch(() => ({ data: [] })),
    db.collection(INVITES_COLLECTION)
      .where({ trip_id: _.in(tripIds), status: 'active' })
      .limit(100)
      .get()
      .catch(() => ({ data: [] })),
  ]);

  const reviews = (reviewsRes.data || [])
    .sort((a, b) => safeString(b.submitted_at).localeCompare(safeString(a.submitted_at)));

  // 按 day 汇总:数量 / 平均分 / 低分数 / 最近几条
  const byDay = {};
  reviews.forEach((review) => {
    const dayNo = Number(review.day_no || 0);
    if (!byDay[dayNo]) {
      byDay[dayNo] = { day_no: dayNo, count: 0, rating_sum: 0, low_count: 0, recent: [] };
    }
    const bucket = byDay[dayNo];
    bucket.count += 1;
    bucket.rating_sum += Number(review.rating || 0);
    if (review.needs_follow_up || Number(review.rating || 0) <= 2) bucket.low_count += 1;
    if (bucket.recent.length < 5) {
      bucket.recent.push({
        rating: review.rating,
        tags: review.tags || [],
        text: review.text || '',
        openid_display: maskOpenid(review.openid),
        submitted_at: review.submitted_at || '',
        needs_follow_up: Boolean(review.needs_follow_up),
      });
    }
  });
  const daySummaries = Object.values(byDay)
    .map((bucket) => ({
      day_no: bucket.day_no,
      count: bucket.count,
      avg_rating: bucket.count ? Math.round((bucket.rating_sum / bucket.count) * 10) / 10 : 0,
      low_count: bucket.low_count,
      recent: bucket.recent,
    }))
    .sort((a, b) => a.day_no - b.day_no);

  // 按 driver / vehicle 汇总(司机质量沉淀)
  const byDriver = {};
  reviews.forEach((review) => {
    const key = safeString(review.driver_id);
    if (!key) return;
    if (!byDriver[key]) byDriver[key] = { driver_id: key, count: 0, rating_sum: 0, low_count: 0 };
    byDriver[key].count += 1;
    byDriver[key].rating_sum += Number(review.rating || 0);
    if (review.needs_follow_up || Number(review.rating || 0) <= 2) byDriver[key].low_count += 1;
  });
  const driverSummaries = Object.values(byDriver).map((bucket) => ({
    driver_id: bucket.driver_id,
    count: bucket.count,
    avg_rating: bucket.count ? Math.round((bucket.rating_sum / bucket.count) * 10) / 10 : 0,
    low_count: bucket.low_count,
  }));

  // 各 Day 现有有效评价卡(运营页直接复制路径,不必重复生成)
  const inviteByDay = {};
  (invitesRes.data || [])
    .filter((invite) => isActiveInvite(invite, now))
    .forEach((invite) => {
      const dayNo = Number(invite.day_no || 0);
      if (!inviteByDay[dayNo]) {
        inviteByDay[dayNo] = {
          day_no: dayNo,
          invite_code: invite.invite_code,
          // 用 invite 上存的 canonical trip_id 拼路径,与创建时一致
          share_path: buildReviewPath(invite.trip_id || tripId, dayNo, invite.invite_code),
          expires_at: invite.expires_at || '',
        };
      }
    });

  return {
    success: true,
    code: 0,
    trip_id: tripId,
    total_count: reviews.length,
    day_summaries: daySummaries,
    driver_summaries: driverSummaries,
    invites_by_day: inviteByDay,
  };
};
