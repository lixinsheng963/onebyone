const api = require('../../utils/api');
const config = require('../../utils/config');

Page({
  data: {
    step: 'invite',
    code: '',
    onsiteCode: '',
    error: '',
    user: null,
    userInitial: '同',
    logging: false,
    redeeming: false,
    savingProfile: false,
    schoolName: config.schoolName
  },

  onLoad() {
    const user = api.getUser();
    const token = wx.getStorageSync('campus_token');
    if (user && token && user.admittedAt) {
      if (user.school) {
        wx.switchTab({ url: '/pages/home/index' });
        return;
      }
      this.setData({ user, userInitial: this.initialOf(user), step: 'school' });
      return;
    }
    if (user && token) {
      this.setData({ user, userInitial: this.initialOf(user), step: 'invite' });
    }
  },

  initialOf(user) {
    return user && user.nickname ? user.nickname.charAt(0) : '同';
  },

  onCode(e) {
    this.setData({ code: e.detail.value.toUpperCase(), error: '' });
  },

  async verifyCode() {
    const code = this.data.code.trim().toUpperCase();
    if (!code) return this.setData({ error: '请输入管理员发放的邀请码' });
    if (!/^[A-Z0-9-]{4,32}$/.test(code)) {
      return this.setData({ error: '邀请码格式不正确，请检查后重试' });
    }
    if (this.data.redeeming) return;
    this.setData({ redeeming: true, error: '' });
    try {
      const check = await api.checkInvite(code);
      if (!check || !check.ok) {
        this.setData({ redeeming: false, error: (check && check.message) || '邀请码无效或已使用' });
        return;
      }
      let user = this.data.user;
      if (!user || !wx.getStorageSync('campus_token')) {
        user = await api.login();
      }
      if (!user || !wx.getStorageSync('campus_token')) {
        this.setData({ redeeming: false, error: '微信登录失败，请重试' });
        return;
      }
      const result = await api.redeem(code);
      if (!result.ok) {
        this.setData({ redeeming: false, error: result.message || '邀请码无效' });
        return;
      }
      const verifiedUser = result.user || user;
      this.setData({
        redeeming: false,
        step: verifiedUser.school ? 'done' : 'profile',
        user: verifiedUser,
        userInitial: this.initialOf(verifiedUser),
        error: ''
      });
    } catch (error) {
      this.setData({ redeeming: false, error: error.message || '认证失败，请重试' });
    }
  },

  authorizeProfile() {
    if (this.data.savingProfile) return;
    if (!wx.getUserProfile) {
      this.skipProfile();
      return;
    }
    wx.getUserProfile({
      desc: '用于展示你的微信头像和昵称',
      success: async (res) => {
        const info = res.userInfo || {};
        if (!info.nickName && !info.avatarUrl) {
          this.skipProfile();
          return;
        }
        this.setData({ savingProfile: true });
        try {
          const user = await api.updateProfile({
            nickname: info.nickName ? String(info.nickName).slice(0, 16) : undefined,
            avatar: info.avatarUrl || undefined
          });
          this.setData({ savingProfile: false, user, userInitial: this.initialOf(user), step: 'school' });
        } catch (error) {
          this.setData({ savingProfile: false, error: error.message || '资料保存失败' });
        }
      },
      fail: () => this.skipProfile()
    });
  },

  skipProfile() {
    this.setData({ step: 'school', error: '' });
  },

  skipSchool() {
    wx.switchTab({ url: '/pages/home/index' });
  },

  chooseSchool() {
    wx.showActionSheet({
      itemList: [config.schoolName],
      success: async () => {
        try {
          const user = await api.updateProfile({ school: config.schoolName });
          this.setData({ user, userInitial: this.initialOf(user), step: 'done', error: '' });
          wx.showToast({ title: '学校已选择', icon: 'success' });
        } catch (error) {
          this.setData({ error: error.message || '学校选择失败' });
        }
      }
    });
  },

  async submitOnsite() {
    const code = this.data.onsiteCode.trim().toUpperCase();
    if (!code) return this.setData({ error: '请输入现场认证码' });
    this.setData({ code, step: 'invite', onsiteCode: '' });
    await this.verifyCode();
  },

  goOnsite() {
    this.setData({ step: 'onsite', error: '' });
  },

  goCode() {
    this.setData({ step: 'invite', error: '' });
  },

  onOnsiteCode(e) {
    this.setData({ onsiteCode: e.detail.value.toUpperCase(), error: '' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' });
  },

  back() {
    wx.switchTab({ url: '/pages/home/index' });
  }
});
