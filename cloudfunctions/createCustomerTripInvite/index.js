const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function generateInviteCode() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FT${time}${random}`;
}

function isActiveInvite(invite, now) {
  if (!invite || invite.status !== 'active') return false;
  const expiresAt = invite.expires_at instanceof Date ? invite.expires_at : new Date(invite.expires_at);
  return !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() >= now.getTime();
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
  try {
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
    if (trip.visibility_status !== 'published' || !trip.published_snapshot || !Object.keys(trip.published_snapshot).length) {
      return {
        success: false,
        code: 409,
        error_code: 'TRIP_NOT_PUBLISHED',
        message: '请先发布客户可见行程，再生成分享卡',
        trip_id: canonicalTripId,
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const safeDays = Math.max(1, Math.min(Number(event.expires_in_days || 30), 90));
    const expiresAt = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);
    const existingRes = await db.collection('customer_trip_invites')
      .where({ trip_id: canonicalTripId, status: 'active' })
      .limit(10)
      .get()
      .catch(() => ({ data: [] }));
    const existingInvite = (existingRes.data || [])
      .filter((invite) => isActiveInvite(invite, now))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
    if (existingInvite) {
      const sharePath = `/pages/customer/home/home?trip_id=${encodeURIComponent(canonicalTripId)}&invite_code=${encodeURIComponent(existingInvite.invite_code)}`;
      return {
        success: true,
        code: 0,
        trip_id: canonicalTripId,
        invite_id: existingInvite._id,
        invite_code: existingInvite.invite_code,
        share_path: sharePath,
        path: sharePath,
        expires_at: existingInvite.expires_at instanceof Date ? existingInvite.expires_at.toISOString() : existingInvite.expires_at,
        reused: true,
      };
    }

    let inviteCode = generateInviteCode();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existingCodeRes = await db.collection('customer_trip_invites')
        .where({ invite_code: inviteCode })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
      if (!existingCodeRes.data.length) break;
      inviteCode = generateInviteCode();
    }

    const inviteData = {
      invite_code: inviteCode,
      trip_id: canonicalTripId,
      external_trip_id: trip.external_trip_id || canonicalTripId,
      trip_no: trip.trip_no || trip.external_trip_id || canonicalTripId,
      status: 'active',
      visibility_status_snapshot: trip.visibility_status || '',
      published_version_snapshot: trip.published_version || 0,
      expires_at: expiresAt,
      created_by: auth.user._id,
      created_by_openid: auth.openid,
      created_at: nowIso,
      updated_at: nowIso,
    };
    const addRes = await db.collection('customer_trip_invites').add({ data: inviteData });
    const sharePath = `/pages/customer/home/home?trip_id=${encodeURIComponent(canonicalTripId)}&invite_code=${encodeURIComponent(inviteCode)}`;

    await writeAuditLog(db, {
      actor_openid: auth.openid,
      actor_user_id: auth.user._id,
      actor_role: auth.user.role,
      action: 'customer_trip_invite_created',
      target_type: 'customer_trip_invite',
      target_id: addRes._id,
      detail: {
        trip_id: canonicalTripId,
        external_trip_id: trip.external_trip_id || '',
        invite_code: inviteCode,
        expires_at: expiresAt.toISOString(),
        published_version: trip.published_version || 0,
      },
      created_at: nowIso,
    }).catch(() => null);

    return {
      success: true,
      code: 0,
      trip_id: canonicalTripId,
      invite_id: addRes._id,
      invite_code: inviteCode,
      share_path: sharePath,
      path: sharePath,
      expires_at: expiresAt.toISOString(),
      reused: false,
    };
  } catch (error) {
    console.error('[createCustomerTripInvite] failed', error);
    return {
      success: false,
      code: 500,
      error_code: 'CREATE_CUSTOMER_TRIP_INVITE_FAILED',
      message: error && error.message ? error.message : '客户行程分享卡生成失败',
      err_msg: error && error.errMsg ? error.errMsg : '',
    };
  }
};
