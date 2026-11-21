const api = require('../../utils/api');
const { formatDateTime } = require('../../utils/format');

const STATUS_TEXT = {
  published: '已发布',
  hidden: '已隐藏',
  rejected: '未通过',
  pending: '审核中'
};

Page({
  data: {
    loading: true,
    items: [],
    selectedId: '',
    selected: null,
    reason: '',
    submitting: false,
    statusText: STATUS_TEXT
  },

  onLoad(options) {
    if (!api.getUser()) {
      wx.redirectTo({ url: '/pages/auth/index' });
      return;
    }
    this.presetId = options && options.id ? options.id : '';
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const posts = await api.getMyPosts();
      const items = (posts || [])
        .filter((post) => ['published', 'hidden', 'rejected'].includes(post.status || 'published'))
        .map((post) => ({
          id: post.publicId || post.id,
          text: post.text || '',
          status: post.status || 'published',
          statusText: STATUS_TEXT[post.status || 'published'] || '已发布',
          cover: post.media && post.media[0] ? (post.media[0].url || '') : '',
          time: formatDateTime(post.publishedAt || post.createdAt || post.time)
        }));
      let selected = items.find((item) => item.id === this.presetId);
      if (!selected) selected = items.find((item) => item.status !== 'published') || items[0];
      this.setData({
        loading: false,
        items,
        selectedId: selected ? selected.id : '',
        selected: selected || null
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message || '加载失败，请重试', icon: 'none' });
    }
  },

  selectTarget(e) {
    const id = e.currentTarget.dataset.id;
    const selected = this.data.items.find((item) => item.id === id) || null;
    this.setData({ selectedId: id, selected });
  },

  onInput(e) {
    this.setData({ reason: e.detail.value });
  },

  async submit() {
    if (!this.data.selected) {
      return wx.showToast({ title: '请选择要申诉的内容', icon: 'none' });
    }
    const reason = this.data.reason.trim();
    if (!reason) {
      return wx.showToast({ title: '请填写申诉理由', icon: 'none' });
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await api.submitAppeal({
        targetType: 'post',
        targetId: this.data.selected.id,
        reason
      });
      wx.showModal({
        title: '申诉已提交',
        content: '审核员会复核你选择的内容和处理理由，结果会通过通知告诉你。',
        showCancel: false,
        confirmText: '知道了',
        success: () => wx.navigateBack()
      });
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
