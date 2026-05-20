const VEHICLE_TYPES = ['sedan', 'suv', 'suburban', 'van', 'sprinter', 'transit', 'bus', 'other'];

Page({
  data: {
    loading: true,
    saving: false,
    errorMessage: '',
    driver: null,
    vehicle: null,
    quotingOrders: [],
    selectedOrders: [],
    canUpdateVehicle: false,
    vehicleLockedReason: '',
    vehicleTypeOptions: VEHICLE_TYPES,
    vehicleTypeIndex: 0,
    formVehicleType: VEHICLE_TYPES[0],
    formVehicleModel: '',
    formSeats: '',
    formLuggageCapacity: '',
    formPlateNumber: '',
  },

  onLoad() {
    this.loadHome();
  },

  onPullDownRefresh() {
    this.loadHome().finally(() => wx.stopPullDownRefresh());
  },

  async loadHome() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'getDriverHome' });
      if (!result || !result.success) {
        this.setData({
          loading: false,
          errorMessage: (result && result.message) || '加载失败',
        });
        return;
      }
      const vehicle = result.vehicle || {};
      const vehicleTypeIndex = Math.max(VEHICLE_TYPES.indexOf(vehicle.vehicle_type || VEHICLE_TYPES[0]), 0);
      this.setData({
        loading: false,
        driver: result.driver || null,
        vehicle: result.vehicle || null,
        quotingOrders: result.quoting_orders || [],
        selectedOrders: result.selected_orders || [],
        canUpdateVehicle: !!result.can_update_vehicle,
        vehicleLockedReason: result.vehicle_locked_reason || '',
        vehicleTypeIndex,
        formVehicleType: VEHICLE_TYPES[vehicleTypeIndex],
        formVehicleModel: vehicle.vehicle_model || '',
        formSeats: vehicle.seats ? String(vehicle.seats) : '',
        formLuggageCapacity: vehicle.luggage_capacity ? String(vehicle.luggage_capacity) : '',
        formPlateNumber: vehicle.plate_number || '',
      });
    } catch (error) {
      this.setData({ loading: false, errorMessage: '系统繁忙，请稍后再试' });
    }
  },

  onInputChange(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onVehicleTypeChange(e) {
    const vehicleTypeIndex = Number(e.detail.value);
    this.setData({
      vehicleTypeIndex,
      formVehicleType: VEHICLE_TYPES[vehicleTypeIndex],
    });
  },

  async saveVehicle() {
    const {
      canUpdateVehicle,
      saving,
      formVehicleType,
      formVehicleModel,
      formSeats,
      formLuggageCapacity,
      formPlateNumber,
    } = this.data;
    if (saving) return;
    if (!canUpdateVehicle) {
      wx.showToast({ title: '请联系 Farland 运营修改', icon: 'none' });
      return;
    }
    if (!formVehicleType || !formVehicleModel) {
      wx.showToast({ title: '请填写车辆类型和型号', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'updateDriverVehicle',
        data: {
          vehicle_profile: {
            vehicle_type: formVehicleType,
            vehicle_model: formVehicleModel,
            seats: formSeats,
            luggage_capacity: formLuggageCapacity,
            plate_number: formPlateNumber,
          },
        },
      });
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.message) || '保存失败', icon: 'none' });
        this.setData({ saving: false });
        return;
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ saving: false });
      this.loadHome();
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      this.setData({ saving: false });
    }
  },
});
