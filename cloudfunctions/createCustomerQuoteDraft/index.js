const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter((item) => String(item || '').trim()).map((item) => String(item).trim());
  if (!value) return [];
  return String(value).split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

exports.main = async (event = {}) => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) return auth.response;

  const {
    request_id,
    driver_quote_id,
    title,
    operator_explanation,
    included_items,
    excluded_items,
    valid_until = '',
    is_recommended = false,
  } = event;

  if (!request_id || !driver_quote_id || !String(title || '').trim() || !String(operator_explanation || '').trim()) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '请填写客户可见标题和说明' };
  }

  const [quoteRes, requestRes] = await Promise.all([
    db.collection('driver_quotes').doc(driver_quote_id).get().catch(() => null),
    db.collection('ride_requests').doc(request_id).get().catch(() => null),
  ]);
  const quote = quoteRes && quoteRes.data;
  const request = requestRes && requestRes.data;

  if (!quote || quote.request_id !== request_id) {
    return { success: false, code: 404, error_code: 'NOT_FOUND', message: '司机报价不存在' };
  }
  if (!request) {
    return { success: false, code: 404, error_code: 'NOT_FOUND', message: '报价单不存在' };
  }
  if (quote.operator_review_status !== 'approved') {
    return { success: false, code: 409, error_code: 'STATE_CONFLICT', message: '请先审核通过该司机报价' };
  }
  if (['selected', 'rejected'].includes(quote.quote_status)) {
    return { success: false, code: 409, error_code: 'STATE_CONFLICT', message: '该报价已进入旧选择流程，不能生成客户报价草稿' };
  }

  const driverQuoteAmount = Number(quote.quote_price);
  if (!Number.isFinite(driverQuoteAmount) || driverQuoteAmount <= 0) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '司机报价金额无效' };
  }

  const now = new Date().toISOString();
  const farlandServiceFeeRate = 0.1;
  const farlandServiceFeeAmount = round2(driverQuoteAmount * farlandServiceFeeRate);
  const clientTotal = round2(driverQuoteAmount + farlandServiceFeeAmount);

  const existingRes = await db.collection('customer_transport_quotes')
    .where({ request_id, source_driver_quote_id: driver_quote_id })
    .limit(1)
    .get();
  const existing = existingRes.data[0];

  const draftData = {
    request_id,
    source_driver_quote_id: driver_quote_id,
    customer_openid: request.customer_openid || '',
    quote_status: 'draft',
    title: String(title).trim(),
    operator_explanation: String(operator_explanation).trim(),
    included_items: normalizeList(included_items),
    excluded_items: normalizeList(excluded_items),
    valid_until: valid_until || '',
    is_recommended: Boolean(is_recommended),
    driver_quote_amount: round2(driverQuoteAmount),
    farland_service_fee_rate: farlandServiceFeeRate,
    farland_service_fee_amount: farlandServiceFeeAmount,
    client_total: clientTotal,
    currency: quote.currency || 'USD',
    request_no_snapshot: request.request_no || '',
    service_date_snapshot: request.service_date || '',
    service_type_snapshot: request.service_type || '',
    driver_region_snapshot: request.driver_region || '',
    vehicle_type_snapshot: quote.vehicle_type_snapshot || '',
    vehicle_model_snapshot: quote.vehicle_model_snapshot || '',
    seats_snapshot: quote.seats_snapshot || 0,
    luggage_capacity_snapshot: quote.luggage_capacity_snapshot || 0,
    driver_name_snapshot: quote.driver_name_snapshot || '',
    updated_at: now,
  };

  let customerQuoteId = existing && existing._id;
  let action = 'customer_quote_draft_updated';
  if (existing) {
    await db.collection('customer_transport_quotes').doc(existing._id).update({ data: draftData });
  } else {
    const addRes = await db.collection('customer_transport_quotes').add({
      data: {
        ...draftData,
        created_by: auth.user._id,
        created_by_openid: auth.openid,
        created_at: now,
        published_by: '',
        published_by_openid: '',
        published_at: '',
      },
    });
    customerQuoteId = addRes._id;
    action = 'customer_quote_draft_created';
  }

  await db.collection('driver_quotes').doc(driver_quote_id).update({
    data: {
      latest_customer_quote_id: customerQuoteId,
      customer_quote_draft_count: 1,
      updated_at: now,
    },
  });
  await writeAuditLog(db, {
    actor_openid: auth.openid,
    actor_user_id: auth.user._id,
    actor_role: auth.user.role,
    action,
    target_type: 'customer_transport_quote',
    target_id: customerQuoteId,
    related_request_id: request_id,
    related_driver_quote_id: driver_quote_id,
    related_customer_quote_id: customerQuoteId,
    detail: {
      client_total: clientTotal,
      driver_quote_amount: round2(driverQuoteAmount),
      farland_service_fee_amount: farlandServiceFeeAmount,
    },
    created_at: now,
  });

  return {
    success: true,
    code: 0,
    customer_quote_id: customerQuoteId,
    quote_status: 'draft',
    client_total: clientTotal,
    client_visible_total: clientTotal,
  };
};
