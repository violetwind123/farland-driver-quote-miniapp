const hotelUi = require('../../../utils/hotel-ui');

Page({
  data: {
    loading: true,
    error: '',
    results: [],
    resultCount: 0,
    title: '酒店列表',
    subtitle: '',
    searchMeta: '',
    mode: 'city',
    livePriceStatus: '',
    nights: 1,
    sortKey: 'recommend',
  },

  onLoad() {
    this.loadResults();
  },

  onPullDownRefresh() {
    this.loadResults(() => wx.stopPullDownRefresh());
  },

  async loadResults(done) {
    const saved = wx.getStorageSync('hotelSearchParams') || {};
    const payload = saved.payload || null;
    if (!payload) {
      this.setData({
        loading: false,
        error: '没有找到搜索条件，请返回重新搜索',
      });
      if (done) done();
      return;
    }

    this.setData({
      loading: true,
      error: '',
      mode: payload.mode || 'city',
      title: saved.searchLabel || '酒店列表',
      subtitle: `${saved.displayCheckIn || payload.check_in_date} - ${saved.displayCheckOut || payload.check_out_date}`,
      searchMeta: `${payload.rooms || 1}间 · ${payload.guests || 2}人 · ${saved.nights || 1}晚`,
      nights: Number(saved.nights) || 1,
    });

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'searchElongHotels',
        data: payload,
      });
      if (!result || !result.success) {
        this.setData({
          loading: false,
          error: (result && result.message) || '搜索失败，请稍后再试',
        });
        if (done) done();
        return;
      }

      const title = this.resolveTitle(result, saved);
      const nights = Number(saved.nights) || 1;
      const results = (result.results || []).map((hotel, index) => this.normalizeHotelResult(hotel, index, nights));
      this.setData({
        loading: false,
        results,
        resultCount: results.length,
        title,
        subtitle: `${saved.displayCheckIn || (result.search && result.search.check_in_date) || ''} - ${saved.displayCheckOut || (result.search && result.search.check_out_date) || ''}`,
        livePriceStatus: result.live_price_status || '',
        error: results.length ? '' : '暂未找到可展示的酒店结果',
      });
      if (done) done();
    } catch (error) {
      this.setData({
        loading: false,
        error: '搜索失败，请稍后再试',
      });
      if (done) done();
    }
  },

  resolveTitle(result, saved) {
    if (result.mode === 'campus' && result.school) {
      const school = result.school;
      const place = [school.city, school.state].filter(Boolean).join(', ');
      return `${school.name}${place ? ` · ${place}` : ''}`;
    }
    if (result.city) return result.city.name;
    return saved.searchLabel || '酒店列表';
  },

  buildFacilityTags(hotel = {}) {
    const raw = Array.isArray(hotel.amenities)
      ? hotel.amenities
      : (Array.isArray(hotel.facilities) ? hotel.facilities : []);
    const internal = /(net[_\s-]?rate|cost|supplier|margin|base[_\s-]?rate|provider[_\s-]?cost)/i;
    const tags = [];
    raw.forEach((entry) => {
      if (tags.length >= 4) return;
      const label = hotelUi.normalizeLabel(entry);
      if (!label || internal.test(label)) return;
      const className = /(免费取消|free\s*cancel)/i.test(label) ? 'free-cancel' : '';
      tags.push({ key: `${tags.length}-${label}`, label, className });
    });
    return tags;
  },

  buildMetaLine(hotel = {}, transport, fallback = '') {
    const parts = [];
    const starText = hotelUi.normalizeLabel(hotel.star_text || '');
    if (starText) parts.push(starText);
    (transport.items || []).forEach((item) => {
      if (item && item.label) parts.push(item.label);
    });
    return parts.join(' · ') || fallback;
  },

  normalizeHotelResult(hotel = {}, index = 0, nights = 1) {
    const rooms = Array.isArray(hotel.rooms) ? hotel.rooms.filter((room) => room && room.name).slice(0, 2) : [];
    const source = String(hotel.source || '');
    const hasProviderMatch = Boolean(hotel.elong_hotel_id || hotel.provider_hotel_id || source.indexOf('elong') >= 0);
    const priceText = hotel.live_price_text
      || hotel.price_text
      || hotel.price_band
      || (hotel.low_rate ? `${hotel.currency || ''} ${hotel.low_rate}`.trim() : '');
    const addressParts = [];
    if (hotel.address) addressParts.push(hotel.address);
    else if (hotel.hotel_city || hotel.hotel_state) addressParts.push([hotel.hotel_city, hotel.hotel_state].filter(Boolean).join(', '));
    const fallbackType = [hotel.group, hotel.type].filter(Boolean).join(' · ');
    const farlandBadges = hotelUi.normalizeBadges([
      ...(Array.isArray(hotel.tags) ? hotel.tags : []),
      hotel.source_type,
      hotel.reason && /official/i.test(hotel.reason) ? '学校官方清单' : '',
    ]);
    const priceParts = hotelUi.formatPriceParts(priceText, hotel.currency || '');
    const displayName = hotelUi.normalizeLabel(hotel.name || hotel.name_en || '酒店');
    const displayNameEn = hotelUi.normalizeLabel(hotel.name_en || '');
    const transport = hotelUi.buildHotelTransport(hotel);
    const displayAddress = hotelUi.buildFullAddress({ ...hotel, address: addressParts[0] }) || hotelUi.normalizeLabel(fallbackType || '酒店详情待补充');
    const facilityTags = this.buildFacilityTags(hotel);
    const reviewScoreRaw = hotel.review_score != null ? hotel.review_score : hotel.rating_score;
    const reviewScore = (reviewScoreRaw != null && reviewScoreRaw !== '' && !Number.isNaN(Number(reviewScoreRaw)))
      ? Number(reviewScoreRaw).toFixed(1)
      : '';
    const itineraryNote = hotelUi.normalizeLabel(hotel.itinerary_distance_text || hotel.next_trip_distance_text || '');

    // Defense-in-depth: never let internal cost/supplier tokens ride the spread
    // onto a customer surface, even if the template later changes.
    const item = {
      ...hotel,
      displayName,
      displayNameEn: displayNameEn && displayNameEn !== displayName ? displayNameEn : '',
      displayAddress,
      displayPhoto: hotelUi.resolveHotelImage(hotel, index),
      displayPrice: priceParts.text || '价格待确认',
      priceCurrency: priceParts.currency || 'RMB',
      priceAmount: priceParts.amount || '待确认',
      detailHotelId: hotel.elong_hotel_id || hotel.provider_hotel_id || (source === 'elong' ? hotel.hotel_id : ''),
      canOpenDetail: Boolean(displayName),
      canQueryLive: hasProviderMatch,
      transportItems: transport.items,
      transportNote: transport.note,
      hasTransport: transport.hasTransport,
      displayReason: hotelUi.normalizeLabel(hotel.reason || ''),
      displayTags: farlandBadges,
      rooms,
      hasReason: Boolean(hotel.reason),
      hasTags: farlandBadges.length > 0,
      hasRooms: rooms.length > 0,
      // curated-design derived fields (render only when backend supplies source data)
      isRecommended: Boolean(hotel.is_recommended || hotel.recommended || hotel.advisor_recommended),
      reviewScore,
      reviewLabel: hotelUi.normalizeLabel(hotel.review_label || ''),
      facilityTags,
      hasFacilityTags: facilityTags.length > 0,
      metaLine: this.buildMetaLine(hotel, transport, displayAddress),
      itineraryNote,
      nights: Number(nights) || 1,
    };
    ['net_rate', 'cost', 'supplier', 'margin', 'base_rate', 'provider_cost'].forEach((key) => {
      delete item[key];
    });
    return item;
  },

  onSort(e) {
    const sortKey = e.currentTarget.dataset.sort;
    if (!sortKey || sortKey === this.data.sortKey) return;
    // Display-only for now: backend emits no sortable price/distance fields.
    // Keep chip state in sync; wire real re-sort when the API provides them.
    this.setData({ sortKey });
  },

  openHotelDetail(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const hotel = this.data.results[index];
    if (!hotel || !hotel.canOpenDetail) {
      wx.showToast({ title: '酒店详情暂不可用', icon: 'none' });
      return;
    }
    const saved = wx.getStorageSync('hotelSearchParams') || {};
    wx.setStorageSync('hotelDetailParams', {
      hotel,
      search: saved.payload || {},
      title: this.data.title,
      subtitle: this.data.subtitle,
      searchMeta: this.data.searchMeta,
      displayCheckIn: saved.displayCheckIn,
      displayCheckOut: saved.displayCheckOut,
      nights: saved.nights,
    });
    wx.navigateTo({ url: '/pages/hotel/detail/detail' });
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/hotel/request/request' }),
    });
  },
});
