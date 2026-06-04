const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return null;
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

function includesKeyword(user, keyword) {
  if (!keyword) return true;
  const normalized = String(keyword).trim().toLowerCase();
  return [
    user.display_name,
    user.name,
    user.phone,
    user.wechat_id,
    user.customer_profile_id,
  ].some((value) => String(value || '').toLowerCase().includes(normalized));
}

function toCustomerListItem(user) {
  return {
    user_id: user._id,
    display_name: user.display_name || user.name || 'Farland 客户',
    name: user.name || user.display_name || '',
    phone: user.phone || '',
    wechat_id: user.wechat_id || '',
    customer_profile_id: user.customer_profile_id || '',
    customer_status: user.customer_status || user.status || '',
    latest_trip_at: user.latest_trip_at || user.last_customer_seen_at || user.updated_at || '',
  };
}

function maskOpenid(openid) {
  const value = String(openid || '');
  if (!value) return '';
  if (value.length <= 10) return `${value.slice(0, 3)}...${value.slice(-2)}`;
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function maxDate(values) {
  return values.filter(Boolean).sort().pop() || '';
}

async function loadTripById(tripId) {
  const safeTripId = String(tripId || '').trim();
  if (!safeTripId) return null;
  const queries = [
    { trip_id: safeTripId },
    { external_trip_id: safeTripId },
    { trip_no: safeTripId },
  ];
  for (const query of queries) {
    const res = await db.collection('customer_trips')
      .where(query)
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (res.data[0]) return res.data[0];
  }
  const byDoc = await db.collection('customer_trips').doc(safeTripId).get().catch(() => null);
  return byDoc && byDoc.data ? byDoc.data : null;
}

function uniqueByTripId(trips) {
  const seen = {};
  return trips.filter((trip) => {
    const key = trip._id || trip.trip_id || trip.external_trip_id || trip.trip_no || '';
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

async function loadTripsByCustomerOwnership(user) {
  const queries = [];
  const userId = user._id || '';
  const profileId = user.customer_profile_id || '';
  const wechatId = user.wechat_id || '';
  const phone = user.phone || '';
  const names = Array.from(new Set([user.display_name, user.name].filter(Boolean)));

  if (userId) {
    queries.push({ primary_customer_user_id: userId });
    queries.push({ customer_user_id: userId });
    queries.push({ customer_user_ids: userId });
  }
  if (profileId) {
    queries.push({ customer_profile_id: profileId });
  }
  if (wechatId) {
    queries.push({ customer_wechat_id: wechatId });
  }
  if (phone) {
    queries.push({ customer_phone: phone });
  }
  names.forEach((name) => {
    queries.push({ customer_display_name: name });
    queries.push({ customer_name: name });
  });

  if (!queries.length) return [];
  const results = await Promise.all(queries.map((query) => {
    return db.collection('customer_trips')
      .where(query)
      .limit(20)
      .get()
      .catch(() => ({ data: [] }));
  }));
  return uniqueByTripId(results.flatMap((res) => res.data || []));
}

async function loadPreviewStats(user) {
  const accessRows = [];
  const byUserId = await db.collection('customer_trip_access')
    .where({ customer_user_id: user._id, status: 'active' })
    .limit(20)
    .get()
    .catch(() => ({ data: [] }));
  accessRows.push(...(byUserId.data || []));

  const byLegacyUserId = await db.collection('customer_trip_access')
    .where({ user_id: user._id, status: 'active' })
    .limit(20)
    .get()
    .catch(() => ({ data: [] }));
  accessRows.push(...(byLegacyUserId.data || []));

  if (user.openid) {
    const byOpenid = await db.collection('customer_trip_access')
      .where({ customer_openid: user.openid, status: 'active' })
      .limit(20)
      .get()
      .catch(() => ({ data: [] }));
    accessRows.push(...(byOpenid.data || []));
  }

  const tripIds = Array.from(new Set(accessRows.map((row) => row.trip_id).filter(Boolean))).slice(0, 20);
  const trips = [];
  for (const tripId of tripIds) {
    const trip = await loadTripById(tripId);
    if (trip) trips.push(trip);
  }
  const resolvedAccessTrips = uniqueByTripId(trips);
  const ownedTrips = await loadTripsByCustomerOwnership(user);
  const relatedTrips = uniqueByTripId([...resolvedAccessTrips, ...ownedTrips]);

  const nowMs = Date.now();
  const unfinishedTrips = relatedTrips.filter((trip) => {
    const status = trip.status || '';
    if (['completed', 'cancelled', 'archived'].includes(status)) return false;
    const endMs = new Date(trip.end_at || trip.date_end || '').getTime();
    return Number.isNaN(endMs) || endMs >= nowMs;
  });
  const activePublishedTrips = resolvedAccessTrips.filter((trip) => trip.visibility_status === 'published');
  const unpublishedTrips = ownedTrips.filter((trip) => trip.visibility_status !== 'published');
  const latestTripAt = maxDate(relatedTrips.map((trip) => trip.updated_at || trip.imported_at || trip.created_at || trip.start_at || trip.date_start || ''));
  const lastPreviewedAt = maxDate(relatedTrips.map((trip) => trip.last_operator_previewed_at || ''));
  const previewRank = resolvedAccessTrips.length * 200000
    + activePublishedTrips.length * 100000
    + unpublishedTrips.length * 50000
    + unfinishedTrips.length * 10000
    + (lastPreviewedAt ? 1000 : 0)
    + (latestTripAt ? 100 : 0);

  return {
    active_trip_count: resolvedAccessTrips.length,
    active_access_count: tripIds.length,
    active_unresolved_count: Math.max(0, tripIds.length - resolvedAccessTrips.length),
    active_published_trip_count: activePublishedTrips.length,
    unfinished_trip_count: unfinishedTrips.length,
    unpublished_preview_count: unpublishedTrips.length,
    last_previewed_at: lastPreviewedAt,
    latest_trip_at: latestTripAt,
    preview_rank: previewRank,
  };
}

async function toPreviewCustomerListItem(user) {
  const stats = await loadPreviewStats(user);
  return {
    customer_user_id: user._id,
    user_id: user._id,
    display_name: user.display_name || user.name || 'Farland 客户',
    name: user.name || user.display_name || '',
    phone: user.phone || '',
    wechat_id: user.wechat_id || '',
    openid_display: maskOpenid(user.openid),
    customer_profile_id: user.customer_profile_id || '',
    customer_status: user.customer_status || user.status || '',
    ...stats,
  };
}

exports.main = async (event = {}) => {
  const operator = await getOperator();
  if (!operator) {
    return { success: false, code: 403, error_code: 'FORBIDDEN', message: '无权限访问' };
  }

  const keyword = String(event.keyword || '').trim();
  const limit = Math.min(Math.max(Number(event.limit || 20), 1), 50);
  const mode = String(event.mode || '').trim();
  const userRes = await db.collection('users')
    .where({ role: 'customer', status: 'active' })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }));

  const matchedUsers = (userRes.data || []).filter((user) => includesKeyword(user, keyword));
  const customers = mode === 'preview_selector'
    ? (await Promise.all(matchedUsers.map(toPreviewCustomerListItem)))
      .sort((a, b) => {
        if (b.preview_rank !== a.preview_rank) return b.preview_rank - a.preview_rank;
        if (String(b.latest_trip_at || '') !== String(a.latest_trip_at || '')) {
          return String(b.latest_trip_at || '').localeCompare(String(a.latest_trip_at || ''));
        }
        return String(a.display_name || '').localeCompare(String(b.display_name || ''));
      })
      .slice(0, limit)
    : matchedUsers.slice(0, limit).map(toCustomerListItem);

  return {
    success: true,
    code: 0,
    customers,
  };
};
