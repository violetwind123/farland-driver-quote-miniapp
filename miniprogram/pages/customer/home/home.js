Page({
  data: {
    loading: true,
    profile: {},
    benefits: [],
    hotelRequests: [],
    transportationAppointments: [],
    todayItinerary: null,
    nextConfirmed: {},
    tripOverview: [],
    hotelCards: [],
    transferRequests: [],
    transportOrders: [],
    charterServices: [],
    topBenefits: [],
    advisorPhone: '',
  },

  onLoad() {
    this.loadHome();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  async loadHome() {
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'getCustomerHome' });
      if (!result || !result.success) {
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      const todayItinerary = result.today_itinerary || null;
      const tripOverview = (result.trip_overview || []).map((item) => ({
        ...item,
        statusText: item.status === 'pending' ? '顾问确认中' : '已确认',
        statusClass: item.status === 'pending' ? 'pending' : 'confirmed',
      }));
      const hotelCards = (result.hotel_requests || []).map((item, index) => ({
        ...item,
        id: item._id || `${item.city || 'hotel'}-${index}`,
        displayName: item.hotel_name || item.city || '酒店需求',
        statusText: item.status === 'confirmed' ? '已确认' : '顾问确认中',
        statusClass: item.status === 'confirmed' ? 'confirmed' : 'pending',
        subline: item.hotel_name
          ? `${item.room_type || '房型待确认'}`
          : 'Farland 顾问正在确认酒店与房型',
      }));
      const transferRequests = (result.transfer_requests || []).map((request) => ({
        ...request,
        quoteCount: (request.quotes || []).length,
        statusClass: request.status === 'quoted' ? 'quoted' : 'pending',
        quotes: (request.quotes || []).map((quote) => ({
          ...quote,
          feeRateText: `${Math.round((quote.farland_service_fee_rate || 0.1) * 100)}%`,
          recommendationText: quote.is_recommended ? '推荐' : '',
          includesText: (quote.includes || []).join(' / '),
          excludesText: (quote.excludes || []).join(' / '),
        })),
      }));
      const transportOrders = (result.transport_orders || []).map((order) => ({
        ...order,
        statusClass: order.order_status === 'assigned' ? 'confirmed' : 'pending',
      }));
      const nextConfirmed = todayItinerary
        ? {
            title: todayItinerary.title,
            date: todayItinerary.date,
            time: todayItinerary.items && todayItinerary.items[0] ? todayItinerary.items[0].time : '',
            city: todayItinerary.city,
          }
        : {
            title: tripOverview[0] ? tripOverview[0].title : '暂无确认行程',
            date: tripOverview[0] ? tripOverview[0].date : '',
            time: '',
            city: tripOverview[0] ? tripOverview[0].city : '',
          };
      this.setData({
        loading: false,
        profile: result.profile || {},
        benefits: result.benefits || [],
        topBenefits: (result.benefits || []).slice(0, 2),
        hotelRequests: result.hotel_requests || [],
        transportationAppointments: result.transportation_appointments || [],
        todayItinerary,
        nextConfirmed,
        tripOverview,
        hotelCards,
        transferRequests,
        transportOrders,
        charterServices: result.charter_services || [],
        advisorPhone: todayItinerary && todayItinerary.farland_contact ? todayItinerary.farland_contact.phone : '',
      });
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  goHotelRequest() {
    wx.switchTab({ url: '/pages/hotel/request/request' });
  },

  goBenefits() {
    wx.navigateTo({ url: '/pages/customer/benefits/benefits' });
  },

  callDriver() {
    const phone = this.data.todayItinerary && this.data.todayItinerary.driver
      ? this.data.todayItinerary.driver.phone
      : '';
    if (!phone) {
      wx.showToast({ title: '暂无司机电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone.replace(/[^\d+]/g, '') });
  },

  contactAdvisor() {
    const phone = this.data.advisorPhone;
    if (!phone) {
      wx.showToast({ title: '暂无顾问电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone.replace(/[^\d+]/g, '') });
  },

  chooseQuote(e) {
    const quoteId = e.currentTarget.dataset.quoteId;
    if (!quoteId) return;
    wx.showToast({ title: '已选择方案，等待 Farland 最终确认', icon: 'none' });
  },

  viewTransferDetail(e) {
    const requestId = e.currentTarget.dataset.requestId;
    if (!requestId) return;
    wx.navigateTo({
      url: `/pages/customer/transfer-detail/transfer-detail?request_id=${requestId}`,
    });
  },
});
