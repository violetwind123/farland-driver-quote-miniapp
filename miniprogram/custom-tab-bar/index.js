Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/hotel/request/request',
        text: '酒店预订',
        iconPath: '/assets/icons/tab-hotel-muted.svg',
        selectedIconPath: '/assets/icons/tab-hotel-filled.svg'
      },
      {
        pagePath: '/pages/customer/home/home',
        text: '我的行程',
        iconPath: '/assets/icons/tab-trip-muted.svg',
        selectedIconPath: '/assets/icons/tab-trip-filled.svg'
      }
    ]
  },

  lifetimes: {
    attached() {
      this.updateSelected();
    }
  },

  pageLifetimes: {
    show() {
      this.updateSelected();
    }
  },

  methods: {
    updateSelected() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      if (!currentPage) return;

      const currentRoute = `/${currentPage.route}`;
      const selected = this.data.list.findIndex((item) => item.pagePath === currentRoute);

      if (selected !== -1 && selected !== this.data.selected) {
        this.setData({ selected });
      }
    },

    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      const path = event.currentTarget.dataset.path;
      if (!path) return;
      if (index === this.data.selected) return;

      wx.switchTab({ url: path });
    }
  }
});
