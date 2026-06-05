const SCHOOL_PROFILE_FALLBACKS = {
  'boston university': {
    name_en: 'Boston University',
    name_zh: '波士顿大学',
    entity_type_text: '私立研究型大学',
    city: 'Boston',
    state: 'MA',
    address: '881 Commonwealth Ave, Boston, MA',
    ranking_badges: [
      { system: 'QS', year: 2026, display_text: 'QS 2026 #88' },
      { system: 'US News', year: 2026, display_text: 'US News 2026 #42' },
    ],
    intro_lines: [
      '波士顿大学位于波士顿市区，是一所规模较大的私立研究型大学，校园与城市连接紧密。',
      '适合关注商科、传媒、健康科学、工程和跨学科资源的学生重点了解。',
    ],
    strengths: [
      {
        title: 'Sargent 康复科学学院',
        desc: '职业治疗、语言病理、康复科学方向值得关注。',
      },
      {
        title: 'College of Communication',
        desc: '传媒、新闻、电影电视相关方向受关注。',
      },
      {
        title: 'Questrom 商学院',
        desc: '商科、管理、商业分析等方向适合职业导向学生。',
      },
    ],
    fit_tags: ['城市型校园', '商科/传媒', '健康科学', '大校资源'],
  },
  'boston college': {
    name_en: 'Boston College',
    name_zh: '波士顿学院',
    entity_type_text: '私立天主教研究型大学',
    city: 'Chestnut Hill',
    state: 'MA',
    address: '140 Commonwealth Avenue, Chestnut Hill, MA 02467',
    ranking_badges: [
      { system: 'Profile', year: 2026, display_text: 'Jesuit Research University' },
    ],
    intro_lines: [
      '波士顿学院位于 Chestnut Hill，校园气质更偏传统学院式，同时离波士顿市区资源不远。',
      '适合关注商科、人文社科、核心课程和强社区型本科体验的学生重点了解。',
    ],
    strengths: [
      { title: 'Carroll School of Management', desc: '商科、金融、会计和管理方向值得重点观察。' },
      { title: 'Liberal Arts Core', desc: '核心课程强调通识、人文和伦理基础。' },
      { title: 'Boston Access', desc: '兼具校园社区和波士顿都市圈资源。' },
    ],
    fit_tags: ['波士顿周边', '学院式校园', '商科', '人文社科'],
  },
  'babson college': {
    name_en: 'Babson College',
    name_zh: '巴布森学院',
    entity_type_text: '私立商科与创业学院',
    city: 'Wellesley',
    state: 'MA',
    address: '231 Forest Street, Babson Park, MA 02457',
    ranking_badges: [
      { system: 'Profile', year: 2026, display_text: 'Entrepreneurship-focused College' },
    ],
    intro_lines: [
      '巴布森学院以创业教育和本科商科体验见长，校园规模不大，节奏更偏实践和项目驱动。',
      '短停参观时可以重点看校园尺度、商科课程氛围、创业资源和学生项目展示空间。',
    ],
    strengths: [
      { title: 'Entrepreneurship', desc: '创业教育是学校最有辨识度的方向。' },
      { title: 'Business Foundation', desc: '本科阶段强调商业基础、团队项目和实践决策。' },
      { title: 'Small Campus', desc: '校园紧凑，适合短时间快速感受学习与生活尺度。' },
    ],
    fit_tags: ['创业', '本科商科', '小型校园', '实践导向'],
  },
};

Page({
  data: {
    todayCard: null,
    cards: [],
    currentIndex: 0,
    currentCard: null,
  },

  onLoad(options = {}) {
    const app = getApp();
    const route = this.normalizeRouteParams(options);
    const storedCard = (app.globalData && app.globalData.todayCardDetail) || wx.getStorageSync('todayCardDetail') || null;
    const cachedCard = this.findCachedTripDayCard(route);
    const card = route.hasRoute
      ? (this.cardMatchesRoute(storedCard, route) ? storedCard : cachedCard)
      : storedCard;
    if (!card) {
      this.setData({ todayCard: null, cards: [] });
      return;
    }
    const normalized = this.normalizeTodayCard(card);
    this.setData({
      todayCard: normalized,
      cards: normalized.destination_cards,
      currentIndex: 0,
      currentCard: normalized.destination_cards[0] || null,
    });
  },

  normalizeRouteParams(options) {
    const tripId = this.decodeQueryValue(options.trip_id || '');
    const parsedDayNo = Number(options.day_no || 0);
    const dayNo = Number.isFinite(parsedDayNo) ? parsedDayNo : 0;
    return {
      trip_id: tripId,
      day_no: dayNo,
      hasRoute: Boolean(tripId || dayNo),
    };
  },

  decodeQueryValue(value) {
    if (!value && value !== 0) return '';
    try {
      return decodeURIComponent(String(value));
    } catch (error) {
      return String(value);
    }
  },

  cardMatchesRoute(card, route) {
    if (!card || !route || !route.hasRoute) return false;
    if (route.trip_id) {
      if (!card.trip_id) return false;
      if (String(card.trip_id) !== route.trip_id) return false;
    }
    if (route.day_no && Number(card.day_no || 0) !== route.day_no) return false;
    return true;
  },

  findCachedTripDayCard(route) {
    const app = getApp();
    const context = (app.globalData && app.globalData.customerTripDetailContext)
      || wx.getStorageSync('customerTripDetailContext')
      || null;
    if (!context) return null;
    if (route.trip_id) {
      if (!context.trip_id) return null;
      if (String(context.trip_id) !== route.trip_id) return null;
    }
    const cards = Array.isArray(context.cards) ? context.cards : [];
    if (!cards.length) return null;
    if (!route.day_no) return cards[0] || null;
    return cards.find((card) => Number(card.day_no || 0) === route.day_no) || null;
  },

  normalizeAssignedDriver(source) {
    if (!source) return null;
    const driverName = source.name || source.driver_name || source.display_name || '';
    const phone = source.phone || source.driver_phone || '';
    const vehicleModel = source.vehicle_model || '';
    const vehicleType = source.vehicle_type || source.vehicle_class || '';
    const plateNumber = source.plate_number || '';
    if (!driverName && !phone && !vehicleModel && !vehicleType && !plateNumber) return null;
    return {
      name: driverName,
      phone,
      vehicle_model: vehicleModel,
      vehicle_type: vehicleType,
      plate_number: plateNumber,
      vehicleText: vehicleModel || vehicleType || '车辆待确认',
      detailLine: [
        driverName ? `司机：${driverName}` : '',
        vehicleModel || vehicleType ? `车辆：${vehicleModel || vehicleType}` : '',
        phone ? `电话：${phone}` : '',
      ].filter(Boolean).join(' · '),
    };
  },

  normalizeTodayCard(card) {
    const normalizedDriver = this.normalizeAssignedDriver(card.driver || card.assigned_transport || null);
    const driverAssigned = card.driver_visibility === 'assigned' && normalizedDriver;
    const sourceCards = Array.isArray(card.destination_cards) && card.destination_cards.length
      ? card.destination_cards
      : this.buildCardsFromTimeline(card.timeline_items || []);
    const cards = sourceCards.map((item, index) => this.normalizeDestinationCard(item, index));
    const serviceWindowText = this.formatDisplayTime(
      (card.service_window && card.service_window.label) || card.service_window || card.depart_time || '',
    );
    const hotel = card.hotel
      ? {
          ...card.hotel,
          arrival_time: this.formatDisplayTime(card.hotel.arrival_time || card.hotel.eta || ''),
        }
      : null;
    const dayCard = { ...card, serviceWindowText };
    const destinationCards = this.decorateCards(this.appendHotelCard(cards, hotel, dayCard), dayCard);
    return {
      ...card,
      destination_cards: destinationCards,
      hotel,
      driver: driverAssigned ? normalizedDriver : null,
      driverPendingText: driverAssigned ? '' : '司机信息将在 Farland 完成确认后同步。',
      serviceTitle: card.service_type === 'transfer' ? '今日接送安排' : '今日包车服务',
      serviceWindowText,
      serviceSubText: [card.party_summary, driverAssigned ? '已分配司机' : '司机信息待同步'].filter(Boolean).join(' · '),
    };
  },

  normalizeDestinationCard(item, index) {
    const cardType = item.card_type || item.cardType || item.item_type || item.type || 'custom';
    const type = item.type || item.item_type || cardType || 'custom';
    const isStructured = this.isStructuredDestinationCardType({ card_type: cardType, type });
    const hasExplicitUiFlags = this.hasExplicitUiFlags(item);
    const uiFlags = this.normalizeUiFlags(item);
    const timeSnapshot = this.normalizeTimeSnapshot(item);
    const time = this.formatDisplayTime(item.time || timeSnapshot.appointment_time || timeSnapshot.start_time || timeSnapshot.arrival_time || '');
    const latitude = Number(item.latitude || item.lat || item.map_latitude || 0);
    const longitude = Number(item.longitude || item.lng || item.map_longitude || 0);
    const rawTravelLine = this.composeTravelMetaLine(item);
    const showRoute = hasExplicitUiFlags ? uiFlags.show_route : (!isStructured && Boolean(item.route));
    const showTravelMeta = hasExplicitUiFlags ? uiFlags.show_travel_meta : (!isStructured && Boolean(item.legMeta || item.detailLine || rawTravelLine));
    return {
      ...item,
      type,
      card_type: cardType,
      ui_flags: uiFlags,
      time,
      arrival_estimate: this.formatDisplayTime(item.arrival_estimate || item.planned_arrival_time || ''),
      card_id: item.card_id || item.item_id || item.id || `${item.time || 'node'}-${index}`,
      sequence: item.sequence || index + 1,
      typeText: this.typeText(cardType || type),
      chipText: `${time || ''} ${this.shortTitle(item.title || '')}`.trim(),
      show_route: showRoute,
      show_travel_meta: showTravelMeta,
      detailLine: showTravelMeta ? (item.legMeta || item.detailLine || rawTravelLine) : '',
      latitude,
      longitude,
      map_url: item.map_url || '',
      canOpenMap: Boolean((latitude && longitude) || item.map_url),
    };
  },

  decorateCards(cards = [], dayCard = {}) {
    const totalCount = cards.length;
    return cards.map((card, index) => {
      const next = {
        ...card,
        sequence: index + 1,
        total_count: totalCount,
      };
      return this.normalizeCardForDisplay(next, dayCard);
    });
  },

  normalizeCardForDisplay(card, dayCard = {}) {
    if (this.isSchoolVisitCard(card)) return this.normalizeSchoolVisitCard(card, dayCard);
    if (this.isStructuredDestinationCardType(card)) return this.normalizeStructuredDestinationCard(card, dayCard);
    return card;
  },

  hasExplicitUiFlags(card = {}) {
    return Boolean(card.ui_flags || card.uiFlags);
  },

  normalizeUiFlags(card = {}) {
    const source = card.ui_flags || card.uiFlags || {};
    return {
      show_route: source.show_route === true,
      show_travel_meta: source.show_travel_meta === true,
      show_contact_advisor: source.show_contact_advisor === true,
      show_driver: source.show_driver === true,
    };
  },

  isStructuredDestinationCardType(card = {}) {
    const type = String(card.card_type || card.cardType || card.type || card.item_type || '').trim();
    return [
      'school_visit_card',
      'landmark_card',
      'museum_card',
      'meeting_card',
      'flight_card',
      'hotel_arrival_card',
      'custom_activity_card',
      'landmark',
      'museum',
      'meeting',
      'flight',
      'hotel_arrival',
    ].includes(type);
  },

  isSchoolVisitCard(card) {
    const type = card.card_type || card.type || card.item_type || '';
    return type === 'school_visit_card' || type === 'school_visit' || type === 'campus';
  },

  normalizeSchoolVisitCard(card, dayCard = {}) {
    const displaySnapshot = this.normalizeSchoolDisplaySnapshot(card);
    const timeSnapshot = this.normalizeSchoolTimeSnapshot(card, dayCard);
    const timeItems = this.buildTimeItems(card.card_type || 'school_visit_card', timeSnapshot);
    const uiFlags = this.normalizeUiFlags(card);
    return {
      ...card,
      card_type: card.card_type || 'school_visit_card',
      type: 'school_visit',
      typeText: '访校',
      isSchoolVisitCard: true,
      ui_flags: uiFlags,
      show_route: uiFlags.show_route,
      show_travel_meta: uiFlags.show_travel_meta,
      display_snapshot: displaySnapshot,
      time_snapshot: timeSnapshot,
      timeItems,
      title: displaySnapshot.name_en || displaySnapshot.name_zh || card.title || '学校访问',
      chipText: `${timeSnapshot.arrival_time || timeSnapshot.appointment_time || timeSnapshot.start_time || card.time || ''} ${displaySnapshot.name_en || displaySnapshot.name_zh || card.title || '访校'}`.trim(),
    };
  },

  normalizeSchoolDisplaySnapshot(card) {
    const snapshot = card.display_snapshot || card.displaySnapshot || {};
    const fallback = this.findSchoolProfileFallback(card, snapshot);
    const nameEn = snapshot.name_en || snapshot.name || fallback.name_en || card.name_en || card.title || '';
    const nameZh = snapshot.name_zh || fallback.name_zh || card.name_zh || '';
    const city = snapshot.city || fallback.city || card.city || '';
    const state = snapshot.state || fallback.state || card.state || '';
    const rankingSource = Array.isArray(snapshot.ranking_badges)
      ? snapshot.ranking_badges
      : (Array.isArray(snapshot.rankings) ? snapshot.rankings : (fallback.ranking_badges || []));
    const rankingBadges = rankingSource
      .map((item) => ({
        system: item.system || '',
        year: item.year || '',
        display_text: item.display_text || '',
      }))
      .filter((item) => item.display_text);
    const strengths = (Array.isArray(snapshot.strengths) ? snapshot.strengths : (fallback.strengths || []))
      .map((item) => (typeof item === 'string' ? { title: item, desc: '' } : {
        title: item.title || '',
        desc: item.desc || item.description || '',
      }))
      .filter((item) => item.title)
      .slice(0, 3);
    const introLines = (Array.isArray(snapshot.intro_lines) ? snapshot.intro_lines : (fallback.intro_lines || []))
      .filter(Boolean)
      .slice(0, 2);
    const fitTags = (Array.isArray(snapshot.fit_tags) ? snapshot.fit_tags : (fallback.fit_tags || []))
      .filter(Boolean)
      .slice(0, 4);
    return {
      ...snapshot,
      name_en: nameEn,
      name_zh: nameZh,
      entity_type_text: snapshot.entity_type_text || fallback.entity_type_text || '',
      city,
      state,
      location_text: snapshot.location_text || [city, state].filter(Boolean).join(', '),
      address: snapshot.address || fallback.address || card.address || card.location || '',
      ranking_badges: rankingBadges,
      intro_lines: introLines,
      strengths,
      fit_tags: fitTags,
    };
  },

  normalizeStructuredDestinationCard(card, dayCard = {}) {
    const cardType = card.card_type || card.cardType || card.type || card.item_type || 'custom_activity_card';
    const displaySnapshot = this.normalizeDisplaySnapshot(card);
    const timeSnapshot = this.normalizeTimeSnapshot(card, dayCard);
    const uiFlags = this.normalizeUiFlags(card);
    const primaryName = this.getStructuredPrimaryName(cardType, card, displaySnapshot);
    const secondaryName = this.getStructuredSecondaryName(cardType, card, displaySnapshot, primaryName);
    const introLines = this.normalizeIntroLines(displaySnapshot.intro_lines, card.note || card.description || '');
    const tags = this.getStructuredTags(cardType, displaySnapshot);
    const detailItems = this.buildStructuredDetailItems(cardType, card, displaySnapshot, timeSnapshot, dayCard);
    const timeItems = this.buildTimeItems(cardType, timeSnapshot, displaySnapshot);
    return {
      ...card,
      card_type: cardType,
      typeText: this.typeText(cardType),
      isInfoCard: true,
      ui_flags: uiFlags,
      show_route: uiFlags.show_route,
      show_travel_meta: uiFlags.show_travel_meta,
      display_snapshot: displaySnapshot,
      time_snapshot: timeSnapshot,
      primaryName,
      secondaryName,
      metaLine: this.buildStructuredMetaLine(cardType, displaySnapshot),
      sectionLabel: this.getStructuredSectionLabel(cardType),
      introLines,
      tagLabel: this.getStructuredTagLabel(cardType),
      tags,
      detailItems,
      timeItems,
      timeWarningText: timeSnapshot.time_warning_text || '',
      title: primaryName || card.title || '行程节点',
      subtitle: secondaryName || card.subtitle || '',
      time: card.time || timeSnapshot.appointment_time || timeSnapshot.start_time || timeSnapshot.arrival_time || '',
      chipText: `${card.time || timeSnapshot.appointment_time || timeSnapshot.start_time || timeSnapshot.arrival_time || ''} ${primaryName || card.title || ''}`.trim(),
    };
  },

  normalizeDisplaySnapshot(card = {}) {
    const snapshot = card.display_snapshot || card.displaySnapshot || {};
    const city = snapshot.city || card.city || '';
    const state = snapshot.state || card.state || '';
    const area = snapshot.area || card.area || '';
    const nameEn = snapshot.name_en || snapshot.name || card.name_en || card.subtitle || card.title || '';
    const nameZh = snapshot.name_zh || card.name_zh || card.title || nameEn;
    return {
      ...snapshot,
      name_en: nameEn,
      name_zh: nameZh,
      entity_type_text: snapshot.entity_type_text || snapshot.landmark_type || snapshot.museum_group || card.entity_type_text || '',
      city,
      state,
      area,
      location_text: snapshot.location_text || [city, area || state].filter(Boolean).join(' · ') || card.location || '',
      address: snapshot.address || card.address || card.location || '',
      group: snapshot.group || card.group || '',
      brand: snapshot.brand || card.brand || '',
      star_rating: snapshot.star_rating || card.star_rating || '',
      landmark_type: snapshot.landmark_type || snapshot.entity_type_text || '',
      museum_group: snapshot.museum_group || snapshot.group || '',
      intro_lines: this.normalizeIntroLines(snapshot.intro_lines, card.note || card.description || ''),
      fit_tags: this.normalizeList(snapshot.fit_tags || card.fit_tags, 5),
      highlight_tags: this.normalizeList(snapshot.highlight_tags || card.highlight_tags || snapshot.fit_tags || card.fit_tags, 5),
    };
  },

  normalizeList(values, limit = 4) {
    let list = [];
    if (Array.isArray(values)) {
      list = values.map((item) => {
        if (typeof item === 'string') return item;
        return item.display_text || item.title || item.label || item.name || '';
      });
    } else if (typeof values === 'string') {
      list = values.split(/[、,，/|]/g);
    }
    return list.map((item) => String(item || '').trim()).filter(Boolean).slice(0, limit);
  },

  normalizeIntroLines(values, fallbackText = '') {
    if (Array.isArray(values)) {
      const lines = values.map((item) => String(item || '').trim()).filter(Boolean);
      if (lines.length) return lines.slice(0, 2);
    }
    const text = String(fallbackText || '').trim();
    if (!text) return [];
    return text
      .split(/\s*(?:\n|。)\s*/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2);
  },

  normalizeTimeSnapshot(card = {}, dayCard = {}) {
    const snapshot = card.time_snapshot || card.timeSnapshot || {};
    const departureTime = this.extractDisplayTime(snapshot.departure_time || card.departure_time || dayCard.depart_time || dayCard.serviceWindowText || '');
    const arrivalTime = this.extractDisplayTime(snapshot.arrival_time || card.arrival_estimate || card.planned_arrival_time || card.arrival_time || '');
    const appointmentTime = this.extractDisplayTime(snapshot.appointment_time || card.appointment_time || card.planned_start_time || '');
    const startTimeFallback = arrivalTime ? '' : (card.time || '');
    const startTime = this.extractDisplayTime(snapshot.start_time || card.start_time || startTimeFallback);
    const endTime = this.extractDisplayTime(snapshot.end_time || card.end_time || card.planned_end_time || '');
    const arrivalMinutes = this.toMinutes(arrivalTime);
    const appointmentMinutes = this.toMinutes(appointmentTime);
    const warningText = snapshot.time_warning_text
      || (arrivalMinutes !== null && appointmentMinutes !== null && arrivalMinutes > appointmentMinutes ? '时间待复核' : '');
    return {
      departure_time: departureTime,
      arrival_time: arrivalTime,
      appointment_time: appointmentTime,
      start_time: startTime,
      end_time: endTime,
      time_warning_text: warningText,
      has_time: Boolean(departureTime || arrivalTime || appointmentTime || startTime || endTime),
    };
  },

  getStructuredPrimaryName(cardType, card, displaySnapshot) {
    if (cardType === 'flight_card' || cardType === 'flight') {
      return displaySnapshot.flight_no || this.extractFlightNumber(card.title || displaySnapshot.name_en || '') || card.title || '航班安排';
    }
    if (cardType === 'meeting_card' || cardType === 'meeting') {
      return displaySnapshot.name_zh || card.title || '会面安排';
    }
    return displaySnapshot.name_zh || card.title || displaySnapshot.name_en || '行程节点';
  },

  getStructuredSecondaryName(cardType, card, displaySnapshot, primaryName) {
    if (cardType === 'flight_card' || cardType === 'flight') {
      return displaySnapshot.route || card.route || '';
    }
    const secondary = displaySnapshot.name_en || card.subtitle || '';
    return secondary && secondary !== primaryName ? secondary : '';
  },

  extractFlightNumber(value) {
    const match = String(value || '').match(/\b[A-Z]{2}\d{2,4}\b/);
    return match ? match[0] : '';
  },

  buildStructuredMetaLine(cardType, displaySnapshot) {
    if (cardType === 'hotel_arrival_card' || cardType === 'hotel_arrival') {
      return this.uniqueJoin([
        displaySnapshot.group,
        displaySnapshot.brand,
        displaySnapshot.star_rating ? `${displaySnapshot.star_rating}星` : '',
        displaySnapshot.location_text,
      ]);
    }
    if (cardType === 'museum_card' || cardType === 'museum') {
      return this.uniqueJoin([
        displaySnapshot.location_text,
        displaySnapshot.museum_group || displaySnapshot.group,
        displaySnapshot.entity_type_text,
      ]);
    }
    if (cardType === 'meeting_card' || cardType === 'meeting') {
      return this.uniqueJoin([displaySnapshot.entity_type_text || '会面 / 预约', displaySnapshot.location_text]);
    }
    if (cardType === 'flight_card' || cardType === 'flight') {
      return this.uniqueJoin([
        displaySnapshot.departure_airport && displaySnapshot.arrival_airport ? `${displaySnapshot.departure_airport} → ${displaySnapshot.arrival_airport}` : '',
        displaySnapshot.aircraft,
      ]);
    }
    return this.uniqueJoin([displaySnapshot.location_text, displaySnapshot.entity_type_text || displaySnapshot.landmark_type]);
  },

  buildStructuredDetailItems(cardType, card, displaySnapshot, timeSnapshot, dayCard = {}) {
    if (cardType === 'flight_card' || cardType === 'flight') {
      return [
        { label: '起飞', value: displaySnapshot.takeoff_time || displaySnapshot.departure_time || '' },
        { label: '到达', value: displaySnapshot.landing_time || displaySnapshot.arrival_time || '' },
        { label: '机型', value: displaySnapshot.aircraft || '' },
      ].filter((item) => item.value);
    }
    if (cardType === 'hotel_arrival_card' || cardType === 'hotel_arrival') {
      const hotel = this.matchDayHotel(card, displaySnapshot, dayCard);
      return [
        { label: '城市', value: displaySnapshot.location_text || this.uniqueJoin([displaySnapshot.city, displaySnapshot.state]) },
        { label: '地址', value: displaySnapshot.address || card.location || (hotel && hotel.address) || '' },
        { label: '入住', value: card.check_in_date || displaySnapshot.check_in_date || (hotel && hotel.check_in_date) || '' },
        { label: '退房', value: card.check_out_date || displaySnapshot.check_out_date || (hotel && hotel.check_out_date) || '' },
        { label: '预计抵达', value: timeSnapshot.arrival_time || card.arrival_estimate || '' },
        { label: '房型', value: card.room_summary || card.room_type || (hotel && (hotel.room_summary || hotel.room_type)) || '' },
        { label: '确认号', value: card.confirmation_no || (hotel && hotel.confirmation_no) || '' },
      ].filter((item) => item.value);
    }
    if (cardType === 'meeting_card' || cardType === 'meeting') {
      return [
        { label: '类型', value: displaySnapshot.entity_type_text || '会面 / 预约' },
        { label: '时间', value: timeSnapshot.start_time || card.time || displaySnapshot.location_text || '待同步' },
      ].filter((item) => item.value);
    }
    return [];
  },

  matchDayHotel(card, displaySnapshot, dayCard = {}) {
    const hotel = dayCard.hotel || null;
    if (!hotel) return null;
    const cardStayId = card.hotel_stay_id || card.stay_id || '';
    if (cardStayId && (hotel.stay_id === cardStayId || hotel.hotel_id === cardStayId)) return hotel;
    const cardName = displaySnapshot.name_zh || displaySnapshot.name_en || card.title || '';
    const hotelName = hotel.name || hotel.hotel_name || hotel.title || '';
    return cardName && hotelName && cardName === hotelName ? hotel : null;
  },

  getStructuredTags(cardType, displaySnapshot) {
    const values = cardType === 'landmark_card' || cardType === 'landmark' || cardType === 'museum_card' || cardType === 'museum'
      ? (displaySnapshot.highlight_tags && displaySnapshot.highlight_tags.length ? displaySnapshot.highlight_tags : displaySnapshot.fit_tags)
      : displaySnapshot.fit_tags;
    return this.normalizeList(values, 5);
  },

  getStructuredSectionLabel(cardType) {
    if (cardType === 'hotel_arrival_card' || cardType === 'hotel_arrival') return '入住信息';
    if (cardType === 'meeting_card' || cardType === 'meeting') return '说明';
    if (cardType === 'flight_card' || cardType === 'flight') return '航班信息';
    return '看点';
  },

  getStructuredTagLabel(cardType) {
    if (cardType === 'museum_card' || cardType === 'museum') return '推荐关注';
    if (cardType === 'meeting_card' || cardType === 'meeting') return '提醒';
    if (cardType === 'hotel_arrival_card' || cardType === 'hotel_arrival') return '住宿标签';
    if (cardType === 'flight_card' || cardType === 'flight') return '航班标签';
    return '适合关注';
  },

  buildTimeItems(cardType, timeSnapshot, displaySnapshot = {}) {
    const isFlight = cardType === 'flight_card' || cardType === 'flight';
    const flightDepartureTime = isFlight ? (displaySnapshot.takeoff_time || displaySnapshot.departure_time || '') : '';
    const appointmentTime = timeSnapshot.appointment_time || timeSnapshot.start_time || flightDepartureTime || '';
    const leaveTime = timeSnapshot.end_time || flightDepartureTime || '';
    return [
      { label: '预计到达', value: timeSnapshot.arrival_time || '待同步' },
      { label: '预约时间', value: appointmentTime || '待同步' },
      { label: '预计离开', value: leaveTime || '待同步' },
    ];
  },

  composeTravelMetaLine(card = {}) {
    const snapshot = card.travel_snapshot || card.travelSnapshot || {};
    return [
      card.drive_time || card.drive_time_text || snapshot.drive_time_text || snapshot.maps_duration_text || '',
      card.distance || card.distance_text || snapshot.distance_text || snapshot.maps_distance_text || '',
      card.traffic_level || card.traffic_text || snapshot.traffic_text || '',
    ].filter(Boolean).join(' · ');
  },

  uniqueJoin(values = []) {
    const seen = {};
    return values
      .map((value) => String(value || '').trim())
      .filter((value) => {
        if (!value || seen[value]) return false;
        seen[value] = true;
        return true;
      })
      .join(' · ');
  },

  findSchoolProfileFallback(card, snapshot = {}) {
    const keys = [
      snapshot.name_en,
      snapshot.name,
      card.name_en,
      card.title,
      card.location,
    ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
    return keys.reduce((match, key) => match || SCHOOL_PROFILE_FALLBACKS[key], null) || {};
  },

  normalizeSchoolTimeSnapshot(card, dayCard = {}) {
    const snapshot = card.time_snapshot || card.timeSnapshot || {};
    const departureTime = this.extractDisplayTime(snapshot.departure_time || dayCard.depart_time || dayCard.serviceWindowText || '');
    const arrivalTime = this.extractDisplayTime(snapshot.arrival_time || card.arrival_estimate || card.planned_arrival_time || '');
    const appointmentTime = this.extractDisplayTime(snapshot.appointment_time || card.appointment_time || card.planned_start_time || '');
    const startTime = this.extractDisplayTime(snapshot.start_time || card.start_time || '');
    const endTime = this.extractDisplayTime(snapshot.end_time || card.end_time || card.planned_end_time || '');
    const hasTime = Boolean(departureTime || arrivalTime || appointmentTime || startTime || endTime);
    const arrivalMinutes = this.toMinutes(arrivalTime);
    const appointmentMinutes = this.toMinutes(appointmentTime);
    const warningText = snapshot.time_warning_text
      || (arrivalMinutes !== null && appointmentMinutes !== null && arrivalMinutes > appointmentMinutes ? '时间待复核' : '');
    return {
      departure_time: departureTime,
      arrival_time: arrivalTime,
      appointment_time: appointmentTime,
      start_time: startTime,
      end_time: endTime,
      time_warning_text: warningText,
      has_time: hasTime,
    };
  },

  extractDisplayTime(value) {
    const text = this.formatDisplayTime(value || '');
    const match = String(text).match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
    return match ? match[0].padStart(5, '0') : text;
  },

  toMinutes(value) {
    const match = String(value || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  },

  appendHotelCard(cards = [], hotel, dayCard = {}) {
    if (!hotel) return cards;
    const hotelName = hotel.name || hotel.hotel_name || hotel.title || '';
    const hasHotelCard = cards.some((card) => {
      const type = card.type || card.item_type || card.card_type || '';
      return type === 'hotel'
        || type === 'hotel_arrival'
        || type === 'hotel_arrival_card'
        || (hotelName && card.title === hotelName);
    });
    if (hasHotelCard) {
      return cards.map((card, index) => ({ ...card, sequence: index + 1 }));
    }
    const arrivalTime = this.formatDisplayTime(hotel.arrival_time || hotel.eta || hotel.planned_arrival_time || '');
    const latitude = Number(hotel.latitude || hotel.lat || hotel.map_latitude || 0);
    const longitude = Number(hotel.longitude || hotel.lng || hotel.map_longitude || 0);
    const hotelCard = {
      card_id: hotel.hotel_id || hotel.id || `hotel-${dayCard.day_no || cards.length + 1}`,
      type: 'hotel',
      typeText: '酒店',
      time: arrivalTime,
      arrival_estimate: arrivalTime,
      title: hotelName || '酒店安排',
      location: hotel.address || hotel.city || '',
      route: '',
      detailLine: [
        hotel.city || '',
        hotel.room_summary || hotel.room_type || '',
        hotel.confirmation_no ? `确认号：${hotel.confirmation_no}` : '',
      ].filter(Boolean).join(' · '),
      note: hotel.customer_note || hotel.customer_visible_note || hotel.note || '',
      next_stop: '',
      latitude,
      longitude,
      map_url: hotel.map_url || '',
      canOpenMap: Boolean((latitude && longitude) || hotel.map_url),
      chipText: `${arrivalTime || ''} 酒店`.trim(),
    };
    return [...cards, hotelCard].map((card, index) => ({ ...card, sequence: index + 1 }));
  },

  buildCardsFromTimeline(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item, index) => ({
      ...item,
      card_id: item.card_id || item.item_id || item.id || `timeline-${index}`,
      type: item.type || item.item_type || (index === 0 ? 'departure' : 'custom'),
      card_type: item.card_type || item.cardType || item.type || item.item_type || '',
      sequence: index + 1,
      time: this.formatDisplayTime(item.time || ''),
      title: item.title || '行程节点',
      location: item.location || '',
      route: item.route || '',
      drive_time: item.drive_time || '',
      distance: item.distance || '',
      traffic_level: item.traffic_level || '',
      note: item.note || item.description || '',
      next_stop: '',
    }));
  },

  formatDisplayTime(value) {
    if (!value && value !== 0) return '';
    return String(value)
      .replace(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/gi, (match, hour, minute, period) => {
        let hour24 = Number(hour);
        const normalizedPeriod = String(period).toUpperCase();
        if (normalizedPeriod === 'PM' && hour24 !== 12) hour24 += 12;
        if (normalizedPeriod === 'AM' && hour24 === 12) hour24 = 0;
        return `${String(hour24).padStart(2, '0')}:${minute}`;
      })
      .replace(/(上午|下午)\s*(1[0-2]|0?[1-9]):([0-5]\d)/g, (match, period, hour, minute) => {
        let hour24 = Number(hour);
        if (period === '下午' && hour24 !== 12) hour24 += 12;
        if (period === '上午' && hour24 === 12) hour24 = 0;
        return `${String(hour24).padStart(2, '0')}:${minute}`;
      });
  },

  shortTitle(title) {
    if (title === 'Renaissance Providence Downtown Hotel') return '酒店';
    if (title === 'Amherst College') return 'Amherst';
    if (title === 'Depart Boston') return '出发';
    return title;
  },

  typeText(type) {
    const map = {
      departure: '出发',
      school_visit: '访校',
      city_tour: '城市行程',
      transfer: '接送',
      meal: '餐饮',
      hotel: '酒店',
      hotel_arrival: '酒店抵达',
      school_visit_card: '访校',
      landmark: '景点',
      landmark_card: '景点',
      museum: '博物馆',
      museum_card: '博物馆',
      meeting: '会面',
      meeting_card: '会面',
      flight_card: '航班',
      hotel_arrival_card: '酒店',
      flight: '航班',
      free_time: '自由时间',
      custom: '行程节点',
    };
    return map[type] || '行程节点';
  },

  onSwiperChange(e) {
    const currentIndex = e.detail.current || 0;
    this.setData({
      currentIndex,
      currentCard: this.data.cards[currentIndex] || null,
    });
  },

  jumpToCard(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    if (index < 0 || index >= this.data.cards.length) return;
    this.setData({
      currentIndex: index,
      currentCard: this.data.cards[index] || null,
    });
  },

  noop() {},

  openCurrentMap(e) {
    const index = Number(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index);
    const card = this.data.cards[index] || this.data.currentCard || {};
    if (!card.canOpenMap) return;
    if ((!card.latitude || !card.longitude) && card.map_url) {
      wx.setClipboardData({
        data: card.map_url,
        success: () => wx.showToast({ title: '地图链接已复制', icon: 'success' }),
      });
      return;
    }
    wx.openLocation({
      latitude: card.latitude,
      longitude: card.longitude,
      name: card.title || card.location || 'Farland 行程地点',
      address: card.location || card.route || '',
      fail: () => {
        wx.showToast({ title: '暂无法打开地图', icon: 'none' });
      },
    });
  },

  backHome() {
    wx.switchTab({
      url: '/pages/customer/home/home',
      fail: () => {
        wx.navigateBack({ delta: 1 });
      },
    });
  },
});
