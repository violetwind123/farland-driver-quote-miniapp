Page({
  data: {
    todayCard: null,
    cards: [],
    currentIndex: 0,
  },

  onLoad() {
    const app = getApp();
    const card = (app.globalData && app.globalData.todayCardDetail) || wx.getStorageSync('todayCardDetail') || null;
    if (!card) {
      this.setData({ todayCard: null, cards: [] });
      return;
    }
    const normalized = this.normalizeTodayCard(card);
    this.setData({
      todayCard: normalized,
      cards: normalized.destination_cards,
      currentIndex: 0,
    });
  },

  normalizeTodayCard(card) {
    const driverAssigned = card.driver_visibility === 'assigned' && card.driver;
    const cards = (card.destination_cards || []).map((item, index) => ({
      ...item,
      card_id: item.card_id || `${item.time || 'node'}-${index}`,
      sequence: item.sequence || index + 1,
      typeText: this.typeText(item.type),
      chipText: `${item.time || ''} ${this.shortTitle(item.title || '')}`.trim(),
      detailLine: [item.drive_time, item.distance, item.traffic_level].filter(Boolean).join(' · '),
      primaryAction: item.type === 'hotel_arrival' ? '查看酒店信息' : '联系顾问',
    }));
    return {
      ...card,
      destination_cards: cards,
      driver: driverAssigned ? card.driver : null,
      driverPendingText: driverAssigned ? '' : '司机信息将在 Farland 完成确认后同步。',
      serviceTitle: card.service_type === 'transfer' ? '今日接送安排' : '今日包车服务',
      serviceWindowText: (card.service_window && card.service_window.label) || card.service_window || card.depart_time || '',
    };
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
    this.setData({ currentIndex: e.detail.current || 0 });
  },

  jumpToCard(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    this.setData({ currentIndex: index });
  },

  contactAdvisor() {
    const advisor = this.data.todayCard && this.data.todayCard.advisor;
    const phone = advisor && advisor.phone;
    if (!phone) {
      wx.showToast({ title: '请联系 Farland 顾问', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone.replace(/[^\d+]/g, '') });
  },

  viewFullTrip() {
    wx.showToast({ title: '完整行程即将开放', icon: 'none' });
  },

  backHome() {
    wx.navigateBack({ delta: 1 });
  },
});
