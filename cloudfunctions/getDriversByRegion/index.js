const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getOperator() {
  const { OPENID } = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role) ? user : null;
}

async function getDriverQuoteStats(driverId) {
  const quoteRes = await db.collection('driver_quotes').where({ driver_id: driverId }).get();
  let activeQuoteCount = 0;
  let selectedOrderCount = 0;
  let lastQuoteAt = '';

  for (const quote of quoteRes.data) {
    const updatedAt = quote.updated_at || quote.submitted_at || '';
    if (updatedAt && (!lastQuoteAt || String(updatedAt) > String(lastQuoteAt))) lastQuoteAt = updatedAt;

    const requestRes = await db.collection('ride_requests').doc(quote.request_id).get().catch(() => null);
    const request = requestRes && requestRes.data;
    if (!request) continue;

    if (['submitted', 'updated'].includes(quote.quote_status) && ['quoting', 'quoted'].includes(request.status)) {
      activeQuoteCount += 1;
    }
    if (quote.quote_status === 'selected' && request.status === 'assigned') {
      selectedOrderCount += 1;
    }
  }

  return { activeQuoteCount, selectedOrderCount, lastQuoteAt };
}

exports.main = async (event = {}) => {
  try {
    const operator = await getOperator();
    if (!operator) return { success: false, message: '无权限访问' };

    const { region, vehicle_type: vehicleType = '' } = event;
    if (!region) return { success: false, message: '缺少司机区域' };

    const driverRes = await db.collection('drivers').where({ service_region: region }).limit(1000).get();
    const drivers = [];

    for (const driver of driverRes.data) {
      let vehicle = null;
      if (driver.default_vehicle_id) {
        const vehicleRes = await db.collection('vehicles').doc(driver.default_vehicle_id).get().catch(() => null);
        vehicle = vehicleRes && vehicleRes.data;
      }
      const currentVehicleType = vehicle ? vehicle.vehicle_type : '';
      if (vehicleType && currentVehicleType !== vehicleType) continue;

      const stats = await getDriverQuoteStats(driver._id);
      drivers.push({
        _id: driver._id,
        name: driver.name,
        phone: driver.phone,
        service_region: driver.service_region,
        status: driver.status,
        vehicle_type: currentVehicleType,
        vehicle_model: vehicle ? vehicle.vehicle_model : '',
        seats: vehicle ? vehicle.seats : 0,
        luggage_capacity: vehicle ? vehicle.luggage_capacity : 0,
        plate_number: vehicle ? vehicle.plate_number : '',
        active_quote_count: stats.activeQuoteCount,
        selected_order_count: stats.selectedOrderCount,
        last_quote_at: stats.lastQuoteAt,
      });
    }

    drivers.sort((a, b) => String(b.last_quote_at || '').localeCompare(String(a.last_quote_at || '')));
    return { success: true, region, vehicle_type: vehicleType, drivers };
  } catch (error) {
    return { success: false, message: '司机信息加载失败，请稍后重试' };
  }
};
