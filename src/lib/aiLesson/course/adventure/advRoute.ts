// 個別攻略ルート生成（§5・§6・§7・§11）。
// 鉄則: 目的地は本人が選んだものを維持する（N2希望者をN3へ降格させない）。
// 基礎補強は「降格」ではなく「N2攻略のための短期補強」として言語化する（§5）。
// エリア割当は実コンテンツ整合を正とする（D-002・content-reuse-map.md）。
import type {
  AdvBand, AdvDiagnosisResult, AdvGoalType, AdvRoute, AdvRouteStage, AdvStageKind, JlptLevel,
} from './advTypes';
import { bandAtLeast, bandRank } from './advSkillProfile';
// 束IDの定数だけを取る（本文はdynamic import側にあるのでbundleは増えない）
import { N5_UNIT_IDS, N4_UNIT_IDS } from '../basicGrammarChunks';

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

const DESTINATION: Record<JlptLevel, { areaId: string; labelJa: string; labelZh: string }> = {
  // 2026-08-18: N5/N4 を目的地として追加（CEO指示）。
  // 目的地はその人が最初に到達する場所であって、上位レベルへの入口でもある
  N5: { areaId: 'area01-minato', labelJa: 'N5・ミナト（基礎の港）', labelZh: 'N5・ミナト｜雾之港城（基础）' },
  N4: { areaId: 'area03-toorimichi', labelJa: 'N4・トオリミチ（暮らしの道）', labelZh: 'N4・トオリミチ｜通行之路（生活）' },
  N3: { areaId: 'area07-katachi', labelJa: 'N3・カタチの遺跡', labelZh: 'N3・カタチの遺跡｜形之遗迹' },
  N2: { areaId: 'area08-sorano', labelJa: 'N2・ソラノ塔', labelZh: 'N2・ソラノ塔｜天空塔' },
  N1: { areaId: 'area08-sorano', labelJa: 'N1（未対応）', labelZh: 'N1（尚未支持）' },
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
const jlptStages = (target: JlptLevel, knowledge: AdvBand, d: AdvDiagnosisResult | null): AdvRouteStage[] => {
  const s: AdvRouteStage[] = [];
  const vocabGaps = d?.vocabularyGapIds ?? [];
  const grammarGaps = d?.grammarGapIds ?? [];
  // 未判定は安全側（基礎から）に倒す。§10 未判定を隠さない
  const kb = knowledge;

  /**
   * N5目標（2026-08-18）。基礎キャンプ → N5読解 → N5模試 で閉じる。
   * 上のレベルのstageは出さない: N5を目指す人にN3文法76項目を見せても、
   * 「まだ遠い」しか伝わらず、目的地に着いたことも分からない。
   */
  if (target === 'N5') {
    s.push(stage('stg-foundation', 'foundation_camp', 'area01-minato',
      '基礎キャンプ', '基础营地',
      // 項目数は basicGrammarChunks の N5_UNIT_IDS 実数と合わせること（2026-08-18の追加で48→62）
      'N5の文法62項目とことばを固める', '夯实62项N5语法和基础词汇',
      {
        n3UnitIds: [...AREA_UNIT_MAP['area01-minato'], ...AREA_UNIT_MAP['area02-hinode']],
        basicUnits: N5_UNIT_IDS, vocabularyIds: vocabGaps,
      }));
    s.push(stage('stg-n5reading', 'reading_listening', 'area01-minato',
      'N5の読みもの', 'N5阅读',
      '掲示・メモ・短いお知らせを読み取る', '读懂告示、便条和简短通知',
      { n3UnitIds: AREA_UNIT_MAP['area01-minato'] }));
    s.push(stage('stg-n5boss', 'mock_boss', 'area01-minato',
      'N5達成の確認', 'N5达成确认',
      'N5の範囲を通しで確かめる', '通盘确认N5范围',
      { basicUnits: N5_UNIT_IDS }));
    return s;
  }

  /** N4目標（2026-08-18）。基礎が要る人だけ基礎キャンプを挟み、N4文法 → N4読解 → 確認。 */
  if (target === 'N4') {
    if (kb === 'needs_assessment' || !bandAtLeast(kb, 'n4')) {
      s.push(stage('stg-foundation', 'foundation_camp', 'area01-minato',
        '基礎キャンプ', '基础营地',
        'N5の土台を先に固める', '先夯实N5的基础',
        {
          n3UnitIds: [...AREA_UNIT_MAP['area01-minato'], ...AREA_UNIT_MAP['area02-hinode']],
          basicUnits: N5_UNIT_IDS, vocabularyIds: vocabGaps,
        }));
    }
    s.push(stage('stg-n4grammar', 'n3_bridge', 'area03-toorimichi',
      'N4文法攻略', 'N4语法攻略',
      // 項目数は basicGrammarChunks の N4_UNIT_IDS 実数と合わせること（2026-08-18の追加で60→86）
      'て形・可能・条件・受身・敬語まで86項目', '从て形到敬语，共86项',
      {
        n3UnitIds: [...AREA_UNIT_MAP['area03-toorimichi'], ...AREA_UNIT_MAP['area04-ichiba']],
        basicUnits: N4_UNIT_IDS, vocabularyIds: vocabGaps,
      }));
    s.push(stage('stg-n4reading', 'reading_listening', 'area03-toorimichi',
      'N4の読みもの', 'N4阅读',
      '手紙・案内・説明文を読み取る', '读懂信件、通知和说明文',
      { n3UnitIds: AREA_UNIT_MAP['area03-toorimichi'] }));
    s.push(stage('stg-n4boss', 'mock_boss', 'area03-toorimichi',
      'N4達成の確認', 'N4达成确认',
      'N4の範囲を通しで確かめる', '通盘确认N4范围',
      { basicUnits: N4_UNIT_IDS }));
    return s;
  }

  const needFoundation = kb === 'needs_assessment' || !bandAtLeast(kb, 'n4_late');
  const needN3Bridge = kb === 'needs_assessment' || !bandAtLeast(kb, 'n3');
  const needN3Practice = kb === 'needs_assessment' || !bandAtLeast(kb, 'n3_late');

  if (needFoundation) {
    s.push(stage('stg-foundation', 'foundation_camp', 'area01-minato',
      '基礎キャンプ', '基础营地',
      '土台のことばと文を短期間で固める', '短期夯实基础词汇和句型',
      // 2026-08-17: N5文法6束を追加。これまでこのstageには文法targetが無く、
      // 基礎帯の学習者は「単元のことば」だけを延々とやることになっていた
      {
        n3UnitIds: [...AREA_UNIT_MAP['area01-minato'], ...AREA_UNIT_MAP['area02-hinode']],
        basicUnits: N5_UNIT_IDS, vocabularyIds: vocabGaps,
      }));
  }
  if (needN3Bridge) {
    s.push(stage('stg-n3bridge', 'n3_bridge', 'area03-toorimichi',
      'N3語彙・文法の橋', 'N3词汇语法之桥',
      'N3の核となる語彙と表現を渡る', '掌握N3核心词汇与表达',
      // 2026-08-17: N4文法8束を追加（て形・た形・可能・条件・受身・使役・敬語の土台）
      {
        n3UnitIds: [...AREA_UNIT_MAP['area03-toorimichi'], ...AREA_UNIT_MAP['area04-ichiba']],
        basicUnits: N4_UNIT_IDS, vocabularyIds: vocabGaps,
      }));
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

  // 2026-08-18: N5/N4 を解禁。以前は 'N3' 以外を全部 'N2' に丸めていたため、
  // N5を選んだ人にもソラノ塔（N2）までの8stageが出ていた
  const target: JlptLevel = targetJlpt ?? 'N2';
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

/**
 * stageごとの初級文法束（generateRoute が新規ルートへ入れているものと同一）。
 * kind では引けない（mock_boss は N5ボス＝N5束・N4ボス＝N4束・N3/N2ボス＝無し）ので stageId で持つ。
 * ここと jlptStages の basicUnits がズレたら advSavedRouteMigration.test.ts が落ちる。
 */
const BASIC_UNITS_BY_STAGE_ID: Record<string, readonly string[]> = {
  'stg-foundation': N5_UNIT_IDS,
  'stg-n5boss': N5_UNIT_IDS,
  'stg-n3bridge': N4_UNIT_IDS,
  'stg-n4grammar': N4_UNIT_IDS,
  'stg-n4boss': N4_UNIT_IDS,
};

/**
 * 保存済みルートの取り込み時補正（2026-08-18 P0）。
 *
 * ルートは**生成時のスナップショット**で jsonb に保存され、generateRoute は
 * 「冒険の準備」（AdvOnboarding）でしか走らない。つまり generateRoute の出力を変えても、
 * すでに冒険を始めている学習者のルートは**永久に古いまま**になる。
 *
 * 実害（実測・2026-08-17 のスナップショットで確認）:
 * 2026-08-17 に foundation_camp / n3_bridge へ初級文法（N5/N4）を足したが、
 * それ以前に準備を終えた学習者の stg-n3bridge は targets に basicUnits を持たないため、
 * stageContent の nextGrammarIds が **0件** のままになる。
 * 結果、ステージ名は「N3語彙・文法の橋」なのに文法が1項目も出ず、
 * 今日の冒険の学習stepが毎日まったく同じ `vocab_new[n3u-03-move]` で固定される
 * （実在の有料生徒1名が実際にこの状態だった）。
 *
 * ここでは**stage種別から決まる初級文法束だけ**を補う。ルート全体を作り直さないのは、
 * 生成し直すと診断帯が変わったときに stage 構成そのもの（＝本人が見てきた道のり）が
 * 入れ替わってしまうため。すでに basicUnits を持つルートには何もしない（冪等）。
 */
export const migrateSavedRoute = (route: AdvRoute): AdvRoute => {
  if (!Array.isArray(route?.stages)) return route;
  let changed = false;
  const stages = route.stages.map((s) => {
    const def = BASIC_UNITS_BY_STAGE_ID[s?.stageId];
    const cur = s?.targets?.basicUnits;
    if (!def || (Array.isArray(cur) && cur.length > 0)) return s;
    changed = true;
    return { ...s, targets: { ...(s.targets ?? {}), basicUnits: [...def] } };
  });
  return changed ? { ...route, stages } : route;
};

/**
 * 読解の証跡target（AdvShell の recordSkillResult が書くキーと同一）。
 * ここを変えたら AdvShell 側（`reading-${targetJlpt}`.toLowerCase()）も必ず変えること。
 */
export const readingEvidenceTargetId = (targetLevel: JlptLevel | null | undefined): string | null =>
  targetLevel ? `reading-${targetLevel.toLowerCase()}` : null;

/**
 * stageの配下コンテンツtarget（単元ID・文法束ID）。**出題プールのキーになるものだけ**を返す。
 * ボス戦の出題対象にも使うので、攻略済みかどうかでは絞らない。
 */
export const stageContentTargetIds = (
  stage: AdvRouteStage, allN3GrammarIds: string[], n2ByUnit: Map<number, string[]>,
  n3BundleByItem?: Map<string, string>, basicByUnit?: Map<string, string[]>,
  basicBundleByUnit?: Map<string, string>,
): string[] => {
  const ids: string[] = [...(stage.targets.n3UnitIds ?? [])];
  // 初級文法も束単位。問題数が足りない単元は合流するので、単元IDのまま数えると
  // 「存在しない束の攻略」を永久に待つstageができる。必ず束IDへ解決してから一意化する
  if (stage.targets.basicUnits) {
    const bundles = new Set(stage.targets.basicUnits.map((u) => basicBundleByUnit?.get(u) ?? u));
    for (const b of bundles) {
      if (!basicByUnit || (basicByUnit.get(b) ?? []).length > 0) ids.push(b);
    }
  }
  const gs = (stage.targets.n3GrammarIds && stage.targets.n3GrammarIds.length > 0)
    ? stage.targets.n3GrammarIds
    : (stage.kind === 'n3_grammar' ? allN3GrammarIds : []);
  // N3文法のmasteryは束（n3g-unit-*）単位（プール枯渇対策・P0-3）
  ids.push(...new Set(gs.map((g) => n3BundleByItem?.get(g) ?? g)));
  // N2文法も単元束（n2g-unit-*）単位（2026-08-15。項目単位178個では半年で完走不可能）。
  // n2ByUnit に実在する単元だけを束にする（存在するふりをしない）
  if (stage.targets.n2Units) {
    for (const u of stage.targets.n2Units) {
      if (n2ByUnit.size === 0 || (n2ByUnit.get(u) ?? []).length > 0) ids.push(`n2g-unit-${u}`);
    }
  }
  return ids;
};

/**
 * stage攻略判定に使うtarget一覧（stageContentのgrammar解決規則と同一に保つこと）。
 *
 * 【2026-08-18 P0】以前はどのstageも「配下コンテンツ」だけを見ていた。
 * ところが読解stage・ボスstage・N2の門は、配下コンテンツが**手前のstageと同じか部分集合**で、
 * 手前を終えた瞬間に攻略済みへ変わっていた。実測（自作シミュレータ・全stage攻略まで日次再現）:
 *   N5 = stg-n5reading / stg-n5boss、N4 = stg-n4reading / stg-n4boss、
 *   N3 = stg-n3boss、N2 = stg-n2gate / stg-n2reading / stg-n2boss
 * が **一度も現在地にならないまま100%** になり、N2目標では読解の練習が生涯1回だけで
 * 「N2模擬ボス」を一度も戦わずに攻略済みになっていた。
 * 画面には攻略条件「ランダム問題で80%以上を別の日に3回＋7日後の確認」と書いてあるのに、
 * その条件が**どこにも適用されていない**＝達成の確認が実体として存在しなかった。
 *
 * そこで、そのstage固有の証跡を要求する:
 *   ・mock_boss / n2_gate → そのstageのボス撃破記録（ledger[stageId]）
 *   ・reading_listening   → 読解の実績（reading-n5 等）
 * どちらも既存の導線（今日の冒険のボス戦step・読解step）で必ず供給できるものだけにしてある
 * （供給できない条件を課すと、いまより悪い行き止まりになる）。
 */
export const stageMasteryTargetIds = (
  stage: AdvRouteStage, allN3GrammarIds: string[], n2ByUnit: Map<number, string[]>,
  n3BundleByItem?: Map<string, string>, basicByUnit?: Map<string, string[]>,
  basicBundleByUnit?: Map<string, string>,
  /** 目的地レベル（読解の証跡targetを決める。未指定＝読解要件を課さない＝従来どおり） */
  targetLevel?: JlptLevel | null,
): string[] => {
  // ボス・門は「そのstageを実際に倒したか」だけで決まる。配下コンテンツは出題範囲であって攻略条件ではない
  if (stage.kind === 'mock_boss' || stage.kind === 'n2_gate') return [stage.stageId];
  const ids = stageContentTargetIds(stage, allN3GrammarIds, n2ByUnit, n3BundleByItem, basicByUnit, basicBundleByUnit);
  if (stage.kind === 'reading_listening') {
    const readingId = readingEvidenceTargetId(targetLevel);
    // 聴解は端末で音が鳴らないことがあり（AdvShellに audio-unavailable の出口がある）、
    // N5/N4には音源が1本も無いので攻略条件にはしない。要求するのは読解だけ
    if (readingId) ids.push(readingId);
  }
  return ids;
};

/** stage攻略の導出値。配下targetがすべてmasteredなら攻略。ボス撃破記録（ledger[stageId]がmastered）があればそれも攻略 */
export const deriveMasteredStageIds = (
  route: AdvRoute, masteredTargets: Set<string>,
  allN3GrammarIds: string[], n2ByUnit: Map<number, string[]>,
  n3BundleByItem?: Map<string, string>, basicByUnit?: Map<string, string[]>,
  basicBundleByUnit?: Map<string, string>,
): Set<string> => {
  const done = new Set<string>();
  for (const s of route.stages) {
    if (masteredTargets.has(s.stageId)) { done.add(s.stageId); continue; }
    const ids = stageMasteryTargetIds(
      s, allN3GrammarIds, n2ByUnit, n3BundleByItem, basicByUnit, basicBundleByUnit, route.destinationJlpt);
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
