Page({
  onLoad(options) {
    const token = options && options.token;
    if (token) {
      wx.redirectTo({
        url: `/pages/driver/quick-quote/quick-quote?token=${token}`,
      });
    }
  },

  goOperatorLogin() {
    wx.navigateTo({ url: '/pages/auth/login/login' });
  },
});
