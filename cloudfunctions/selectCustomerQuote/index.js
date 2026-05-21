const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function writeAuditLog(data) {
  await db.collection('audit_logs').add({
    data: {
      ...data,
      created_at: data.created_at || new Date().toISOString(),
    },
  }).catch(() => null);
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const { request_id, customer_quote_id, invite_code = '' } = event;
  if (!OPENID) return { success: false, code: 401, message: '无法识别用户身份' };
  if (!request_id || !customer_quote_id) return { success: false, code: 422, message: '参数不完整' };

  const [requestRes, quoteRes] = await Promise.all([
    db.collection('ride_requests').doc(request_id).get().catch(() => null),
    db.collection('customer_transport_quotes').doc(customer_quote_id).get().catch(() => null),
  ]);
  const request = requestRes && requestRes.data;
  const quote = quoteRes && quoteRes.data;
  if (!request) return { success: false, code: 404, message: '用车需求不存在' };
  if (!quote || quote.request_id !== request_id) return { success: false, code: 404, message: '报价方案不存在' };

  let customerOpenid = request.customer_openid || '';
  if (!customerOpenid && invite_code) {
    const inviteRes = await db.collection('customer_invites')
      .where({ request_id, invite_code })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const invite = inviteRes.data[0];
    if (invite && (invite.status === 'unused' || (invite.status === 'claimed' && invite.claimed_openid === OPENID))) {
      const nowBind = new Date().toISOString();
      customerOpenid = OPENID;
      await Promise.all([
        db.collection('ride_requests').doc(request_id).update({
          data: {
            customer_openid: OPENID,
            customer_name: request.customer_name || invite.customer_name || '',
            customer_phone: request.customer_phone || invite.customer_phone || '',
            updated_at: nowBind,
          },
        }).catch(() => null),
        db.collection('customer_invites').doc(invite._id).update({
          data: {
            status: 'claimed',
            claimed_openid: OPENID,
            claimed_at: invite.claimed_at || nowBind,
            updated_at: nowBind,
          },
        }).catch(() => null),
      ]);
    }
  }

  if (customerOpenid !== OPENID) return { success: false, code: 403, message: '无权限选择该方案' };
  if (request.status === 'cancelled') return { success: false, code: 410, message: '该用车需求已取消' };
  if (request.status === 'assigned') return { success: false, code: 409, message: '司机已确认，无需重复选择' };
  if (quote.quote_status !== 'published' && quote.quote_status !== 'selected') {
    return { success: false, code: 409, message: '该报价方案当前不可选择' };
  }

  const now = new Date().toISOString();
  const sameRequestRes = await db.collection('customer_transport_quotes')
    .where({ request_id })
    .limit(20)
    .get();

  await Promise.all((sameRequestRes.data || []).map((item) => {
    if (item._id === customer_quote_id) {
      return db.collection('customer_transport_quotes').doc(item._id).update({
        data: {
          quote_status: 'selected',
          selected_by_openid: OPENID,
          selected_at: now,
          updated_at: now,
        },
      });
    }
    if (item.quote_status === 'selected') {
      return db.collection('customer_transport_quotes').doc(item._id).update({
        data: {
          quote_status: 'published',
          selected_by_openid: '',
          selected_at: '',
          updated_at: now,
        },
      });
    }
    return Promise.resolve();
  }));

  await writeAuditLog({
    actor_openid: OPENID,
    actor_role: 'customer',
    action: 'customer_quote_selected',
    target_type: 'customer_transport_quote',
    target_id: customer_quote_id,
    related_request_id: request_id,
    related_driver_quote_id: quote.source_driver_quote_id || '',
    related_customer_quote_id: customer_quote_id,
    detail: {
      source_driver_quote_id: quote.source_driver_quote_id || '',
      client_total: quote.client_total,
    },
    created_at: now,
  });

  return {
    success: true,
    code: 0,
    request_id,
    customer_quote_id,
    quote_status: 'selected',
    message: '已选择该司机，等待 Farland 确认司机是否可接单',
  };
};
