const cloud = require('wx-server-sdk');
const { getCaller } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function normalizeBindType(value) {
  return value === 'trip_only' ? 'trip_only' : 'profile';
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

function getVisibleUntil({ bindType, invite, now }) {
  if (bindType !== 'trip_only') return '';
  const inviteExpiry = toIso(invite.expires_at);
  if (inviteExpiry) return inviteExpiry;
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

async function upsertTripAccess({ caller, userId, requestId, request, invite, bindType, nowIso, now }) {
  const tripId = request.customer_trip_id || request.trip_id || '';
  const visibleUntil = getVisibleUntil({ bindType, invite, now });
  const accessData = {
    customer_openid: caller.openid,
    customer_user_id: userId,
    trip_id: tripId,
    request_id: requestId,
    access_type: bindType,
    visible_from: nowIso,
    visible_until: visibleUntil,
    status: 'active',
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
    bind_type = 'profile',
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

  const safeBindType = normalizeBindType(bind_type);
  const safeName = String(display_name || invite.customer_name || request.customer_name || 'Farland 客户').trim();
  const userRes = await db.collection('users').where({ openid: caller.openid }).limit(1).get();
  const existingUser = userRes.data[0];
  let userId = existingUser ? existingUser._id : '';
  const shouldCreateCustomerProfile = safeBindType === 'profile';

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
    bindType: safeBindType,
    nowIso,
    now,
  }).catch(() => '');

  await Promise.all([
    db.collection('customer_invites').doc(invite._id).update({
      data: {
        status: 'claimed',
        bind_type: safeBindType,
        display_name: safeName,
        claimed_openid: caller.openid,
        claimed_user_id: userId,
        claimed_at: invite.claimed_at || nowIso,
        updated_at: nowIso,
      },
    }),
    db.collection('ride_requests').doc(request_id).update({
      data: {
        customer_openid: caller.openid,
        customer_name: safeName,
        customer_phone: request.customer_phone || invite.customer_phone || '',
        customer_bind_type: safeBindType,
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
      bind_type: safeBindType,
      customer_trip_access_id: accessId,
    },
    created_at: nowIso,
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    request_id,
    bind_type: safeBindType,
    display_name: safeName,
    customer_trip_access_id: accessId,
  };
};
