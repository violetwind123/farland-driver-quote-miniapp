#!/usr/bin/env node

const assert = require('assert');
const config = require('../miniprogram/pages/customer/home/home-page-config');

function createPage({ app, storage = {} } = {}) {
  global.getApp = () => app;
  global.wx = {
    getStorageSync(key) {
      return storage[key];
    },
    setStorageSync(key, value) {
      storage[key] = value;
    },
    switchTab() {},
    navigateTo(options) {
      page.lastNavigateUrl = options.url;
    },
    showToast() {},
    cloud: {
      callFunction: async () => ({ result: { success: false, message: 'not configured' } }),
    },
  };

  const page = Object.assign({}, config, {
    __isItineraryTab: true,
    data: JSON.parse(JSON.stringify(config.data)),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      if (callback) callback();
    },
    getTabBar() {
      return null;
    },
    loadHome() {
      this.loadCount = (this.loadCount || 0) + 1;
    },
    refreshPhoneLocalTripDaySelection() {},
    scrollToPendingCustomerHomeTarget() {},
  });
  return page;
}

async function run() {
  {
    const app = { globalData: {} };
    const storage = {
      customer_active_trip_invite: { trip_id: '096', invite_code: 'invite-096' },
    };
    const page = createPage({ app, storage });
    app.globalData.operatorTripInvitePreview = {
      trip_id: '099',
      invite_code: 'invite-099',
      return_trip_id: '099',
    };

    page.onShow();
    assert.equal(page.data.tripInviteId, '099');
    assert.equal(page.data.operatorInvitePreviewTripId, '099');
    assert.equal(page.data.operatorInvitePreviewReturnTripId, '099');
    assert.equal(page.data.operatorInvitePreview, true);

    page.onShow();
    assert.equal(page.data.tripInviteId, '099', 'old customer cache must not replace an active operator preview');

    page.exitOperatorInvitePreview();
    assert.match(page.lastNavigateUrl, /trip_id=099$/);
  }

  {
    const app = {
      globalData: {
        customerTripInviteHandoff: { trip_id: '099', invite_code: 'invite-099' },
      },
    };
    const page = createPage({ app });
    Object.assign(page.data, {
      tripInviteId: '096',
      inviteCode: 'invite-096',
      tripInviteMode: true,
      operatorInvitePreview: true,
      operatorInvitePreviewTripId: '096',
      operatorInvitePreviewReturnTripId: '096',
    });

    page.onShow();
    assert.equal(page.data.tripInviteId, '099');
    assert.equal(page.data.operatorInvitePreview, false);
    assert.equal(page.data.operatorInvitePreviewTripId, '');
    assert.equal(page.data.operatorInvitePreviewReturnTripId, '');
  }

  {
    const app = { globalData: {} };
    const page = createPage({ app });
    const pending = [];
    wx.cloud.callFunction = () => new Promise((resolve) => pending.push(resolve));

    Object.assign(page.data, { tripInviteId: '096', inviteCode: 'invite-096' });
    const oldLoad = config.loadTripInviteHome.call(page);
    Object.assign(page.data, { tripInviteId: '099', inviteCode: 'invite-099' });
    const newLoad = config.loadTripInviteHome.call(page);

    pending[1]({ result: { success: false, message: '099 result' } });
    await newLoad;
    pending[0]({ result: { success: false, message: '096 result' } });
    await oldLoad;
    assert.equal(page.data.tripInviteError, '099 result', 'late 096 response must not overwrite 099');
  }

  console.log('customer-trip-preview-state-test: 3/3 PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
