const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function toTime(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function canonicalTripId(trip, fallback = '') {
  return safeString(trip && (trip.trip_id || trip.external_trip_id || trip.trip_no || fallback)).trim();
}

function tripIdCandidates(trip, fallback = '') {
  return Array.from(new Set([
    safeString(fallback).trim(),
    safeString(trip && trip.trip_id).trim(),
    safeString(trip && trip.external_trip_id).trim(),
    safeString(trip && trip.trip_no).trim(),
    safeString(trip && trip._id).trim(),
  ].filter(Boolean)));
}

function isBlockedRole(user) {
  return Boolean(user && ['operator', 'super_admin', 'driver'].includes(user.role));
}

function existingDisplayName(user) {
  return safeString(user && (user.display_name || user.name || user.customer_name)).trim();
}

function isInviteUsable(invite, now) {
  if (!invite) return false;
  if (invite.status !== 'active') return false;
  const expiresAt = toTime(invite.expires_at);
  return !expiresAt || expiresAt >= now.getTime();
}

async function writeAuditLog(data) {
  return db.collection('audit_logs').add({ data }).catch(() => null);
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

async function findInvite({ inviteCode, tripIds }) {
  const safeCode = safeString(inviteCode).trim();
  if (!safeCode) return null;
  const res = await db.collection('customer_trip_invites')
    .where({ invite_code: safeCode })
    .limit(5)
    .get()
    .catch(() => ({ data: [] }));
  const allowed = new Set(tripIds.filter(Boolean));
  return (res.data || []).find((invite) => {
    return allowed.has(safeString(invite.trip_id).trim())
      || allowed.has(safeString(invite.external_trip_id).trim())
      || allowed.has(safeString(invite.trip_no).trim());
  }) || null;
}

async function findUserByOpenid(openid) {
  const res = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return res.data[0] || null;
}

async function ensureCustomerUser({ openid, existingUser, displayName, invite, nowIso }) {
  const safeName = safeString(displayName).trim();
  if (!existingUser) {
    const created = await db.collection('users').add({
      data: {
        openid,
        role: 'customer',
        status: 'active',
        name: safeName,
        display_name: safeName,
        customer_status: 'active',
        customer_binding_mode: 'farland_profile',
        customer_invite_id: invite ? invite._id : '',
        created_at: nowIso,
        updated_at: nowIso,
        last_login_at: nowIso,
      },
    });
    return {
      user_id: created._id,
      display_name: safeName,
      created: true,
    };
  }

  const currentName = existingDisplayName(existingUser);
  const nextName = safeName || currentName;
  await db.collection('users').doc(existingUser._id).update({
    data: {
      role: 'customer',
      status: 'active',
      name: existingUser.name || nextName,
      display_name: existingUser.display_name || nextName,
      customer_status: 'active',
      customer_binding_mode: 'farland_profile',
      customer_invite_id: existingUser.customer_invite_id || (invite ? invite._id : ''),
      updated_at: nowIso,
      last_login_at: nowIso,
    },
  });

  return {
    user_id: existingUser._id,
    display_name: nextName,
    created: false,
  };
}

async function findExistingAccess({ tripIds, openid, userId }) {
  const queries = [];
  tripIds.forEach((tripId) => {
    queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, openid, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
    queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, customer_openid: openid, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
    if (userId) {
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, user_id: userId, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, customer_user_id: userId, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
    }
  });
  const results = await Promise.all(queries);
  return results.flatMap((res) => res.data || [])[0] || null;
}

async function upsertTripAccess({ trip, openid, userId, user, invite, nowIso }) {
  const tripId = canonicalTripId(trip);
  const tripIds = tripIdCandidates(trip, tripId);
  const existing = await findExistingAccess({ tripIds, openid, userId });
  const accessData = {
    trip_id: tripId,
    openid,
    user_id: userId,
    customer_openid: openid,
    customer_user_id: userId,
    customer_profile_id: user.customer_profile_id || '',
    bind_mode: 'farland_profile',
    access_type: 'profile',
    status: 'active',
    granted_source: 'invite_save',
    invite_id: invite._id,
    source_invite_id: invite._id,
    invite_code_snapshot: invite.invite_code || '',
    visible_from: existing ? (existing.visible_from || existing.created_at || nowIso) : nowIso,
    visible_until: '',
    first_claimed_at: existing ? (existing.first_claimed_at || existing.created_at || nowIso) : nowIso,
    last_viewed_at: nowIso,
    updated_at: nowIso,
  };

  if (existing) {
    await db.collection('customer_trip_access').doc(existing._id).update({ data: accessData });
    return existing._id;
  }

  const created = await db.collection('customer_trip_access').add({
    data: {
      ...accessData,
      created_at: nowIso,
    },
  });
  return created._id;
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const tripIdInput = safeString(event.trip_id || event.external_trip_id || event.trip_no).trim();
  const inviteCode = safeString(event.invite_code).trim();
  const displayName = safeString(event.display_name).trim();
  if (!tripIdInput || !inviteCode) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '行程参数不完整' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const [trip, existingUser] = await Promise.all([
    findTrip(tripIdInput),
    findUserByOpenid(OPENID),
  ]);
  if (!trip) {
    return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在' };
  }
  if (isBlockedRole(existingUser)) {
    return {
      success: false,
      code: 409,
      error_code: 'ROLE_CONFLICT',
      message: '当前微信已绑定其他 Farland 身份，不能保存为客户行程',
    };
  }
  if (existingUser && existingUser.status && existingUser.status !== 'active') {
    return {
      success: false,
      code: 409,
      error_code: 'INACTIVE_USER',
      message: '当前微信档案暂不可保存行程，请联系 Farland 顾问',
    };
  }

  const tripId = canonicalTripId(trip, tripIdInput);
  const tripIds = tripIdCandidates(trip, tripIdInput);
  const invite = await findInvite({ inviteCode, tripIds });
  if (!invite) {
    return { success: false, code: 403, error_code: 'INVALID_INVITE', message: '行程链接无效' };
  }
  if (!isInviteUsable(invite, now)) {
    return { success: false, code: 403, error_code: 'INVITE_UNAVAILABLE', message: '行程链接已失效' };
  }

  const existingName = existingDisplayName(existingUser);
  if (!displayName && !existingName) {
    return { success: false, code: 428, error_code: 'DISPLAY_NAME_REQUIRED', message: '请填写称呼后保存行程' };
  }

  const userProfile = await ensureCustomerUser({
    openid: OPENID,
    existingUser,
    displayName: displayName || existingName,
    invite,
    nowIso,
  });
  const user = {
    ...(existingUser || {}),
    _id: userProfile.user_id,
    openid: OPENID,
    customer_profile_id: existingUser ? (existingUser.customer_profile_id || '') : '',
  };
  const accessId = await upsertTripAccess({
    trip,
    openid: OPENID,
    userId: userProfile.user_id,
    user,
    invite,
    nowIso,
  });

  await writeAuditLog({
    actor_openid: OPENID,
    actor_user_id: userProfile.user_id,
    actor_role: 'customer',
    action: 'customer_trip_saved_to_profile',
    target_type: 'customer_trip',
    target_id: trip._id || tripId,
    detail: {
      trip_id: tripId,
      invite_id: invite._id,
      customer_trip_access_id: accessId,
      created_customer_user: userProfile.created,
    },
    created_at: nowIso,
  });

  return {
    success: true,
    code: 0,
    trip_id: tripId,
    bind_mode: 'farland_profile',
    bind_type: 'profile',
    display_name: userProfile.display_name,
    customer_trip_access_id: accessId,
    access_source: 'customer_trip_access',
  };
};
