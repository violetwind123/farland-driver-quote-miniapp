const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const SELECTABLE_QUOTE_STATUSES = ['published', 'viewed', 'selected'];

async function writeAuditLog(data) {
  await db.collection('audit_logs').add({
    data: {
      ...data,
      created_at: data.created_at || new Date().toISOString(),
    },
  }).catch(() => null);
}

function toTime(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isValidAccess(access, now) {
  if (!access || access.status !== 'active') return false;
  const visibleUntil = toTime(access.visible_until);
  return !visibleUntil || visibleUntil >= now.getTime();
}

function isInviteExpired(invite, now) {
  const expiresAt = toTime(invite && invite.expires_at);
  return Boolean(expiresAt && expiresAt < now.getTime());
}

async function findCustomerTripAccess({ openid, user_id, request_id }) {
  const queries = [
    db.collection('customer_trip_access')
      .where({ request_id, openid })
      .limit(10)
      .get()
      .catch(() => ({ data: [] })),
    db.collection('customer_trip_access')
      .where({ request_id, customer_openid: openid })
      .limit(10)
      .get()
      .catch(() => ({ data: [] })),
  ];
  if (user_id) {
    queries.push(
      db.collection('customer_trip_access')
        .where({ request_id, user_id })
        .limit(10)
        .get()
        .catch(() => ({ data: [] })),
      db.collection('customer_trip_access')
        .where({ request_id, customer_user_id: user_id })
        .limit(10)
        .get()
        .catch(() => ({ data: [] })),
    );
  }

  const results = await Promise.all(queries);
  const seen = {};
  return results.flatMap((res) => res.data || []).filter((access) => {
    const key = access._id || `${access.openid || access.customer_openid}-${access.request_id}`;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

async function verifyInviteAccess({ requestId, inviteCode, openid }) {
  if (!inviteCode) {
    return { ok: false, code: 403, error_code: 'NO_CUSTOMER_ACCESS', message: '请先确认查看方式' };
  }

  const inviteRes = await db.collection('customer_invites')
    .where({ request_id: requestId, invite_code: inviteCode })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const invite = inviteRes.data[0];
  if (!invite) {
    return { ok: false, code: 403, error_code: 'NO_CUSTOMER_ACCESS', message: '请先确认查看方式' };
  }
  if (isInviteExpired(invite, new Date()) || ['expired', 'revoked', 'cancelled'].includes(invite.status)) {
    return { ok: false, code: 403, error_code: 'NO_CUSTOMER_ACCESS', message: '请先确认查看方式' };
  }
  if (invite.status !== 'claimed') {
    return { ok: false, code: 428, error_code: 'SAVE_REQUIRED', message: '如需选择方案，请先保存到我的 Farland 行程' };
  }
  const claimedOpenid = String(invite.claimed_openid || '').trim();
  if (claimedOpenid !== openid) {
    return { ok: false, code: 428, error_code: 'SAVE_REQUIRED', message: '如需选择方案，请先保存到我的 Farland 行程' };
  }
  return { ok: true, source: 'migration_invite', invite };
}

async function verifyCustomerAccess({ requestId, inviteCode, openid, userId, request, now }) {
  const accessRows = await findCustomerTripAccess({ openid, user_id: userId, request_id: requestId });
  const validAccess = accessRows.find((access) => isValidAccess(access, now));
  if (validAccess) {
    return { ok: true, source: 'customer_trip_access', access: validAccess };
  }

  const expiredAccess = accessRows.find((access) => {
    if (!access || access.status !== 'active') return false;
    const visibleUntil = toTime(access.visible_until);
    return Boolean(visibleUntil && visibleUntil < now.getTime());
  });
  if (expiredAccess) {
    return {
      ok: false,
      code: 403,
      error_code: 'CUSTOMER_TRIP_ACCESS_EXPIRED',
      message: '该行程访问已失效',
    };
  }

  if (request.customer_openid === openid) {
    return { ok: true, source: 'migration_request_owner' };
  }

  return verifyInviteAccess({ requestId, inviteCode, openid });
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const { request_id, customer_quote_id, invite_code = '' } = event;
  if (!OPENID) return { success: false, code: 401, error_code: 'UNAUTHENTICATED', message: '无法识别用户身份' };
  if (!request_id || !customer_quote_id) return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '参数不完整' };

  const [requestRes, quoteRes, userRes] = await Promise.all([
    db.collection('ride_requests').doc(request_id).get().catch(() => null),
    db.collection('customer_transport_quotes').doc(customer_quote_id).get().catch(() => null),
    db.collection('users').where({ openid: OPENID }).limit(1).get().catch(() => ({ data: [] })),
  ]);
  const request = requestRes && requestRes.data;
  const quote = quoteRes && quoteRes.data;
  const user = userRes.data[0] || null;
  if (!request) return { success: false, code: 404, error_code: 'NOT_FOUND', message: '用车需求不存在' };
  if (!quote || quote.request_id !== request_id) {
    return { success: false, code: 404, error_code: 'QUOTE_NOT_FOUND', message: '报价方案不存在' };
  }

  const nowDate = new Date();
  const customerAccess = await verifyCustomerAccess({
    requestId: request_id,
    inviteCode: invite_code,
    openid: OPENID,
    userId: user ? user._id : '',
    request,
    now: nowDate,
  });
  if (!customerAccess.ok) {
    return {
      success: false,
      code: customerAccess.code,
      error_code: customerAccess.error_code,
      message: customerAccess.message,
    };
  }

  if (request.status === 'cancelled') {
    return { success: false, code: 410, error_code: 'REQUEST_CANCELLED', message: '该用车需求已取消' };
  }
  if (request.status === 'assigned') {
    return { success: false, code: 409, error_code: 'REQUEST_ALREADY_ASSIGNED', message: '司机已确认，无需重复选择' };
  }
  if (!SELECTABLE_QUOTE_STATUSES.includes(quote.quote_status)) {
    return { success: false, code: 409, error_code: 'QUOTE_NOT_SELECTABLE', message: '该报价方案当前不可选择' };
  }

  const now = nowDate.toISOString();
  const selectedQuoteRes = await db.collection('customer_transport_quotes')
    .where({ request_id, quote_status: 'selected' })
    .limit(100)
    .get();

  await Promise.all([
    db.collection('customer_transport_quotes').doc(customer_quote_id).update({
      data: {
        quote_status: 'selected',
        selected_by_openid: OPENID,
        selected_at: now,
        updated_at: now,
      },
    }),
    ...(selectedQuoteRes.data || [])
      .filter((item) => item._id !== customer_quote_id)
      .map((item) => db.collection('customer_transport_quotes').doc(item._id).update({
        data: {
          quote_status: 'published',
          selected_by_openid: '',
          selected_at: '',
          updated_at: now,
        },
      })),
  ]);

  await writeAuditLog({
    actor_openid: OPENID,
    actor_user_id: user ? user._id : '',
    actor_role: 'customer',
    action: 'customer_quote_selected',
    target_type: 'customer_transport_quote',
    target_id: customer_quote_id,
    related_request_id: request_id,
    related_driver_quote_id: quote.source_driver_quote_id || '',
    related_customer_quote_id: customer_quote_id,
    detail: {
      source_driver_quote_id: quote.source_driver_quote_id || '',
      client_total: quote.client_total,
      access_source: customerAccess.source || '',
      customer_trip_access_id: customerAccess.access ? customerAccess.access._id : '',
    },
    created_at: now,
  });

  return {
    success: true,
    code: 0,
    request_id,
    customer_quote_id,
    quote_status: 'selected',
    message: '已选择该司机，等待 Farland 确认司机是否可接单',
  };
};
