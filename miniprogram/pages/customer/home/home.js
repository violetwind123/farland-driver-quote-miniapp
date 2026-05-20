Page({
  data: {
    loading: true,
    profile: null,
    benefits: [],
    hotelRequests: [],
    transportationAppointments: [],
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
        profile: result.profile || null,
        benefits: result.benefits || [],
        hotelRequests: result.hotel_requests || [],
        transportationAppointments: result.transportation_appointments || [],
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
