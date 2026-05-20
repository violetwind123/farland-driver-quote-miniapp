Page({
  onLoad(options) {
    const token = options && options.token;
    if (token) {
      wx.redirectTo({
        url: `/pages/driver/quick-quote/quick-quote?token=${token}`,
      });
    }
  },

  goHotelRequest() {
    wx.navigateTo({ url: '/pages/hotel/request/request' });
  },

  showTransportContact() {
    wx.showModal({
      title: '美国用车预约',
      content: '美国用车服务由 Farland 顾问为您定制安排，请联系顾问确认机场接送、访校包车或跨城转场需求。',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  goCustomerHome() {
    wx.navigateTo({ url: '/pages/customer/home/home' });
  },

  goOperatorLogin() {
    wx.navigateTo({ url: '/pages/auth/login/login' });
  },
});
