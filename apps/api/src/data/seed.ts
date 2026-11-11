import type { Comment, ModerationCase, Notice, Notification, Post, Report, Topic, User } from '../types';

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString();

export const users: User[] = [
  {
    id: 'u_me',
    publicId: 'u_me',
    openid: 'demo-openid',
    nickname: '小何',
    avatar: '',
    role: 'student',
    level: 'L2',
    isOfficial: false,
    createdAt: iso(24 * 60)
  },
  {
    id: 'u_lin',
    publicId: 'u_lin',
    nickname: '林同学',
    avatar: '',
    role: 'creator',
    level: 'L3',
    isOfficial: false,
    createdAt: iso(24 * 90)
  },
  {
    id: 'u_cat',
    publicId: 'u_cat',
    nickname: '猫猫观察员',
    avatar: '',
    role: 'student',
    level: 'L2',
    isOfficial: false,
    createdAt: iso(24 * 30)
  },
  {
    id: 'u_rain',
    publicId: 'u_rain',
    nickname: '雨天跑步',
    avatar: '',
    role: 'student',
    level: 'L2',
    isOfficial: false,
    createdAt: iso(24 * 50)
  },
  {
    id: 'u_official',
    publicId: 'u_official',
    nickname: '校园图书馆',
    avatar: '',
    role: 'official',
    level: 'L4',
    isOfficial: true,
    officialOrg: '学校图书馆',
    createdAt: iso(24 * 180)
  }
];

const img = (seed: string) => `https://picsum.photos/seed/${seed}/1200/900`;

export const topics: Topic[] = [
  { id: 't_sunset', name: '校园光影', emoji: '🌇', count: 42 },
  { id: 't_food', name: '食堂测评', emoji: '🍜', count: 36 },
  { id: 't_morning', name: '早八生存', emoji: '☕', count: 28 },
  { id: 't_club', name: '社团活动', emoji: '🎭', count: 21 },
  { id: 't_cat', name: '校猫图鉴', emoji: '🐈', count: 19 },
  { id: 't_grad', name: '毕业季', emoji: '🎓', count: 12 }
];

export const posts: Post[] = [
  {
    id: 'p_sunset',
    authorId: 'u_lin',
    text: '图书馆四楼的晚霞，像打翻的橘子汽水。今天风很大，云跑得比早八的人还快。',
    media: [
      { id: 'm1', url: img('campus-sunset'), width: 1200, height: 900 },
      { id: 'm2', url: img('campus-window'), width: 1200, height: 900 }
    ],
    topic: '校园光影',
    location: '图书馆四楼',
    anonymity: false,
    status: 'published',
    risk: 'P3',
    featured: true,
    commentsEnabled: true,
    likeCount: 32,
    favoriteCount: 12,
    commentCount: 3,
    uniqueViewers: 268,
    uniqueCommenters: 3,
    publishedAt: iso(4),
    createdAt: iso(4),
    likedBy: new Set(['u_me', 'u_cat', 'u_rain']),
    favoritedBy: new Set(['u_me']),
    heatScore: 0
  },
  {
    id: 'p_food',
    authorId: 'u_me',
    text: '二食堂新出的麻辣拌，微辣加麻酱，12 块。排队 15 分钟，但第一口就原谅了全世界。',
    media: [{ id: 'm3', url: img('campus-food'), width: 1200, height: 900 }],
    topic: '食堂测评',
    location: '二食堂',
    anonymity: false,
    status: 'published',
    risk: 'P3',
    featured: false,
    commentsEnabled: true,
    likeCount: 18,
    favoriteCount: 7,
    commentCount: 1,
    uniqueViewers: 120,
    uniqueCommenters: 1,
    publishedAt: iso(2),
    createdAt: iso(2),
    likedBy: new Set(['u_lin', 'u_cat']),
    favoritedBy: new Set(['u_cat']),
    heatScore: 0
  },
  {
    id: 'p_cat',
    authorId: 'u_cat',
    text: '它今天在食堂门口碰瓷，躺平了十分钟，成功骗到两根火腿肠。',
    media: [{ id: 'm4', url: img('campus-cat'), width: 1200, height: 900 }],
    topic: '校猫图鉴',
    location: '一食堂门口',
    anonymity: true,
    anonymousAlias: '匿名同学·银杏',
    status: 'published',
    risk: 'P3',
    featured: false,
    commentsEnabled: true,
    likeCount: 21,
    favoriteCount: 8,
    commentCount: 0,
    uniqueViewers: 96,
    uniqueCommenters: 0,
    publishedAt: iso(1),
    createdAt: iso(1),
    likedBy: new Set(['u_me', 'u_lin', 'u_rain']),
    favoritedBy: new Set(['u_me']),
    heatScore: 0
  },
  {
    id: 'p_rain',
    authorId: 'u_rain',
    text: '雨后的操场像一面镜子，跑步的时候能看见自己的影子。今天 5 公里，配速 6 分 20。',
    media: [{ id: 'm5', url: img('campus-rain'), width: 1200, height: 900 }],
    topic: '校园光影',
    location: '东操场',
    anonymity: false,
    status: 'published',
    risk: 'P3',
    featured: false,
    commentsEnabled: true,
    likeCount: 12,
    favoriteCount: 5,
    commentCount: 0,
    uniqueViewers: 90,
    uniqueCommenters: 0,
    publishedAt: iso(6),
    createdAt: iso(6),
    likedBy: new Set(['u_me']),
    favoritedBy: new Set(),
    heatScore: 0
  },
  {
    id: 'p_club',
    authorId: 'u_official',
    text: '周五晚 19:00，大学生活动中心 301，话剧社秋季专场《夜航》。凭学生卡入场，欢迎来玩。',
    media: [{ id: 'm6', url: img('campus-stage'), width: 1200, height: 900 }],
    topic: '社团活动',
    location: '大学生活动中心',
    anonymity: false,
    status: 'published',
    risk: 'P3',
    featured: false,
    commentsEnabled: true,
    likeCount: 9,
    favoriteCount: 3,
    commentCount: 0,
    uniqueViewers: 60,
    uniqueCommenters: 0,
    publishedAt: iso(8),
    createdAt: iso(8),
    likedBy: new Set(['u_lin']),
    favoritedBy: new Set(['u_lin']),
    heatScore: 0
  },
  {
    id: 'p_library',
    authorId: 'u_lin',
    text: '在图书馆旧书区翻到一本 1998 年的《围城》，扉页上有人写了一句“愿你永远有书可读”。',
    media: [{ id: 'm7', url: img('campus-books'), width: 1200, height: 900 }],
    topic: '校园光影',
    location: '图书馆三楼',
    anonymity: false,
    status: 'published',
    risk: 'P3',
    featured: true,
    commentsEnabled: true,
    likeCount: 40,
    favoriteCount: 15,
    commentCount: 0,
    uniqueViewers: 300,
    uniqueCommenters: 0,
    publishedAt: iso(24),
    createdAt: iso(24),
    likedBy: new Set(['u_me', 'u_cat']),
    favoritedBy: new Set(['u_me', 'u_cat']),
    heatScore: 0
  },
  {
    id: 'p_morning',
    authorId: 'u_me',
    text: '早八路上看见一只松鼠叼着面包跑过，突然觉得今天也没那么难。',
    media: [],
    topic: '早八生存',
    location: '去教学楼的路上',
    anonymity: false,
    status: 'published',
    risk: 'P3',
    featured: false,
    commentsEnabled: true,
    likeCount: 7,
    favoriteCount: 2,
    commentCount: 0,
    uniqueViewers: 45,
    uniqueCommenters: 0,
    publishedAt: iso(30),
    createdAt: iso(30),
    likedBy: new Set(['u_lin']),
    favoritedBy: new Set(),
    heatScore: 0
  },
  {
    id: 'p_grad',
    authorId: 'u_rain',
    text: '毕业季的操场，总有人在拍照，总有人在告别。祝我们都能去想去的地方。',
    media: [{ id: 'm8', url: img('campus-graduation'), width: 1200, height: 900 }],
    topic: '毕业季',
    location: '东操场',
    anonymity: false,
    status: 'published',
    risk: 'P3',
    featured: true,
    commentsEnabled: true,
    likeCount: 55,
    favoriteCount: 18,
    commentCount: 0,
    uniqueViewers: 500,
    uniqueCommenters: 0,
    publishedAt: iso(48),
    createdAt: iso(48),
    likedBy: new Set(['u_me', 'u_lin', 'u_cat']),
    favoritedBy: new Set(['u_me']),
    heatScore: 0
  },
  {
    id: 'p_pending_1',
    authorId: 'u_cat',
    text: '有人知道东区快递站周末开不开门吗？',
    media: [],
    topic: '早八生存',
    location: '东区快递站',
    anonymity: false,
    status: 'pending',
    risk: 'P2',
    featured: false,
    commentsEnabled: true,
    likeCount: 0,
    favoriteCount: 0,
    commentCount: 0,
    uniqueViewers: 0,
    uniqueCommenters: 0,
    publishedAt: iso(0.4),
    createdAt: iso(0.4),
    likedBy: new Set(),
    favoritedBy: new Set(),
    heatScore: 0
  },
  {
    id: 'p_pending_2',
    authorId: 'u_rain',
    text: '出一张校园卡，价格好商量，电话 13800001234。',
    media: [],
    topic: '其他',
    location: '东区',
    anonymity: false,
    status: 'pending',
    risk: 'P1',
    featured: false,
    commentsEnabled: true,
    likeCount: 0,
    favoriteCount: 0,
    commentCount: 0,
    uniqueViewers: 0,
    uniqueCommenters: 0,
    publishedAt: iso(0.2),
    createdAt: iso(0.2),
    likedBy: new Set(),
    favoritedBy: new Set(),
    heatScore: 0
  }
];

export const comments: Comment[] = [
  {
    id: 'c1',
    postId: 'p_sunset',
    authorId: 'u_cat',
    text: '这个角度我也拍过！下次一起去等晚霞。',
    anonymity: true,
    anonymousAlias: '匿名同学·梧桐',
    status: 'published',
    risk: 'P3',
    likeCount: 2,
    createdAt: iso(3.6)
  },
  {
    id: 'c2',
    postId: 'p_sunset',
    authorId: 'u_lin',
    rootId: 'c1',
    parentId: 'c1',
    replyToUserId: 'u_cat',
    text: '好呀，周五如果没课就去。',
    anonymity: true,
    anonymousAlias: '匿名同学·银杏',
    status: 'published',
    risk: 'P3',
    likeCount: 1,
    createdAt: iso(3.3)
  },
  {
    id: 'c3',
    postId: 'p_sunset',
    authorId: 'u_me',
    text: '这张真的像电影截图。',
    anonymity: true,
    anonymousAlias: '匿名同学·木棉',
    status: 'published',
    risk: 'P3',
    likeCount: 0,
    createdAt: iso(3.0)
  },
  {
    id: 'c4',
    postId: 'p_food',
    authorId: 'u_lin',
    text: '12 块能吃到这么多，明天去。',
    anonymity: true,
    anonymousAlias: '匿名同学·青柠',
    status: 'published',
    risk: 'P3',
    likeCount: 1,
    createdAt: iso(1.6)
  }
];

export const notices: Notice[] = [
  {
    id: 'n_water',
    title: '东区今晚 22:00 起停水',
    body: '因管道维修，东区 1-6 号楼今晚 22:00 起停水，预计明早 6:00 恢复，请提前储水。',
    type: 'emergency',
    source: '后勤处',
    status: 'published',
    pinned: true,
    effectiveFrom: iso(2),
    effectiveTo: new Date(now + 10 * 3600_000).toISOString(),
    createdAt: iso(2)
  },
  {
    id: 'n_library',
    title: '图书馆闭馆通知',
    body: '11 月 8 日上午 8:00-12:00 图书馆闭馆整理，请同学们相互转告。',
    type: 'normal',
    source: '学校图书馆',
    status: 'published',
    pinned: false,
    effectiveFrom: iso(5),
    effectiveTo: new Date(now + 24 * 3600_000).toISOString(),
    createdAt: iso(5)
  }
];

export const reports: Report[] = [
  {
    id: 'r1',
    reporterId: 'u_me',
    targetType: 'post',
    targetId: 'p_pending_2',
    reason: '广告/兼职/诈骗',
    detail: '疑似出售校园卡',
    status: 'pending',
    createdAt: iso(0.1)
  }
];

export const notifications: Notification[] = [
  {
    id: 'noti1',
    userId: 'u_me',
    type: 'interaction',
    title: '有人回复了你',
    body: '“这个角度我也拍过！下次一起去等晚霞。”',
    link: '/pages/post/detail?id=p_sunset',
    read: false,
    createdAt: iso(0.5)
  },
  {
    id: 'noti2',
    userId: 'u_me',
    type: 'review',
    title: '你的分享已通过审核',
    body: '二食堂新出的麻辣拌，已经出现在首页。',
    link: '/pages/post/detail?id=p_food',
    read: false,
    createdAt: iso(1.2)
  },
  {
    id: 'noti3',
    userId: 'u_me',
    type: 'official',
    title: '校方通知：图书馆闭馆',
    body: '11 月 8 日上午闭馆整理。',
    link: '/pages/notice/detail?id=n_library',
    read: true,
    createdAt: iso(5)
  }
];

export const moderationCases: ModerationCase[] = [
  {
    id: 'mc1',
    targetType: 'post',
    targetId: 'p_pending_1',
    risk: 'P2',
    labels: ['other'],
    evidence: ['东区快递站'],
    reason: '低风险咨询，待人工确认',
    status: 'pending',
    createdAt: iso(0.4)
  },
  {
    id: 'mc2',
    targetType: 'post',
    targetId: 'p_pending_2',
    risk: 'P1',
    labels: ['privacy', 'fraud'],
    evidence: ['校园卡', '电话 13800001234'],
    reason: '疑似出售校园卡并暴露手机号',
    status: 'pending',
    createdAt: iso(0.2)
  }
];
