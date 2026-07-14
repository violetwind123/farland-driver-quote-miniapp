const hotelUi = require('../../../utils/hotel-ui');

function safeString(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function decodeOption(value) {
  const text = safeString(value);
  try {
    return decodeURIComponent(text);
  } catch (error) {
    return text;
  }
}

function uniqueStrings(items, limit) {
  const values = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const value = safeString(item);
    if (value && !values.includes(value) && values.length < limit) values.push(value);
  });
  return values;
}

function normalizeTransportItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      key: safeString(item && item.key) || `transport_${index}`,
      label: safeString(item && item.label),
      className: /^[a-z -]+$/.test(safeString(item && item.className)) ? safeString(item.className) : '',
    }))
    .filter((item) => item.label)
    .slice(0, 4);
}

function normalizeHotel(input = {}) {
  const displayName = safeString(input.displayName || input.name || input.name_en);
  if (!displayName) return null;

  const imageCandidates = [
    ...(Array.isArray(input.galleryImages) ? input.galleryImages : []),
    ...(Array.isArray(input.images) ? input.images : []),
    input.image_url,
    input.image,
  ];
  let galleryImages = uniqueStrings(imageCandidates, 8);
  if (!galleryImages.length) galleryImages = hotelUi.resolveHotelImages(input, 0);

  const amenityLabels = uniqueStrings([
    ...(Array.isArray(input.amenityLabels) ? input.amenityLabels : []),
    ...(Array.isArray(input.amenities) ? input.amenities : []),
    ...(Array.isArray(input.facilities) ? input.facilities : []),
  ], 12);
  const transportInput = {
    ...input,
    drive_time: input.drive_time || input.driveTime,
    transit_risk_level: input.transit_risk_level || input.transitRiskLevel,
    transit_note: input.transit_note || input.transportNote,
  };
  const generatedTransport = hotelUi.buildHotelTransport(transportInput);
  const providedTransportItems = normalizeTransportItems(input.transportItems);
  const transportItems = providedTransportItems.length
    ? providedTransportItems
    : normalizeTransportItems(generatedTransport.items);
  const transportNote = safeString(input.transportNote || input.transit_note || generatedTransport.note);
  const displayAddress = safeString(input.displayAddress || input.full_address)
    || hotelUi.buildFullAddress({ ...input, address: input.address || '' });

  return {
    displayName,
    displayNameEn: safeString(input.displayNameEn || input.name_en) === displayName
      ? ''
      : safeString(input.displayNameEn || input.name_en),
    displayAddress,
    recommendationLabel: safeString(input.recommendationLabel || input.recommendation_label || '顾问推荐'),
    reason: safeString(input.reason),
    transportNote,
    galleryImages,
    galleryCount: galleryImages.length,
    hasGallery: galleryImages.length > 0,
    amenityLabels,
    hasAmenities: amenityLabels.length > 0,
    transportItems,
    hasTransport: transportItems.length > 0,
    hasLocation: Boolean(displayAddress || transportNote),
    schoolName: safeString(input.schoolName || input.school_name_zh || input.school_name),
    schoolSlug: safeString(input.schoolSlug || input.school_slug),
    distance: safeString(input.distance),
    driveTime: safeString(input.driveTime || input.drive_time),
    transitRiskLevel: safeString(input.transitRiskLevel || input.transit_risk_level),
    hotelGroup: safeString(input.hotelGroup || input.group),
    hotelType: safeString(input.hotelType || input.type),
  };
}

function normalizeSearch(search = {}) {
  return {
    check_in_date: safeString(search.check_in_date),
    check_out_date: safeString(search.check_out_date),
    rooms: Math.max(1, Math.min(Number(search.rooms) || 1, 4)),
    guests: Math.max(1, Math.min(Number(search.guests) || 2, 8)),
  };
}

Page({
  data: {
    loading: true,
    error: '',
    hotel: null,
    contextLabel: '',
    imageIndex: 0,
    imageCounter: '',
    recommendationCode: '',
    shareLoading: false,
    shareReady: false,
    sharePath: '',
    shareTitle: '',
    shareImage: '',
  },

  async onLoad(options = {}) {
    if (wx.hideShareMenu) wx.hideShareMenu();
    const recommendationCode = decodeOption(options.recommendation_code || '');
    if (recommendationCode) {
      await this.loadRecommendationInvite(recommendationCode);
      return;
    }
    this.loadSavedHotel();
  },

  loadSavedHotel() {
    const saved = wx.getStorageSync('hotelInfoParams') || {};
    const applied = this.applyHotel(saved.hotel || {}, {
      sourceTitle: saved.sourceTitle,
      shareTitle: saved.shareTitle,
      shareImage: saved.shareImage,
    });
    if (!applied) return;

    this.shareSource = {
      search: normalizeSearch(saved.search || {}),
      display: saved.display || {
        title: safeString(saved.sourceTitle),
        search_meta: safeString(saved.searchMeta),
      },
    };
    const recommendationCode = safeString(saved.recommendationCode);
    if (recommendationCode) {
      this.enableShare(recommendationCode, {
        title: saved.shareTitle,
        image: saved.shareImage,
      });
      return;
    }
    this.prepareShare();
  },

  async loadRecommendationInvite(recommendationCode) {
    this.setData({ loading: true, error: '', recommendationCode });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getHotelRecommendationInvite',
        data: { recommendation_code: recommendationCode },
      });
      if (!result || !result.success) {
        this.setData({
          loading: false,
          error: (result && result.message) || '酒店推荐加载失败',
        });
        return;
      }
      const applied = this.applyHotel(result.hotel || {}, {
        sourceTitle: (result.display && result.display.title) || '',
        shareTitle: result.share_title,
        shareImage: result.share_image,
      });
      if (!applied) return;
      this.shareSource = {
        search: normalizeSearch(result.search || {}),
        display: result.display || {},
      };
      this.enableShare(result.recommendation_code || recommendationCode, {
        title: result.share_title,
        image: result.share_image,
      });
    } catch (error) {
      console.error('[hotel-info] recommendation load failed', error);
      this.setData({ loading: false, error: '酒店推荐加载失败，请联系顾问重新发送' });
    }
  },

  applyHotel(input, options = {}) {
    const hotel = normalizeHotel(input);
    if (!hotel) {
      this.setData({ loading: false, error: '没有找到可展示的酒店信息' });
      return false;
    }
    const sourceTitle = safeString(hotel.schoolName || options.sourceTitle);
    const contextLabel = sourceTitle && sourceTitle !== hotel.displayName ? sourceTitle : '';
    this.setData({
      loading: false,
      error: '',
      hotel,
      contextLabel,
      imageIndex: 0,
      imageCounter: hotel.galleryCount ? `1 / ${hotel.galleryCount}` : '',
      shareTitle: safeString(options.shareTitle),
      shareImage: safeString(options.shareImage || hotel.galleryImages[0]),
    });
    return true;
  },

  buildShareHotelSnapshot() {
    const hotel = this.data.hotel || {};
    return {
      name: safeString(hotel.displayName),
      name_en: safeString(hotel.displayNameEn),
      address: safeString(hotel.displayAddress),
      full_address: safeString(hotel.displayAddress),
      group: safeString(hotel.hotelGroup),
      type: safeString(hotel.hotelType),
      school_slug: safeString(hotel.schoolSlug),
      school_name: safeString(this.data.contextLabel || hotel.schoolName),
      distance: safeString(hotel.distance),
      drive_time: safeString(hotel.driveTime),
      reason: safeString(hotel.reason),
      transit_risk_level: safeString(hotel.transitRiskLevel),
      transit_note: safeString(hotel.transportNote),
      recommendation_label: safeString(hotel.recommendationLabel),
      amenities: Array.isArray(hotel.amenityLabels) ? hotel.amenityLabels.slice(0, 12) : [],
      images: Array.isArray(hotel.galleryImages) ? hotel.galleryImages.slice(0, 8) : [],
      image_url: safeString(hotel.galleryImages && hotel.galleryImages[0]),
    };
  },

  async prepareShare() {
    if (this.data.shareLoading || this.data.shareReady || !this.data.hotel) return;
    this.setData({ shareLoading: true });
    const source = this.shareSource || {};
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createHotelRecommendationInvite',
        data: {
          hotel: this.buildShareHotelSnapshot(),
          school_slug: safeString(this.data.hotel.schoolSlug),
          search: source.search || {},
          display: source.display || {},
          expires_in_days: 30,
        },
      });
      if (!result || !result.success || !result.invite_code) {
        this.setData({ shareLoading: false });
        return;
      }
      this.setData({ shareLoading: false });
      this.enableShare(result.invite_code, {
        title: result.share_title,
        image: result.share_image,
      });
    } catch (error) {
      console.warn('[hotel-info] share preparation unavailable', error);
      this.setData({ shareLoading: false });
    }
  },

  enableShare(recommendationCode, options = {}) {
    const code = safeString(recommendationCode);
    if (!code) return;
    const hotel = this.data.hotel || {};
    const galleryImages = Array.isArray(hotel.galleryImages) ? hotel.galleryImages : [];
    this.setData({
      recommendationCode: code,
      shareReady: true,
      sharePath: `/pages/hotel/info/info?recommendation_code=${encodeURIComponent(code)}`,
      shareTitle: safeString(options.title || this.data.shareTitle || `${hotel.displayName}｜Farland 酒店推荐`),
      shareImage: safeString(options.image || this.data.shareImage || galleryImages[0]),
    });
    if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage'] });
  },

  onShareAppMessage() {
    const hotel = this.data.hotel || {};
    const galleryImages = Array.isArray(hotel.galleryImages) ? hotel.galleryImages : [];
    return {
      title: this.data.shareTitle || `${hotel.displayName || '酒店详情'}｜Farland 酒店推荐`,
      path: safeString(this.data.sharePath || '/pages/hotel/request/request').replace(/^\//, ''),
      imageUrl: this.data.shareImage || galleryImages[0] || '/assets/images/hotel-lobby-01.jpg',
    };
  },

  onGalleryChange(e) {
    const imageIndex = Number(e.detail.current) || 0;
    const count = this.data.hotel ? this.data.hotel.galleryCount : 0;
    this.setData({
      imageIndex,
      imageCounter: count ? `${imageIndex + 1} / ${count}` : '',
    });
  },

  previewGallery() {
    const hotel = this.data.hotel || {};
    const images = hotel.galleryImages || [];
    if (!images.length) return;
    wx.previewImage({
      urls: images,
      current: images[this.data.imageIndex] || images[0],
    });
  },

  copyAddress() {
    const address = safeString(this.data.hotel && this.data.hotel.displayAddress);
    if (!address) return;
    wx.setClipboardData({ data: address });
  },
});
