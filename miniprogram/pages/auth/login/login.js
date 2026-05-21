Page({
  data: {
    loading: false,
    errorMessage: '',
  },

  async login() {
    if (this.data.loading) return;
    this.setData({ loading: true, errorMessage: '' });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'login' });
      if (!result || !result.success) {
        this.setData({ loading: false, errorMessage: (result && result.message) || '登录失败' });
        return;
      }

      const { user } = result;
      wx.setStorageSync('farland_user', user);
      if (['operator', 'super_admin'].includes(user.role) && user.status === 'active') {
        wx.reLaunch({ url: '/pages/operator/dashboard/dashboard' });
        return;
      }
      this.setData({
        loading: false,
        errorMessage: '该入口仅限 Farland 运营使用，请联系管理员开通权限。',
      });
    } catch (error) {
      console.error('login failed', error);
      this.setData({
        loading: false,
        errorMessage: error && error.errMsg ? error.errMsg : '登录失败，请稍后再试',
      });
    }
  },
});
