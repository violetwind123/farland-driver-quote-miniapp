const SCHOOL_OPTIONS = require('./school-options');

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function normalizeSearchKey(value) {
  return safeString(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

Page({
  data: {
    logoReady: true,
    submitting: false,
    searched: false,
    searchError: '',
    hotelResults: [],
    resultCity: null,
    resultSchool: null,
    resultKicker: 'HOTEL SEARCH',
    resultSummary: '',
    emptyCopy: '当前首版开放 Boston 和 New York，更多城市会继续接入。',
    serviceType: 'hotel',
    placePlaceholder: 'Boston',
    placeActionText: '我的位置',
    keywordPlaceholder: '搜索位置 / 品牌 / 酒店偏好',
    schoolSuggestions: [],
    showSchoolSuggestions: false,
    displayCheckIn: '',
    displayCheckOut: '',
    displayCheckInLabel: '入住',
    displayCheckOutLabel: '离店',
    nights: 1,
    heroSlides: [
      {
        image: '/assets/images/hotel-lobby-01.jpg',
        title: '以居为旅 · 美国访校住宿',
        desc: '精选酒店 · 家庭旅行 · 校园周边',
      },
      {
        image: '/assets/images/hotel-member-bg.jpg',
        title: 'Farland Hotel Collection',
        desc: '顾问协助预订 · 行程联动 · 尊享礼遇',
      },
      {
        image: '/assets/images/hotel-soft-bg.jpg',
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
    supportedCities: [
      { label: 'Boston', value: 'Boston' },
      { label: 'New York', value: 'New York' },
    ],
    campusSchoolChips: [
      { label: 'Loomis', value: 'The Loomis Chaffee School' },
      { label: 'Andover', value: 'Phillips Academy Andover' },
      { label: 'BU Academy', value: 'Boston University Academy' },
      { label: 'Horace Mann', value: 'Horace Mann School' },
    ],
    form: {
      city: '',
      check_in_date: '',
      check_out_date: '',
      rooms: '1',
      guests: '2',
      hotel_level: '',
      budget_range: '',
      location_preference: '',
      special_requests: '',
      customer_name: '',
      contact: '',
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

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onLogoError() {
    this.setData({ logoReady: false });
  },

  onServiceTabTap(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.serviceType) return;
    this.applyServiceType(type);
  },

  onCityChipTap(e) {
    const city = e.currentTarget.dataset.city;
    if (!city) return;
    this.setData({
      'form.city': city,
      showSchoolSuggestions: false,
      schoolSuggestions: [],
    });
  },

  applyServiceType(type) {
    if (type === 'campus') {
      this.setData({
        serviceType: 'campus',
        placePlaceholder: 'Loomis Chaffee School',
        placeActionText: '选择学校',
        keywordPlaceholder: '品牌 / 酒店偏好（可选）',
        schoolSuggestions: [],
        showSchoolSuggestions: false,
      });
      return;
    }
    this.setData({
      serviceType: 'hotel',
      placePlaceholder: 'Boston',
      placeActionText: '我的位置',
      keywordPlaceholder: '搜索位置 / 品牌 / 酒店偏好',
      schoolSuggestions: [],
      showSchoolSuggestions: false,
    });
  },

  useCurrentLocation() {
    if (this.data.serviceType === 'campus') {
      this.updateSchoolSuggestions(this.data.form.city);
      return;
    }
    const message = '定位功能暂未开放，请手动填写城市';
    wx.showToast({ title: message, icon: 'none' });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [`form.${field}`]: value }, () => {
      if (field === 'city' && this.data.serviceType === 'campus') {
        this.updateSchoolSuggestions(value);
      }
    });
  },

  onPlaceFocus() {
    if (this.data.serviceType === 'campus') {
      this.updateSchoolSuggestions(this.data.form.city);
    }
  },

  updateSchoolSuggestions(query) {
    const key = normalizeSearchKey(query);
    const suggestions = SCHOOL_OPTIONS
      .map((school) => {
        const nameKey = normalizeSearchKey(school.name);
        const zhKey = normalizeSearchKey(school.nameZh);
        const slugKey = normalizeSearchKey(school.slug);
        const placeKey = normalizeSearchKey(`${school.city} ${school.state}`);
        let score = 0;
        if (!key) score = 10;
        else if (nameKey === key || zhKey === key || slugKey === key) score = 1000;
        else if (nameKey.indexOf(key) >= 0 || zhKey.indexOf(key) >= 0 || slugKey.indexOf(key) >= 0) score = 700 + key.length;
        else if (placeKey.indexOf(key) >= 0) score = 300 + key.length;
        return score ? { ...school, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    this.setData({
      schoolSuggestions: suggestions,
      showSchoolSuggestions: suggestions.length > 0,
    });
  },

  onSchoolSuggestionTap(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    this.setData({
      'form.city': name,
      showSchoolSuggestions: false,
      schoolSuggestions: [],
    });
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
      wx.showToast({
        title: this.data.serviceType === 'campus' ? '请填写学校' : '请填写目的城市',
        icon: 'none',
      });
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
    const isCampus = this.data.serviceType === 'campus';
    const payload = {
      mode: isCampus ? 'campus' : 'city',
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      rooms: form.rooms,
      guests: form.guests,
      keyword: form.location_preference,
    };
    if (isCampus) {
      payload.school = form.city;
    } else {
      payload.city = form.city;
    }

    this.setData({ submitting: true, showSchoolSuggestions: false });
    wx.setStorageSync('hotelSearchParams', {
      payload,
      searchLabel: form.city,
      nights: this.data.nights,
      displayCheckIn: this.data.displayCheckIn,
      displayCheckOut: this.data.displayCheckOut,
    });
    wx.navigateTo({
      url: '/pages/hotel/results/results',
      complete: () => this.setData({ submitting: false }),
    });
  },
});
