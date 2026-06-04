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
    const cards = sourceCards.map((item, index) => ({
      ...item,
      time: this.formatDisplayTime(item.time || ''),
      arrival_estimate: this.formatDisplayTime(item.arrival_estimate || ''),
      card_id: item.card_id || `${item.time || 'node'}-${index}`,
      sequence: item.sequence || index + 1,
      typeText: this.typeText(item.type),
      chipText: `${this.formatDisplayTime(item.time || '')} ${this.shortTitle(item.title || '')}`.trim(),
      detailLine: [item.drive_time, item.distance, item.traffic_level].filter(Boolean).join(' · '),
      latitude: Number(item.latitude || item.lat || item.map_latitude || 0),
      longitude: Number(item.longitude || item.lng || item.map_longitude || 0),
      map_url: item.map_url || '',
      canOpenMap: Boolean(
        (Number(item.latitude || item.lat || item.map_latitude || 0) && Number(item.longitude || item.lng || item.map_longitude || 0))
        || item.map_url,
      ),
    }));
    const serviceWindowText = this.formatDisplayTime(
      (card.service_window && card.service_window.label) || card.service_window || card.depart_time || '',
    );
    const hotel = card.hotel
      ? {
          ...card.hotel,
          arrival_time: this.formatDisplayTime(card.hotel.arrival_time || card.hotel.eta || ''),
        }
      : null;
    return {
      ...card,
      destination_cards: cards,
      hotel,
      driver: driverAssigned ? normalizedDriver : null,
      driverPendingText: driverAssigned ? '' : '司机信息将在 Farland 完成确认后同步。',
      serviceTitle: card.service_type === 'transfer' ? '今日接送安排' : '今日包车服务',
      serviceWindowText,
      serviceSubText: [card.party_summary, driverAssigned ? '已分配司机' : '司机信息待同步'].filter(Boolean).join(' · '),
    };
  },

  buildCardsFromTimeline(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item, index) => ({
      card_id: item.id || `timeline-${index}`,
      type: index === 0 ? 'departure' : 'custom',
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

  viewFullTrip() {
    wx.showToast({ title: '完整行程即将开放', icon: 'none' });
  },

  backHome() {
    wx.navigateBack({ delta: 1 });
  },
});
