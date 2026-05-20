Page({
  data: {
    logoReady: true,
    submitting: false,
    displayCheckIn: '',
    displayCheckOut: '',
    displayCheckInLabel: '入住',
    displayCheckOutLabel: '离店',
    nights: 1,
    heroSlides: [
      {
        image: '/assets/images/hotel-hero-01.png',
        title: '以居为旅 · 美国访校住宿',
        desc: '精选酒店 · 家庭旅行 · 校园周边',
      },
      {
        image: '/assets/images/hotel-hero-02.png',
        title: 'Farland Hotel Collection',
        desc: '顾问协助预订 · 行程联动 · 尊享礼遇',
      },
      {
        image: '/assets/images/hotel-hero-03.png',
        title: '高端定制住宿安排',
        desc: 'Boston · New York · Bay Area · Los Angeles',
      },
    ],
    benefitItems: [
      {
        title: '酒店礼遇',
        desc: '顾问协助匹配房型与品牌偏好',
        icon: '/assets/icons/benefit-hotel.svg',
      },
      {
        title: '积分福利',
        desc: '会员权益与出行福利联动',
        icon: '/assets/icons/benefit-points.svg',
      },
      {
        title: '访校动线',
        desc: '基于学校与城市安排住宿区域',
        icon: '/assets/icons/benefit-campus.svg',
      },
      {
        title: '专属顾问',
        desc: '人工确认需求并跟进行程',
        icon: '/assets/icons/benefit-advisor.svg',
      },
    ],
    form: {
      city: 'Boston',
      check_in_date: '',
      check_out_date: '',
      rooms: '1',
      guests: '2',
      hotel_level: '',
      budget_range: '',
      location_preference: '',
      special_requests: '',
      customer_name: 'Farland Guest',
      contact: 'Pending advisor follow-up',
    },
  },

  onLoad(options) {
    const token = options && options.token;
    if (token) {
      wx.redirectTo({
        url: `/pages/driver/quick-quote/quick-quote?token=${token}`,
      });
      return;
    }
    this.initDefaultDates();
  },

  onLogoError() {
    this.setData({ logoReady: false });
  },

  onServiceTabTap(e) {
    const type = e.currentTarget.dataset.type;
    if (type !== 'hotel') {
      wx.showToast({ title: '该服务即将开放，请联系 Farland 顾问', icon: 'none' });
    }
  },

  useCurrentLocation() {
    wx.showToast({ title: '定位功能暂未开放，请手动填写城市', icon: 'none' });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value }, () => {
      const { check_in_date, check_out_date } = this.data.form;
      if (check_in_date && check_out_date && !this.isValidDateRange(check_in_date, check_out_date)) {
        wx.showToast({ title: '离店日期需晚于入住日期', icon: 'none' });
        this.setData({ 'form.check_out_date': '' }, () => this.updateDateDisplay());
        return;
      }
      this.updateDateDisplay();
    });
  },

  initDefaultDates() {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);
    this.setData({
      'form.check_in_date': this.formatDateValue(today),
      'form.check_out_date': this.formatDateValue(tomorrow),
    }, () => this.updateDateDisplay());
  },

  updateDateDisplay() {
    const { check_in_date, check_out_date } = this.data.form;
    const displayCheckIn = this.formatShortDate(check_in_date);
    const displayCheckOut = this.formatShortDate(check_out_date);
    const displayCheckInLabel = this.formatDateLabel(check_in_date, '入住');
    const displayCheckOutLabel = this.formatDateLabel(check_out_date, '离店');
    const nights = this.calculateNights(check_in_date, check_out_date);
    this.setData({
      displayCheckIn,
      displayCheckOut,
      displayCheckInLabel,
      displayCheckOutLabel,
      nights,
    });
  },

  formatShortDate(dateText) {
    if (!dateText) return '选择日期';
    const parts = dateText.split('-');
    if (parts.length !== 3) return dateText;
    return `${parts[1]}.${parts[2]}`;
  },

  formatDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  formatDateLabel(dateText, fallback) {
    if (!dateText) return fallback;
    const target = new Date(`${dateText}T00:00:00`);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.round((target.getTime() - todayStart.getTime()) / 86400000);
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '明天';
    return fallback;
  },

  calculateNights(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 1;
    const start = new Date(`${checkIn}T00:00:00`);
    const end = new Date(`${checkOut}T00:00:00`);
    const diff = end.getTime() - start.getTime();
    if (Number.isNaN(diff) || diff <= 0) return 1;
    return Math.max(1, Math.round(diff / 86400000));
  },

  isValidDateRange(checkIn, checkOut) {
    return new Date(`${checkOut}T00:00:00`).getTime() > new Date(`${checkIn}T00:00:00`).getTime();
  },

  async submitRequest() {
    const { form, submitting } = this.data;
    if (submitting) return;
    if (!form.city) {
      wx.showToast({ title: '请填写目的城市', icon: 'none' });
      return;
    }
    if (!form.check_in_date) {
      wx.showToast({ title: '请选择入住日期', icon: 'none' });
      return;
    }
    if (!form.check_out_date) {
      wx.showToast({ title: '请选择离店日期', icon: 'none' });
      return;
    }
    if (!this.isValidDateRange(form.check_in_date, form.check_out_date)) {
      wx.showToast({ title: '离店日期需晚于入住日期', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const payload = {
        ...form,
        customer_name: form.customer_name || 'Farland Guest',
        contact: form.contact || 'Pending advisor follow-up',
      };
      const { result } = await wx.cloud.callFunction({
        name: 'createHotelRequest',
        data: payload,
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '提交失败', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }
      wx.showModal({
        title: '已提交',
        content: '酒店需求已提交，Farland 顾问将尽快联系您。',
        showCancel: false,
        success: () => wx.switchTab({ url: '/pages/customer/home/home' }),
      });
    } catch (error) {
      wx.showToast({ title: '提交失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
