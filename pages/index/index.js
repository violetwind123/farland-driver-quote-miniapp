Page({
  data: {
    operatorName: '运营账号',
    orders: [
      {
        id: 'OD20260516001',
        type: '接送单',
        route: 'SFO 机场 T3 → 联合广场酒店',
        serviceTime: '2026-05-18 09:30',
        quoteCount: 4,
        latestQuote: 'USD 98',
        statusText: '报价中'
      },
      {
        id: 'OD20260516002',
        type: '包车单',
        route: '旧金山市区 8 小时包车',
        serviceTime: '2026-05-19 10:00',
        quoteCount: 2,
        latestQuote: 'USD 420',
        statusText: '待确认'
      },
      {
        id: 'OD20260516003',
        type: '接送单',
        route: '圣何塞机场 → Palo Alto',
        serviceTime: '2026-05-20 15:15',
        quoteCount: 0,
        latestQuote: '--',
        statusText: '待报价'
      }
    ]
  },

  onCreateOrderTap() {
    wx.showActionSheet({
      itemList: ['包车单', '接送单'],
      success: ({ tapIndex }) => {
        const selectedType = tapIndex === 0 ? '包车单' : '接送单'
        wx.showToast({
          title: `已选择${selectedType}`,
          icon: 'none'
        })

        // 后续可在这里跳转到对应发单页面
        // wx.navigateTo({ url: `/pages/order-create/order-create?type=${encodeURIComponent(selectedType)}` })
      }
    })
  }
})
