const api = require('../../utils/api');
const { timeAgo } = require('../../utils/format');

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'interaction', label: '互动' },
  { key: 'review', label: '审核' },
  { key: 'official', label: '官方' }
];

Page({
  data: {
    tabs: TABS,
    tab: 'all',
    items: [],
    all: [],
    loading: true
  },

  onLoad() {
    this.load();
  },

  async load() {
    try {
      const items = await api.getNotifications();
      const decorated = (items || []).map((item) => Object.assign({}, item, { timeText: timeAgo(item.time) }));
      this.setData({ all: decorated, items: this.filter(decorated, this.data.tab), loading: false });
    } catch (error) {
      this.setData({ loading: false });
    }
  },

  filter(items, tab) {
    if (tab === 'all') return items;
    return items.filter((item) => item.type === tab);
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab, items: this.filter(this.data.all, tab) });
  },

  open(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.all.find((row) => row.id === id);
    if (!item) return;
    api.markRead(id).then(() => {
      item.read = true;
      this.setData({ all: this.data.all, items: this.data.items });
    });
    if (item.link) {
      const url = item.link.replace('/pages/', '/pages/');
      wx.navigateTo({ url });
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' });
  }
});
