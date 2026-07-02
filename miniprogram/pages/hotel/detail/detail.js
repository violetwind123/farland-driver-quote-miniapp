const hotelUi = require('../../../utils/hotel-ui');

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
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
  },

  onLoad() {
    this.loadDetail();
  },

  onPullDownRefresh() {
    this.loadDetail(() => wx.stopPullDownRefresh());
  },

  async loadDetail(done) {
    const saved = wx.getStorageSync('hotelDetailParams') || {};
    const selectedHotel = saved.hotel || {};
    const search = saved.search || {};
    const hotelId = selectedHotel.detailHotelId
      || selectedHotel.elong_hotel_id
      || selectedHotel.provider_hotel_id
      || '';

    this.setData({
      loading: true,
      error: '',
      notice: '',
      detailContext: saved,
      sourceTitle: saved.title || selectedHotel.displayName || '酒店详情',
      searchMeta: saved.searchMeta || `${search.rooms || 1}间 · ${search.guests || 2}人`,
      stayText: `${saved.displayCheckIn || search.check_in_date || ''} - ${saved.displayCheckOut || search.check_out_date || ''}`,
      hotel: this.normalizeHotelDetail(selectedHotel, selectedHotel),
      rooms: this.normalizeRooms(selectedHotel.rooms || []),
      roomCount: (selectedHotel.rooms || []).length,
      selectedRoomIndex: -1,
      selectedRoom: null,
    });

    if (!hotelId) {
      this.setData({
        loading: false,
        error: '这家酒店暂未匹配实时房态，无法查询实时房型',
      });
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
          check_in_date: search.check_in_date,
          check_out_date: search.check_out_date,
          rooms: search.rooms || 1,
          guests: search.guests || 2,
        },
      });

      if (!result || !result.success) {
        this.setData({
          loading: false,
          notice: (result && result.message) || '实时房型查询失败，已展示列表页缓存结果',
        });
        if (done) done();
        return;
      }

      const rooms = this.normalizeRooms(result.rooms || (result.hotel && result.hotel.rooms) || []);
      this.setData({
        loading: false,
        hotel: this.normalizeHotelDetail(result.hotel || {}, selectedHotel),
        rooms,
        roomCount: rooms.length,
        notice: rooms.length ? '' : '供应商已返回酒店详情，但当前条件暂无可展示房型',
      });
      if (done) done();
    } catch (error) {
      this.setData({
        loading: false,
        notice: '实时房型查询失败，已展示列表页缓存结果',
      });
      if (done) done();
    }
  },

  normalizeHotelDetail(hotel = {}, fallback = {}) {
    const name = hotel.name || hotel.name_en || fallback.displayName || fallback.name || '酒店';
    const nameEn = hotel.name_en || fallback.displayNameEn || fallback.name_en || '';
    const address = hotel.address || fallback.displayAddress || fallback.address || '酒店地址待确认';
    const priceText = hotel.price_text
      || hotel.live_price_text
      || fallback.displayPrice
      || fallback.price_text
      || fallback.price_band
      || '价格待确认';
    const meta = [
      hotelUi.shouldShowStar(hotel.star_rate) ? `${hotel.star_rate}星` : '',
      hotel.distance || fallback.distance ? `距学校 ${hotel.distance || fallback.distance}` : '',
      hotel.drive_time || fallback.drive_time ? `车程 ${hotel.drive_time || fallback.drive_time}` : '',
    ].filter(Boolean).join(' · ');
    const priceParts = hotelUi.formatPriceParts(priceText, hotel.currency || fallback.currency || 'RMB');
    const displayName = hotelUi.normalizeLabel(name);
    const displayNameEn = hotelUi.normalizeLabel(nameEn);
    const transport = hotelUi.buildHotelTransport({ ...fallback, ...hotel });
    return {
      ...fallback,
      ...hotel,
      displayName,
      displayNameEn: displayNameEn && displayNameEn !== displayName ? displayNameEn : '',
      displayAddress: hotelUi.buildFullAddress({ ...fallback, ...hotel, address }),
      displayPhoto: hotelUi.resolveHotelImage({ ...fallback, ...hotel }, 0),
      displayPrice: priceParts.text || hotelUi.normalizeLabel(priceText),
      priceCurrency: priceParts.currency || 'RMB',
      priceAmount: priceParts.amount || '',
      meta,
      transportItems: transport.items,
      transportNote: transport.note,
      hasTransport: transport.hasTransport,
      providerHotelId: hotel.elong_hotel_id || hotel.provider_hotel_id || hotel.hotel_id || fallback.detailHotelId || fallback.elong_hotel_id || '',
      reason: hotelUi.normalizeLabel(hotel.reason || fallback.reason || ''),
      referencePrice: hotel.reference_price_text || fallback.price_band || fallback.price_text || '',
    };
  },

  normalizeRooms(rooms = []) {
    return rooms.map((room, index) => {
      const priceParts = hotelUi.formatPriceParts(room.price_text || room.displayPrice || room.price, room.currency || 'RMB');
      const roomName = hotelUi.normalizeRoomName(room.room_name || room.name || room.displayName || '');
      const cancelText = hotelUi.compactCancelText(room.cancel_policy || room.cancelPolicy || room.cancel_tag || '');
      return {
        ...room,
        key: room.rate_plan_id || room.room_id || `${room.name || 'room'}_${index}`,
        displayName: roomName,
        displayPrice: priceParts.text || '价格待确认',
        priceCurrency: priceParts.currency || 'RMB',
        priceAmount: priceParts.amount || '',
        displayTags: hotelUi.normalizeRoomChips(room),
        hasTags: hotelUi.normalizeRoomChips(room).length > 0,
        cancelPolicy: hotelUi.normalizeLabel(room.cancel_policy || ''),
        cancelBadge: cancelText || '以酒店确认为准',
        isNonCancelable: cancelText === '不可取消',
      };
    });
  },

  selectRoom(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const room = this.data.rooms[index];
    if (!room) return;
    wx.setStorageSync('hotelSelectedRoom', {
      hotel: this.data.hotel,
      room,
      search: (this.data.detailContext && this.data.detailContext.search) || {},
      searchMeta: this.data.searchMeta,
      stayText: this.data.stayText,
      displayCheckIn: this.data.detailContext && this.data.detailContext.displayCheckIn,
      displayCheckOut: this.data.detailContext && this.data.detailContext.displayCheckOut,
      nights: this.data.detailContext && this.data.detailContext.nights,
    });
    this.setData({
      selectedRoomIndex: index,
      selectedRoom: room,
    });
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

  goBack() {
    wx.navigateBack({
      fail: () => wx.navigateTo({ url: '/pages/hotel/results/results' }),
    });
  },
});
