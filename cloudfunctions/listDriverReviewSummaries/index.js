const cloud = require('wx-server-sdk');
const { requireRole } = require('./auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const REVIEWS_COLLECTION = 'ride_service_reviews';
const SCAN_LIMIT = 500;

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function maskOpenid(openid) {
  const value = safeString(openid);
  if (!value) return '';
  if (value.length <= 10) return `${value.slice(0, 3)}...${value.slice(-2)}`;
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function summarize(reviews) {
  const count = reviews.length;
  if (!count) return { count: 0, avg_rating: 0, low_count: 0 };
  let sum = 0;
  let low = 0;
  reviews.forEach((review) => {
    sum += Number(review.rating || 0);
    if (review.needs_follow_up || Number(review.rating || 0) <= 2) low += 1;
  });
  return { count, avg_rating: round1(sum / count), low_count: low };
}

function toRecentItem(review) {
  return {
    rating: review.rating,
    tags: review.tags || [],
    text: review.text || '',
    trip_no: review.trip_no || review.trip_id || '',
    day_no: review.day_no || 0,
    openid_display: maskOpenid(review.openid),
    submitted_at: review.submitted_at || '',
    needs_follow_up: Boolean(review.needs_follow_up),
  };
}

// 运营内部页:司机名从 transport_orders 反查(best-effort,查不到显示 id)
async function lookupDriverNames(driverIds) {
  const names = {};
  await Promise.all(driverIds.slice(0, 20).map(async (driverId) => {
    const res = await db.collection('transport_orders')
      .where({ driver_id: driverId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const order = res.data && res.data[0];
    if (order) {
      const driver = order.driver || {};
      names[driverId] = order.driver_name || driver.display_name || driver.name || '';
    }
  }));
  return names;
}

exports.main = async () => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const res = await db.collection(REVIEWS_COLLECTION)
    .limit(SCAN_LIMIT)
    .get()
    .catch(() => ({ data: [] }));
  const reviews = (res.data || [])
    .sort((a, b) => safeString(b.submitted_at).localeCompare(safeString(a.submitted_at)));

  const overall = summarize(reviews);

  // 按司机(司机质量沉淀核心视图)
  const byDriver = {};
  const unattributed = [];
  reviews.forEach((review) => {
    const driverId = safeString(review.driver_id);
    if (!driverId) {
      unattributed.push(review);
      return;
    }
    if (!byDriver[driverId]) byDriver[driverId] = [];
    byDriver[driverId].push(review);
  });
  const driverIds = Object.keys(byDriver);
  const driverNames = await lookupDriverNames(driverIds);
  const driverSummaries = driverIds
    .map((driverId) => {
      const rows = byDriver[driverId];
      return {
        driver_id: driverId,
        driver_name: driverNames[driverId] || '',
        ...summarize(rows),
        recent: rows.slice(0, 5).map(toRecentItem),
      };
    })
    .sort((a, b) => (b.low_count - a.low_count) || (b.count - a.count));

  // 按行程(横向对比)
  const byTrip = {};
  reviews.forEach((review) => {
    const key = safeString(review.trip_no || review.trip_id);
    if (!key) return;
    if (!byTrip[key]) byTrip[key] = { trip_no: key, trip_id: review.trip_id || key, rows: [] };
    byTrip[key].rows.push(review);
  });
  const tripSummaries = Object.values(byTrip)
    .map((bucket) => ({
      trip_no: bucket.trip_no,
      trip_id: bucket.trip_id,
      ...summarize(bucket.rows),
    }))
    .sort((a, b) => (b.low_count - a.low_count) || (b.count - a.count));

  // 低分需跟进(全量里最近的低分条目)
  const followUps = reviews
    .filter((review) => review.needs_follow_up || Number(review.rating || 0) <= 2)
    .slice(0, 20)
    .map(toRecentItem);

  return {
    success: true,
    code: 0,
    scanned: reviews.length,
    scan_limit: SCAN_LIMIT,
    truncated: reviews.length >= SCAN_LIMIT,
    overall,
    driver_summaries: driverSummaries,
    trip_summaries: tripSummaries,
    unattributed: summarize(unattributed),
    follow_ups: followUps,
  };
};
