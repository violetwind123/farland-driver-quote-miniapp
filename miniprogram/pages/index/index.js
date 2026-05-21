Page({
  onLoad(options) {
    const token = options && options.token;
    if (token) {
      wx.redirectTo({
        url: `/pages/driver/quick-quote/quick-quote?token=${token}`,
      });
      return;
    }
    setTimeout(() => {
      wx.switchTab({ url: '/pages/hotel/request/request' });
    }, 2000);
  },

  async routeByAccess() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'checkEntryAccess' });
      if (result && result.role === 'operator' && result.status === 'active') {
        wx.reLaunch({ url: '/pages/operator/dashboard/dashboard' });
        return;
      }
    } catch (error) {
      // Customer entry should still work even if access check fails.
    }
    wx.switchTab({ url: '/pages/hotel/request/request' });
  },
});
