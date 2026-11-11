Page({
  data: {},
  goHome() {
    wx.switchTab({ url: '/pages/home/index' });
  },
  goAppeal() {
    wx.navigateTo({ url: '/pages/appeal/index' });
  }
});
