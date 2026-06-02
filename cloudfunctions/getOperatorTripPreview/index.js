const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

async function findTrip(tripId) {
  const queries = [
    { trip_id: tripId },
    { external_trip_id: tripId },
    { trip_no: tripId },
  ];
  for (const query of queries) {
    const res = await db.collection('customer_trips')
      .where(query)
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (res.data[0]) return res.data[0];
  }
  return null;
}

function hasObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function diffSummary(trip) {
  const hasPublishedVersion = Boolean(trip.published_version > 0 && hasObject(trip.published_snapshot));
  const draft = hasObject(trip.draft_snapshot) ? trip.draft_snapshot : {};
  const published = hasObject(trip.published_snapshot) ? trip.published_snapshot : {};
  const changedSections = [];

  ['itinerary_days', 'hotels', 'flights', 'transfers', 'charter_services', 'documents'].forEach((key) => {
    if (JSON.stringify(draft[key] || null) !== JSON.stringify(published[key] || null)) {
      changedSections.push(key);
    }
  });

  return {
    has_published_version: hasPublishedVersion,
    changed_sections: hasPublishedVersion ? changedSections : [],
  };
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

  const trip = await findTrip(tripId);
  if (!trip) {
    return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在' };
  }

  const now = new Date().toISOString();
  await writeAuditLog(db, {
    actor_openid: auth.openid,
    actor_user_id: auth.user._id,
    actor_role: auth.user.role,
    action: 'customer_trip_preview_opened_operator',
    target_type: 'customer_trip',
    target_id: trip._id,
    detail: {
      trip_id: trip.trip_id || trip.external_trip_id || tripId,
      external_trip_id: trip.external_trip_id || '',
      review_status: trip.review_status || '',
      visibility_status: trip.visibility_status || '',
      published_version: trip.published_version || 0,
    },
    created_at: now,
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    trip_id: trip.trip_id || trip.external_trip_id || tripId,
    external_trip_id: trip.external_trip_id || '',
    trip_no: trip.trip_no || '',
    review_status: trip.review_status || 'pending_review',
    visibility_status: trip.visibility_status || 'hidden',
    warning_codes: trip.warning_codes || [],
    critical_warning_codes: trip.critical_warning_codes || [],
    draft_snapshot: hasObject(trip.draft_snapshot) ? trip.draft_snapshot : {},
    published_snapshot: hasObject(trip.published_snapshot) ? trip.published_snapshot : {},
    published_version: trip.published_version || 0,
    diff_summary: diffSummary(trip),
  };
};
