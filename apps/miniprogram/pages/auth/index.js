const api = require('../../utils/api');
const config = require('../../utils/config');

Page({
  data: {
    step: 'welcome',
    code: '',
    onsiteCode: '',
    error: '',
    user: null,
    userInitial: '同',
    logging: false,
    redeeming: false
  },

  onLoad() {
    const user = api.getUser();
    if (user) {
      this.setData({ user, userInitial: this.initialOf(user), step: 'done' });
    }
  },

  initialOf(user) {
    return user && user.nickname ? user.nickname.charAt(0) : '同';
  },

  async onLogin() {
    if (this.data.logging) return;
    this.setData({ logging: true, error: '' });
    try {
      const user = await api.login();
      this.setData({ user, userInitial: this.initialOf(user), logging: false, step: 'code' });
    } catch (error) {
      this.setData({ logging: false, error: '登录失败，请重试' });
    }
  },

  onCode(e) {
    this.setData({ code: e.detail.value.toUpperCase(), error: '' });
  },

  async redeem() {
    if (!this.data.code.trim()) {
      return this.setData({ error: '请输入邀请码' });
    }
    this.setData({ redeeming: true, error: '' });
    try {
      const result = await api.redeem(this.data.code);
      if (!result.ok) {
        this.setData({ redeeming: false, error: result.message || '邀请码无效' });
        return;
      }
      const verifiedUser = result.user || this.data.user;
      this.setData({ redeeming: false, step: 'done', user: verifiedUser, userInitial: this.initialOf(verifiedUser) });
      wx.showToast({ title: '认证成功', icon: 'success' });
    } catch (error) {
      this.setData({ redeeming: false, error: '认证失败，请重试' });
    }
  },

  goOnsite() {
    this.setData({ step: 'onsite', error: '' });
  },

  goCode() {
    this.setData({ step: 'code', error: '' });
  },

  onOnsiteCode(e) {
    this.setData({ onsiteCode: e.detail.value.toUpperCase(), error: '' });
  },

  async submitOnsite() {
    if (!this.data.onsiteCode.trim()) {
      return this.setData({ error: '请输入现场认证码' });
    }
    // Demo: 现场码与邀请码一致；生产由工作人员一次性生成。
    const result = await api.redeem(this.data.onsiteCode);
    if (!result.ok) {
      return this.setData({ error: '现场码无效或已过期' });
    }
    const verifiedUser = result.user || this.data.user;
    this.setData({ step: 'done', user: verifiedUser, userInitial: this.initialOf(verifiedUser) });
    wx.showToast({ title: '认证成功', icon: 'success' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' });
  },

  back() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/home/index' })
    });
  }
});
