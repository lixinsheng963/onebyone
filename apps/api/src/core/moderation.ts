import type { Risk } from '../types';

export interface ModerationResult {
  risk: Risk;
  labels: string[];
  evidence: string[];
  reason: string;
  needsHuman: boolean;
}

const patterns: Array<{ label: string; risk: Risk; reason: string; test: RegExp }> = [
  {
    label: 'violence',
    risk: 'P0',
    reason: '疑似暴力威胁或现实人身安全风险',
    test: /(杀了你|杀你|砍死|捅死|打死你|弄死你|要你命|报复你|让你消失|灭了你|血洗)/i
  },
  {
    label: 'self_harm',
    risk: 'P0',
    reason: '疑似自伤/自杀风险',
    test: /(自杀|不想活|结束生命|跳楼|割腕|轻生)/i
  },
  {
    label: 'privacy',
    risk: 'P1',
    reason: '疑似曝光联系方式或具体住址',
    test: /(1[3-9]\d{9}|微信|vx|VX|QQ|宿舍\s*\d{3}|身份证|学生证|校园卡)/i
  },
  {
    label: 'fraud',
    risk: 'P1',
    reason: '疑似交易、出售证件或诈骗',
    test: /(出售|收购|代办|代写|刷单|贷款|兼职|日结|加微|私聊|价格好商量)/i
  },
  {
    label: 'harassment',
    risk: 'P1',
    reason: '疑似人身攻击、挂人或威胁',
    test: /(傻逼|去死|恶心|滚出|人肉|挂人|曝光你|弄死|威胁)/i
  },
  {
    label: 'rumor',
    risk: 'P2',
    reason: '疑似未经证实的指控',
    test: /(听说|据说|疑似|爆料|内幕|实锤).{0,20}(偷|作弊|出轨|打人|贪污)/i
  },
  {
    label: 'ad',
    risk: 'P2',
    reason: '疑似广告或站外导流',
    test: /(扫码|二维码|链接|关注公众号|进群|加好友|优惠|折扣|招租)/i
  }
];

export function mergeModeration(rule: ModerationResult, ai: ModerationResult): ModerationResult {
  const rank: Record<Risk, number> = { P0: 4, P1: 3, P2: 2, P3: 1 };
  const risk = rank[ai.risk] > rank[rule.risk] ? ai.risk : rule.risk;
  return {
    risk,
    labels: Array.from(new Set([...rule.labels, ...ai.labels])),
    evidence: Array.from(new Set([...rule.evidence, ...ai.evidence])).slice(0, 5),
    reason: rank[ai.risk] >= rank[rule.risk] ? ai.reason : rule.reason,
    needsHuman: rule.needsHuman || ai.needsHuman || risk !== 'P3'
  };
}

export function moderateText(text: string): ModerationResult {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const labels: string[] = [];
  const evidence: string[] = [];
  let risk: Risk = 'P3';
  let reason = '未命中明显风险';

  const rank: Record<Risk, number> = { P0: 4, P1: 3, P2: 2, P3: 1 };

  for (const item of patterns) {
    if (item.test.test(normalized)) {
      labels.push(item.label);
      const match = normalized.match(item.test);
      if (match) evidence.push(match[0].slice(0, 24));
      if (rank[item.risk] > rank[risk]) {
        risk = item.risk;
        reason = item.reason;
      }
    }
  }

  return {
    risk,
    labels,
    evidence: Array.from(new Set(evidence)).slice(0, 3),
    reason,
    needsHuman: risk !== 'P3'
  };
}
