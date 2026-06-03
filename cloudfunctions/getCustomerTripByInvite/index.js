const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const BLOCKED_SNAPSHOT_KEYS = new Set([
  'openid',
  'customer_openid',
  'customer_user_id',
  'user_id',
  'draft_snapshot',
  'raw_imported_json',
  'raw_json',
  'raw_parse_note',
  'raw_parse_notes',
  'source_raw_text',
  'source_pdf_text',
  'ai_warnings',
  'warning_codes',
  'critical_warning_codes',
  'operator_note',
  'operator_notes',
  'internal_note',
  'internal_notes',
  'operator_internal_note',
  'supplier_note',
  'supplier_notes',
  'supplier_private_note',
  'supplier_private_notes',
  'driver_quotes',
  'driver_quote',
  'raw_quote_pool',
  'cost',
  'driver_cost',
  'margin',
  'audit_logs',
]);

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeCustomerObject(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeCustomerObject).filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return value;
  return Object.keys(value).reduce((acc, key) => {
    if (BLOCKED_SNAPSHOT_KEYS.has(key)) return acc;
    const sanitized = sanitizeCustomerObject(value[key]);
    if (sanitized !== undefined) acc[key] = sanitized;
    return acc;
  }, {});
}

function toTime(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isVisibleAccess(access, now) {
  if (!access || access.status !== 'active') return false;
  const bindMode = access.bind_mode || access.access_type || '';
  if (bindMode === 'farland_profile' || bindMode === 'profile') return true;
  const visibleUntil = toTime(access.visible_until);
  return !visibleUntil || visibleUntil >= now.getTime();
}

function isRegisteredCustomer(user) {
  if (!user) return false;
  if (['operator', 'super_admin', 'driver'].includes(user.role)) return false;
  if (user.status && user.status !== 'active') return false;
  return user.role === 'customer'
    || user.customer_status === 'active'
    || Boolean(user.customer_profile_id)
    || user.customer_binding_mode === 'farland_profile'
    || user.bind_mode === 'farland_profile'
    || user.bind_type === 'profile'
    || user.access_type === 'profile';
}

function isBlockedRole(user) {
  return Boolean(user && ['operator', 'super_admin', 'driver'].includes(user.role));
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

function hasPublishedSnapshot(trip) {
  return Boolean(
    trip
    && trip.visibility_status === 'published'
    && isPlainObject(trip.published_snapshot)
    && Object.keys(trip.published_snapshot).length
  );
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

async function findUserByOpenid(openid) {
  if (!openid) return null;
  const res = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return res.data[0] || null;
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

async function findActiveAccess({ tripIds, openid, userId, now }) {
  const queries = [];
  tripIds.forEach((tripId) => {
    if (openid) {
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, openid, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, customer_openid: openid, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
    }
    if (userId) {
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, user_id: userId, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
      queries.push(db.collection('customer_trip_access').where({ trip_id: tripId, customer_user_id: userId, status: 'active' }).limit(1).get().catch(() => ({ data: [] })));
    }
  });
  if (!queries.length) return null;
  const results = await Promise.all(queries);
  const records = results.flatMap((res) => res.data || []);
  return records.find((access) => isVisibleAccess(access, now)) || null;
}

async function upsertTripAccess({ trip, user, invite, now, nowIso }) {
  const openid = safeString(user.openid).trim();
  const userId = safeString(user._id).trim();
  const tripId = canonicalTripId(trip);
  const tripIds = tripIdCandidates(trip, tripId);
  const existing = await findActiveAccess({ tripIds, openid, userId, now });
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
    invite_id: invite ? invite._id : '',
    source_invite_id: invite ? invite._id : '',
    invite_code_snapshot: invite ? (invite.invite_code || '') : '',
    visible_from: existing ? (existing.visible_from || existing.created_at || nowIso) : nowIso,
    visible_until: '',
    last_viewed_at: nowIso,
    updated_at: nowIso,
  };

  if (existing) {
    await db.collection('customer_trip_access').doc(existing._id).update({
      data: {
        ...accessData,
        granted_source: existing.granted_source || 'invite_auto',
        first_claimed_at: existing.first_claimed_at || existing.created_at || nowIso,
      },
    });
    return { access_id: existing._id, existed: true };
  }

  const created = await db.collection('customer_trip_access').add({
    data: {
      ...accessData,
      granted_source: 'invite_auto',
      first_claimed_at: nowIso,
      created_at: nowIso,
    },
  });
  return { access_id: created._id, existed: false };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  }

  const inputTripId = safeString(event.trip_id || event.external_trip_id || event.trip_no).trim();
  const inviteCode = safeString(event.invite_code).trim();
  if (!inputTripId) {
    return { success: false, code: 422, error_code: 'TRIP_ID_REQUIRED', message: '请提供 trip_id' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const [trip, user] = await Promise.all([
    findTrip(inputTripId),
    findUserByOpenid(OPENID),
  ]);

  if (!trip) {
    return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在' };
  }

  const tripId = canonicalTripId(trip, inputTripId);
  const tripIds = tripIdCandidates(trip, inputTripId);
  const registeredCustomer = isRegisteredCustomer(user);
  const blockedRole = isBlockedRole(user);
  const activeAccess = await findActiveAccess({
    tripIds,
    openid: OPENID,
    userId: user ? user._id : '',
    now,
  });
  const invite = await findInvite({ inviteCode, tripIds });
  const hasValidInvite = isInviteUsable(invite, now);

  if (!activeAccess && !hasValidInvite) {
    if (invite && invite.status !== 'active') {
      return { success: false, code: 403, error_code: 'INVITE_UNAVAILABLE', message: '行程链接已失效' };
    }
    if (invite && toTime(invite.expires_at) && toTime(invite.expires_at) < now.getTime()) {
      return { success: false, code: 403, error_code: 'INVITE_UNAVAILABLE', message: '行程链接已失效' };
    }
    return { success: false, code: 403, error_code: 'INVALID_INVITE', message: '行程链接无效' };
  }

  if (!hasPublishedSnapshot(trip)) {
    await writeAuditLog({
      actor_openid: OPENID,
      actor_user_id: user ? user._id : '',
      actor_role: user ? (user.role || '') : 'temporary_guest',
      action: 'customer_trip_waiting_viewed',
      target_type: 'customer_trip',
      target_id: trip._id || tripId,
      detail: {
        trip_id: tripId,
        access_source: activeAccess ? 'customer_trip_access' : 'temporary_invite',
        invite_id: invite ? invite._id : '',
      },
      created_at: nowIso,
    });
    return {
      success: true,
      code: 0,
      trip_id: tripId,
      waiting: true,
      access_source: activeAccess ? 'customer_trip_access' : 'temporary_invite',
      auto_saved: false,
      already_saved: Boolean(activeAccess),
      can_save_to_profile: false,
      message: 'Farland 顾问正在为您核对行程安排，确认后将在这里显示。',
    };
  }

  let autoSaved = false;
  let alreadySaved = Boolean(activeAccess);
  let accessSource = activeAccess ? 'customer_trip_access' : 'temporary_invite';
  if (registeredCustomer && hasValidInvite && !blockedRole) {
    const saved = await upsertTripAccess({ trip, user, invite, now, nowIso });
    autoSaved = !saved.existed;
    alreadySaved = saved.existed;
    accessSource = saved.existed ? 'customer_trip_access' : 'invite_auto';
    if (!saved.existed) {
      await writeAuditLog({
        actor_openid: OPENID,
        actor_user_id: user._id,
        actor_role: 'customer',
        action: 'customer_trip_auto_saved',
        target_type: 'customer_trip',
        target_id: trip._id || tripId,
        detail: {
          trip_id: tripId,
          invite_id: invite._id,
          customer_trip_access_id: saved.access_id,
        },
        created_at: nowIso,
      });
    }
  }

  await writeAuditLog({
    actor_openid: OPENID,
    actor_user_id: user ? user._id : '',
    actor_role: user ? (user.role || '') : 'temporary_guest',
    action: 'customer_trip_invite_opened',
    target_type: 'customer_trip',
    target_id: trip._id || tripId,
    detail: {
      trip_id: tripId,
      invite_id: invite ? invite._id : '',
      access_source: accessSource,
      auto_saved: autoSaved,
      already_saved: alreadySaved,
    },
    created_at: nowIso,
  });

  return {
    success: true,
    code: 0,
    trip_id: tripId,
    waiting: false,
    access_source: accessSource,
    auto_saved: autoSaved,
    already_saved: alreadySaved,
    can_save_to_profile: Boolean(hasValidInvite && !registeredCustomer && !blockedRole),
    trip: sanitizeCustomerObject(trip.published_snapshot),
  };
};
