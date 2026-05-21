async function getCaller(cloud, db) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { openid: '', user: null };
  }

  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  return { openid: OPENID, user: userRes.data[0] || null };
}

function isOperator(user) {
  return Boolean(user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role));
}

module.exports = { getCaller, isOperator };
