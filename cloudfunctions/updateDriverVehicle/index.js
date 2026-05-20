const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function hasLockedOrder(driverId) {
  const quoteRes = await db.collection('driver_quotes').where({ driver_id: driverId }).get();
  for (const quote of quoteRes.data) {
    const requestRes = await db.collection('ride_requests').doc(quote.request_id).get().catch(() => null);
    const request = requestRes && requestRes.data;
    if (request && ['quoting', 'quoted', 'assigned'].includes(request.status)) return true;
  }
  return false;
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const { vehicle_profile: vehicleProfile = {} } = event;
  const now = new Date().toISOString();
  if (!OPENID) return { success: false, message: '无法获取用户身份' };

  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  if (!user || !user.driver_id) return { success: false, message: '司机资料不存在' };

  const driverRes = await db.collection('drivers').doc(user.driver_id).get().catch(() => null);
  const driver = driverRes && driverRes.data;
  if (!driver) return { success: false, message: '司机资料不存在' };

  if (await hasLockedOrder(driver._id)) {
    return { success: false, code: 409, message: '已有报价中或已选择订单，车辆信息请联系 Farland 运营修改' };
  }

  if (!vehicleProfile.vehicle_type || !vehicleProfile.vehicle_model) {
    return { success: false, message: '请填写车辆类型和车辆型号' };
  }

  const vehicleData = {
    driver_id: driver._id,
    vehicle_type: vehicleProfile.vehicle_type,
    vehicle_model: vehicleProfile.vehicle_model,
    seats: Number(vehicleProfile.seats || 0),
    luggage_capacity: Number(vehicleProfile.luggage_capacity || 0),
    plate_number: vehicleProfile.plate_number || '',
    status: 'active',
    updated_at: now,
  };

  let vehicleId = driver.default_vehicle_id;
  if (vehicleId) {
    await db.collection('vehicles').doc(vehicleId).update({ data: vehicleData });
  } else {
    const addRes = await db.collection('vehicles').add({
      data: {
        ...vehicleData,
        created_at: now,
      },
    });
    vehicleId = addRes._id;
    await db.collection('drivers').doc(driver._id).update({
      data: {
        default_vehicle_id: vehicleId,
        updated_at: now,
      },
    });
  }

  return { success: true, code: 0, message: '车辆信息已保存', vehicle_id: vehicleId };
};
