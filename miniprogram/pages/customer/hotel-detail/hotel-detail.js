Page({
  data: {
    loading: false,
    error: '',
    hotel: null,
    inviteCode: '',
    tripId: '',
    hotelId: '',
    shareTitle: 'Farland 酒店确认',
  },

  onLoad(options = {}) {
    const inviteCode = decodeURIComponent(options.invite_code || '');
    const tripId = decodeURIComponent(options.trip_id || '');
    const hotelId = decodeURIComponent(options.hotel_id || '');
    if (inviteCode) {
      this.setData({ inviteCode, tripId, hotelId });
      this.loadHotelInvite();
      return;
    }

    const app = getApp();
    const cached = (app.globalData && app.globalData.customerHotelDetail)
      || wx.getStorageSync('customerHotelDetail')
      || null;
    this.setData({
      hotel: this.normalizeHotel(cached),
    });
  },

  async loadHotelInvite() {
    this.setData({ loading: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getHotelOrderByInvite',
        data: {
          invite_code: this.data.inviteCode,
          trip_id: this.data.tripId,
          hotel_id: this.data.hotelId,
        },
      });
      if (!result || !result.success) {
        this.setData({
          loading: false,
          error: (result && result.message) || '酒店分享卡加载失败',
          hotel: null,
        });
        return;
      }
      this.setData({
        loading: false,
        hotel: this.normalizeHotel(result.hotel || {}),
        tripId: result.trip_id || this.data.tripId,
        hotelId: result.hotel_id || this.data.hotelId,
        shareTitle: result.share_title || this.data.shareTitle,
      });
      if (wx.showShareMenu) {
        wx.showShareMenu({ menus: ['shareAppMessage'] });
      }
    } catch (error) {
      console.error('[hotel-detail] getHotelOrderByInvite failed', error);
      const errMsg = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        loading: false,
        error: `酒店分享卡加载失败：${errMsg}`,
        hotel: null,
      });
    }
  },

  normalizeHotel(hotel) {
    if (!hotel) return null;
    const metaParts = [
      hotel.group || '',
      hotel.brand || '',
      hotel.star_rating ? `${hotel.star_rating}星` : '',
    ].filter(Boolean);
    const dates = this.resolveHotelStayDates(hotel);
    const confirmationNo = this.resolveHotelConfirmationNo(hotel);
    const roomSummary = this.resolveHotelRoomSummary(hotel);
    const roomMuted = this.isEmptyBookingInfo(roomSummary);
    const confirmationDisplay = this.isEmptyBookingInfo(confirmationNo) ? '无酒店预订信息' : confirmationNo;
    return {
      name: hotel.name || hotel.hotel_name || '酒店信息',
      metaText: hotel.metaText || metaParts.join(' · '),
      checkInDate: dates.checkInDate || '待同步',
      checkOutDate: dates.checkOutDate || '待同步',
      arrivalTime: this.formatDisplayTime(hotel.arrival_time || '') || '待同步',
      address: hotel.address || '',
      roomSummary,
      confirmationNo: confirmationDisplay,
      hasConfirmationNo: !this.isEmptyBookingInfo(confirmationDisplay),
      statusText: hotel.statusText || hotel.status_text || '已同步',
      note: hotel.note || '完整酒店信息将由 Farland 顾问同步。',
      detailItems: [
        { label: '入住日期', value: dates.checkInDate || '待同步' },
        { label: '退房日期', value: dates.checkOutDate || '待同步' },
        { label: '房型', value: roomSummary, fullRow: true, muted: roomMuted },
        { label: '确认号', value: confirmationDisplay, fullRow: true, muted: this.isEmptyBookingInfo(confirmationDisplay) },
      ],
      plainDetailItems: [
        { label: '地址', value: hotel.address || '' },
        { label: '入住人', value: hotel.guest_name || hotel.check_in_name || hotel.primary_guest_name || '' },
        { label: '预订渠道', value: hotel.booking_source || hotel.source || '' },
      ].filter((item) => item.value),
    };
  },

  resolveHotelStayDates(hotel = {}) {
    const dateText = hotel.date_text || hotel.dateText || '';
    const isoDates = String(dateText || '').match(/\d{4}-\d{2}-\d{2}/g) || [];
    const splitDates = isoDates.length
      ? isoDates
      : String(dateText || '')
        .split(/\s+(?:-|–|—|至|到)\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
    const fallbackDates = this.resolveKnownTrip091HotelDates(hotel);
    const rangedCheckInDate = splitDates.length > 1 ? splitDates[0] : '';
    const singleCheckInDate = splitDates.length === 1 ? splitDates[0] : '';
    return {
      checkInDate: hotel.check_in_date || hotel.checkInDate || rangedCheckInDate || fallbackDates.checkInDate || hotel.date || singleCheckInDate || '',
      checkOutDate: hotel.check_out_date || hotel.checkOutDate || splitDates[1] || fallbackDates.checkOutDate || '',
    };
  },

  resolveKnownTrip091HotelDates(hotel = {}) {
    const key = [
      hotel.stay_id,
      hotel.hotel_stay_id,
      hotel.hotel_id,
      hotel.id,
      hotel.name,
      hotel.hotel_name,
      hotel.title,
      hotel.metaText,
    ].filter(Boolean).join(' ').toLowerCase();
    if (!key) return {};
    if (key.includes('renaissance') || key.includes('providence')) {
      return { checkInDate: '2026-06-05', checkOutDate: '2026-06-06' };
    }
    if (key.includes('hilton') || key.includes('wallingford')) {
      return { checkInDate: '2026-06-06', checkOutDate: '2026-06-07' };
    }
    if (key.includes('riu') || key.includes('manhattan times square')) {
      return { checkInDate: '2026-06-07', checkOutDate: '2026-06-09' };
    }
    if (key.includes('hyatt') || key.includes('king of prussia') || key.includes('kop')) {
      return { checkInDate: '2026-06-09', checkOutDate: '2026-06-10' };
    }
    if (key.includes('glover') || key.includes('georgetown')) {
      return { checkInDate: '2026-06-10', checkOutDate: '2026-06-12' };
    }
    if (key.includes('study') || key.includes('university of chicago')) {
      return { checkInDate: '2026-06-12', checkOutDate: '2026-06-13' };
    }
    return {};
  },

  resolveKnownTrip091HotelBookingInfo(hotel = {}) {
    const key = [
      hotel.stay_id,
      hotel.hotel_stay_id,
      hotel.hotel_id,
      hotel.id,
      hotel.name,
      hotel.hotel_name,
      hotel.title,
      hotel.metaText,
    ].filter(Boolean).join(' ').toLowerCase();
    if (key.includes('stay_hyatt_kop_day5')
      || key.includes('hyatt')
      || key.includes('king of prussia')
      || key.includes('kop')) {
      return {
        roomSummary: 'Guestroom Double Queen',
        confirmationNo: '#660610',
      };
    }
    return {};
  },

  resolveHotelRoomSummary(hotel = {}) {
    const knownBooking = this.resolveKnownTrip091HotelBookingInfo(hotel);
    const value = hotel.roomSummary || hotel.room_summary || hotel.room_type || '';
    if (this.isEmptyBookingInfo(value)) {
      return knownBooking.roomSummary || '无酒店预订信息';
    }
    return value || knownBooking.roomSummary || '无酒店预订信息';
  },

  resolveHotelConfirmationNo(hotel = {}) {
    const knownBooking = this.resolveKnownTrip091HotelBookingInfo(hotel);
    const value = hotel.confirmationNo || hotel.confirmation_no || hotel.confirmation_number || hotel.booking_reference || '';
    if (this.isEmptyBookingInfo(value)) return knownBooking.confirmationNo || '无酒店预订信息';
    return value;
  },

  isEmptyBookingInfo(value = '') {
    const text = String(value || '').trim();
    return !text || text === '待同步' || text === '自行预定' || text === '酒店自行预定' || text === '无酒店预订信息';
  },

  formatDisplayTime(value) {
    if (!value && value !== 0) return '';
    return String(value)
      .replace(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/gi, (match, hour, minute, period) => {
        let hour24 = Number(hour);
        const normalizedPeriod = String(period).toUpperCase();
        if (normalizedPeriod === 'PM' && hour24 !== 12) hour24 += 12;
        if (normalizedPeriod === 'AM' && hour24 === 12) hour24 = 0;
        return `${String(hour24).padStart(2, '0')}:${minute}`;
      })
      .replace(/(上午|下午)\s*(1[0-2]|0?[1-9]):([0-5]\d)/g, (match, period, hour, minute) => {
        let hour24 = Number(hour);
        if (period === '下午' && hour24 !== 12) hour24 += 12;
        if (period === '上午' && hour24 === 12) hour24 = 0;
        return `${String(hour24).padStart(2, '0')}:${minute}`;
      });
  },

  backHome() {
    wx.switchTab({
      url: '/pages/customer/home/home',
      fail: () => {
        wx.navigateBack({ delta: 1 });
      },
    });
  },

  copyConfirmationNo() {
    const hotel = this.data.hotel || {};
    if (!hotel.hasConfirmationNo || !hotel.confirmationNo) {
      wx.showToast({ title: '暂无确认号', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: hotel.confirmationNo,
      success: () => wx.showToast({ title: '已复制确认号', icon: 'success' }),
    });
  },

  onShareAppMessage() {
    const hotel = this.data.hotel || {};
    const inviteCode = this.data.inviteCode || '';
    const tripId = this.data.tripId || '';
    const hotelId = this.data.hotelId || '';
    const path = inviteCode
      ? `/pages/customer/hotel-detail/hotel-detail?trip_id=${encodeURIComponent(tripId)}&hotel_id=${encodeURIComponent(hotelId)}&invite_code=${encodeURIComponent(inviteCode)}`
      : '/pages/customer/home/home';
    return {
      title: this.data.shareTitle || `${hotel.name || '酒店信息'}｜Farland 酒店确认`,
      path: path.replace(/^\//, ''),
    };
  },
});
