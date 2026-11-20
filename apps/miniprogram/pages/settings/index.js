const api = require('../../utils/api');

Page({
  data: {
    user: null,
    notify: true,
    editingProfile: false,
    nicknameDraft: '',
    avatarDraft: '',
    savingProfile: false
  },

  onShow() {
    this.setData({
      user: api.getUser(),
      notify: wx.getStorageSync('campus_notify') !== false
    });
  },

  editProfile() {
    const user = this.data.user || {};
    this.setData({
      editingProfile: true,
      nicknameDraft: user.nickname || '',
      avatarDraft: user.avatar || ''
    });
  },

  cancelProfile() {
    this.setData({ editingProfile: false });
  },

  onNicknameInput(e) {
    this.setData({ nicknameDraft: e.detail.value });
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        try {
          const media = await api.uploadMedia(file.tempFilePath);
          this.setData({ avatarDraft: media.url });
        } catch (error) {
          wx.showToast({ title: (error && error.message) || '头像上传失败', icon: 'none' });
        }
      }
    });
  },

  async saveProfile() {
    const nickname = (this.data.nicknameDraft || '').trim();
    if (nickname.length < 1 || nickname.length > 16) {
      return wx.showToast({ title: '昵称需要 1-16 个字', icon: 'none' });
    }
    if (this.data.savingProfile) return;
    this.setData({ savingProfile: true });
    try {
      const user = await api.updateProfile({ nickname, avatar: this.data.avatarDraft });
      this.setData({ user, editingProfile: false, savingProfile: false });
      wx.showToast({ title: '资料已更新', icon: 'success' });
    } catch (error) {
      this.setData({ savingProfile: false });
      wx.showToast({ title: (error && error.message) || '更新失败', icon: 'none' });
    }
  },

  toggleNotify(e) {
    this.setData({ notify: e.detail.value });
    wx.setStorageSync('campus_notify', e.detail.value);
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
      content: '注销后昵称和头像会被匿名化，账号无法登录，已发布内容按社区公约与法律要求保留或处理。',
      confirmText: '确认注销',
      confirmColor: '#b64a3a',
      success: (res) => {
        if (!res.confirm) return;
        api.deleteAccount().then(() => {
          api.logout();
          this.setData({ user: null });
          wx.showToast({ title: '账号已注销', icon: 'none' });
          setTimeout(() => wx.switchTab({ url: '/pages/home/index' }), 600);
        }).catch((error) => {
          wx.showToast({ title: (error && error.message) || '注销失败，请稍后再试', icon: 'none' });
        });
      }
    });
  },

  goAuth() {
    wx.navigateTo({ url: '/pages/auth/index' });
  }
});
