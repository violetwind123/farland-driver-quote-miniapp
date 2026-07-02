const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ALLOWED_CONFIRM_STATUSES = ['quoting', 'quoted', 'customer_published', 'customer_selected', 'published'];
const TERMINAL_REJECT_STATUSES = ['cancelled', 'completed'];
const ASSIGNED_STATUSES = ['assigned', 'confirmed'];
const MAX_TRANSACTION_OPERATIONS = 100;

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
    error_code: error.error_code || '',
  };
}

function createStepError({ step, code = 500, error_code = 'SELECT_DRIVER_QUOTE_FAILED', message, detail = {} }) {
  const error = new Error(message || `选择失败：${step}`);
  error.failed_step = step;
  error.code = code;
  error.error_code = error_code;
  error.detail = detail;
  return error;
}

function requireStep(condition, payload) {
  if (!condition) throw createStepError(payload);
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

async function getTransportOrder(requestId) {
  const res = await db.collection('transport_orders').doc(requestId).get().catch(() => null);
  return res && res.data ? res.data : null;
}

function hasTransportOrderSnapshot(order) {
  if (!order) return false;
  return Boolean(
    order.request_id
    && order.order_status
    && (order.driver_name || order.driver_phone)
    && (order.vehicle_model || order.vehicle_type),
  );
}

function isSameAssignedQuote(request, quote) {
  const quoteId = quote && quote._id;
  if (!request || !quote) return false;
  if (request.selected_quote_id && request.selected_quote_id === quoteId) return true;
  return Boolean(!request.selected_quote_id && request.selected_driver_id && request.selected_driver_id === quote.driver_id);
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
    driverId: quote.driver_id || (driver && driver._id) || '',
    driverName: quote.driver_name_snapshot || (driver && (driver.display_name || driver.name)) || '',
    driverPhone: quote.driver_phone_snapshot || (driver && driver.phone) || '',
    vehicleType: quote.vehicle_type_snapshot || (vehicle && (vehicle.vehicle_type || vehicle.vehicle_class)) || '',
    vehicleModel: quote.vehicle_model_snapshot || (vehicle && vehicle.vehicle_model) || '',
    seats: Number(quote.seats_snapshot || (vehicle && vehicle.seats) || 0),
    luggageCapacity: Number(quote.luggage_capacity_snapshot || (vehicle && vehicle.luggage_capacity) || 0),
    plateNumber: quote.plate_number_snapshot || (vehicle && vehicle.plate_number) || '',
  };
}

function toTransportOrderData({ request, quote, customerQuote, resolved, operator, now, existingOrder }) {
  return {
    request_id: request._id,
    request_no: request.request_no || '',
    trip_id: request.trip_id || request.ops_trip_id || '',
    ops_transfer_id: request.ops_transfer_id || '',
    ops_trip_id: request.ops_trip_id || request.trip_id || '',
    ops_sync_version: Number(request.ops_sync_version || 0),
    source_system: request.source_system || '',
    customer_name: request.customer_name || '',
    customer_openid: request.customer_openid || '',
    customer_user_id: request.customer_user_id || '',
    quote_id: quote._id,
    driver_quote_id: quote._id,
    source_driver_quote_id: quote._id,
    customer_quote_id: (customerQuote && customerQuote._id) || request.customer_selected_quote_id || '',
    driver_id: resolved.driverId || '',
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
    snapshot_source: 'selectDriverQuote',
    snapshot_version: 1,
    created_at: (existingOrder && existingOrder.created_at) || now,
    updated_at: now,
  };
}

function validateRequestState(request, quote) {
  requireStep(request, {
    step: 'load_ride_request',
    code: 404,
    error_code: 'REQUEST_NOT_FOUND',
    message: '报价单不存在',
  });

  if (TERMINAL_REJECT_STATUSES.includes(request.status)) {
    throw createStepError({
      step: 'validate_request_state',
      code: request.status === 'cancelled' ? 410 : 409,
      error_code: request.status === 'cancelled' ? 'REQUEST_CANCELLED' : 'REQUEST_COMPLETED',
      message: request.status === 'cancelled' ? '当前报价单已取消，不能选择司机' : '当前报价单状态不能选择司机',
    });
  }

  if (ASSIGNED_STATUSES.includes(request.status)) {
    if (isSameAssignedQuote(request, quote)) return { assigned: true };
    throw createStepError({
      step: 'validate_request_state',
      code: 409,
      error_code: 'REQUEST_ALREADY_ASSIGNED',
      message: '司机已确认，不能选择其他司机',
    });
  }

  if (!ALLOWED_CONFIRM_STATUSES.includes(request.status || '')) {
    throw createStepError({
      step: 'validate_request_state',
      code: 409,
      error_code: 'REQUEST_STATUS_NOT_CONFIRMABLE',
      message: '当前报价单状态不能选择司机',
      detail: { request_status: request.status || '' },
    });
  }

  return { assigned: false };
}

function validateCustomerQuoteLink({ request, quote, customerQuote }) {
  if (!request.customer_selected_quote_id) return;
  if (!customerQuote || customerQuote._id !== request.customer_selected_quote_id) {
    throw createStepError({
      step: 'load_customer_quote',
      code: 409,
      error_code: 'CUSTOMER_QUOTE_DRIVER_MISMATCH',
      message: '客户选择的方案与当前司机报价不一致',
      detail: {
        customer_selected_quote_id: request.customer_selected_quote_id,
        related_customer_quote_id: customerQuote ? customerQuote._id : '',
        source_driver_quote_id: quote._id,
      },
    });
  }
}

async function loadInputs({ requestId, quoteId, stepRef }) {
  stepRef.value = 'load_driver_quote';
  const quoteRes = await db.collection('driver_quotes').doc(quoteId).get().catch(() => null);
  const quote = quoteRes && quoteRes.data;
  requireStep(quote && quote.request_id === requestId, {
    step: 'load_driver_quote',
    code: 404,
    error_code: 'DRIVER_QUOTE_NOT_FOUND',
    message: '报价不存在',
  });
  quote._id = quote._id || quoteId;
  requireStep(quote.quote_status !== 'rejected', {
    step: 'load_driver_quote',
    code: 409,
    error_code: 'DRIVER_QUOTE_REJECTED',
    message: '该报价已标记为未选中，不能选择',
  });

  stepRef.value = 'load_ride_request';
  const requestRes = await db.collection('ride_requests').doc(requestId).get().catch(() => null);
  const request = requestRes && requestRes.data;
  if (request) request._id = request._id || requestId;
  validateRequestState(request, quote);

  stepRef.value = 'load_customer_quote';
  const customerQuote = await getRelatedCustomerQuote({ requestId, quoteId });
  validateCustomerQuoteLink({ request, quote, customerQuote });

  stepRef.value = 'resolve_driver_vehicle';
  const [otherQuotesRes, existingOrder, resolved] = await Promise.all([
    db.collection('driver_quotes').where({ request_id: requestId }).get(),
    getTransportOrder(requestId),
    resolveDriverVehicle(quote),
  ]);

  const otherQuoteIds = (otherQuotesRes.data || [])
    .filter((item) => item._id && item._id !== quoteId)
    .map((item) => item._id);
  const requiredOps = 3 + otherQuoteIds.length;
  requireStep(requiredOps <= MAX_TRANSACTION_OPERATIONS, {
    step: 'update_driver_quotes',
    code: 409,
    error_code: 'TOO_MANY_DRIVER_QUOTES',
    message: '司机报价数量过多，无法一次性确认',
    detail: { driver_quote_count: otherQuoteIds.length + 1 },
  });

  return {
    quote,
    request,
    customerQuote,
    otherQuoteIds,
    existingOrder,
    resolved,
  };
}

function buildRequestAssignedData({ quote, resolved, operator, now }) {
  return {
    status: 'assigned',
    selected_quote_id: quote._id,
    selected_driver_id: resolved.driverId || quote.driver_id || '',
    selected_vehicle_id: resolved.vehicleId || '',
    assigned_at: now,
    assigned_by: operator._id || '',
    assigned_by_openid: operator.openid || '',
    updated_at: now,
  };
}

async function runTransactionConfirmation({ requestId, quoteId, transportOrderData, otherQuoteIds, operator, now, stepRef }) {
  const transaction = await db.startTransaction();
  try {
    const requestRef = transaction.collection('ride_requests').doc(requestId);
    const quoteRef = transaction.collection('driver_quotes').doc(quoteId);
    const [requestRes, quoteRes] = await Promise.all([requestRef.get(), quoteRef.get()]);
    const request = requestRes && requestRes.data;
    const quote = quoteRes && quoteRes.data;
    if (request) request._id = request._id || requestId;
    if (quote) quote._id = quote._id || quoteId;

    stepRef.value = 'validate_request_state';
    validateRequestState(request, quote);
    requireStep(quote && quote.request_id === requestId && quote.quote_status !== 'rejected', {
      step: 'load_driver_quote',
      code: 409,
      error_code: 'DRIVER_QUOTE_NOT_CONFIRMABLE',
      message: '该报价当前不能选择',
    });

    stepRef.value = 'save_transport_order';
    await transaction.collection('transport_orders').doc(requestId).set({
      data: transportOrderData,
    });
    stepRef.value = 'update_driver_quotes';
    await quoteRef.update({
      data: {
        quote_status: 'selected',
        selected_at: now,
        updated_at: now,
      },
    });
    for (const id of otherQuoteIds) {
      await transaction.collection('driver_quotes').doc(id).update({
        data: {
          quote_status: 'rejected',
          updated_at: now,
        },
      });
    }
    stepRef.value = 'update_ride_request';
    await requestRef.update({
      data: buildRequestAssignedData({ quote, resolved: {
        driverId: transportOrderData.driver_id,
        vehicleId: transportOrderData.vehicle_id,
      }, operator, now }),
    });
    await transaction.commit();
  } catch (error) {
    if (transaction && typeof transaction.rollback === 'function') {
      await transaction.rollback().catch(() => null);
    }
    throw error;
  }
}

async function runFailFastConfirmation({ requestId, quote, transportOrderData, otherQuoteIds, operator, now, stepRef }) {
  stepRef.value = 'save_transport_order';
  await db.collection('transport_orders').doc(requestId).set({ data: transportOrderData });

  stepRef.value = 'update_driver_quotes';
  await Promise.all([
    db.collection('driver_quotes').doc(quote._id).update({
      data: {
        quote_status: 'selected',
        selected_at: now,
        updated_at: now,
      },
    }),
    ...otherQuoteIds.map((id) => db.collection('driver_quotes').doc(id).update({
      data: {
        quote_status: 'rejected',
        updated_at: now,
      },
    })),
  ]);

  stepRef.value = 'update_ride_request';
  await db.collection('ride_requests').doc(requestId).update({
    data: buildRequestAssignedData({
      quote,
      resolved: {
        driverId: transportOrderData.driver_id,
        vehicleId: transportOrderData.vehicle_id,
      },
      operator,
      now,
    }),
  });
}

async function repairAssignedTransportOrder({ request, quote, customerQuote, resolved, operator, now, existingOrder, stepRef }) {
  stepRef.value = 'save_transport_order';
  const transportOrderData = toTransportOrderData({
    request,
    quote,
    customerQuote,
    resolved,
    operator,
    now,
    existingOrder,
  });
  await db.collection('transport_orders').doc(request._id).set({ data: transportOrderData });
  return transportOrderData;
}

async function writeSuccessAudits({ operator, requestId, quoteId, transportOrderId, resolved, now, repaired, transactionUsed }) {
  await Promise.all([
    writeAuditLog({
      actor_openid: operator.openid || '',
      actor_user_id: operator._id || '',
      actor_role: operator.role || 'operator',
      action: repaired ? 'transport_order_snapshot_repaired' : 'transport_order_snapshot_written',
      target_type: 'transport_order',
      target_id: transportOrderId,
      related_request_id: requestId,
      related_driver_quote_id: quoteId,
      detail: {
        request_id: requestId,
        quote_id: quoteId,
        transport_order_id: transportOrderId,
        driver_id: resolved.driverId || '',
        vehicle_id: resolved.vehicleId || '',
        driver_name: resolved.driverName,
        vehicle_model: resolved.vehicleModel,
        transaction_used: transactionUsed,
      },
      created_at: now,
    }),
    writeAuditLog({
      actor_openid: operator.openid || '',
      actor_user_id: operator._id || '',
      actor_role: operator.role || 'operator',
      action: 'select_driver_quote_success',
      target_type: 'ride_request',
      target_id: requestId,
      related_request_id: requestId,
      related_driver_quote_id: quoteId,
      detail: {
        request_id: requestId,
        quote_id: quoteId,
        transport_order_id: transportOrderId,
        driver_id: resolved.driverId || '',
        vehicle_id: resolved.vehicleId || '',
        driver_name: resolved.driverName,
        vehicle_model: resolved.vehicleModel,
        repaired: Boolean(repaired),
        transaction_used: transactionUsed,
      },
      created_at: now,
    }),
  ]);
}

exports.main = async (event = {}) => {
  const stepRef = { value: 'start' };
  let operator = null;
  const { request_id, quote_id } = event;
  const nowForError = new Date().toISOString();

  try {
    stepRef.value = 'auth_operator';
    operator = await getOperator();
    requireStep(operator, {
      step: 'auth_operator',
      code: 403,
      error_code: 'FORBIDDEN',
      message: '无权限访问',
    });
    requireStep(request_id && quote_id, {
      step: 'auth_operator',
      code: 400,
      error_code: 'VALIDATION_ERROR',
      message: '参数不完整',
    });

    const now = new Date().toISOString();
    const inputs = await loadInputs({ requestId: request_id, quoteId: quote_id, stepRef });
    const assignedState = validateRequestState(inputs.request, inputs.quote);

    if (assignedState.assigned && hasTransportOrderSnapshot(inputs.existingOrder)) {
      await writeSuccessAudits({
        operator,
        requestId: request_id,
        quoteId: quote_id,
        transportOrderId: request_id,
        resolved: inputs.resolved,
        now,
        repaired: false,
        transactionUsed: false,
      });
      return {
        success: true,
        code: 0,
        message: '司机已确认',
        request_id,
        quote_id,
        transport_order_id: request_id,
        transport_order_saved: true,
        driver_name: inputs.existingOrder.driver_name || inputs.resolved.driverName,
        vehicle_model: inputs.existingOrder.vehicle_model || inputs.resolved.vehicleModel,
        idempotent: true,
      };
    }

    if (assignedState.assigned) {
      const transportOrderData = await repairAssignedTransportOrder({
        request: inputs.request,
        quote: inputs.quote,
        customerQuote: inputs.customerQuote,
        resolved: inputs.resolved,
        operator,
        now,
        existingOrder: inputs.existingOrder,
        stepRef,
      });
      await writeSuccessAudits({
        operator,
        requestId: request_id,
        quoteId: quote_id,
        transportOrderId: request_id,
        resolved: inputs.resolved,
        now,
        repaired: true,
        transactionUsed: false,
      });
      return {
        success: true,
        code: 0,
        message: '已补全司机确认信息',
        request_id,
        quote_id,
        transport_order_id: request_id,
        transport_order_saved: true,
        driver_name: transportOrderData.driver_name,
        vehicle_model: transportOrderData.vehicle_model,
        repaired: true,
      };
    }

    const transportOrderData = toTransportOrderData({
      request: inputs.request,
      quote: inputs.quote,
      customerQuote: inputs.customerQuote,
      resolved: inputs.resolved,
      operator,
      now,
      existingOrder: inputs.existingOrder,
    });
    const transactionSupported = typeof db.startTransaction === 'function';
    if (transactionSupported) {
      stepRef.value = 'save_transport_order';
      await runTransactionConfirmation({
        requestId: request_id,
        quoteId: quote_id,
        transportOrderData,
        otherQuoteIds: inputs.otherQuoteIds,
        operator,
        now,
        stepRef,
      });
    } else {
      await runFailFastConfirmation({
        requestId: request_id,
        quote: inputs.quote,
        transportOrderData,
        otherQuoteIds: inputs.otherQuoteIds,
        operator,
        now,
        stepRef,
      });
    }

    await writeSuccessAudits({
      operator,
      requestId: request_id,
      quoteId: quote_id,
      transportOrderId: request_id,
      resolved: inputs.resolved,
      now,
      repaired: false,
      transactionUsed: transactionSupported,
    });

    return {
      success: true,
      code: 0,
      message: '已选择司机',
      request_id,
      quote_id,
      transport_order_id: request_id,
      transport_order_saved: true,
      driver_name: inputs.resolved.driverName,
      vehicle_model: inputs.resolved.vehicleModel,
      transaction_used: transactionSupported,
    };
  } catch (error) {
    const failedStep = error.failed_step || stepRef.value || 'start';
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
        failed_step: failedStep,
        error_message: error.message || '',
        error_code: error.error_code || error.code || '',
        request_id: request_id || '',
        quote_id: quote_id || '',
        error: errorDetail(error),
        detail: error.detail || {},
      },
      created_at: nowForError,
    });
    return {
      success: false,
      code: error.code || 500,
      error_code: error.error_code || 'SELECT_DRIVER_QUOTE_FAILED',
      failed_step: failedStep,
      message: error.message || `选择失败：${failedStep}`,
    };
  }
};
