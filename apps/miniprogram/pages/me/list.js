const api = require('../../utils/api');
const { timeAgo, formatDateTime, initial } = require('../../utils/format');

const TITLES = { posts: '我的发布', comments: '我的评论', favorites: '我的收藏' };

function displayName(author) {
  if (!author) return '同学';
  return author.isAnonymous ? (author.alias || '匿名同学') : (author.nickname || '同学');
}

function excerpt(text, max) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

Page({
  data: {
    type: 'posts',
    title: '我的发布',
    items: [],
    loading: true
  },

  onLoad(options) {
    const type = TITLES[options.type] ? options.type : 'posts';
    this.setData({ type, title: TITLES[type] });
    wx.setNavigationBarTitle({ title: TITLES[type] });
    this.load(true);
  },

  onShow() {
    if (this.loadedOnce) this.load(false);
  },

  async load(showSkeleton) {
    if (showSkeleton) this.setData({ loading: true });
    try {
      let items = [];
      if (this.data.type === 'posts') items = await api.getMyPosts();
      if (this.data.type === 'comments') items = await api.getMyCommentThreads();
      if (this.data.type === 'favorites') items = await api.getFavorites();
      const decorated = (items || []).map((item) => (
        this.data.type === 'comments' ? this.decorateThread(item) : this.decoratePost(item)
      ));
      this.loadedOnce = true;
      this.setData({ items: decorated, loading: false });
    } catch (error) {
      if (showSkeleton) this.setData({ items: [], loading: false });
      else wx.showToast({ title: '刷新失败，请稍后再试', icon: 'none' });
    }
  },

  decoratePost(item) {
    const copy = Object.assign({}, item);
    copy.timeText = timeAgo(copy.time || copy.createdAt || copy.publishedAt);
    copy.dateText = formatDateTime(copy.createdAt || copy.time || copy.publishedAt);
    copy.media = (copy.media || []).slice(0, 9);
    if (copy.author) {
      copy.author = Object.assign({}, copy.author);
      copy.author.initial = initial(copy.author.isAnonymous ? copy.author.alias : copy.author.nickname);
    }
    if (copy.status === 'pending') copy.statusText = '审核中';
    if (copy.status === 'rejected') copy.statusText = '未通过';
    if (copy.status === 'published') copy.statusText = '已发布';
    return copy;
  },

  decorateThread(thread) {
    const copy = Object.assign({}, thread);
    copy.post = Object.assign({}, copy.post);
    copy.threadId = copy.post.publicId;
    copy.post.excerpt = excerpt(copy.post.text, 56);
    copy.post.cover = copy.post.media && copy.post.media.length ? copy.post.media[0].url : '';
    copy.latestText = timeAgo(copy.latestAt);
    copy.comments = (copy.comments || []).map((comment) => {
      const item = Object.assign({}, comment);
      item.author = Object.assign({}, comment.author);
      item.authorName = displayName(comment.author);
      item.authorInitial = initial(item.authorName);
      item.timeText = timeAgo(comment.createdAt);
      if (item.mine) {
        item.roleText = item.replyToNickname ? `你回复了 ${item.replyToNickname}` : '你的评论';
      } else if (item.replyToMe) {
        item.roleText = '回复了你';
      } else if (item.onMyPost) {
        item.roleText = '评论了你的分享';
      } else {
        item.roleText = item.replyToNickname ? `回复 ${item.replyToNickname}` : '相关评论';
      }
      return item;
    });
    return copy;
  },

  onOpen(e) {
    const dataset = e.currentTarget.dataset || {};
    const id = dataset.id || (e.detail && e.detail.id);
    if (this.data.type === 'comments') {
      const postId = dataset.postid || id;
      if (postId) wx.navigateTo({ url: `/pages/post/detail?id=${postId}` });
      return;
    }
    const item = this.data.items.find((row) => row.id === id);
    if (!item) return;
    if (item.status === 'pending') {
      wx.showToast({ title: '审核中，通过后会出现在首页', icon: 'none' });
      return;
    }
    if (item.status === 'rejected') {
      wx.navigateTo({ url: `/pages/appeal/index?id=${id}` });
      return;
    }
    wx.navigateTo({ url: `/pages/post/detail?id=${id}` });
  },

  onEmptyAction() {
    if (this.data.type === 'posts') {
      wx.switchTab({ url: '/pages/publish/index' });
    } else {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },

  itemIndex(id) {
    return this.data.items.findIndex((item) => String(item.id) === String(id));
  },

  onCardLike(e) {
    if (!api.getUser()) return;
    const id = e.detail.id;
    const index = this.itemIndex(id);
    if (index < 0) return;
    const target = this.data.items[index];
    const next = !target.liked;
    const count = Math.max(0, (target.likeCount || 0) + (next ? 1 : -1));
    this.setData({
      [`items[${index}].liked`]: next,
      [`items[${index}].likeCount`]: count
    });
    api.toggleLike(id, next).then((result) => {
      const current = this.itemIndex(id);
      if (current < 0 || !result) return;
      this.setData({
        [`items[${current}].liked`]: Boolean(result.liked),
        [`items[${current}].likeCount`]: result.count
      });
    }).catch(() => {
      const current = this.itemIndex(id);
      if (current < 0) return;
      this.setData({
        [`items[${current}].liked`]: target.liked,
        [`items[${current}].likeCount`]: target.likeCount
      });
      wx.showToast({ title: '操作失败，请稍后再试', icon: 'none' });
    });
  },

  onCardFavorite(e) {
    if (!api.getUser()) return;
    const id = e.detail.id;
    const index = this.itemIndex(id);
    if (index < 0) return;
    const target = this.data.items[index];
    const next = !target.favorited;
    const count = Math.max(0, (target.favoriteCount || 0) + (next ? 1 : -1));
    this.setData({
      [`items[${index}].favorited`]: next,
      [`items[${index}].favoriteCount`]: count
    });
    api.toggleFavorite(id, next).then((result) => {
      if (this.data.type === 'favorites' && !next) {
        this.setData({ items: this.data.items.filter((row) => String(row.id) !== String(id)) });
        wx.showToast({ title: '已取消收藏', icon: 'none' });
        return;
      }
      const current = this.itemIndex(id);
      if (current < 0 || !result) return;
      this.setData({
        [`items[${current}].favorited`]: Boolean(result.favorited),
        [`items[${current}].favoriteCount`]: result.count
      });
    }).catch(() => {
      const current = this.itemIndex(id);
      if (current < 0) return;
      this.setData({
        [`items[${current}].favorited`]: target.favorited,
        [`items[${current}].favoriteCount`]: target.favoriteCount
      });
      wx.showToast({ title: '操作失败，请稍后再试', icon: 'none' });
    });
  },

  onCardComment(e) {
    const id = e.detail.id;
    if (id) wx.navigateTo({ url: `/pages/post/detail?id=${id}` });
  },

  togglePin(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.items.find((item) => item.id === id);
    if (!target) return;
    api.pinPost(id, !target.pinnedAt).then(() => {
      wx.showToast({ title: target.pinnedAt ? '已取消置顶' : '已置顶', icon: 'none' });
      this.load(false);
    }).catch((error) => {
      const message = (error && error.message) || '置顶失败';
      if (message.includes('置顶条数')) {
        wx.showModal({ title: '置顶已达上限', content: message, showCancel: false, confirmText: '知道了' });
      } else {
        wx.showToast({ title: message, icon: 'none' });
      }
    });
  },

  deletePost(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这条内容？',
      content: '删除后不可恢复，图片也会从存储中移除。',
      confirmColor: '#b64a3a',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deletePost(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.load(false);
        } catch (error) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  onCardMore(e) {
    const id = e.detail.id;
    wx.navigateTo({ url: `/pages/report/index?type=post&id=${id}` });
  }
});
