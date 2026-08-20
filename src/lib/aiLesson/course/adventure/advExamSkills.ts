// JLPT試験科目モデル（JLPT ASSESSMENT INTEGRITY §5〜§7・§10）。
//
// 鉄則:
// - 学習者が「今どの試験科目を鍛えているか」を常に言えるようにする。
// - AI会話の成績を JLPT本試験の準備度へ直接加算しない（別軸 practical）。
// - 文法だけの結果から「総合準備度」を出さない（§9）。

/** 本試験のセクション（試験当日の区切り） */
export type ExamSection = 'languageKnowledge' | 'reading' | 'listening';

/** 本試験で測られる能力（準備度の行） */
export type ExamSkill =
  | 'charactersVocabulary'  // 文字・語彙
  | 'grammar'               // 文法
  | 'reading'               // 読解
  | 'listening'             // 聴解
  | 'timeManagement';       // 時間配分

export const EXAM_SKILLS: ExamSkill[] = [
  'charactersVocabulary', 'grammar', 'reading', 'listening', 'timeManagement',
];

/** 本試験の点数に足さない、実践・定着の別軸（§5） */
export type PracticalSkill = 'conversation' | 'practicalUsage' | 'correction' | 'retention';
export const PRACTICAL_SKILLS: PracticalSkill[] = ['conversation', 'practicalUsage', 'correction', 'retention'];

export const EXAM_SKILL_LABELS: Record<ExamSkill, { ja: string; zh: string }> = {
  charactersVocabulary: { ja: '文字・語彙', zh: '文字・词汇' },
  grammar: { ja: '文法', zh: '语法' },
  reading: { ja: '読解', zh: '阅读' },
  listening: { ja: '聴解', zh: '听力' },
  timeManagement: { ja: '時間配分', zh: '时间分配' },
};

export const EXAM_SECTION_LABELS: Record<ExamSection, { ja: string; zh: string }> = {
  languageKnowledge: { ja: '言語知識', zh: '语言知识' },
  reading: { ja: '読解', zh: '阅读' },
  listening: { ja: '聴解', zh: '听力' },
};

export const PRACTICAL_SKILL_LABELS: Record<PracticalSkill, { ja: string; zh: string }> = {
  conversation: { ja: '会話', zh: '会话' },
  practicalUsage: { ja: '実践で使う力', zh: '实际运用' },
  correction: { ja: '言い直し', zh: '改口修正' },
  retention: { ja: '定着', zh: '巩固' },
};

/** そのskillがどのセクションで問われるか */
export const SECTION_OF_SKILL: Record<ExamSkill, ExamSection> = {
  charactersVocabulary: 'languageKnowledge',
  grammar: 'languageKnowledge',
  reading: 'reading',
  listening: 'listening',
  timeManagement: 'reading', // 時間配分は主に読解セクションで顕在化する
};

export interface ExamPart {
  /** 試験当日の科目名（実際の受験票の区切り） */
  labelJa: string;
  labelZh: string;
  minutes: number;
  skills: ExamSkill[];
}

/** 実試験の構造（§6・§7）。表示は「今鍛えている科目」の裏づけに使う */
export const EXAM_STRUCTURE: Record<'N2' | 'N3' | 'N4' | 'N5', ExamPart[]> = {
  N2: [
    {
      labelJa: '言語知識（文字・語彙・文法）・読解', labelZh: '语言知识（文字・词汇・语法）・阅读',
      minutes: 105, skills: ['charactersVocabulary', 'grammar', 'reading', 'timeManagement'],
    },
    { labelJa: '聴解', labelZh: '听力', minutes: 50, skills: ['listening'] },
  ],
  N3: [
    { labelJa: '言語知識（文字・語彙）', labelZh: '语言知识（文字・词汇）', minutes: 30, skills: ['charactersVocabulary'] },
    {
      labelJa: '言語知識（文法）・読解', labelZh: '语言知识（语法）・阅读',
      minutes: 70, skills: ['grammar', 'reading', 'timeManagement'],
    },
    { labelJa: '聴解', labelZh: '听力', minutes: 40, skills: ['listening'] },
  ],
  // N4/N5 は2022年改定後の公式試験時間（advMock.EXAM_MINUTES と同じ値）
  N4: [
    { labelJa: '言語知識（文字・語彙）', labelZh: '语言知识（文字・词汇）', minutes: 25, skills: ['charactersVocabulary'] },
    {
      labelJa: '言語知識（文法）・読解', labelZh: '语言知识（语法）・阅读',
      minutes: 55, skills: ['grammar', 'reading', 'timeManagement'],
    },
    { labelJa: '聴解', labelZh: '听力', minutes: 35, skills: ['listening'] },
  ],
  N5: [
    { labelJa: '言語知識（文字・語彙）', labelZh: '语言知识（文字・词汇）', minutes: 20, skills: ['charactersVocabulary'] },
    {
      labelJa: '言語知識（文法）・読解', labelZh: '语言知识（语法）・阅读',
      minutes: 40, skills: ['grammar', 'reading', 'timeManagement'],
    },
    { labelJa: '聴解', labelZh: '听力', minutes: 30, skills: ['listening'] },
  ],
};

export type ExamStructureLevel = keyof typeof EXAM_STRUCTURE;

/**
 * その級の**本試験データ（科目構成・本番時間）を持っているか**（2026-08-18）。
 *
 * ここを `target === 'N3' ? 'N3' : 'N2'` と丸めると、N5/N4 目標の生徒の
 * 準備度画面に **N2の試験構成**（言語知識・読解105分／聴解50分）が出る。
 * 実測: computeReadiness('N5') の examParts が ["…105分","聴解/50分"] だった。
 * 持っていない級の時間を推測で書かない・上の級で代用しない（原則13）。
 *
 * 正準は EXAM_STRUCTURE のキーそのもの。級を増やすときはデータを足せば自動で追随する。
 */
export const hasExamStructure = (level: string | null | undefined): level is ExamStructureLevel =>
  level != null && Object.prototype.hasOwnProperty.call(EXAM_STRUCTURE, level);

/** 「今どの科目を鍛えているか」の1行表示（§8） */
export const nowTrainingLabel = (skill: ExamSkill, lang: 'ja' | 'zh'): string => {
  const section = EXAM_SECTION_LABELS[SECTION_OF_SKILL[skill]];
  const s = EXAM_SKILL_LABELS[skill];
  // 読解・聴解はセクション名と科目名が同じなので二重表示しない
  if (SECTION_OF_SKILL[skill] !== 'languageKnowledge') return lang === 'zh' ? s.zh : s.ja;
  return lang === 'zh' ? `${section.zh}｜${s.zh}` : `${section.ja}｜${s.ja}`;
};

/** 問題タイプ → 鍛えている試験科目（§10のタグ付けに使う） */
export const skillOfQuestionType = (type: string): ExamSkill => {
  if (type.startsWith('u-')) {
    // 単元問題の dimension。reading（読み）は文字・語彙の読み方であって読解ではない
    const dim = type.slice(2);
    if (dim === 'reading' || dim === 'core_meaning' || dim === 'collocation' || dim === 'scope_contrast'
      || dim === 'context' || dim === 'transfer_error') return 'charactersVocabulary';
    if (dim === 'conjugation') return 'grammar';
    return 'charactersVocabulary';
  }
  if (type === 'passage') return 'reading';
  return 'grammar'; // rec / cloze / meaning / form は文法
};

/** 準備度を「総合」と呼んでよいかの機械判定に使う最小要件（§5・§9） */
export const OVERALL_READINESS_REQUIREMENT = {
  /** 総合を出すのに必要な skill 数（時間配分を除く4技能すべて） */
  requiredSkills: ['charactersVocabulary', 'grammar', 'reading', 'listening'] as ExamSkill[],
  /** 各skillに必要な最低evidence（出題数） */
  minEvidencePerSkill: 20,
  /** 各skillに必要な最低「未出問題」数（暗記でない証拠） */
  minUnseenPerSkill: 10,
  /** 遅延（7日以降）に測り直した証拠が最低これだけ必要（COMPLETION §10） */
  minDelayedEvidence: 10,
  /**
   * 時間つきミニ模試の完了回数（COMPLETION §10）。
   * 1回の結果で総合準備度を名乗らない。
   */
  minMockCount: 3,
} as const;

/** バトル名に出すレベル表記（2026-08-19 N5/N4対応） */
export type ScopeLevel = 'N5' | 'N4' | 'N3' | 'N2';

/**
 * 出題対象IDから、名前に出すレベルを実測で決める（2026-08-19 CEO報告の修正）。
 * 以前は学習者の**目標**をN3以外すべてN2に丸めてラベルにしていたため、
 * N5目標の生徒の基礎文法バトルが「N2文法バトル」と表示されていた。
 * 名前は目標ではなく**いま戦っている中身**を言うべきなので、targetIdから引く
 */
export const scopeLevelOfTargets = (targetIds: string[], fallback: ScopeLevel): ScopeLevel => {
  for (const id of targetIds) {
    if (/^(n5g-|vocab-n5|kanji-n5|read-n5)/.test(id)) return 'N5';
    if (/^(n4g-|vocab-n4|kanji-n4|read-n4)/.test(id)) return 'N4';
    if (/^(n3g-|n3u-|vocab-n3|read-n3|listen-n3)/.test(id)) return 'N3';
    if (/^(n2g-|vocab-n2|read-n2|listen-n2)/.test(id)) return 'N2';
  }
  return fallback;
};

/** バトルの名前をscopeに合わせて決める（§5: 文法だけを「模擬ボス」と呼ばない） */
export const battleScopeName = (
  skills: ExamSkill[], level: ScopeLevel, lang: 'ja' | 'zh',
): string => {
  const uniq = [...new Set(skills)];
  const hasGrammar = uniq.includes('grammar');
  const hasVocab = uniq.includes('charactersVocabulary');
  const hasReading = uniq.includes('reading');
  const hasListening = uniq.includes('listening');
  if (hasReading && hasListening && hasGrammar && hasVocab) {
    return lang === 'zh' ? `${level}综合模拟考` : `${level}総合模試`;
  }
  if (hasGrammar && hasVocab) return lang === 'zh' ? `${level}知识战斗` : `${level}知識バトル`;
  if (hasGrammar) return lang === 'zh' ? `${level}语法战斗` : `${level}文法バトル`;
  if (hasVocab) return lang === 'zh' ? `${level}文字・词汇战斗` : `${level}文字・語彙バトル`;
  if (hasReading) return lang === 'zh' ? `${level}阅读战斗` : `${level}読解バトル`;
  return lang === 'zh' ? `${level}战斗` : `${level}バトル`;
};

/** 攻略率の対象名（§5: 文法だけなら「文法攻略率」） */
export const masteryScopeName = (skills: ExamSkill[], level: ScopeLevel, lang: 'ja' | 'zh'): string => {
  const uniq = [...new Set(skills)];
  if (uniq.length === 1 && uniq[0] === 'grammar') return lang === 'zh' ? `${level}语法攻略率` : `${level}文法攻略率`;
  if (uniq.length === 1 && uniq[0] === 'charactersVocabulary') return lang === 'zh' ? `${level}文字・词汇攻略率` : `${level}文字・語彙攻略率`;
  return lang === 'zh' ? `${level}攻略率` : `${level}攻略率`;
};
