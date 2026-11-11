const config = require('./config');
const mock = require('./mock');

function token() {
  return wx.getStorageSync('campus_token') || '';
}

function request(path, method, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}${path}`,
      method: method || 'GET',
      data: data || {},
      header: {
        'content-type': 'application/json',
        'x-user-token': token()
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 'OK') {
          resolve(res.data.data);
        } else {
          reject(new Error((res.data && res.data.message) || '请求失败'));
        }
      },
      fail: reject
    });
  });
}

function login() {
  if (!config.useRemote) {
    const user = mock.login();
    wx.setStorageSync('campus_token', 'mock_token');
    return Promise.resolve(user);
  }
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        request('/auth/wechat/login', 'POST', { code: res.code || 'demo-code' })
          .then((data) => {
            wx.setStorageSync('campus_token', data.token);
            wx.setStorageSync('campus_user', data.user);
            const app = getApp();
            if (app) app.setUser(data.user);
            resolve(data.user);
          })
          .catch(reject);
      },
      fail() {
        request('/auth/wechat/login', 'POST', { code: 'demo-code' })
          .then((data) => {
            wx.setStorageSync('campus_token', data.token);
            wx.setStorageSync('campus_user', data.user);
            resolve(data.user);
          })
          .catch(reject);
      }
    });
  });
}

function redeem(code) {
  if (!config.useRemote) return Promise.resolve(mock.redeem(code));
  return request('/auth/invite/redeem', 'POST', { code });
}

function logout() {
  if (config.useRemote) request('/auth/logout', 'POST').catch(() => {});
  wx.removeStorageSync('campus_token');
  wx.removeStorageSync('campus_user');
  const app = getApp();
  if (app) app.setUser(null);
}

function getUser() {
  return wx.getStorageSync('campus_user') || null;
}

function normalizePost(post) {
  if (!post) return post;
  const author = Object.assign({}, post.author || {});
  return Object.assign({}, post, {
    id: post.id || post.publicId,
    time: post.time || post.publishedAt,
    likeCount: post.likeCount || 0,
    favoriteCount: post.favoriteCount || 0,
    commentCount: post.commentCount || 0,
    author: {
      nickname: author.nickname || '同学',
      alias: author.alias,
      isAnonymous: Boolean(author.isAnonymous),
      isOfficial: Boolean(author.isOfficial),
      level: author.level
    }
  });
}

function normalizeComment(comment) {
  return Object.assign({}, comment, {
    time: comment.time || comment.createdAt,
    replies: (comment.replies || []).map((reply) => Object.assign({}, reply, {
      time: reply.time || reply.createdAt
    }))
  });
}

function normalizeDetail(data) {
  const comments = (data.comments || []).map(normalizeComment);
  const roots = comments.filter((item) => !item.rootId && !item.parentId);
  roots.forEach((root) => {
    root.replies = comments.filter((item) => item.rootId === root.id || item.parentId === root.id);
  });
  return { post: normalizePost(data.post), comments: roots };
}

function getFeed(tab) {
  if (!config.useRemote) return Promise.resolve(mock.getFeed(tab));
  return request(`/feed?tab=${tab || 'latest'}`).then((items) => (items || []).map(normalizePost));
}

function getPost(id) {
  if (!config.useRemote) return Promise.resolve(mock.getPost(id));
  return request(`/posts/${id}`).then(normalizeDetail);
}

function getEmergency() {
  if (!config.useRemote) return Promise.resolve(mock.getEmergency());
  return request('/notices/emergency');
}

function getNormalNotice() {
  if (!config.useRemote) return Promise.resolve(mock.getNormalNotice());
  return request('/notices').then((items) => (items || []).find((item) => item.type === 'normal') || null);
}

function getNotice(id) {
  if (!config.useRemote) return Promise.resolve(mock.getNotice(id));
  return request(`/notices/${id}`);
}

function toggleLike(id, liked) {
  if (!config.useRemote) return Promise.resolve(mock.toggleLike(id));
  return request(`/posts/${id}/like`, liked === false ? 'DELETE' : 'POST');
}

function toggleFavorite(id, favorited) {
  if (!config.useRemote) return Promise.resolve(mock.toggleFavorite(id));
  return request(`/posts/${id}/favorite`, favorited === false ? 'DELETE' : 'POST');
}

function addComment(postId, text, replyTo, anonymity) {
  if (!config.useRemote) return Promise.resolve(mock.addComment(postId, text, replyTo, anonymity));
  return request(`/posts/${postId}/comments`, 'POST', {
    text,
    anonymity,
    replyToCommentId: replyTo ? (replyTo.rootId || replyTo.id) : undefined
  });
}

function deletePost(id) {
  if (!config.useRemote) return Promise.resolve(mock.deletePost(id));
  return request(`/posts/${id}`, 'DELETE');
}

function pinPost(id, pinned) {
  if (!config.useRemote) return Promise.resolve(mock.pinPost(id, pinned));
  return request(`/posts/${id}/pin`, pinned === false ? 'DELETE' : 'POST');
}

function uploadMedia(filePath) {
  if (!config.useRemote) {
    return Promise.resolve({ id: `local_${Date.now()}`, url: filePath, width: 1000, height: 750 });
  }
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${config.baseUrl}/media`,
      filePath,
      name: 'file',
      header: { 'x-user-token': token() },
      success(res) {
        try {
          const payload = JSON.parse(res.data || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300 && payload.code === 'OK') {
            resolve(payload.data);
          } else {
            reject(new Error(payload.message || '图片上传失败'));
          }
        } catch (error) {
          reject(new Error('图片上传返回异常'));
        }
      },
      fail: reject
    });
  });
}

function publish(data) {
  if (!config.useRemote) return Promise.resolve(mock.publish(data));
  return request('/posts', 'POST', {
    text: data.text,
    topic: data.topic,
    location: data.location,
    anonymity: data.anonymity,
    commentsEnabled: data.commentsEnabled,
    mediaIds: data.mediaIds || []
  }).then((result) => ({
    ok: true,
    status: (result && result.post && result.post.status) || 'pending',
    message: (result && result.message) || '已提交审核，通常 30 分钟内完成'
  }));
}

function getNotifications() {
  if (!config.useRemote) return Promise.resolve(mock.getNotifications());
  return request('/notifications').then((items) => (items || []).map((item) => Object.assign({}, item, { time: item.time || item.createdAt })));
}

function markRead(id) {
  if (!config.useRemote) {
    mock.markRead(id);
    return Promise.resolve({ read: true });
  }
  return request(`/notifications/${id}/read`, 'POST');
}

function getMyPosts() {
  if (!config.useRemote) return Promise.resolve(mock.getMyPosts());
  return request('/me/posts').then((items) => (items || []).map(normalizePost));
}

function getMyComments() {
  if (!config.useRemote) return Promise.resolve(mock.getMyComments());
  return request('/me/comments').then((items) => (items || []).map(normalizeComment));
}

function getFavorites() {
  if (!config.useRemote) return Promise.resolve(mock.getFavorites());
  return request('/me/favorites').then((items) => (items || []).map(normalizePost));
}

function getTopics() {
  return Promise.resolve(mock.getTopics());
}

function getViewData(postId) {
  if (!config.useRemote) return Promise.resolve({ counted: true });
  return request(`/posts/${postId}/view`, 'POST', { visibleMs: 3200 });
}

function createReport(data) {
  if (!config.useRemote) return Promise.resolve({ id: `r_${Date.now()}`, status: 'pending' });
  return request('/reports', 'POST', data);
}

function submitAppeal(data) {
  if (!config.useRemote) return Promise.resolve({ status: 'pending', message: '申诉已提交' });
  return request('/appeals', 'POST', data);
}

module.exports = {
  login,
  redeem,
  logout,
  getUser,
  getFeed,
  getPost,
  getEmergency,
  getNormalNotice,
  getNotice,
  toggleLike,
  toggleFavorite,
  addComment,
  uploadMedia,
  deletePost,
  pinPost,
  publish,
  getNotifications,
  markRead,
  getMyPosts,
  getMyComments,
  getFavorites,
  getTopics,
  getViewData,
  createReport,
  submitAppeal,
  config
};
