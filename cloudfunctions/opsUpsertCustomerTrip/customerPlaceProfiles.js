const CONTENT_ENRICHMENT_VERSION = 'place-catalog-v1';

const IMAGE_ROOT = 'cloud://cloud1-d3gmbz2bw024f051b.636c-cloud1-d3gmbz2bw024f051b-1433952698/customer-place-images/catalog-v1';

function image(file, credit, sourceUrl, license) {
  return {
    hero_image_url: `${IMAGE_ROOT}/${file}`,
    image_credit: credit,
    image_source_url: sourceUrl,
    image_license: license,
  };
}

const PROFILES = [
  {
    id: 'meal-lunch',
    aliases: ['午餐 lunch', '午餐', 'lunch'],
    itemTypes: ['meal'],
    item_type: 'meal',
    card_type: 'meal',
    display_snapshot: {
      name_zh: '午餐',
      name_en: 'Lunch',
      entity_type_text: '当日用餐安排',
      intro_lines: [
        '当天未指定固定餐厅，建议结合前后行程在附近就餐并预留充足休息时间。',
        '具体地点和用餐时段以当天交通、体力情况及顾问沟通为准。',
      ],
      strengths: [
        { title: '就近安排', desc: '优先选择不明显绕行、出入方便的用餐地点。' },
        { title: '时间弹性', desc: '可根据当天路况与前一站结束时间微调。' },
      ],
      fit_tags: ['就近用餐', '时间可调', '以当天沟通为准'],
      highlight_tags: ['就近用餐', '时间可调', '充分休息'],
      ...image(
        'lunch-scene.jpg',
        '用餐场景示意 · Bahnfrend · CC BY-SA 4.0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Classic_Club_Sandwich_with_Leafy_Green_Salad,_Jamaica_Blue_Carousel,_2025_(01).jpg',
        'CC BY-SA 4.0',
      ),
    },
  },
  {
    id: 'jfk-terminal-1',
    aliases: ['jfk airport', 'john f kennedy international airport', 'jfk terminal 1'],
    item_type: 'transfer',
    card_type: 'transfer',
    ui_flags: { show_route: false, show_travel_meta: true },
    display_snapshot: {
      name_zh: '纽约肯尼迪国际机场',
      name_en: 'John F. Kennedy International Airport',
      entity_type_text: '国际机场 · Terminal 1',
      city: 'New York',
      state: 'NY',
      location_text: 'Queens · Terminal 1',
      address: 'JFK Airport Terminal 1, Jamaica, NY 11430',
      intro_lines: [
        '本行程的国际航班节点使用 JFK Terminal 1；抵达、值机与上下客位置仍以航空公司及机场当天指引为准。',
        '国际航班建议保留充足的入境、行李提取、值机和安检时间。',
      ],
      strengths: [
        { title: '航站楼复核', desc: '出发前再次核对航班动态与实际航站楼。' },
        { title: '上下客衔接', desc: '到达或送机节点按行程备注所列楼层与车道执行。' },
      ],
      highlight_tags: ['Terminal 1', '国际航班', '预留手续时间'],
      ...image(
        'jfk-terminal-1.jpg',
        'JFK Terminal 1 实景 · Eric Salard · CC BY-SA 2.0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:JFK_AIRPORT_TERMINAL_1_(7507465248).jpg',
        'CC BY-SA 2.0',
      ),
    },
  },
  {
    id: 'hyatt-regency-princeton',
    aliases: ['hyatt regency princeton'],
    item_type: 'hotel',
    card_type: 'hotel_arrival_card',
    display_snapshot: {
      name_zh: '普林斯顿凯悦酒店',
      name_en: 'Hyatt Regency Princeton',
      entity_type_text: '酒店住宿',
      brand: 'Hyatt Regency',
      city: 'Princeton',
      state: 'NJ',
      location_text: 'Carnegie Center · Princeton',
      address: '102 Carnegie Center, Princeton, NJ 08540',
      intro_lines: [
        '酒店位于 Princeton 的 Carnegie Center，适合作为普林斯顿及 Hightstown 行程期间的住宿点。',
        '具体房型、确认号与入住要求以 Farland 已确认的酒店订单为准。',
      ],
      strengths: [
        { title: '行程衔接', desc: '便于衔接 Princeton University 与 Hightstown 方向安排。' },
        { title: '入住复核', desc: '到店前请核对入住人姓名、房型和确认信息。' },
      ],
      fit_tags: ['Princeton', 'Carnegie Center', '行程住宿'],
      ...image(
        'hyatt-regency-princeton.jpg',
        'Hyatt Regency Princeton 实景 · David Keddie · CC BY-SA 4.0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Hyatt_Regency_Princeton.jpg',
        'CC BY-SA 4.0',
      ),
    },
  },
  {
    id: 'hyatt-centric-times-square',
    aliases: ['hyatt centric times square new york', 'hyatt centric times square'],
    item_type: 'hotel',
    card_type: 'hotel_arrival_card',
    display_snapshot: {
      name_zh: '纽约时代广场凯悦尚萃酒店',
      name_en: 'Hyatt Centric Times Square New York',
      entity_type_text: '酒店住宿',
      brand: 'Hyatt Centric',
      city: 'New York',
      state: 'NY',
      area: 'Times Square',
      location_text: 'Times Square · Midtown Manhattan',
      address: '135 W 45th St, New York, NY 10036',
      intro_lines: [
        '酒店位于 Midtown Manhattan 的 Times Square 区域，便于衔接纽约市区博物馆与景点安排。',
        '具体房型、确认号与入住要求以 Farland 已确认的酒店订单为准。',
      ],
      strengths: [
        { title: '市中心位置', desc: '前往 Midtown 主要文化场馆与城市景点较方便。' },
        { title: '入住复核', desc: '到店前请核对入住人姓名、房型和确认信息。' },
      ],
      fit_tags: ['Times Square', 'Midtown', '城市住宿'],
      ...image(
        'times-square-area.jpg',
        'Times Square 区域实景（非酒店外观）· ISO Legacy · CC0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Times_Square_(New_York_City).jpg',
        'CC0',
      ),
    },
  },
  {
    id: 'peddie-school-ding-music-hall',
    aliases: ['ding music hall', 'the peddie school', 'peddie school', '夏校离校 学校接学生'],
    item_type: 'school_visit',
    card_type: 'school_visit_card',
    display_snapshot: {
      name_zh: '佩迪中学 · Ding Music Hall',
      name_en: 'The Peddie School · Ding Music Hall',
      entity_type_text: '寄宿制中学 · 夏校节点',
      city: 'Hightstown',
      state: 'NJ',
      location_text: 'Hightstown, New Jersey',
      address: '201 South Main Street, Hightstown, NJ 08520',
      intro_lines: [
        '佩迪中学位于新泽西州 Hightstown；本行程以 Ding Music Hall 作为夏校报到或离校衔接节点。',
        '校内落客、接人和手续办理位置以学校当天指引为准。',
      ],
      strengths: [
        { title: '校内衔接', desc: '从主入口进入后按学校报到或离校指引前往指定位置。' },
        { title: '材料与行李', desc: '按节点备注准备健康表格，并在离校时核对行李和随身物品。' },
      ],
      fit_tags: ['夏校报到', '校内接送', '材料复核', '行李核对'],
      ...image(
        'peddie-campus.jpg',
        'The Peddie School 校园实景 · Peddie School · CC BY-SA 3.0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Peddie_campus.jpg',
        'CC BY-SA 3.0',
      ),
    },
  },
  {
    id: 'tdap-booster-pending',
    aliases: ['tdap booster', 'tdap 加强针', '百白破加强针', '接种诊所 待确认'],
    item_type: 'meeting',
    card_type: 'meeting_card',
    display_snapshot: {
      name_zh: 'Tdap 加强针接种（诊所待确认）',
      name_en: 'Tdap Booster Appointment',
      entity_type_text: '医疗预约 · 待确认',
      city: 'Princeton',
      state: 'NJ',
      location_text: 'Princeton 周边 · 诊所待确认',
      address: 'Princeton, NJ 一带（诊所名称与地址待确认）',
      intro_lines: [
        '该节点用于完成 Tdap 百白破加强针接种；诊所名称、完整地址和预约时间尚待最终确认。',
        '如学校要求提交健康表格或接种记录，请随身携带并以诊所实际要求为准。',
      ],
      strengths: [
        { title: '信息待确认', desc: '预约完成后应同步诊所名称、地址与准确时间。' },
        { title: '材料准备', desc: '携带学校健康表格、既往接种记录及必要证件。' },
      ],
      fit_tags: ['诊所待确认', '健康表格', '接种记录'],
      highlight_tags: ['诊所待确认', '携带健康表格', '以实际预约为准'],
      ...image(
        'vaccination-scene.jpg',
        'Tdap 接种场景示意 · U.S. Air Force · Public Domain · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Cannon_behind_the_scenes,_Vaccinations_increase_vitality_120529-F-YG475-249.jpg',
        'Public Domain',
      ),
    },
  },
  {
    id: 'princeton-university',
    aliases: ['princeton university'],
    item_type: 'school_visit',
    card_type: 'school_visit_card',
    display_snapshot: {
      name_zh: '普林斯顿大学',
      name_en: 'Princeton University',
      entity_type_text: '私立研究型大学',
      city: 'Princeton',
      state: 'NJ',
      location_text: 'Princeton, New Jersey',
      address: 'Nassau St & Witherspoon St, Princeton, NJ 08542',
      intro_lines: [
        '普林斯顿大学的校园核心区集中在 Nassau Hall、University Chapel 与 Firestone Library 周边。',
        '本次为校园参观节点，具体开放区域和参观路线以学校当天安排为准。',
      ],
      strengths: [
        { title: '校园核心区', desc: '可重点了解 Nassau Hall、教堂与图书馆周边空间。' },
        { title: '本科体验', desc: '适合观察住宿型校园、学术氛围与学生生活环境。' },
      ],
      fit_tags: ['校园核心区', '研究型大学', '本科体验', '历史校园'],
      ...image(
        'princeton-university.jpg',
        'Nassau Hall 实景 · John Phelan · CC BY-SA 3.0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Nassau_Hall,_Princeton_University,_Princeton_NJ.jpg',
        'CC BY-SA 3.0',
      ),
    },
  },
  {
    id: 'palmer-square-princeton',
    aliases: ['palmer square'],
    item_type: 'sightseeing',
    card_type: 'landmark_card',
    display_snapshot: {
      name_zh: '帕默广场',
      name_en: 'Palmer Square',
      entity_type_text: '城市街区与公共广场',
      city: 'Princeton',
      state: 'NJ',
      location_text: 'Downtown Princeton',
      address: '40 Palmer Square W, Princeton, NJ 08542',
      intro_lines: [
        'Palmer Square 位于 Princeton 市中心，适合在访校后轻松散步、休息并感受小镇街区。',
        '本节点以不赶行程为原则，具体停留时间可结合体力与后续赴纽约路况调整。',
      ],
      strengths: [
        { title: '小镇氛围', desc: '可步行感受 Palmer Square 与 Nassau Street 周边街区。' },
        { title: '弹性停留', desc: '可根据当天体力和赴纽约路况灵活缩短或延长。' },
      ],
      highlight_tags: ['Princeton 小镇', '轻松散步', '弹性停留'],
      ...image(
        'palmer-square.jpg',
        'Palmer Square 街区实景 · DimiTalen · CC0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Corner_of_Nassau_Street_and_Palmer_Square,_Princeton,_2007.jpg',
        'CC0',
      ),
    },
  },
  {
    id: 'met-fifth-avenue',
    aliases: ['the metropolitan museum of art', 'metropolitan museum of art', 'the met'],
    item_type: 'sightseeing',
    card_type: 'museum_card',
    display_snapshot: {
      name_zh: '大都会艺术博物馆',
      name_en: 'The Metropolitan Museum of Art',
      entity_type_text: '艺术博物馆',
      museum_group: 'The Met',
      city: 'New York',
      state: 'NY',
      area: 'Museum Mile',
      location_text: 'Fifth Avenue · Museum Mile',
      address: '1000 5th Ave, New York, NY 10028',
      intro_lines: [
        'The Met 馆藏跨越多个文明与历史时期，馆区规模较大，适合围绕重点展区进行取舍。',
        '本行程按节点备注安排参观或讲解，实际入馆与集合位置以当天票务和现场指引为准。',
      ],
      strengths: [
        { title: '重点展区优先', desc: '在有限时间内优先选择最感兴趣的馆藏板块。' },
        { title: '集合位置清晰', desc: '按行程备注在 Fifth Avenue 正门附近完成上下客与集合。' },
      ],
      highlight_tags: ['艺术馆藏', '重点展区', 'Museum Mile'],
      ...image(
        'met-fifth-avenue.jpg',
        'The Met Fifth Avenue 入口实景 · PerpetualTraveler · CC BY-SA 4.0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Entrance_to_The_Met_Fifth_Avenue_(2022).jpg',
        'CC BY-SA 4.0',
      ),
    },
  },
  {
    id: 'central-park',
    aliases: ['central park'],
    item_type: 'sightseeing',
    card_type: 'landmark_card',
    display_snapshot: {
      name_zh: '中央公园',
      name_en: 'Central Park',
      entity_type_text: '城市公园',
      city: 'New York',
      state: 'NY',
      area: 'Manhattan',
      location_text: 'Manhattan · New York',
      address: 'Grand Army Plaza, 5th Ave & W 59th St, New York, NY 10019',
      intro_lines: [
        '中央公园适合作为纽约市区行程中的放松节点，可根据体力选择短距离散步或就近休息。',
        '本行程以上下客方便和不赶路为优先，停留范围可围绕 Grand Army Plaza 调整。',
      ],
      strengths: [
        { title: '轻松节奏', desc: '可根据体力缩短路线，不要求完成固定步行线路。' },
        { title: '市区衔接', desc: '便于衔接 Fifth Avenue、Midtown 与酒店方向。' },
      ],
      highlight_tags: ['城市公园', '轻松散步', '体力优先'],
      ...image(
        'central-park.jpg',
        'Central Park Bow Bridge 实景 · Rhododendrites · CC BY-SA 4.0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Bow_Bridge_panorama_Central_Park_(86746p).jpg',
        'CC BY-SA 4.0',
      ),
    },
  },
  {
    id: 'morgan-library',
    aliases: ['morgan library museum', 'morgan library and museum', 'morgan library & museum'],
    item_type: 'sightseeing',
    card_type: 'museum_card',
    display_snapshot: {
      name_zh: '摩根图书馆与博物馆',
      name_en: 'The Morgan Library & Museum',
      entity_type_text: '图书馆与艺术博物馆',
      city: 'New York',
      state: 'NY',
      area: 'Murray Hill',
      location_text: 'Madison Avenue · Murray Hill',
      address: '225 Madison Ave, New York, NY 10016',
      intro_lines: [
        'The Morgan 以历史图书馆空间、手稿、珍本与艺术收藏为核心，规模适合安排较轻量的参观。',
        '本节点可重点关注 McKim Building 的建筑与馆内代表性展陈。',
      ],
      strengths: [
        { title: '历史图书馆空间', desc: 'McKim Building 是本次参观的重要看点。' },
        { title: '轻量参观', desc: '适合在退房与后续 Midtown 行程之间安排约一至两小时。' },
      ],
      highlight_tags: ['历史图书馆', '手稿珍本', '建筑空间'],
      ...image(
        'morgan-library.jpg',
        'Morgan Library McKim Building 实景 · Beyond My Ken · CC BY-SA 4.0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Morgan_Library_McKim_Building_from_west.jpg',
        'CC BY-SA 4.0',
      ),
    },
  },
  {
    id: 'moma-new-york',
    aliases: ['museum of modern art', 'moma'],
    item_type: 'sightseeing',
    card_type: 'museum_card',
    display_snapshot: {
      name_zh: '纽约现代艺术博物馆',
      name_en: 'The Museum of Modern Art (MoMA)',
      entity_type_text: '现代与当代艺术博物馆',
      museum_group: 'MoMA',
      city: 'New York',
      state: 'NY',
      area: 'Midtown Manhattan',
      location_text: 'W 53rd St · Midtown',
      address: '11 W 53rd St, New York, NY 10019',
      intro_lines: [
        'MoMA 以现代与当代艺术、设计、摄影和影像收藏见长，适合围绕感兴趣的楼层进行轻量参观。',
        '本节点之后仍有晚餐与机场送机安排，应按行程备注控制参观节奏并预留离馆时间。',
      ],
      strengths: [
        { title: '现代艺术重点', desc: '可优先关注绘画、设计、摄影或当期展览。' },
        { title: '送机时间管理', desc: '离馆后按计划简单用餐，并为 JFK 国际航班预留充足时间。' },
      ],
      highlight_tags: ['现代艺术', '设计与摄影', '控制参观节奏'],
      ...image(
        'moma.jpg',
        'MoMA 外观实景 · ajay_suresh · CC BY 2.0 · Wikimedia Commons',
        'https://commons.wikimedia.org/wiki/File:Museum_of_Modern_Art_(MoMA)_(51395759113).jpg',
        'CC BY 2.0',
      ),
    },
  },
];

function text(value) {
  return value == null ? '' : String(value).trim();
}

function normalize(value) {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[（()）&·/\\|:_—–-]+/g, ' ')
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function profileMatches(profile, item) {
  const itemType = normalize(item && (item.item_type || item.type));
  if (Array.isArray(profile.itemTypes) && profile.itemTypes.includes(itemType)) return true;
  const haystack = normalize([
    item && item.title,
    item && item.location_name,
    item && item.name,
    item && item.subtitle,
  ].filter(Boolean).join(' '));
  if (!haystack) return false;
  return (profile.aliases || []).some((alias) => haystack.includes(normalize(alias)));
}

function findProfile(item) {
  return PROFILES.find((profile) => profileMatches(profile, item)) || null;
}

function buildTimeSnapshot(item) {
  const existing = isPlainObject(item.time_snapshot) ? item.time_snapshot : {};
  const arrival = text(existing.arrival_time || item.planned_arrival_time || item.arrival_time);
  const appointment = text(existing.appointment_time || item.planned_start_time || item.appointment_time || item.time);
  const note = text(item.customer_note || item.note || item.description);
  const inferredArrivalDayOffset = !appointment && arrival && /次日/.test(note) ? 1 : 0;
  return {
    ...existing,
    arrival_time: arrival,
    appointment_time: appointment,
    start_time: text(existing.start_time || item.planned_start_time || item.time),
    end_time: text(existing.end_time || item.planned_end_time || item.end_time),
    arrival_time_day_offset: Number(existing.arrival_time_day_offset || inferredArrivalDayOffset || 0),
    end_time_day_offset: Number(existing.end_time_day_offset || 0),
    has_time: Boolean(arrival || appointment || existing.end_time || item.planned_end_time || item.end_time),
  };
}

function buildTravelSnapshot(item) {
  const existing = isPlainObject(item.travel_snapshot) ? item.travel_snapshot : {};
  const sourceDriveTime = text(existing.source_drive_time_text || item.drive_time_text || item.drive_time);
  const displayDriveTime = /^0(?::00)?\s*(?:min|mins|minute|minutes|分钟)?$/i.test(sourceDriveTime)
    ? ''
    : text(existing.drive_time_text || item.drive_time_text || item.drive_time);
  const sourceTraffic = text(existing.traffic_text || item.traffic_text || item.traffic);
  const displayTraffic = /traffic[-\s]?aware estimate|predictive traffic|traffic estimate|maps_current|路况预估/i.test(sourceTraffic)
    ? ''
    : sourceTraffic;
  return {
    ...existing,
    source_drive_time_text: sourceDriveTime,
    drive_time_text: displayDriveTime,
    distance_text: text(existing.distance_text || item.distance_text || item.distance),
    traffic_text: displayTraffic,
  };
}

function clockMinutes(value) {
  const match = text(value).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function markOvernightArrivals(items) {
  let previousMinutes = null;
  return (Array.isArray(items) ? items : []).map((item) => {
    const appointment = text(item.time || item.planned_start_time || (item.time_snapshot && item.time_snapshot.appointment_time));
    const arrival = text(item.planned_arrival_time || (item.time_snapshot && item.time_snapshot.arrival_time));
    const appointmentMinutes = clockMinutes(appointment);
    const arrivalMinutes = clockMinutes(arrival);
    const crossesMidnight = !appointment
      && arrivalMinutes !== null
      && previousMinutes !== null
      && previousMinutes - arrivalMinutes > 12 * 60;
    const next = crossesMidnight ? {
      ...item,
      time: `次日 ${arrival}`,
      time_snapshot: {
        ...(item.time_snapshot || {}),
        arrival_time_day_offset: 1,
      },
    } : item;
    const currentMinutes = appointmentMinutes !== null ? appointmentMinutes : arrivalMinutes;
    if (currentMinutes !== null) previousMinutes = currentMinutes;
    return next;
  });
}

function removeMealsBeforeServiceStart(items, day) {
  const departure = clockMinutes(
    day && (day.estimated_departure_time_raw || day.estimated_departure_time || day.start_time_text),
  );
  if (departure === null) return items;
  return (Array.isArray(items) ? items : []).filter((item) => {
    const isMeal = normalize(item && (item.item_type || item.type)) === 'meal';
    const mealTime = clockMinutes(item && item.time);
    return !(isMeal && mealTime !== null && departure - mealTime > 6 * 60);
  });
}

function enrichTimelineItem(value) {
  const item = isPlainObject(value) ? value : {};
  const profile = findProfile(item);
  if (!profile) return item;
  const existingDisplay = isPlainObject(item.display_snapshot) ? item.display_snapshot : {};
  const displaySnapshot = {
    ...clone(profile.display_snapshot),
    ...existingDisplay,
  };
  const existingUiFlags = isPlainObject(item.ui_flags) ? item.ui_flags : {};
  const timeSnapshot = buildTimeSnapshot(item);
  const displayTime = text(item.time)
    || (timeSnapshot.arrival_time_day_offset > 0 && timeSnapshot.arrival_time
      ? `次日 ${timeSnapshot.arrival_time}`
      : '');
  const travelSnapshot = buildTravelSnapshot(item);
  return {
    ...item,
    ...(displayTime ? { time: displayTime } : {}),
    item_type: profile.item_type || item.item_type || item.type || '',
    card_type: profile.card_type || item.card_type || item.cardType || item.item_type || '',
    address: text(item.address || displaySnapshot.address),
    hero_image_url: text(item.hero_image_url || displaySnapshot.hero_image_url),
    drive_time_text: travelSnapshot.drive_time_text,
    distance_text: travelSnapshot.distance_text,
    traffic_text: travelSnapshot.traffic_text,
    entity_ref: item.entity_ref || { catalog: 'farland_place_catalog', profile_id: profile.id },
    display_snapshot: displaySnapshot,
    time_snapshot: timeSnapshot,
    travel_snapshot: travelSnapshot,
    ui_flags: {
      show_route: false,
      show_travel_meta: false,
      show_contact_advisor: false,
      show_driver: false,
      ...(profile.ui_flags || {}),
      ...existingUiFlags,
    },
  };
}

function enrichItineraryDays(values) {
  return (Array.isArray(values) ? values : []).map((day) => {
    if (!isPlainObject(day)) return day;
    const timeline = Array.isArray(day.timeline_items)
      ? day.timeline_items
      : (Array.isArray(day.items) ? day.items : []);
    const customerVisibleTimeline = removeMealsBeforeServiceStart(timeline.map(enrichTimelineItem), day);
    const enriched = markOvernightArrivals(customerVisibleTimeline);
    return {
      ...day,
      timeline_items: enriched,
      ...(Array.isArray(day.items) ? { items: enriched } : {}),
      content_enrichment_version: CONTENT_ENRICHMENT_VERSION,
    };
  });
}

function enrichHotels(values) {
  return (Array.isArray(values) ? values : []).map((hotel) => {
    if (!isPlainObject(hotel)) return hotel;
    const profile = findProfile({
      title: hotel.name || hotel.hotel_name || hotel.title,
      item_type: 'hotel',
    });
    if (!profile || profile.item_type !== 'hotel') return hotel;
    const snapshot = clone(profile.display_snapshot);
    return {
      ...hotel,
      name_en: text(hotel.name_en || snapshot.name_en),
      name_zh: text(hotel.name_zh || snapshot.name_zh),
      brand: text(hotel.brand || snapshot.brand),
      city: text(snapshot.city || hotel.city),
      address: text(hotel.address || snapshot.address),
      hero_image_url: text(hotel.hero_image_url || snapshot.hero_image_url),
      display_snapshot: {
        ...snapshot,
        ...(isPlainObject(hotel.display_snapshot) ? hotel.display_snapshot : {}),
      },
      content_enrichment_version: CONTENT_ENRICHMENT_VERSION,
    };
  });
}

module.exports = {
  CONTENT_ENRICHMENT_VERSION,
  enrichHotels,
  enrichItineraryDays,
  enrichTimelineItem,
  findProfile,
};
