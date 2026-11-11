const api = require('../../utils/api');
const { timeAgo, initial } = require('../../utils/format');

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

Page({
  data: {
    dateText: '',
    tabs: [
      { key: 'latest', label: '最新' },
      { key: 'hot', label: '热门' },
      { key: 'featured', label: '精选' }
    ],
    tab: 'latest',
    posts: [],
    allPosts: [],
    emergency: null,
    officialNotice: null,
    topics: [],
    activeTopic: '',
    unread: 0,
    loading: true,
    hasMore: false,
    error: ''
  },

  onLoad() {
    this.setData({ dateText: this.buildDate() });
    this.load();
  },

  onShow() {
    if (this._loaded) this.load(true);
    this._loaded = true;
    this.refreshUnread();
  },

  buildDate() {
    const date = new Date();
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${WEEK[date.getDay()]}`;
  },

  async load(silent) {
    if (!silent) this.setData({ loading: true, error: '' });
    try {
      const [posts, emergency, officialNotice, topics] = await Promise.all([
        api.getFeed(this.data.tab),
        api.getEmergency(),
        api.getNormalNotice(),
        api.getTopics()
      ]);
      const decorated = posts.map((item) => this.decorate(item));
      this.setData({
        allPosts: decorated,
        posts: this.filterTopic(decorated),
        emergency,
        officialNotice,
        topics,
        loading: false
      });
      this.refreshUnread();
    } catch (error) {
      this.setData({ loading: false, error: '网络好像开小差了' });
    }
  },

  decorate(post) {
    const copy = Object.assign({}, post);
    copy.author = Object.assign({}, post.author);
    copy.author.initial = initial(copy.author.isAnonymous ? copy.author.alias : copy.author.nickname);
    copy.timeText = timeAgo(copy.time);
    return copy;
  },

  filterTopic(posts) {
    if (!this.data.activeTopic) return posts;
    return posts.filter((item) => item.topic === this.data.activeTopic);
  },

  refreshUnread() {
    if (!api.getUser()) {
      this.setData({ unread: 0 });
      return;
    }
    api.getNotifications().then((items) => {
      this.setData({ unread: (items || []).filter((item) => !item.read).length });
    }).catch(() => {});
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab, activeTopic: '', posts: [], loading: true });
    this.load();
  },

  onTopic(e) {
    const topic = e.currentTarget.dataset.topic;
    const activeTopic = topic === this.data.activeTopic ? '' : topic;
    this.setData({ activeTopic, posts: this.filterTopic(this.data.allPosts) });
  },

  onOpen(e) {
    const id = e.detail.id;
    const post = this.data.allPosts.find((item) => item.id === id);
    if (!post) return;
    wx.navigateTo({ url: `/pages/post/detail?id=${id}` });
  },

  onComment(e) {
    const id = e.detail.id;
    wx.navigateTo({ url: `/pages/post/detail?id=${id}&focus=1` });
  },

  onLike(e) {
    if (!api.getUser()) return this.goAuth();
    const id = e.detail.id;
    const target = this.data.allPosts.find((item) => item.id === id);
    const nextLiked = !(target && target.liked);
    api.toggleLike(id, nextLiked).then((result) => {
      const liked = result && result.liked !== undefined ? result.liked : nextLiked;
      const count = result && result.count !== undefined ? result.count : result.likeCount;
      this.patchPost(id, { liked, likeCount: count });
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  onFavorite(e) {
    if (!api.getUser()) return this.goAuth();
    const id = e.detail.id;
    const target = this.data.allPosts.find((item) => item.id === id);
    const nextFavorited = !(target && target.favorited);
    api.toggleFavorite(id, nextFavorited).then((result) => {
      const favorited = result && result.favorited !== undefined ? result.favorited : nextFavorited;
      const count = result && result.count !== undefined ? result.count : result.favoriteCount;
      this.patchPost(id, { favorited, favoriteCount: count });
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  patchPost(id, patch) {
    const apply = (list) => list.map((item) => (item.id === id ? Object.assign({}, item, patch) : item));
    this.setData({
      allPosts: apply(this.data.allPosts),
      posts: apply(this.data.posts)
    });
  },

  onMore(e) {
    const id = e.detail.id;
    wx.showActionSheet({
      itemList: ['举报这条内容', '复制内容链接'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/report/index?type=post&id=${id}` });
        } else {
          wx.setClipboardData({ data: `campus://post/${id}` });
        }
      }
    });
  },

  onEmergency() {
    if (this.data.emergency) {
      wx.navigateTo({ url: `/pages/notice/detail?id=${this.data.emergency.id}` });
    }
  },

  onOfficialNotice() {
    if (this.data.officialNotice) {
      wx.navigateTo({ url: `/pages/notice/detail?id=${this.data.officialNotice.id}` });
    }
  },

  onMessage() {
    if (!api.getUser()) return this.goAuth();
    wx.navigateTo({ url: '/pages/notifications/index' });
  },

  goAuth() {
    wx.navigateTo({ url: '/pages/auth/index' });
  },

  onPublish() {
    wx.switchTab({ url: '/pages/publish/index' });
  },

  onEmptyAction() {
    this.onPublish();
  },

  onRetry() {
    this.load();
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
  },

  async onPullDownRefresh() {
    await this.load(true);
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {
    return { title: '校园日常 · 今天校园里有什么？', path: '/pages/home/index' };
  }
});
