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
    today_itinerary: {
      date: '2026-06-03',
      city: 'Boston',
      title: 'Boston Campus Visit Day',
      summary: '全天访校行程，Farland 顾问已协调酒店出发、校园停靠和用车安排。',
      items: [
        {
          time: '09:00',
          type: 'departure',
          title: '酒店出发',
          description: 'Boston Marriott Cambridge 大堂集合出发。',
        },
        {
          time: '10:00',
          type: 'campus',
          title: 'Harvard University',
          description: '校园参访与周边环境了解。',
        },
        {
          time: '13:00',
          type: 'campus',
          title: 'MIT Campus Visit',
          description: 'MIT 主校区参访，午餐时间根据现场安排调整。',
        },
        {
          time: '16:00',
          type: 'campus',
          title: 'Boston College',
          description: '下午访校结束后返回酒店。',
        },
      ],
      driver: {
        name: 'David',
        phone: '+1 xxx',
        vehicle: 'Chevrolet Suburban',
      },
      farland_contact: {
        name: 'Farland Advisor',
        phone: '+1 xxx',
      },
    },
    trip_overview: [
      {
        day: 1,
        date: '2026-06-03',
        city: 'Boston',
        title: 'Boston Campus Visit',
        summary: 'Harvard / MIT / Boston College 访校与市区住宿。',
      },
      {
        day: 2,
        date: '2026-06-04',
        city: 'New York',
        title: 'New York Transfer',
        summary: '跨城转场与酒店入住，顾问协助确认时间。',
      },
    ],
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
