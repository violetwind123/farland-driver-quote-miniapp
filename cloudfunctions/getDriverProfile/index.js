const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  const user = userRes.data[0];
  if (!user || !user.driver_id) return { success: false, message: '司机资料不存在' };

  const driverRes = await db.collection('drivers').doc(user.driver_id).get().catch(() => null);
  const driver = driverRes && driverRes.data;
  if (!driver) return { success: false, message: '司机资料不存在' };

  let vehicle = null;
  if (driver.default_vehicle_id) {
    const vehicleRes = await db.collection('vehicles').doc(driver.default_vehicle_id).get().catch(() => null);
    vehicle = vehicleRes && vehicleRes.data;
  }
  return { success: true, driver, vehicle };
};
