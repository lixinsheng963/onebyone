App({
  globalData: {
    user: null,
    lastReadNotice: ''
  },
  onLaunch() {
    const user = wx.getStorageSync('campus_user');
    const token = wx.getStorageSync('campus_token');
    if (user) this.globalData.user = user;
    if (!token || !user || !user.admittedAt) {
      wx.reLaunch({ url: '/pages/auth/index' });
    }
  },
  setUser(user) {
    this.globalData.user = user;
    if (user) wx.setStorageSync('campus_user', user);
    else wx.removeStorageSync('campus_user');
  }
});
