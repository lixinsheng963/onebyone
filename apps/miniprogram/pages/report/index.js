const api = require('../../utils/api');

const REASONS = [
  { key: 'privacy', label: '泄露隐私 / 联系方式', hint: '手机号、宿舍号、聊天截图、人脸' },
  { key: 'harassment', label: '人身攻击 / 网暴', hint: '辱骂、威胁、挂人' },
  { key: 'rumor', label: '造谣 / 未证实指控', hint: '没有事实依据的点名指控' },
  { key: 'ad', label: '广告 / 兼职 / 诈骗', hint: '二维码、加微信、代写、刷单' },
  { key: 'illegal', label: '色情 / 暴力 / 违法', hint: '包含违法或极端内容' },
  { key: 'other', label: '其他', hint: '说不清楚，也可以提交' }
];

Page({
  data: {
    reasons: REASONS,
    selected: '',
    detail: '',
    submitting: false,
    type: 'post',
    id: ''
  },

  onLoad(options) {
    this.setData({ type: options.type || 'post', id: options.id || '' });
  },

  select(e) {
    this.setData({ selected: e.currentTarget.dataset.key });
  },

  onDetail(e) {
    this.setData({ detail: e.detail.value });
  },

  async submit() {
    if (!this.data.selected) {
      return wx.showToast({ title: '选一个原因', icon: 'none' });
    }
    if (!api.getUser()) {
      wx.navigateTo({ url: '/pages/auth/index' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.createReport({
        targetType: this.data.type,
        targetId: this.data.id,
        reason: this.data.selected,
        detail: this.data.detail
      });
      wx.showModal({
        title: '已受理',
        content: '我们会尽快处理，结果会通过通知告诉你。',
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
