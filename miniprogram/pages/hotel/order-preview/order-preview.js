const hotelUi = require('../../../utils/hotel-ui');

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function makeGuestForms(count) {
  const length = Math.max(1, Number(count || 1));
  return Array.from({ length }, (_, index) => ({
    roomNo: index + 1,
    firstName: '',
    lastName: '',
  }));
}

function parseDateParts(value) {
  const match = safeString(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return {
    year,
    month,
    day,
    time: Date.UTC(year, month - 1, day),
  };
}

function pad2(value) {
  const text = String(value);
  return text.length >= 2 ? text : `0${text}`;
}

Page({
  data: {
    loading: true,
    error: '',
    notice: '',
    hotel: null,
    room: null,
    preview: null,
    dailyPriceLines: [],
    priceLines: [],
    guestForms: makeGuestForms(1),
    contact: {
      name: '',
      mobile: '',
      email: '',
      specialRequests: '',
    },
    stayText: '',
    searchMeta: '',
    search: {},
    canSubmit: false,
    submitting: false,
    barCheckInText: '',
    barCheckOutText: '',
    barNightsText: '',
    barStayText: '',
    barPayableText: '',
    barCancelText: '',
    recapText: '',
    payableCurrency: 'RMB',
    payableAmount: '',
  },

  onLoad() {
    this.loadPreview();
  },

  onPullDownRefresh() {
    this.loadPreview(() => wx.stopPullDownRefresh());
  },

  async loadPreview(done) {
    const selected = wx.getStorageSync('hotelSelectedRoom') || {};
    const hotel = selected.hotel || {};
    const room = selected.room || {};
    const search = selected.search || {};
    const hotelId = hotel.providerHotelId || hotel.elong_hotel_id || hotel.provider_hotel_id || hotel.hotel_id || '';

    if (!hotelId || !room.rate_plan_id || !room.room_type_id) {
      this.setData({
        loading: false,
        error: '缺少可试单的房型信息，请返回重新选择房型',
        hotel: this.mergePreviewHotel(hotel, {}),
        room: this.mergePreviewRoom(room, {}, null),
      });
      if (done) done();
      return;
    }

    this.setData({
      loading: true,
      error: '',
      notice: '',
      hotel: this.mergePreviewHotel(hotel, {}),
      room: this.mergePreviewRoom(room, {}, null),
      dailyPriceLines: [],
      priceLines: [],
      search,
      stayText: selected.stayText || `${search.check_in_date || ''} - ${search.check_out_date || ''}`,
      searchMeta: selected.searchMeta || `${search.rooms || 1}间 · ${search.guests || 2}人`,
      guestForms: makeGuestForms(search.rooms || 1),
      canSubmit: false,
      ...this.buildBarSummary(search, null, room),
    });

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'searchElongHotels',
        data: {
          mode: 'preview',
          hotel_id: hotelId,
          room,
          room_id: room.room_id,
          room_type_id: room.room_type_id,
          rate_plan_id: room.rate_plan_id,
          check_in_date: search.check_in_date,
          check_out_date: search.check_out_date,
          rooms: search.rooms || 1,
          guests: search.guests || 2,
          earliest_arrival_time: `${search.check_in_date} 14:00:00`,
          latest_arrival_time: `${search.check_in_date} 23:59:00`,
        },
      });

      if (!result || !result.success) {
        this.setData({
          loading: false,
          error: (result && result.message) || '该房型当前无法预订，请返回重新选择',
        });
        if (done) done();
        return;
      }

      const preview = result.preview || {};
      const mergedHotel = this.mergePreviewHotel(hotel, preview.hotel || {});
      const mergedRoom = this.mergePreviewRoom(room, preview.rate || {}, preview);
      this.setData({
        loading: false,
        preview,
        hotel: mergedHotel,
        room: mergedRoom,
        notice: preview.price_changed ? '价格已刷新，请以本页应付总额为准。' : '',
        canSubmit: true,
        ...this.buildPriceBreakdown(preview, mergedRoom, search),
        ...this.buildBarSummary(search, preview, mergedRoom),
      });
      if (done) done();
    } catch (error) {
      this.setData({
        loading: false,
        error: '订单预览失败，请稍后重试',
      });
      if (done) done();
    }
  },

  mergePreviewHotel(fallback = {}, hotel = {}) {
    const merged = { ...fallback, ...hotel };
    const starValue = hotel.star_rate || hotel.star || fallback.star_rate || fallback.star || '';
    const starLabel = hotelUi.shouldShowStar(starValue) ? `${Number(safeString(starValue).replace(/[^0-9.]/g, '')) || starValue}钻` : '';
    const displayName = hotelUi.normalizeLabel(hotel.name || fallback.displayName || fallback.name || '酒店');
    const displayNameEn = hotelUi.normalizeLabel(hotel.name_en || fallback.displayNameEn || fallback.name_en || '');
    const displayBadges = hotelUi.normalizeBadges([
      starLabel,
      hotel.brand_type,
      fallback.brand_type,
      ...(Array.isArray(merged.tags) ? merged.tags : []),
    ]);
    const transport = hotelUi.buildHotelTransport(merged);
    return {
      ...fallback,
      ...hotel,
      displayName,
      displayNameEn: displayNameEn && displayNameEn !== displayName ? displayNameEn : '',
      displayAddress: hotelUi.buildFullAddress({ ...fallback, ...hotel, address: hotel.address || fallback.displayAddress || fallback.address || '' }),
      displayPhoto: hotelUi.resolveHotelImage(merged, 0),
      displayBadges,
      hasBadges: displayBadges.length > 0,
      transportItems: transport.items,
      transportNote: transport.note,
      hasTransport: transport.hasTransport,
    };
  },

  mergePreviewRoom(fallback = {}, room = {}, preview = null) {
    const price = preview && preview.price;
    const displayPrice = (price && price.payable_text)
      || room.price_text
      || fallback.displayPrice
      || fallback.price_text
      || '价格待确认';
    const priceParts = hotelUi.formatPriceParts(displayPrice, room.currency || fallback.currency || (price && price.currency) || 'RMB');
    const displayTags = hotelUi.normalizeRoomChips({
      ...fallback,
      ...room,
      name: room.room_name || room.name || fallback.displayName || fallback.name || '',
    });
    const cancelText = this.resolveCancelText({ ...fallback, ...room }, preview || {});
    return {
      ...fallback,
      ...room,
      displayName: hotelUi.normalizeRoomName(room.room_name || room.name || fallback.displayName || fallback.name || '可订房型'),
      displayRateName: hotelUi.normalizeLabel(room.rate_plan_name || fallback.rate_plan_name || ''),
      displayPrice: priceParts.text || hotelUi.normalizeLabel(displayPrice),
      priceCurrency: priceParts.currency || 'RMB',
      priceAmount: priceParts.amount || '待确认',
      displayTags,
      hasTags: displayTags.length > 0,
      roomSummary: [hotelUi.normalizeRoomName(room.room_name || room.name || fallback.displayName || fallback.name || ''), ...displayTags.slice(0, 2)].filter(Boolean).join(' · '),
      cancelPolicy: hotelUi.normalizeLabel(room.cancel_policy || fallback.cancelPolicy || fallback.cancel_policy || ''),
      cancelTag: hotelUi.normalizeLabel(room.cancel_tag || fallback.cancel_tag || cancelText || ''),
      cancelBadge: cancelText,
      isNonCancelable: cancelText === '不可取消',
      instructions: hotelUi.normalizeLabel(room.check_in_instructions || fallback.check_in_instructions || ''),
    };
  },

  formatDateShort(value) {
    const date = parseDateParts(value);
    if (!date) return safeString(value).slice(5, 10) || '每日';
    return `${pad2(date.month)}.${pad2(date.day)}`;
  },

  formatAmount(amount, currency) {
    return hotelUi.formatMoneyText(`${currency || 'RMB'} ${amount}`, currency || 'RMB') || '';
  },

  normalizeDailyPriceLines(preview = {}, room = {}, search = {}) {
    const price = preview.price || {};
    const currency = price.currency || room.currency || 'RMB';
    const roomCount = Math.max(1, Number(search.rooms || price.rooms || 1));
    const nightlyRates = Array.isArray(price.nightly_rates) && price.nightly_rates.length
      ? price.nightly_rates
      : (Array.isArray(room.day_price_list) ? room.day_price_list : []);

    return nightlyRates.map((night, index) => {
      const date = night.date || night.Date || '';
      const rate = Number(night.rate || night.Rate || night.Price || night.price || 0);
      const rooms = Number(night.rooms || roomCount);
      const amount = Number(night.amount || (rate ? rate * rooms : 0));
      const rateText = night.rate_text || this.formatAmount(rate, currency);
      return {
        key: `${date || 'night'}_${index}`,
        label: `${this.formatDateShort(date)} 每日房费`,
        note: rateText ? `${rateText}/间 x ${rooms}间` : `${rooms}间`,
        amount_text: night.amount_text || this.formatAmount(amount, currency) || '待确认',
      };
    }).filter((line) => line.amount_text);
  },

  buildPriceBreakdown(preview = {}, room = {}, search = {}) {
    const price = preview.price || {};
    const currency = price.currency || room.currency || 'RMB';
    const dailyPriceLines = this.normalizeDailyPriceLines(preview, room, search);
    const lines = [];
    const pushLine = (key, label, amount, amountText, note, force) => {
      const numericAmount = Number(amount || 0);
      const text = hotelUi.normalizeLabel(amountText || (numericAmount ? this.formatAmount(numericAmount, currency) : ''));
      if (!force && !numericAmount && !text) return;
      if (!force && !numericAmount && /^(¥|￥|RMB|CNY|USD|\$)?0(?:\.0+)?$/i.test(text.replace(/\s+/g, ''))) return;
      return {
        key,
        label,
        amount_text: text || '待确认',
        note: note || '',
      };
    };

    const roomTotal = Number(price.room_total || room.total_price || room.price || 0);
    const taxesAndFees = Number(price.taxes_and_fees || 0);
    const serviceFee = Number(price.farland_service_fee || 0);
    const roomTotalLine = pushLine('room_total', '房费小计', roomTotal, price.room_total_text || '', '', true);
    if (roomTotalLine) lines.push(roomTotalLine);
    const taxLine = pushLine(
      'taxes_and_fees',
      '税费 / 酒店服务费',
      taxesAndFees,
      taxesAndFees ? '' : '已含在应付总额',
      taxesAndFees ? '' : '供应商未返回单独税费金额',
      true,
    );
    if (taxLine) lines.push(taxLine);
    const serviceLine = pushLine('service_fee', 'Farland 服务费', serviceFee, '', '', false);
    if (serviceLine) lines.push(serviceLine);
    return {
      dailyPriceLines,
      priceLines: lines,
    };
  },

  calculateNights(checkInDate, checkOutDate) {
    const checkIn = parseDateParts(checkInDate);
    const checkOut = parseDateParts(checkOutDate);
    if (!checkIn || !checkOut || checkOut.time <= checkIn.time) return 1;
    return Math.max(1, Math.round((checkOut.time - checkIn.time) / 86400000));
  },

  formatDateForBar(value) {
    const date = parseDateParts(value);
    if (!date) return safeString(value).trim() || '待定';
    return `${pad2(date.month)}.${pad2(date.day)}`;
  },

  compactCancelText(value) {
    return hotelUi.compactCancelText(value);
  },

  resolveCancelText(room = {}, preview = {}) {
    const cancellation = (preview && preview.cancellation) || {};
    return this.compactCancelText(
      cancellation.name
      || cancellation.description
      || room.cancel_tag
      || room.cancelTag
      || room.cancel_policy
      || room.cancelPolicy
    ) || '以酒店确认为准';
  },

  buildBarSummary(search = {}, preview = null, room = {}) {
    const price = preview && preview.price;
    const nights = this.calculateNights(search.check_in_date, search.check_out_date);
    const checkInText = this.formatDateForBar(search.check_in_date);
    const checkOutText = this.formatDateForBar(search.check_out_date);
    const priceText = (price && price.payable_text) || room.price_text || room.displayPrice || '待确认';
    const priceParts = hotelUi.formatPriceParts(priceText, (price && price.currency) || room.currency || 'RMB');
    return {
      barCheckInText: checkInText,
      barCheckOutText: checkOutText,
      barNightsText: `${nights}晚`,
      barStayText: `${checkInText} - ${checkOutText} · ${nights}晚`,
      barPayableText: priceParts.text || priceText,
      barCancelText: this.resolveCancelText(room, preview || {}),
      recapText: `${checkInText} 入住 · ${checkOutText} 离店 · ${nights}晚 · ${search.rooms || 1}间`,
      payableCurrency: priceParts.currency || 'RMB',
      payableAmount: priceParts.amount || priceText,
    };
  },

  onGuestInput(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [`guestForms[${index}].${field}`]: value });
  },

  onContactInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [`contact.${field}`]: value });
  },

  isLatinName(value) {
    const text = safeString(value).trim();
    return /^[A-Za-z][A-Za-z .'-]*$/.test(text);
  },

  validateForms() {
    const badGuest = this.data.guestForms.find((guest) => !this.isLatinName(guest.firstName) || !this.isLatinName(guest.lastName));
    if (badGuest) {
      wx.showToast({ title: '请填写英文/拼音入住人姓名', icon: 'none' });
      return false;
    }
    if (!safeString(this.data.contact.name).trim()) {
      wx.showToast({ title: '请填写联系人姓名', icon: 'none' });
      return false;
    }
    if (!safeString(this.data.contact.mobile).trim()) {
      wx.showToast({ title: '请填写联系人电话', icon: 'none' });
      return false;
    }
    return true;
  },

  clientOrderTokenKey() {
    const previewId = (this.data.preview && this.data.preview.preview_id) || 'nopreview';
    return `hotelManualOrderToken_${previewId}`;
  },

  // token 按 preview 作用域:换了报价(新 preview_id)就换 token,避免超时后复用旧 token 串到别的草稿
  makeClientOrderToken() {
    const key = this.clientOrderTokenKey();
    const existing = wx.getStorageSync(key);
    if (existing) return existing;
    const token = `hotel_manual_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    wx.setStorageSync(key, token);
    return token;
  },

  async submitOrderDraft() {
    if (!this.data.canSubmit || !this.data.preview) {
      wx.showToast({ title: '请先完成订单预览', icon: 'none' });
      return;
    }
    if (!this.validateForms()) return;
    if (this.data.submitting) return;
    const draft = {
      preview: this.data.preview,
      hotel: this.data.hotel,
      room: this.data.room,
      guests: this.data.guestForms,
      contact: this.data.contact,
      stayText: this.data.stayText,
      searchMeta: this.data.searchMeta,
      search: this.data.search,
      saved_at: new Date().toISOString(),
    };
    wx.setStorageSync('hotelOrderDraft', draft);
    this.setData({ submitting: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createManualHotelOrder',
        data: {
          ...draft,
          client_order_token: this.makeClientOrderToken(),
          check_in_date: this.data.search && this.data.search.check_in_date,
          check_out_date: this.data.search && this.data.search.check_out_date,
          rooms: this.data.search && this.data.search.rooms,
          guests_count: this.data.search && this.data.search.guests,
        },
      });
      if (!result || !result.success) {
        this.setData({ submitting: false });
        wx.showToast({ title: (result && result.message) || '订单提交失败', icon: 'none' });
        return;
      }
      wx.setStorageSync('hotelManualOrderResult', {
        ...result,
        hotel: this.data.hotel,
        room: this.data.room,
        preview: this.data.preview,
        contact: this.data.contact,
        stayText: this.data.stayText,
        searchMeta: this.data.searchMeta,
      });
      wx.removeStorageSync(this.clientOrderTokenKey());
      wx.redirectTo({ url: '/pages/hotel/manual-success/manual-success' });
    } catch (error) {
      this.setData({ submitting: false });
      wx.showToast({ title: '订单提交失败，请稍后重试', icon: 'none' });
    }
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.navigateTo({ url: '/pages/hotel/detail/detail' }),
    });
  },
});
