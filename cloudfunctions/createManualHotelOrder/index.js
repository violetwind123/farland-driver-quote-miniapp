const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ORDERS_COLLECTION = 'hotel_orders';

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function text(value) {
  return safeString(value).trim();
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactObject(input) {
  return Object.keys(input).reduce((acc, key) => {
    const value = input[key];
    if (value === undefined || value === null || value === '') return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function buildOrderNo() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  return `FLH${stamp}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function isLatinName(value) {
  return /^[A-Za-z][A-Za-z .'-]*$/.test(text(value));
}

function normalizeGuests(guests) {
  const list = Array.isArray(guests) ? guests : [];
  return list.map((guest, index) => ({
    room_no: Number(guest.roomNo || guest.room_no || index + 1),
    first_name: text(guest.firstName || guest.first_name),
    last_name: text(guest.lastName || guest.last_name),
    full_name: `${text(guest.firstName || guest.first_name)} ${text(guest.lastName || guest.last_name)}`.trim(),
  }));
}

function validateEvent(event) {
  const preview = event.preview || {};
  const price = preview.price || {};
  const hotel = event.hotel || preview.hotel || {};
  const room = event.room || preview.rate || {};
  const contact = event.contact || {};
  const guests = normalizeGuests(event.guests);
  if (!preview.preview_id) return { ok: false, message: '缺少订单预览，请返回重新确认价格' };
  if (preview.lock_expires_at) {
    const expires = new Date(preview.lock_expires_at);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
      return { ok: false, message: '订单预览已过期，请返回重新确认价格' };
    }
  }
  if (!hotel.hotel_id && !hotel.providerHotelId && !hotel.elong_hotel_id) {
    return { ok: false, message: '缺少酒店信息，请返回重新选择酒店' };
  }
  if (!room.rate_plan_id && !room.ratePlanId) {
    return { ok: false, message: '缺少房型信息，请返回重新选择房型' };
  }
  if (!guests.length || guests.some((guest) => !isLatinName(guest.first_name) || !isLatinName(guest.last_name))) {
    return { ok: false, message: '请填写与证件一致的英文/拼音入住人姓名' };
  }
  if (!text(contact.name) || !text(contact.mobile)) {
    return { ok: false, message: '请填写联系人姓名和电话' };
  }
  if (!numberValue(price.payable_total)) {
    return { ok: false, message: '缺少应付总额，请返回重新确认价格' };
  }
  return { ok: true, preview, price, hotel, room, contact, guests };
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Collection already exists.
  }
}

async function findExistingOrder(openid, clientOrderToken, previewId) {
  if (!clientOrderToken) return null;
  // 幂等键含 preview_id:token 被复用到另一份草稿(不同 preview)时不误命中旧单,
  // 避免"超时后换酒店重下拿回上一单"。
  const query = { openid, client_order_token: clientOrderToken };
  if (previewId) query.preview_id = previewId;
  const res = await db.collection(ORDERS_COLLECTION)
    .where(query)
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return (res.data && res.data[0]) || null;
}

const PREVIEWS_COLLECTION = 'hotel_order_previews';

// 服务端按 preview_id 回查 searchElongHotels 存下的 preview,拿权威 price/room/hotel。
// 杜绝客户端伪造 event.preview.price 改价下单。
async function loadServerPreview(previewId, openid) {
  const id = text(previewId);
  if (!id) return { ok: false, code: 422, error_code: 'PREVIEW_ID_REQUIRED', message: '缺少订单预览,请返回重新确认价格' };
  const res = await db.collection(PREVIEWS_COLLECTION).doc(id).get().catch(() => null);
  const stored = res && res.data;
  if (!stored) {
    return { ok: false, code: 409, error_code: 'PREVIEW_NOT_FOUND', message: '订单预览已失效,请返回重新确认价格' };
  }
  if (stored.lock_expires_at && new Date(stored.lock_expires_at).getTime() < Date.now()) {
    return { ok: false, code: 409, error_code: 'PREVIEW_EXPIRED', message: '订单预览已过期,请返回重新确认价格' };
  }
  if (openid && stored.openid && stored.openid !== openid) {
    return { ok: false, code: 403, error_code: 'PREVIEW_MISMATCH', message: '订单预览与当前用户不匹配,请重新确认价格' };
  }
  if (!numberValue(stored.price && stored.price.payable_total)) {
    return { ok: false, code: 409, error_code: 'PREVIEW_PRICE_MISSING', message: '订单预览缺少应付总额,请返回重新确认价格' };
  }
  return { ok: true, stored };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const openid = OPENID || '';
  const validation = validateEvent(event);
  if (!validation.ok) {
    return { success: false, code: 422, error_code: 'VALIDATION_ERROR', message: validation.message };
  }

  // 权威价格/房型/酒店来自服务端存储的 preview,不信任客户端传入的 event.preview.price
  const previewLoad = await loadServerPreview(validation.preview.preview_id, openid);
  if (!previewLoad.ok) {
    return { success: false, code: previewLoad.code, error_code: previewLoad.error_code, message: previewLoad.message };
  }
  const serverPreview = previewLoad.stored;
  const price = serverPreview.price || {};
  const hotel = serverPreview.hotel || {};
  const room = serverPreview.rate || {};
  const cancellation = serverPreview.cancellation || {};
  const serverSearch = serverPreview.search || {};
  const guests = validation.guests;
  const contact = validation.contact;

  const clientOrderToken = text(event.client_order_token);
  if (event.dry_run) {
    return {
      success: true,
      code: 0,
      dry_run: true,
      reused: false,
      order_id: 'dry_run',
      order_no: `DRY${buildOrderNo()}`,
      status: 'pending_manual_payment',
      payment_status: 'manual_payment_pending',
      supplier_order_status: 'not_created',
      payable_text: text(price.payable_text),
      message: '订单参数验证通过;dry_run 未写入正式订单。',
    };
  }

  await ensureCollection(ORDERS_COLLECTION);
  const existing = await findExistingOrder(openid, clientOrderToken, text(serverPreview.preview_id));
  if (existing) {
    return {
      success: true,
      code: 0,
      reused: true,
      order_id: existing._id,
      order_no: existing.order_no,
      status: existing.status,
      payment_status: existing.payment_status,
      supplier_order_status: existing.supplier_order_status,
      message: '订单已提交，Farland 运营会联系确认支付和预订。',
    };
  }

  const now = new Date().toISOString();

  const orderData = compactObject({
    order_no: buildOrderNo(),
    client_order_token: clientOrderToken,
    openid,
    status: 'pending_manual_payment',
    payment_status: 'manual_payment_pending',
    payment_method: 'manual',
    supplier: 'elong',
    supplier_order_status: 'not_created',
    supplier_order_id: '',
    provider_hotel_id: text(hotel.providerHotelId || hotel.provider_hotel_id || hotel.elong_hotel_id || hotel.hotel_id),
    hotel_id: text(hotel.hotel_id || hotel.providerHotelId || hotel.elong_hotel_id),
    hotel_name: text(hotel.displayName || hotel.name),
    hotel_name_en: text(hotel.displayNameEn || hotel.name_en),
    hotel_address: text(hotel.displayAddress || hotel.address),
    room_name: text(room.displayName || room.room_name || room.name),
    rate_plan_name: text(room.displayRateName || room.rate_plan_name),
    room_id: text(room.room_id),
    room_type_id: text(room.room_type_id),
    rate_plan_id: text(room.rate_plan_id),
    check_in_date: text(serverSearch.check_in_date),
    check_out_date: text(serverSearch.check_out_date),
    rooms: numberValue(serverSearch.rooms) || guests.length,
    guests_count: numberValue(serverSearch.guests),
    guest_names: guests,
    contact: {
      name: text(contact.name),
      mobile: text(contact.mobile),
      email: text(contact.email),
      special_requests: text(contact.specialRequests || contact.special_requests),
    },
    currency: text(price.currency),
    room_total: numberValue(price.room_total),
    taxes_and_fees: numberValue(price.taxes_and_fees),
    farland_service_fee: numberValue(price.farland_service_fee),
    payable_total: numberValue(price.payable_total),
    payable_text: text(price.payable_text),
    cancellation: cancellation || {},
    preview_id: text(serverPreview.preview_id),
    preview_lock_expires_at: text(serverPreview.lock_expires_at),
    preview_snapshot: serverPreview,
    provider_request_snapshot: serverPreview.request_snapshot || {},
    ops_note: '客户选择手动支付；请运营联系客户确认付款方式，付款后再创建供应商订单。',
    created_at: now,
    updated_at: now,
  });

  const addRes = await db.collection(ORDERS_COLLECTION).add({ data: orderData });
  await db.collection('audit_logs').add({
    data: {
      actor_openid: openid,
      actor_role: 'customer',
      action: 'hotel_manual_order_submitted',
      target_type: 'hotel_order',
      target_id: addRes._id,
      detail: {
        order_no: orderData.order_no,
        hotel_name: orderData.hotel_name,
        payable_text: orderData.payable_text,
        payment_method: 'manual',
      },
      created_at: now,
    },
  }).catch(() => null);

  return {
    success: true,
    code: 0,
    reused: false,
    order_id: addRes._id,
    order_no: orderData.order_no,
    status: orderData.status,
    payment_status: orderData.payment_status,
    supplier_order_status: orderData.supplier_order_status,
    payable_text: orderData.payable_text,
    message: '订单已提交，Farland 运营会联系确认支付和预订。',
  };
};
