const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  return {
    success: true,
    profile: {
      name: '尊贵客户',
      member_level: 'VIP Family',
      points_balance: 1280,
    },
    transportation_appointments: [
      {
        service_date: '2026-06-03',
        service_type: '访校包车',
        route_summary: 'Boston campus visit: Harvard / MIT / Boston College',
        status: 'assigned',
        driver_name: 'David',
        driver_phone: '+1 xxx',
        vehicle_type: 'Suburban',
        vehicle_model: 'Chevrolet Suburban',
        plate_number: 'confirmed after assignment',
      },
    ],
    hotel_requests: [
      {
        city: 'Boston',
        check_in_date: '2026-06-03',
        check_out_date: '2026-06-06',
        status: 'processing',
      },
    ],
    benefits: [
      {
        title: 'Airport Transfer Benefit',
        description: 'Selected city airport transfer service benefit',
      },
      {
        title: 'Hotel Booking Benefit',
        description: 'Selected hotel booking assistance and campus visit lodging advice',
      },
      {
        title: 'Campus Visit Consultation',
        description: 'US school visit route and planning support',
      },
    ],
  };
};
