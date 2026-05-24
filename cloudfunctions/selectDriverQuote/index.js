const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const BLOCKED_CONFIRM_STATUSES = ['cancelled', 'completed', 'assigned', 'confirmed'];

async function writeAuditLog(data) {
  return db.collection('audit_logs').add({
    data: {
      ...data,
      created_at: data.created_at || new Date().toISOString(),
    },
  }).catch(() => null);
}

function errorDetail(error) {
  if (!error) return {};
  return {
    message: error.message || '',
    errMsg: error.errMsg || '',
    code: error.code || '',
  };
}

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

async function getRelatedCustomerQuote({ requestId, quoteId }) {
  const res = await db.collection('customer_transport_quotes')
    .where({ request_id: requestId, source_driver_quote_id: quoteId })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return res.data && res.data[0] ? res.data[0] : null;
}

async function resolveDriverVehicle(quote) {
  let driver = null;
  let vehicle = null;
  let vehicleId = quote.vehicle_id || '';

  if (quote.driver_id) {
    const driverRes = await db.collection('drivers').doc(quote.driver_id).get().catch(() => null);
    driver = driverRes && driverRes.data ? driverRes.data : null;
  }

  if (!vehicleId && driver && driver.default_vehicle_id) {
    vehicleId = driver.default_vehicle_id;
  }

  if (vehicleId) {
    const vehicleRes = await db.collection('vehicles').doc(vehicleId).get().catch(() => null);
    vehicle = vehicleRes && vehicleRes.data ? vehicleRes.data : null;
  }

  return {
    driver,
    vehicle,
    vehicleId,
    driverName: quote.driver_name_snapshot || (driver && driver.name) || '',
    driverPhone: quote.driver_phone_snapshot || (driver && driver.phone) || '',
    vehicleType: quote.vehicle_type_snapshot || (vehicle && vehicle.vehicle_type) || '',
    vehicleModel: quote.vehicle_model_snapshot || (vehicle && vehicle.vehicle_model) || '',
    seats: Number(quote.seats_snapshot || (vehicle && vehicle.seats) || 0),
    luggageCapacity: Number(quote.luggage_capacity_snapshot || (vehicle && vehicle.luggage_capacity) || 0),
    plateNumber: quote.plate_number_snapshot || (vehicle && vehicle.plate_number) || '',
  };
}

function toTransportOrderData({ request, quote, customerQuote, resolved, operator, now }) {
  return {
    request_id: request._id,
    request_no: request.request_no || '',
    customer_name: request.customer_name || '',
    customer_openid: request.customer_openid || '',
    customer_user_id: request.customer_user_id || '',
    quote_id: quote._id,
    driver_quote_id: quote._id,
    source_driver_quote_id: quote._id,
    customer_quote_id: (customerQuote && customerQuote._id) || request.customer_selected_quote_id || '',
    driver_id: quote.driver_id || '',
    vehicle_id: resolved.vehicleId || '',
    order_status: 'assigned',
    driver_name: resolved.driverName,
    driver_phone: resolved.driverPhone,
    vehicle_type: resolved.vehicleType,
    vehicle_model: resolved.vehicleModel,
    seats: resolved.seats,
    luggage_capacity: resolved.luggageCapacity,
    plate_number: resolved.plateNumber,
    pickup: request.pickup || request.pickup_location || '',
    dropoff: request.dropoff || request.dropoff_location || '',
    pickup_time_text: request.pickup_time_text || request.pickup_time || request.service_date || '',
    service_date: request.service_date || '',
    service_type: request.service_type || '',
    assigned_at: now,
    assigned_by: operator._id || '',
    assigned_by_openid: operator.openid || '',
    updated_at: now,
  };
}

async function saveTransportOrder(data, now) {
  const existingRes = await db.collection('transport_orders')
    .where({ request_id: data.request_id })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const existing = existingRes.data && existingRes.data[0];
  if (existing) {
    await db.collection('transport_orders').doc(existing._id).update({
      data,
    });
    return existing._id;
  }
  const created = await db.collection('transport_orders').add({
    data: {
      ...data,
      created_at: now,
    },
  });
  return created._id;
}

exports.main = async (event = {}) => {
  let step = 'start';
  let operator = null;
  const { request_id, quote_id } = event;
  const nowForError = new Date().toISOString();

  try {
    step = 'auth_operator';
    operator = await getOperator();
    if (!operator) return { success: false, code: 403, message: '无权限访问' };
    if (!request_id || !quote_id) return { success: false, code: 400, message: '参数不完整' };

    step = 'load_driver_quote';
    const quoteRes = await db.collection('driver_quotes').doc(quote_id).get().catch(() => null);
    const quote = quoteRes && quoteRes.data;
    if (!quote || quote.request_id !== request_id) return { success: false, code: 404, message: '报价不存在' };
    if (quote.quote_status === 'rejected') return { success: false, code: 400, message: '该报价已标记为未选中，不能选择' };

    step = 'load_ride_request';
    const requestRes = await db.collection('ride_requests').doc(request_id).get().catch(() => null);
    const request = requestRes && requestRes.data;
    if (!request) return { success: false, code: 404, message: '报价单不存在' };
    if (request.status === 'cancelled') {
      return { success: false, code: 410, message: '当前报价单已取消，不能选择司机' };
    }
    if (request.status === 'assigned' || request.status === 'confirmed') {
      return { success: false, code: 409, message: '司机已确认，无需重复选择' };
    }
    if (request.status === 'completed') {
      return { success: false, code: 410, message: '当前报价单状态不能选择司机' };
    }
    if (BLOCKED_CONFIRM_STATUSES.includes(request.status)) {
      return { success: false, code: 410, message: '当前报价单状态不能选择司机' };
    }

    const now = new Date().toISOString();
    step = 'load_related_quotes';
    const [otherQuotesRes, customerQuote] = await Promise.all([
      db.collection('driver_quotes').where({ request_id }).get(),
      getRelatedCustomerQuote({ requestId: request_id, quoteId: quote_id }),
    ]);

    step = 'resolve_driver_vehicle';
    const resolved = await resolveDriverVehicle(quote);
    const transportOrderData = toTransportOrderData({ request, quote, customerQuote, resolved, operator, now });

    step = 'save_transport_order';
    const transportOrderId = await saveTransportOrder(transportOrderData, now);

    step = 'update_selection_records';
    await Promise.all([
      db.collection('driver_quotes').doc(quote_id).update({
        data: {
          quote_status: 'selected',
          selected_at: now,
          updated_at: now,
        },
      }),
      ...otherQuotesRes.data.filter((item) => item._id !== quote_id).map((item) => db.collection('driver_quotes').doc(item._id).update({
        data: {
          quote_status: 'rejected',
          updated_at: now,
        },
      })),
      db.collection('ride_requests').doc(request_id).update({
        data: {
          status: 'assigned',
          selected_quote_id: quote_id,
          selected_driver_id: quote.driver_id,
          selected_vehicle_id: resolved.vehicleId,
          assigned_at: now,
          assigned_by: operator._id || '',
          assigned_by_openid: operator.openid || '',
          updated_at: now,
        },
      }),
    ]);

    return {
      success: true,
      code: 0,
      message: '已选择司机',
      request_id,
      quote_id,
      transport_order_id: transportOrderId,
      driver_name: resolved.driverName,
      vehicle_model: resolved.vehicleModel,
    };
  } catch (error) {
    await writeAuditLog({
      actor_openid: operator ? operator.openid : '',
      actor_user_id: operator ? operator._id : '',
      actor_role: operator ? operator.role : 'operator',
      action: 'select_driver_quote_failed',
      target_type: 'ride_request',
      target_id: request_id || '',
      related_request_id: request_id || '',
      related_driver_quote_id: quote_id || '',
      detail: {
        step,
        error: errorDetail(error),
      },
      created_at: nowForError,
    });
    return {
      success: false,
      code: 500,
      error_code: 'SELECT_DRIVER_QUOTE_FAILED',
      failed_step: step,
      message: `选择失败：${step}`,
    };
  }
};
