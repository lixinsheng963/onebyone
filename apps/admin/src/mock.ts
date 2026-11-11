import type { HotItem, ModerationCase, Notice, OfficialAccount, RankingConfig, Report } from './types';

export const stats = {
  registered: 1286,
  dau: 318,
  postsToday: 26,
  pending: 12,
  reports: 3,
  official: 4,
  p0: 0,
  p1: 2,
  reviewSla: '98%',
  weekPosts: [32, 28, 41, 36, 52, 44, 61],
  weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
};

export const cases: ModerationCase[] = [
  {
    id: 'mc_1',
    risk: 'P1',
    labels: ['privacy', 'fraud'],
    reason: '疑似出售校园卡并暴露手机号',
    evidence: ['校园卡', '电话 13800001234'],
    status: 'pending',
    post: {
      id: 'p_1',
      author: '雨天跑步',
      text: '出一张校园卡，价格好商量，电话 13800001234。',
      cover: 'linear-gradient(135deg,#dc6b4d,#8f2f2a)',
      location: '东区',
      createdAt: '18:42'
    }
  },
  {
    id: 'mc_2',
    risk: 'P1',
    labels: ['harassment'],
    reason: '疑似挂人、含人身攻击',
    evidence: ['曝光你', '截图'],
    status: 'pending',
    post: {
      id: 'p_2',
      author: '匿名同学',
      alias: '匿名同学·梧桐',
      text: '大家都来看看这个人，做错了事还装无辜，截图我放这里了。',
      cover: 'linear-gradient(135deg,#456b75,#1f3038)',
      location: '教学楼',
      createdAt: '17:20'
    }
  },
  {
    id: 'mc_3',
    risk: 'P2',
    labels: ['ad'],
    reason: '疑似广告/站外导流',
    evidence: ['扫码', '进群'],
    status: 'pending',
    post: {
      id: 'p_3',
      author: '小何',
      text: '新开的奶茶店扫码进群，第二杯半价，想要的私聊。',
      cover: 'linear-gradient(135deg,#d3a45c,#9b5d32)',
      topic: '食堂测评',
      createdAt: '16:05'
    }
  },
  {
    id: 'mc_4',
    risk: 'P2',
    labels: ['other'],
    reason: '低风险咨询，待人工确认',
    evidence: ['快递站'],
    status: 'pending',
    post: {
      id: 'p_4',
      author: '猫猫观察员',
      text: '有人知道东区快递站周末开不开门吗？',
      cover: 'linear-gradient(135deg,#728d6a,#3f5b49)',
      topic: '早八生存',
      createdAt: '15:20'
    }
  },
  {
    id: 'mc_5',
    risk: 'P3',
    labels: [],
    reason: '抽审：正常校园日常',
    evidence: [],
    status: 'pending',
    post: {
      id: 'p_5',
      author: '林同学',
      text: '图书馆四楼的晚霞，像打翻的橘子汽水。',
      cover: 'linear-gradient(135deg,#e7a16d,#bd5b50)',
      topic: '校园光影',
      createdAt: '14:10'
    }
  }
];

export const notices: Notice[] = [
  {
    id: 'n_1',
    title: '东区今晚 22:00 起停水',
    body: '因管道维修，东区 1-6 号楼今晚 22:00 起停水，预计明早 6:00 恢复，请提前储水。',
    type: 'emergency',
    source: '后勤处',
    status: 'published',
    effectiveTo: '11-08 06:00',
    createdAt: '今天 18:00'
  },
  {
    id: 'n_2',
    title: '图书馆闭馆通知',
    body: '11 月 8 日上午 8:00-12:00 图书馆闭馆整理，请同学们相互转告。',
    type: 'normal',
    source: '学校图书馆',
    status: 'published',
    effectiveTo: '11-08 12:00',
    createdAt: '今天 10:00'
  },
  {
    id: 'n_3',
    title: '周五晚话剧社专场',
    body: '大学生活动中心 301，凭学生卡入场。',
    type: 'normal',
    source: '话剧社',
    status: 'draft',
    effectiveTo: '11-10 22:00',
    createdAt: '昨天 21:00'
  }
];

export const officialAccounts: OfficialAccount[] = [
  {
    id: 'oa_1',
    orgName: '学校图书馆',
    owner: '校园图书馆',
    scope: ['校方通知'],
    status: 'active',
    authorization: '授权书已留档 · 2026-2027'
  },
  {
    id: 'oa_2',
    orgName: '话剧社',
    owner: '猫猫观察员',
    scope: ['活动通知'],
    status: 'pending_school',
    authorization: '待学校审核人确认'
  },
  {
    id: 'oa_3',
    orgName: '后勤处',
    owner: '校园后勤',
    scope: ['校方通知', '紧急通知'],
    status: 'active',
    authorization: '授权书已留档 · 长期'
  },
  {
    id: 'oa_4',
    orgName: '学生会',
    owner: '学生会小助手',
    scope: ['活动通知'],
    status: 'pending_platform',
    authorization: '学校已通过，平台复核中'
  }
];

export const reports: Report[] = [
  {
    id: 'r_1',
    target: '出一张校园卡，价格好商量...',
    targetType: '帖子',
    reason: '广告/兼职/诈骗',
    reporter: '小何',
    status: 'pending',
    createdAt: '18:41'
  },
  {
    id: 'r_2',
    target: '大家都来看看这个人...',
    targetType: '帖子',
    reason: '人身攻击/网暴',
    reporter: '匿名同学',
    status: 'pending',
    createdAt: '17:22'
  },
  {
    id: 'r_3',
    target: '奶茶店扫码进群',
    targetType: '帖子',
    reason: '广告/导流',
    reporter: '林同学',
    status: 'pending',
    createdAt: '16:08'
  }
];

export const hotItems: HotItem[] = [
  {
    id: 'p_sunset',
    title: '图书馆四楼的晚霞，像打翻的橘子汽水',
    author: '林同学',
    score: 9.82,
    likes: 32,
    comments: 3,
    cover: 'linear-gradient(135deg,#e7a16d,#bd5b50)'
  },
  {
    id: 'p_cat',
    title: '它今天在食堂门口碰瓷，成功骗到两根火腿肠',
    author: '匿名同学·银杏',
    score: 8.41,
    likes: 21,
    comments: 0,
    cover: 'linear-gradient(135deg,#728d6a,#3f5b49)'
  },
  {
    id: 'p_food',
    title: '二食堂新出的麻辣拌，12 块',
    author: '小何',
    score: 7.96,
    likes: 18,
    comments: 1,
    cover: 'linear-gradient(135deg,#d3a45c,#9b5d32)'
  },
  {
    id: 'p_library',
    title: '在旧书区翻到一本 1998 年的《围城》',
    author: '林同学',
    score: 6.12,
    likes: 40,
    comments: 0,
    cover: 'linear-gradient(135deg,#b08d63,#6e4c36)'
  }
];

export const rankingConfig: RankingConfig = {
  likeWeight: 0.6,
  commentWeight: 0.3,
  favoriteWeight: 0.2,
  viewWeight: 0.3,
  coldStart: 3,
  coldDecayHours: 6,
  timeOffsetHours: 6,
  timeExponent: 1.2,
  windowDays: 7,
  snapshotSize: 100,
  maxPerAuthorTop20: 2
};
