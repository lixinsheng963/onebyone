const PINYIN: Record<string, string> = {
  学: 'xue', 校: 'xiao', 图: 'tu', 书: 'shu', 馆: 'guan', 话: 'hua', 剧: 'ju', 社: 'she',
  团: 'tuan', 委: 'wei', 会: 'hui', 后: 'hou', 勤: 'qin', 体: 'ti', 育: 'yu', 部: 'bu',
  中: 'zhong', 心: 'xin', 生: 'sheng', 广: 'guang', 播: 'bo', 站: 'zhan', 青: 'qing',
  年: 'nian', 志: 'zhi', 愿: 'yuan', 者: 'zhe', 协: 'xie', 科: 'ke', 技: 'ji', 创: 'chuang',
  园: 'yuan', 摄: 'she', 影: 'ying', 美: 'mei', 音: 'yin', 乐: 'yue',
  新: 'xin', 艺: 'yi', 术: 'shu', 文: 'wen', 化: 'hua', 国: 'guo', 际: 'ji', 交: 'jiao',
  流: 'liu', 院: 'yuan', 系: 'xi', 班: 'ban', 级: 'ji', 食: 'shi', 堂: 'tang', 宿: 'su',
  舍: 'she', 档: 'dang', 案: 'an', 保: 'bao', 卫: 'wei', 医: 'yi', 检: 'jian', 就: 'jiu',
  业: 'ye', 指: 'zhi', 导: 'dao', 理: 'li', 健: 'jian', 康: 'kang', 教: 'jiao', 务: 'wu'
};

export function suggestOrgId(name: string): string {
  const normalized = name.trim();
  if (!normalized) return '';
  let slug = '';
  for (const char of normalized) {
    if (/[a-zA-Z0-9]/.test(char)) slug += char.toLowerCase();
    else if (PINYIN[char]) slug += PINYIN[char];
    else if (/[\u4e00-\u9fa5]/.test(char)) slug += `u${char.codePointAt(0)!.toString(36)}`;
  }
  slug = slug.slice(0, 24) || 'campus';
  return `org_${slug}`;
}
