const now = Date.now();
const hoursAgo = (hours) => new Date(now - hours * 3600000).toISOString();
const img = (n) => `/assets/images/post-${n}.jpg`;

const user = {
  id: 'u_me',
  nickname: '小何',
  avatar: '',
  level: 'L2',
  verified: true,
  isOfficial: false,
  school: '示例大学',
  bio: '把今天的小事记下来'
};

const officialUser = {
  id: 'u_library',
  nickname: '校园图书馆',
  avatar: '',
  level: 'L4',
  verified: true,
  isOfficial: true,
  officialOrg: '学校图书馆'
};

const posts = [
  {
    id: 'p_sunset',
    text: '图书馆四楼的晚霞，像打翻的橘子汽水。今天风很大，云跑得比早八的人还快。',
    media: [
      { url: img(1), width: 1000, height: 750 },
      { url: img(6), width: 1000, height: 750 }
    ],
    topic: '校园光影',
    location: '图书馆四楼',
    author: { nickname: '林同学', isAnonymous: false, isOfficial: false, level: 'L3' },
    time: hoursAgo(4),
    likeCount: 32,
    commentCount: 3,
    favoriteCount: 12,
    liked: false,
    favorited: false,
    featured: true,
    commentsEnabled: true,
    status: 'published'
  },
  {
    id: 'p_food',
    text: '二食堂新出的麻辣拌，微辣加麻酱，12 块。排队 15 分钟，但第一口就原谅了全世界。',
    media: [{ url: img(2), width: 1000, height: 750 }],
    topic: '食堂测评',
    location: '二食堂',
    author: { nickname: '小何', isAnonymous: false, isOfficial: false, level: 'L2' },
    time: hoursAgo(2),
    likeCount: 18,
    commentCount: 1,
    favoriteCount: 7,
    liked: true,
    favorited: false,
    featured: false,
    commentsEnabled: true,
    status: 'published'
  },
  {
    id: 'p_cat',
    text: '它今天在食堂门口碰瓷，躺平了十分钟，成功骗到两根火腿肠。',
    media: [{ url: img(3), width: 1000, height: 750 }],
    topic: '校猫图鉴',
    location: '一食堂门口',
    author: { nickname: '匿名同学', alias: '匿名同学·银杏', isAnonymous: true, isOfficial: false, level: 'L2' },
    time: hoursAgo(1),
    likeCount: 21,
    commentCount: 0,
    favoriteCount: 8,
    liked: false,
    favorited: true,
    featured: false,
    commentsEnabled: true,
    status: 'published'
  },
  {
    id: 'p_rain',
    text: '雨后的操场像一面镜子，跑步的时候能看见自己的影子。今天 5 公里，配速 6 分 20。',
    media: [{ url: img(4), width: 1000, height: 750 }],
    topic: '校园光影',
    location: '东操场',
    author: { nickname: '雨天跑步', isAnonymous: false, isOfficial: false, level: 'L2' },
    time: hoursAgo(6),
    likeCount: 12,
    commentCount: 0,
    favoriteCount: 5,
    liked: false,
    favorited: false,
    featured: false,
    commentsEnabled: true,
    status: 'published'
  },
  {
    id: 'p_club',
    text: '周五晚 19:00，大学生活动中心 301，话剧社秋季专场《夜航》。凭学生卡入场，欢迎来玩。',
    media: [{ url: img(5), width: 1000, height: 750 }],
    topic: '社团活动',
    location: '大学生活动中心',
    author: { nickname: '话剧社', isAnonymous: false, isOfficial: true, level: 'L4' },
    time: hoursAgo(8),
    likeCount: 9,
    commentCount: 0,
    favoriteCount: 3,
    liked: false,
    favorited: false,
    featured: false,
    commentsEnabled: true,
    status: 'published'
  },
  {
    id: 'p_library',
    text: '在图书馆旧书区翻到一本 1998 年的《围城》，扉页上有人写了一句“愿你永远有书可读”。',
    media: [{ url: img(6), width: 1000, height: 750 }],
    topic: '校园光影',
    location: '图书馆三楼',
    author: { nickname: '林同学', isAnonymous: false, isOfficial: false, level: 'L3' },
    time: hoursAgo(24),
    likeCount: 40,
    commentCount: 0,
    favoriteCount: 15,
    liked: false,
    favorited: false,
    featured: true,
    commentsEnabled: true,
    status: 'published'
  },
  {
    id: 'p_morning',
    text: '早八路上看见一只松鼠叼着面包跑过，突然觉得今天也没那么难。',
    media: [],
    topic: '早八生存',
    location: '去教学楼的路上',
    author: { nickname: '小何', isAnonymous: false, isOfficial: false, level: 'L2' },
    time: hoursAgo(30),
    likeCount: 7,
    commentCount: 0,
    favoriteCount: 2,
    liked: false,
    favorited: false,
    featured: false,
    commentsEnabled: true,
    status: 'published'
  },
  {
    id: 'p_grad',
    text: '毕业季的操场，总有人在拍照，总有人在告别。祝我们都能去想去的地方。',
    media: [{ url: img(8), width: 1000, height: 750 }],
    topic: '毕业季',
    location: '东操场',
    author: { nickname: '雨天跑步', isAnonymous: false, isOfficial: false, level: 'L2' },
    time: hoursAgo(48),
    likeCount: 55,
    commentCount: 0,
    favoriteCount: 18,
    liked: false,
    favorited: false,
    featured: true,
    commentsEnabled: true,
    status: 'published'
  }
];

const comments = {
  p_sunset: [
    {
      id: 'c1',
      text: '这个角度我也拍过！下次一起去等晚霞。',
      author: { nickname: '匿名同学', alias: '匿名同学·梧桐', isAnonymous: true, isOfficial: false },
      time: hoursAgo(3.6),
      likeCount: 2,
      liked: false,
      replies: [
        {
          id: 'c2',
          text: '好呀，周五如果没课就去。',
          author: { nickname: '匿名同学', alias: '匿名同学·银杏', isAnonymous: true, isOfficial: false },
          replyTo: '匿名同学·梧桐',
          time: hoursAgo(3.3),
          likeCount: 1,
          liked: false
        }
      ]
    },
    {
      id: 'c3',
      text: '这张真的像电影截图。',
      author: { nickname: '匿名同学', alias: '匿名同学·木棉', isAnonymous: true, isOfficial: false },
      time: hoursAgo(3.0),
      likeCount: 0,
      liked: false,
      replies: []
    }
  ],
  p_food: [
    {
      id: 'c4',
      text: '12 块能吃到这么多，明天去。',
      author: { nickname: '匿名同学', alias: '匿名同学·青柠', isAnonymous: true, isOfficial: false },
      time: hoursAgo(1.6),
      likeCount: 1,
      liked: false,
      replies: []
    }
  ],
  p_cat: []
};

const notices = [
  {
    id: 'n_water',
    title: '东区今晚 22:00 起停水',
    body: '因管道维修，东区 1-6 号楼今晚 22:00 起停水，预计明早 6:00 恢复，请提前储水。',
    type: 'emergency',
    source: '后勤处',
    effectiveTo: '明早 06:00',
    createdAt: hoursAgo(2)
  },
  {
    id: 'n_library',
    title: '图书馆闭馆通知',
    body: '11 月 8 日上午 8:00-12:00 图书馆闭馆整理，请同学们相互转告。',
    type: 'normal',
    source: '学校图书馆',
    effectiveTo: '11-08 12:00',
    createdAt: hoursAgo(5)
  }
];

const notifications = [
  {
    id: 'n1',
    type: 'interaction',
    title: '有人回复了你',
    body: '“这个角度我也拍过！下次一起去等晚霞。”',
    link: '/pages/post/detail?id=p_sunset',
    read: false,
    time: hoursAgo(0.5)
  },
  {
    id: 'n2',
    type: 'review',
    title: '你的分享已通过审核',
    body: '二食堂新出的麻辣拌，已经出现在首页。',
    link: '/pages/post/detail?id=p_food',
    read: false,
    time: hoursAgo(1.2)
  },
  {
    id: 'n3',
    type: 'official',
    title: '校方通知：图书馆闭馆',
    body: '11 月 8 日上午闭馆整理。',
    link: '/pages/notice/detail?id=n_library',
    read: true,
    time: hoursAgo(5)
  }
];

let myPosts = [
  {
    id: 'p_pending',
    text: '今天在操场看见一只很圆的月亮，像是有人把它挂在了看台上。',
    media: [{ url: img(7), width: 1000, height: 750 }],
    topic: '校园光影',
    location: '东操场',
    status: 'pending',
    time: hoursAgo(0.4),
    likeCount: 0,
    commentCount: 0,
    favoriteCount: 0
  }
];

const viewed = {};

function heat(post) {
  const age = Math.max(0, (Date.now() - new Date(post.time).getTime()) / 3600000);
  const uniqueCommenters = post.id === 'p_sunset' ? 2 : post.commentCount ? 1 : 0;
  const engagement =
    0.6 * post.likeCount + 0.3 * uniqueCommenters + 0.2 * post.favoriteCount + 0.3 * Math.log1p(post.id === 'p_sunset' ? 268 : 80);
  return (engagement + 3 * Math.exp(-age / 6)) / Math.pow(age + 6, 1.2);
}

function allPosts() {
  return posts.concat(myPosts.filter((p) => p.status === 'published'));
}

function getFeed(tab) {
  let list = allPosts().filter((p) => p.status === 'published');
  if (tab === 'hot') {
    list = list.sort((a, b) => heat(b) - heat(a));
    const seen = {};
    list = list.filter((p) => {
      const key = p.author.nickname;
      seen[key] = (seen[key] || 0) + 1;
      return seen[key] <= 2;
    });
  } else if (tab === 'featured') {
    list = list.filter((p) => p.featured);
  } else {
    list = list.sort((a, b) => new Date(b.time) - new Date(a.time));
  }
  return list.map((p, i) => ({ ...p, rank: tab === 'hot' ? i + 1 : 0 }));
}

function getPost(id) {
  const post = allPosts().find((p) => p.id === id);
  if (!post) return null;
  if (!viewed[id]) {
    viewed[id] = true;
    post.viewCount = (post.viewCount || 0) + 1;
  }
  return { post, comments: comments[id] || [] };
}

function getEmergency() {
  return notices.find((n) => n.type === 'emergency') || null;
}

function getNormalNotice() {
  return notices.find((n) => n.type === 'normal') || null;
}

function getNotice(id) {
  return notices.find((n) => n.id === id) || null;
}

function toggleLike(id) {
  const post = allPosts().find((p) => p.id === id);
  if (!post) return null;
  post.liked = !post.liked;
  post.likeCount += post.liked ? 1 : -1;
  if (post.likeCount < 0) post.likeCount = 0;
  return post;
}

function toggleFavorite(id) {
  const post = allPosts().find((p) => p.id === id);
  if (!post) return null;
  post.favorited = !post.favorited;
  post.favoriteCount += post.favorited ? 1 : -1;
  if (post.favoriteCount < 0) post.favoriteCount = 0;
  return post;
}

function addComment(postId, text, replyTo, anonymity) {
  const list = comments[postId] || (comments[postId] = []);
  const alias = '匿名同学·晚风';
  const author = anonymity
    ? { nickname: '匿名同学', alias, isAnonymous: true, isOfficial: false }
    : { nickname: user.nickname, isAnonymous: false, isOfficial: false };
  if (replyTo) {
    const root = list.find((c) => c.id === replyTo.rootId || c.id === replyTo.id);
    if (root) {
      root.replies = root.replies || [];
      root.replies.push({
        id: `c_${Date.now()}`,
        text,
        author,
        replyTo: replyTo.alias || replyTo.nickname,
        time: new Date().toISOString(),
        likeCount: 0,
        liked: false
      });
    }
  } else {
    list.push({
      id: `c_${Date.now()}`,
      text,
      author,
      time: new Date().toISOString(),
      likeCount: 0,
      liked: false,
      replies: []
    });
  }
  const post = allPosts().find((p) => p.id === postId);
  if (post) post.commentCount += 1;
  return { ok: true, message: '已发布' };
}

function deletePost(id) {
  const index = posts.findIndex((item) => item.id === id);
  if (index >= 0) posts.splice(index, 1);
  myPosts = myPosts.filter((item) => item.id !== id);
  delete comments[id];
  return { ok: true };
}

function pinPost(id, pinned) {
  const post = allPosts().find((item) => item.id === id);
  if (!post) return null;
  post.pinnedAt = pinned ? new Date().toISOString() : undefined;
  return post;
}

function publish(data) {
  const item = {
    id: `p_${Date.now()}`,
    text: data.text,
    media: data.media || [],
    topic: data.topic || '',
    location: data.location || '',
    status: 'pending',
    time: new Date().toISOString(),
    likeCount: 0,
    commentCount: 0,
    favoriteCount: 0
  };
  myPosts.unshift(item);
  return { ok: true, status: 'pending', message: '已提交审核，通常 30 分钟内完成' };
}

function login() {
  wx.setStorageSync('campus_user', user);
  return user;
}

function logout() {
  wx.removeStorageSync('campus_user');
}

function getUser() {
  return wx.getStorageSync('campus_user') || null;
}

function redeem(code) {
  if (String(code).trim().toUpperCase() !== 'CAMPUS') {
    return { ok: false, message: '邀请码无效或已使用' };
  }
  wx.setStorageSync('campus_user', user);
  return { ok: true, message: '认证成功', user };
}

function getNotifications() {
  return notifications;
}

function markRead(id) {
  const item = notifications.find((n) => n.id === id);
  if (item) item.read = true;
}

function getMyPosts() {
  return myPosts;
}

function getMyComments() {
  return Object.keys(comments).reduce((result, postId) => {
    comments[postId].forEach((comment) => {
      if (comment.author.nickname === user.nickname) result.push({ ...comment, postId });
    });
    return result;
  }, []);
}

function getFavorites() {
  return allPosts().filter((p) => p.favorited);
}

function getTopics() {
  return ['校园光影', '食堂测评', '早八生存', '社团活动', '校猫图鉴', '毕业季'];
}

module.exports = {
  user,
  officialUser,
  getFeed,
  getPost,
  getEmergency,
  getNormalNotice,
  getNotice,
  toggleLike,
  toggleFavorite,
  addComment,
  deletePost,
  pinPost,
  publish,
  login,
  logout,
  getUser,
  redeem,
  getNotifications,
  markRead,
  getMyPosts,
  getMyComments,
  getFavorites,
  getTopics,
  heat
};
