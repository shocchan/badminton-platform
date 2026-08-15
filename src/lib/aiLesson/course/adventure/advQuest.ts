// 今日の冒険の生成（§13）。第一CTAは常に一つ。
// 優先順位: ①期限切れ/当日復習 ②最大の弱点 ③試験日残 ④未習得の目標教材 ⑤会話転用 ⑥多様性 ⑦前日重複回避。
// 生成結果は必ず why / 所要 / 対象能力 / 対象表現 / 成功条件 / 次の一歩 を持つ。
import type {
  AdvGoalType, AdvQuestStep, AdvRoute, AdvRouteStage, AdvSkill, AdvTodayQuest, AdventureV2Profile,
} from './advTypes';
import { seededShuffle } from './advDiagnosis';
import { currentStageOf } from './advRoute';
import { masteredStageIds } from './advMastery';

export interface QuestContentAvailability {
  /** stage内で未攻略のgrammarId（学習順） */
  nextGrammarIds: string[];
  /** stage内で未攻略のunitId */
  nextUnitIds: string[];
  /** 今日の対象にできる会話テーマ（targetUse表現つき） */
  conversationTargets: { refId: string; expression: string; themeJa: string; themeZh: string }[];
  /** grammarId → mastery束ID（N3はn3g-unit-*）。無指定時は項目IDのまま */
  grammarBundleByItem?: Map<string, string>;
  /**
   * 7日後の確認が解禁されたtarget（2026-08-15 進度改善）。
   * 攻略を確定させる一手なので、今日のバトル枠を最優先で確認バトルにする
   */
  confirmTargetIds?: string[];
}

export interface GenerateQuestInput {
  profile: AdventureV2Profile;
  route: AdvRoute;
  dueReviewCount: number;
  weakGrammarIds: string[];
  dateKey: string;
  nowISO: string;
  availability: QuestContentAvailability;
  /** 試験日までの残日数（examDate未設定は null） */
  daysToExam: number | null;
  /** stage攻略の導出値（deriveMasteredStageIds）。未指定時は従来のledger[stageId]判定 */
  masteredStageIds?: Set<string>;
  /**
   * 学習コンテンツの供給元stage（pickContentStage。2026-08-15 進度改善）。
   * 現在stageが全て7日待ちのとき、先のstageを前倒しで学ぶために現在地と分離した。
   * 未指定時は従来どおり currentStageOf の結果を使う
   */
  contentStage?: AdvRouteStage;
  /**
   * 試験技能の状況（COMPLETION §12）。読解・聴解を毎日必ず入れるのではなく、
   * 弱点・試験日・直近履歴から配分するために使う。
   */
  examSkills?: {
    /** いま最も弱い試験科目（evidenceがある中で最低スコア。無ければnull） */
    weakestSkill: 'charactersVocabulary' | 'grammar' | 'reading' | 'listening' | 'timeManagement' | null;
    /** 各技能のevidence数（0なら「まだ触れていない」＝優先度が上がる） */
    readingEvidence: number;
    listeningEvidence: number;
    /** 出題可能な読解・聴解の対象ID（空なら出題しない＝存在するふりをしない） */
    readingTargetIds: string[];
    listeningTargetIds: string[];
  };
}

const est = (kind: AdvQuestStep['kind']): number =>
  kind === 'review_due' ? 3
  : kind === 'weak_reinforce' ? 4
  : kind === 'grammar_new' ? 5
  : kind === 'vocab_new' ? 4
  : kind === 'battle' ? 6
  : kind === 'reading_short' ? 5
  : kind === 'listening_practice' ? 5
  : kind === 'conversation_mission' ? 4
  : 2; // restate

const step = (
  kind: AdvQuestStep['kind'], refIds: string[], titleJa: string, titleZh: string,
  tier?: AdvQuestStep['tier'],
): AdvQuestStep => ({ kind, refIds, titleJa, titleZh, estMinutes: est(kind), tier });

/** stageに応じた新規学習ステップ（±会話転用） */
const stageSteps = (
  stage: AdvRouteStage, avail: QuestContentAvailability, seed: number, dateKey: string,
): { learn: AdvQuestStep | null; battle: AdvQuestStep | null; conv: AdvQuestStep | null; expressions: string[] } => {
  // 文法束の学習は「いま攻略中の束」の中を日替わりで巡回する（2026-08-15 進度改善）。
  // 旧実装は常に先頭を選んでいたため、前日回避と合わさって先頭2項目のping-pongになり、
  // 束の3項目目以降が一度もlearnに出ないままバトルで80%を要求されていた
  const bundleOf = (x: string): string => avail.grammarBundleByItem?.get(x) ?? x;
  const activeBundle = avail.nextGrammarIds.length > 0 ? bundleOf(avail.nextGrammarIds[0]) : null;
  const bundleItems = activeBundle === null ? []
    : avail.nextGrammarIds.filter((x) => bundleOf(x) === activeBundle);
  const dayNum = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
  const g = bundleItems.length > 0 ? bundleItems[dayNum % bundleItems.length] : avail.nextGrammarIds[0];
  const u = avail.nextUnitIds[0];
  const convPick = seededShuffle(avail.conversationTargets, seed)[0] ?? null;
  const isConvStage = stage.kind === 'conversation_start' || stage.kind === 'conversation_growth';

  if (isConvStage) {
    return {
      learn: convPick ? step('vocab_new', [convPick.refId], `表現の準備：${convPick.expression}`, `准备表达：${convPick.expression}`) : null,
      battle: null,
      conv: convPick
        ? step('conversation_mission', [convPick.refId], `AI会話：${convPick.themeJa}`, `AI会话：${convPick.themeZh}`)
        : step('conversation_mission', [stage.areaId], 'AI会話ミッション', 'AI会话任务'),
      expressions: convPick ? [convPick.expression] : [],
    };
  }
  const learn = g
    ? step('grammar_new', [g], '新しい文法を学ぶ', '学习新语法')
    : u ? step('vocab_new', [u], '単元のことばを学ぶ', '学习单元词汇') : null;
  const battleRef = g ? (avail.grammarBundleByItem?.get(g) ?? g) : (u ?? stage.stageId);
  return {
    learn,
    battle: step('battle', [battleRef], '問題バトル', '问题战斗', 'normal'),
    // 起動する会話は既存runtimeの今週ミッション（今日の文法をテーマにする接続は未実装）。
    // 「今日の文法を会話で使う」と掲げると実体と食い違うため、誇張しない題名にする（原則13）。
    // targetExpressions は言い直しstepが実際に使うので expressions はそのまま残す
    conv: convPick
      ? step('conversation_mission', [convPick.refId, ...(g ? [g] : [])], 'AI会話ミッション', 'AI会话任务')
      : null,
    expressions: convPick ? [convPick.expression] : [],
  };
};

/**
 * 今日の冒険を生成する（決定的: dateKey+profileでseed固定）。
 * dailyMinutes 5/15/30 で構成が変わる（§13の時間別テンプレに準拠しつつ固定メニュー化を避ける）。
 */
export const generateTodayQuest = (input: GenerateQuestInput): AdvTodayQuest => {
  const { profile, route, dueReviewCount, weakGrammarIds, dateKey, availability, daysToExam } = input;
  const minutes = profile.dailyMinutes ?? 15;
  const goalType: AdvGoalType = profile.goalType ?? 'jlpt';
  const seed = [...`${dateKey}:${profile.targetJlpt ?? goalType}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

  const done = input.masteredStageIds
    ?? masteredStageIds(profile.mastery, route.stages.map((s) => s.stageId), input.nowISO);
  const stage = input.contentStage
    ?? currentStageOf(route, done) ?? route.stages[route.stages.length - 1];
  const parts = stageSteps(stage, availability, seed, dateKey);

  // 7日後の確認が解禁されたtargetがあれば、今日のバトルは確認バトルにする（攻略を確定させる一手が最優先）
  const confirmTarget = (availability.confirmTargetIds ?? [])[0];
  if (confirmTarget && stage.kind !== 'conversation_start' && stage.kind !== 'conversation_growth') {
    parts.battle = step('battle', [confirmTarget],
      '確認バトル（時間をおいた定着チェック）', '复查战（隔段时间的巩固检查）', 'normal');
  }
  // hybrid: 基礎キャンプ等のstageは文法draftを持たず conversationTargets が空になり、
  // ルート提示文「会話ミッションを毎日の冒険に組み込みます」が守れない（原則16）。
  // 会話stageと同じエリアfallbackで会話ミッションを必ず入れる
  if (goalType === 'hybrid' && !parts.conv) {
    parts.conv = step('conversation_mission', [stage.areaId], 'AI会話ミッション', 'AI会话任务');
  }

  // 前日と同じ主対象の回避（§13⑦）は stageSteps の束内日替わり巡回が担う
  // （旧実装の「先頭以外へ差し替え」は先頭2項目のping-pongを生み、束の3項目目以降が
  //  一度もlearnに出ないバグの原因だった・2026-08-15 進度改善）

  const steps: AdvQuestStep[] = [];
  const push = (s: AdvQuestStep | null | undefined) => { if (s) steps.push(s); };

  // ── 試験技能（読解・聴解）の配分（COMPLETION §12） ──
  // 毎日必ず入れるのではなく「未着手 > 最弱 > 試験が近い」の順で必要なときだけ入れる。
  // 出題対象が無い場合は絶対に入れない（存在するふりをしない）。
  const ex = input.examSkills;
  const examCandidates = (): AdvQuestStep[] => {
    if (!ex || goalType === 'conversation') return [];
    // 基礎固め中（基礎キャンプ・N3橋）はN3読解・聴解を出さない。
    // 診断で基礎不足と測った直後にN3長文を毎日出すのは「現在地はAIが測る」（canon§1）への裏切りになる
    if (stage.kind === 'foundation_camp' || stage.kind === 'n3_bridge') return [];
    const out: AdvQuestStep[] = [];
    const readingAvailable = ex.readingTargetIds.length > 0;
    const listeningAvailable = ex.listeningTargetIds.length > 0;
    const readingNeeded = readingAvailable
      && (ex.readingEvidence === 0 || ex.weakestSkill === 'reading' || (daysToExam !== null && daysToExam < 60));
    const listeningNeeded = listeningAvailable
      && (ex.listeningEvidence === 0 || ex.weakestSkill === 'listening' || (daysToExam !== null && daysToExam < 60));
    // 未着手のほうを先に。両方未着手なら曜日で交互にして偏らせない
    const alternate = Number(dateKey.slice(-2)) % 2 === 0;
    const readingStep = step('reading_short', ex.readingTargetIds.slice(0, 1), '短文読解', '短文阅读');
    const listeningStep = step('listening_practice', ex.listeningTargetIds.slice(0, 1), '聴解トレーニング', '听力训练');
    if (readingNeeded && listeningNeeded) out.push(alternate ? readingStep : listeningStep);
    else if (readingNeeded) out.push(readingStep);
    else if (listeningNeeded) out.push(listeningStep);
    return out;
  };
  const examStep = examCandidates()[0] ?? null;
  const examSkillStep = (): AdvQuestStep | null => examStep;
  // 試験技能のevidenceが全く無い、または最弱が読解・聴解なら文法より優先する
  const shouldPrioritizeExamSkill = (): boolean => {
    if (!ex) return false;
    if (ex.readingEvidence === 0 || ex.listeningEvidence === 0) return true;
    return ex.weakestSkill === 'reading' || ex.weakestSkill === 'listening';
  };

  // ① 復習は常に先頭（期限切れ/当日分がある場合）
  if (dueReviewCount > 0) push(step('review_due', [], `復習 ${Math.min(dueReviewCount, 9)}件`, `复习 ${Math.min(dueReviewCount, 9)}项`));

  // 言い直しは素材がある日だけ入れる（基礎キャンプ等、文法誤答も会話表現も無い日は空stepになるため）
  const restateAvailable = weakGrammarIds.length > 0 || parts.expressions.length > 0;

  if (minutes === 5) {
    // 5分: 復習＋弱点1つ or 新規のどちらか＋ミニ会話（会話goalのみ）。
    // バトルが一度も出ないと攻略（mastery）が永久に進まないため、奇数日はバトルを入れる
    const battleDay = Number(dateKey.slice(-2)) % 2 === 1;
    if (battleDay && parts.battle) push(parts.battle);
    else if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 1), '弱点を1つつぶす', '攻克1个弱点'));
    else push(parts.learn);
    if (goalType !== 'jlpt') push(parts.conv);
  } else if (minutes === 15) {
    if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 2), '弱点補強', '弱点补强'));
    push(parts.learn);
    // 15分では文法と試験技能のどちらかを入れる（両方入れると時間超過する）。
    // ただし語彙・文法のevidenceはバトルからしか入らないため、試験技能を常に優先すると
    // 「バトルが出ない→語彙/文法が未測定→読解/聴解が常に最弱→バトル永久排除」の循環が確定する。
    // 試験技能は奇数日に限定し、バトルを少なくとも隔日で必ず回す。
    const examDay = Number(dateKey.slice(-2)) % 2 === 1;
    if (examDay && examSkillStep() && shouldPrioritizeExamSkill()) push(examSkillStep());
    else push(parts.battle);
    if (goalType !== 'jlpt' || parts.expressions.length > 0) push(parts.conv);
    if (restateAvailable) push(step('restate', [], '言い直し', '改口练习'));
  } else {
    if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 3), '弱点補強', '弱点补强'));
    push(parts.learn);
    push(parts.battle);
    push(examSkillStep());
    push(parts.conv);
    if (restateAvailable) push(step('restate', [], '言い直し', '改口练习'));
  }

  // 空クエスト防止: 最低1ステップ（コンテンツ枯渇時は復習/会話へ）
  if (steps.length === 0) push(step('conversation_mission', [stage.areaId], 'AI会話ミッション', 'AI会话任务'));

  const estimatedMinutes = steps.reduce((n, s) => n + s.estMinutes, 0);
  // 成功条件は実際に計測できることだけを言う（会話中の「表現使用」は判定していない・原則13）
  const hasConv = steps.some((s) => s.kind === 'conversation_mission');
  const targetSkills: AdvSkill[] = stage.kind === 'conversation_start' || stage.kind === 'conversation_growth'
    ? ['conversation', 'vocabulary']
    : goalType === 'hybrid' ? ['grammar', 'conversation'] : ['grammar', 'vocabulary'];

  const why = buildWhy(goalType, stage, dueReviewCount, weakGrammarIds.length, daysToExam);

  return {
    questId: `quest-${dateKey}`,
    dateKey,
    goalType,
    primaryTargets: [...new Set(steps.flatMap((s) => s.refIds))].slice(0, 4),
    steps,
    whyJa: why.ja, whyZh: why.zh,
    estimatedMinutes,
    targetSkills,
    targetExpressions: parts.expressions,
    successConditionJa: parts.battle
      ? (hasConv ? 'バトルで80%以上、AI会話を1回終える' : 'バトルで80%以上を取る')
      : (hasConv ? 'AI会話を1回終える' : '今日のstepをすべて終える'),
    successConditionZh: parts.battle
      ? (hasConv ? '战斗拿到80%以上，并完成一次AI会话' : '战斗拿到80%以上')
      : (hasConv ? '完成一次AI会话' : '完成今天的所有步骤'),
    nextStepJa: '明日は今日の復習から始まります',
    nextStepZh: '明天从复习今天的内容开始',
  };
};

const buildWhy = (
  goal: AdvGoalType, stage: AdvRouteStage, due: number, weak: number, daysToExam: number | null,
): { ja: string; zh: string } => {
  const bits: string[] = [];
  const bitsZh: string[] = [];
  if (due > 0) { bits.push('忘れる前の復習が最優先'); bitsZh.push('优先在遗忘前复习'); }
  if (weak > 0) { bits.push('直近の誤答を先につぶす'); bitsZh.push('先攻克最近的错题'); }
  bits.push(`現在地「${stage.titleJa}」を進める`);
  bitsZh.push(`推进当前位置「${stage.titleZh}」`);
  if (goal !== 'conversation' && daysToExam !== null) {
    bits.push(`試験まで${daysToExam}日`); bitsZh.push(`距离考试${daysToExam}天`);
  }
  return { ja: bits.join('。') + '。', zh: bitsZh.join('。') + '。' };
};
