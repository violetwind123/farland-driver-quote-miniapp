async function getCaller(cloud, db) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { openid: '', user: null };
  }

  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  return { openid: OPENID, user: userRes.data[0] || null };
}

module.exports = { getCaller };
