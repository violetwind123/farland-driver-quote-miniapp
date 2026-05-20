const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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

  const quoteRes = await db.collection('driver_quotes').where({ driver_id: driver._id }).get();
  const quotingOrders = [];
  const selectedOrders = [];
  let hasLockedOrder = false;

  for (const quote of quoteRes.data) {
    const requestRes = await db.collection('ride_requests').doc(quote.request_id).get().catch(() => null);
    const request = requestRes && requestRes.data;
    if (!request || !['quoting', 'quoted', 'assigned'].includes(request.status)) continue;

    hasLockedOrder = true;
    if (quote.quote_status === 'rejected') continue;
    const order = {
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
      submitted_at: quote.submitted_at,
      updated_at: quote.updated_at,
    };
    if (request.status === 'assigned' && quote.quote_status === 'selected') {
      selectedOrders.push(order);
    } else if (request.status !== 'assigned') {
      quotingOrders.push(order);
    }
  }

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
