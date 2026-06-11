const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function trimText(value, maxLength = 120) {
  return safeString(value).trim().slice(0, maxLength);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function uniqueStrings(values) {
  const seen = {};
  return (Array.isArray(values) ? values : [])
    .map((value) => safeString(value).trim())
    .filter((value) => {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
}

function normalizeTravelerNames(value) {
  const list = Array.isArray(value)
    ? value
    : safeString(value).split(/[\n,，、/]+/);
  return uniqueStrings(list)
    .map((name) => name.slice(0, 30))
    .filter(Boolean)
    .slice(0, 20);
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

async function loadCustomerUser(userId) {
  const safeUserId = safeString(userId).trim();
  if (!safeUserId) return null;
  const userRes = await db.collection('users').doc(safeUserId).get().catch(() => null);
  return userRes && userRes.data ? userRes.data : null;
}

async function validateCustomerIds(userIds) {
  const customersById = {};
  for (const userId of uniqueStrings(userIds)) {
    const user = await loadCustomerUser(userId);
    if (!user) {
      return {
        ok: false,
        code: 404,
        error_code: 'CUSTOMER_NOT_FOUND',
        message: '客户不存在',
        user_id: userId,
      };
    }
    if (user.role !== 'customer' || user.status !== 'active') {
      return {
        ok: false,
        code: 422,
        error_code: 'INVALID_CUSTOMER_ROLE',
        message: '只能选择 active customer 用户',
        user_id: userId,
      };
    }
    customersById[userId] = user;
  }
  return { ok: true, customersById };
}

function customerSafeProjection(user) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) return {};
  const customerProfileId = trimText(user.customer_profile_id, 80);
  const displayName = trimText(user.display_name || user.name || '', 80);
  const name = trimText(user.name || user.display_name || '', 80);
  const hasIdentity = customerProfileId || displayName || name || user._id || user.user_id || user.openid;
  if (!hasIdentity) return {};
  return {
    customer_profile_id: customerProfileId,
    display_name: displayName || 'Farland 客户',
    name,
  };
}

function ownershipProjection(trip) {
  const customer = trip.customer && typeof trip.customer === 'object' && !Array.isArray(trip.customer)
    ? trip.customer
    : {};
  return {
    primary_customer_user_id: trip.primary_customer_user_id || '',
    customer_user_id: trip.customer_user_id || trip.primary_customer_user_id || '',
    customer_user_ids: Array.isArray(trip.customer_user_ids) ? uniqueStrings(trip.customer_user_ids) : [],
    customer_profile_id: trip.customer_profile_id || customer.customer_profile_id || '',
    party_name: trip.party_name || '',
    traveler_names: Array.isArray(trip.traveler_names) ? trip.traveler_names : [],
    customer: customerSafeProjection(customer),
    customer_display_name: trip.customer_display_name || customer.display_name || '',
    customer_name: trip.customer_name || customer.name || customer.display_name || '',
    customer_phone: trip.customer_phone || '',
    customer_wechat_id: trip.customer_wechat_id || '',
    ownership_updated_at: trip.ownership_updated_at || '',
    ownership_updated_by: trip.ownership_updated_by || '',
  };
}

function buildPatch(event, trip, customersById, operatorUserId) {
  const patch = {};
  const existing = ownershipProjection(trip);

  const nextPrimaryId = hasOwn(event, 'primary_customer_user_id')
    ? trimText(event.primary_customer_user_id, 80)
    : existing.primary_customer_user_id;
  const existingCustomerIds = existing.customer_user_ids || [];
  const incomingCustomerIds = hasOwn(event, 'customer_user_ids')
    ? uniqueStrings(event.customer_user_ids)
    : existingCustomerIds;
  const nextCustomerIds = uniqueStrings([
    ...incomingCustomerIds,
    nextPrimaryId,
  ]);
  const primaryUser = nextPrimaryId ? customersById[nextPrimaryId] : null;
  const primaryWasCleared = hasOwn(event, 'primary_customer_user_id') && !nextPrimaryId;
  const safeCustomer = primaryWasCleared ? {} : customerSafeProjection(primaryUser || existing.customer);
  const existingCustomer = trip.customer && typeof trip.customer === 'object' && !Array.isArray(trip.customer)
    ? trip.customer
    : {};
  const existingCustomerSafeKeys = customerSafeProjection(existingCustomer);

  patch.primary_customer_user_id = nextPrimaryId;
  patch.customer_user_id = nextPrimaryId;
  patch.customer_user_ids = nextCustomerIds;
  patch.customer_profile_id = safeCustomer.customer_profile_id || '';
  patch.customer = {
    ...existingCustomerSafeKeys,
    ...safeCustomer,
  };
  patch.customer_display_name = safeCustomer.display_name || '';
  patch.customer_name = safeCustomer.name || safeCustomer.display_name || '';

  if (primaryUser) {
    patch.customer_phone = trimText(primaryUser.phone, 80);
    patch.customer_wechat_id = trimText(primaryUser.wechat_id, 80);
  } else if (hasOwn(event, 'primary_customer_user_id') && !nextPrimaryId) {
    patch.customer_phone = '';
    patch.customer_wechat_id = '';
  }

  if (hasOwn(event, 'party_name')) {
    patch.party_name = trimText(event.party_name, 80);
  }
  if (hasOwn(event, 'traveler_names')) {
    patch.traveler_names = normalizeTravelerNames(event.traveler_names);
  }

  patch.ownership_updated_at = new Date().toISOString();
  patch.ownership_updated_by = operatorUserId || '';
  return patch;
}

exports.main = async (event = {}) => {
  try {
    const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
    if (!auth.ok) {
      return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
    }

    const tripId = trimText(event.trip_id || event.external_trip_id || event.trip_no, 120);
    if (!tripId) {
      return { success: false, code: 422, error_code: 'TRIP_ID_REQUIRED', message: '请提供 trip_id' };
    }

    const trip = await findTrip(tripId);
    if (!trip) {
      return { success: false, code: 404, error_code: 'TRIP_NOT_FOUND', message: '行程不存在' };
    }

    const incomingIds = uniqueStrings([
      hasOwn(event, 'primary_customer_user_id') ? event.primary_customer_user_id : trip.primary_customer_user_id,
      ...(hasOwn(event, 'customer_user_ids') ? event.customer_user_ids : (trip.customer_user_ids || [])),
    ]);
    const validation = await validateCustomerIds(incomingIds);
    if (!validation.ok) {
      return validation;
    }

    const before = ownershipProjection(trip);
    const patch = buildPatch(event, trip, validation.customersById || {}, auth.user._id);
    await db.collection('customer_trips').doc(trip._id).update({ data: patch });
    const after = ownershipProjection({ ...trip, ...patch });

    await writeAuditLog(db, {
      actor_openid: auth.openid,
      actor_user_id: auth.user._id,
      actor_role: auth.user.role,
      action: 'customer_trip_ownership_updated',
      target_type: 'customer_trip',
      target_id: trip._id,
      detail: {
        trip_id: trip.trip_id || trip.external_trip_id || tripId,
        before,
        after,
      },
    }).catch(() => null);

    return {
      success: true,
      code: 0,
      trip_id: trip.trip_id || trip.external_trip_id || tripId,
      ownership: after,
    };
  } catch (error) {
    console.error('[updateOperatorTripOwnership] failed', error);
    return {
      success: false,
      code: 500,
      error_code: 'UPDATE_TRIP_OWNERSHIP_FAILED',
      message: '行程归属更新失败，请稍后重试',
      err_msg: error && error.errMsg ? error.errMsg : '',
    };
  }
};
