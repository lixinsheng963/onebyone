const api = require('../../utils/api');
const config = require('../../utils/config');
const { initial } = require('../../utils/format');

Page({
  data: {
    user: null,
    userInitial: '同',
    stats: { posts: 0, comments: 0, favorites: 0 },
    pending: 0
  },

  onShow() {
    const user = api.getUser();
    this.setData({
      user,
      userInitial: user && user.nickname ? initial(user.nickname) : '同'
    });
    if (user) this.loadStats();
  },

  async loadStats() {
    try {
      const [posts, threads, favorites] = await Promise.all([
        api.getMyPosts(),
        api.getMyCommentThreads(),
        api.getFavorites()
      ]);
      const relatedComments = (threads || []).reduce((sum, thread) => sum + (thread.comments || []).length, 0);
      this.setData({
        stats: {
          posts: (posts || []).filter((item) => item.status === 'published').length,
          comments: relatedComments,
          favorites: (favorites || []).length
        },
        pending: (posts || []).filter((item) => item.status === 'pending').length
      });
    } catch (error) {
      // 统计数据失败不阻塞页面。
    }
  },

  goAuth() {
    wx.navigateTo({ url: '/pages/auth/index' });
  },

  chooseSchool() {
    const user = this.data.user;
    if (!user) return this.goAuth();
    if (user.school) {
      wx.showToast({ title: '学校已选择，不能修改', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: [config.schoolName],
      success: async () => {
        try {
          const updated = await api.updateProfile({ school: config.schoolName });
          this.setData({ user: updated, userInitial: initial(updated.nickname) });
          wx.showToast({ title: '学校已选择', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message || '选择失败', icon: 'none' });
        }
      }
    });
  },

  goList(e) {
    if (!this.data.user) return this.goAuth();
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({ url: `/pages/me/list?type=${type}` });
  },

  goPage(e) {
    if (!this.data.user) return this.goAuth();
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ url });
  },

  goGuidelines() {
    wx.navigateTo({ url: '/pages/guidelines/index' });
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  goAppeal() {
    wx.navigateTo({ url: '/pages/appeal/index' });
  }
});
