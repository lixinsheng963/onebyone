const api = require('../../utils/api');

const TOPICS = ['校园光影', '食堂测评', '早八生存', '社团活动', '校猫图鉴', '毕业季'];
const LOCATIONS = ['图书馆', '一食堂', '二食堂', '东操场', '大学生活动中心', '教学楼', '东区宿舍'];

Page({
  data: {
    images: [],
    text: '',
    textLength: 0,
    topics: TOPICS,
    topic: '',
    locations: LOCATIONS,
    locationIndex: -1,
    location: '',
    anonymity: false,
    commentsEnabled: true,
    submitting: false,
    draftSaved: false
  },

  onLoad() {
    const draft = wx.getStorageSync('campus_draft');
    if (draft) {
      this.setData({
        images: draft.images || [],
        text: draft.text || '',
        textLength: (draft.text || '').length,
        topic: draft.topic || '',
        location: draft.location || '',
        anonymity: Boolean(draft.anonymity),
        commentsEnabled: draft.commentsEnabled !== false
      });
    }
  },

  onHide() {
    this.saveDraft();
  },

  saveDraft() {
    const { images, text, topic, location, anonymity, commentsEnabled } = this.data;
    if (!images.length && !text.trim()) return;
    wx.setStorageSync('campus_draft', { images, text, topic, location, anonymity, commentsEnabled });
    this.setData({ draftSaved: true });
  },

  chooseMedia() {
    const remain = 9 - this.data.images.length;
    if (remain <= 0) return wx.showToast({ title: '最多 9 张', icon: 'none' });
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const next = res.tempFiles.map((file) => file.tempFilePath);
        this.setData({ images: this.data.images.concat(next) });
      }
    });
  },

  useDemoImages() {
    const demo = ['/assets/images/post-1.jpg', '/assets/images/post-2.jpg', '/assets/images/post-3.jpg'];
    this.setData({ images: demo.slice(0, 9) });
  },

  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  onInput(e) {
    const text = e.detail.value;
    this.setData({ text, textLength: text.length });
  },

  onTopic(e) {
    const topic = e.currentTarget.dataset.topic;
    this.setData({ topic: topic === this.data.topic ? '' : topic });
  },

  onLocation(e) {
    const index = Number(e.detail.value);
    this.setData({ locationIndex: index, location: LOCATIONS[index] || '' });
  },

  onAnonChange(e) {
    this.setData({ anonymity: e.detail.value });
  },

  onCommentsChange(e) {
    this.setData({ commentsEnabled: e.detail.value });
  },

  onCancel() {
    if (!this.data.images.length && !this.data.text.trim()) {
      return wx.switchTab({ url: '/pages/home/index' });
    }
    wx.showModal({
      title: '保存草稿？',
      content: '离开后可以继续编辑。',
      confirmText: '保存并离开',
      cancelText: '继续编辑',
      success: (res) => {
        if (res.confirm) {
          this.saveDraft();
          wx.switchTab({ url: '/pages/home/index' });
        }
      }
    });
  },

  async onPublish() {
    if (!api.getUser()) {
      wx.navigateTo({ url: '/pages/auth/index' });
      return;
    }
    if (!this.data.text.trim() && !this.data.images.length) {
      return wx.showToast({ title: '写点什么或选张图', icon: 'none' });
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const mediaIds = [];
      if (api.config.useRemote && this.data.images.length) {
        wx.showLoading({ title: `上传图片 1/${this.data.images.length}`, mask: true });
        for (let i = 0; i < this.data.images.length; i += 1) {
          wx.showLoading({ title: `上传图片 ${i + 1}/${this.data.images.length}`, mask: true });
          const media = await api.uploadMedia(this.data.images[i]);
          mediaIds.push(media.id);
        }
        wx.hideLoading();
      }
      const result = await api.publish({
        text: this.data.text.trim() || '分享一张校园日常。',
        media: this.data.images.map((url, index) => ({ url, width: 1000, height: 750, id: `local_${index}` })),
        mediaIds,
        topic: this.data.topic,
        location: this.data.location,
        anonymity: this.data.anonymity,
        commentsEnabled: this.data.commentsEnabled
      });
      wx.removeStorageSync('campus_draft');
      this.setData({ submitting: false, images: [], text: '', textLength: 0 });
      wx.showModal({
        title: result.status === 'pending' ? '已提交审核' : '已发布',
        content: result.message || '审核通过后会出现在首页。',
        showCancel: false,
        confirmText: '去看看',
        success: () => wx.switchTab({ url: '/pages/home/index' })
      });
    } catch (error) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: (error && error.message) || '发布失败，请重试', icon: 'none' });
    }
  }
});
