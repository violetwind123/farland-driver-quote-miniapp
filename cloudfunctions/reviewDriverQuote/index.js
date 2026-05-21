const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event = {}) => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) return auth.response;

  const {
    request_id,
    driver_quote_id,
    action,
    review_note = '',
    rejection_reason = '',
  } = event;

  if (!request_id || !driver_quote_id || !['approve', 'reject'].includes(action)) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '参数不完整' };
  }
  if (action === 'reject' && !String(rejection_reason).trim()) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '请填写拒绝原因' };
  }

  const quoteRes = await db.collection('driver_quotes').doc(driver_quote_id).get().catch(() => null);
  const quote = quoteRes && quoteRes.data;
  if (!quote || quote.request_id !== request_id) {
    return { success: false, code: 404, error_code: 'NOT_FOUND', message: '司机报价不存在' };
  }

  const now = new Date().toISOString();
  const operatorReviewStatus = action === 'approve' ? 'approved' : 'rejected';
  const updateData = {
    operator_review_status: operatorReviewStatus,
    operator_review_note: review_note || '',
    operator_rejection_reason: action === 'reject' ? rejection_reason : '',
    operator_reviewed_by: auth.user._id,
    operator_reviewed_by_openid: auth.openid,
    operator_reviewed_at: now,
    updated_at: now,
  };

  await db.collection('driver_quotes').doc(driver_quote_id).update({ data: updateData });

  let cancelledCustomerQuoteIds = [];
  if (action === 'reject') {
    const customerQuoteRes = await db.collection('customer_transport_quotes')
      .where({ request_id, source_driver_quote_id: driver_quote_id })
      .limit(20)
      .get()
      .catch(() => ({ data: [] }));
    const cancellable = (customerQuoteRes.data || []).filter((quote) => {
      return ['draft', 'published', 'selected'].includes(quote.quote_status);
    });
    cancelledCustomerQuoteIds = cancellable.map((quote) => quote._id);
    await Promise.all(cancellable.map((quote) => db.collection('customer_transport_quotes').doc(quote._id).update({
      data: {
        quote_status: 'cancelled',
        cancelled_reason: rejection_reason,
        customer_notice: quote.quote_status === 'selected'
          ? '司机因个人行程调整无法接待，Farland 已为您补偿20元，请您重新选择司机。'
          : '',
        customer_action_required: quote.quote_status === 'selected' ? 'reselect_driver' : '',
        cancelled_by: auth.user._id,
        cancelled_by_openid: auth.openid,
        cancelled_at: now,
        updated_at: now,
      },
    })));
  }

  await writeAuditLog(db, {
    actor_openid: auth.openid,
    actor_user_id: auth.user._id,
    actor_role: auth.user.role,
    action: action === 'approve' ? 'driver_quote_review_approved' : 'driver_quote_review_rejected',
    target_type: 'driver_quote',
    target_id: driver_quote_id,
    related_request_id: request_id,
    related_driver_quote_id: driver_quote_id,
    detail: {
      operator_review_status: operatorReviewStatus,
      review_note: review_note || '',
      rejection_reason: action === 'reject' ? rejection_reason : '',
      cancelled_customer_quote_ids: cancelledCustomerQuoteIds,
    },
    created_at: now,
  });

  return {
    success: true,
    code: 0,
    driver_quote_id,
    operator_review_status: operatorReviewStatus,
    cancelled_customer_quote_ids: cancelledCustomerQuoteIds,
  };
};
