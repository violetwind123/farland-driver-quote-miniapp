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
    const type = item.type || item.item_type || item.card_type || 'custom';
    const time = this.formatDisplayTime(item.time || '');
    const latitude = Number(item.latitude || item.lat || item.map_latitude || 0);
    const longitude = Number(item.longitude || item.lng || item.map_longitude || 0);
    return {
      ...item,
      type,
      card_type: item.card_type || item.cardType || type,
      time,
      arrival_estimate: this.formatDisplayTime(item.arrival_estimate || item.planned_arrival_time || ''),
      card_id: item.card_id || item.item_id || item.id || `${item.time || 'node'}-${index}`,
      sequence: item.sequence || index + 1,
      typeText: this.typeText(type),
      chipText: `${time || ''} ${this.shortTitle(item.title || '')}`.trim(),
      detailLine: item.legMeta || [item.drive_time, item.distance, item.traffic_level].filter(Boolean).join(' · '),
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
      return this.isSchoolVisitCard(next) ? this.normalizeSchoolVisitCard(next, dayCard) : next;
    });
  },

  isSchoolVisitCard(card) {
    const type = card.card_type || card.type || card.item_type || '';
    return type === 'school_visit' || type === 'campus';
  },

  normalizeSchoolVisitCard(card, dayCard = {}) {
    const displaySnapshot = this.normalizeSchoolDisplaySnapshot(card);
    const timeSnapshot = this.normalizeSchoolTimeSnapshot(card, dayCard);
    return {
      ...card,
      card_type: 'school_visit',
      type: 'school_visit',
      typeText: '访校',
      isSchoolVisitCard: true,
      display_snapshot: displaySnapshot,
      time_snapshot: timeSnapshot,
      title: displaySnapshot.name_en || displaySnapshot.name_zh || card.title || '学校访问',
      chipText: `${timeSnapshot.appointment_time || card.time || ''} ${displaySnapshot.name_en || displaySnapshot.name_zh || card.title || '访校'}`.trim(),
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
    const appointmentTime = this.extractDisplayTime(snapshot.appointment_time || card.appointment_time || card.planned_start_time || card.time || '');
    const hasTime = Boolean(departureTime || arrivalTime || appointmentTime);
    const arrivalMinutes = this.toMinutes(arrivalTime);
    const appointmentMinutes = this.toMinutes(appointmentTime);
    const warningText = snapshot.time_warning_text
      || (arrivalMinutes !== null && appointmentMinutes !== null && arrivalMinutes > appointmentMinutes ? '时间待复核' : '');
    return {
      departure_time: departureTime,
      arrival_time: arrivalTime,
      appointment_time: appointmentTime,
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
      const type = card.type || card.item_type || '';
      return type === 'hotel'
        || type === 'hotel_arrival'
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
