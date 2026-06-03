const cloud = require('wx-server-sdk');
const crypto = require('crypto');
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
const CANONICAL_TRIP_TYPES = ['transfer', 'charter', 'mixed', 'hotel_only'];
const TRIP_STATUSES = ['draft', 'active', 'completed', 'cancelled'];
const CANONICAL_TRIP_STATUSES = ['draft', 'active', 'completed', 'cancelled', 'archived'];
const SENSITIVE_KEYS = [
  'openid',
  'driver_quotes',
  'driver_quote',
  'internal_note',
  'internal_notes',
  'operator_internal_note',
  'driver_cost',
  'margin',
  'supplier_note',
  'supplier_notes',
  'supplier_private_note',
  'supplier_private_notes',
  'raw_quote_pool',
];

const LEGACY_WARNING = '当前导入使用旧版 customer-trip-v1 字段，建议迁移到 schema_version=1.0.0';

function initialReviewFields() {
  return {
    review_status: 'pending_review',
    visibility_status: 'hidden',
    warning_codes: [],
    critical_warning_codes: [],
    draft_snapshot: {},
    published_snapshot: {},
    published_version: 0,
  };
}

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

function findSensitiveKey(value) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSensitiveKey(value[index]);
      if (found) return found;
    }
    return '';
  }
  if (!isPlainObject(value)) return '';
  for (const key of Object.keys(value)) {
    if (SENSITIVE_KEYS.includes(key)) return key;
    const found = findSensitiveKey(value[key]);
    if (found) return found;
  }
  return '';
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

function isValidDateTime(value) {
  const date = new Date(value);
  return Boolean(value) && !Number.isNaN(date.getTime());
}

function hasData(value) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function collectTripWarningCodes(trip) {
  const warningCodes = new Set();
  const days = Array.isArray(trip.itinerary_days)
    ? trip.itinerary_days
    : (Array.isArray(trip.daily_itinerary) ? trip.daily_itinerary : []);

  days.forEach((day) => {
    const displayed = day.displayed_start_time || day.displayed_start_time_raw || day.start_time || '';
    const estimated = day.estimated_departure_time || day.estimated_departure_time_raw || day.depart_time || '';
    if (displayed && estimated && displayed !== estimated) {
      warningCodes.add('departure_time_mismatch');
    }

    const items = Array.isArray(day.timeline_items)
      ? day.timeline_items
      : (Array.isArray(day.items) ? day.items : []);
    items.forEach((item) => {
      const itemType = item.item_type || item.type || '';
      if (itemType === 'flight' || item.flight_no || item.flight_number) {
        warningCodes.add('flight_segment_detected');
      }
    });
  });

  if (Array.isArray(trip.flights) && trip.flights.length) {
    warningCodes.add('flight_segment_detected');
  }

  return Array.from(warningCodes);
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

function validateDocuments(documents, errors) {
  validateArray(documents, '$.documents', errors);
  (documents || []).forEach((document, index) => {
    const path = `$.documents[${index}]`;
    if (!isPlainObject(document)) {
      errors.push(`${path} must be an object`);
      return;
    }
    requireString(document, 'title', path, errors);
    requireString(document, 'document_type', path, errors);
    if (typeof document.visible_to_customer !== 'boolean') {
      errors.push(`${path}.visible_to_customer must be boolean`);
    }
  });
}

function validateCanonicalTrip(trip) {
  const errors = [];
  if (!isPlainObject(trip)) {
    return ['payload must be a JSON object'];
  }

  [
    'schema_version',
    'external_trip_id',
    'trip_type',
    'title',
    'status',
    'city',
    'country',
    'timezone',
    'start_at',
    'end_at',
  ].forEach((key) => requireString(trip, key, '$', errors));

  if (trip.schema_version !== '1.0.0') errors.push('$.schema_version must be 1.0.0');
  validateStringEnum(trip, 'trip_type', CANONICAL_TRIP_TYPES, '$', errors);
  validateStringEnum(trip, 'status', CANONICAL_TRIP_STATUSES, '$', errors);

  if (!isValidDateTime(trip.start_at)) errors.push('$.start_at must be a valid date-time');
  if (!isValidDateTime(trip.end_at)) errors.push('$.end_at must be a valid date-time');
  if (isValidDateTime(trip.start_at) && isValidDateTime(trip.end_at) && new Date(trip.start_at).getTime() >= new Date(trip.end_at).getTime()) {
    errors.push('$.start_at must be before $.end_at');
  }

  if (!isPlainObject(trip.customer)) {
    errors.push('$.customer is required');
  } else {
    requireString(trip.customer, 'display_name', '$.customer', errors);
  }
  if (!isPlainObject(trip.source)) {
    errors.push('$.source is required');
  } else {
    requireString(trip.source, 'source_type', '$.source', errors);
  }
  if (!isPlainObject(trip.advisor)) {
    errors.push('$.advisor is required');
  } else {
    requireString(trip.advisor, 'name', '$.advisor', errors);
  }

  validateArray(trip.hotels, '$.hotels', errors);
  validateArray(trip.flights, '$.flights', errors);
  validateArray(trip.transfers, '$.transfers', errors);
  validateArray(trip.charter_services, '$.charter_services', errors);
  validateArray(trip.itinerary_days, '$.itinerary_days', errors);
  validateDocuments(trip.documents, errors);

  if (trip.trip_type === 'transfer') {
    if (!isPlainObject(trip.transfer)) {
      errors.push('$.transfer is required for transfer trips');
    } else {
      requireString(trip.transfer, 'pickup', '$.transfer', errors);
      requireString(trip.transfer, 'dropoff', '$.transfer', errors);
      requireString(trip.transfer, 'pickup_time_text', '$.transfer', errors);
    }
  }

  if (trip.trip_type === 'charter') {
    if (!isPlainObject(trip.charter)) {
      errors.push('$.charter is required for charter trips');
    } else {
      requireString(trip.charter, 'title', '$.charter', errors);
      requireString(trip.charter, 'vehicle_class', '$.charter', errors);
      requireString(trip.charter, 'service_area', '$.charter', errors);
      if (!Array.isArray(trip.charter.segments) || !trip.charter.segments.length) {
        errors.push('$.charter.segments must have at least one item');
      }
    }
  }

  if (trip.trip_type === 'mixed') {
    const hasMeaningfulSection = hasData(trip.transfer)
      || hasData(trip.charter)
      || hasData(trip.transfers)
      || hasData(trip.charter_services)
      || hasData(trip.hotels)
      || hasData(trip.flights)
      || hasData(trip.itinerary_days)
      || hasData(trip.documents);
    if (!hasMeaningfulSection) {
      errors.push('$.mixed trip must include at least one service section');
    }
  }

  return errors;
}

function parseTrip(input) {
  if (typeof input === 'string') {
    return JSON.parse(input);
  }
  return input;
}

function normalizeBindMode(access = {}) {
  if (access.bind_mode === 'farland_profile' || access.access_type === 'profile') return 'farland_profile';
  if (access.bind_mode === 'trip_only' || access.access_type === 'trip_only') return 'trip_only';
  return 'farland_profile';
}

function legacyAccessType(bindMode) {
  return bindMode === 'farland_profile' ? 'profile' : 'trip_only';
}

function defaultVisibleUntilFromEnd(endAt) {
  const end = new Date(endAt);
  if (Number.isNaN(end.getTime())) return '';
  return new Date(end.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeCanonicalTrip(trip, auth, now) {
  const transfer = isPlainObject(trip.transfer) ? trip.transfer : {};
  const charter = isPlainObject(trip.charter) ? trip.charter : {};
  const hotels = Array.isArray(trip.hotels) ? trip.hotels : [];
  const flights = Array.isArray(trip.flights) ? trip.flights : [];
  const transfers = Array.isArray(trip.transfers) ? trip.transfers : [];
  const charterServices = Array.isArray(trip.charter_services) ? trip.charter_services : [];
  const itineraryDays = Array.isArray(trip.itinerary_days) ? trip.itinerary_days : [];
  const documents = Array.isArray(trip.documents) ? trip.documents : [];
  const normalizedPayload = {
    schema_version: '1.0.0',
    external_trip_id: trip.external_trip_id,
    trip_id: trip.trip_id || trip.external_trip_id,
    trip_no: trip.trip_no || trip.external_trip_id,
    trip_type: trip.trip_type,
    customer_profile_id: trip.customer_profile_id || '',
    source_type: trip.source && trip.source.source_type ? trip.source.source_type : 'import_json',
    source_id: trip.source && trip.source.source_id ? trip.source.source_id : '',
    title: trip.title,
    city: trip.city,
    country: trip.country,
    timezone: trip.timezone,
    status: trip.status,
    status_text: trip.status_text || '',
    start_at: trip.start_at,
    end_at: trip.end_at,
    date_start: trip.start_at,
    date_end: trip.end_at,
    summary: trip.summary || '',
    customer: trip.customer || {},
    source: trip.source || { source_type: 'import_json' },
    transfer,
    transfers,
    charter,
    hotels,
    itinerary_days: itineraryDays,
    documents,
    flights,
    advisor: trip.advisor || {},
    hotel_requests: hotels,
    daily_itinerary: itineraryDays,
    charter_services: charterServices.length ? charterServices : (hasData(charter) ? [charter] : []),
  };
  const sourceHash = stableHash(normalizedPayload);
  return {
    ...normalizedPayload,
    source_hash: sourceHash,
    imported_by: auth.user._id,
    imported_by_openid: auth.openid,
    imported_at: now,
    updated_by: auth.user._id,
    updated_by_openid: auth.openid,
    updated_at: now,
  };
}

function buildCanonicalPreview(normalizedTrip) {
  return {
    trip_id: normalizedTrip.trip_id || normalizedTrip.external_trip_id,
    external_trip_id: normalizedTrip.external_trip_id,
    trip_type: normalizedTrip.trip_type,
    title: normalizedTrip.title,
    date_range: `${normalizedTrip.start_at || ''} - ${normalizedTrip.end_at || ''}`,
    customer_display_name: normalizedTrip.customer && normalizedTrip.customer.display_name ? normalizedTrip.customer.display_name : '',
    city: normalizedTrip.city,
    day_count: normalizedTrip.itinerary_days.length,
    hotel_count: normalizedTrip.hotels.length,
    transfer_count: hasData(normalizedTrip.transfer) ? 1 : 0,
    charter_count: hasData(normalizedTrip.charter) ? 1 : 0,
    document_count: normalizedTrip.documents.length,
  };
}

function reviewSeed(warningCodes = [], criticalWarningCodes = []) {
  return {
    review_status: 'pending_review',
    visibility_status: 'hidden',
    warning_codes: warningCodes,
    critical_warning_codes: criticalWarningCodes,
    published_version: 0,
  };
}

function lifecycleDataForCreate(warningCodes = [], criticalWarningCodes = []) {
  return {
    ...initialReviewFields(),
    warning_codes: warningCodes,
    critical_warning_codes: criticalWarningCodes,
  };
}

function lifecycleDataForUpdate(existingTrip, warningCodes = [], criticalWarningCodes = []) {
  return {
    review_status: existingTrip && existingTrip.published_version > 0 ? 'needs_review' : 'pending_review',
    visibility_status: (existingTrip && existingTrip.visibility_status) || 'hidden',
    warning_codes: warningCodes,
    critical_warning_codes: criticalWarningCodes,
    draft_snapshot: (existingTrip && existingTrip.draft_snapshot) || {},
    published_snapshot: (existingTrip && existingTrip.published_snapshot) || {},
    published_version: (existingTrip && existingTrip.published_version) || 0,
  };
}

function buildAccessData({ trip, access, user, request, auth, now }) {
  if (!user && !request) return null;
  const bindMode = normalizeBindMode(access);
  const accessType = legacyAccessType(bindMode);
  const openid = user ? user.openid : request.customer_openid;
  if (!openid) return null;
  const userId = user ? user._id : '';
  const tripId = trip.external_trip_id || trip.trip_id;
  const visibleUntil = bindMode === 'trip_only'
    ? String((access && access.visible_until) || defaultVisibleUntilFromEnd(trip.end_at || trip.date_end) || '')
    : '';
  return {
    openid,
    user_id: userId,
    customer_openid: openid,
    customer_user_id: userId,
    trip_id: tripId,
    request_id: access && access.request_id ? access.request_id : '',
    bind_mode: bindMode,
    access_type: accessType,
    visible_from: now,
    visible_until: visibleUntil,
    status: 'active',
    invite_id: access && access.invite_id ? access.invite_id : '',
    source_invite_id: access && access.source_invite_id ? access.source_invite_id : '',
    created_by: auth.user._id,
    created_by_openid: auth.openid,
    updated_at: now,
  };
}

async function resolveAccess(access = {}) {
  const userId = access.customer_user_id || access.user_id || '';
  if (!access || (!userId && !access.request_id)) {
    return { user: null, request: null };
  }
  if (userId) {
    const userRes = await db.collection('users').doc(userId).get().catch(() => null);
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

async function handleImportCustomerTripJSON(event = {}) {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) {
    return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
  }

  const dryRun = event.dry_run !== false;
  let trip;
  try {
    const rawInput = event.payload !== undefined
      ? event.payload
      : (event.trip_json !== undefined ? event.trip_json : event.trip);
    trip = parseTrip(rawInput);
  } catch (error) {
    return { success: false, code: 422, error_code: 'INVALID_JSON', message: 'JSON 格式无效' };
  }

  if (isPlainObject(trip) && Array.isArray(trip.trips)) {
    return {
      success: false,
      code: 422,
      error_code: 'BATCH_IMPORT_NOT_SUPPORTED_YET',
      message: '批量导入暂未开放，请一次导入一个行程',
    };
  }

  const blockedKey = findSensitiveKey(trip);
  if (blockedKey) {
    return {
      success: false,
      code: 422,
      error_code: 'SENSITIVE_FIELD_REJECTED',
      message: '导入内容包含客户不可见或内部敏感字段',
      blocked_key: blockedKey,
    };
  }

  const warnings = [];
  const isCanonical = isPlainObject(trip) && trip.schema_version === '1.0.0';
  if (isCanonical) {
    const validationErrors = validateCanonicalTrip(trip);
    if (validationErrors.length) {
      return {
        success: false,
        code: 422,
        error_code: 'SCHEMA_VALIDATION_FAILED',
        message: '行程 JSON 校验失败',
        errors: validationErrors,
      };
    }

    const now = new Date().toISOString();
    const normalizedTrip = normalizeCanonicalTrip(trip, auth, now);
    const warningCodes = collectTripWarningCodes(trip);
    const criticalWarningCodes = [];
    const existingTripRes = await db.collection('customer_trips')
      .where({ external_trip_id: normalizedTrip.external_trip_id })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const existingTrip = existingTripRes.data[0] || null;
    const action = existingTrip
      ? (existingTrip.source_hash === normalizedTrip.source_hash ? 'no_change' : 'update')
      : 'create';

    const accessResult = await resolveAccess(event.access || {});
    if (accessResult.error) {
      return { success: false, code: 422, error_code: 'ACCESS_VALIDATION_FAILED', message: accessResult.error };
    }
    const accessData = buildAccessData({
      trip: normalizedTrip,
      access: event.access || {},
      user: accessResult.user,
      request: accessResult.request,
      auth,
      now,
    });

    if (dryRun) {
      return {
        success: true,
        code: 0,
        dry_run: true,
        valid: true,
        preview_valid: true,
        can_apply: true,
        action,
        trip_id: normalizedTrip.trip_id,
        external_trip_id: normalizedTrip.external_trip_id,
        warnings,
        warning_codes: warningCodes,
        critical_warning_codes: criticalWarningCodes,
        preview: buildCanonicalPreview(normalizedTrip),
        normalized_preview: {
          trip_id: normalizedTrip.trip_id,
          external_trip_id: normalizedTrip.external_trip_id,
          trip_type: normalizedTrip.trip_type,
          title: normalizedTrip.title,
          status: normalizedTrip.status,
          start_at: normalizedTrip.start_at,
          end_at: normalizedTrip.end_at,
          customer_display_name: normalizedTrip.customer.display_name || '',
          source_hash: normalizedTrip.source_hash,
        },
        review_seed: reviewSeed(warningCodes, criticalWarningCodes),
        message: action === 'no_change' ? '行程内容未变化' : '',
      };
    }

    if (action === 'no_change') {
      const nextRoute = `/pages/operator/customer-home-preview/customer-home-preview?trip_id=${encodeURIComponent(normalizedTrip.trip_id)}&preview_access_mode=temporary_guest`;
      return {
        success: true,
        code: 0,
        dry_run: false,
        action: 'no_change',
        trip_id: normalizedTrip.trip_id,
        customer_trip_id: existingTrip._id,
        external_trip_id: normalizedTrip.external_trip_id,
        source_hash: normalizedTrip.source_hash,
        warnings,
        warning_codes: warningCodes,
        critical_warning_codes: criticalWarningCodes,
        review_status: existingTrip.review_status || 'pending_review',
        visibility_status: existingTrip.visibility_status || 'hidden',
        published_version: existingTrip.published_version || 0,
        next_route: nextRoute,
        message: '行程内容未变化',
      };
    }

    let tripDocId = existingTrip && existingTrip._id;
    if (existingTrip) {
      const { created_at, created_by, created_by_openid, ...updateData } = normalizedTrip;
      await db.collection('customer_trips').doc(existingTrip._id).update({
        data: {
          ...updateData,
          ...lifecycleDataForUpdate(existingTrip, warningCodes, criticalWarningCodes),
        },
      });
    } else {
      const addRes = await db.collection('customer_trips').add({
        data: {
          ...normalizedTrip,
          ...lifecycleDataForCreate(warningCodes, criticalWarningCodes),
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
        .where({ customer_openid: accessData.customer_openid, trip_id: accessData.trip_id })
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
      action: 'customer_trip_json_imported',
      target_type: 'customer_trip',
      target_id: tripDocId,
      detail: {
        external_trip_id: normalizedTrip.external_trip_id,
        action,
        trip_type: normalizedTrip.trip_type,
        source_hash: normalizedTrip.source_hash,
        access_id: accessId,
        warning_codes: warningCodes,
        critical_warning_codes: criticalWarningCodes,
      },
      created_at: now,
    }).catch(() => null);

    const nextRoute = `/pages/operator/customer-home-preview/customer-home-preview?trip_id=${encodeURIComponent(normalizedTrip.trip_id)}&preview_access_mode=temporary_guest`;
    return {
      success: true,
      code: 0,
      dry_run: false,
      action,
      trip_id: normalizedTrip.trip_id,
      customer_trip_id: tripDocId,
      external_trip_id: normalizedTrip.external_trip_id,
      source_hash: normalizedTrip.source_hash,
      warnings,
      warning_codes: warningCodes,
      critical_warning_codes: criticalWarningCodes,
      review_status: existingTrip && existingTrip.published_version > 0 ? 'needs_review' : 'pending_review',
      visibility_status: (existingTrip && existingTrip.visibility_status) || 'hidden',
      published_version: (existingTrip && existingTrip.published_version) || 0,
      customer_trip_access_id: accessId,
      next_route: nextRoute,
    };
  }

  warnings.push(LEGACY_WARNING);
  const validationErrors = validateTrip(trip);
  if (validationErrors.length) {
    return {
      success: false,
      code: 422,
      error_code: 'SCHEMA_VALIDATION_FAILED',
      message: '行程 JSON 校验失败',
      errors: validationErrors,
      warnings,
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
  const legacyWarningCodes = ['manual_review_required'];

  if (dryRun) {
    return {
      success: true,
      code: 0,
      dry_run: true,
      valid: true,
      preview_valid: true,
      can_apply: true,
      trip_id: trip.trip_id,
      action: existingTrip ? 'update' : 'create',
      warnings,
      warning_codes: legacyWarningCodes,
      critical_warning_codes: [],
      operations,
      review_seed: reviewSeed(legacyWarningCodes, []),
    };
  }

  const tripData = {
    ...trip,
    external_trip_id: trip.external_trip_id || trip.trip_id,
    trip_no: trip.trip_no || trip.trip_id,
    updated_by: auth.user._id,
    updated_by_openid: auth.openid,
    updated_at: now,
  };
  let tripDocId = existingTrip && existingTrip._id;
  if (existingTrip) {
    await db.collection('customer_trips').doc(existingTrip._id).update({
      data: {
        ...tripData,
        ...lifecycleDataForUpdate(existingTrip, legacyWarningCodes, []),
      },
    });
  } else {
    const addRes = await db.collection('customer_trips').add({
      data: {
        ...tripData,
        ...lifecycleDataForCreate(legacyWarningCodes, []),
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
      warnings,
      warning_codes: legacyWarningCodes,
    },
    created_at: now,
  }).catch(() => null);

  const nextRoute = `/pages/operator/customer-home-preview/customer-home-preview?trip_id=${encodeURIComponent(trip.trip_id)}&preview_access_mode=temporary_guest`;
  return {
    success: true,
    code: 0,
    dry_run: false,
    trip_id: trip.trip_id,
    customer_trip_id: tripDocId,
    customer_trip_access_id: accessId,
    warnings,
    warning_codes: legacyWarningCodes,
    critical_warning_codes: [],
    review_status: existingTrip && existingTrip.published_version > 0 ? 'needs_review' : 'pending_review',
    visibility_status: (existingTrip && existingTrip.visibility_status) || 'hidden',
    published_version: (existingTrip && existingTrip.published_version) || 0,
    operations,
    next_route: nextRoute,
  };
}

exports.main = async (event = {}) => {
  try {
    return await handleImportCustomerTripJSON(event);
  } catch (error) {
    console.error('[importCustomerTripJSON] failed', error);
    return {
      success: false,
      code: 500,
      error_code: 'IMPORT_CUSTOMER_TRIP_JSON_FAILED',
      message: '导入行程失败',
      error_message: error && error.message ? error.message : '',
      err_msg: error && error.errMsg ? error.errMsg : '',
    };
  }
};
