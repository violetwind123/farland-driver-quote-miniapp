const hotelUi = require('../../../utils/hotel-ui');

function safeString(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return formatDateValue(date);
}

function isValidDateRange(checkIn, checkOut) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return false;
  return new Date(`${checkOut}T00:00:00`).getTime() > new Date(`${checkIn}T00:00:00`).getTime();
}

function calculateNights(checkIn, checkOut) {
  if (!isValidDateRange(checkIn, checkOut)) return 0;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function isOperatorUser(user) {
  return user && user.status === 'active' && ['operator', 'super_admin'].includes(user.role);
}

Page({
  data: {
    loading: true,
    error: '',
    notice: '',
    hotel: null,
    rooms: [],
    roomCount: 0,
    selectedRoomIndex: -1,
    selectedRoom: null,
    sourceTitle: '',
    searchMeta: '',
    stayText: '',
    detailContext: null,
    todayDate: '',
    checkInDate: '',
    checkOutDate: '',
    nights: 0,
    searchRooms: 1,
    searchGuests: 2,
    roomOptions: ['1间', '2间', '3间', '4间'],
    guestOptions: ['1人', '2人', '3人', '4人', '5人', '6人', '7人', '8人'],
    roomOptionIndex: 0,
    guestOptionIndex: 1,
    hasValidDates: false,
    hasProviderMatch: false,
    livePriceAvailable: false,
    isOperator: false,
    sharedEntry: false,
    recommendationCode: '',
    shareLoading: false,
    shareReady: false,
    sharePath: '',
    shareTitle: '',
    shareImage: '',
    shareStatusText: '正在准备酒店分享',
    advisorQrPath: '/assets/images/advisor-wechat-qr.jpg',
    showAdvisorQr: false,
  },

  onLoad(options = {}) {
    const cachedUser = wx.getStorageSync('farland_user') || {};
    const isOperator = isOperatorUser(cachedUser);
    const recommendationCode = decodeURIComponent(options.recommendation_code || '');
    this.setData({
      todayDate: formatDateValue(new Date()),
      isOperator,
      sharedEntry: Boolean(recommendationCode),
      recommendationCode,
    });
    if (wx.hideShareMenu) wx.hideShareMenu();
    if (recommendationCode) {
      this.loadRecommendationInvite();
      return;
    }
    this.loadDetail();
  },

  onPullDownRefresh() {
    this.loadDetail(() => wx.stopPullDownRefresh(), this.data.detailContext || null);
  },

  async loadRecommendationInvite(done) {
    this.setData({ loading: true, error: '', notice: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getHotelRecommendationInvite',
        data: { recommendation_code: this.data.recommendationCode },
      });
      if (!result || !result.success) {
        this.setData({
          loading: false,
          error: (result && result.message) || '酒店推荐加载失败',
        });
        if (done) done();
        return;
      }
      const hotel = result.hotel || {};
      const search = result.search || {};
      const display = result.display || {};
      const nights = calculateNights(search.check_in_date, search.check_out_date) || display.nights || 0;
      const context = {
        hotel,
        search,
        title: display.title || hotel.school_name || hotel.school_name_zh || hotel.name || '酒店详情',
        subtitle: display.subtitle || '',
        searchMeta: display.search_meta || `${search.rooms || 1}间 · ${search.guests || 2}人`,
        displayCheckIn: display.display_check_in || this.formatShortDate(search.check_in_date),
        displayCheckOut: display.display_check_out || this.formatShortDate(search.check_out_date),
        nights,
      };
      this.setData({
        shareTitle: result.share_title || '',
        shareImage: result.share_image || '',
      });
      await this.loadDetail(done, context);
    } catch (error) {
      console.error('[hotel-detail] recommendation invite load failed', error);
      this.setData({ loading: false, error: '酒店推荐加载失败，请联系顾问重新发送' });
      if (done) done();
    }
  },

  resolveProviderHotelId(hotel = {}) {
    const explicit = hotel.detailHotelId
      || hotel.providerHotelId
      || hotel.provider_hotel_id
      || hotel.elong_hotel_id
      || '';
    if (explicit) return explicit;
    const source = safeString(hotel.source).toLowerCase();
    return source.includes('elong') ? safeString(hotel.hotel_id) : '';
  },

  async loadDetail(done, contextOverride) {
    const saved = contextOverride || this.data.detailContext || wx.getStorageSync('hotelDetailParams') || {};
    const selectedHotel = saved.hotel || {};
    const search = {
      ...(saved.search || {}),
      rooms: Number((saved.search || {}).rooms) || 1,
      guests: Number((saved.search || {}).guests) || 2,
    };
    const hotelId = this.resolveProviderHotelId(selectedHotel);
    const checkInDate = safeString(search.check_in_date);
    const checkOutDate = safeString(search.check_out_date);
    const hasValidDates = isValidDateRange(checkInDate, checkOutDate);
    const nights = calculateNights(checkInDate, checkOutDate);
    const normalizedHotel = this.normalizeHotelDetail(selectedHotel, selectedHotel);
    const sourceTitle = saved.title || selectedHotel.school_name || selectedHotel.school_name_zh || normalizedHotel.displayName || '酒店详情';
    const displayCheckIn = saved.displayCheckIn || this.formatShortDate(checkInDate);
    const displayCheckOut = saved.displayCheckOut || this.formatShortDate(checkOutDate);
    const searchMeta = `${search.rooms}间 · ${search.guests}人${nights ? ` · ${nights}晚` : ''}`;
    const detailContext = {
      ...saved,
      hotel: selectedHotel,
      search,
      title: sourceTitle,
      displayCheckIn,
      displayCheckOut,
      searchMeta,
      nights,
    };

    this.setData({
      loading: Boolean(hotelId && hasValidDates),
      error: normalizedHotel ? '' : '没有找到酒店信息，请返回重新选择',
      notice: '',
      detailContext,
      sourceTitle,
      searchMeta,
      stayText: hasValidDates ? `${displayCheckIn} - ${displayCheckOut}` : '请选择入住和退房日期',
      hotel: normalizedHotel,
      rooms: [],
      roomCount: 0,
      selectedRoomIndex: -1,
      selectedRoom: null,
      checkInDate,
      checkOutDate,
      nights,
      searchRooms: search.rooms,
      searchGuests: search.guests,
      roomOptionIndex: Math.max(0, Math.min(search.rooms - 1, 3)),
      guestOptionIndex: Math.max(0, Math.min(search.guests - 1, 7)),
      hasValidDates,
      hasProviderMatch: Boolean(hotelId),
      livePriceAvailable: false,
    });

    if (this.data.isOperator && normalizedHotel) {
      setTimeout(() => this.prepareShare({ silent: true }), 0);
    }

    if (!normalizedHotel) {
      if (done) done();
      return;
    }
    if (!hotelId) {
      this.setData({
        loading: false,
        notice: '这家酒店的艺龙实时房态仍在接入，可先查看酒店信息并联系顾问确认。',
      });
      if (done) done();
      return;
    }
    if (!hasValidDates) {
      this.setData({ loading: false, notice: '请选择入住和退房日期后查询实时房价。' });
      if (done) done();
      return;
    }

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'searchElongHotels',
        data: {
          mode: 'detail',
          hotel_id: hotelId,
          hotel_name: selectedHotel.provider_hotel_name || selectedHotel.displayName || selectedHotel.name,
          hotel_name_en: selectedHotel.name_en || selectedHotel.displayName || selectedHotel.name,
          farland_hotel_id: selectedHotel.farland_hotel_id || '',
          school_slug: selectedHotel.school_slug || '',
          distance: selectedHotel.distance || '',
          drive_time: selectedHotel.drive_time || '',
          reason: selectedHotel.reason || '',
          address: selectedHotel.address || selectedHotel.displayAddress || '',
          full_address: selectedHotel.full_address || selectedHotel.displayAddress || '',
          hotel_city: selectedHotel.hotel_city || selectedHotel.city || '',
          hotel_state: selectedHotel.hotel_state || selectedHotel.state || '',
          postal_code: selectedHotel.postal_code || selectedHotel.zip || '',
          country: selectedHotel.country || '',
          source_type: selectedHotel.source_type || '',
          price_band: selectedHotel.price_band || '',
          price_text: selectedHotel.price_text || selectedHotel.displayPrice || '',
          check_in_date: checkInDate,
          check_out_date: checkOutDate,
          rooms: search.rooms,
          guests: search.guests,
        },
      });

      if (!result || !result.success) {
        this.setData({
          loading: false,
          notice: (result && result.message) || '实时房型查询失败，可稍后重试或联系顾问。',
        });
        if (done) done();
        return;
      }

      const rooms = this.normalizeRooms(result.rooms || (result.hotel && result.hotel.rooms) || []);
      const hotel = this.normalizeHotelDetail(result.hotel || {}, selectedHotel);
      const nextContext = { ...detailContext, hotel };
      this.setData({
        loading: false,
        detailContext: nextContext,
        hotel,
        rooms,
        roomCount: rooms.length,
        livePriceAvailable: rooms.length > 0,
        notice: rooms.length ? '' : '当前日期暂无可展示房型，可调整日期后重新查询。',
      });
      if (done) done();
    } catch (error) {
      console.error('[hotel-detail] live room query failed', error);
      this.setData({ loading: false, notice: '实时房型查询失败，可稍后重试或联系顾问。' });
      if (done) done();
    }
  },

  normalizeHotelDetail(hotel = {}, fallback = {}) {
    const name = hotel.name || hotel.name_en || fallback.displayName || fallback.name || '';
    if (!name) return null;
    const nameEn = hotel.name_en || fallback.displayNameEn || fallback.name_en || '';
    const address = hotel.address || fallback.displayAddress || fallback.address || '酒店地址待确认';
    const priceText = hotel.live_price_text
      || hotel.price_text
      || fallback.displayPrice
      || fallback.price_text
      || fallback.price_band
      || '价格待确认';
    const priceParts = hotelUi.formatPriceParts(priceText, hotel.currency || fallback.currency || '');
    const displayName = hotelUi.normalizeLabel(name);
    const displayNameEn = hotelUi.normalizeLabel(nameEn);
    const merged = { ...fallback, ...hotel };
    const transport = hotelUi.buildHotelTransport(merged);
    const galleryImages = hotelUi.resolveHotelImages(merged, 0);
    const amenityLabels = [];
    [
      ...(Array.isArray(fallback.amenities) ? fallback.amenities : []),
      ...(Array.isArray(fallback.facilities) ? fallback.facilities : []),
      ...(Array.isArray(hotel.amenities) ? hotel.amenities : []),
      ...(Array.isArray(hotel.facilities) ? hotel.facilities : []),
    ].forEach((item) => {
      const label = hotelUi.normalizeLabel(item);
      if (label && !amenityLabels.includes(label) && amenityLabels.length < 8) amenityLabels.push(label);
    });
    const amenityPreview = amenityLabels.slice(0, 4);
    const infoSummaryParts = [];
    if (galleryImages.length) infoSummaryParts.push(`${galleryImages.length}张图片`);
    if (amenityLabels.length) infoSummaryParts.push(amenityLabels.slice(0, 2).join(' · '));
    if (!infoSummaryParts.length) infoSummaryParts.push('位置与访校交通');
    return {
      ...merged,
      displayName,
      displayNameEn: displayNameEn && displayNameEn !== displayName ? displayNameEn : '',
      displayAddress: hotelUi.buildFullAddress({ ...merged, address }),
      displayPhoto: galleryImages[0],
      galleryImages,
      galleryCount: galleryImages.length,
      displayPrice: priceParts.text || hotelUi.normalizeLabel(priceText),
      priceCurrency: priceParts.currency || 'RMB',
      priceAmount: priceParts.amount || '',
      transportItems: transport.items,
      transportNote: transport.note,
      hasTransport: transport.hasTransport,
      providerHotelId: this.resolveProviderHotelId(merged),
      reason: hotelUi.normalizeLabel(hotel.reason || fallback.reason || ''),
      referencePrice: hotel.reference_price_text || fallback.price_band || fallback.price_text || '',
      amenityLabels,
      hasAmenities: amenityLabels.length > 0,
      amenityPreview,
      hasAmenityPreview: amenityPreview.length > 0,
      infoSummary: infoSummaryParts.join(' · '),
      recommendationLabel: hotelUi.normalizeLabel(hotel.recommendation_label || fallback.recommendation_label || '顾问推荐'),
    };
  },

  normalizeRooms(rooms = []) {
    return rooms.map((room, index) => {
      const priceParts = hotelUi.formatPriceParts(room.price_text || room.displayPrice || room.price, room.currency || '');
      const roomName = hotelUi.normalizeRoomName(room.room_name || room.name || room.displayName || '');
      const cancelText = hotelUi.compactCancelText(room.cancel_policy || room.cancelPolicy || room.cancel_tag || '');
      const displayTags = hotelUi.normalizeRoomChips(room);
      return {
        ...room,
        key: room.rate_plan_id || room.room_id || `${room.name || 'room'}_${index}`,
        displayName: roomName,
        displayPrice: priceParts.text || '价格待确认',
        priceCurrency: priceParts.currency || 'RMB',
        priceAmount: priceParts.amount || '',
        displayTags,
        hasTags: displayTags.length > 0,
        cancelPolicy: hotelUi.normalizeLabel(room.cancel_policy || ''),
        cancelBadge: cancelText || '以酒店确认为准',
        isNonCancelable: cancelText === '不可取消',
      };
    });
  },

  formatShortDate(dateText) {
    const parts = safeString(dateText).split('-');
    if (parts.length !== 3) return '';
    return `${parts[1]}.${parts[2]}`;
  },

  buildCurrentContext(overrides = {}) {
    const current = this.data.detailContext || {};
    const checkInDate = overrides.checkInDate !== undefined ? overrides.checkInDate : this.data.checkInDate;
    const checkOutDate = overrides.checkOutDate !== undefined ? overrides.checkOutDate : this.data.checkOutDate;
    const rooms = overrides.rooms || this.data.searchRooms || 1;
    const guests = overrides.guests || this.data.searchGuests || 2;
    const nights = calculateNights(checkInDate, checkOutDate);
    return {
      ...current,
      hotel: current.hotel || this.data.hotel || {},
      search: {
        ...(current.search || {}),
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        rooms,
        guests,
      },
      displayCheckIn: this.formatShortDate(checkInDate),
      displayCheckOut: this.formatShortDate(checkOutDate),
      searchMeta: `${rooms}间 · ${guests}人${nights ? ` · ${nights}晚` : ''}`,
      nights,
    };
  },

  syncSearchPreview(overrides = {}) {
    const context = this.buildCurrentContext(overrides);
    const search = context.search;
    const hasValidDates = isValidDateRange(search.check_in_date, search.check_out_date);
    this.setData({
      detailContext: context,
      checkInDate: search.check_in_date,
      checkOutDate: search.check_out_date,
      searchRooms: search.rooms,
      searchGuests: search.guests,
      roomOptionIndex: search.rooms - 1,
      guestOptionIndex: search.guests - 1,
      nights: context.nights,
      hasValidDates,
      stayText: hasValidDates ? `${context.displayCheckIn} - ${context.displayCheckOut}` : '请选择入住和退房日期',
      searchMeta: context.searchMeta,
      shareReady: false,
      sharePath: '',
      shareStatusText: '日期已更新，正在刷新分享',
    });
    return context;
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    let checkInDate = this.data.checkInDate;
    let checkOutDate = this.data.checkOutDate;
    if (field === 'check_in_date') {
      checkInDate = value;
      if (!checkOutDate || !isValidDateRange(checkInDate, checkOutDate)) {
        checkOutDate = addDays(checkInDate, 1);
      }
    } else if (field === 'check_out_date') {
      if (checkInDate && !isValidDateRange(checkInDate, value)) {
        wx.showToast({ title: '退房日期需晚于入住日期', icon: 'none' });
        return;
      }
      checkOutDate = value;
    }
    this.syncSearchPreview({ checkInDate, checkOutDate });
  },

  onOccupancyChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = Number(e.detail.value) + 1;
    if (field === 'rooms') {
      const guests = Math.max(this.data.searchGuests, value);
      this.syncSearchPreview({ rooms: value, guests });
      return;
    }
    this.syncSearchPreview({ guests: value });
  },

  refreshLiveRooms() {
    if (!isValidDateRange(this.data.checkInDate, this.data.checkOutDate)) {
      wx.showToast({ title: '请先选择入住和退房日期', icon: 'none' });
      return;
    }
    const context = this.buildCurrentContext();
    wx.setStorageSync('hotelDetailParams', context);
    this.loadDetail(null, context);
  },

  selectRoom(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const room = this.data.rooms[index];
    if (!room) return;
    const context = this.data.detailContext || {};
    wx.setStorageSync('hotelSelectedRoom', {
      hotel: this.data.hotel,
      room,
      search: context.search || {},
      searchMeta: this.data.searchMeta,
      stayText: this.data.stayText,
      displayCheckIn: context.displayCheckIn,
      displayCheckOut: context.displayCheckOut,
      nights: context.nights,
    });
    this.setData({ selectedRoomIndex: index, selectedRoom: room });
  },

  continueBooking() {
    if (!this.data.selectedRoom) {
      wx.showToast({ title: '请先选择房型', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/hotel/order-preview/order-preview' });
  },

  showCancelPolicy(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const room = this.data.rooms[index];
    if (!room) return;
    wx.showModal({
      title: '取消政策',
      content: room.cancelPolicy || room.cancelBadge || '以酒店最终确认为准',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  buildHotelInfoSnapshot() {
    const hotel = this.data.hotel || {};
    const context = this.data.detailContext || {};
    const search = context.search || {};
    const galleryImages = (Array.isArray(hotel.galleryImages) ? hotel.galleryImages : [])
      .map((item) => safeString(item))
      .filter(Boolean)
      .slice(0, 8);
    const amenityLabels = (Array.isArray(hotel.amenityLabels) ? hotel.amenityLabels : [])
      .map((item) => safeString(item))
      .filter(Boolean)
      .slice(0, 12);
    const transportItems = (Array.isArray(hotel.transportItems) ? hotel.transportItems : [])
      .map((item, index) => ({
        key: safeString(item && item.key) || `transport_${index}`,
        label: safeString(item && item.label),
        className: /^[a-z -]+$/.test(safeString(item && item.className)) ? safeString(item.className) : '',
      }))
      .filter((item) => item.label)
      .slice(0, 4);

    return {
      hotel: {
        displayName: safeString(hotel.displayName || hotel.name),
        displayNameEn: safeString(hotel.displayNameEn || hotel.name_en),
        displayAddress: safeString(hotel.displayAddress || hotel.address),
        recommendationLabel: safeString(hotel.recommendationLabel || '顾问推荐'),
        galleryImages,
        galleryCount: galleryImages.length,
        amenityLabels,
        hasAmenities: amenityLabels.length > 0,
        transportItems,
        hasTransport: transportItems.length > 0,
        transportNote: safeString(hotel.transit_note || hotel.transportNote),
        reason: safeString(hotel.reason),
        schoolName: safeString(hotel.school_name_zh || hotel.school_name),
        schoolSlug: safeString(hotel.school_slug),
        distance: safeString(hotel.distance),
        driveTime: safeString(hotel.drive_time),
        transitRiskLevel: safeString(hotel.transit_risk_level),
        hotelGroup: safeString(hotel.group),
        hotelType: safeString(hotel.type),
      },
      sourceTitle: safeString(this.data.sourceTitle || context.title),
      stayText: safeString(this.data.stayText),
      searchMeta: safeString(this.data.searchMeta),
      search: {
        check_in_date: safeString(search.check_in_date),
        check_out_date: safeString(search.check_out_date),
        rooms: Math.max(1, Math.min(Number(search.rooms) || 1, 4)),
        guests: Math.max(1, Math.min(Number(search.guests) || 2, 8)),
      },
      display: {
        title: safeString(this.data.sourceTitle || context.title),
        subtitle: safeString(context.subtitle),
        search_meta: safeString(this.data.searchMeta),
        display_check_in: safeString(context.displayCheckIn),
        display_check_out: safeString(context.displayCheckOut),
        nights: Math.max(0, Math.min(Number(context.nights) || 0, 90)),
      },
      recommendationCode: safeString(this.data.recommendationCode),
      shareTitle: safeString(this.data.shareTitle),
      shareImage: safeString(this.data.shareImage || hotel.displayPhoto),
    };
  },

  openHotelInfo() {
    const snapshot = this.buildHotelInfoSnapshot();
    if (!snapshot.hotel.displayName) {
      wx.showToast({ title: '酒店信息暂不可用', icon: 'none' });
      return;
    }
    wx.setStorageSync('hotelInfoParams', snapshot);
    wx.navigateTo({ url: '/pages/hotel/info/info' });
  },

  buildShareHotelSnapshot() {
    const hotel = this.data.hotel || {};
    return {
      hotel_id: hotel.hotel_id || hotel.farland_hotel_id || '',
      farland_hotel_id: hotel.farland_hotel_id || '',
      provider_hotel_id: hotel.providerHotelId || hotel.provider_hotel_id || hotel.elong_hotel_id || '',
      name: hotel.displayName || hotel.name || '',
      name_en: hotel.displayNameEn || hotel.name_en || '',
      address: hotel.displayAddress || hotel.address || '',
      full_address: hotel.displayAddress || hotel.full_address || hotel.address || '',
      hotel_city: hotel.hotel_city || hotel.city || '',
      hotel_state: hotel.hotel_state || hotel.state || '',
      postal_code: hotel.postal_code || hotel.zip || '',
      country: hotel.country || '',
      group: hotel.group || '',
      type: hotel.type || '',
      school_slug: hotel.school_slug || '',
      school_name: hotel.school_name || '',
      school_name_zh: hotel.school_name_zh || '',
      distance: hotel.distance || '',
      drive_time: hotel.drive_time || '',
      reason: hotel.reason || '',
      source_type: hotel.source_type || '',
      price_band: hotel.price_band || hotel.referencePrice || '',
      verify_note: hotel.verify_note || '',
      transit_risk_level: hotel.transit_risk_level || '',
      transit_note: hotel.transit_note || hotel.transportNote || '',
      recommendation_label: hotel.recommendationLabel || '',
      tags: Array.isArray(hotel.tags) ? hotel.tags : [],
      amenities: Array.isArray(hotel.amenityLabels) ? hotel.amenityLabels : [],
      facilities: [],
      images: Array.isArray(hotel.galleryImages) ? hotel.galleryImages : [],
      image_url: hotel.displayPhoto || '',
    };
  },

  async prepareShare(options = {}) {
    const silent = Boolean(options.silent);
    if (!this.data.isOperator || this.data.shareLoading || this.data.shareReady || !this.data.hotel) return;
    this.setData({ shareLoading: true, shareStatusText: '正在准备酒店分享' });
    const context = this.data.detailContext || {};
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createHotelRecommendationInvite',
        data: {
          hotel: this.buildShareHotelSnapshot(),
          school_slug: (this.data.hotel && this.data.hotel.school_slug) || '',
          search: context.search || {},
          display: {
            title: this.data.sourceTitle,
            subtitle: context.subtitle || '',
            search_meta: this.data.searchMeta,
            display_check_in: context.displayCheckIn || '',
            display_check_out: context.displayCheckOut || '',
            nights: context.nights || 0,
          },
          expires_in_days: 30,
        },
      });
      if (!result || !result.success) {
        this.setData({
          shareLoading: false,
          shareReady: false,
          shareStatusText: (result && result.message) || '分享准备失败，点击重试',
        });
        if (!silent) wx.showToast({ title: (result && result.message) || '分享准备失败', icon: 'none' });
        return;
      }
      this.setData({
        shareLoading: false,
        shareReady: true,
        recommendationCode: result.invite_code || this.data.recommendationCode,
        sharePath: result.share_path || '',
        shareTitle: result.share_title || `${this.data.hotel.displayName}｜Farland 酒店推荐`,
        shareImage: result.share_image || this.data.hotel.displayPhoto || '',
        shareStatusText: '酒店详情已准备，可转发给客户',
      });
      if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage'] });
    } catch (error) {
      console.error('[hotel-detail] prepare recommendation share failed', error);
      this.setData({ shareLoading: false, shareReady: false, shareStatusText: '分享准备失败，点击重试' });
      if (!silent) wx.showToast({ title: '分享准备失败', icon: 'none' });
    }
  },

  onShareAppMessage() {
    const hotel = this.data.hotel || {};
    return {
      title: this.data.shareTitle || `${hotel.displayName || hotel.name || '酒店详情'}｜Farland 酒店推荐`,
      path: safeString(this.data.sharePath || '/pages/hotel/request/request').replace(/^\//, ''),
      imageUrl: this.data.shareImage || hotel.displayPhoto || '/assets/images/hotel-lobby-01.jpg',
    };
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

  noop() {},

  goBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/hotel/request/request' }),
    });
  },
});
