Page({
  data: {
    loading: true,
    profile: {},
    benefits: [],
    hotelRequests: [],
    transportationAppointments: [],
    todayItinerary: null,
    tripOverview: [],
    topBenefits: [],
  },

  onLoad() {
    this.loadHome();
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
      this.setData({
        loading: false,
        profile: result.profile || {},
        benefits: result.benefits || [],
        topBenefits: (result.benefits || []).slice(0, 2),
        hotelRequests: result.hotel_requests || [],
        transportationAppointments: result.transportation_appointments || [],
        todayItinerary: result.today_itinerary || null,
        tripOverview: result.trip_overview || [],
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
});
