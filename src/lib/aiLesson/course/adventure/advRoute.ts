// 個別攻略ルート生成（§5・§6・§7・§11）。
// 鉄則: 目的地は本人が選んだものを維持する（N2希望者をN3へ降格させない）。
// 基礎補強は「降格」ではなく「N2攻略のための短期補強」として言語化する（§5）。
// エリア割当は実コンテンツ整合を正とする（D-002・content-reuse-map.md）。
import type {
  AdvBand, AdvDiagnosisResult, AdvGoalType, AdvRoute, AdvRouteStage, AdvStageKind, JlptLevel,
} from './advTypes';
import { bandAtLeast, bandRank } from './advSkillProfile';

/** エリア → 実コンテンツ（worldAtlas実データと同期。ズレはガードテストで検知） */
export const AREA_UNIT_MAP: Record<string, string[]> = {
  'area01-minato': ['n3u-01-self'],
  'area02-hinode': ['n3u-02-daily', 'n3u-05-adjpair'],
  'area03-toorimichi': ['n3u-03-move'],
  'area04-ichiba': ['n3u-04-things'],
  'area05-yukari': ['n3u-06-feeling', 'n3u-07-people'],
  'area06-hataraki': ['n3u-09-think', 'n3u-10-arrange'],
  'area07-katachi': ['n3u-08-change', 'n3u-11-situation', 'n3u-12-adverb'],
};

const DESTINATION: Record<'N3' | 'N2', { areaId: string; labelJa: string; labelZh: string }> = {
  N3: { areaId: 'area07-katachi', labelJa: 'N3・カタチの遺跡', labelZh: 'N3・カタチの遺跡｜形之遗迹' },
  N2: { areaId: 'area08-sorano', labelJa: 'N2・ソラノ塔', labelZh: 'N2・ソラノ塔｜天空塔' },
};

/** 会話開始地点（§6）。「あなたはN3」と断定せず「開始地点はこのエリア」と言うための対応表 */
export const conversationStartArea = (band: AdvBand): { areaId: string; labelJa: string; labelZh: string } => {
  if (band === 'needs_assessment' || !bandAtLeast(band, 'n4')) {
    return { areaId: 'area01-minato', labelJa: 'ミナト（基礎の港）', labelZh: 'ミナト｜雾之港城（基础）' };
  }
  if (!bandAtLeast(band, 'n3_early')) {
    return { areaId: 'area02-hinode', labelJa: 'ヒノデ台（暮らしの会話）', labelZh: 'ヒノデ台｜日出台（生活会话）' };
  }
  if (!bandAtLeast(band, 'n3_late')) {
    return { areaId: 'area05-yukari', labelJa: 'ユカリの森（N3エリア）', labelZh: 'ユカリの森｜羁绊之森（N3区域）' };
  }
  if (!bandAtLeast(band, 'n2')) {
    return { areaId: 'area06-hataraki', labelJa: 'ハタラキ街（仕事の会話）', labelZh: 'ハタラキ街｜工作之街（职场会话）' };
  }
  return { areaId: 'area09-katari', labelJa: 'カタリ港（実戦会話）', labelZh: 'カタリ港｜叙语港（实战会话）' };
};

const CLEAR_80: { ja: string; zh: string } = {
  ja: 'ランダム問題で80%以上を別の日に3回＋7日後の確認',
  zh: '随机题80%以上×3天（不同日）＋7天后的复查',
};

const stage = (
  stageId: string, kind: AdvStageKind, areaId: string,
  titleJa: string, titleZh: string, purposeJa: string, purposeZh: string,
  targets: AdvRouteStage['targets'],
): AdvRouteStage => ({
  stageId, kind, areaId, titleJa, titleZh, purposeJa, purposeZh, targets,
  clearConditionJa: CLEAR_80.ja, clearConditionZh: CLEAR_80.zh,
});

/** JLPT系のstage列を組む（現在地に応じて経由地を足す。目的地は落とさない） */
const jlptStages = (target: 'N3' | 'N2', knowledge: AdvBand, d: AdvDiagnosisResult | null): AdvRouteStage[] => {
  const s: AdvRouteStage[] = [];
  const vocabGaps = d?.vocabularyGapIds ?? [];
  const grammarGaps = d?.grammarGapIds ?? [];
  // 未判定は安全側（基礎から）に倒す。§10 未判定を隠さない
  const kb = knowledge;

  const needFoundation = kb === 'needs_assessment' || !bandAtLeast(kb, 'n4_late');
  const needN3Bridge = kb === 'needs_assessment' || !bandAtLeast(kb, 'n3');
  const needN3Practice = kb === 'needs_assessment' || !bandAtLeast(kb, 'n3_late');

  if (needFoundation) {
    s.push(stage('stg-foundation', 'foundation_camp', 'area01-minato',
      '基礎キャンプ', '基础营地',
      '土台のことばと文を短期間で固める', '短期夯实基础词汇和句型',
      { n3UnitIds: [...AREA_UNIT_MAP['area01-minato'], ...AREA_UNIT_MAP['area02-hinode']], vocabularyIds: vocabGaps }));
  }
  if (needN3Bridge) {
    s.push(stage('stg-n3bridge', 'n3_bridge', 'area03-toorimichi',
      'N3語彙・文法の橋', 'N3词汇语法之桥',
      'N3の核となる語彙と表現を渡る', '掌握N3核心词汇与表达',
      { n3UnitIds: [...AREA_UNIT_MAP['area03-toorimichi'], ...AREA_UNIT_MAP['area04-ichiba']], vocabularyIds: vocabGaps }));
  }
  if (needN3Practice) {
    s.push(stage('stg-n3practice', 'n3_practice', 'area05-yukari',
      'N3実践ミッション', 'N3实战任务',
      '感情・人間関係・仕事の場面でN3を使う', '在情感・人际・工作场景中运用N3',
      { n3UnitIds: [...AREA_UNIT_MAP['area05-yukari'], ...AREA_UNIT_MAP['area06-hataraki']] }));
  }
  // N3文法はN3目標の本丸／N2目標でも経由地
  s.push(stage('stg-n3grammar', 'n3_grammar', 'area07-katachi',
    'N3文法攻略', 'N3语法攻略',
    'N3文法76項目を体系的に攻略する', '系统攻克76项N3语法',
    { n3UnitIds: AREA_UNIT_MAP['area07-katachi'], n3GrammarIds: grammarGaps.length > 0 ? grammarGaps : undefined }));

  if (target === 'N3') {
    s.push(stage('stg-n3boss', 'mock_boss', 'area07-katachi',
      'N3模擬ボス', 'N3模拟Boss',
      '本番形式・時間配分つきの総合演習', '完整模拟考・练习时间分配',
      { n3UnitIds: Object.values(AREA_UNIT_MAP).flat() }));
    return s;
  }
  // N2目標
  s.push(stage('stg-n2gate', 'n2_gate', 'area07-katachi',
    'N2の門', 'N2之门',
    'N3の総仕上げ（中ボス）を越えてN2圏へ', '通过N3中Boss・进入N2圈',
    { n3UnitIds: AREA_UNIT_MAP['area07-katachi'] }));
  s.push(stage('stg-n2grammar', 'n2_grammar', 'area08-sorano',
    'N2語彙・文法', 'N2词汇语法',
    'ソラノ塔でN2文法178項目を攻略する', '在天空塔攻克178项N2语法',
    { n2Units: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }));
  s.push(stage('stg-n2reading', 'reading_listening', 'area08-sorano',
    '読解・会話理解', '阅读・会话理解',
    '長めの文と会話の流れを時間内に読み取る', '限时读懂长句与会话',
    { n2Units: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }));
  s.push(stage('stg-n2boss', 'mock_boss', 'area08-sorano',
    'N2模擬ボス', 'N2模拟Boss',
    '本番形式・時間配分つきの総合演習', '完整模拟考・练习时间分配',
    { n2Units: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }));
  return s;
};

/** 会話系のstage列（§6）。試験問題を大量に出さない */
const conversationStages = (convBand: AdvBand, d: AdvDiagnosisResult | null): AdvRouteStage[] => {
  const start = conversationStartArea(convBand);
  const vocabGaps = d?.vocabularyGapIds ?? [];
  return [
    stage('stg-conv-start', 'conversation_start', start.areaId,
      `会話の開始地点：${start.labelJa}`, `会话出发点：${start.labelZh}`,
      'いま一番よく使う場面から話し始める', '从最常用的场景开始开口',
      { conversationThemeIds: [start.areaId], vocabularyIds: vocabGaps }),
    stage('stg-conv-growth', 'conversation_growth', 'area09-katari',
      '会話力の成長', '会话能力成长',
      '理由説明・言い直し・聞き返しを実戦で伸ばす', '在实战中提升说明理由・改口・听不懂再问的能力',
      { conversationThemeIds: ['area09-katari'] }),
  ];
};

export interface GenerateRouteInput {
  goalType: AdvGoalType;
  targetJlpt: JlptLevel | null;
  knowledgeBand: AdvBand;
  conversationBand: AdvBand;
  diagnosis: AdvDiagnosisResult | null;
  nowISO: string;
}

/**
 * ルート生成の本体。
 * - jlpt: 目的地=選択レベル（N3/N2のみ有効）。現在地が低くても目的地を変えない
 * - conversation: 目的地=会話成長。開始地点は診断の会話帯から
 * - hybrid: jlpt列＋会話stageを合流
 */
export const generateRoute = (input: GenerateRouteInput): AdvRoute => {
  const { goalType, targetJlpt, knowledgeBand, conversationBand, diagnosis, nowISO } = input;

  if (goalType === 'conversation') {
    const start = conversationStartArea(conversationBand);
    return {
      generatedAt: nowISO,
      destinationJlpt: null,
      destinationAreaId: 'area09-katari',
      destinationLabelJa: '会話の実戦・カタリ港', destinationLabelZh: '实战会话・カタリ港｜叙语港',
      stages: conversationStages(conversationBand, diagnosis),
      explanationJa: `知識を否定せず、いま話せる場面を増やします。会話の開始地点は${start.labelJa}です。`,
      explanationZh: `不否定你的知识储备，从能马上开口的场景练起。会话出发点是${start.labelZh}。`,
    };
  }

  const target: 'N3' | 'N2' = targetJlpt === 'N3' ? 'N3' : 'N2';
  const dest = DESTINATION[target];
  const stages = jlptStages(target, knowledgeBand, diagnosis);
  const hasFoundationDetour = stages.some((st) => st.kind === 'foundation_camp' || st.kind === 'n3_bridge');

  // §5: 「N3へ戻された」と感じさせない説明文。目標名を主語にする
  const explanationJa = target === 'N2' && hasFoundationDetour
    ? 'N2を攻略するために、まず不足しているN3基礎を短期間で補強します。目的地はN2のまま変わりません。'
    : target === 'N3' && hasFoundationDetour
      ? 'N3を攻略するために、まず土台のことばを短期間で固めます。目的地はN3のまま変わりません。'
      : `${target}の攻略に直行できる状態です。弱点から順に攻略します。`;
  const explanationZh = target === 'N2' && hasFoundationDetour
    ? '为了攻略N2，先集中补足目前缺少的N3基础。目的地仍然是N2，不会改变。'
    : target === 'N3' && hasFoundationDetour
      ? '为了攻略N3，先短期夯实基础。目的地仍然是N3，不会改变。'
      : `可以直接进入${target}攻略。按弱点顺序推进。`;

  const base: AdvRoute = {
    generatedAt: nowISO,
    destinationJlpt: target,
    destinationAreaId: dest.areaId,
    destinationLabelJa: dest.labelJa, destinationLabelZh: dest.labelZh,
    stages,
    explanationJa, explanationZh,
  };

  if (goalType === 'hybrid') {
    // 会話stageを2番目に合流（毎日のクエストで比率調整する・§7）
    const conv = conversationStages(conversationBand, diagnosis);
    const merged = [...stages];
    merged.splice(Math.min(1, merged.length), 0, conv[0]);
    return {
      ...base,
      stages: merged,
      explanationJa: `${explanationJa} あわせて、会話ミッションを毎日の冒険に組み込みます。`,
      explanationZh: `${explanationZh} 同时，把会话任务编入每天的冒险。`,
    };
  }
  return base;
};

/** stage攻略判定に使う配下target一覧（stageContentのgrammar解決規則と同一に保つこと） */
export const stageMasteryTargetIds = (
  stage: AdvRouteStage, allN3GrammarIds: string[], n2ByUnit: Map<number, string[]>,
  n3BundleByItem?: Map<string, string>,
): string[] => {
  const ids: string[] = [...(stage.targets.n3UnitIds ?? [])];
  const gs = (stage.targets.n3GrammarIds && stage.targets.n3GrammarIds.length > 0)
    ? stage.targets.n3GrammarIds
    : (stage.kind === 'n3_grammar' ? allN3GrammarIds : []);
  // N3文法のmasteryは束（n3g-unit-*）単位（プール枯渇対策・P0-3）
  ids.push(...new Set(gs.map((g) => n3BundleByItem?.get(g) ?? g)));
  if (stage.targets.n2Units) for (const u of stage.targets.n2Units) ids.push(...(n2ByUnit.get(u) ?? []));
  return ids;
};

/** stage攻略の導出値。配下targetがすべてmasteredなら攻略。ボス撃破記録（ledger[stageId]がmastered）があればそれも攻略 */
export const deriveMasteredStageIds = (
  route: AdvRoute, masteredTargets: Set<string>,
  allN3GrammarIds: string[], n2ByUnit: Map<number, string[]>,
  n3BundleByItem?: Map<string, string>,
): Set<string> => {
  const done = new Set<string>();
  for (const s of route.stages) {
    if (masteredTargets.has(s.stageId)) { done.add(s.stageId); continue; }
    const ids = stageMasteryTargetIds(s, allN3GrammarIds, n2ByUnit, n3BundleByItem);
    if (ids.length > 0 && ids.every((id) => masteredTargets.has(id))) done.add(s.stageId);
  }
  return done;
};

/** 会話stage（出題プールを持たず80%攻略条件を満たせない並走レーン）か */
export const isConversationStage = (s: AdvRouteStage): boolean =>
  s.kind === 'conversation_start' || s.kind === 'conversation_growth';

/**
 * 現在地stage（最初の未攻略stage）。masteredStageIds は mastery台帳から算出して渡す。
 * 会話stageは出題プールが無く「別日3回80%＋7日後確認」を満たせないため、
 * 未攻略のJLPT系stageが残っている間は現在地としてブロックしない
 * （hybridが stg-conv-start で恒久停止する不具合の修正）。
 * 会話のみのルートは全stageが会話系なのでフォールバックで従来どおり先頭が現在地になる。
 */
export const currentStageOf = (route: AdvRoute, masteredStageIds: Set<string>): AdvRouteStage | null => {
  const unmastered = route.stages.filter((s) => !masteredStageIds.has(s.stageId));
  return unmastered.find((s) => !isConversationStage(s)) ?? unmastered[0] ?? null;
};

/** 攻略率（stage単純比。会話stageは攻略判定が無いので母数から除く。詳細はmastery側で技能別に出す） */
export const routeProgressPct = (route: AdvRoute, masteredStageIds: Set<string>): number => {
  const gated = route.stages.filter((s) => !isConversationStage(s));
  const base = gated.length > 0 ? gated : route.stages;
  return base.length === 0 ? 0
    : Math.round((base.filter((s) => masteredStageIds.has(s.stageId)).length / base.length) * 100);
};

/** 帯が目的地に対してどれくらい手前か（0=到達圏）。UI文言選択に使う */
export const gapToTarget = (knowledge: AdvBand, target: 'N3' | 'N2'): number => {
  const goal = target === 'N3' ? bandRank('n3_late') : bandRank('n2');
  const cur = bandRank(knowledge);
  if (cur < 0) return goal; // 未判定は最大ギャップ扱い（安全側）
  return Math.max(0, goal - cur);
};
