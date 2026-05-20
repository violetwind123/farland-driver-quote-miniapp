const VEHICLE_FILTERS = [
  { label: '全部', value: '' },
  { label: 'SUV', value: 'suv' },
  { label: 'Suburban', value: 'suburban' },
  { label: 'Van', value: 'van' },
  { label: 'Sprinter', value: 'sprinter' },
  { label: 'Transit', value: 'transit' },
  { label: 'Bus', value: 'bus' },
  { label: 'Other', value: 'other' },
];

Page({
  data: {
    loading: true,
    region: '',
    drivers: [],
    filters: VEHICLE_FILTERS,
    activeVehicleType: '',
  },

  onLoad(options) {
    const region = decodeURIComponent(options.region || '');
    this.setData({ region });
    wx.setNavigationBarTitle({ title: region || '区域司机' });
    this.loadDrivers();
  },

  async loadDrivers() {
    const { region, activeVehicleType } = this.data;
    if (!region) {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少司机区域', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getDriversByRegion',
        data: {
          region,
          vehicle_type: activeVehicleType,
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      this.setData({ loading: false, drivers: result.drivers || [] });
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onFilterTap(e) {
    this.setData({ activeVehicleType: e.currentTarget.dataset.value });
    this.loadDrivers();
  },
});
