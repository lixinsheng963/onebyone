const api = require('../../utils/api');
const { timeAgo, initial } = require('../../utils/format');

const TITLES = { posts: '我的发布', comments: '我的评论', favorites: '我的收藏' };

Page({
  data: {
    type: 'posts',
    title: '我的发布',
    items: [],
    loading: true
  },

  onLoad(options) {
    const type = TITLES[options.type] ? options.type : 'posts';
    this.setData({ type, title: TITLES[type] });
    wx.setNavigationBarTitle({ title: TITLES[type] });
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      let items = [];
      if (this.data.type === 'posts') items = await api.getMyPosts();
      if (this.data.type === 'comments') items = await api.getMyComments();
      if (this.data.type === 'favorites') items = await api.getFavorites();
      this.setData({
        items: (items || []).map((item) => this.decorate(item)),
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false, items: [] });
    }
  },

  decorate(item) {
    const copy = Object.assign({}, item);
    copy.timeText = timeAgo(copy.time || copy.createdAt);
    if (copy.author) {
      copy.author = Object.assign({}, copy.author);
      copy.author.initial = initial(copy.author.isAnonymous ? copy.author.alias : copy.author.nickname);
    }
    if (copy.status === 'pending') copy.statusText = '审核中';
    if (copy.status === 'rejected') copy.statusText = '未通过';
    if (copy.status === 'published') copy.statusText = '已发布';
    return copy;
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.id || (e.detail && e.detail.id);
    if (this.data.type === 'comments') {
      wx.navigateTo({ url: `/pages/post/detail?id=${id}` });
      return;
    }
    const item = this.data.items.find((row) => row.id === id);
    if (!item) return;
    if (item.status === 'pending') {
      wx.showToast({ title: '审核中，通过后会出现在首页', icon: 'none' });
      return;
    }
    if (item.status === 'rejected') {
      wx.navigateTo({ url: `/pages/appeal/index?id=${id}` });
      return;
    }
    wx.navigateTo({ url: `/pages/post/detail?id=${id}` });
  },

  onEmptyAction() {
    if (this.data.type === 'posts') {
      wx.switchTab({ url: '/pages/publish/index' });
    } else {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },

  onCardLike(e) {
    if (!api.getUser()) return;
    const target = this.data.items.find((item) => item.id === e.detail.id);
    api.toggleLike(e.detail.id, !(target && target.liked)).then(() => this.load());
  },

  onCardFavorite(e) {
    if (!api.getUser()) return;
    const target = this.data.items.find((item) => item.id === e.detail.id);
    api.toggleFavorite(e.detail.id, !(target && target.favorited)).then(() => this.load());
  },

  togglePin(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.items.find((item) => item.id === id);
    if (!target) return;
    api.pinPost(id, !target.pinnedAt).then(() => {
      wx.showToast({ title: target.pinnedAt ? '已取消置顶' : '已置顶', icon: 'none' });
      this.load();
    }).catch((error) => {
      const message = (error && error.message) || '置顶失败';
      if (message.includes('置顶条数')) {
        wx.showModal({ title: '置顶已达上限', content: message, showCancel: false, confirmText: '知道了' });
      } else {
        wx.showToast({ title: message, icon: 'none' });
      }
    });
  },

  deletePost(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这条内容？',
      content: '删除后不可恢复，图片也会从存储中移除。',
      confirmColor: '#b64a3a',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deletePost(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.load();
        } catch (error) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  onCardMore(e) {
    const id = e.detail.id;
    wx.navigateTo({ url: `/pages/report/index?type=post&id=${id}` });
  }
});
