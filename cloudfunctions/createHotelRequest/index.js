const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event = {}) => {
  const now = new Date().toISOString();
  const requiredFields = ['city', 'check_in_date', 'check_out_date', 'customer_name', 'contact'];
  const missing = requiredFields.find((field) => !event[field]);
  if (missing) {
    return { success: false, message: '请填写完整酒店需求信息' };
  }

  const data = {
    city: event.city,
    check_in_date: event.check_in_date,
    check_out_date: event.check_out_date,
    rooms: Number(event.rooms || 1),
    guests: Number(event.guests || 1),
    hotel_level: event.hotel_level || '',
    budget_range: event.budget_range || '',
    location_preference: event.location_preference || '',
    special_requests: event.special_requests || '',
    customer_name: event.customer_name,
    contact: event.contact,
    status: 'new',
    supplier: '',
    stars_search_payload: null,
    stars_booking_reference: '',
    hotel_name: '',
    room_type: '',
    quoted_price: '',
    currency: 'USD',
    created_at: now,
    updated_at: now,
  };

  const addRes = await db.collection('hotel_requests').add({ data });
  return {
    success: true,
    request_id: addRes._id,
  };
};
