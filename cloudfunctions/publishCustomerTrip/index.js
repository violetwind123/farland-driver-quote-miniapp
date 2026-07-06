const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function hasObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

async function findTrip(tripId) {
  const safeTripId = safeString(tripId).trim();
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

  const canonicalTripId = trip.trip_id || trip.external_trip_id || tripId;

  // 收回:把已 release 的正式行程撤回草稿态(客户回落到第一层手机行程单图)。只翻可见标记,不动 published_snapshot;
  // 不受关键警告 / draft 缺失拦截(撤回是收窄可见性,永远允许)。
  if (event.release === false) {
    const nowUnrelease = new Date().toISOString();
    await db.collection('customer_trips').doc(trip._id).update({ data: {
      customer_official_released: false,
      updated_by: auth.user._id,
      updated_by_openid: auth.openid,
      updated_at: nowUnrelease,
    } });
    await writeAuditLog(db, {
      actor_openid: auth.openid,
      actor_user_id: auth.user._id,
      actor_role: auth.user.role,
      action: 'customer_trip_unreleased',
      target_type: 'customer_trip',
      target_id: trip._id,
      detail: { trip_id: canonicalTripId, external_trip_id: trip.external_trip_id || '' },
      created_at: nowUnrelease,
    }).catch(() => null);
    return {
      success: true,
      code: 0,
      trip_id: canonicalTripId,
      customer_official_released: false,
    };
  }

  const criticalWarningCodes = Array.isArray(trip.critical_warning_codes) ? trip.critical_warning_codes : [];
  if (criticalWarningCodes.length) {
    await writeAuditLog(db, {
      actor_openid: auth.openid,
      actor_user_id: auth.user._id,
      actor_role: auth.user.role,
      action: 'customer_trip_publish_blocked',
      target_type: 'customer_trip',
      target_id: trip._id,
      detail: {
        trip_id: canonicalTripId,
        critical_warning_codes: criticalWarningCodes,
      },
    }).catch(() => null);
    return {
      success: false,
      code: 409,
      error_code: 'CRITICAL_WARNINGS_REMAIN',
      message: '存在关键警告，不能发布',
      trip_id: canonicalTripId,
      critical_warning_codes: criticalWarningCodes,
    };
  }

  if (!hasObject(trip.draft_snapshot)) {
    return {
      success: false,
      code: 409,
      error_code: 'DRAFT_SNAPSHOT_REQUIRED',
      message: '请先生成客户可见预览',
      trip_id: canonicalTripId,
    };
  }

  const now = new Date().toISOString();
  const nextVersion = Number(trip.published_version || 0) + 1;
  const reviewNote = safeString(event.review_note).trim();
  const updateData = {
    trip_id: canonicalTripId,
    external_trip_id: trip.external_trip_id || canonicalTripId,
    published_snapshot: trip.draft_snapshot,
    published_version: nextVersion,
    review_status: 'approved',
    visibility_status: 'published',
    // 第二层可见闸门:运营显式 release → 客户从第一层(手机行程单图)升级到正式行程卡片。
    customer_official_released: true,
    reviewed_by: auth.user._id,
    reviewed_by_openid: auth.openid,
    reviewed_at: now,
    published_by: auth.user._id,
    published_by_openid: auth.openid,
    published_at: now,
    review_note: reviewNote,
    updated_by: auth.user._id,
    updated_by_openid: auth.openid,
    updated_at: now,
  };

  await db.collection('customer_trips').doc(trip._id).update({ data: updateData });

  await writeAuditLog(db, {
    actor_openid: auth.openid,
    actor_user_id: auth.user._id,
    actor_role: auth.user.role,
    action: 'customer_trip_published',
    target_type: 'customer_trip',
    target_id: trip._id,
    detail: {
      trip_id: canonicalTripId,
      external_trip_id: trip.external_trip_id || '',
      published_version: nextVersion,
      warning_codes: trip.warning_codes || [],
      review_note: reviewNote,
    },
    created_at: now,
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    trip_id: canonicalTripId,
    external_trip_id: trip.external_trip_id || canonicalTripId,
    review_status: 'approved',
    visibility_status: 'published',
    published_version: nextVersion,
    published_at: now,
    customer_official_released: true,
  };
};
