async function writeAuditLog(db, data) {
  await db.collection('audit_logs').add({
    data: {
      ...data,
      created_at: data.created_at || new Date().toISOString(),
    },
  });
}

const VERIFIED_AT = '2026-06-05';
const TRIP_NO = '2026XBC091';

const INTERNAL_KEYS = new Set([
  'openid',
  'customer_openid',
  'customer_user_id',
  'user_id',
  'driver_quotes',
  'driver_quote',
  'internal_note',
  'internal_notes',
  'operator_note',
  'operator_notes',
  'cost',
  'driver_cost',
  'margin',
]);

const UI_FLAGS = {
  show_route: false,
  show_travel_meta: false,
  show_contact_advisor: false,
  show_driver: false,
};

const TRIP091_DAY1_PICKUP = {
  pickup_time: '10:00',
  pickup_address: '284 Mattison Drive, Concord, MA 01742',
};

const TRIP091_CONFIRMED_DRIVER = {
  driver_name: '林飞航',
  driver_phone: '9298059888',
  vehicle_model: '2025 Sienna XLE 7座',
  vehicle_color: '黑色',
  plate_number: 'LUM5388',
  vehicle_summary: '2025 Sienna XLE 7座 · 黑色 · LUM5388',
};

const GOOGLE_MAPS_ROUTE_CHECKED_AT = '2026-06-05';
const GOOGLE_MAPS_ROUTE_CHECK_MODE = 'google_maps_and_waze_live_map_leave_now';

const MAP_ROUTE_CHECKS = {
  day1_boston_college: { drive_time_text: '0:45', distance_text: '22.2mi', traffic_text: 'Moderate', traffic_level: 'moderate', source_drive_time_text: '0:30-0:40', source_distance_text: '22.2mi', source_traffic_text: 'Group confirmed 10:00 departure, conservative 10:45 BC arrival', maps_duration_text: '28 min', maps_distance_text: '21.1 mi', maps_route_text: 'MA-2 E, I-95 S and MA-9 E/Boston - Worcester Tpke', maps_duration_minutes: 28, maps_delta_minutes: 17, maps_review_status: 'source_conservative_or_slack', waze_duration_text: '32 min', waze_distance_text: '21.9 miles', waze_route_text: 'I-95 S; Boylston St Newton', waze_duration_minutes: 32 },
  day1_babson: { drive_time_text: '0:35', distance_text: '8.5mi', traffic_text: 'Good', traffic_level: 'good', source_drive_time_text: '0:35', source_distance_text: '8.5mi', source_traffic_text: 'Group schedule buffer from 11:25 BC departure to 12:00 Babson arrival', maps_duration_text: '14 min', maps_distance_text: '7.0 mi', maps_route_text: 'Boylston Rd', maps_duration_minutes: 14, maps_delta_minutes: 21, maps_review_status: 'source_conservative_or_slack', waze_duration_text: '18 min', waze_distance_text: '8.5 miles', waze_route_text: 'Hammond Pond Pkwy, Boylston St Newton', waze_duration_minutes: 18 },
  day1_amherst: { drive_time_text: '2:10', distance_text: '89.9mi', traffic_text: 'Moderate', traffic_level: 'moderate', source_drive_time_text: '2:10', source_distance_text: '89.9mi', source_traffic_text: 'Group target before 15:00; conservative 14:30 arrival', maps_duration_text: '1 hr 37 min', maps_distance_text: '89.9 mi', maps_route_text: 'I-90 W', maps_duration_minutes: 97, maps_delta_minutes: 33, maps_review_status: 'source_conservative_or_slack', waze_duration_text: '1h 38m', waze_distance_text: '83.5 miles', waze_route_text: 'I-90 W - Mass Pike', waze_duration_minutes: 98 },
  day1_hotel: { drive_time_text: '2:15', distance_text: '86.9mi', traffic_text: 'Moderate', traffic_level: 'moderate', source_drive_time_text: '2:15', source_distance_text: '86.9mi', source_traffic_text: 'After Amherst self-guided visit; conservative hotel arrival buffer', maps_duration_text: '1 hr 42 min', maps_distance_text: '86.2 mi', maps_route_text: 'I-90 E', maps_duration_minutes: 102, maps_delta_minutes: 33, maps_review_status: 'source_conservative_or_slack', waze_duration_text: '1h 48m', waze_distance_text: '86.9 miles', waze_route_text: 'I-90 E - Mass Pike; SR-146 S', waze_duration_minutes: 108 },
  day2_brown: { drive_time_text: '0:06', distance_text: '1.1mi', traffic_text: 'Good', traffic_level: 'maps_current', source_drive_time_text: '0:10', source_distance_text: '0.9mi', source_traffic_text: 'Good', maps_duration_text: '6 min', maps_distance_text: '1.1 mi', maps_route_text: 'Canal St and Waterman St', maps_duration_minutes: 6, maps_delta_minutes: 4, maps_review_status: 'ok_within_tolerance' },
  day2_yale: { drive_time_text: '1:45', distance_text: '103mi', traffic_text: 'Moderate', traffic_level: 'maps_current', source_drive_time_text: '2:15', source_distance_text: '104.6mi', source_traffic_text: 'Moderate', maps_duration_text: '1 hr 45 min', maps_distance_text: '103 mi', maps_route_text: 'I-95 S', maps_duration_minutes: 105, maps_delta_minutes: 30, maps_review_status: 'source_conservative_or_slack' },
  day2_hotel: { drive_time_text: '0:19', distance_text: '16.2mi', traffic_text: 'Good', traffic_level: 'maps_current', source_drive_time_text: '0:25', source_distance_text: '16.3mi', source_traffic_text: 'Good', maps_duration_text: '19 min', maps_distance_text: '16.2 mi', maps_route_text: 'I-91 N', maps_duration_minutes: 19, maps_delta_minutes: 6, maps_review_status: 'ok_within_tolerance' },
  day3_midtown: { drive_time_text: '1:49', distance_text: '92.2mi', traffic_text: 'Moderate', traffic_level: 'maps_current', source_drive_time_text: '2:30', source_distance_text: '92mi', source_traffic_text: 'Moderate', maps_duration_text: '1 hr 49 min', maps_distance_text: '92.2 mi', maps_route_text: 'I-95 S', maps_duration_minutes: 109, maps_delta_minutes: 41, maps_review_status: 'source_conservative_or_slack' },
  day3_parks: { drive_time_text: '0:09', distance_text: '1.3mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '0:20', source_distance_text: '1.5mi', source_traffic_text: 'Heavy', maps_duration_text: '9 min', maps_distance_text: '1.3 mi', maps_route_text: '8th Ave and W 59th St/Central Park S', maps_duration_minutes: 9, maps_delta_minutes: 11, maps_review_status: 'ok_within_tolerance' },
  day3_hotel: { drive_time_text: '0:03', distance_text: '0.4mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '0:15', source_distance_text: '0.9mi', source_traffic_text: 'Heavy', maps_duration_text: '3 min', maps_distance_text: '0.4 mile', maps_route_text: '6th Ave/Ave of the Americas and W 47th St', maps_duration_minutes: 3, maps_delta_minutes: 12, maps_review_status: 'ok_within_tolerance' },
  day4_nyu: { drive_time_text: '0:18', distance_text: '2.6mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '0:35', source_distance_text: '2.8mi', source_traffic_text: 'Heavy', maps_duration_text: '18 min', maps_distance_text: '2.6 mi', maps_route_text: '7th Ave', maps_duration_minutes: 18, maps_delta_minutes: 17, maps_review_status: 'ok_within_tolerance' },
  day4_columbia: { drive_time_text: '0:40', distance_text: '6.8mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '0:40', source_distance_text: '6.6mi', source_traffic_text: 'Heavy', maps_duration_text: '40 min', maps_distance_text: '6.8 mi', maps_route_text: 'Madison Ave', maps_duration_minutes: 40, maps_delta_minutes: 0, maps_review_status: 'ok_within_tolerance' },
  day4_hotel: { drive_time_text: '0:25', distance_text: '6.7mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '0:40', source_distance_text: '5mi', source_traffic_text: 'Heavy', maps_duration_text: '25 min', maps_distance_text: '6.7 mi', maps_route_text: 'NY-9A S', maps_duration_minutes: 25, maps_delta_minutes: 15, maps_review_status: 'ok_within_tolerance' },
  day5_upenn: { drive_time_text: '1:50', distance_text: '103mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '2:30', source_distance_text: '98.1mi', source_traffic_text: 'Heavy', maps_duration_text: '1 hr 50 min', maps_distance_text: '103 mi', maps_route_text: 'I-95 S', maps_duration_minutes: 110, maps_delta_minutes: 40, maps_review_status: 'source_conservative_or_slack' },
  day5_swarthmore: { drive_time_text: '0:25', distance_text: '15.5mi', traffic_text: 'Moderate', traffic_level: 'maps_current', source_drive_time_text: '0:35', source_distance_text: '10.5mi', source_traffic_text: 'Moderate', maps_duration_text: '25 min', maps_distance_text: '15.5 mi', maps_route_text: 'I-95 S', maps_duration_minutes: 25, maps_delta_minutes: 10, maps_review_status: 'ok_within_tolerance' },
  day5_hotel: { drive_time_text: '0:24', distance_text: '19.2mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '0:50', source_distance_text: '17.2mi', source_traffic_text: 'Heavy', maps_duration_text: '24 min', maps_distance_text: '19.2 mi', maps_route_text: 'I-476 N', maps_duration_minutes: 24, maps_delta_minutes: 26, maps_review_status: 'source_conservative_or_slack' },
  day6_georgetown: { drive_time_text: '2:38', distance_text: '150mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '3:45', source_distance_text: '147mi', source_traffic_text: 'Heavy', maps_duration_text: '2 hr 38 min', maps_distance_text: '150 mi', maps_route_text: 'I-95 S', maps_duration_minutes: 158, maps_delta_minutes: 67, maps_review_status: 'source_conservative_or_slack' },
  day6_museums: { drive_time_text: '0:11', distance_text: '3.3mi', traffic_text: 'Moderate', traffic_level: 'maps_current', source_drive_time_text: '0:20', source_distance_text: '3.7mi', source_traffic_text: 'Moderate', maps_duration_text: '11 min', maps_distance_text: '3.3 mi', maps_route_text: 'Constitution Ave. NW', maps_duration_minutes: 11, maps_delta_minutes: 9, maps_review_status: 'ok_within_tolerance' },
  day6_hotel: { drive_time_text: '0:20', distance_text: '5.8mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '0:20', source_distance_text: '4.3mi', source_traffic_text: 'Heavy', maps_duration_text: '20 min', maps_distance_text: '5.8 mi', maps_route_text: 'Independence Ave SW and Rock Creek and Potomac Pkwy NW', maps_duration_minutes: 20, maps_delta_minutes: 0, maps_review_status: 'ok_within_tolerance' },
  day7_monuments: { drive_time_text: '0:16', distance_text: '3.4mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '0:25', source_distance_text: '3mi', source_traffic_text: 'Heavy', maps_duration_text: '16 min', maps_distance_text: '3.4 mi', maps_route_text: 'Massachusetts Ave NW', maps_duration_minutes: 16, maps_delta_minutes: 9, maps_review_status: 'ok_within_tolerance' },
  day7_capitol_hill: { drive_time_text: '0:14', distance_text: '3.2mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '0:25', source_distance_text: '2.6mi', source_traffic_text: 'Heavy', maps_duration_text: '14 min', maps_distance_text: '3.2 mi', maps_route_text: 'Independence Ave SW', maps_duration_minutes: 14, maps_delta_minutes: 11, maps_review_status: 'ok_within_tolerance' },
  day7_hotel: { drive_time_text: '0:23', distance_text: '6.4mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '0:30', source_distance_text: '5.1mi', source_traffic_text: 'Heavy', maps_duration_text: '23 min', maps_distance_text: '6.4 mi', maps_route_text: 'Independence Ave SE and Rock Creek and Potomac Pkwy NW', maps_duration_minutes: 23, maps_delta_minutes: 7, maps_review_status: 'ok_within_tolerance' },
  day8_iad: { drive_time_text: '0:32', distance_text: '23.9mi', traffic_text: 'Moderate', traffic_level: 'maps_current', source_drive_time_text: '1:00', source_distance_text: '27.6mi', source_traffic_text: 'Moderate', maps_duration_text: '32 min', maps_distance_text: '23.9 mi', maps_route_text: 'I-66 W and Dulles Access Rd', maps_duration_minutes: 32, maps_delta_minutes: 28, maps_review_status: 'source_conservative_or_slack' },
  day8_hotel: { drive_time_text: '0:35', distance_text: '26.0mi', traffic_text: 'Heavy', traffic_level: 'maps_current', source_drive_time_text: '1:10', source_distance_text: '22.6mi', source_traffic_text: 'Heavy', maps_duration_text: '35 min', maps_distance_text: '26.0 mi', maps_route_text: 'I-90 E', maps_duration_minutes: 35, maps_delta_minutes: 35, maps_review_status: 'source_conservative_or_slack' },
};

const CARD_ROUTE_CHECK_IDS = {
  '091_day1_boston_college': 'day1_boston_college',
  '091_day1_babson_college': 'day1_babson',
  '091_day1_amherst_college': 'day1_amherst',
  '091_day1_renaissance_providence': 'day1_hotel',
  '091_day2_brown_university': 'day2_brown',
  '091_day2_yale_university': 'day2_yale',
  '091_day2_hilton_wallingford': 'day2_hotel',
  '091_day3_times_square': 'day3_midtown',
  '091_day3_rockefeller_center': 'day3_midtown',
  '091_day3_fifth_avenue': 'day3_midtown',
  '091_day3_central_park': 'day3_parks',
  '091_day3_bryant_park': 'day3_parks',
  '091_day3_riu_manhattan': 'day3_hotel',
  '091_day4_new_york_university': 'day4_nyu',
  '091_day4_columbia_university': 'day4_columbia',
  '091_day4_riu_manhattan': 'day4_hotel',
  '091_day5_university_of_pennsylvania': 'day5_upenn',
  '091_day5_swarthmore_college': 'day5_swarthmore',
  '091_day5_hyatt_king_of_prussia': 'day5_hotel',
  '091_day6_georgetown_university': 'day6_georgetown',
  '091_day6_natural_history_museum': 'day6_museums',
  '091_day6_air_space_museum': 'day6_museums',
  '091_day6_glover_georgetown': 'day6_hotel',
  '091_day7_white_house': 'day7_monuments',
  '091_day7_us_capitol': 'day7_monuments',
  '091_day7_lincoln_memorial': 'day7_monuments',
  '091_day7_capitol_hill': 'day7_capitol_hill',
  '091_day7_library_of_congress': 'day7_capitol_hill',
  '091_day7_supreme_court_exterior': 'day7_capitol_hill',
  '091_day7_glover_georgetown': 'day7_hotel',
  '091_day8_ua2331_iad_ord': 'day8_iad',
  '091_day8_study_chicago': 'day8_hotel',
};

const TYPE_TEXT = {
  school_visit_card: '访校',
  landmark_card: '景点',
  museum_card: '博物馆',
  meeting_card: '会面',
  flight_card: '航班',
  hotel_arrival_card: '酒店',
  custom_activity_card: '活动',
};

const LEGACY_TYPE = {
  school_visit_card: 'school_visit',
  landmark_card: 'landmark',
  museum_card: 'museum',
  meeting_card: 'meeting',
  flight_card: 'flight',
  hotel_arrival_card: 'hotel_arrival',
  custom_activity_card: 'custom',
};

function ref(title, url, sourceType = 'official') {
  return { title, url, source_type: sourceType };
}

const SOURCES = {
  bu: [
    ref('Boston University Facts and Rankings', 'https://www.bu.edu/admissions/why-bu/facts-and-rankings'),
    ref('Boston University About', 'https://www.bu.edu/about/'),
  ],
  boston_college: [
    ref('Boston College About', 'https://www.bc.edu/bc-web/about.html'),
    ref('Boston College Office of Undergraduate Admission', 'https://www.bc.edu/bc-web/admission.html'),
  ],
  babson: [
    ref('Babson College About', 'https://www.babson.edu/about/'),
    ref('Babson College Undergraduate Admission', 'https://www.babson.edu/admission/undergraduate-school/'),
  ],
  amherst: [
    ref('Amherst College Fast Facts', 'https://www.amherst.edu/about/facts'),
    ref('Contact Amherst College', 'https://www.amherst.edu/people/contact'),
  ],
  brown: [
    ref('Brown University About', 'https://www.brown.edu/'),
    ref('Brown University Contact', 'https://www.brown.edu/about/contact-us'),
  ],
  yale: [
    ref('Visiting Yale University', 'https://www.yale.edu/about-yale/visiting'),
    ref('Yale Visitor Center Plan Your Visit', 'https://visitorcenter.yale.edu/plan-your-visit'),
  ],
  nyu: [
    ref('About NYU', 'https://www.nyu.edu/about.html'),
  ],
  columbia: [
    ref('Columbia University', 'https://www.columbia.edu/'),
    ref('Columbia Statistics and Facts', 'https://www.columbia.edu/content/statistics-and-facts'),
  ],
  upenn: [
    ref('University of Pennsylvania Facts', 'https://www.upenn.edu/about/facts'),
    ref('University of Pennsylvania About', 'https://www.upenn.edu/about'),
  ],
  swarthmore: [
    ref('Swarthmore by the Numbers', 'https://www.swarthmore.edu/meet-swarthmore/swarthmore-numbers'),
    ref('Swarthmore Directions', 'https://www.swarthmore.edu/admissions-aid/how-to-get-here-where-to-stay'),
  ],
  georgetown: [
    ref('Georgetown University Key Facts', 'https://www.georgetown.edu/about/key-facts/'),
    ref('About Georgetown University', 'https://www.georgetown.edu/about'),
  ],
  times_square: [
    ref('Britannica Times Square', 'https://www.britannica.com/topic/Times-Square', 'reference'),
  ],
  rockefeller: [
    ref('Rockefeller Center History', 'https://www.rockefellercenter.com/art-and-history/history/'),
    ref('Rockefeller Center Tour', 'https://www.rockefellercenter.com/rockefeller-center-tour'),
  ],
  fifth_avenue: [
    ref('Fifth Avenue Association', 'https://fifthavenue.nyc/'),
  ],
  central_park: [
    ref('Central Park Conservancy Park History', 'https://www.centralparknyc.org/park-history'),
    ref('Central Park Digital Guide', 'https://www.centralparknyc.org/explore-the-central-park-digital-guide'),
  ],
  bryant_park: [
    ref('NYC Parks Bryant Park', 'https://www.nycgovparks.org/parks/bryant-park'),
  ],
  white_house: [
    ref('White House Visit', 'https://www.whitehouse.gov/visit/'),
    ref('NPS White House', 'https://www.nps.gov/places/white-house.htm'),
  ],
  capitol: [
    ref('Visit the U.S. Capitol', 'https://www.visitthecapitol.gov/visit'),
    ref('U.S. Capitol Visitor Guide', 'https://www.visitthecapitol.gov/us-capitol-visitor-guide'),
  ],
  lincoln: [
    ref('NPS Lincoln Memorial', 'https://home.nps.gov/places/000/lincoln-memorial.htm'),
  ],
  capitol_hill: [
    ref('U.S. Capitol Police Visiting Capitol Hill', 'https://www.uscp.gov/visiting-capitol-hill'),
    ref('Washington.org Capitol Hill', 'https://www.washington.org/dc-neighborhoods/capitol-hill'),
  ],
  loc: [
    ref('Library of Congress Visiting', 'https://lcweb2.loc.gov/visit'),
  ],
  supreme_court: [
    ref('Supreme Court Building', 'https://www.supremecourt.gov/about/courtbuilding.aspx'),
  ],
  natural_history: [
    ref('Smithsonian Natural History About', 'https://naturalhistory.si.edu/about'),
    ref('Smithsonian Natural History Collections', 'https://naturalhistory.si.edu/research/collections-national-museum-natural-history'),
  ],
  air_space: [
    ref('National Air and Space Museum', 'https://airandspace.si.edu/'),
    ref('Washington.org Air and Space Museum Guide', 'https://washington.org/DC-guide-to/smithsonian-national-air-and-space-museum'),
  ],
  renaissance: [
    ref('Marriott Renaissance Providence Downtown Hotel', 'https://www.marriott.com/en-us/hotels/pvdbr-renaissance-providence-downtown-hotel/overview/'),
  ],
  hilton_wallingford: [
    ref('Hilton Garden Inn Wallingford/Meriden', 'https://www.hilton.com/en/hotels/hvnwmgi-hilton-garden-inn-wallingford-meriden/'),
  ],
  riu_manhattan: [
    ref('Hotel Riu Plaza Manhattan Times Square', 'https://www.riu.com/en/hotel/usa/new-york/hotel-riu-plaza-manhattan-times-square/'),
  ],
  hyatt_kop: [
    ref('Hyatt House Philadelphia/King of Prussia', 'https://www.hyatt.com/en-US/hotel/pennsylvania/hyatt-house-philadelphia-king-of-prussia/phlxk'),
  ],
  glover: [
    ref('Glover Park Hotel Georgetown', 'https://thegloverparkhotel.com/'),
    ref('Washington.org Glover Park Hotel Georgetown', 'https://www.washington.org/find-dc-listings/glover-park-hotel-georgetown'),
  ],
  study_chicago: [
    ref('The Study at the University of Chicago Contact', 'https://www.thestudyatuniversityofchicago.com/contact'),
  ],
};

const ENTITIES = {
  boston_university: {
    entity_type: 'school',
    entity_subtype: 'private_research_university',
    name_en: 'Boston University',
    name_zh: '波士顿大学',
    entity_type_text: '私立研究型大学',
    city: 'Boston',
    state: 'MA',
    address: '881 Commonwealth Ave, Boston, MA 02215',
    ranking_badges: [{ system: 'US News', year: 2026, display_text: 'US News National Universities #42' }],
    intro_lines: [
      '波士顿大学位于波士顿核心城区，城市资源、科研机会和专业选择都很密集。',
      '校园节奏偏职业导向，适合想在大城市中接触传媒、商科、工程、健康科学和跨学科资源的学生。',
    ],
    strengths: [
      { title: 'Questrom 商学院', desc: '商业、管理、商业分析和创业资源适合职业目标明确的学生。' },
      { title: 'College of Communication', desc: '新闻、传媒、电影电视和公共传播方向辨识度高。' },
      { title: 'Health Sciences', desc: '健康科学、康复科学和医学相关资源与城市医疗生态连接紧密。' },
    ],
    fit_tags: ['城市型校园', '研究型大学', '商科/传媒', '健康科学'],
    source_refs: SOURCES.bu,
  },
  boston_college: {
    entity_type: 'school',
    entity_subtype: 'private_jesuit_research_university',
    name_en: 'Boston College',
    name_zh: '波士顿学院',
    entity_type_text: '私立天主教研究型大学',
    city: 'Chestnut Hill',
    state: 'MA',
    address: '140 Commonwealth Avenue, Chestnut Hill, MA 02467',
    ranking_badges: [{ system: 'Profile', year: 2026, display_text: 'Jesuit Research University' }],
    intro_lines: [
      '波士顿学院位于 Chestnut Hill，校园气质更偏传统学院式，同时离波士顿市区资源不远。',
      '访校时可以重点观察校园社区、核心课程氛围、商科与人文社科资源，以及学生生活的凝聚力。',
    ],
    strengths: [
      { title: 'Carroll School of Management', desc: '商科、金融、会计和管理方向是家长和学生常重点比较的资源。' },
      { title: 'Liberal Arts Core', desc: '核心课程强调人文、伦理和跨学科基础，适合重视本科通识训练的学生。' },
      { title: 'Boston Access', desc: '靠近波士顿都市圈，兼具校园社区和城市实习、医疗、金融资源。' },
    ],
    fit_tags: ['波士顿周边', '学院式校园', '商科', '人文社科'],
    source_refs: SOURCES.boston_college,
  },
  babson_college: {
    entity_type: 'school',
    entity_subtype: 'private_business_college',
    name_en: 'Babson College',
    name_zh: '巴布森学院',
    entity_type_text: '私立商科与创业学院',
    city: 'Wellesley',
    state: 'MA',
    address: '231 Forest Street, Babson Park, MA 02457',
    ranking_badges: [{ system: 'Profile', year: 2026, display_text: 'Entrepreneurship-focused College' }],
    intro_lines: [
      '巴布森学院以创业教育和本科商科体验见长，校园规模不大，节奏更偏实践和项目驱动。',
      '短停参观时可以重点看校园尺度、商科课程氛围、创业资源和学生项目展示空间。',
    ],
    strengths: [
      { title: 'Entrepreneurship', desc: '创业教育是学校最有辨识度的方向，适合有商业实践兴趣的学生。' },
      { title: 'Business Foundation', desc: '本科阶段围绕商业基础、团队项目和实践决策训练展开。' },
      { title: 'Small Campus', desc: '校园紧凑，适合短时间快速感受学习氛围和生活尺度。' },
    ],
    fit_tags: ['创业', '本科商科', '小型校园', '实践导向'],
    source_refs: SOURCES.babson,
  },
  amherst_college: {
    entity_type: 'school',
    entity_subtype: 'liberal_arts_college',
    name_en: 'Amherst College',
    name_zh: '阿默斯特学院',
    entity_type_text: '私立文理学院',
    city: 'Amherst',
    state: 'MA',
    address: '220 South Pleasant Street, Amherst, MA 01002',
    ranking_badges: [{ system: 'Profile', year: 2026, display_text: 'Top Liberal Arts College' }],
    intro_lines: [
      '阿默斯特学院是小规模、高选择性的文理学院，课堂讨论和师生互动是体验重点。',
      '开放课程体系给学生很高的选课自主度，也适合还在探索专业方向但学术能力强的学生。',
    ],
    strengths: [
      { title: 'Open Curriculum', desc: '课程选择自由，鼓励学生主动设计学术路径。' },
      { title: 'Five College Consortium', desc: '可借助区域联盟接触更广课程和学术资源。' },
      { title: 'Undergraduate Focus', desc: '本科教学和师生关系是文理学院体验核心。' },
    ],
    fit_tags: ['文理学院', '小班教学', '开放课程', '学术探索'],
    source_refs: SOURCES.amherst,
  },
  brown_university: {
    entity_type: 'school',
    entity_subtype: 'ivy_research_university',
    name_en: 'Brown University',
    name_zh: '布朗大学',
    entity_type_text: '常春藤私立研究型大学',
    city: 'Providence',
    state: 'RI',
    address: 'Providence, RI 02912',
    ranking_badges: [{ system: 'Profile', year: 2026, display_text: 'Ivy League' }],
    intro_lines: [
      '布朗大学以开放课程和本科自主探索闻名，学生可以用较高自由度组合自己的学术路径。',
      '学校位于普罗维登斯，兼具常春藤研究资源和较强的本科教学参与感。',
    ],
    strengths: [
      { title: 'Open Curriculum', desc: '适合自驱力强、希望跨学科组合课程的学生。' },
      { title: 'Undergraduate College', desc: '本科教育强调独立思考和创造性探索。' },
      { title: 'Medical / Engineering / Public Affairs', desc: '医学、工程、公共事务和跨学科研究资源活跃。' },
    ],
    fit_tags: ['常春藤', '开放课程', '跨学科', '本科体验'],
    source_refs: SOURCES.brown,
  },
  yale_university: {
    entity_type: 'school',
    entity_subtype: 'ivy_research_university',
    name_en: 'Yale University',
    name_zh: '耶鲁大学',
    entity_type_text: '常春藤私立研究型大学',
    city: 'New Haven',
    state: 'CT',
    address: '149 Elm Street, New Haven, CT 06511',
    ranking_badges: [{ system: 'Profile', year: 2026, display_text: 'Ivy League' }],
    intro_lines: [
      '耶鲁大学坐落在纽黑文，校园建筑、人文传统、博物馆和住宿学院系统是访校观察重点。',
      '适合关注人文社科、艺术、公共事务、基础科学和强社区型本科体验的学生。',
    ],
    strengths: [
      { title: 'Residential Colleges', desc: '住宿学院系统塑造紧密的学生社区和校友传统。' },
      { title: 'Humanities & Arts', desc: '人文、艺术、戏剧、音乐和博物馆资源突出。' },
      { title: 'Research University', desc: '研究型大学资源覆盖科学、工程、医学和公共事务。' },
    ],
    fit_tags: ['常春藤', '住宿学院', '人文艺术', '研究资源'],
    source_refs: SOURCES.yale,
  },
  nyu: {
    entity_type: 'school',
    entity_subtype: 'private_research_university',
    name_en: 'New York University',
    name_zh: '纽约大学',
    entity_type_text: '私立研究型大学',
    city: 'New York',
    state: 'NY',
    address: 'New York, NY 10003',
    ranking_badges: [{ system: 'Profile', year: 2026, display_text: 'Global Network University' }],
    intro_lines: [
      '纽约大学以纽约市为校园核心，学术、实习、艺术和行业资源与城市高度连接。',
      '全球校区和海外学习网络适合希望把城市经验、国际视野和专业学习结合的学生。',
    ],
    strengths: [
      { title: 'Stern / Business', desc: '商科、金融、市场和创业方向与纽约行业生态联系紧密。' },
      { title: 'Tisch / Arts', desc: '电影、戏剧、表演和艺术相关方向辨识度高。' },
      { title: 'Global Study Away', desc: '海外学习点和国际校区提供多城市学习路径。' },
    ],
    fit_tags: ['纽约市区', '全球网络', '商科艺术', '职业资源'],
    source_refs: SOURCES.nyu,
  },
  columbia_university: {
    entity_type: 'school',
    entity_subtype: 'ivy_research_university',
    name_en: 'Columbia University',
    name_zh: '哥伦比亚大学',
    entity_type_text: '常春藤私立研究型大学',
    city: 'New York',
    state: 'NY',
    address: '116th and Broadway, New York, NY 10027',
    ranking_badges: [{ system: 'Profile', year: 2026, display_text: 'Ivy League' }],
    intro_lines: [
      '哥伦比亚大学位于曼哈顿晨边高地，兼具常春藤研究资源和纽约城市机会。',
      '核心课程、人文传统、新闻与国际事务资源，是访校时值得重点观察的部分。',
    ],
    strengths: [
      { title: 'Core Curriculum', desc: '核心课程强调经典文本、写作和跨学科共同基础。' },
      { title: 'Journalism / Public Affairs', desc: '新闻、国际事务、公共政策和城市研究资源突出。' },
      { title: 'New York Access', desc: '纽约的文化、金融、传媒和非营利生态可转化为学习机会。' },
    ],
    fit_tags: ['常春藤', '纽约资源', '核心课程', '公共事务'],
    source_refs: SOURCES.columbia,
  },
  upenn: {
    entity_type: 'school',
    entity_subtype: 'ivy_research_university',
    name_en: 'University of Pennsylvania',
    name_zh: '宾夕法尼亚大学',
    entity_type_text: '常春藤私立研究型大学',
    city: 'Philadelphia',
    state: 'PA',
    address: 'Philadelphia, PA 19104',
    ranking_badges: [{ system: 'Profile', year: 2026, display_text: 'Ivy League' }],
    intro_lines: [
      '宾夕法尼亚大学位于费城大学城，研究资源、职业导向和跨学院学习机会都很强。',
      '学校历史悠久，商科、工程、护理、传播、生命科学和公共服务资源适合重点了解。',
    ],
    strengths: [
      { title: 'Wharton', desc: '商科、金融、管理和创业方向是 Penn 最有辨识度的资源之一。' },
      { title: 'Interdisciplinary Study', desc: '跨学院双学位、辅修和研究机会选择丰富。' },
      { title: 'Civic Engagement', desc: '费城社区服务和城市实践资源适合公共服务导向学生。' },
    ],
    fit_tags: ['常春藤', '商科强', '跨学院', '城市实践'],
    source_refs: SOURCES.upenn,
  },
  swarthmore_college: {
    entity_type: 'school',
    entity_subtype: 'liberal_arts_college',
    name_en: 'Swarthmore College',
    name_zh: '斯沃斯莫尔学院',
    entity_type_text: '私立文理学院',
    city: 'Swarthmore',
    state: 'PA',
    address: '500 College Avenue, Swarthmore, PA 19081',
    ranking_badges: [{ system: 'Profile', year: 2026, display_text: 'Top Liberal Arts College' }],
    intro_lines: [
      '斯沃斯莫尔学院是学术强度很高的文理学院，兼具小班讨论和严谨研究训练。',
      '学校靠近费城，并可通过三校联盟和宾大交叉注册拓展课程资源。',
    ],
    strengths: [
      { title: 'Honors Program', desc: '荣誉项目和研讨式学习强调深入阅读、写作和口头表达。' },
      { title: 'Tri-College Consortium', desc: '与 Bryn Mawr、Haverford 形成课程互补。' },
      { title: 'Penn Cross-Registration', desc: '部分课程资源可延伸到宾夕法尼亚大学。' },
    ],
    fit_tags: ['文理学院', '高学术强度', '小班研讨', '费城周边'],
    source_refs: SOURCES.swarthmore,
  },
  georgetown_university: {
    entity_type: 'school',
    entity_subtype: 'private_research_university',
    name_en: 'Georgetown University',
    name_zh: '乔治城大学',
    entity_type_text: '私立研究型大学',
    city: 'Washington',
    state: 'DC',
    address: '3700 O Street NW, Washington, DC 20057',
    ranking_badges: [{ system: 'Profile', year: 2026, display_text: 'Washington DC Research University' }],
    intro_lines: [
      '乔治城大学位于华盛顿 DC，国际关系、公共政策、商科和外交资源与首都位置紧密相关。',
      '校园兼具传统学院氛围和城市政策生态，适合关注全球事务和公共服务的学生。',
    ],
    strengths: [
      { title: 'Walsh School of Foreign Service', desc: '国际关系、外交、区域研究和全球事务方向辨识度高。' },
      { title: 'McDonough Business School', desc: '商科课程与首都政策、咨询和国际商业资源相连。' },
      { title: 'Jesuit Education', desc: '强调公共服务、伦理思考和跨文化理解。' },
    ],
    fit_tags: ['华盛顿DC', '国际关系', '公共政策', '商科'],
    source_refs: SOURCES.georgetown,
  },
  times_square: {
    entity_type: 'landmark',
    entity_subtype: 'city_landmark',
    name_en: 'Times Square',
    name_zh: '时代广场',
    city: 'New York',
    area: 'Midtown Manhattan',
    address: 'Broadway, Seventh Avenue and 42nd Street, New York, NY',
    landmark_type: '城市地标 / 剧院区',
    intro_lines: [
      '时代广场是纽约最具辨识度的城市地标之一，霓虹广告牌、百老汇剧院和人流共同构成典型的曼哈顿节奏。',
      '这里适合作为纽约城市观光的第一张名片，观察商业娱乐、公共空间和城市品牌如何叠加在一起。',
    ],
    highlight_tags: ['城市地标', '百老汇', '夜景', '商业娱乐'],
    source_refs: SOURCES.times_square,
  },
  rockefeller_center: {
    entity_type: 'landmark',
    entity_subtype: 'architecture_complex',
    name_en: 'Rockefeller Center',
    name_zh: '洛克菲勒中心',
    city: 'New York',
    area: 'Midtown Manhattan',
    address: '45 Rockefeller Plaza, New York, NY 10111',
    landmark_type: '历史建筑群 / Art Deco',
    intro_lines: [
      '洛克菲勒中心是曼哈顿 Art Deco 建筑群代表，广场、公共艺术和观景体验共同构成经典纽约空间。',
      '访客可以重点看建筑细节、公共艺术和城市商业综合体如何组织人流与景观。',
    ],
    highlight_tags: ['Art Deco', '建筑', '公共艺术', '观景'],
    source_refs: SOURCES.rockefeller,
  },
  fifth_avenue: {
    entity_type: 'landmark',
    entity_subtype: 'avenue_district',
    name_en: 'Fifth Avenue',
    name_zh: '第五大道',
    city: 'New York',
    area: 'Midtown / Upper Manhattan',
    address: 'Fifth Avenue, New York, NY',
    landmark_type: '街区 / 商业大道',
    intro_lines: [
      '第五大道连接奢侈品旗舰店、历史建筑、博物馆和城市橱窗，是纽约商业与文化景观的代表街道。',
      '这一站适合把购物街区、城市建筑立面和曼哈顿步行体验放在一起观察。',
    ],
    highlight_tags: ['购物街区', '城市建筑', '旗舰店', '曼哈顿'],
    source_refs: SOURCES.fifth_avenue,
  },
  central_park: {
    entity_type: 'landmark',
    entity_subtype: 'urban_park',
    name_en: 'Central Park',
    name_zh: '中央公园',
    city: 'New York',
    area: 'Manhattan',
    address: 'Central Park, New York, NY',
    landmark_type: '城市公园',
    intro_lines: [
      '中央公园是纽约最重要的公共绿地之一，以湖面、草坪、步道和历史景观组织出城市中的休憩空间。',
      '这张卡适合关注城市规划、公共空间、自然景观和纽约居民日常生活。',
    ],
    highlight_tags: ['城市公园', '公共空间', '自然景观', '步行'],
    source_refs: SOURCES.central_park,
  },
  bryant_park: {
    entity_type: 'landmark',
    entity_subtype: 'urban_park',
    name_en: 'Bryant Park',
    name_zh: '布莱恩特公园',
    city: 'New York',
    area: 'Midtown Manhattan',
    address: 'Between Fifth and Sixth Avenues, 40th to 42nd Streets, New York, NY',
    landmark_type: '城市公园 / 中城公共空间',
    intro_lines: [
      '布莱恩特公园位于曼哈顿中城，紧邻纽约公共图书馆，是城市核心区中尺度宜人的公共空间。',
      '适合观察纽约如何在高密度街区中保留休息、活动和社区节奏。',
    ],
    highlight_tags: ['中城公园', '公共空间', '纽约公共图书馆', '城市休憩'],
    source_refs: SOURCES.bryant_park,
  },
  white_house: {
    entity_type: 'landmark',
    entity_subtype: 'government_landmark',
    name_en: 'The White House',
    name_zh: '白宫',
    city: 'Washington',
    area: 'President’s Park',
    address: '1600 Pennsylvania Avenue NW, Washington, DC 20500',
    landmark_type: '政府建筑 / 总统官邸',
    intro_lines: [
      '白宫是美国总统官邸和行政象征，也是华盛顿 DC 最具代表性的政治地标。',
      '如果无法入内参观，外景和游客中心仍适合了解建筑历史、总统制度和国家仪式空间。',
    ],
    highlight_tags: ['政治地标', '历史建筑', '总统官邸', '外景'],
    source_refs: SOURCES.white_house,
  },
  us_capitol: {
    entity_type: 'landmark',
    entity_subtype: 'government_landmark',
    name_en: 'U.S. Capitol',
    name_zh: '国会大厦',
    city: 'Washington',
    area: 'Capitol Hill',
    address: 'First Street SE, Washington, DC 20004',
    landmark_type: '政府建筑 / 立法机构',
    intro_lines: [
      '国会大厦是美国国会所在地，圆顶、大厅、艺术收藏和参观路线共同呈现美国立法制度的象征空间。',
      '这一站适合关注建筑、政治制度和华盛顿国家级轴线的关系。',
    ],
    highlight_tags: ['国会', '建筑', '政治制度', '导览'],
    source_refs: SOURCES.capitol,
  },
  lincoln_memorial: {
    entity_type: 'landmark',
    entity_subtype: 'memorial',
    name_en: 'Lincoln Memorial',
    name_zh: '林肯纪念堂',
    city: 'Washington',
    area: 'National Mall',
    address: '2 Lincoln Memorial Circle NW, Washington, DC 20002',
    landmark_type: '纪念建筑',
    intro_lines: [
      '林肯纪念堂面向倒影池和华盛顿纪念碑，是国家广场中最具仪式感的纪念建筑之一。',
      '这里适合理解林肯在美国历史中的位置，以及纪念空间如何承载公共演讲和民权记忆。',
    ],
    highlight_tags: ['纪念建筑', '国家广场', '美国历史', '民权记忆'],
    source_refs: SOURCES.lincoln,
  },
  capitol_hill: {
    entity_type: 'landmark',
    entity_subtype: 'historic_neighborhood',
    name_en: 'Capitol Hill',
    name_zh: '国会山',
    city: 'Washington',
    area: 'Capitol Hill',
    address: 'Capitol Hill, Washington, DC',
    landmark_type: '历史街区 / 政府区',
    intro_lines: [
      '国会山既是美国立法机构所在区域，也是由历史住宅、办公楼、图书馆和法院组成的可步行街区。',
      '这一站适合把政治建筑群、城市街区和华盛顿日常工作节奏放在一起观察。',
    ],
    highlight_tags: ['政府区', '历史街区', '城市步行', '国会周边'],
    source_refs: SOURCES.capitol_hill,
  },
  library_of_congress: {
    entity_type: 'landmark',
    entity_subtype: 'library',
    name_en: 'Library of Congress',
    name_zh: '国会图书馆',
    city: 'Washington',
    area: 'Capitol Hill',
    address: '101 Independence Avenue SE, Washington, DC 20540',
    landmark_type: '图书馆 / 历史建筑',
    intro_lines: [
      '国会图书馆是美国重要文化机构，建筑装饰、阅览空间和馆藏体系都值得重点观察。',
      '访客通常关注 Thomas Jefferson Building 的室内装饰、主阅览室视角和展览内容。',
    ],
    highlight_tags: ['图书馆', '建筑装饰', '文化机构', '展览'],
    source_refs: SOURCES.loc,
  },
  supreme_court_exterior: {
    entity_type: 'landmark',
    entity_subtype: 'government_landmark',
    name_en: 'Supreme Court Exterior',
    name_zh: '最高法院外景',
    city: 'Washington',
    area: 'Capitol Hill',
    address: '1 First Street NE, Washington, DC 20543',
    landmark_type: '政府建筑 / 司法机构',
    intro_lines: [
      '美国最高法院大楼位于国会山附近，是联邦司法体系最具代表性的建筑符号。',
      '外景可重点看新古典立面、台阶、柱廊和它与国会建筑群之间的空间关系。',
    ],
    highlight_tags: ['司法机构', '新古典建筑', '外景', '国会山'],
    source_refs: SOURCES.supreme_court,
  },
  natural_history_museum: {
    entity_type: 'museum',
    entity_subtype: 'natural_history_museum',
    name_en: 'National Museum of Natural History',
    name_zh: '国家自然历史博物馆',
    city: 'Washington',
    area: 'National Mall',
    address: '10th Street & Constitution Avenue NW, Washington, DC 20560',
    museum_group: 'Smithsonian',
    landmark_type: '博物馆 / 自然科学',
    intro_lines: [
      '国家自然历史博物馆收藏覆盖地球生命、地质、人类文化和自然科学，是 Smithsonian 体系中最适合亲子和学生观察的场馆之一。',
      '这站适合重点看标本、化石、矿物和科学研究如何转化为公众展览。',
    ],
    highlight_tags: ['自然科学', '化石', '矿物', '亲子友好'],
    source_refs: SOURCES.natural_history,
  },
  air_space_museum: {
    entity_type: 'museum',
    entity_subtype: 'air_space_museum',
    name_en: 'National Air and Space Museum',
    name_zh: '国家航空航天博物馆',
    city: 'Washington',
    area: 'National Mall',
    address: '600 Independence Avenue SW, Washington, DC 20560',
    museum_group: 'Smithsonian',
    landmark_type: '博物馆 / 航空航天',
    intro_lines: [
      '国家航空航天博物馆聚焦飞行、太空探索和科技创新，是理解航空史与航天工程的经典场馆。',
      '访客可以关注飞机、航天器、登月相关展品以及人类如何突破地球边界的故事。',
    ],
    highlight_tags: ['航空航天', '科技创新', '太空探索', '工程'],
    source_refs: SOURCES.air_space,
  },
  renaissance_providence: {
    entity_type: 'hotel',
    entity_subtype: 'hotel',
    name_en: 'Renaissance Providence Downtown Hotel',
    name_zh: 'Renaissance Providence Downtown Hotel',
    group: 'Marriott Bonvoy',
    brand: 'Renaissance Hotels',
    star_rating: '',
    rating_badges: ['AAA 4-Diamond'],
    city: 'Providence',
    state: 'RI',
    address: '5 Avenue of the Arts, Providence, RI 02903',
    intro_lines: [
      '酒店位于普罗维登斯市中心，靠近 Rhode Island State House、Brown University 和 RISD。',
      '建筑带有历史改造背景，适合作为 Day 1 访校后的市中心落脚点。',
    ],
    fit_tags: ['市中心', 'Marriott', 'Brown/RISD 周边'],
    source_refs: SOURCES.renaissance,
  },
  hilton_wallingford: {
    entity_type: 'hotel',
    entity_subtype: 'hotel',
    name_en: 'Hilton Garden Inn Wallingford/Meriden',
    name_zh: 'Hilton Garden Inn Wallingford/Meriden',
    group: 'Hilton',
    brand: 'Hilton Garden Inn',
    star_rating: '',
    city: 'Wallingford',
    state: 'CT',
    address: '1181 Barnes Road, Wallingford, CT 06492',
    intro_lines: [
      '酒店位于 Wallingford，衔接 Brown / Yale 访校后的康涅狄格路段。',
      '官方信息显示酒店靠近 I-91，适合作为继续前往纽约前的中途住宿点。',
    ],
    fit_tags: ['Hilton', 'Wallingford', 'I-91 周边'],
    source_refs: SOURCES.hilton_wallingford,
  },
  riu_manhattan: {
    entity_type: 'hotel',
    entity_subtype: 'hotel',
    name_en: 'Riu Plaza Manhattan Times Square',
    name_zh: 'Riu Plaza Manhattan Times Square',
    group: 'RIU Hotels',
    brand: 'Riu Plaza',
    star_rating: '',
    city: 'New York',
    state: 'NY',
    address: '145 W 47th Street, New York, NY 10036',
    intro_lines: [
      '酒店位于时代广场和百老汇剧院区周边，适合 Day 3 和 Day 4 纽约市区行程。',
      '连住两晚可以减少换酒店成本，方便衔接 NYU、Columbia 和中城观光。',
    ],
    fit_tags: ['Times Square', 'RIU', '连住两晚'],
    source_refs: SOURCES.riu_manhattan,
  },
  hyatt_kop: {
    entity_type: 'hotel',
    entity_subtype: 'hotel',
    name_en: 'Hyatt House Philadelphia/King of Prussia',
    name_zh: 'Hyatt House Philadelphia/King of Prussia',
    group: 'Hyatt',
    brand: 'Hyatt House',
    star_rating: '',
    city: 'King of Prussia',
    state: 'PA',
    address: '240 Mall Boulevard, King of Prussia, PA 19406',
    intro_lines: [
      '酒店位于 King of Prussia，方便衔接宾大、Swarthmore 与费城周边路段。',
      'Hyatt House 品牌偏长住和套房型体验，适合访校行程中的中途调整和休息。',
    ],
    fit_tags: ['Hyatt House', 'King of Prussia', '费城周边'],
    source_refs: SOURCES.hyatt_kop,
  },
  glover_georgetown: {
    entity_type: 'hotel',
    entity_subtype: 'hotel',
    name_en: 'Glover Park Hotel Georgetown',
    name_zh: 'Glover Park Hotel Georgetown',
    group: '',
    brand: 'Glover Park Hotel',
    star_rating: '',
    rating_badges: ['AAA 3-Diamond'],
    city: 'Washington',
    state: 'DC',
    address: '2505 Wisconsin Avenue NW, Washington, DC 20007',
    intro_lines: [
      '酒店位于 Glover Park / Georgetown 区域，靠近乔治城大学、国家大教堂和 DC 西北部社区。',
      'Day 6 和 Day 7 连住可减少换房，方便衔接乔治城访校、Smithsonian 和国会山观光。',
    ],
    fit_tags: ['Georgetown 周边', 'DC 西北', '连住两晚'],
    source_refs: SOURCES.glover,
  },
  study_chicago: {
    entity_type: 'hotel',
    entity_subtype: 'hotel',
    name_en: 'The Study at the University of Chicago',
    name_zh: 'The Study at the University of Chicago',
    group: 'Study Hotels',
    brand: 'The Study',
    star_rating: '',
    city: 'Chicago',
    state: 'IL',
    address: '1227 E 60th Street, Chicago, IL 60637',
    intro_lines: [
      '酒店位于芝加哥大学校园附近，适合 Day 8 抵达芝加哥后的校园周边住宿。',
      '官方介绍强调其靠近校园中心和学术交流设施，整体定位偏安静、书卷气的校园酒店。',
    ],
    fit_tags: ['University of Chicago', 'Hyde Park', '校园酒店'],
    source_refs: SOURCES.study_chicago,
  },
};

const HOTEL_STAYS = [
  { stay_id: 'stay_renaissance_providence_day1', entity_key: 'renaissance_providence', linked_day_nos: [1], check_in_date: '2026-06-05', check_out_date: '2026-06-06' },
  { stay_id: 'stay_hilton_wallingford_day2', entity_key: 'hilton_wallingford', linked_day_nos: [2], check_in_date: '2026-06-06', check_out_date: '2026-06-07' },
  { stay_id: 'stay_riu_manhattan_day3_day4', entity_key: 'riu_manhattan', linked_day_nos: [3, 4], check_in_date: '2026-06-07', check_out_date: '2026-06-09' },
  { stay_id: 'stay_hyatt_kop_day5', entity_key: 'hyatt_kop', linked_day_nos: [5], check_in_date: '2026-06-09', check_out_date: '2026-06-10' },
  { stay_id: 'stay_glover_georgetown_day6_day7', entity_key: 'glover_georgetown', linked_day_nos: [6, 7], check_in_date: '2026-06-10', check_out_date: '2026-06-12' },
  { stay_id: 'stay_study_chicago_day8', entity_key: 'study_chicago', linked_day_nos: [8], check_in_date: '2026-06-12', check_out_date: '' },
];

const DAYS = [
  {
    day_no: 1,
    date: '2026-06-05',
    weekday: 'Fri',
    day_title: 'Concord / Boston College / Babson / Amherst / Providence',
    route_label: 'Concord / Boston College / Babson / Amherst / Providence',
    departure_time: '10:00',
    pickup_address: TRIP091_DAY1_PICKUP.pickup_address,
    cards: [
      { card_id: '091_day1_boston_college', card_type: 'school_visit_card', entity_key: 'boston_college', arrival_time: '10:45', appointment_time: '', start_time: '10:45', end_time: '11:25', customer_note: '10:00 从 284 Mattison Drive 出发；BC 预计参观约 40 分钟。' },
      { card_id: '091_day1_babson_college', card_type: 'school_visit_card', entity_key: 'babson_college', arrival_time: '12:00', appointment_time: '', start_time: '12:00', end_time: '12:20', customer_note: '短停参观约 20-30 分钟；午餐建议提前准备车上简餐。' },
      { card_id: '091_day1_amherst_college', card_type: 'school_visit_card', entity_key: 'amherst_college', arrival_time: '14:30', appointment_time: '15:00', start_time: '14:30', end_time: '16:30', customer_note: '客户群确认 15:00 前抵达 Amherst 即可，自主参观约 2 小时。' },
      { card_id: '091_day1_renaissance_providence', card_type: 'hotel_arrival_card', entity_key: 'renaissance_providence', arrival_time: '18:45', stay_id: 'stay_renaissance_providence_day1' },
    ],
  },
  {
    day_no: 2,
    date: '2026-06-06',
    weekday: 'Sat',
    day_title: 'Providence / New Haven / Wallingford',
    route_label: 'Providence / New Haven / Wallingford',
    departure_time: '09:35',
    cards: [
      { card_id: '091_day2_brown_university', card_type: 'school_visit_card', entity_key: 'brown_university', arrival_time: '09:45', appointment_time: '10:00' },
      { card_id: '091_day2_yale_university', card_type: 'school_visit_card', entity_key: 'yale_university', arrival_time: '14:15', appointment_time: '14:00' },
      { card_id: '091_day2_hilton_wallingford', card_type: 'hotel_arrival_card', entity_key: 'hilton_wallingford', arrival_time: '18:00', stay_id: 'stay_hilton_wallingford_day2' },
    ],
  },
  {
    day_no: 3,
    date: '2026-06-07',
    weekday: 'Sun',
    day_title: 'New York Midtown / Parks',
    route_label: 'New York Midtown / Parks',
    departure_time: '07:50',
    cards: [
      { card_id: '091_day3_times_square', card_type: 'landmark_card', entity_key: 'times_square', arrival_time: '10:20', appointment_time: '10:00', parent_group_id: 'day3_midtown_group', parent_group_title: '时代广场 / 洛克菲勒中心 / 第五大道', group_sequence: 1, travel_snapshot: { drive_time_text: '2:30', distance_text: '92.00mi', traffic_text: 'Moderate', traffic_level: 'moderate' } },
      { card_id: '091_day3_rockefeller_center', card_type: 'landmark_card', entity_key: 'rockefeller_center', arrival_time: '10:20', appointment_time: '10:00', parent_group_id: 'day3_midtown_group', parent_group_title: '时代广场 / 洛克菲勒中心 / 第五大道', group_sequence: 2, travel_snapshot: { drive_time_text: '2:30', distance_text: '92.00mi', traffic_text: 'Moderate', traffic_level: 'moderate' } },
      { card_id: '091_day3_fifth_avenue', card_type: 'landmark_card', entity_key: 'fifth_avenue', arrival_time: '10:20', appointment_time: '10:00', parent_group_id: 'day3_midtown_group', parent_group_title: '时代广场 / 洛克菲勒中心 / 第五大道', group_sequence: 3, travel_snapshot: { drive_time_text: '2:30', distance_text: '92.00mi', traffic_text: 'Moderate', traffic_level: 'moderate' } },
      { card_id: '091_day3_central_park', card_type: 'landmark_card', entity_key: 'central_park', arrival_time: '12:20', appointment_time: '14:00', parent_group_id: 'day3_park_group', parent_group_title: '中央公园 / 布莱恩特公园', group_sequence: 1 },
      { card_id: '091_day3_bryant_park', card_type: 'landmark_card', entity_key: 'bryant_park', arrival_time: '12:20', appointment_time: '14:00', parent_group_id: 'day3_park_group', parent_group_title: '中央公园 / 布莱恩特公园', group_sequence: 2 },
      { card_id: '091_day3_riu_manhattan', card_type: 'hotel_arrival_card', entity_key: 'riu_manhattan', arrival_time: '18:00', parent_group_id: 'hotel_stay_riu_day3_day4', parent_group_title: 'Riu Plaza Manhattan Times Square 连住', group_sequence: 1, stay_id: 'stay_riu_manhattan_day3_day4' },
    ],
  },
  {
    day_no: 4,
    date: '2026-06-08',
    weekday: 'Mon',
    day_title: 'New York University / Columbia',
    route_label: 'NYU / Teacher Pan / Columbia',
    departure_time: '10:05',
    cards: [
      { card_id: '091_day4_new_york_university', card_type: 'school_visit_card', entity_key: 'nyu', arrival_time: '10:40', appointment_time: '11:00' },
      { card_id: '091_day4_meeting_teacher_pan', card_type: 'meeting_card', title: 'Meeting with Teacher Pan', title_zh: '中午见潘老师', arrival_time: '', appointment_time: '', start_time: '午间', customer_note: '该安排由 Farland 顾问同步，请以客户群确认信息为准。' },
      { card_id: '091_day4_columbia_university', card_type: 'school_visit_card', entity_key: 'columbia_university', arrival_time: '14:30', appointment_time: '' },
      { card_id: '091_day4_riu_manhattan', card_type: 'hotel_arrival_card', entity_key: 'riu_manhattan', arrival_time: '17:00', parent_group_id: 'hotel_stay_riu_day3_day4', parent_group_title: 'Riu Plaza Manhattan Times Square 连住', group_sequence: 2, stay_id: 'stay_riu_manhattan_day3_day4' },
    ],
  },
  {
    day_no: 5,
    date: '2026-06-09',
    weekday: 'Tue',
    day_title: 'Philadelphia / King of Prussia',
    route_label: 'University of Pennsylvania / Swarthmore / King of Prussia',
    departure_time: '07:45',
    cards: [
      { card_id: '091_day5_university_of_pennsylvania', card_type: 'school_visit_card', entity_key: 'upenn', arrival_time: '10:15', appointment_time: '10:15' },
      { card_id: '091_day5_swarthmore_college', card_type: 'school_visit_card', entity_key: 'swarthmore_college', arrival_time: '12:50', appointment_time: '13:30' },
      { card_id: '091_day5_hyatt_king_of_prussia', card_type: 'hotel_arrival_card', entity_key: 'hyatt_kop', arrival_time: '16:20', stay_id: 'stay_hyatt_kop_day5' },
    ],
  },
  {
    day_no: 6,
    date: '2026-06-10',
    weekday: 'Wed',
    day_title: 'Georgetown / Smithsonian',
    route_label: 'Georgetown / Smithsonian / Glover Park',
    departure_time: '05:30',
    cards: [
      { card_id: '091_day6_georgetown_university', card_type: 'school_visit_card', entity_key: 'georgetown_university', arrival_time: '09:15', appointment_time: '09:30' },
      { card_id: '091_day6_natural_history_museum', card_type: 'museum_card', entity_key: 'natural_history_museum', arrival_time: '13:30', appointment_time: '14:00', parent_group_id: 'day6_museum_group', parent_group_title: '国家自然历史博物馆 / 国家航空航天博物馆', group_sequence: 1 },
      { card_id: '091_day6_air_space_museum', card_type: 'museum_card', entity_key: 'air_space_museum', arrival_time: '13:30', appointment_time: '14:00', parent_group_id: 'day6_museum_group', parent_group_title: '国家自然历史博物馆 / 国家航空航天博物馆', group_sequence: 2 },
      { card_id: '091_day6_glover_georgetown', card_type: 'hotel_arrival_card', entity_key: 'glover_georgetown', arrival_time: '18:00', parent_group_id: 'hotel_stay_glover_day6_day7', parent_group_title: 'Glover Park Hotel Georgetown 连住', group_sequence: 1, stay_id: 'stay_glover_georgetown_day6_day7' },
    ],
  },
  {
    day_no: 7,
    date: '2026-06-11',
    weekday: 'Thu',
    day_title: 'Washington DC Monuments / Capitol Hill',
    route_label: 'White House / Capitol / Library of Congress',
    departure_time: '09:20',
    cards: [
      { card_id: '091_day7_white_house', card_type: 'landmark_card', entity_key: 'white_house', arrival_time: '09:45', appointment_time: '10:00', parent_group_id: 'day7_monuments_group', parent_group_title: '白宫 / 国会大厦 / 林肯纪念堂', group_sequence: 1 },
      { card_id: '091_day7_us_capitol', card_type: 'landmark_card', entity_key: 'us_capitol', arrival_time: '09:45', appointment_time: '10:00', parent_group_id: 'day7_monuments_group', parent_group_title: '白宫 / 国会大厦 / 林肯纪念堂', group_sequence: 2 },
      { card_id: '091_day7_lincoln_memorial', card_type: 'landmark_card', entity_key: 'lincoln_memorial', arrival_time: '09:45', appointment_time: '10:00', parent_group_id: 'day7_monuments_group', parent_group_title: '白宫 / 国会大厦 / 林肯纪念堂', group_sequence: 3 },
      { card_id: '091_day7_capitol_hill', card_type: 'landmark_card', entity_key: 'capitol_hill', arrival_time: '12:40', appointment_time: '14:00', parent_group_id: 'day7_capitol_hill_group', parent_group_title: '国会山 / 国会图书馆 / 最高法院外景', group_sequence: 1 },
      { card_id: '091_day7_library_of_congress', card_type: 'landmark_card', entity_key: 'library_of_congress', arrival_time: '12:40', appointment_time: '14:00', parent_group_id: 'day7_capitol_hill_group', parent_group_title: '国会山 / 国会图书馆 / 最高法院外景', group_sequence: 2 },
      { card_id: '091_day7_supreme_court_exterior', card_type: 'landmark_card', entity_key: 'supreme_court_exterior', arrival_time: '12:40', appointment_time: '14:00', parent_group_id: 'day7_capitol_hill_group', parent_group_title: '国会山 / 国会图书馆 / 最高法院外景', group_sequence: 3 },
      { card_id: '091_day7_glover_georgetown', card_type: 'hotel_arrival_card', entity_key: 'glover_georgetown', arrival_time: '16:30', parent_group_id: 'hotel_stay_glover_day6_day7', parent_group_title: 'Glover Park Hotel Georgetown 连住', group_sequence: 2, stay_id: 'stay_glover_georgetown_day6_day7' },
    ],
  },
  {
    day_no: 8,
    date: '2026-06-12',
    weekday: 'Fri',
    day_title: 'IAD / ORD / Chicago',
    route_label: 'Washington DC / Chicago',
    departure_time: '10:30',
    cards: [
      {
        card_id: '091_day8_ua2331_iad_ord',
        card_type: 'flight_card',
        flight_no: 'UA2331',
        title: 'UA2331 · IAD → ORD',
        title_zh: 'UA2331 · IAD → ORD',
        arrival_time: '11:30',
        appointment_time: '',
        departure_airport: 'IAD',
        arrival_airport: 'ORD',
        takeoff_time: '13:15',
        landing_time: '14:29',
        aircraft: 'Boeing 737',
        source_refs: [],
      },
      { card_id: '091_day8_study_chicago', card_type: 'hotel_arrival_card', entity_key: 'study_chicago', arrival_time: '16:30', stay_id: 'stay_study_chicago_day8' },
    ],
  },
];

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function stripCustomerUnsafe(value) {
  if (Array.isArray(value)) return value.map(stripCustomerUnsafe).filter((item) => item !== undefined);
  if (!isPlainObject(value)) return value;
  return Object.keys(value).reduce((acc, key) => {
    if (INTERNAL_KEYS.has(key)) return acc;
    const next = stripCustomerUnsafe(value[key]);
    if (next !== undefined) acc[key] = next;
    return acc;
  }, {});
}

function isTrip091(trip = {}) {
  return [trip.trip_no, trip.trip_id, trip.external_trip_id, trip._id]
    .map((value) => String(value || '').trim().toUpperCase())
    .includes(TRIP_NO);
}

function toMinutes(value) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function defaultTravelSnapshot(snapshot = {}) {
  const normalized = {
    drive_time_text: snapshot.drive_time_text || '',
    distance_text: snapshot.distance_text || '',
    traffic_text: snapshot.traffic_text || '',
    traffic_level: snapshot.traffic_level || '',
  };
  [
    'source_drive_time_text',
    'source_distance_text',
    'source_traffic_text',
    'maps_duration_text',
    'maps_distance_text',
    'maps_route_text',
    'maps_duration_minutes',
    'maps_delta_minutes',
    'maps_review_status',
    'maps_checked_at',
    'maps_check_mode',
    'waze_duration_text',
    'waze_distance_text',
    'waze_route_text',
    'waze_duration_minutes',
  ].forEach((key) => {
    if (snapshot[key] !== undefined && snapshot[key] !== '') {
      normalized[key] = snapshot[key];
    }
  });
  return normalized;
}

function buildTimeSnapshot(card, day) {
  const arrivalTime = card.arrival_time || '';
  const appointmentTime = card.appointment_time || '';
  const arrivalMinutes = toMinutes(arrivalTime);
  const appointmentMinutes = toMinutes(appointmentTime);
  return {
    departure_time: card.departure_time || day.departure_time || '',
    arrival_time: arrivalTime,
    appointment_time: appointmentTime,
    start_time: card.start_time || '',
    end_time: card.end_time || '',
    time_warning_text: card.time_warning_text || (
      arrivalMinutes !== null && appointmentMinutes !== null && arrivalMinutes > appointmentMinutes
        ? '时间待复核'
        : ''
    ),
  };
}

function buildEntityRef(card, profile) {
  if (!profile) return {};
  return {
    entity_id: card.entity_key || '',
    entity_type: profile.entity_type || '',
    entity_subtype: profile.entity_subtype || '',
  };
}

function buildDisplaySnapshot(card, profile, day) {
  if (card.card_type === 'meeting_card') {
    return {
      name_en: card.title || '',
      name_zh: card.title_zh || card.title || '',
      entity_type_text: '会面 / 预约',
      intro_lines: [card.customer_note || '该安排由 Farland 顾问同步，请以客户群确认信息为准。'],
      fit_tags: ['顾问同步', '客户群确认'],
      location_text: '午间 / 待同步',
    };
  }

  if (card.card_type === 'flight_card') {
    return {
      name_en: card.title,
      name_zh: card.title_zh,
      flight_no: card.flight_no,
      route: `${card.departure_airport} → ${card.arrival_airport}`,
      departure_airport: card.departure_airport,
      arrival_airport: card.arrival_airport,
      takeoff_time: card.takeoff_time,
      landing_time: card.landing_time,
      aircraft: card.aircraft,
      intro_lines: [`当天 ${day.departure_time} 出发，预计 ${card.arrival_time} 抵达机场；航班时间以航空公司最终信息为准。`],
      fit_tags: ['航班', '机场接驳', '时间复核'],
    };
  }

  return {
    name_en: profile.name_en || '',
    name_zh: profile.name_zh || profile.name_en || '',
    entity_type_text: profile.entity_type_text || profile.landmark_type || profile.entity_subtype || '',
    city: profile.city || '',
    state: profile.state || '',
    area: profile.area || '',
    location_text: [profile.city, profile.state || profile.area].filter(Boolean).join(' · '),
    address: profile.address || '',
    ranking_badges: profile.ranking_badges || [],
    rating_badges: profile.rating_badges || [],
    group: profile.group || profile.museum_group || '',
    brand: profile.brand || '',
    star_rating: profile.star_rating || '',
    landmark_type: profile.landmark_type || '',
    museum_group: profile.museum_group || '',
    intro_lines: profile.intro_lines || [],
    strengths: profile.strengths || [],
    fit_tags: profile.fit_tags || profile.highlight_tags || [],
    highlight_tags: profile.highlight_tags || profile.fit_tags || [],
  };
}

function buildLegacyCardFields(card, profile, display, timeSnapshot) {
  const type = LEGACY_TYPE[card.card_type] || 'custom';
  const title = display.name_zh || display.name_en || card.title_zh || card.title || '';
  const subtitle = display.name_en && display.name_zh && display.name_en !== display.name_zh
    ? display.name_en
    : '';
  const noteLines = display.intro_lines || [];
  const detailParts = [];
  if (card.card_type === 'hotel_arrival_card') {
    if (display.brand || display.group) detailParts.push([display.group, display.brand].filter(Boolean).join(' · '));
    if (display.address) detailParts.push(display.address);
  } else if (card.card_type === 'flight_card') {
    detailParts.push(`${display.route || ''} · 起飞 ${display.takeoff_time || ''} · 到达 ${display.landing_time || ''}`.replace(/^ · | · $/g, ''));
    if (display.aircraft) detailParts.push(display.aircraft);
  } else {
    if (display.entity_type_text || display.landmark_type) detailParts.push(display.entity_type_text || display.landmark_type);
    if (display.location_text) detailParts.push(display.location_text);
  }
  return {
    type,
    item_type: type,
    typeText: TYPE_TEXT[card.card_type] || '行程',
    time: timeSnapshot.arrival_time || timeSnapshot.appointment_time || timeSnapshot.start_time || '',
    arrival_estimate: timeSnapshot.arrival_time || '',
    title,
    subtitle,
    location: display.address || display.location_text || '',
    route: '',
    drive_time: '',
    distance: '',
    traffic_level: '',
    detailLine: detailParts.filter(Boolean).join(' · '),
    note: card.customer_note || noteLines.join(' '),
    next_stop: '',
    linked_entity_type: profile ? profile.entity_type : '',
    linked_entity_id: card.entity_key || '',
  };
}

function buildCard(card, day, index, totalCount) {
  const profile = card.entity_key ? ENTITIES[card.entity_key] : null;
  const displaySnapshot = buildDisplaySnapshot(card, profile || {}, day);
  const timeSnapshot = buildTimeSnapshot(card, day);
  const sourceRefs = card.source_refs || (profile && profile.source_refs) || [];
  const routeCheckId = CARD_ROUTE_CHECK_IDS[card.card_id] || '';
  const mapRouteCheck = routeCheckId ? MAP_ROUTE_CHECKS[routeCheckId] : null;
  const travelSnapshot = {
    ...(card.travel_snapshot || {}),
    ...(mapRouteCheck ? {
      ...mapRouteCheck,
      maps_checked_at: GOOGLE_MAPS_ROUTE_CHECKED_AT,
      maps_check_mode: GOOGLE_MAPS_ROUTE_CHECK_MODE,
    } : {}),
  };
  return {
    card_id: card.card_id,
    card_type: card.card_type,
    day_no: day.day_no,
    sequence: index + 1,
    total_count: totalCount,
    parent_group_id: card.parent_group_id || '',
    parent_group_title: card.parent_group_title || '',
    group_sequence: card.group_sequence || 0,
    entity_ref: buildEntityRef(card, profile),
    display_snapshot: displaySnapshot,
    time_snapshot: timeSnapshot,
    travel_snapshot: defaultTravelSnapshot(travelSnapshot),
    route_check_id: routeCheckId,
    ui_flags: { ...UI_FLAGS, ...(card.ui_flags || {}) },
    hotel_stay_id: card.stay_id || '',
    source_refs: sourceRefs,
    content_verified_at: VERIFIED_AT,
    content_quality_status: sourceRefs.length || card.card_type === 'flight_card' || card.card_type === 'meeting_card'
      ? 'verified_with_online_sources'
      : 'needs_source_review',
    ...buildLegacyCardFields(card, profile, displaySnapshot, timeSnapshot),
    customer_note: card.customer_note || '',
  };
}

function findHotelStayForDay(dayNo) {
  return HOTEL_STAYS.find((stay) => stay.linked_day_nos.includes(dayNo)) || null;
}

function buildHotelStay(stay) {
  const profile = ENTITIES[stay.entity_key] || {};
  return {
    ...stay,
    name: profile.name_en || '',
    hotel_name: profile.name_en || '',
    city: profile.city || '',
    state: profile.state || '',
    address: profile.address || '',
    group: profile.group || '',
    brand: profile.brand || '',
    star_rating: profile.star_rating || '',
    rating_badges: profile.rating_badges || [],
    source_refs: profile.source_refs || [],
    content_verified_at: VERIFIED_AT,
  };
}

function buildDayTransportSummary(day) {
  const isConfirmedDay1 = day.day_no === 1;
  const confirmed = isConfirmedDay1 ? TRIP091_CONFIRMED_DRIVER : {};
  return {
    type: 'charter',
    title: '今日包车服务',
    status_text: isConfirmedDay1 ? '车辆与司机已确认' : '车辆已确认，司机信息待同步',
    departure_time: day.departure_time,
    depart_time: day.departure_time,
    pickup_time: day.departure_time,
    pickup: day.pickup_address || '',
    pickup_address: day.pickup_address || '',
    vehicle_summary: confirmed.vehicle_summary || 'Toyota Sienna 或同级',
    vehicle_model: confirmed.vehicle_model || '',
    vehicle_color: confirmed.vehicle_color || '',
    plate_number: confirmed.plate_number || '',
    driver_visibility: isConfirmedDay1 ? 'assigned' : 'pending',
    driver_name: confirmed.driver_name || '',
    driver_phone: confirmed.driver_phone || '',
    driver: isConfirmedDay1 ? {
      name: confirmed.driver_name,
      driver_name: confirmed.driver_name,
      phone: confirmed.driver_phone,
      driver_phone: confirmed.driver_phone,
      vehicle_model: confirmed.vehicle_model,
      vehicle_color: confirmed.vehicle_color,
      plate_number: confirmed.plate_number,
    } : null,
    helper_text: isConfirmedDay1 ? '上车地点以客户群确认为准。' : '司机信息确认后会同步到这里；如需调整请在客户群沟通。',
  };
}

function buildDay(day) {
  const cards = day.cards.map((card, index) => buildCard(card, day, index, day.cards.length));
  const hotelStay = findHotelStayForDay(day.day_no);
  const hotelProfile = hotelStay ? ENTITIES[hotelStay.entity_key] : null;
  const hotelCard = cards.find((card) => card.card_type === 'hotel_arrival_card') || null;
  const transportSummary = buildDayTransportSummary(day);
  const timelineItems = cards.map((card) => ({
    ...card,
    item_id: card.card_id,
    planned_arrival_time: card.time_snapshot.arrival_time,
    planned_start_time: card.time_snapshot.appointment_time,
    planned_end_time: card.time_snapshot.end_time,
    customer_note: card.note || '',
  }));
  return {
    day_no: day.day_no,
    date: day.date,
    weekday: day.weekday,
    title: `Day ${day.day_no}: ${day.day_title}`,
    day_title: day.day_title,
    city: day.route_label,
    city_summary: day.route_label,
    route_label: day.route_label,
    pickup_address: day.pickup_address || '',
    departure_time: day.departure_time,
    estimated_departure_time: day.departure_time,
    start_time_text: day.departure_time,
    service_type: 'charter',
    service_summary: '今日包车服务',
    depart_time: day.departure_time,
    cards,
    destination_cards: cards,
    timeline_items: timelineItems,
    day_summary: {
      route_label: day.route_label,
      card_count: cards.length,
      hotel_name: hotelProfile ? hotelProfile.name_en : '',
      primary_service_type: 'charter',
    },
    hotel: hotelProfile && hotelCard ? {
      hotel_id: hotelStay.stay_id,
      stay_id: hotelStay.stay_id,
      name: hotelProfile.name_en,
      hotel_name: hotelProfile.name_en,
      city: hotelProfile.city,
      address: hotelProfile.address,
      group: hotelProfile.group || '',
      brand: hotelProfile.brand || '',
      star_rating: hotelProfile.star_rating || '',
      check_in_date: hotelStay.check_in_date,
      check_out_date: hotelStay.check_out_date,
      arrival_time: hotelCard.time_snapshot.arrival_time,
      status_text: '已同步',
      note: hotelProfile.intro_lines ? hotelProfile.intro_lines[0] : '',
    } : null,
    transport_summary: transportSummary,
  };
}

function buildDailySummaryCard(day) {
  const hotelStay = findHotelStayForDay(day.day_no);
  const hotelProfile = hotelStay ? ENTITIES[hotelStay.entity_key] : {};
  return {
    id: `091_day${day.day_no}_summary`,
    card_type: 'today_overview_card',
    day_no: day.day_no,
    date: day.date,
    weekday: day.weekday,
    title: `Day ${day.day_no}: ${day.day_title}`,
    city: day.route_label,
    route_label: day.route_label,
    start_time_text: day.departure_time,
    hotel_badge: hotelProfile.name_en || '',
    transport_badge: '包车',
    highlight_items: day.cards.map((card) => {
      const profile = card.entity_key ? ENTITIES[card.entity_key] : null;
      return (profile && (profile.name_zh || profile.name_en)) || card.title_zh || card.title || '';
    }).filter(Boolean).slice(0, 3),
    item_count: day.cards.length,
    clickable: true,
  };
}

function buildTodayOverviewCard(day) {
  return {
    id: `091_day${day.day_no}_today_overview`,
    card_type: 'today_overview_card',
    day_no: day.day_no,
    title: `今日行程 · Day ${day.day_no}`,
    date: day.date,
    weekday: day.weekday,
    route_label: day.route_label,
    departure_time: day.departure_time,
    card_count: day.cards.length,
  };
}

function buildDailyCharterSummary(day) {
  const transportSummary = buildDayTransportSummary(day);
  return {
    id: `091_day${day.day_no}_daily_charter_summary`,
    card_type: 'daily_charter_summary',
    visible: true,
    day_no: day.day_no,
    date: day.date,
    title: '今日包车服务',
    departure_time: day.departure_time,
    service_window: { start_time: day.departure_time, end_time: '', label: `${day.departure_time} 出发` },
    status_text: transportSummary.status_text,
    vehicle_summary: transportSummary.vehicle_summary,
    driver_visibility: transportSummary.driver_visibility,
    driver: transportSummary.driver,
    driver_name: transportSummary.driver_name,
    driver_phone: transportSummary.driver_phone,
    plate_number: transportSummary.plate_number,
    pickup: transportSummary.pickup,
    pickup_address: transportSummary.pickup_address,
  };
}

function buildProgressNodes() {
  return DAYS.map((day, index) => ({
    node_id: `day_${day.day_no}`,
    type: 'trip_day',
    day_no: day.day_no,
    label: `Day ${day.day_no}`,
    date: day.date,
    weekday: day.weekday,
    location_summary: day.route_label,
    status: index === 0 ? 'current' : 'upcoming',
  }));
}

function buildTrip091CardSystem(trip = {}) {
  const itineraryDays = DAYS.map(buildDay);
  const destinationCards = itineraryDays.flatMap((day) => day.destination_cards);
  const hotelStays = HOTEL_STAYS.map(buildHotelStay);
  const dailySummaryCards = DAYS.map(buildDailySummaryCard);
  const todayOverviewCards = DAYS.map(buildTodayOverviewCard);
  const dailyCharterSummaries = DAYS.map(buildDailyCharterSummary);
  const firstDay = itineraryDays[0];
  const tripId = trip.trip_id || trip.external_trip_id || TRIP_NO;
  const snapshot = {
    snapshot_model_version: 2,
    snapshot_variant: 'p4_13_091_researched_destination_cards',
    generated_at: new Date().toISOString(),
    content_verified_at: VERIFIED_AT,
    trip_id: tripId,
    external_trip_id: trip.external_trip_id || tripId,
    trip_no: TRIP_NO,
    title: trip.title || '2026XBC091 美东访校与城市行程',
    trip_type: 'charter',
    status: trip.status || 'active',
    city: 'Boston / New York / Philadelphia / Washington DC / Chicago',
    country: 'US',
    timezone: 'America/New_York',
    start_at: trip.start_at || '2026-06-05T10:00:00-04:00',
    end_at: trip.end_at || '2026-06-12T16:30:00-05:00',
    summary: '8 天美东访校、城市观光、博物馆、酒店与航班行程。',
    customer: stripCustomerUnsafe(trip.customer || {}),
    advisor: stripCustomerUnsafe(trip.advisor || {}),
    hero: {
      title: '2026XBC091 美东访校与城市行程',
      trip_no: TRIP_NO,
      date_range: '2026-06-05 - 2026-06-12',
      city_summary: 'Boston / New York / Philadelphia / Washington DC / Chicago',
    },
    trip_summary_card: {
      card_type: 'trip_summary_card',
      trip_no: TRIP_NO,
      title: '美东访校与城市行程',
      date_range_text: '2026-06-05 - 2026-06-12',
      days_count: 8,
      destination_card_count: destinationCards.length,
      customer_name: (trip.customer && (trip.customer.name || trip.customer.display_name)) || '',
    },
    trip_summary: {
      trip_id: tripId,
      external_trip_id: trip.external_trip_id || tripId,
      trip_no: TRIP_NO,
      title: '2026XBC091 美东访校与城市行程',
      date_range_text: '2026-06-05 - 2026-06-12',
      city_route_text: 'Concord / Boston College / Babson / Amherst / Providence / New Haven / New York / Philadelphia / Washington DC / Chicago',
      days_count: 8,
      hotels_count: hotelStays.length,
      flights_count: 1,
      transport_count: 8,
      next_day_label: firstDay ? firstDay.title : '',
      last_hotel_name: 'The Study at the University of Chicago',
    },
    day_progress_nodes: buildProgressNodes(),
    progress_strip: {
      visible: true,
      title: 'Trip Progress',
      mode: 'daily_nodes',
      current_day_no: 1,
      current_node_id: 'day_1',
      nodes: buildProgressNodes(),
    },
    today_driver_card: {
      visible: true,
      card_type: 'today_driver_card',
      title: '今日用车',
      status: 'assigned',
      status_text: '已分配司机',
      driver_visibility: 'assigned',
      departure_time: firstDay ? firstDay.departure_time : '',
      pickup: TRIP091_DAY1_PICKUP.pickup_address,
      pickup_address: TRIP091_DAY1_PICKUP.pickup_address,
      driver_name: TRIP091_CONFIRMED_DRIVER.driver_name,
      driver_phone: TRIP091_CONFIRMED_DRIVER.driver_phone,
      vehicle_model: TRIP091_CONFIRMED_DRIVER.vehicle_model,
      vehicle_color: TRIP091_CONFIRMED_DRIVER.vehicle_color,
      plate_number: TRIP091_CONFIRMED_DRIVER.plate_number,
      vehicle_summary: TRIP091_CONFIRMED_DRIVER.vehicle_summary,
      driver: {
        name: TRIP091_CONFIRMED_DRIVER.driver_name,
        phone: TRIP091_CONFIRMED_DRIVER.driver_phone,
        vehicle_model: TRIP091_CONFIRMED_DRIVER.vehicle_model,
        vehicle_color: TRIP091_CONFIRMED_DRIVER.vehicle_color,
        plate_number: TRIP091_CONFIRMED_DRIVER.plate_number,
      },
      helper_text: '上车地点以客户群确认为准。',
    },
    today_overview_cards: todayOverviewCards,
    daily_summary_cards: dailySummaryCards,
    daily_charter_summaries: dailyCharterSummaries,
    daily_charter_summary: dailyCharterSummaries,
    hotel_summary_card: {
      visible: true,
      card_type: 'hotel_summary_card',
      title: '住宿安排',
      hotels_count: hotelStays.length,
      current_hotel_name: hotelStays[0] ? hotelStays[0].name : '',
    },
    hotel_stays: hotelStays,
    hotel_cards: hotelStays.map((stay) => ({
      ...stay,
      hotel_id: stay.stay_id,
      visible: true,
      status_text: '已同步',
      date_text: [stay.check_in_date, stay.check_out_date].filter(Boolean).join(' - '),
    })),
    hotels: hotelStays.map((stay) => ({
      ...stay,
      hotel_id: stay.stay_id,
      visible: true,
      status_text: '已同步',
    })),
    flight_cards: [{
      flight_id: '091_day8_ua2331_iad_ord',
      card_type: 'flight_card',
      flight_no: 'UA2331',
      route: 'IAD → ORD',
      from: 'IAD',
      to: 'ORD',
      departure_airport: 'IAD',
      arrival_airport: 'ORD',
      departure_time: '13:15',
      arrival_time: '14:29',
      aircraft: 'Boeing 737',
      day_no: 8,
      date: '2026-06-12',
    }],
    flights: [{
      flight_id: '091_day8_ua2331_iad_ord',
      flight_no: 'UA2331',
      from: 'IAD',
      to: 'ORD',
      departure_time: '13:15',
      arrival_time: '14:29',
      aircraft: 'Boeing 737',
      day_no: 8,
      date: '2026-06-12',
    }],
    itinerary_days: itineraryDays,
    destination_cards: destinationCards,
    card_system_validation: validateTrip091CardSystem({ itinerary_days: itineraryDays, destination_cards: destinationCards }),
    source_policy: {
      schools: 'Official school pages first; ranking/profile sources only when verified.',
      landmarks: 'Official tourism, NPS, institutional, Smithsonian, or reference sources.',
      hotels: 'Official hotel/property pages when available; itinerary remains source of truth for stay timing.',
    },
    documents: [],
    transfers: [],
    charter_services: dailyCharterSummaries,
  };
  return snapshot;
}

function validateTrip091CardSystem(snapshot) {
  const days = Array.isArray(snapshot.itinerary_days) ? snapshot.itinerary_days : [];
  const cards = Array.isArray(snapshot.destination_cards)
    ? snapshot.destination_cards
    : days.flatMap((day) => day.destination_cards || day.cards || []);
  const counts = days.map((day) => (day.destination_cards || day.cards || []).length);
  const expectedCounts = [4, 3, 6, 4, 3, 4, 7, 2];
  const warnings = cards.filter((card) => card.time_snapshot && card.time_snapshot.time_warning_text).map((card) => card.card_id);
  const missingSchema = cards.filter((card) => !card.card_id || !card.card_type || !card.time_snapshot || !card.display_snapshot || !card.travel_snapshot || !card.ui_flags);
  const uiLeaks = cards.filter((card) => card.ui_flags && (card.ui_flags.show_route || card.ui_flags.show_travel_meta || card.ui_flags.show_contact_advisor || card.ui_flags.show_driver));
  const routeCheckMissing = cards.filter((card) => card.card_type !== 'meeting_card' && !card.route_check_id);
  const mapsCheckMissing = cards.filter((card) => card.card_type !== 'meeting_card' && !(card.travel_snapshot && card.travel_snapshot.maps_duration_text && card.travel_snapshot.maps_checked_at));
  const mapsRiskCards = cards.filter((card) => card.travel_snapshot && card.travel_snapshot.maps_review_status === 'source_too_short_risk');
  const byType = cards.reduce((acc, card) => {
    acc[card.card_type] = (acc[card.card_type] || 0) + 1;
    return acc;
  }, {});
  return {
    total_destination_cards: cards.length,
    expected_total_destination_cards: 33,
    day_counts: counts,
    expected_day_counts: expectedCounts,
    by_type: byType,
    time_warning_card_ids: warnings,
    missing_common_schema_count: missingSchema.length,
    ui_flag_leak_count: uiLeaks.length,
    route_check_missing_count: routeCheckMissing.length,
    maps_check_missing_count: mapsCheckMissing.length,
    maps_risk_card_ids: mapsRiskCards.map((card) => card.card_id),
    maps_conservative_card_count: cards.filter((card) => card.travel_snapshot && card.travel_snapshot.maps_review_status === 'source_conservative_or_slack').length,
    source_ref_missing_count: cards.filter((card) => !['meeting_card', 'flight_card'].includes(card.card_type) && !(card.source_refs && card.source_refs.length)).length,
    valid: cards.length === 33
      && counts.join(',') === expectedCounts.join(',')
      && missingSchema.length === 0
      && uiLeaks.length === 0
      && routeCheckMissing.length === 0
      && mapsCheckMissing.length === 0
      && mapsRiskCards.length === 0
      && warnings.includes('091_day2_yale_university')
      && warnings.includes('091_day3_times_square')
      && warnings.includes('091_day3_rockefeller_center')
      && warnings.includes('091_day3_fifth_avenue'),
  };
}


module.exports = {
  writeAuditLog,
  TRIP_NO,
  isTrip091,
  buildTrip091CardSystem,
  validateTrip091CardSystem,
};
