async function requireRole(cloud, db, roles) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, code: 401, message: '无法识别用户身份' };

  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  if (!user || user.status !== 'active' || !roles.includes(user.role)) {
    return { ok: false, code: 403, message: '无权限访问' };
  }
  return { ok: true, openid: OPENID, user };
}

module.exports = { requireRole };
