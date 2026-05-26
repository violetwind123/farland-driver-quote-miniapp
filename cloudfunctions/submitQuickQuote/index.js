const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function isExpired(expiresAt) {
  return expiresAt && new Date(expiresAt).getTime() < Date.now();
}

exports.main = async (event = {}) => {
  const {
    token,
    driver_profile = {},
    vehicle_profile = {},
    quote_price,
    currency = 'USD',
    quote_note = '',
  } = event;
  const { OPENID } = cloud.getWXContext();
  const now = new Date().toISOString();

  if (!token) return { success: false, message: '报价链接无效' };
  const price = Number(quote_price);
  if (Number.isNaN(price) || price <= 0) return { success: false, message: '报价金额必须大于0' };

  const inviteRes = await db.collection('quote_invites').where({ token }).limit(1).get();
  const invite = inviteRes.data[0];
  if (!invite || invite.status === 'cancelled') return { success: false, code: 404, message: '报价链接无效', msg: '报价链接无效' };
  if (isExpired(invite.expires_at)) {
    await db.collection('quote_invites').doc(invite._id).update({
      data: { status: 'expired', updated_at: now },
    });
    return { success: false, code: 410, message: '报价已截止', msg: '报价已截止' };
  }

  const requestRes = await db.collection('ride_requests').doc(invite.request_id).get().catch(() => null);
  const request = requestRes && requestRes.data;
  if (!request || !['quoting', 'quoted'].includes(request.status)) {
    return { success: false, code: 410, message: '当前报价单不可报价', msg: '当前报价单不可报价' };
  }

  let userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get();
  let user = userRes.data[0];
  if (!user) {
    const created = await db.collection('users').add({
      data: {
        openid: OPENID,
        role: 'driver',
        name: driver_profile.name || '',
        phone: driver_profile.phone || '',
        status: 'active',
        driver_id: '',
        created_at: now,
        updated_at: now,
        last_login_at: now,
      },
    });
    user = { _id: created._id, openid: OPENID, driver_id: '' };
  }

  let driverId = user.driver_id;
  let driver;
  let vehicle;
  let vehicleId = '';

  if (!driverId) {
    const existingDriverRes = await db.collection('drivers').where({ openid: OPENID }).limit(1).get();
    const existingDriver = existingDriverRes.data[0];
    if (existingDriver) {
      driverId = existingDriver._id;
      await db.collection('users').doc(user._id).update({
        data: {
          driver_id: driverId,
          name: existingDriver.name || user.name || '',
          phone: existingDriver.phone || user.phone || '',
          updated_at: now,
        },
      });
    }
  }

  if (!driverId) {
    if (!driver_profile.name || !driver_profile.phone) return { success: false, message: '请填写司机姓名和电话' };
    if (!vehicle_profile.vehicle_type || !vehicle_profile.vehicle_model) return { success: false, message: '请填写车辆类型和车辆型号' };

    const driverAdd = await db.collection('drivers').add({
      data: {
        user_id: user._id,
        openid: OPENID,
        name: driver_profile.name,
        phone: driver_profile.phone,
        service_region: request.driver_region || '',
        status: 'active',
        default_vehicle_id: '',
        created_at: now,
        updated_at: now,
      },
    });
    driverId = driverAdd._id;

    const vehicleAdd = await db.collection('vehicles').add({
      data: {
        driver_id: driverId,
        vehicle_type: vehicle_profile.vehicle_type,
        vehicle_model: vehicle_profile.vehicle_model,
        seats: Number(vehicle_profile.seats || 0),
        luggage_capacity: Number(vehicle_profile.luggage_capacity || 0),
        plate_number: vehicle_profile.plate_number || '',
        status: 'active',
        created_at: now,
        updated_at: now,
      },
    });
    vehicleId = vehicleAdd._id;

    await Promise.all([
      db.collection('drivers').doc(driverId).update({ data: { default_vehicle_id: vehicleId, updated_at: now } }),
      db.collection('users').doc(user._id).update({
        data: {
          driver_id: driverId,
          name: driver_profile.name,
          phone: driver_profile.phone,
          updated_at: now,
        },
      }),
    ]);

    driver = { _id: driverId, name: driver_profile.name, phone: driver_profile.phone };
    vehicle = {
      _id: vehicleId,
      vehicle_type: vehicle_profile.vehicle_type,
      vehicle_model: vehicle_profile.vehicle_model,
      seats: Number(vehicle_profile.seats || 0),
      luggage_capacity: Number(vehicle_profile.luggage_capacity || 0),
    };
  } else {
    const driverRes = await db.collection('drivers').doc(driverId).get().catch(() => null);
    driver = driverRes && driverRes.data;
    if (!driver) return { success: false, message: '司机资料不存在' };
    vehicleId = driver.default_vehicle_id;
    if (vehicleId) {
      const vehicleRes = await db.collection('vehicles').doc(vehicleId).get().catch(() => null);
      vehicle = vehicleRes && vehicleRes.data;
    }
    if (!vehicle) {
      if (!vehicle_profile.vehicle_type || !vehicle_profile.vehicle_model) return { success: false, message: '请填写车辆信息' };
      const vehicleAdd = await db.collection('vehicles').add({
        data: {
          driver_id: driverId,
          vehicle_type: vehicle_profile.vehicle_type,
          vehicle_model: vehicle_profile.vehicle_model,
          seats: Number(vehicle_profile.seats || 0),
          luggage_capacity: Number(vehicle_profile.luggage_capacity || 0),
          plate_number: vehicle_profile.plate_number || '',
          status: 'active',
          created_at: now,
          updated_at: now,
        },
      });
      vehicleId = vehicleAdd._id;
      await db.collection('drivers').doc(driverId).update({ data: { default_vehicle_id: vehicleId, updated_at: now } });
      vehicle = {
        _id: vehicleId,
        vehicle_type: vehicle_profile.vehicle_type,
        vehicle_model: vehicle_profile.vehicle_model,
        seats: Number(vehicle_profile.seats || 0),
        luggage_capacity: Number(vehicle_profile.luggage_capacity || 0),
      };
    }
  }

  const existingRes = await db.collection('driver_quotes').where({
    request_id: invite.request_id,
    driver_id: driverId,
  }).limit(1).get();
  const quoteData = {
    request_id: invite.request_id,
    token,
    user_id: user._id,
    driver_id: driverId,
    vehicle_id: vehicleId,
    driver_name_snapshot: driver.name,
    driver_phone_snapshot: driver.phone,
    vehicle_type_snapshot: vehicle.vehicle_type,
    vehicle_model_snapshot: vehicle.vehicle_model,
    seats_snapshot: vehicle.seats || 0,
    luggage_capacity_snapshot: vehicle.luggage_capacity || 0,
    quote_price: price,
    currency,
    quote_note,
    updated_at: now,
  };

  if (existingRes.data.length) {
    const existingQuote = existingRes.data[0];
    await db.collection('driver_quotes').doc(existingQuote._id).update({
      data: {
        ...quoteData,
        quote_status: 'submitted',
        resubmitted_at: now,
      },
    });
    await db.collection('quote_invites').doc(invite._id).update({
      data: { status: 'submitted', updated_at: now },
    });
    return { success: true, code: 0, quote_id: existingQuote._id, message: '报价已更新，Farland 运营会再与您确认。', msg: '报价已更新，Farland 运营会再与您确认。' };
  }

  const createdQuote = await db.collection('driver_quotes').add({
    data: {
      ...quoteData,
      quote_status: 'submitted',
      submitted_at: now,
    },
  });
  await db.collection('quote_invites').doc(invite._id).update({
    data: { status: 'submitted', updated_at: now },
  });
  return { success: true, code: 0, quote_id: createdQuote._id, message: '报价已提交，Farland 运营会再与您确认。', msg: '报价已提交，Farland 运营会再与您确认。' };
};
