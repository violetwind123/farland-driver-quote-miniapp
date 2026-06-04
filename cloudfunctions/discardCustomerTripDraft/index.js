const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function unique(values) {
  const seen = {};
  return values.map((value) => safeString(value).trim()).filter((value) => {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}

async function requireRole(roles) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, code: 401, message: '无法识别用户身份' };
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  if (!user || user.status !== 'active' || !roles.includes(user.role)) {
    return { ok: false, code: 403, message: '无权限访问' };
  }
  return { ok: true, openid: OPENID, user };
}

async function writeAuditLog(data) {
  return db.collection('audit_logs').add({ data });
}

async function findTrip(tripId) {
  const safeTripId = safeString(tripId).trim();
  if (!safeTripId) return null;
  const byDoc = await db.collection('customer_trips').doc(safeTripId).get().catch(() => null);
  if (byDoc && byDoc.data) return byDoc.data;
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
  return null;
}

function lookupIds(trip, fallbackTripId) {
  return unique([
    fallbackTripId,
    trip && trip._id,
    trip && trip.trip_id,
    trip && trip.external_trip_id,
    trip && trip.trip_no,
  ]);
}

function inviteIsActive(invite, nowMs) {
  if (!invite || invite.status !== 'active') return false;
  const expiresAt = invite.expires_at instanceof Date ? invite.expires_at : new Date(invite.expires_at || '');
  return !invite.expires_at || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() >= nowMs;
}

async function hasActiveInvites(trip, fallbackTripId) {
  const ids = lookupIds(trip, fallbackTripId);
  const nowMs = Date.now();
  for (const id of ids) {
    const res = await db.collection('customer_trip_invites')
      .where({ trip_id: id, status: 'active' })
      .limit(20)
      .get()
      .catch(() => ({ data: [] }));
    if ((res.data || []).some((invite) => inviteIsActive(invite, nowMs))) return true;
  }
  return false;
}

async function hasActiveAccess(trip, fallbackTripId) {
  const ids = lookupIds(trip, fallbackTripId);
  for (const id of ids) {
    const res = await db.collection('customer_trip_access')
      .where({ trip_id: id, status: 'active' })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if ((res.data || []).length) return true;
  }
  return false;
}

exports.main = async (event = {}) => {
  const auth = await requireRole(['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const tripId = safeString(event.trip_id || event.external_trip_id || event.trip_no).trim();
  if (!tripId) {
    return { success: false, code: 422, error_code: 'TRIP_ID_REQUIRED', message: '请提供 trip_id' };
  }

  const trip = await findTrip(tripId);
  if (!trip) {
    return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在或已清除' };
  }

  const canonicalTripId = trip.trip_id || trip.external_trip_id || trip.trip_no || tripId;
  const published = trip.visibility_status === 'published'
    || Number(trip.published_version || 0) > 0
    || (trip.published_snapshot && Object.keys(trip.published_snapshot).length > 0);
  if (published) {
    return {
      success: false,
      code: 409,
      error_code: 'TRIP_ALREADY_PUBLISHED',
      message: '已发布或已绑定行程不能直接清除，请创建新版本',
      trip_id: canonicalTripId,
    };
  }

  const [activeInvites, activeAccess] = await Promise.all([
    hasActiveInvites(trip, canonicalTripId),
    hasActiveAccess(trip, canonicalTripId),
  ]);
  if (activeInvites || activeAccess) {
    return {
      success: false,
      code: 409,
      error_code: 'TRIP_ALREADY_BOUND',
      message: '已发布或已绑定行程不能直接清除，请创建新版本',
      trip_id: canonicalTripId,
      active_invites: activeInvites,
      active_access: activeAccess,
    };
  }

  const now = new Date().toISOString();
  await db.collection('customer_trips').doc(trip._id).update({
    data: {
      status: 'discarded',
      review_status: 'discarded',
      visibility_status: 'discarded',
      draft_snapshot: {},
      warning_codes: [],
      critical_warning_codes: [],
      discarded_at: now,
      discarded_by: auth.user._id,
      discarded_by_openid: auth.openid,
      updated_by: auth.user._id,
      updated_by_openid: auth.openid,
      updated_at: now,
    },
  });

  await writeAuditLog({
    actor_openid: auth.openid,
    actor_user_id: auth.user._id,
    actor_role: auth.user.role,
    action: 'customer_trip_draft_discarded',
    target_type: 'customer_trip',
    target_id: trip._id,
    detail: {
      trip_id: canonicalTripId,
      external_trip_id: trip.external_trip_id || '',
    },
    created_at: now,
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    trip_id: canonicalTripId,
    discarded: true,
  };
};
