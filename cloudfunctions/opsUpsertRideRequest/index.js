const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const TERMINAL_STATUSES = ['assigned', 'confirmed', 'completed', 'settled', 'cancelled'];
// 司机已选定/派定的状态:此时 force_new_request 不得静默重发,须人工裁决(conflict_locked)
const DRIVER_COMMITTED_STATUSES = ['assigned', 'confirmed', 'completed', 'settled'];
const REQUIRED_FIELDS = [
  'ops_transfer_id',
  'service_type',
  'service_date',
  'pickup',
  'dropoff',
  'driver_region',
  'quote_deadline',
  'task_description',
];
const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;

function envValue(name) {
  return String((process.env && process.env[name]) || '').trim();
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function bool(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes';
}

function parseDriverRegions(value) {
  const values = Array.isArray(value) ? value : [value];
  const regions = [];
  values.forEach((item) => {
    text(item).split(/[\/,，;；|]/).forEach((part) => {
      const region = text(part);
      if (region && !regions.includes(region)) regions.push(region);
    });
  });
  return regions;
}

function buildRequestNo(now) {
  const date = now || new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `FR${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function normalizeHeaders(headers) {
  return Object.keys(headers || {}).reduce((acc, key) => {
    const value = headers[key];
    acc[String(key).toLowerCase()] = Array.isArray(value) ? value[0] : value;
    return acc;
  }, {});
}

function parseEvent(event) {
  const headers = normalizeHeaders((event && (event.headers || event.header)) || {});
  let rawBody = event && (event.rawBody || event.body);

  if (event && event.isBase64Encoded && typeof rawBody === 'string') {
    rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
  }

  if (rawBody == null && event && event.ops_transfer_id) {
    rawBody = JSON.stringify(event);
  }

  if (typeof rawBody !== 'string') {
    rawBody = JSON.stringify(rawBody || {});
  }

  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    const err = new Error('Invalid JSON body.');
    err.error_code = 'INVALID_JSON';
    err.code = 400;
    throw err;
  }

  return { headers, rawBody, payload };
}

function hmacSha256(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function createError(errorCode, message, code) {
  const error = new Error(message || errorCode);
  error.error_code = errorCode;
  error.code = code || 400;
  return error;
}

function verifyRequest(headers, rawBody) {
  const sharedSecret = envValue('OPS_SYNC_SHARED_SECRET') || envValue('MINIAPP_SYNC_SHARED_SECRET');
  if (!sharedSecret) {
    throw createError('CONFIG_MISSING', 'OPS_SYNC_SHARED_SECRET is not set.', 500);
  }

  const expectedAccessToken = envValue('OPS_SYNC_ACCESS_TOKEN') || envValue('TCB_ACCESS_TOKEN');
  if (expectedAccessToken) {
    const auth = text(headers.authorization || headers.Authorization);
    const received = auth.replace(/^Bearer\s+/i, '');
    if (!received || !safeEqual(received, expectedAccessToken)) {
      throw createError('UNAUTHORIZED', 'Bad sync access token.', 401);
    }
  }

  const timestamp = text(headers['x-ops-sync-timestamp']);
  const timestampMs = timestamp ? new Date(timestamp).getTime() : 0;
  if (!timestampMs || Number.isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    throw createError('BAD_TIMESTAMP', 'Sync timestamp is missing or expired.', 401);
  }

  const signature = text(headers['x-ops-sync-signature'] || headers['x-farland-signature']).replace(/^sha256=/i, '');
  // 时间戳纳入签名内容:否则截获一对 (body, signature) 可换新时间戳永久重放。
  // Web 侧须对 `${x-ops-sync-timestamp}.${rawBody}` 计算 HMAC。
  const expected = hmacSha256(sharedSecret, `${timestamp}.${rawBody}`);
  if (!signature || !safeEqual(signature, expected)) {
    throw createError('BAD_SIGNATURE', 'Bad sync signature.', 401);
  }
}

function validatePayload(payload) {
  const missing = REQUIRED_FIELDS.filter((field) => !text(payload[field]));
  if (missing.length) {
    const error = createError('VALIDATION_ERROR', 'Missing required sync fields.', 400);
    error.missing = missing;
    throw error;
  }
  if (!['transfer', 'charter'].includes(payload.service_type)) {
    throw createError('VALIDATION_ERROR', 'Invalid service_type.', 400);
  }
}

function buildRepushRequestId(opsTransferId, syncVersion, now) {
  const safeBase = (text(opsTransferId) || 'ops-transfer').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 84);
  const version = Number(syncVersion || 0);
  const suffix = version > 0 ? String(version) : String(now || '').replace(/\D/g, '').slice(2, 14);
  return `${safeBase}-r${suffix || Date.now()}`;
}

function toRideRequestData(payload, existing, now, meta = {}) {
  const requestNo = text(existing && existing.request_no) || buildRequestNo(new Date(now));
  const forceNewRequest = bool(payload.force_new_request) || bool(payload.force_reopen);
  const status = text(existing && existing.status) || 'quoting';
  const opsTripId = text(payload.ops_trip_id);
  const opsTransferId = text(payload.ops_transfer_id);
  const driverRegion = text(payload.driver_region);
  const driverRegions = parseDriverRegions([payload.driver_regions, driverRegion]);
  const dispatchNote = text(payload.dispatch_note);

  const data = {
    request_no: requestNo,
    service_type: text(payload.service_type),
    service_type_label: text(payload.service_type_label),
    task_title: text(payload.task_title),
    service_date: text(payload.service_date),
    driver_region: driverRegion || driverRegions[0] || '',
    driver_regions: driverRegions,
    task_description: text(payload.task_description),
    quote_deadline: text(payload.quote_deadline),
    dispatch_note: dispatchNote,
    special_requests: dispatchNote || text(payload.special_requests),
    internal_note: dispatchNote,
    status,
    pickup: text(payload.pickup),
    pickup_location: text(payload.pickup),
    dropoff: text(payload.dropoff),
    dropoff_location: text(payload.dropoff),
    waypoint: text(payload.waypoint),
    waypoint_wait_time: text(payload.waypoint_wait_time),
    route_text: text(payload.route_text),
    time_summary: text(payload.time_summary),
    flight_summary: text(payload.flight_summary),
    execution_note: text(payload.execution_note),
    pickup_time_text: text(payload.pickup_time_text),
    passengers: text(payload.passengers),
    estimated_drive_time: text(payload.estimated_drive_time),
    estimated_distance: text(payload.estimated_distance),
    preferred_vehicle_type: text(payload.preferred_vehicle_type),
    flight_no: text(payload.flight_no),
    terminal: text(payload.terminal),
    scheduled_flight_time: text(payload.scheduled_flight_time),
    driver_arrive_time: text(payload.driver_arrive_time),
    placard_needed: bool(payload.placard_needed),
    placard_name: text(payload.placard_name),
    um_needed: bool(payload.um_needed),
    customer_visible: bool(payload.customer_visible),
    force_new_request: forceNewRequest,
    force_reopen: false,
    trip_id: opsTripId,
    ops_trip_id: opsTripId,
    ops_transfer_id: opsTransferId,
    ops_target_request_id: text(payload.miniapp_request_id || payload.request_id) || opsTransferId,
    supersedes_request_id: text(meta.supersedesRequestId),
    created_from_cancelled_request_id: text(meta.supersedesRequestId),
    ops_source: 'cloudflare_ops',
    ops_sync_version: Number(payload.ops_sync_version || 1),
    ops_payload_hash: text(payload.ops_payload_hash),
    source_system: 'ops_sync',
    updated_at: now,
  };
  return data;
}

async function writeAuditLog(data) {
  return db.collection('audit_logs').add({
    data: {
      ...data,
      created_at: data.created_at || new Date().toISOString(),
    },
  }).catch(() => null);
}

async function retireCustomerVisibleQuoteSurface(requestId, now) {
  await Promise.all([
    db.collection('quote_invites').where({ request_id: requestId }).update({
      data: {
        status: 'cancelled',
        updated_at: now,
      },
    }).catch(() => null),
    db.collection('customer_transport_quotes')
      .where({ request_id: requestId, quote_status: _.in(['draft', 'published', 'viewed', 'selected']) })
      .update({
        data: {
          quote_status: 'cancelled',
          cancelled_reason: 'web_repush_created_new_request',
          customer_notice: '行程信息已更新，Farland 将重新发布用车方案。',
          customer_action_required: 'wait_for_new_quote',
          cancelled_at: now,
          updated_at: now,
        },
      }).catch(() => null),
  ]);
}

function workflowStatus(status) {
  return status === 'quoting' ? 'quoting' : status;
}

exports.main = async (event = {}) => {
  try {
    const { headers, rawBody, payload } = parseEvent(event);
    verifyRequest(headers, rawBody);
    validatePayload(payload);

    const opsTransferId = text(payload.ops_transfer_id);
    let requestId = text(payload.miniapp_request_id || payload.request_id) || opsTransferId;
    const now = new Date().toISOString();
    let docRef = db.collection('ride_requests').doc(requestId);
    let existingRes = await docRef.get().catch(() => null);
    let existing = existingRes && existingRes.data ? existingRes.data : null;

    const forceNewRequest = bool(payload.force_new_request) || bool(payload.force_reopen);
    const incomingVersion = Number(payload.ops_sync_version || 1);
    let supersedesRequestId = '';

    if (forceNewRequest) {
      // 终态保护:被替换请求若司机已选定/派定,force_new_request 不得静默重发,
      // 否则会杀掉客户已选中的报价面并生成重复请求。改为 conflict_locked 人工裁决。
      const supersededStatus = text(existing && existing.status);
      if (existing && DRIVER_COMMITTED_STATUSES.includes(supersededStatus)) {
        await writeAuditLog({
          actor_openid: '',
          actor_user_id: 'cloudflare_ops',
          actor_role: 'system',
          action: 'ops_sync_ride_request_conflict_locked',
          target_type: 'ride_request',
          target_id: requestId,
          related_request_id: requestId,
          detail: {
            ops_transfer_id: opsTransferId,
            superseded_request_id: requestId,
            superseded_status: supersededStatus,
            incoming_version: incomingVersion,
          },
          created_at: now,
        });
        return {
          success: false,
          ok: false,
          error: 'CONFLICT_LOCKED',
          error_code: 'CONFLICT_LOCKED',
          message: '原请求已进入派单流程（司机已选定），force_new_request 需人工裁决。',
          request_id: requestId,
          miniapp_request_id: requestId,
          request_no: existing.request_no || '',
          request_status: supersededStatus,
          driver_workflow_status: workflowStatus(supersededStatus),
        };
      }
      supersedesRequestId = requestId;
      requestId = buildRepushRequestId(opsTransferId, incomingVersion, now);
      docRef = db.collection('ride_requests').doc(requestId);
      existingRes = await docRef.get().catch(() => null);
      existing = existingRes && existingRes.data ? existingRes.data : null;
    }

    if (existing && TERMINAL_STATUSES.includes(existing.status)) {
      return {
        success: false,
        ok: false,
        error: 'TERMINAL_STATE',
        message: 'Ride request is already terminal; manual review required.',
        request_id: requestId,
        miniapp_request_id: requestId,
        request_no: existing.request_no || '',
        request_status: existing.status,
        driver_workflow_status: workflowStatus(existing.status || ''),
      };
    }

    const existingVersion = Number((existing && existing.ops_sync_version) || 0);
    const incomingHash = text(payload.ops_payload_hash);
    const existingHash = text(existing && existing.ops_payload_hash);

    if (existingVersion > incomingVersion) {
      return {
        success: false,
        ok: false,
        error: 'STALE_VERSION',
        message: 'Incoming sync version is older than the current ride request.',
        request_id: requestId,
        request_status: existing.status || '',
        current_version: existingVersion,
        incoming_version: incomingVersion,
      };
    }

    if (existing && existingVersion === incomingVersion && existingHash && incomingHash && existingHash !== incomingHash) {
      return {
        success: false,
        ok: false,
        error: 'VERSION_CONFLICT',
        message: 'Same sync version has a different payload hash.',
        request_id: requestId,
        request_status: existing.status || '',
        current_version: existingVersion,
        incoming_version: incomingVersion,
      };
    }

    // 同版本且非(hash 明确不同)→ 视为幂等,不重写。覆盖 hash 相等以及任一方缺 hash 的情况,
    // 避免"缺 hash 同版本"落到全量 update 而静默改写字段。
    if (existing && existingVersion === incomingVersion) {
      return {
        success: true,
        ok: true,
        code: 0,
        idempotent: true,
        request_id: requestId,
        miniapp_request_id: requestId,
        request_no: existing.request_no || '',
        request_status: existing.status || 'quoting',
        driver_workflow_status: workflowStatus(existing.status || 'quoting'),
        sync_version: existingVersion,
      };
    }

    const data = toRideRequestData(payload, existing, now, { supersedesRequestId });
    if (existing) {
      await docRef.update({ data });
    } else {
      await docRef.set({
        data: {
          ...data,
          created_by: 'cloudflare_ops',
          created_at: now,
        },
      });
    }
    if (supersedesRequestId) {
      // 旧 doc 打上 superseded 标记,避免运营视图继续把它当作在途请求
      await db.collection('ride_requests').doc(supersedesRequestId).update({
        data: { superseded_by_request_id: requestId, updated_at: now },
      }).catch(() => null);
      await retireCustomerVisibleQuoteSurface(supersedesRequestId, now);
    }

    await writeAuditLog({
      actor_openid: '',
      actor_user_id: 'cloudflare_ops',
      actor_role: 'system',
      action: existing ? 'ops_sync_ride_request_updated' : 'ops_sync_ride_request_created',
      target_type: 'ride_request',
      target_id: requestId,
      related_request_id: requestId,
      detail: {
        ops_transfer_id: opsTransferId,
        ops_trip_id: data.ops_trip_id,
        sync_version: data.ops_sync_version,
        source_system: data.source_system,
        force_new_request: forceNewRequest,
        supersedes_request_id: supersedesRequestId,
      },
      created_at: now,
    });

    return {
      success: true,
      ok: true,
      code: 0,
      request_id: requestId,
      miniapp_request_id: requestId,
      request_no: data.request_no,
      request_status: data.status,
      driver_workflow_status: workflowStatus(data.status),
      supersedes_request_id: supersedesRequestId,
      sync_version: data.ops_sync_version,
    };
  } catch (error) {
    return {
      success: false,
      ok: false,
      code: error.code || 500,
      error: error.error_code || 'OPS_UPSERT_RIDE_REQUEST_FAILED',
      error_code: error.error_code || 'OPS_UPSERT_RIDE_REQUEST_FAILED',
      message: error.message || '接送同步失败',
      missing: error.missing || undefined,
    };
  }
};
