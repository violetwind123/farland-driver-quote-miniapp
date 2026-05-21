Page({
  data: {
    minSplashMs: 1500,
  },

  onLoad(options) {
    this.splashStartedAt = Date.now();
    const token = options && options.token;
    if (token) {
      this.waitThenNavigate(() => {
        wx.redirectTo({
          url: `/pages/driver/quick-quote/quick-quote?token=${token}`,
        });
      });
      return;
    }

    this.routeByAccess();
  },

  onUnload() {
    if (this.splashTimer) {
      clearTimeout(this.splashTimer);
      this.splashTimer = null;
    }
  },

  waitThenNavigate(navigate) {
    const elapsed = Date.now() - (this.splashStartedAt || Date.now());
    const delay = Math.max(this.data.minSplashMs - elapsed, 0);
    this.splashTimer = setTimeout(() => {
      this.splashTimer = null;
      navigate();
    }, delay);
  },

  async routeByAccess() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'checkEntryAccess' });
      if (result && result.status === 'active' && result.home_path) {
        await this.prefetchHomeData(result.home_path);
        this.waitThenNavigate(() => {
          wx.reLaunch({ url: result.home_path });
        });
        return;
      }
    } catch (error) {
      // Customer entry should still work even if access check fails.
    }
    this.waitThenNavigate(() => {
      wx.switchTab({ url: '/pages/hotel/request/request' });
    });
  },

  async prefetchHomeData(homePath) {
    const app = getApp();
    if (!app.globalData) app.globalData = {};
    if (!app.globalData.preload) app.globalData.preload = {};

    try {
      if (homePath === '/pages/operator/dashboard/dashboard') {
        const { result } = await wx.cloud.callFunction({
          name: 'getOperatorRequests',
          data: { mode: 'summary' },
        });
        if (result && result.success) {
          app.globalData.preload.operatorDashboard = {
            summary: result.summary || {},
            cached_at: Date.now(),
          };
        }
      }

      if (homePath === '/pages/driver/home/home') {
        const { result } = await wx.cloud.callFunction({ name: 'getDriverHome' });
        if (result && result.success) {
          app.globalData.preload.driverHome = {
            result,
            cached_at: Date.now(),
          };
        }
      }
    } catch (error) {
      // Preload is best-effort. Target page still performs its own load.
    }
  },
});
