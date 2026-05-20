const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, message: '无法获取用户身份' };

  const now = new Date().toISOString();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  let user = userRes.data[0];

  if (!user) {
    const created = await db.collection('users').add({
      data: {
        openid: OPENID,
        role: 'driver',
        name: '',
        phone: '',
        status: 'active',
        driver_id: '',
        created_at: now,
        updated_at: now,
        last_login_at: now,
      },
    });
    user = {
      _id: created._id,
      openid: OPENID,
      role: 'driver',
      name: '',
      phone: '',
      status: 'active',
      driver_id: '',
      created_at: now,
      updated_at: now,
      last_login_at: now,
    };
  } else {
    await db.collection('users').doc(user._id).update({
      data: { last_login_at: now, updated_at: now },
    });
    user.last_login_at = now;
    user.updated_at = now;
  }

  return { success: true, user };
};
