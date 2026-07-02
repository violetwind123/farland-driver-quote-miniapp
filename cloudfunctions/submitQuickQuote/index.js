const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function isExpired(expiresAt) {
  return expiresAt && new Date(expiresAt).getTime() < Date.now();
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function displayDriverName({ driverProfile, user, openid }) {
  return text(driverProfile.name)
    || text(driverProfile.nick_name)
    || text(driverProfile.nickname)
    || text(user && user.name)
    || (openid ? `微信司机${String(openid).slice(-4)}` : '待完善司机');
}

function hasCompleteVehicleProfile(vehicleProfile) {
  return Boolean(text(vehicleProfile.vehicle_type) && text(vehicleProfile.vehicle_model));
}

function toVehicleSnapshot(vehicle, vehicleProfile) {
  if (vehicle) {
    return {
      vehicle_id: vehicle._id || '',
      vehicle_type: text(vehicle.vehicle_type),
      vehicle_model: text(vehicle.vehicle_model),
      seats: numberValue(vehicle.seats),
      luggage_capacity: numberValue(vehicle.luggage_capacity),
      plate_number: text(vehicle.plate_number),
    };
  }
  if (hasCompleteVehicleProfile(vehicleProfile)) {
    return {
      vehicle_id: '',
      vehicle_type: text(vehicleProfile.vehicle_type),
      vehicle_model: text(vehicleProfile.vehicle_model),
      seats: numberValue(vehicleProfile.seats),
      luggage_capacity: numberValue(vehicleProfile.luggage_capacity),
      plate_number: text(vehicleProfile.plate_number),
    };
  }
  return {
    vehicle_id: '',
    vehicle_type: '',
    vehicle_model: '',
    seats: 0,
    luggage_capacity: 0,
    plate_number: '',
  };
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
    const userName = displayDriverName({ driverProfile: driver_profile, user: null, openid: OPENID });
    const created = await db.collection('users').add({
      data: {
        openid: OPENID,
        role: 'driver',
        name: userName,
        phone: text(driver_profile.phone),
        status: 'active',
        driver_id: '',
        avatar_url: text(driver_profile.avatar_url),
        profile_pending: !text(driver_profile.name) || !text(driver_profile.phone),
        created_at: now,
        updated_at: now,
        last_login_at: now,
      },
    });
    user = { _id: created._id, openid: OPENID, driver_id: '', name: userName, phone: text(driver_profile.phone) };
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
    const driverName = displayDriverName({ driverProfile: driver_profile, user, openid: OPENID });
    const driverPhone = text(driver_profile.phone || user.phone);
    const shouldCreateVehicle = hasCompleteVehicleProfile(vehicle_profile);
    const driverAdd = await db.collection('drivers').add({
      data: {
        user_id: user._id,
        openid: OPENID,
        name: driverName,
        phone: driverPhone,
        service_region: request.driver_region || '',
        status: 'active',
        default_vehicle_id: '',
        avatar_url: text(driver_profile.avatar_url),
        profile_pending: !driverPhone || !text(driver_profile.name),
        vehicle_profile_pending: !shouldCreateVehicle,
        created_at: now,
        updated_at: now,
      },
    });
    driverId = driverAdd._id;

    if (shouldCreateVehicle) {
      const vehicleAdd = await db.collection('vehicles').add({
        data: {
          driver_id: driverId,
          vehicle_type: text(vehicle_profile.vehicle_type),
          vehicle_model: text(vehicle_profile.vehicle_model),
          seats: numberValue(vehicle_profile.seats),
          luggage_capacity: numberValue(vehicle_profile.luggage_capacity),
          plate_number: text(vehicle_profile.plate_number),
          status: 'active',
          profile_pending: false,
          created_at: now,
          updated_at: now,
        },
      });
      vehicleId = vehicleAdd._id;
    }

    await Promise.all([
      vehicleId
        ? db.collection('drivers').doc(driverId).update({ data: { default_vehicle_id: vehicleId, updated_at: now } })
        : Promise.resolve(),
      db.collection('users').doc(user._id).update({
        data: {
          driver_id: driverId,
          name: driverName,
          phone: driverPhone,
          avatar_url: text(driver_profile.avatar_url),
          profile_pending: !driverPhone || !text(driver_profile.name),
          updated_at: now,
        },
      }),
    ]);

    driver = { _id: driverId, name: driverName, phone: driverPhone };
    vehicle = vehicleId ? {
      _id: vehicleId,
      vehicle_type: text(vehicle_profile.vehicle_type),
      vehicle_model: text(vehicle_profile.vehicle_model),
      seats: numberValue(vehicle_profile.seats),
      luggage_capacity: numberValue(vehicle_profile.luggage_capacity),
      plate_number: text(vehicle_profile.plate_number),
    } : null;
  } else {
    const driverRes = await db.collection('drivers').doc(driverId).get().catch(() => null);
    driver = driverRes && driverRes.data;
    if (!driver) return { success: false, message: '司机资料不存在' };
    const driverUpdates = {};
    if (text(driver_profile.name) && !text(driver.name)) driverUpdates.name = text(driver_profile.name);
    if (text(driver_profile.phone) && !text(driver.phone)) driverUpdates.phone = text(driver_profile.phone);
    if (text(driver_profile.avatar_url) && !text(driver.avatar_url)) driverUpdates.avatar_url = text(driver_profile.avatar_url);
    if (Object.keys(driverUpdates).length) {
      driverUpdates.profile_pending = !text(driverUpdates.phone || driver.phone) || !text(driverUpdates.name || driver.name);
      driverUpdates.updated_at = now;
      await db.collection('drivers').doc(driverId).update({ data: driverUpdates }).catch(() => null);
      driver = { ...driver, ...driverUpdates };
    }
    vehicleId = driver.default_vehicle_id;
    if (vehicleId) {
      const vehicleRes = await db.collection('vehicles').doc(vehicleId).get().catch(() => null);
      vehicle = vehicleRes && vehicleRes.data;
    }
    if (!vehicle) {
      if (hasCompleteVehicleProfile(vehicle_profile)) {
        const vehicleAdd = await db.collection('vehicles').add({
          data: {
            driver_id: driverId,
            vehicle_type: text(vehicle_profile.vehicle_type),
            vehicle_model: text(vehicle_profile.vehicle_model),
            seats: numberValue(vehicle_profile.seats),
            luggage_capacity: numberValue(vehicle_profile.luggage_capacity),
            plate_number: text(vehicle_profile.plate_number),
            status: 'active',
            profile_pending: false,
            created_at: now,
            updated_at: now,
          },
        });
        vehicleId = vehicleAdd._id;
        await db.collection('drivers').doc(driverId).update({ data: { default_vehicle_id: vehicleId, vehicle_profile_pending: false, updated_at: now } });
        vehicle = {
          _id: vehicleId,
          vehicle_type: text(vehicle_profile.vehicle_type),
          vehicle_model: text(vehicle_profile.vehicle_model),
          seats: numberValue(vehicle_profile.seats),
          luggage_capacity: numberValue(vehicle_profile.luggage_capacity),
          plate_number: text(vehicle_profile.plate_number),
        };
      } else {
        await db.collection('drivers').doc(driverId).update({ data: { vehicle_profile_pending: true, updated_at: now } }).catch(() => null);
      }
    }
  }

  const vehicleSnapshot = toVehicleSnapshot(vehicle, vehicle_profile);
  const driverNameSnapshot = text(driver.name) || displayDriverName({ driverProfile: driver_profile, user, openid: OPENID });
  const driverPhoneSnapshot = text(driver.phone || driver_profile.phone);
  const existingRes = await db.collection('driver_quotes').where({
    request_id: invite.request_id,
    driver_id: driverId,
  }).limit(1).get();
  const quoteData = {
    request_id: invite.request_id,
    token,
    user_id: user._id,
    driver_id: driverId,
    vehicle_id: vehicleSnapshot.vehicle_id || vehicleId || '',
    driver_openid_snapshot: OPENID,
    driver_name_snapshot: driverNameSnapshot,
    driver_phone_snapshot: driverPhoneSnapshot,
    driver_profile_pending: !driverPhoneSnapshot || !text(driver_profile.name || driver.name),
    vehicle_profile_pending: !vehicleSnapshot.vehicle_model,
    vehicle_type_snapshot: vehicleSnapshot.vehicle_type,
    vehicle_model_snapshot: vehicleSnapshot.vehicle_model,
    seats_snapshot: vehicleSnapshot.seats,
    luggage_capacity_snapshot: vehicleSnapshot.luggage_capacity,
    plate_number_snapshot: vehicleSnapshot.plate_number,
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
