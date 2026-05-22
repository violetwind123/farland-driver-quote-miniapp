const cloud = require('wx-server-sdk');
const { getCaller } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function normalizeBindMode(value) {
  if (value === 'farland_profile' || value === 'profile') return 'farland_profile';
  if (value === 'trip_only') return 'trip_only';
  return 'trip_only';
}

function legacyAccessType(bindMode) {
  return bindMode === 'farland_profile' ? 'profile' : 'trip_only';
}

function isExpired(invite, now) {
  const expiresAt = invite.expires_at instanceof Date ? invite.expires_at : new Date(invite.expires_at);
  return expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now.getTime();
}

function toIso(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function getServiceDateVisibleUntil(request, now) {
  const raw = request.service_date || request.pickup_date || request.pickup_time || request.pickup_time_text || '';
  const serviceDate = raw ? new Date(String(raw).replace(' ', 'T')) : null;
  if (serviceDate && !Number.isNaN(serviceDate.getTime())) {
    return new Date(serviceDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function getTripEndVisibleUntil(request) {
  const raw = request.trip_end_at || request.end_at || request.end_time || request.service_end_at || '';
  return toIso(raw);
}

function getVisibleUntil({ bindMode, request, now }) {
  if (bindMode !== 'trip_only') return '';
  const tripEnd = getTripEndVisibleUntil(request);
  if (tripEnd) return tripEnd;
  return getServiceDateVisibleUntil(request, now);
}

async function upsertTripAccess({ caller, userId, requestId, request, invite, bindMode, nowIso, now }) {
  const tripId = request.customer_trip_id || request.trip_id || '';
  const visibleUntil = getVisibleUntil({ bindMode, request, now });
  const accessData = {
    openid: caller.openid,
    user_id: userId,
    customer_openid: caller.openid,
    customer_user_id: userId,
    trip_id: tripId,
    request_id: requestId,
    bind_mode: bindMode,
    access_type: legacyAccessType(bindMode),
    visible_from: nowIso,
    visible_until: visibleUntil,
    status: 'active',
    invite_id: invite._id,
    invite_code_snapshot: invite.invite_code || '',
    source_invite_id: invite._id,
    updated_at: nowIso,
  };

  const existingRes = await db.collection('customer_trip_access')
    .where({ customer_openid: caller.openid, request_id: requestId, source_invite_id: invite._id })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const existing = existingRes.data[0];
  if (existing) {
    await db.collection('customer_trip_access').doc(existing._id).update({ data: accessData });
    return existing._id;
  }

  const created = await db.collection('customer_trip_access').add({
    data: {
      ...accessData,
      created_by: invite.created_by || '',
      created_by_openid: invite.created_by_openid || '',
      created_at: nowIso,
    },
  });
  return created._id;
}

exports.main = async (event = {}) => {
  const {
    request_id,
    invite_code,
    bind_mode,
    bind_type,
    access_type,
    display_name = '',
  } = event;

  if (!request_id || !invite_code) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '邀请参数不完整' };
  }

  const caller = await getCaller(cloud, db);
  if (!caller.openid) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const [inviteRes, requestRes] = await Promise.all([
    db.collection('customer_invites').where({ request_id, invite_code }).limit(1).get(),
    db.collection('ride_requests').doc(request_id).get().catch(() => null),
  ]);
  const invite = inviteRes.data[0];
  const request = requestRes && requestRes.data;
  if (!invite || !request) {
    return { success: false, code: 404, error_code: 'INVALID_INVITE', message: '邀请链接无效' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  if (isExpired(invite, now)) {
    await db.collection('customer_invites').doc(invite._id).update({
      data: { status: 'expired', updated_at: nowIso },
    }).catch(() => null);
    return { success: false, code: 403, error_code: 'INVITE_EXPIRED', message: '邀请链接已过期' };
  }

  if (invite.status === 'claimed' && invite.claimed_openid !== caller.openid) {
    return { success: false, code: 403, error_code: 'INVITE_ALREADY_CLAIMED', message: '该邀请已绑定其他微信' };
  }
  if (invite.status !== 'unused' && invite.status !== 'claimed') {
    return { success: false, code: 403, error_code: 'INVITE_UNAVAILABLE', message: '邀请链接已失效' };
  }

  const isReopenBySameOpenid = invite.status === 'claimed' && invite.claimed_openid === caller.openid;
  const requestedBindMode = bind_mode || bind_type || access_type;
  const existingBindMode = isReopenBySameOpenid
    ? invite.claimed_bind_mode || invite.bind_mode || invite.bind_type || invite.access_type
    : '';
  const safeBindMode = normalizeBindMode(requestedBindMode || existingBindMode);
  const rawDisplayName = String(display_name || '').trim();
  if (!isReopenBySameOpenid && !rawDisplayName) {
    return { success: false, code: 422, error_code: 'DISPLAY_NAME_REQUIRED', message: '请填写称呼' };
  }
  const safeName = String(rawDisplayName || invite.display_name || invite.customer_name || request.customer_name || 'Farland 客户').trim();
  const userRes = await db.collection('users').where({ openid: caller.openid }).limit(1).get();
  const existingUser = userRes.data[0];
  let userId = existingUser ? existingUser._id : '';
  const shouldCreateCustomerProfile = safeBindMode === 'farland_profile';

  if (shouldCreateCustomerProfile) {
    if (!existingUser) {
      const created = await db.collection('users').add({
        data: {
          openid: caller.openid,
          role: 'customer',
          status: 'active',
          name: safeName,
          phone: invite.customer_phone || request.customer_phone || '',
          customer_invite_id: invite._id,
          created_at: nowIso,
          updated_at: nowIso,
        },
      });
      userId = created._id;
    } else if (existingUser.role === 'guest' || existingUser.role === 'customer' || !existingUser.role) {
      await db.collection('users').doc(existingUser._id).update({
        data: {
          role: 'customer',
          status: 'active',
          name: safeName || existingUser.name || '',
          phone: existingUser.phone || invite.customer_phone || request.customer_phone || '',
          customer_invite_id: existingUser.customer_invite_id || invite._id,
          updated_at: nowIso,
        },
      }).catch(() => null);
    }
  }

  const accessId = await upsertTripAccess({
    caller,
    userId,
    requestId: request_id,
    request,
    invite,
    bindMode: safeBindMode,
    nowIso,
    now,
  }).catch((error) => {
    return { error };
  });
  if (!accessId || accessId.error) {
    return {
      success: false,
      code: 500,
      error_code: 'CUSTOMER_TRIP_ACCESS_WRITE_FAILED',
      message: '客户行程访问权限写入失败',
      errMsg: accessId && accessId.error && accessId.error.message ? accessId.error.message : '',
    };
  }

  await Promise.all([
    db.collection('customer_invites').doc(invite._id).update({
      data: {
        status: 'claimed',
        bind_mode: safeBindMode,
        bind_type: legacyAccessType(safeBindMode),
        display_name: safeName,
        claimed_openid: caller.openid,
        claimed_user_id: userId,
        claimed_bind_mode: safeBindMode,
        claimed_access_id: accessId,
        claimed_at: invite.claimed_at || nowIso,
        updated_at: nowIso,
      },
    }),
    db.collection('ride_requests').doc(request_id).update({
      data: {
        customer_openid: caller.openid,
        customer_name: safeName,
        customer_phone: request.customer_phone || invite.customer_phone || '',
        customer_bind_mode: safeBindMode,
        customer_bind_type: legacyAccessType(safeBindMode),
        updated_at: nowIso,
      },
    }).catch(() => null),
  ]);

  await writeAuditLog(db, {
    actor_openid: caller.openid,
    actor_user_id: userId,
    actor_role: shouldCreateCustomerProfile ? 'customer' : 'customer_trip_only',
    action: 'customer_invite_claimed',
    target_type: 'customer_invite',
    target_id: invite._id,
    related_request_id: request_id,
    detail: {
      invite_code,
      bind_mode: safeBindMode,
      bind_type: legacyAccessType(safeBindMode),
      customer_trip_access_id: accessId,
    },
    created_at: nowIso,
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    request_id,
    bind_mode: safeBindMode,
    bind_type: legacyAccessType(safeBindMode),
    display_name: safeName,
    customer_trip_access_id: accessId,
  };
};
