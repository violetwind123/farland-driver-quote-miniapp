const cloud = require('wx-server-sdk');
const { requireRole } = require('./lib/auth');
const { writeAuditLog } = require('./lib/audit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function generateInviteCode() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FL${time}${random}`;
}

exports.main = async (event = {}) => {
  try {
    const auth = await requireRole(cloud, db, ['operator', 'super_admin']);
    if (!auth.ok) {
      return { success: false, code: auth.code, error_code: 'FORBIDDEN', message: auth.message };
    }

    const {
      request_id,
      customer_name = 'Farland Customer',
      customer_phone = '',
      expires_in_days = 7,
    } = event;

    if (!request_id) {
      return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: '缺少 request_id' };
    }

    const requestRes = await db.collection('ride_requests').doc(request_id).get().catch(() => null);
    if (!requestRes || !requestRes.data) {
      return { success: false, code: 404, error_code: 'NOT_FOUND', message: '报价单不存在' };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const safeDays = Math.max(1, Math.min(Number(expires_in_days || 7), 30));
    const expiresAt = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);

    let inviteCode = generateInviteCode();
    const existingInviteRes = await db.collection('customer_invites')
      .where({ request_id, status: 'unused' })
      .orderBy('created_at', 'desc')
      .limit(10)
      .get();
    const existingInvite = (existingInviteRes.data || []).find((item) => {
      const itemExpiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at);
      return !itemExpiresAt || Number.isNaN(itemExpiresAt.getTime()) || itemExpiresAt.getTime() >= now.getTime();
    });
    if (existingInvite) {
      const existingPath = `/pages/customer/home/home?invite_code=${encodeURIComponent(existingInvite.invite_code)}&request_id=${encodeURIComponent(request_id)}`;
      return {
        success: true,
        code: 0,
        invite_id: existingInvite._id,
        invite_code: existingInvite.invite_code,
        invite_link: existingPath,
        path: existingPath,
        expires_at: existingInvite.expires_at instanceof Date ? existingInvite.expires_at.toISOString() : existingInvite.expires_at,
        reused: true,
      };
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await db.collection('customer_invites').where({ invite_code: inviteCode }).limit(1).get();
      if (!existing.data.length) break;
      inviteCode = generateInviteCode();
    }

    const inviteData = {
      invite_code: inviteCode,
      request_id,
      customer_name: String(customer_name || '').trim(),
      customer_phone: String(customer_phone || '').trim(),
      status: 'unused',
      expires_at: expiresAt,
      claimed_openid: '',
      claimed_at: '',
      created_by: auth.user._id,
      created_by_openid: auth.openid,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const addRes = await db.collection('customer_invites').add({ data: inviteData });
    const inviteLink = `/pages/customer/home/home?invite_code=${encodeURIComponent(inviteCode)}&request_id=${encodeURIComponent(request_id)}`;

    await writeAuditLog(db, {
      actor_openid: auth.openid,
      actor_user_id: auth.user._id,
      actor_role: auth.user.role,
      action: 'customer_invite_created',
      target_type: 'customer_invite',
      target_id: addRes._id,
      related_request_id: request_id,
      detail: {
        customer_name: inviteData.customer_name,
        customer_phone: inviteData.customer_phone,
        invite_code: inviteCode,
        expires_at: expiresAt.toISOString(),
      },
      created_at: nowIso,
    }).catch(() => null);

    return {
      success: true,
      code: 0,
      invite_id: addRes._id,
      invite_code: inviteCode,
      invite_link: inviteLink,
      path: inviteLink,
      expires_at: expiresAt.toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      code: 500,
      error_code: 'CREATE_CUSTOMER_INVITE_FAILED',
      message: error && error.message ? error.message : '客户链接生成失败',
      errMsg: error && error.errMsg ? error.errMsg : '',
    };
  }
};
