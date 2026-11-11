const api = require('../../utils/api');

Page({
  data: {
    reason: '',
    submitting: false,
    targetId: ''
  },

  onLoad(options) {
    this.setData({ targetId: options.id || '' });
  },

  onInput(e) {
    this.setData({ reason: e.detail.value });
  },

  async submit() {
    if (!this.data.reason.trim()) {
      return wx.showToast({ title: '写一下申诉理由', icon: 'none' });
    }
    if (!api.getUser()) {
      wx.navigateTo({ url: '/pages/auth/index' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.submitAppeal({ targetId: this.data.targetId, reason: this.data.reason.trim() });
      wx.showModal({
        title: '已提交申诉',
        content: '24 小时内由另一位审核员复核，结果会通过通知告诉你。',
        showCancel: false,
        confirmText: '知道了',
        success: () => wx.navigateBack()
      });
    } catch (error) {
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  }
});
