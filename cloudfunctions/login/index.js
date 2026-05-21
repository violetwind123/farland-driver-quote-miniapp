const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function isOperatorRole(user) {
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role);
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, message: '无法获取用户身份' };

  const now = new Date().toISOString();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];

  if (!user) {
    return {
      success: false,
      message: '该入口仅限 Farland 运营使用，请联系管理员开通权限。',
    };
  }

  if (!isOperatorRole(user)) {
    return {
      success: false,
      message: '该入口仅限 Farland 运营使用，请联系管理员开通权限。',
    };
  }

  await db.collection('users').doc(user._id).update({
    data: { last_login_at: now, updated_at: now },
  });
  user.last_login_at = now;
  user.updated_at = now;

  return { success: true, user };
};
