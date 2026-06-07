const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const REVIEW_REQUIRED_STATUSES = ['pending_review', 'needs_review'];
const VALID_STATUS_FILTERS = ['all', 'unpublished', 'published', 'needs_review'];

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function normalizeText(value) {
  return safeString(value).trim().toLowerCase();
}

function uniqueStrings(values) {
  const seen = {};
  return values.map((value) => safeString(value).trim()).filter((value) => {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}

function hasObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function toTime(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function toIso(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? safeString(value) : date.toISOString();
}

function dateOnly(value) {
  const text = safeString(value);
  if (!text) return '';
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
}

function maxIso(values) {
  const sorted = values.map(toIso).filter(Boolean).sort();
  return sorted.pop() || '';
}

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return null;
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

function snapshotSources(trip) {
  return [
    hasObject(trip.draft_snapshot) ? trip.draft_snapshot : null,
    hasObject(trip.published_snapshot) ? trip.published_snapshot : null,
  ].filter(Boolean);
}

function firstMeaningful(values) {
  return values.map((value) => safeString(value).trim()).find(Boolean) || '';
}

function getTripTitle(trip) {
  const snapshots = snapshotSources(trip);
  return firstMeaningful([
    trip.title,
    trip.trip_title,
    ...snapshots.flatMap((snapshot) => [
      snapshot.title,
      snapshot.trip_title,
      snapshot.hero && snapshot.hero.title,
      snapshot.trip_summary && snapshot.trip_summary.title,
    ]),
  ]) || 'Farland 行程';
}

function getTripNo(trip) {
  return firstMeaningful([
    trip.trip_no,
    trip.external_trip_id,
    trip.trip_id,
  ]);
}

function getDateRangeText(trip) {
  const snapshots = snapshotSources(trip);
  const snapshotRange = firstMeaningful(snapshots.flatMap((snapshot) => [
    snapshot.date_range_text,
    snapshot.hero && snapshot.hero.date_range,
    snapshot.trip_summary && snapshot.trip_summary.date_range_text,
  ]));
  if (snapshotRange) return snapshotRange;
  const start = dateOnly(trip.start_at || trip.date_start);
  const end = dateOnly(trip.end_at || trip.date_end);
  return [start, end].filter(Boolean).join(' - ');
}

function getDayCount(trip) {
  const snapshots = snapshotSources(trip);
  const summaryCount = Number(firstMeaningful(snapshots.flatMap((snapshot) => [
    snapshot.trip_summary && snapshot.trip_summary.days_count,
    snapshot.day_count,
    snapshot.days_count,
  ])));
  if (summaryCount) return summaryCount;
  const days = Array.isArray(trip.itinerary_days)
    ? trip.itinerary_days
    : (Array.isArray(trip.daily_itinerary) ? trip.daily_itinerary : []);
  if (days.length) return days.length;
  for (const snapshot of snapshots) {
    if (Array.isArray(snapshot.itinerary_days)) return snapshot.itinerary_days.length;
    if (Array.isArray(snapshot.daily_summary_cards)) return snapshot.daily_summary_cards.length;
    if (Array.isArray(snapshot.days)) return snapshot.days.length;
  }
  return 0;
}

function getPartyName(trip) {
  const snapshots = snapshotSources(trip);
  const snapshotCustomerNames = snapshots.flatMap((snapshot) => {
    const customer = snapshot.customer || {};
    return [
      customer.party_name,
      customer.display_name,
      customer.name,
    ];
  });
  return firstMeaningful([
    trip.party_name,
    trip.customer_display_name,
    trip.customer_name,
    trip.customer && trip.customer.party_name,
    trip.customer && trip.customer.display_name,
    trip.customer && trip.customer.name,
    ...snapshotCustomerNames,
  ]);
}

function getPrimaryCustomerName(trip) {
  return firstMeaningful([
    trip.primary_customer_name,
    trip.customer_display_name,
    trip.customer_name,
    trip.customer && trip.customer.display_name,
    trip.customer && trip.customer.name,
    getPartyName(trip),
  ]);
}

function tripLookupIds(trip, canonicalTripId) {
  return uniqueStrings([
    canonicalTripId,
    trip._id,
    trip.trip_id,
    trip.external_trip_id,
    trip.trip_no,
  ]);
}

async function activeAccessCountForTrip(trip, canonicalTripId) {
  const ids = tripLookupIds(trip, canonicalTripId);
  if (!ids.length) return 0;
  const results = await Promise.all(ids.map((tripId) => db.collection('customer_trip_access')
    .where({ trip_id: tripId, status: 'active' })
    .limit(1000)
    .get()
    .catch(() => ({ data: [] }))));
  const seen = {};
  results.flatMap((res) => res.data || []).forEach((row) => {
    if (row.granted_source === 'operator_share_card') return;
    const key = row._id || [
      row.trip_id,
      row.customer_user_id || row.user_id || '',
      row.customer_profile_id || '',
      row.customer_openid || row.openid || '',
    ].join('|');
    if (key) seen[key] = true;
  });
  return Object.keys(seen).length;
}

function isUnfinishedTrip(trip, nowMs) {
  const status = normalizeText(trip.status);
  if (['completed', 'cancelled', 'archived', 'discarded'].includes(status)) return false;
  const endMs = toTime(trip.end_at || trip.date_end);
  return !endMs || endMs >= nowMs;
}

function matchesKeyword(trip, keyword) {
  if (!keyword) return true;
  const text = [
    trip.trip_id,
    trip.external_trip_id,
    trip.trip_no,
    trip.title,
    trip.trip_title,
    trip.city,
    trip.customer_display_name,
    trip.customer_name,
    trip.party_name,
    trip.customer && trip.customer.display_name,
    trip.customer && trip.customer.name,
    getTripTitle(trip),
    getPartyName(trip),
  ].map(normalizeText).join(' ');
  return text.includes(keyword);
}

function matchesStatusFilter(item, statusFilter) {
  if (statusFilter === 'all') return true;
  if (statusFilter === 'unpublished') return item.visibility_status !== 'published';
  if (statusFilter === 'published') return item.visibility_status === 'published';
  if (statusFilter === 'needs_review') return REVIEW_REQUIRED_STATUSES.includes(item.review_status);
  return true;
}

function toSortableItem(trip, nowMs) {
  const canonicalTripId = firstMeaningful([trip.trip_id, trip.external_trip_id, trip.trip_no, trip._id]);
  const visibilityStatus = safeString(trip.visibility_status || 'hidden').trim() || 'hidden';
  const reviewStatus = safeString(trip.review_status || 'pending_review').trim() || 'pending_review';
  const latestUpdatedAt = maxIso([
    trip.updated_at,
    trip.imported_at,
    trip.created_at,
    trip.reviewed_at,
    trip.published_at,
    trip.last_operator_previewed_at,
  ]);
  const importedAt = toIso(trip.imported_at || trip.created_at);
  return {
    sourceTrip: trip,
    item: {
      trip_id: canonicalTripId,
      external_trip_id: trip.external_trip_id || canonicalTripId,
      trip_no: getTripNo(trip),
      title: getTripTitle(trip),
      party_name: getPartyName(trip),
      primary_customer_name: getPrimaryCustomerName(trip),
      start_at: toIso(trip.start_at || trip.date_start),
      end_at: toIso(trip.end_at || trip.date_end),
      date_range_text: getDateRangeText(trip),
      review_status: reviewStatus,
      visibility_status: visibilityStatus,
      published_version: Number(trip.published_version || 0),
      day_count: getDayCount(trip),
      active_access_count: 0,
      latest_updated_at: latestUpdatedAt,
      priority_rank: 0,
    },
    sort: {
      unpublished: visibilityStatus !== 'published' ? 1 : 0,
      needsReview: REVIEW_REQUIRED_STATUSES.includes(reviewStatus) ? 1 : 0,
      unfinished: isUnfinishedTrip(trip, nowMs) ? 1 : 0,
      importedMs: toTime(importedAt),
      updatedMs: toTime(latestUpdatedAt),
    },
  };
}

function compareSortableTrips(a, b) {
  if (b.sort.unpublished !== a.sort.unpublished) return b.sort.unpublished - a.sort.unpublished;
  if (b.sort.needsReview !== a.sort.needsReview) return b.sort.needsReview - a.sort.needsReview;
  if (b.sort.unfinished !== a.sort.unfinished) return b.sort.unfinished - a.sort.unfinished;
  if (b.sort.importedMs !== a.sort.importedMs) return b.sort.importedMs - a.sort.importedMs;
  if (b.sort.updatedMs !== a.sort.updatedMs) return b.sort.updatedMs - a.sort.updatedMs;
  return safeString(a.item.trip_no || a.item.title).localeCompare(safeString(b.item.trip_no || b.item.title));
}

async function loadTripPool() {
  const ordered = await db.collection('customer_trips')
    .orderBy('updated_at', 'desc')
    .limit(200)
    .get()
    .catch(() => null);
  if (ordered && ordered.data) return ordered.data;
  const fallback = await db.collection('customer_trips')
    .limit(200)
    .get()
    .catch(() => ({ data: [] }));
  return fallback.data || [];
}

exports.main = async (event = {}) => {
  try {
    const operator = await getOperator();
    if (!operator) {
      return { success: false, code: 403, error_code: 'FORBIDDEN', message: '无权限访问' };
    }

    const keyword = normalizeText(event.keyword || '');
    const statusFilter = VALID_STATUS_FILTERS.includes(event.status_filter) ? event.status_filter : 'all';
    const limit = Math.min(Math.max(Number(event.limit || 50), 1), 100);
    const nowMs = Date.now();
    const tripPool = await loadTripPool();
    const filtered = tripPool
      .filter((trip) => matchesKeyword(trip, keyword))
      .map((trip) => toSortableItem(trip, nowMs))
      .filter((entry) => matchesStatusFilter(entry.item, statusFilter))
      .sort(compareSortableTrips)
      .slice(0, limit);

    const trips = await Promise.all(filtered.map(async (entry, index) => {
      const activeAccessCount = await activeAccessCountForTrip(entry.sourceTrip, entry.item.trip_id);
      return {
        ...entry.item,
        active_access_count: activeAccessCount,
        priority_rank: index + 1,
      };
    }));

    return {
      success: true,
      code: 0,
      trips,
      meta: {
        keyword,
        status_filter: statusFilter,
        limit,
        count: trips.length,
        source_collection: 'customer_trips',
        active_access_source_collection: 'customer_trip_access',
      },
    };
  } catch (error) {
    console.error('[listOperatorTrips] failed', error);
    return {
      success: false,
      code: 500,
      error_code: 'LIST_OPERATOR_TRIPS_FAILED',
      message: '行程管理列表加载失败，请稍后重试',
      err_msg: error && error.errMsg ? error.errMsg : '',
    };
  }
};
