const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const QUOTING_REQUEST_STATUSES = ['quoting', 'quoted'];
const QUOTING_QUOTE_STATUSES = ['submitted', 'updated'];
const LOCK_QUOTE_STATUSES = ['submitted', 'updated', 'selected'];

function serviceTypeText(serviceType) {
  if (serviceType === 'transfer') return '接送 / 转场';
  if (serviceType === 'charter') return '包车 / 多日用车';
  return serviceType || '-';
}

function quoteStatusText(status) {
  if (status === 'selected') return '已选择';
  if (status === 'submitted') return '已报价';
  if (status === 'updated') return '已报价';
  return status || '-';
}

async function getRequestMap(requestIds) {
  const uniqueIds = Array.from(new Set((requestIds || []).filter(Boolean)));
  const requestMap = {};
  await Promise.all(uniqueIds.map(async (requestId) => {
    const requestRes = await db.collection('ride_requests').doc(requestId).get().catch(() => null);
    if (requestRes && requestRes.data) {
      requestMap[requestId] = requestRes.data;
    }
  }));
  return requestMap;
}

function buildOrder(quote, request) {
  return {
    quote_id: quote._id,
    request_id: request._id,
    request_no: request.request_no,
    service_type: request.service_type,
    service_type_text: serviceTypeText(request.service_type),
    service_date: request.service_date,
    driver_region: request.driver_region,
    request_status: request.status,
    quote_status: quote.quote_status,
    display_status: request.status === 'assigned' && quote.quote_status === 'selected' ? '已选择' : quoteStatusText(quote.quote_status),
    quote_price: quote.quote_price,
    currency: quote.currency,
    quote_note: quote.quote_note,
    updated_at: quote.updated_at,
  };
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, message: '无法获取用户身份' };

  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  if (!user || !user.driver_id) {
    return {
      success: true,
      driver: null,
      vehicle: null,
      orders: [],
      can_update_vehicle: false,
      vehicle_locked_reason: '暂无司机资料。请先通过 Farland 报价邀请提交一次司机信息。',
    };
  }

  const driverRes = await db.collection('drivers').doc(user.driver_id).get().catch(() => null);
  const driver = driverRes && driverRes.data;
  if (!driver) return { success: false, message: '司机资料不存在' };

  let vehicle = null;
  if (driver.default_vehicle_id) {
    const vehicleRes = await db.collection('vehicles').doc(driver.default_vehicle_id).get().catch(() => null);
    vehicle = vehicleRes && vehicleRes.data;
  }

  const [displayQuoteRes, lockQuoteRes] = await Promise.all([
    db.collection('driver_quotes')
      .where({ driver_id: driver._id })
      .orderBy('updated_at', 'desc')
      .limit(20)
      .get(),
    db.collection('driver_quotes')
      .where({
        driver_id: driver._id,
        quote_status: _.in(LOCK_QUOTE_STATUSES),
      })
      .orderBy('updated_at', 'desc')
      .limit(100)
      .get(),
  ]);

  const displayRequestMap = await getRequestMap(displayQuoteRes.data.map((quote) => quote.request_id));
  const quotingOrders = [];
  const selectedOrders = [];

  displayQuoteRes.data.forEach((quote) => {
    const request = displayRequestMap[quote.request_id];
    if (!request) return;
    if (QUOTING_REQUEST_STATUSES.includes(request.status) && QUOTING_QUOTE_STATUSES.includes(quote.quote_status)) {
      quotingOrders.push(buildOrder(quote, request));
    } else if (request.status === 'assigned' && quote.quote_status === 'selected') {
      selectedOrders.push(buildOrder(quote, request));
    }
  });

  const lockRequestMap = await getRequestMap(lockQuoteRes.data.map((quote) => quote.request_id));
  const hasLockedOrder = lockQuoteRes.data.some((quote) => {
    const request = lockRequestMap[quote.request_id];
    if (!request) return false;
    return (
      QUOTING_REQUEST_STATUSES.includes(request.status) && QUOTING_QUOTE_STATUSES.includes(quote.quote_status)
    ) || (
      request.status === 'assigned' && quote.quote_status === 'selected'
    );
  });

  const sortByUpdatedAt = (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  quotingOrders.sort(sortByUpdatedAt);
  selectedOrders.sort(sortByUpdatedAt);

  return {
    success: true,
    driver: {
      _id: driver._id,
      name: driver.name,
      phone: driver.phone,
      service_region: driver.service_region,
      wecom_userid: driver.wecom_userid || '',
      wecom_name: driver.wecom_name || '',
      wecom_department: driver.wecom_department || '',
    },
    vehicle: vehicle ? {
      _id: vehicle._id,
      vehicle_type: vehicle.vehicle_type,
      vehicle_model: vehicle.vehicle_model,
      seats: vehicle.seats,
      luggage_capacity: vehicle.luggage_capacity,
      plate_number: vehicle.plate_number,
    } : null,
    quoting_orders: quotingOrders,
    selected_orders: selectedOrders,
    orders: [...selectedOrders, ...quotingOrders],
    can_update_vehicle: !hasLockedOrder,
    vehicle_locked_reason: hasLockedOrder ? '已有报价中或已选择订单，车辆信息请联系 Farland 运营修改。' : '',
  };
};
