const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event = {}) => {
  const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
  if (!auth.ok) return auth.response;

  const { request_id } = event;
  if (!request_id) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '缺少 request_id' };
  }

  const requestRes = await db.collection('ride_requests').doc(request_id).get().catch(() => null);
  if (!requestRes || !requestRes.data) {
    return { success: false, code: 404, error_code: 'NOT_FOUND', message: '报价单不存在' };
  }

  const draftRes = await db.collection('customer_transport_quotes')
    .where({ request_id, quote_status: 'draft' })
    .limit(20)
    .get();
  const drafts = draftRes.data || [];
  if (!drafts.length) {
    return { success: false, code: 409, error_code: 'STATE_CONFLICT', message: '没有可发布的客户报价草稿' };
  }

  const now = new Date().toISOString();
  await Promise.all(drafts.map((quote) => db.collection('customer_transport_quotes').doc(quote._id).update({
    data: {
      quote_status: 'published',
      published_by: auth.user._id,
      published_by_openid: auth.openid,
      published_at: now,
      updated_at: now,
    },
  })));

  await writeAuditLog(db, {
    actor_openid: auth.openid,
    actor_user_id: auth.user._id,
    actor_role: auth.user.role,
    action: 'customer_quotes_published',
    target_type: 'ride_request',
    target_id: request_id,
    related_request_id: request_id,
    detail: {
      published_count: drafts.length,
      customer_quote_ids: drafts.map((quote) => quote._id),
    },
    created_at: now,
  });

  return {
    success: true,
    code: 0,
    request_id,
    published_count: drafts.length,
    published_ids: drafts.map((quote) => quote._id),
  };
};
