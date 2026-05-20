const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  return {
    success: true,
    profile: {
      name: 'Farland Guest',
      member_level: 'Farland Signature',
      points_balance: 3280,
    },
    today_itinerary: {
      date: '2026-06-03',
      city: 'Boston',
      title: 'Boston Campus Visit Day',
      summary: '全天访校行程，Farland 顾问已协调酒店出发、校园停靠、午间节奏与用车安排。',
      items: [
        {
          time: '09:00',
          type: 'departure',
          title: '酒店出发',
          description: 'Boston Marriott Cambridge 大堂集合，司机将提前抵达等候。',
        },
        {
          time: '10:00',
          type: 'campus',
          title: 'Harvard University',
          description: '校园参访与周边生活环境了解。',
        },
        {
          time: '13:00',
          type: 'campus',
          title: 'MIT Campus Visit',
          description: 'MIT 主校区参访，午餐时间根据现场节奏调整。',
        },
        {
          time: '16:00',
          type: 'campus',
          title: 'Boston College',
          description: '下午访校结束后返回酒店，晚餐可由顾问协助建议。',
        },
      ],
      driver: {
        name: 'David',
        phone: '+1 (617) 000-0000',
        vehicle: 'Chevrolet Suburban',
      },
      farland_contact: {
        name: 'Farland Advisor',
        phone: '+1 (800) 000-0000',
      },
    },
    trip_overview: [
      {
        day: 1,
        date: '2026-06-03',
        city: 'Boston',
        title: 'Boston Campus Visit',
        summary: 'Harvard / MIT / Boston College 访校与 Cambridge 周边住宿。',
      },
      {
        day: 2,
        date: '2026-06-04',
        city: 'New York',
        title: 'New York Transfer',
        summary: '跨城转场与酒店入住，顾问协助确认出发时间和行李安排。',
      },
    ],
    transportation_appointments: [
      {
        service_date: '2026-06-03',
        service_type: '访校包车',
        route_summary: 'Boston campus visit: Harvard / MIT / Boston College',
        status: 'assigned',
        driver_name: 'David',
        driver_phone: '+1 (617) 000-0000',
        vehicle_type: 'Suburban',
        vehicle_model: 'Chevrolet Suburban',
        plate_number: 'Confirmed',
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
        title: '机场接送礼遇',
        description: '指定城市机场接送服务可享 Farland 会员权益',
      },
      {
        title: '酒店预订礼遇',
        description: '顾问协助筛选校园周边与高端品牌酒店方案',
      },
      {
        title: '访校行程咨询',
        description: '美国学校参访动线、住宿区域与用车节奏建议',
      },
    ],
  };
};
