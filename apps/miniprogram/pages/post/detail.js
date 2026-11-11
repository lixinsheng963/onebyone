const api = require('../../utils/api');
const { timeAgo, initial } = require('../../utils/format');

Page({
  data: {
    post: null,
    comments: [],
    loading: true,
    commentText: '',
    replyTarget: null,
    anonymity: true,
    focus: false,
    sending: false,
    user: null,
    error: ''
  },

  onLoad(options) {
    this.postId = options.id;
    this.setData({ focus: options.focus === '1', user: api.getUser() });
    this.load();
    if (options.focus === '1') {
      setTimeout(() => this.setData({ focus: true }), 300);
    }
  },

  onShow() {
    this.setData({ user: api.getUser() });
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.getPost(this.postId);
      if (!data) {
        this.setData({ loading: false, error: '这条内容不存在或已被删除' });
        return;
      }
      this.setData({
        post: this.decoratePost(data.post),
        comments: (data.comments || []).map((comment) => this.decorateComment(comment)),
        loading: false
      });
      api.getViewData(this.postId).catch(() => {});
    } catch (error) {
      this.setData({ loading: false, error: '网络好像开小差了' });
    }
  },

  decoratePost(post) {
    const copy = Object.assign({}, post);
    copy.author = Object.assign({}, post.author);
    copy.author.initial = initial(copy.author.isAnonymous ? copy.author.alias : copy.author.nickname);
    copy.timeText = timeAgo(copy.time);
    return copy;
  },

  decorateComment(comment) {
    const copy = Object.assign({}, comment);
    copy.author = Object.assign({}, comment.author);
    copy.author.initial = initial(copy.author.isAnonymous ? copy.author.alias : copy.author.nickname);
    copy.timeText = timeAgo(copy.time);
    copy.replies = (comment.replies || []).map((reply) => {
      const item = Object.assign({}, reply);
      item.author = Object.assign({}, reply.author);
      item.author.initial = initial(item.author.isAnonymous ? item.author.alias : item.author.nickname);
      item.timeText = timeAgo(item.time);
      return item;
    });
    return copy;
  },

  onPreview(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    const urls = (this.data.post.media || []).map((item) => item.url);
    if (urls.length) wx.previewImage({ current: urls[index], urls });
  },

  onLike() {
    if (!api.getUser()) return this.goAuth();
    const nextLiked = !(this.data.post && this.data.post.liked);
    api.toggleLike(this.postId, nextLiked).then(() => this.load()).catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
  },

  onFavorite() {
    if (!api.getUser()) return this.goAuth();
    const nextFavorited = !(this.data.post && this.data.post.favorited);
    api.toggleFavorite(this.postId, nextFavorited).then(() => this.load()).catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
  },

  onFocus() {
    if (!api.getUser()) return this.goAuth();
    this.setData({ focus: true });
  },

  onInput(e) {
    this.setData({ commentText: e.detail.value });
  },

  onAnonChange(e) {
    this.setData({ anonymity: e.detail.value });
  },

  onReply(e) {
    if (!api.getUser()) return this.goAuth();
    const comment = e.detail.comment;
    this.setData({
      replyTarget: {
        id: comment.id,
        rootId: e.detail.rootId,
        nickname: comment.author.isAnonymous ? comment.author.alias : comment.author.nickname
      },
      focus: true
    });
  },

  onCancelReply() {
    this.setData({ replyTarget: null });
  },

  async onSend() {
    if (!api.getUser()) return this.goAuth();
    const text = (this.data.commentText || '').trim();
    if (!text) return wx.showToast({ title: '写点什么吧', icon: 'none' });
    this.setData({ sending: true });
    try {
      await api.addComment(this.postId, text, this.data.replyTarget, this.data.anonymity);
      this.setData({ commentText: '', replyTarget: null, sending: false });
      wx.showToast({ title: '已发布', icon: 'none' });
      this.load();
    } catch (error) {
      this.setData({ sending: false });
      wx.showToast({ title: '发送失败', icon: 'none' });
    }
  },

  onMore() {
    const actions = [];
    if (this.data.post && this.data.post.isMine) {
      actions.push({ label: this.data.post.pinnedAt ? '取消置顶' : '置顶', action: 'pin' });
      actions.push({ label: '删除这条内容', action: 'delete' });
    }
    actions.push({ label: '举报这条内容', action: 'report' });
    actions.push({ label: '复制内容链接', action: 'copy' });
    wx.showActionSheet({
      itemList: actions.map((item) => item.label),
      success: (res) => {
        const action = actions[res.tapIndex] && actions[res.tapIndex].action;
        if (action === 'pin') this.togglePin();
        if (action === 'delete') this.deletePost();
        if (action === 'report') wx.navigateTo({ url: `/pages/report/index?type=post&id=${this.postId}` });
        if (action === 'copy') wx.setClipboardData({ data: `campus://post/${this.postId}` });
      }
    });
  },

  togglePin() {
    const pinned = Boolean(this.data.post && this.data.post.pinnedAt);
    api.pinPost(this.postId, !pinned).then(() => {
      wx.showToast({ title: pinned ? '已取消置顶' : '已置顶', icon: 'none' });
      this.load();
    }).catch((error) => {
      const message = (error && error.message) || '置顶失败';
      if (message.includes('置顶条数')) {
        wx.showModal({ title: '置顶已达上限', content: message, showCancel: false, confirmText: '知道了' });
      } else {
        wx.showToast({ title: message, icon: 'none' });
      }
    });
  },

  deletePost() {
    wx.showModal({
      title: '删除这条内容？',
      content: '删除后不可恢复，图片也会从存储中移除。',
      confirmColor: '#b64a3a',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deletePost(this.postId);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/index' }) }), 500);
        } catch (error) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  onReportComment(e) {
    const comment = e.detail.comment;
    wx.navigateTo({ url: `/pages/report/index?type=comment&id=${comment.id}` });
  },

  goAuth() {
    wx.navigateTo({ url: '/pages/auth/index' });
  },

  onShareAppMessage() {
    return {
      title: this.data.post ? this.data.post.text.slice(0, 30) : '校园日常',
      path: `/pages/post/detail?id=${this.postId}`
    };
  }
});
