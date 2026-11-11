const api = require('../../utils/api');
const { formatDate } = require('../../utils/format');

Page({
  data: {
    notice: null,
    loading: true
  },

  onLoad(options) {
    this.id = options.id;
    this.load();
  },

  async load() {
    try {
      const notice = await api.getNotice(this.id);
      if (notice) {
        notice.dateText = formatDate(notice.createdAt);
      }
      this.setData({ notice, loading: false });
      if (notice && notice.type === 'emergency') {
        wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#a52b27' });
      }
    } catch (error) {
      this.setData({ loading: false });
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' });
  }
});
