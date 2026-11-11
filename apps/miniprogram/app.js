App({
  globalData: {
    user: null,
    lastReadNotice: ''
  },
  onLaunch() {
    const user = wx.getStorageSync('campus_user');
    if (user) this.globalData.user = user;
  },
  setUser(user) {
    this.globalData.user = user;
    if (user) wx.setStorageSync('campus_user', user);
    else wx.removeStorageSync('campus_user');
  }
});
