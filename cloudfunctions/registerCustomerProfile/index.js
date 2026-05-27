const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return {
      success: false,
      code: 401,
      error_code: 'UNAUTHENTICATED',
      message: '无法识别用户身份',
    };
  }

  const now = new Date().toISOString();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const existing = userRes.data[0] || null;

  if (existing) {
    if (existing.role && existing.role !== 'customer') {
      return {
        success: false,
        code: 409,
        error_code: 'ROLE_CONFLICT',
        message: '当前微信已绑定其他 Farland 身份',
      };
    }
    await db.collection('users').doc(existing._id).update({
      data: {
        role: 'customer',
        status: existing.status || 'active',
        updated_at: now,
        last_login_at: now,
      },
    });
    return {
      success: true,
      code: 0,
      user_id: existing._id,
      bind_mode: 'farland_profile',
      message: '已注册',
    };
  }

  const created = await db.collection('users').add({
    data: {
      openid: OPENID,
      role: 'customer',
      status: 'active',
      name: 'Farland 客户',
      created_at: now,
      updated_at: now,
      last_login_at: now,
    },
  });

  await db.collection('audit_logs').add({
    data: {
      actor_openid: OPENID,
      actor_user_id: created._id,
      actor_role: 'customer',
      action: 'customer_profile_registered',
      target_type: 'user',
      target_id: created._id,
      detail: {
        source: 'customer_home',
      },
      created_at: now,
    },
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    user_id: created._id,
    bind_mode: 'farland_profile',
    message: '已注册',
  };
};
