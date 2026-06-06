const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'unpublished', label: '未发布' },
  { key: 'needs_review', label: '待复核' },
  { key: 'published', label: '已发布' },
];

const REVIEW_STATUS_TEXT = {
  pending_review: '待复核',
  needs_review: '需要复核',
  approved: '已审核',
  rejected: '已退回',
};

const VISIBILITY_STATUS_TEXT = {
  hidden: '未发布',
  draft: '草稿',
  published: '已发布',
  discarded: '已废弃',
};

function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function formatDateTime(value) {
  const text = safeString(value);
  if (!text) return '';
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:T|\s)(\d{2}:\d{2})/);
  if (match) return `${match[1]} ${match[2]}`;
  return text.replace('T', ' ').slice(0, 16);
}

function getReviewStatusText(status) {
  return REVIEW_STATUS_TEXT[status] || status || '待复核';
}

function getVisibilityStatusText(status) {
  return VISIBILITY_STATUS_TEXT[status] || status || '未发布';
}

function getTripStateHint(trip) {
  if (trip.visibility_status === 'published') return `客户可查看 v${trip.published_version || 1}`;
  if (trip.review_status === 'needs_review') return '客户仍看到上一版发布内容';
  return '客户暂时看不到正式行程';
}

Page({
  data: {
    loading: true,
    refreshing: false,
    keyword: '',
    statusFilter: 'all',
    statusFilters: STATUS_FILTERS,
    trips: [],
    emptyText: '暂无行程',
    error: '',
  },

  onLoad(options = {}) {
    const statusFilter = STATUS_FILTERS.some((item) => item.key === options.status_filter)
      ? options.status_filter
      : 'all';
    this.setData({
      statusFilter,
      keyword: safeString(options.keyword || ''),
    }, () => this.loadTrips());
  },

  onPullDownRefresh() {
    this.loadTrips({ silent: true }).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onSearchConfirm() {
    this.loadTrips();
  },

  clearKeyword() {
    this.setData({ keyword: '' }, () => this.loadTrips());
  },

  changeStatusFilter(e) {
    const key = e.currentTarget.dataset.key || 'all';
    if (key === this.data.statusFilter) return;
    this.setData({ statusFilter: key }, () => this.loadTrips());
  },

  async loadTrips(options = {}) {
    const silent = Boolean(options.silent);
    if (!silent) {
      this.setData({ loading: true, error: '' });
    } else {
      this.setData({ refreshing: true, error: '' });
    }

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'listOperatorTrips',
        data: {
          keyword: this.data.keyword.trim(),
          status_filter: this.data.statusFilter,
          limit: 50,
        },
      });

      if (!result || !result.success) {
        this.setData({
          loading: false,
          refreshing: false,
          error: (result && result.message) || '行程列表加载失败',
          trips: [],
        });
        wx.showToast({ title: (result && result.message) || '加载失败', icon: 'none' });
        return;
      }

      this.setData({
        loading: false,
        refreshing: false,
        error: '',
        trips: (result.trips || []).map((trip) => this.normalizeTripListItem(trip)),
      });
    } catch (error) {
      console.error('[trip-management] listOperatorTrips failed', error);
      const message = (error && (error.errMsg || error.message)) || '未知错误';
      this.setData({
        loading: false,
        refreshing: false,
        error: `行程列表加载失败：${message}`,
        trips: [],
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  normalizeTripListItem(trip) {
    const visibilityStatus = trip.visibility_status || 'hidden';
    const reviewStatus = trip.review_status || 'pending_review';
    const isPublished = visibilityStatus === 'published';
    const needsReview = reviewStatus === 'pending_review' || reviewStatus === 'needs_review';
    return {
      ...trip,
      displayTitle: trip.title || 'Farland 行程',
      displayTripNo: trip.trip_no || trip.external_trip_id || trip.trip_id || '',
      displayParty: trip.party_name || trip.primary_customer_name || '客户 / 家庭待补充',
      displayDateRange: trip.date_range_text || [trip.start_at, trip.end_at].filter(Boolean).join(' - ') || '日期待同步',
      reviewStatusText: getReviewStatusText(reviewStatus),
      visibilityStatusText: getVisibilityStatusText(visibilityStatus),
      latestUpdatedText: formatDateTime(trip.latest_updated_at) || '待同步',
      stateHint: getTripStateHint(trip),
      visibilityClass: isPublished ? 'published' : 'unpublished',
      reviewClass: needsReview ? 'needs-review' : 'reviewed',
      dayCountText: `${trip.day_count || 0} 天`,
      accessCountText: `${trip.active_access_count || 0} 人已保存`,
      versionText: `v${trip.published_version || 0}`,
    };
  },

  openTripDetail(e) {
    const tripId = e.currentTarget.dataset.tripId || '';
    if (!tripId) {
      wx.showToast({ title: '缺少 trip_id', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/operator/customer-trip-detail/customer-trip-detail?trip_id=${encodeURIComponent(tripId)}`,
    });
  },

  openCustomerImport() {
    wx.navigateTo({ url: '/pages/operator/customer-import/customer-import' });
  },
});
