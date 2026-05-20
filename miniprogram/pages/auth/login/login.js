Page({
  data: {
    loading: false,
    driverOnly: false,
    errorMessage: '',
  },

  onLoad() {
    const cached = wx.getStorageSync('farland_user');
    if (cached && cached.role === 'operator') {
      wx.redirectTo({ url: '/pages/operator/dashboard/dashboard' });
    } else if (cached && cached.role === 'driver') {
      wx.redirectTo({ url: '/pages/driver/home/home' });
    }
  },

  async login() {
    if (this.data.loading) return;
    this.setData({ loading: true, driverOnly: false, errorMessage: '' });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'login' });
      if (!result || !result.success) {
        this.setData({ loading: false, errorMessage: (result && result.message) || '登录失败' });
        return;
      }

      const { user } = result;
      wx.setStorageSync('farland_user', user);
      if (user.role === 'operator') {
        wx.redirectTo({ url: '/pages/operator/dashboard/dashboard' });
        return;
      }
      wx.redirectTo({ url: '/pages/driver/home/home' });
    } catch (error) {
      console.error('login failed', error);
      this.setData({
        loading: false,
        errorMessage: error && error.errMsg ? error.errMsg : '登录失败，请稍后再试',
      });
    }
  },
});
