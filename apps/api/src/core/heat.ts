export interface HeatInput {
  likeCount: number;
  uniqueCommenters: number;
  favoriteCount: number;
  uniqueViewers: number;
  publishedAt: string;
}

export interface HeatConfig {
  likeWeight: number;
  commentWeight: number;
  favoriteWeight: number;
  viewWeight: number;
  coldStart: number;
  coldDecayHours: number;
  timeOffsetHours: number;
  timeExponent: number;
}

const defaultConfig: HeatConfig = {
  likeWeight: 0.6,
  commentWeight: 0.3,
  favoriteWeight: 0.2,
  viewWeight: 0.3,
  coldStart: 3,
  coldDecayHours: 6,
  timeOffsetHours: 6,
  timeExponent: 1.2
};

/**
 * 与文档 6.11 / 7.6 保持一致：
 * 0.6*L + 0.3*C + 0.2*F + 0.3*ln(1+V)，冷启动 3*exp(-h/6)，分母 (h+6)^1.2。
 */
export function computeHeat(input: HeatInput, now = Date.now(), config: HeatConfig = defaultConfig): number {
  const published = new Date(input.publishedAt).getTime();
  const ageHours = Math.max(0, (now - published) / 3_600_000);
  const engagement =
    config.likeWeight * input.likeCount +
    config.commentWeight * input.uniqueCommenters +
    config.favoriteWeight * input.favoriteCount +
    config.viewWeight * Math.log1p(Math.max(0, input.uniqueViewers));
  const coldStart = config.coldStart * Math.exp(-ageHours / config.coldDecayHours);
  const score = (engagement + coldStart) / Math.pow(ageHours + config.timeOffsetHours, config.timeExponent);
  return Math.round(score * 10000) / 10000;
}

export function heatLabel(score: number): string {
  if (score >= 8) return '很高';
  if (score >= 4) return '较高';
  if (score >= 1.5) return '一般';
  return '新内容';
}
