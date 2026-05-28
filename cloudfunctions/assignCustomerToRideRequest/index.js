const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return null;
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role)
    ? { ...user, openid: OPENID }
    : null;
}

function customerName(customer) {
  return customer.display_name || customer.name || 'Farland 客户';
}

function accessDocId(requestId, customerUserId) {
  return `${requestId}_${customerUserId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
}

async function writeAuditLog(data) {
  return db.collection('audit_logs').add({
    data: {
      ...data,
      created_at: data.created_at || new Date().toISOString(),
    },
  }).catch(() => null);
}

async function revokePreviousPrimaryAccess({ requestId, customerUserId, now }) {
  const previousRes = await db.collection('customer_trip_access')
    .where({
      request_id: requestId,
      primary_customer: true,
      status: 'active',
    })
    .limit(20)
    .get()
    .catch(() => ({ data: [] }));

  await Promise.all((previousRes.data || [])
    .filter((access) => access.customer_user_id !== customerUserId && access.user_id !== customerUserId)
    .map((access) => {
      return db.collection('customer_trip_access').doc(access._id).update({
        data: {
          status: 'revoked',
          revoked_at: now,
          updated_at: now,
        },
      }).catch(() => null);
    }));
}

async function upsertCustomerTripAccess({ request, requestId, customer, operator, assignmentNote, now }) {
  const accessId = accessDocId(requestId, customer._id);
  const existingRes = await db.collection('customer_trip_access').doc(accessId).get().catch(() => null);
  const tripId = request.customer_trip_id || request.trip_id || requestId;
  const accessData = {
    request_id: requestId,
    trip_id: tripId,
    user_id: customer._id,
    openid: customer.openid,
    customer_user_id: customer._id,
    customer_openid: customer.openid,
    customer_profile_id: customer.customer_profile_id || '',
    bind_mode: 'farland_profile',
    access_type: 'profile',
    status: 'active',
    granted_source: 'operator_manual',
    visible_from: now,
    visible_until: '',
    primary_customer: true,
    assigned_by: operator._id,
    assigned_by_openid: operator.openid,
    assignment_note: assignmentNote,
    updated_at: now,
  };

  if (existingRes && existingRes.data) {
    await db.collection('customer_trip_access').doc(accessId).update({ data: accessData });
    return accessId;
  }

  await db.collection('customer_trip_access').doc(accessId).set({
    data: {
      ...accessData,
      created_at: now,
    },
  });
  return accessId;
}

exports.main = async (event = {}) => {
  const operator = await getOperator();
  if (!operator) {
    return { success: false, code: 403, error_code: 'FORBIDDEN', message: '无权限访问' };
  }

  const requestId = String(event.request_id || '').trim();
  const customerUserId = String(event.customer_user_id || '').trim();
  const assignmentNote = String(event.assignment_note || '').trim();
  if (!requestId || !customerUserId) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '缺少分配参数' };
  }

  const [requestRes, customerRes] = await Promise.all([
    db.collection('ride_requests').doc(requestId).get().catch(() => null),
    db.collection('users').doc(customerUserId).get().catch(() => null),
  ]);
  const request = requestRes && requestRes.data;
  const customer = customerRes && customerRes.data;
  if (!request) {
    return { success: false, code: 404, error_code: 'REQUEST_NOT_FOUND', message: '报价单不存在' };
  }
  if (!customer || customer.role !== 'customer' || customer.status !== 'active' || !customer.openid) {
    return { success: false, code: 422, error_code: 'INVALID_CUSTOMER', message: '请选择有效客户' };
  }
  if (['cancelled'].includes(request.status)) {
    return { success: false, code: 409, error_code: 'REQUEST_CANCELLED', message: '已取消的用车单不能分配客户' };
  }

  const now = new Date().toISOString();
  await revokePreviousPrimaryAccess({ requestId, customerUserId, now });
  const accessId = await upsertCustomerTripAccess({
    request,
    requestId,
    customer,
    operator,
    assignmentNote,
    now,
  });

  await db.collection('ride_requests').doc(requestId).update({
    data: {
      customer_user_id: customerUserId,
      customer_openid: customer.openid,
      customer_name: customerName(customer),
      customer_profile_id: customer.customer_profile_id || '',
      customer_assigned_at: now,
      customer_assigned_by: operator._id,
      updated_at: now,
    },
  });

  await writeAuditLog({
    actor_openid: operator.openid,
    actor_user_id: operator._id,
    actor_role: operator.role,
    action: 'operator_assigned_customer_to_request',
    target_type: 'ride_request',
    target_id: requestId,
    related_request_id: requestId,
    detail: {
      request_id: requestId,
      customer_user_id: customerUserId,
      customer_profile_id: customer.customer_profile_id || '',
      customer_trip_access_id: accessId,
      assignment_note: assignmentNote,
    },
    created_at: now,
  });

  return {
    success: true,
    code: 0,
    request_id: requestId,
    customer_user_id: customerUserId,
    customer_trip_access_id: accessId,
    assigned_customer: {
      user_id: customerUserId,
      display_name: customerName(customer),
      name: customer.name || customer.display_name || '',
      phone: customer.phone || '',
      wechat_id: customer.wechat_id || '',
      customer_profile_id: customer.customer_profile_id || '',
    },
  };
};
