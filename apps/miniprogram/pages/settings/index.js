const api = require('../../utils/api');

Page({
  data: {
    user: null,
    notify: true,
    dark: false
  },

  onShow() {
    this.setData({ user: api.getUser() });
  },

  toggleNotify(e) {
    this.setData({ notify: e.detail.value });
  },

  toggleDark(e) {
    this.setData({ dark: e.detail.value });
    wx.showToast({ title: '深色模式将在后续版本开放', icon: 'none' });
  },

  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '会清除本地草稿和登录状态，确认继续？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          api.logout();
          this.setData({ user: null });
          wx.showToast({ title: '已清理', icon: 'success' });
        }
      }
    });
  },

  guidelines() {
    wx.navigateTo({ url: '/pages/guidelines/index' });
  },

  privacy() {
    wx.showModal({
      title: '隐私说明',
      content: '我们只收集完成校园认证和内容发布所必需的信息；不保存学生证照片、身份证号或完整学号。匿名只对其他用户匿名，平台在必要时应法律程序可追溯。',
      showCancel: false
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后仍可浏览，发布/评论需要重新认证。',
      success: (res) => {
        if (res.confirm) {
          api.logout();
          this.setData({ user: null });
          wx.switchTab({ url: '/pages/home/index' });
        }
      }
    });
  },

  deleteAccount() {
    wx.showModal({
      title: '注销账号',
      content: '注销会删除认证信息和账号数据；已发布内容按社区公约和法律要求处理。演示环境不执行真实删除。',
      confirmText: '提交申请',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '已记录注销申请', icon: 'none' });
        }
      }
    });
  },

  goAuth() {
    wx.navigateTo({ url: '/pages/auth/index' });
  }
});
