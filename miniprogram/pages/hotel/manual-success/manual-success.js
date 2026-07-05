const hotelUi = require('../../../utils/hotel-ui');

function pad2(n) {
  n = String(n);
  return n.length >= 2 ? n : `0${n}`;
}

function normalizeHotelForSuccess(hotel = {}) {
  const displayName = hotelUi.normalizeLabel(hotel.displayName || hotel.name || hotel.name_en || '酒店');
  const displayNameEn = hotelUi.normalizeLabel(hotel.displayNameEn || hotel.name_en || '');
  const starValue = hotel.star_rate || hotel.star || '';
  const starNumber = Number(String(starValue).replace(/[^0-9.]/g, ''));
  const starLabel = hotelUi.shouldShowStar(starValue) ? `${starNumber || starValue}钻` : '';
  const badges = hotelUi.normalizeBadges([
    starLabel,
    ...(Array.isArray(hotel.displayBadges) ? hotel.displayBadges : []),
    ...(Array.isArray(hotel.tags) ? hotel.tags : []),
    hotel.reason && /official/i.test(hotel.reason) ? '学校官方清单' : '',
  ]);
  const transport = hotelUi.buildHotelTransport(hotel);
  return {
    ...hotel,
    displayName,
    displayNameEn: displayNameEn && displayNameEn !== displayName ? displayNameEn : '',
    displayAddress: hotelUi.buildFullAddress({ ...hotel, address: hotel.displayAddress || hotel.address || '' }),
    displayPhoto: hotelUi.resolveHotelImage(hotel, 0),
    displayBadges: badges,
    hasBadges: badges.length > 0,
    transportItems: transport.items,
    transportNote: transport.note,
    hasTransport: transport.hasTransport,
  };
}

function normalizeRoomForSuccess(room = {}) {
  const displayName = hotelUi.normalizeRoomName(room.displayName || room.room_name || room.name || '可订房型');
  const displayTags = hotelUi.normalizeRoomChips({
    ...room,
    name: room.displayName || room.room_name || room.name || '',
  });
  const cancelPolicy = hotelUi.normalizeLabel(room.cancelPolicy || room.cancel_policy || '');
  const cancelBadge = hotelUi.compactCancelText(room.cancelTag || room.cancel_tag || cancelPolicy);
  return {
    ...room,
    displayName,
    displayTags,
    hasTags: displayTags.length > 0,
    roomSummary: [displayName, ...displayTags.slice(0, 2)].filter(Boolean).join(' · '),
    cancelPolicy,
    cancelBadge,
    hasCancel: Boolean(cancelBadge || cancelPolicy),
  };
}

Page({
  data: {
    order: null,
    hotel: null,
    room: null,
    preview: null,
    contact: null,
    stayText: '',
    searchMeta: '',
    payableText: '',
    submittedTime: '',
  },

  onLoad() {
    const order = wx.getStorageSync('hotelManualOrderResult') || {};
    const hotel = normalizeHotelForSuccess(order.hotel || {});
    const room = normalizeRoomForSuccess(order.room || {});
    // submittedTime is a render-time HH:MM stamp (the order result does not
    // carry a submission timestamp), used only to label the 已提交 progress step.
    const now = new Date();
    const submittedTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    this.setData({
      order,
      hotel,
      room,
      preview: order.preview || null,
      contact: order.contact || null,
      stayText: order.stayText || '',
      searchMeta: order.searchMeta || '',
      payableText: order.payable_text || (order.preview && order.preview.price && order.preview.price.payable_text) || '待确认',
      submittedTime,
    });
  },

  copyOrderNo() {
    const orderNo = this.data.order && this.data.order.order_no;
    if (!orderNo) {
      wx.showToast({ title: '暂无订单号', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: orderNo,
      success: () => wx.showToast({ title: '已复制订单号', icon: 'success' }),
    });
  },

  continueBrowsing() {
    wx.switchTab({
      url: '/pages/hotel/request/request',
      fail: () => wx.reLaunch({ url: '/pages/hotel/request/request' }),
    });
  },

  backToTrips() {
    wx.switchTab({
      url: '/pages/customer/itinerary-tab/itinerary-tab',
      fail: () => wx.reLaunch({ url: '/pages/customer/itinerary-tab/itinerary-tab' }),
    });
  },
});
