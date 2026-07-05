Page({
  data: {
    loading: true,
    error: '',
    waiting: false,
    waitingMessage: '',
    tripId: '',
    inviteCode: '',
    title: 'Farland 手机行程单',
    meta: '',
    cityText: '',
    sheetUrl: '',
    sheetOrderNo: '',
    advisorQrPath: '/assets/images/advisor-wechat-qr.jpg',
    showAdvisorQr: false,
  },

  onLoad(options = {}) {
    const tripId = this.decodeQueryValue(options.trip_id || options.external_trip_id || options.trip_no || '');
    const inviteCode = this.decodeQueryValue(options.invite_code || '');
    this.setData({ tripId, inviteCode });
    this.loadItinerary();
  },

  decodeQueryValue(value) {
    const raw = String(value || '');
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch (error) {
      return raw;
    }
  },

  normalizeItinerarySheet(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const pngUrl = String(x.png_url || '').trim();
    const match = pngUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/);
    if (!match || ['https:', 'cloud:', 'wxfile:'].indexOf(match[1].toLowerCase()) === -1) return null;
    return {
      png_url: pngUrl,
      order_no: x.order_no == null ? '' : String(x.order_no),
      version: x.version || '',
    };
  },

  normalizeTrip(trip = {}) {
    const hero = trip.hero || {};
    const summary = trip.trip_summary || {};
    const customer = trip.customer || {};
    const sheet = this.normalizeItinerarySheet(trip.itinerary_sheet);
    const title = hero.title || trip.title || 'Farland 手机行程单';
    const tripNo = hero.trip_no || trip.trip_no || trip.external_trip_id || this.data.tripId || '';
    const dateRange = hero.date_range || summary.date_range_text || [trip.start_at || trip.date_start || '', trip.end_at || trip.date_end || ''].filter(Boolean).join(' - ');
    return {
      title,
      meta: [tripNo, dateRange, customer.display_name || customer.name || ''].filter(Boolean).join(' · '),
      cityText: hero.city_summary || summary.city_route_text || trip.city || '',
      sheetUrl: sheet ? sheet.png_url : '',
      sheetOrderNo: sheet ? sheet.order_no : '',
    };
  },

  async loadItinerary() {
    if (!this.data.tripId) {
      this.setData({
        loading: false,
        error: '行程链接缺少编号，请联系 Farland 顾问重新发送。',
      });
      return;
    }
    this.setData({ loading: true, error: '', waiting: false, waitingMessage: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getCustomerTripByInvite',
        data: {
          trip_id: this.data.tripId,
          invite_code: this.data.inviteCode,
        },
      });
      if (!result || !result.success) {
        this.setData({
          loading: false,
          error: (result && result.message) || '该行程链接无效或已失效，请联系 Farland 顾问。',
        });
        return;
      }
      if (result.waiting) {
        this.setData({
          loading: false,
          waiting: true,
          waitingMessage: result.message || 'Farland 顾问正在核对行程单，确认后将在这里显示。',
        });
        return;
      }
      const tripView = this.normalizeTrip(result.trip || {});
      this.setData({
        ...tripView,
        loading: false,
        error: '',
        waiting: false,
        waitingMessage: '',
      });
    } catch (error) {
      console.error('[mobile-itinerary] getCustomerTripByInvite failed', error);
      this.setData({
        loading: false,
        error: '行程单加载失败，请稍后重试或联系 Farland 顾问。',
      });
    }
  },

  previewSheet() {
    const url = this.data.sheetUrl;
    if (!url) {
      wx.showToast({ title: '手机行程单生成中', icon: 'none' });
      return;
    }
    wx.previewImage({ urls: [url], current: url });
  },

  contactAdvisor() {
    this.setData({ showAdvisorQr: true });
  },

  closeAdvisorQr() {
    this.setData({ showAdvisorQr: false });
  },

  previewAdvisorQr() {
    wx.previewImage({
      urls: [this.data.advisorQrPath],
      current: this.data.advisorQrPath,
    });
  },

  goHotelRequest() {
    wx.switchTab({ url: '/pages/hotel/request/request' });
  },

  refreshItinerary() {
    this.loadItinerary();
  },

  noop() {},

  onShareAppMessage() {
    const path = `/pages/customer/mobile-itinerary/mobile-itinerary?trip_id=${encodeURIComponent(this.data.tripId || '')}&invite_code=${encodeURIComponent(this.data.inviteCode || '')}`;
    return {
      title: `${this.data.title || 'Farland 手机行程单'}`,
      path,
    };
  },
});
