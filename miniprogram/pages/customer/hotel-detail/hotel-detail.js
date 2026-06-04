Page({
  data: {
    hotel: null,
  },

  onLoad() {
    const app = getApp();
    const cached = (app.globalData && app.globalData.customerHotelDetail)
      || wx.getStorageSync('customerHotelDetail')
      || null;
    this.setData({
      hotel: this.normalizeHotel(cached),
    });
  },

  normalizeHotel(hotel) {
    if (!hotel) return null;
    const metaParts = [
      hotel.group || '',
      hotel.brand || '',
      hotel.star_rating ? `${hotel.star_rating}星` : '',
    ].filter(Boolean);
    return {
      name: hotel.name || hotel.hotel_name || '酒店信息',
      metaText: hotel.metaText || metaParts.join(' · '),
      checkInDate: hotel.check_in_date || hotel.checkInDate || '待同步',
      checkOutDate: hotel.check_out_date || hotel.checkOutDate || '待同步',
      arrivalTime: this.formatDisplayTime(hotel.arrival_time || '') || '待同步',
      city: hotel.city || '待同步',
      address: hotel.address || '待同步',
      roomSummary: hotel.roomSummary || hotel.room_summary || hotel.room_type || '待同步',
      confirmationNo: hotel.confirmation_no || hotel.confirmation_number || '待同步',
      statusText: hotel.statusText || hotel.status_text || '已同步',
      note: hotel.note || '完整酒店信息将由 Farland 顾问同步。',
    };
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
});
