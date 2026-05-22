const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TOP_LEVEL_KEYS = [
  'schema_version',
  'trip_id',
  'trip_type',
  'title',
  'city',
  'date_start',
  'date_end',
  'status',
  'customer',
  'advisor',
  'participants',
  'hotel_requests',
  'transport_requests',
  'charter_services',
  'daily_itinerary',
  'benefits',
];
const TRIP_TYPES = ['transfer', 'charter', 'hotel', 'mixed'];
const TRIP_STATUSES = ['draft', 'active', 'completed', 'cancelled'];
const SENSITIVE_KEYS = [
  'openid',
  'driver_quotes',
  'driver_quote',
  'internal_note',
  'operator_internal_note',
  'driver_cost',
  'margin',
  'supplier_private_notes',
  'raw_quote_pool',
];

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function walkSensitive(value, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSensitive(item, `${path}[${index}]`, errors));
    return;
  }
  if (!isPlainObject(value)) return;
  Object.keys(value).forEach((key) => {
    if (SENSITIVE_KEYS.includes(key)) {
      errors.push(`${path}.${key} is not allowed in customer trip JSON`);
    }
    walkSensitive(value[key], `${path}.${key}`, errors);
  });
}

function requireString(obj, key, path, errors) {
  if (!String(obj[key] || '').trim()) errors.push(`${path}.${key} is required`);
}

function validateStringEnum(obj, key, allowed, path, errors) {
  if (!allowed.includes(obj[key])) errors.push(`${path}.${key} must be one of ${allowed.join(', ')}`);
}

function validateDateField(obj, key, path, errors) {
  if (!isDate(obj[key])) errors.push(`${path}.${key} must use YYYY-MM-DD`);
}

function validateArray(value, path, errors) {
  if (value !== undefined && !Array.isArray(value)) errors.push(`${path} must be an array`);
}

function validateTrip(trip) {
  const errors = [];
  if (!isPlainObject(trip)) {
    return ['trip must be a JSON object'];
  }

  Object.keys(trip).forEach((key) => {
    if (!TOP_LEVEL_KEYS.includes(key)) errors.push(`$.${key} is not allowed`);
  });
  walkSensitive(trip, '$', errors);

  if (trip.schema_version !== 'customer-trip-v1') errors.push('$.schema_version must be customer-trip-v1');
  requireString(trip, 'trip_id', '$', errors);
  requireString(trip, 'title', '$', errors);
  requireString(trip, 'city', '$', errors);
  validateStringEnum(trip, 'trip_type', TRIP_TYPES, '$', errors);
  validateStringEnum(trip, 'status', TRIP_STATUSES, '$', errors);
  validateDateField(trip, 'date_start', '$', errors);
  validateDateField(trip, 'date_end', '$', errors);

  if (!isPlainObject(trip.customer)) {
    errors.push('$.customer is required');
  } else {
    requireString(trip.customer, 'display_name', '$.customer', errors);
  }
  if (!isPlainObject(trip.advisor)) {
    errors.push('$.advisor is required');
  } else {
    requireString(trip.advisor, 'name', '$.advisor', errors);
  }

  ['participants', 'hotel_requests', 'transport_requests', 'charter_services', 'daily_itinerary', 'benefits'].forEach((key) => {
    validateArray(trip[key], `$.${key}`, errors);
  });

  (trip.transport_requests || []).forEach((item, index) => {
    const path = `$.transport_requests[${index}]`;
    requireString(item, 'request_id', path, errors);
    validateStringEnum(item, 'service_type', ['transfer', 'charter'], path, errors);
    requireString(item, 'pickup', path, errors);
    requireString(item, 'dropoff', path, errors);
    requireString(item, 'pickup_time_text', path, errors);
  });

  (trip.charter_services || []).forEach((item, index) => {
    const path = `$.charter_services[${index}]`;
    requireString(item, 'charter_id', path, errors);
    requireString(item, 'title', path, errors);
    requireString(item, 'date_range_text', path, errors);
    requireString(item, 'service_area', path, errors);
    if (!Array.isArray(item.segments) || !item.segments.length) errors.push(`${path}.segments must have at least one item`);
  });

  return errors;
}

function parseTrip(input) {
  if (typeof input === 'string') {
    return JSON.parse(input);
  }
  return input;
}

function buildAccessData({ trip, access, user, request, auth, now }) {
  if (!user && !request) return null;
  const accessType = access && access.access_type === 'trip_only' ? 'trip_only' : 'profile';
  const openid = user ? user.openid : request.customer_openid;
  if (!openid) return null;
  return {
    customer_openid: openid,
    customer_user_id: user ? user._id : '',
    trip_id: trip.trip_id,
    request_id: access && access.request_id ? access.request_id : '',
    access_type: accessType,
    visible_from: now,
    visible_until: accessType === 'trip_only' ? String((access && access.visible_until) || trip.date_end || '') : '',
    status: 'active',
    source_invite_id: '',
    created_by: auth.user._id,
    created_by_openid: auth.openid,
    updated_at: now,
  };
}

async function resolveAccess(access = {}) {
  if (!access || (!access.customer_user_id && !access.request_id)) {
    return { user: null, request: null };
  }
  if (access.customer_user_id) {
    const userRes = await db.collection('users').doc(access.customer_user_id).get().catch(() => null);
    const user = userRes && userRes.data;
    if (!user || user.role !== 'customer' || !user.openid) {
      return { error: 'customer_user_id 未对应有效客户' };
    }
    return { user, request: null };
  }
  const requestRes = await db.collection('ride_requests').doc(access.request_id).get().catch(() => null);
  const request = requestRes && requestRes.data;
  if (!request || !request.customer_openid) {
    return { error: 'request_id 未绑定客户访问权限' };
  }
  return { user: null, request };
}

exports.main = async (event = {}) => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const dryRun = event.dry_run !== false;
  let trip;
  try {
    trip = parseTrip(event.trip || event.trip_json);
  } catch (error) {
    return { success: false, code: 422, error_code: 'INVALID_JSON', message: 'JSON 格式无效' };
  }

  const validationErrors = validateTrip(trip);
  if (validationErrors.length) {
    return {
      success: false,
      code: 422,
      error_code: 'SCHEMA_VALIDATION_FAILED',
      message: '行程 JSON 校验失败',
      errors: validationErrors,
    };
  }

  const existingTripRes = await db.collection('customer_trips')
    .where({ trip_id: trip.trip_id })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const existingTrip = existingTripRes.data[0] || null;
  const accessResult = await resolveAccess(event.access || {});
  if (accessResult.error) {
    return { success: false, code: 422, error_code: 'ACCESS_VALIDATION_FAILED', message: accessResult.error };
  }

  const now = new Date().toISOString();
  const accessData = buildAccessData({
    trip,
    access: event.access || {},
    user: accessResult.user,
    request: accessResult.request,
    auth,
    now,
  });

  const operations = [
    {
      type: existingTrip ? 'update' : 'create',
      collection: 'customer_trips',
      id: existingTrip ? existingTrip._id : '',
      key: trip.trip_id,
      title: trip.title,
    },
  ];
  if (accessData) {
    operations.push({
      type: 'upsert',
      collection: 'customer_trip_access',
      key: `${accessData.customer_openid}:${trip.trip_id}`,
      access_type: accessData.access_type,
      visible_until: accessData.visible_until,
    });
  }

  if (dryRun) {
    return {
      success: true,
      code: 0,
      dry_run: true,
      valid: true,
      trip_id: trip.trip_id,
      operations,
    };
  }

  const tripData = {
    ...trip,
    updated_by: auth.user._id,
    updated_by_openid: auth.openid,
    updated_at: now,
  };
  let tripDocId = existingTrip && existingTrip._id;
  if (existingTrip) {
    await db.collection('customer_trips').doc(existingTrip._id).update({ data: tripData });
  } else {
    const addRes = await db.collection('customer_trips').add({
      data: {
        ...tripData,
        created_by: auth.user._id,
        created_by_openid: auth.openid,
        created_at: now,
      },
    });
    tripDocId = addRes._id;
  }

  let accessId = '';
  if (accessData) {
    const existingAccessRes = await db.collection('customer_trip_access')
      .where({ customer_openid: accessData.customer_openid, trip_id: trip.trip_id })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const existingAccess = existingAccessRes.data[0];
    if (existingAccess) {
      await db.collection('customer_trip_access').doc(existingAccess._id).update({ data: accessData });
      accessId = existingAccess._id;
    } else {
      const addAccessRes = await db.collection('customer_trip_access').add({
        data: {
          ...accessData,
          created_at: now,
        },
      });
      accessId = addAccessRes._id;
    }
  }

  await writeAuditLog(db, {
    actor_openid: auth.openid,
    actor_user_id: auth.user._id,
    actor_role: auth.user.role,
    action: existingTrip ? 'customer_trip_import_updated' : 'customer_trip_import_created',
    target_type: 'customer_trip',
    target_id: tripDocId,
    detail: {
      trip_id: trip.trip_id,
      access_id: accessId,
      operations,
    },
    created_at: now,
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    dry_run: false,
    trip_id: trip.trip_id,
    customer_trip_id: tripDocId,
    customer_trip_access_id: accessId,
    operations,
  };
};
