const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const CANCEL_REASON_TYPES = [
  'customer_cancelled',
  'customer_changed_plan',
  'request_info_changed',
  'vehicle_requirement_changed',
  'price_too_high',
  'handled_offline',
  'duplicate_request',
  'test_request',
  'other',
];

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

exports.main = async (event = {}) => {
  try {
    const operator = await getOperator();
    if (!operator) return { success: false, code: 403, message: '无权限访问' };

    const {
      request_id,
      cancel_reason_type,
      cancel_reason_driver,
      cancel_reason_internal = '',
    } = event;

    if (!request_id) return { success: false, code: 400, message: '缺少报价单 ID' };
    if (!CANCEL_REASON_TYPES.includes(cancel_reason_type)) return { success: false, code: 400, message: '请选择取消原因' };
    if (!cancel_reason_driver || !String(cancel_reason_driver).trim()) {
      return { success: false, code: 400, message: '请填写司机可见说明' };
    }

    const requestRes = await db.collection('ride_requests').doc(request_id).get().catch(() => null);
    const request = requestRes && requestRes.data;
    if (!request) return { success: false, code: 404, message: '报价单不存在' };
    if (request.status === 'cancelled') {
      return {
        success: true,
        code: 0,
        message: '报价单已取消',
        request: {
          status: request.status,
          cancel_reason_type: request.cancel_reason_type || '',
          cancel_reason_driver: request.cancel_reason_driver || '',
          cancel_reason_internal: request.cancel_reason_internal || '',
          cancelled_by: request.cancelled_by || '',
          cancelled_at: request.cancelled_at || '',
        },
      };
    }
    if (request.status === 'completed') return { success: false, code: 410, message: '已完成的报价单不能取消' };

    const now = new Date().toISOString();
    await db.collection('ride_requests').doc(request_id).update({
      data: {
        status: 'cancelled',
        cancel_reason_type,
        cancel_reason_driver: String(cancel_reason_driver).trim(),
        cancel_reason_internal: String(cancel_reason_internal || '').trim(),
        cancelled_by: operator._id,
        cancelled_at: now,
        updated_at: now,
      },
    });

    await db.collection('quote_invites').where({ request_id }).update({
      data: {
        status: 'cancelled',
        updated_at: now,
      },
    });

    return {
      success: true,
      code: 0,
      message: '报价单已取消',
      request: {
        status: 'cancelled',
        cancel_reason_type,
        cancel_reason_driver: String(cancel_reason_driver).trim(),
        cancel_reason_internal: String(cancel_reason_internal || '').trim(),
        cancelled_by: operator._id,
        cancelled_at: now,
      },
    };
  } catch (error) {
    return { success: false, message: '取消失败，请稍后重试' };
  }
};
