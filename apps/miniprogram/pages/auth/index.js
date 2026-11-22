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
    profileAvatar: '',
    profileAvatarTemp: '',
    profileNickname: '',
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

  onChooseAvatar(event) {
    const avatarUrl = event && event.detail && event.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({ profileAvatarTemp: avatarUrl, profileAvatar: avatarUrl, error: '' });
  },

  onNicknameInput(event) {
    this.setData({ profileNickname: (event.detail.value || '').slice(0, 16), error: '' });
  },

  async saveProfile() {
    if (this.data.savingProfile) return;
    const nickname = String(this.data.profileNickname || '').trim();
    if (!nickname && !this.data.profileAvatarTemp) {
      this.setData({ error: '请选择微信头像，或填写微信昵称' });
      return;
    }
    if (nickname && (nickname.length < 1 || nickname.length > 16)) {
      this.setData({ error: '昵称需要 1-16 个字' });
      return;
    }
    this.setData({ savingProfile: true, error: '' });
    try {
      let avatar;
      if (this.data.profileAvatarTemp) {
        const media = await api.uploadMedia(this.data.profileAvatarTemp, { purpose: 'avatar' });
        avatar = media.url;
      }
      const user = await api.updateProfile({
        nickname: nickname || undefined,
        avatar: avatar || undefined
      });
      this.setData({
        savingProfile: false,
        user,
        userInitial: this.initialOf(user),
        profileAvatar: '',
        profileAvatarTemp: '',
        profileNickname: '',
        step: 'school'
      });
    } catch (error) {
      this.setData({ savingProfile: false, error: error.message || '资料保存失败，请重试' });
    }
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
