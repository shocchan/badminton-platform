// Adventure V2 オーケストレーター。
// UX CLARITY: 「1画面、1つの決断」— 現在地と先のルートは見せるが、押すCTAは常に一つ。
// ASSESSMENT INTEGRITY: 「今どの試験科目を鍛えているか」を必ず表示し、
//                       準備度は技能別・データ不足は未判定。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Learner, LearnerSettings, CourseSessionRecord, ItemProgress } from '../../../lib/aiLesson/course/types';
import type {
  AdvEnemyTier, AdvMasteryAttempt, AdvTodayQuest, AdventureV2Profile,
} from '../../../lib/aiLesson/course/adventure/advTypes';
import { readAdvProfile, writeAdvProfile, defaultAdvProfile, migrateLegacyEvidence } from '../../../lib/aiLesson/course/adventure/advProfile';
import { currentStageOf, routeProgressPct, AREA_UNIT_MAP, deriveMasteredStageIds } from '../../../lib/aiLesson/course/adventure/advRoute';
import { recordAttempt, seenQuestionKeys, masteredTargetIds, classifyPendingDelay, type MasteryStatus} from '../../../lib/aiLesson/course/adventure/advMastery';
import { battleSeedOf } from '../../../lib/aiLesson/course/adventure/advBattle';
import { generateTodayQuest, vocabTargetForStage, stepKeyOf } from '../../../lib/aiLesson/course/adventure/advQuest';
import { computeReadiness } from '../../../lib/aiLesson/course/adventure/advReadiness';
import { computePace } from '../../../lib/aiLesson/course/adventure/advPace';
import { buildReviewForecast, type ReviewForecast } from '../../../lib/aiLesson/course/adventure/advReviewForecast';
import { checkBuildVersion } from '../../../lib/aiLesson/course/adventure/advBuildVersion';
import {
  buildMistakeNotebook, summarizeMistakes, pendingMistakeKeySet, pickMistakeReviewKeys,
  mistakeStatusText, MISTAKE_TERMS, type MistakeNotebook,
} from '../../../lib/aiLesson/course/adventure/advMistakeNotebook';
import { latestUnreadNote, markNoteRead } from '../../../lib/aiLesson/course/adventure/advTeacherNote';
import { XP_RULES, xpForBattle, levelOf, xpToNextLevel } from '../../../lib/aiLesson/course/adventure/advXp';
import { buildLessonPrepSummary } from '../../../lib/aiLesson/course/adventure/advHumanLesson';
import {
  ALL_TEACHERS, resolveTeacher, teacherName, type AdvTeacherId,
} from '../../../lib/aiLesson/course/adventure/advTeacher';
import { TeacherAvatar } from '../TeacherAvatar';
import {
  loadGrammarPools, buildDiagnosisPools, pickContentStage, loadAllN2Drafts, grammarPatternById,
  type GrammarPools, type StageContent,
} from '../../../lib/aiLesson/course/adventure/advContent';
import { seededShuffle, type DiagnosisPools } from '../../../lib/aiLesson/course/adventure/advDiagnosis';
import { N3_GRAMMAR_DRAFTS } from '../../../lib/aiLesson/course/n3GrammarDrafts';
import { N3_UNIT_SPECS } from '../../../lib/aiLesson/course/quality/n3UnitSpecs';
import { loadAllBasicDrafts } from '../../../lib/aiLesson/course/basicGrammarChunks';
import type { N2GrammarDraft } from '../../../lib/aiLesson/course/n2GrammarDrafts';
import { trackAdv, bucketOf } from '../../../lib/aiLesson/course/adventure/advAnalytics';
import { nowTrainingLabel, type ExamSkill } from '../../../lib/aiLesson/course/adventure/advExamSkills';
import { TERMS } from '../../../lib/aiLesson/course/adventure/advTerms';
import { AdvOnboarding, type OnboardingOutcome } from './AdvOnboarding';
import { companionById } from '../../../lib/aiLesson/course/adventure/advCompanion';
import { CompanionAvatar } from './CompanionAvatar';
import type { AdvBattleQuestion } from '../../../lib/aiLesson/course/adventure/advVariants';
import { AdvBattleRunner } from './AdvBattleRunner';
import { AdvReadingRunner } from './AdvReadingRunner';
import { AdvListeningRunner } from './AdvListeningRunner';
import { AdvMockRunner } from './AdvMockRunner';
import { AdvAnswerSheetRunner } from './AdvAnswerSheetRunner';
import { answerSheetsVisible, paperById } from '../../../lib/aiLesson/course/adventure/advAnswerSheet';
import { pressFx, primaryBtn, secondaryBtn, riseIn } from './advUi';
import { AdvInterviewPrep } from './AdvInterviewPrep';
import { interviewPrepVisible } from '../../../lib/aiLesson/course/adventure/interview/advInterview';
import { AdvAdventureMap } from './AdvAdventureMap';
import { AdvKanaDojo } from './AdvKanaDojo';
import { todaysKanaRowIds, isKanaGraduated } from '../../../lib/aiLesson/course/adventure/advKana';
import { buildMockSpec } from '../../../lib/aiLesson/course/adventure/advMock';
import { toMockAttempt, toMockLogEntry, type MockResult, type MockSessionState } from '../../../lib/aiLesson/course/adventure/advMockSession';
import { readingSetsFor, readingTargetIds, readingPool, readingKeyOf } from '../../../lib/aiLesson/course/adventure/reading/readingBank';
import { listeningSetsFor, listeningTargetIds, listeningPool } from '../../../lib/aiLesson/course/adventure/listening/listeningBank';
import { pickRestateMaterial } from '../../../lib/aiLesson/course/adventure/advRestate';
import { buildWeeklySummary, buildDailySummary } from '../../../lib/aiLesson/course/adventure/advWeekly';
import { collectSkillEvidence } from '../../../lib/aiLesson/course/adventure/advReadiness';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);
const term = (k: keyof typeof TERMS, lang: L) => TERMS[k][lang];
const dateKeyOf = (d = new Date()): string => d.toLocaleDateString('sv-SE');
/** 試験日までの残日数（ローカル深夜同士で比較・UTC混在させない）。当日=0、試験後は負 */
const daysToExamOf = (examDateISO: string | null, dateKey: string): number | null => {
  if (!examDateISO) return null;
  const diff = Math.ceil((new Date(`${examDateISO.slice(0, 10)}T00:00:00`).getTime() - new Date(`${dateKey}T00:00:00`).getTime()) / 86400000);
  // 不正な試験日はnull（NaN日と表示しない）
  return Number.isFinite(diff) ? diff : null;
};

export interface AdvShellProps {
  lang: L;
  learner: Learner;
  progress: ItemProgress[];
  sessions: CourseSessionRecord[];
  reviewsDue: number;
  onSaveSettings: (next: LearnerSettings) => void;
  onOpenReview: () => void;
  onStartConversation: () => void;
  conversationAvailable: boolean;
  onStartRestate: () => void;
  restateAvailable: boolean;
  onOpenArea: (areaId: string) => void;
  onExitV2: () => void;
  /** ヘッダー・設定画面からの画面切替要求（canon §5）。同じ画面を再度押しても伝わるよう n を持つ。
   * teacher=案内の先生の変更 / redo=目的・レベルの変更（準備のやり直し）。
   * どちらも設定画面（上部ナビ）から入る（2026-08-16 メニュー整理でホームの二次メニューから移設） */
  requestView?: { view: 'home' | 'map' | 'teacher' | 'redo' | 'nextStep'; n: number } | null;
  /** いまどの画面かをヘッダーへ返す（ナビのハイライト用） */
  onViewChange?: (view: 'home' | 'map') => void;
  /** requestViewを消費したら親へ知らせる（2026-08-17 監査P1:
   * 消費後もrequestが残ると、再マウントのたびにredoウィザード等が勝手に再表示された） */
  onRequestConsumed?: () => void;
  /** 「次にやるstep」を親へ知らせる（復習画面の「次へ」ボタン文言に使う・2026-08-17） */
  onNextStepChange?: (s: { titleJa: string; titleZh: string } | null) => void;
}

type View = 'home' | 'mistakes' | 'map' | 'readiness' | 'grammar' | 'battle' | 'complete' | 'prep' | 'reading' | 'listening' | 'restate' | 'mock' | 'teacher' | 'weekly' | 'sheets' | 'interview' | 'kana';
interface BattleCtx {
  tier: AdvEnemyTier; targetId: string; targetLabel: string; targetIds: string[];
  /**
   * このバトルを始めた今日のstepの添字。**stepから始めたときだけ入れる**。
   * おかわりバトル・错题本の解き直し・冒険マップからのバトルでは undefined にして、
   * 「やっていないstepが完了になる」事故を防ぐ（2026-08-17 監査P0）
   */
  fromStepIdx?: number;
}

/** いま要る語彙プールの注文（何をどのseedで作るか）。key が同じなら作り直さない */
interface VocabPoolRequest {
  kind: 'battle' | 'mock';
  level: 'N2' | 'N3';
  /** バトルで材料化するバンド（模試は全バンドなので空） */
  bands: string[];
  seed: number;
  key: string;
}

/**
 * 優先再出題の対象キー（2026-08-17）。
 * 错题本の「まだ克服できていない」集合を使う。旧実装は「最後の試行が80%未満ならその回の全問」で、
 * 正解した問題まで誤答扱いにしていた。正誤の記録が無い旧データしかない人には従来の推定へ落とす。
 */
const recentWrongKeysOf = (prof: AdventureV2Profile, notebook: MistakeNotebook): Set<string> => {
  if (notebook.recordingAvailable) return pendingMistakeKeySet(notebook);
  const out = new Set<string>();
  for (const attempts of Object.values(prof.mastery)) {
    const last = attempts?.[attempts.length - 1];
    if (last && last.scorePct < 80) for (const k of last.questionKeys) out.add(k);
  }
  return out;
};

const card = 'rounded-2xl border border-gray-200 bg-white p-4';

/** 错题本の解き直しバトルのtargetId。ルートのstage targetとは混ざらない専用ID */
const MISTAKE_TARGET_ID = 'mistake-review';

/**
 * 学習対象IDを生徒に見せる言葉へ（原則13: 内部IDを見せない）。
 * 名前が分からないIDは**それらしい名前を作らず**「学習した内容」とだけ言う。
 */
const targetLabelOf = (targetId: string, lang: L): string => {
  const spec = N3_UNIT_SPECS.find((s) => s.unitId === targetId);
  if (spec) return tx(lang, spec.titleJa, spec.titleZh);
  if (/^n5g-unit-/.test(targetId)) return tx(lang, '基礎の文法（N5）', '基础语法（N5）');
  if (/^n4g-unit-/.test(targetId)) return tx(lang, '基礎の文法（N4）', '基础语法（N4）');
  if (/^n3g-unit-/.test(targetId)) return tx(lang, 'N3の文法', 'N3语法');
  if (/^n2g-unit-/.test(targetId)) return tx(lang, 'N2の文法', 'N2语法');
  if (/^vocab-/.test(targetId)) return tx(lang, 'ことば', '词汇');
  if (targetId === MISTAKE_TARGET_ID) return tx(lang, '間違えた問題の解き直し', '错题重做');
  return tx(lang, '学習した内容', '学过的内容');
};

/** step種別 → 鍛えている試験科目（Homeの「今鍛えている試験力」表示に使う） */
const skillOfStep = (kind: string): ExamSkill => {
  if (kind === 'grammar_new' || kind === 'weak_reinforce' || kind === 'battle') return 'grammar';
  if (kind === 'vocab_new' || kind === 'review_due' || kind === 'kana_dojo') return 'charactersVocabulary';
  if (kind === 'reading_short') return 'reading';
  if (kind === 'listening_practice') return 'listening';
  return 'grammar';
};
/** 会話・言い直しはJLPT科目ではない（別軸） */
const isPracticalStep = (kind: string) => kind === 'conversation_mission' || kind === 'restate';

export default function AdvShell(props: AdvShellProps) {
  const { lang, learner } = props;
  const nowISO = new Date().toISOString();
  const dateKey = dateKeyOf();

  const profile = useMemo(() => readAdvProfile(learner.settings), [learner.settings]);
  const prof0 = useCallback(() => profile, [profile]);
  const [view, setView] = useState<View>('home');
  const [pools, setPools] = useState<GrammarPools | null>(null);
  const [diagPools, setDiagPools] = useState<DiagnosisPools | null>(null);
  const [stageCt, setStageCt] = useState<StageContent | null>(null);
  /** 復習予報（渋滞レスキュー込み）。ホームの表示と確認バトルの出題を同じ数字で揃えるための単一の出所 */
  const [forecast, setForecast] = useState<ReviewForecast | null>(null);
  /** 错题本から解き直す問題キー（このバトルの間だけ有効） */
  const [mistakeKeys, setMistakeKeys] = useState<string[]>([]);
  /** 開いたままのタブが古いJSで動いていないか（2026-08-17 実際に起きた事故の再発防止） */
  const [staleBuild, setStaleBuild] = useState(false);
  useEffect(() => {
    let alive = true;
    const run = () => { void checkBuildVersion().then((v) => { if (alive && v.stale) setStaleBuild(true); }); };
    run();
    // 画面に戻ってきたときと、開きっぱなしの間は30分おきに見る
    const onFocus = () => run();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(run, 30 * 60 * 1000);
    return () => { alive = false; window.removeEventListener('focus', onFocus); window.clearInterval(timer); };
  }, []);
  const [quest, setQuest] = useState<AdvTodayQuest | null>(null);
  const [battle, setBattle] = useState<BattleCtx | null>(null);
  const [studyGrammarId, setStudyGrammarId] = useState<string | null>(null);
  const [grammarDoc, setGrammarDoc] = useState<N2GrammarDraft | null>(null);
  const [lastMastery, setLastMastery] = useState<MasteryStatus | null>(null);
  const [showMore, setShowMore] = useState(false);
  /** 読解・聴解のonFinish二重発火ガード（連打によるmastery重複記録を防ぐ）。入場時にfalseへ戻す */
  const skillFinishGuard = useRef(false);
  /** 主要CTAを押しても進めない理由（AI会話が未開放など）。黙って無反応にしない（原則15） */
  const [stepNotice, setStepNotice] = useState<string | null>(null);
  const weeklyTracked = useRef(false);
  // 目的・レベルの変更＝オンボーディングのやり直し（記録は保持。設定画面から入る）。
  // requestView('redo')が使うため、切替要求の処理より前に宣言する
  const [redoOnboarding, setRedoOnboarding] = useState(false);
  /**
   * 「次のstepへ」要求（2026-08-17 CEO要望「毎回戻らないといけないので」）。
   * 復習画面から戻ったとき、ホームで押し直させずに次のstepを直接開く。
   * 実行は runStep が定義されたあと（描画準備の位置）で、
   * requestView と同じ「描画中に状態を合わせる」やり方で行う。
   */
  const [pendingNextN, setPendingNextN] = useState(0);
  const [consumedNextN, setConsumedNextN] = useState(0);

  // ヘッダー（今日の冒険／冒険マップ）からの切替要求を反映する。
  // effect ではなく **render中にpropsの変化へ合わせて調整する**（Reactが推奨する形）。
  // effectでsetStateすると1フレーム古い画面が挟まる。
  const reqN = props.requestView?.n ?? 0;
  const [seenReq, setSeenReq] = useState(0);
  if (reqN !== seenReq) {
    setSeenReq(reqN);
    if (props.requestView) {
      const v = props.requestView.view;
      if (v === 'redo') { setView('home'); setRedoOnboarding(true); }
      // 復習画面などから「次のstepへ」で戻ってきたとき、ホームを経由せず直接そのstepを開く
      // （2026-08-17 CEO要望「毎回戻らないといけないので」）。questが揃うのを待つ必要があるのでフラグで持つ
      else if (v === 'nextStep') { setView('home'); setPendingNextN(reqN); }
      else if (v === 'teacher') setView('teacher');
      else setView(v === 'map' ? 'map' : 'home');
      // render中に親のstateを更新しない（Reactの規約）。次tickで通知する
      const notify = props.onRequestConsumed;
      if (notify) setTimeout(() => notify(), 0);
    }
  }

  // ナビのハイライトを実際の画面に合わせる
  const notifyView = props.onViewChange;
  useEffect(() => {
    notifyView?.(view === 'map' ? 'map' : 'home');
  }, [view, notifyView]);
  /**
   * 語彙の出題プール。模試と語彙バトル（2026-08-15 語彙配線）でだけ使うので、
   * bank は動的importでHomeの初回転送量から外す（実測: gzip 779kB → 456kB）。
   *
   * **描画中には作らない**（2026-08-17）。語彙が3,349語になり、全量生成（vocabPool）は
   * Macでも 3.7〜4.5秒かかる。それを `pool={vocabPoolFn(level)}` と描画式の中で呼んでいたため、
   * 生徒の端末では画面が固まり、ローディング表示すら描けなかった。
   * いまは ①必要な語だけ材料化する（vocabSubset）②生成は effect の中で行い、
   * できるまではローディングを出す、の2段構えにしてある。
   */
  const [vocabPool, setVocabPool] = useState<{ key: string; map: Map<string, AdvBattleQuestion[]> } | null>(null);
  const [vocabPoolError, setVocabPoolError] = useState(false);
  /**
   * ミニ模試の試行seed。**画面に入った時点で決める**（開始ボタンの中で決めると、
   * 先に作ったプールと seed が食い違い、途中保存した答案が復元できなくなる）。
   * 中断からの復帰では保存済みの attemptSeed をそのまま使う。
   */
  const [mockSeed, setMockSeed] = useState<number | null>(null);
  const savedMockSeed = profile?.mockSession?.attemptSeed ?? null;
  /** ミニ模試へ入る唯一の入口。**seedを決めてから画面を切り替える**（描画中に決めない） */
  const openMock = useCallback(() => {
    setMockSeed(savedMockSeed ?? Date.now());
    setView('mock');
  }, [savedMockSeed]);

  /** いま要る語彙プールの注文。key が同じなら作り直さない */
  const vocabRequest = useMemo<VocabPoolRequest | null>(() => {
    const lv: 'N2' | 'N3' = profile?.targetJlpt === 'N3' ? 'N3' : 'N2';
    if (view === 'mock') {
      if (mockSeed === null) return null;
      return { kind: 'mock', level: lv, bands: [], seed: mockSeed, key: `mock|${lv}|${mockSeed}` };
    }
    if (view === 'battle' && battle && battle.targetId.startsWith('vocab-')) {
      const vocabTargets = battle.targetIds.filter((t) => t.startsWith('vocab-'));
      const bands = vocabTargets.length > 0 ? vocabTargets : [battle.targetId];
      // 材料を選ぶseedと、そこから編成を組むseed（AdvBattleRunner）を必ず揃える
      const seed = battleSeedOf(dateKey, battle.tier);
      return { kind: 'battle', level: lv, bands, seed, key: `battle|${lv}|${bands.join(',')}|${seed}` };
    }
    return null;
  }, [view, battle, profile?.targetJlpt, mockSeed, dateKey]);

  // 既出・直近誤答は「生成する瞬間の台帳」を読む（毎描画で作り直さないためrefで持つ）
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    if (!vocabRequest || vocabPoolError) return;
    if (vocabPool?.key === vocabRequest.key) return;
    const req = vocabRequest;
    let alive = true;
    void import('../../../lib/aiLesson/course/adventure/vocab/vocabSubset')
      // 1タスク譲ってから作る（ローディング表示を先に描かせる。
      // effect内で即座に作ると、chunkがキャッシュ済みのときスピナーが1frameも出ない）
      .then((m) => new Promise<typeof m>((resolve) => { setTimeout(() => resolve(m), 0); }))
      .then((m) => {
        if (!alive) return;
        const p = profileRef.current;
        const map = req.kind === 'mock'
          // 模試のプールは attemptSeed だけから決める。既出キー等を混ぜると
          // 途中保存した答案が復元できなくなる（advMockSession.ts の復元条件）
          ? m.mockVocabPool(req.level, req.seed)
          : m.vocabSubsetPool(req.level, {
            seed: req.seed,
            seenKeys: p ? seenQuestionKeys(p.mastery) : undefined,
            recentWrongKeys: p ? recentWrongKeysOf(p, buildMistakeNotebook(p.mastery, new Date().toISOString())) : undefined,
            onlyBands: req.bands,
            oneAspectPerWord: true,
          });
        if (alive) setVocabPool({ key: req.key, map });
      })
      .catch(() => { if (alive) setVocabPoolError(true); });
    return () => { alive = false; };
  }, [vocabRequest, vocabPool?.key, vocabPoolError]);
  /** 注文どおりに出来上がっているプールだけを使う（古いレベル・古いバンドを渡さない） */
  const vocabPoolReady = vocabRequest && vocabPool?.key === vocabRequest.key ? vocabPool.map : null;

  const save = useCallback((next: AdventureV2Profile) => {
    props.onSaveSettings(writeAdvProfile(learner.settings, next, new Date().toISOString()));
  }, [learner.settings, props]);

  // 完了は**安定キー（stepKeyOf）**で照合する（2026-08-17 監査P0: questの並びは
  // 日中の状態変化で変わるため、添字だけだと未実施stepが勝手に完了扱いになっていた）。
  // 旧形式（done: 添字）は読み取りだけ引き続き尊重する（移行日の保存データ用）
  const doneSteps = useMemo(() => {
    const ts = profile?.todaySteps;
    if (!ts || ts.dateKey !== dateKey) return new Set<number>();
    const out = new Set<number>(ts.done);
    const byKey = new Set(ts.doneKeys ?? []);
    quest?.steps.forEach((s, i) => { if (byKey.has(stepKeyOf(s))) out.add(i); });
    return out;
  }, [profile?.todaySteps, dateKey, quest]);
  const withStepDone = useCallback((p: AdventureV2Profile, i: number, key?: string): AdventureV2Profile => {
    const ts = p.todaySteps && p.todaySteps.dateKey === dateKey ? p.todaySteps : { dateKey, done: [], doneKeys: [] };
    if (key) {
      const keys = ts.doneKeys ?? [];
      if (keys.includes(key)) return p;
      return { ...p, todaySteps: { ...ts, dateKey, doneKeys: [...keys, key] } };
    }
    // キー不明のフォールバック（questが無い等）。従来の添字保存
    return ts.done.includes(i) ? p : { ...p, todaySteps: { ...ts, dateKey, done: [...ts.done, i] } };
  }, [dateKey]);
  /** 現在のquestからstepの安定キーを引く（無ければundefined＝添字フォールバック） */
  const keyOfStepIdx = useCallback((i: number): string | undefined => {
    const s = quest?.steps[i];
    return s ? stepKeyOf(s) : undefined;
  }, [quest]);
  /** 次にやるstep（フックを早期returnより前に置くためここで求める） */
  const nextStepIdx = useMemo(
    () => (quest ? quest.steps.findIndex((_, i) => !doneSteps.has(i)) : -1),
    [quest, doneSteps],
  );
  const nextStep = quest && nextStepIdx >= 0 ? quest.steps[nextStepIdx] : null;
  /**
   * **復習stepを除いた**次のstep（2026-08-17 CEO実機報告の修正）。
   * 復習画面に出す「次へ」がこれを使う。素の nextStepIdx は復習step自身を指すため
   * （復習は「期限切れが0件」になるまで未完了のまま）、押しても同じ復習画面が開き直り、
   * 学習者には「押しても何も起きない」に見えていた。
   */
  const nextAfterReviewIdx = useMemo(
    () => (quest ? quest.steps.findIndex((s, i) => !doneSteps.has(i) && s.kind !== 'review_due') : -1),
    [quest, doneSteps],
  );
  const nextAfterReview = quest && nextAfterReviewIdx >= 0 ? quest.steps[nextAfterReviewIdx] : null;
  // 親（復習画面）へ「次にやるstep」を知らせる。ボタン文言に使う
  const notifyNext = props.onNextStepChange;
  const nextTitleJa = nextAfterReview?.titleJa ?? null;
  const nextTitleZh = nextAfterReview?.titleZh ?? null;
  useEffect(() => {
    notifyNext?.(nextTitleJa && nextTitleZh ? { titleJa: nextTitleJa, titleZh: nextTitleZh } : null);
  }, [notifyNext, nextTitleJa, nextTitleZh]);

  const markStep = useCallback((i: number) => {
    if (!profile || doneSteps.has(i)) return;
    save(withStepDone(profile, i, keyOfStepIdx(i)));
  }, [profile, doneSteps, save, withStepDone, keyOfStepIdx]);

  /** 読解・聴解の結果を mastery台帳へ skill evidence つきで記録する（準備度へ反映される） */
  const recordSkillResult = useCallback((
    p: AdventureV2Profile, skill: 'reading' | 'listening',
    r: { correct: number; total: number; keys: string[]; wrongKeys: string[]; elapsedSec: number },
    stepIndex: number,
  ) => {
    const targetId = `${skill}-${prof0()?.targetJlpt ?? 'N2'}`.toLowerCase();
    // 実測の未出比率を記録する。1固定は同一セット再演を「未出100%の証拠」として
    // mastery台帳・準備度へ水増し計上してしまう（原則9・13）
    const seenBefore = seenQuestionKeys(p.mastery);
    const unseenCount = r.keys.filter((k) => !seenBefore.has(k)).length;
    const attempt: AdvMasteryAttempt = {
      dateKey,
      scorePct: r.total === 0 ? 0 : Math.round((r.correct / r.total) * 100),
      unseenRatio: r.keys.length === 0 ? 0 : Math.round((unseenCount / r.keys.length) * 100) / 100,
      questionKeys: r.keys,
      tier: 'normal',
      timed: false,
      completedAt: new Date().toISOString(),
      skills: [skill],
      bySkill: { [skill]: { correct: r.correct, total: r.total, unseen: unseenCount } },
    };
    const ledger = recordAttempt(p.mastery, targetId, attempt);
    trackAdv('skill_evidence_added', { skillType: skill, countBucket: bucketOf(r.total) });
    save(withStepDone({ ...p, mastery: ledger }, stepIndex, keyOfStepIdx(stepIndex)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, save, withStepDone, keyOfStepIdx]);


  const needsOnboarding = !profile || !profile.goalType || !profile.diagnosis || !profile.route;
  const [diagError, setDiagError] = useState(false);
  useEffect(() => {
    if ((!needsOnboarding && !redoOnboarding) || diagPools || diagError) return;
    void buildDiagnosisPools().then(setDiagPools).catch(() => setDiagError(true));
  }, [needsOnboarding, redoOnboarding, diagPools, diagError]);

  // プール読込失敗の可視化（2026-08-17 監査P1: 失敗が無処理だと
  // 再試行手段のない無限「冒険の準備をしています…」になっていた）
  const [poolsError, setPoolsError] = useState(false);
  const [poolsRetryNonce, setPoolsRetryNonce] = useState(0);
  useEffect(() => {
    if (needsOnboarding || !profile?.route || poolsError) return;
    let alive = true;
    void (async () => {
      try {
      const p = await loadGrammarPools();
      if (!alive) return;
      setPools(p);
      const mastered = masteredTargetIds(profile.mastery, nowISO);
      const stageDone = deriveMasteredStageIds(profile.route!, mastered, p.n3Ids, p.n2ByUnit, p.n3BundleByItem, p.basicByUnit, p.basicBundleByUnit);
      const stage = currentStageOf(profile.route!, stageDone) ?? profile.route!.stages[profile.route!.stages.length - 1];
      // 7日待ちのtargetは次候補から外して先へ進み、確認が解禁されたら確認バトルを最優先で出す（進度改善 2026-08-15）
      const { waiting } = classifyPendingDelay(profile.mastery, nowISO);
      // 復習予報＋渋滞レスキュー（2026-08-17）。
      // 数日あけると解禁ぶんが1日に集中し「今日30件」になって心が折れる。
      // 予報側で今日ぶんを決め、**出題も予報と同じ集合**を使う（画面の数字と出る数を必ず一致させる）
      const forecast = buildReviewForecast({
        ledger: profile.mastery, nowISO, dueCount: props.reviewsDue,
        dailyMinutes: profile.dailyMinutes ?? null,
        includeTargetId: (id) => !/^(reading-|listening-|mock)/.test(id),
      });
      setForecast(forecast);
      const { stage: contentStage, content: ct } = await pickContentStage(
        profile.route!, stage, mastered, stageDone, waiting);
      if (!alive) return;
      setStageCt(ct);
      const weak = Object.entries(profile.mastery)
        .filter(([id, at]) => (id.startsWith('n2g-') || id.startsWith('n3g-')) && at && at.length > 0 && at[at.length - 1].scorePct < 80)
        .map(([id]) => id).slice(0, 5);
      // 試験後（負）はnull＝「試験まで◯日」文と追い込み配分を出さない（advQuest側は非負のみ受ける）
      const rawDays = daysToExamOf(profile.examDateISO, dateKey);
      const daysToExam = rawDays !== null && rawDays >= 0 ? rawDays : null;
      // 試験技能の状況（読解・聴解を毎日ではなく弱点・試験日で配分する・§12）
      const ev = collectSkillEvidence(profile.mastery);
      const measured = (['charactersVocabulary', 'grammar', 'reading', 'listening'] as const)
        .filter((k) => ev[k].evidenceCount > 0);
      const weakestSkill = measured.length > 0
        ? measured.slice().sort((a, b) =>
          (ev[a].correct / Math.max(1, ev[a].evidenceCount)) - (ev[b].correct / Math.max(1, ev[b].evidenceCount)))[0]
        : null;
      const lvl: 'N2' | 'N3' = profile.targetJlpt === 'N3' ? 'N3' : 'N2';
      // 今日の語彙バトルのバンド（stage対応・日替わり。2026-08-15 語彙配線）
      const dayNum = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
      const vocabBattleTargetId = vocabTargetForStage(contentStage.kind, lvl, dayNum);
      setQuest(generateTodayQuest({
        profile, route: profile.route!, dueReviewCount: props.reviewsDue, weakGrammarIds: weak,
        dateKey, nowISO, daysToExam,
        masteredStageIds: stageDone,
        contentStage,
        availability: {
          nextGrammarIds: ct.nextGrammarIds, nextUnitIds: ct.nextUnitIds,
          conversationTargets: ct.conversationTargets,
          grammarBundleByItem: ct.grammarBundleByItem,
          // 出題プールを持たない証跡target（読解・聴解・模試）は予報側のフィルタで既に除外済み
          // （2026-08-17 監査P1: 問題0件の「押しても進めないバトル」が毎日固定で出ていた）
          confirmTargetIds: [...forecast.todayConfirmTargetIds].sort(),
          vocabBattleTargetId,
        },
        examSkills: {
          weakestSkill,
          readingEvidence: ev.reading.evidenceCount,
          listeningEvidence: ev.listening.evidenceCount,
          readingTargetIds: readingTargetIds(lvl),
          listeningTargetIds: listeningTargetIds(lvl),
        },
      }));
      trackAdv('today_quest_viewed', { goalType: profile.goalType ?? undefined, targetLevel: profile.targetJlpt ?? undefined, locale: lang });
      } catch {
        if (alive) setPoolsError(true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // dailyMinutes は復習予報の1日の予算（＝何日に分散するか）を決めるので依存に入れる。
    // mastery の参照だけを見ていると、分量だけ変えた直後に古い予報が残る（2026-08-17）
  }, [needsOnboarding, profile?.route, profile?.mastery, profile?.kana, profile?.dailyMinutes,
    props.reviewsDue, dateKey, poolsError, poolsRetryNonce]);

  /**
   * 継続・離脱の signal（PRODUCT_CANON §10）。
   * Paid Pilot で「学習が続いているか／離脱しかけていないか」を見るための最小の計測。
   * 日数は必ず階級（bucketOf）で送り、生の値・本文・個人情報は送らない。
   * 1日1回だけ（dateKey が変わったときだけ）発火する。
   */
  useEffect(() => {
    if (needsOnboarding || !profile) return;
    const log = profile.questLog ?? [];
    if (log.length === 0) return;
    const days = [...new Set(log.map((q) => q.dateKey))].sort();
    const first = days[0];
    const last = days[days.length - 1];
    const dayDiff = (a: string, b: string) =>
      Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
    const sinceFirst = dayDiff(first, dateKey);
    const sinceLast = dayDiff(last, dateKey);
    const common = { targetLevel: profile.targetJlpt ?? undefined, locale: lang };
    // 初日の翌日に戻ってきたか（最初の離脱ポイント）
    if (sinceFirst === 1 && days.includes(dateKey)) trackAdv('day_2_returned', common);
    // 初日から7日目に、まだ学習しているか
    if (sinceFirst >= 6 && sinceFirst <= 8 && days.includes(dateKey)) trackAdv('day_7_active', common);
    // 7日以上あいた（離脱リスク）
    if (sinceLast >= 7) {
      trackAdv('seven_days_inactive', { ...common, countBucket: bucketOf(sinceLast) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsOnboarding, dateKey]);

  useEffect(() => {
    if (!quest) return;
    const idx = quest.steps.findIndex((s) => s.kind === 'conversation_mission');
    if (idx < 0 || doneSteps.has(idx)) return;
    const hasToday = props.sessions.some((s) => s.startedAt.slice(0, 10) === dateKey && s.completionStatus === 'completed');
    if (hasToday) markStep(idx);
  }, [quest, props.sessions, dateKey, doneSteps, markStep]);

  /**
   * 復習stepは「期限切れの復習が0件になった」ときに完了する（2026-08-17）。
   * 以前は**タップした瞬間**に完了にしていたので、復習画面を開いて戻っただけで
   * ✓が付いた（CEO実機報告）。やっていないことを「やった」と記録しない（原則13）。
   * このstepは dueReviewCount > 0 の日にしか作られないので、0になった＝片付いた、と言える。
   */
  useEffect(() => {
    if (!quest || props.reviewsDue > 0) return;
    const idx = quest.steps.findIndex((s) => s.kind === 'review_due');
    if (idx < 0 || doneSteps.has(idx)) return;
    markStep(idx);
  }, [quest, props.reviewsDue, doneSteps, markStep]);

  // ── onboarding（初回＝needsOnboarding／やり直し＝redoOnboarding） ──
  if (needsOnboarding || redoOnboarding) {
    // 読込失敗を無限ローディングにしない（原則15）。再試行と出口を必ず出す
    if (diagError) {
      return (
        <div className="mx-auto w-full max-w-xl px-4 py-10">
          <p className="text-sm leading-relaxed text-gray-700" role="alert">
            {tx(lang,
              '冒険の準備データを読み込めませんでした。通信環境を確認して、もう一度お試しください。',
              '冒险的准备数据加载失败。请检查网络后重试。')}
          </p>
          <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setDiagError(false)}>
            {tx(lang, 'もう一度読み込む', '重新加载')}
          </button>
          {/* 逃げ道: redo中は元の設定へ。初回は旧コース歴のある人だけ旧ホームへ（2026-08-16） */}
          {(redoOnboarding || props.progress.length > 0) && (
            <button type="button" className={`${secondaryBtn} mt-2`}
              onClick={redoOnboarding ? () => { setDiagError(false); setRedoOnboarding(false); } : props.onExitV2}>
              {redoOnboarding
                ? tx(lang, '元の設定のまま戻る', '保持原来的设置返回')
                : tx(lang, '従来のホームに戻す（データは残ります）', '返回原来的主页（数据会保留）')}
            </button>
          )}
        </div>
      );
    }
    if (!diagPools) return <AdvLoading lang={lang} />;
    // outcome → 保存するプロファイル（onComplete と診断直後の下書き保存で共通）
    const profileFromOutcome = (o: OnboardingOutcome): AdventureV2Profile => {
      const base = profile ?? defaultAdvProfile(nowISO);
      const withLegacy = migrateLegacyEvidence(base, props.progress, nowISO);
      return {
        ...withLegacy, enabled: true,
        goalType: o.goalType, targetJlpt: o.targetJlpt, examDateISO: o.examDateISO,
        weeklyDays: o.weeklyDays, dailyMinutes: o.dailyMinutes, companionId: o.companionId,
        teacherId: o.teacherId,
        diagnosis: o.diagnosis,
        skills: { ...withLegacy.skills, ...o.skills, vocabulary: o.skills.vocabulary.confidence === 'none' ? withLegacy.skills.vocabulary : o.skills.vocabulary },
        route: o.route,
        // 超初心者（かな未確認レベル）は、かな道場の対象として初期化する（2026-08-15）。
        // すでに卒業・進行中ならその状態を保持（redoで巻き戻さない）
        kana: (o.diagnosis && (o.diagnosis.knowledgeBand === 'needs_assessment' || o.diagnosis.knowledgeBand === 'pre_n5'))
          ? (withLegacy.kana ?? { needed: null, doneRowIds: [], checkedAt: null })
          : withLegacy.kana,
        // やり直しではルートが変わるので、今日のstep進捗と前回questの持ち越しを外す
        // （古いquestのstep番号が新questに誤って「完了」と写るのを防ぐ。mastery等の実績は保持）
        ...(redoOnboarding ? { lastQuest: null, todaySteps: null } : {}),
      };
    };
    return (
      <AdvOnboarding
        lang={lang} pools={diagPools} nowISO={nowISO} redo={redoOnboarding}
        canCancelToLegacy={props.progress.length > 0}
        onOutcomeReady={(o: OnboardingOutcome) => {
          // 診断完了の時点でDBへ確定保存する（2026-08-15）。ルート披露画面でアプリを
          // 閉じても診断・設定が消えない。React state は触らない＝披露画面はそのまま表示
          // （onSaveSettings 経由だと needsOnboarding が即falseになり披露画面がunmountされる）
          const settings = writeAdvProfile(learner.settings, profileFromOutcome(o), new Date().toISOString());
          void import('../../../lib/aiLesson/course/courseRepository')
            .then(({ courseRepository }) => courseRepository.updateLearner({ settings }));
        }}
        onComplete={(o: OnboardingOutcome) => {
          save(profileFromOutcome(o));
          setRedoOnboarding(false);
          setView('home');
        }}
        onCancel={redoOnboarding ? () => setRedoOnboarding(false) : props.onExitV2}
      />
    );
  }
  const prof = profile!;
  const route = prof.route!;
  const level: 'N2' | 'N3' = prof.targetJlpt === 'N3' ? 'N3' : 'N2';
  // 案内の先生。未選択（null）は既定へ倒す＝既存learnerの見え方を変えない
  const teacher = resolveTeacher(prof.teacherId);
  const teacherLabel = teacherName(teacher, lang);
  // 先生からの一言（未読1件）と错题本。どちらも台帳から導く純関数なので毎描画で作ってよい
  const unreadNote = latestUnreadNote(prof.teacherNotes ?? [], nowISO);
  const notebook: MistakeNotebook = buildMistakeNotebook(prof.mastery, nowISO);
  const pickTeacher = (id: AdvTeacherId) => {
    if (id === prof.teacherId) return;                 // 同じ先生の再選択は保存も計測もしない
    // 初回選択（未選択→選択）と変更を区別して計測する。先生名・本文は送らない
    trackAdv(prof.teacherId ? 'teacher_changed' : 'teacher_selected', { teacherId: id, locale: lang });
    save({ ...prof, teacherId: id });
  };

  // ── battle ──
  // ── かな道場（超初心者の前提レッスン・2026-08-15） ──
  if (view === 'kana' && prof.kana) {
    const kanaStep = quest?.steps.find((s) => s.kind === 'kana_dojo');
    const rowIds = kanaStep?.refIds
      ?? (prof.kana.needed === null ? ['check'] : todaysKanaRowIds(prof.kana));
    // step完了とかな状態の更新は**1回のsaveにまとめる**（2026-08-17 監査P1:
    // markStep→save の2連続だと後者が前者のtodaySteps更新を上書きし、
    // かな学習者の「今日の冒険」が永遠に完了しなかった）
    const kanaStepIdx = quest?.steps.findIndex((s) => s.kind === 'kana_dojo') ?? -1;
    const saveKana = (p: AdventureV2Profile) => {
      save(kanaStepIdx >= 0 ? withStepDone(p, kanaStepIdx, keyOfStepIdx(kanaStepIdx)) : p);
    };
    return (
      <AdvKanaDojo lang={lang} rowIds={rowIds}
        onFinishCheck={(passed) => {
          saveKana({
            ...prof,
            kana: { ...prof.kana!, needed: !passed, checkedAt: new Date().toISOString() },
            xp: (prof.xp ?? 0) + (passed ? XP_RULES.kanaGraduate : XP_RULES.kanaRow),
          });
          setView('home');
        }}
        onRowsDone={(doneNow) => {
          const nextKana = { ...prof.kana!, needed: true, doneRowIds: [...new Set([...prof.kana!.doneRowIds, ...doneNow])] };
          // 全行修了＝卒業（2026-08-17 監査P2: neededがtrueのまま残ると
          // 空のかな道場入口が永久に出続けていた）
          const graduated = isKanaGraduated(nextKana);
          saveKana({
            ...prof,
            kana: graduated ? { ...nextKana, needed: false, checkedAt: new Date().toISOString() } : nextKana,
            xp: (prof.xp ?? 0) + XP_RULES.kanaRow * doneNow.length + (graduated ? XP_RULES.kanaGraduate : 0),
          });
          setView('home');
        }}
        onBack={() => setView('home')}
      />
    );
  }

  if (view === 'battle' && battle && pools) {
    // 語彙バトル（vocab-*）は遅延ロードの語彙バンクから出題する（2026-08-15 語彙配線）。
    // プールは effect で先に作ってある（描画中には作らない・2026-08-17）
    const isVocabBattle = battle.targetId.startsWith('vocab-');
    if (isVocabBattle && !vocabPoolReady) {
      if (vocabPoolError) {
        return (
          <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
            <p className="mb-4 text-sm text-gray-700">
              {tx(lang, '語彙データを読み込めませんでした。通信環境を確認してもう一度お試しください。',
                '词汇数据加载失败。请检查网络后重试。')}
            </p>
            <button type="button" className={`${pressFx} action-secondary min-h-[44px] rounded-xl border border-gray-300 bg-white px-6 py-2`}
              onClick={() => { setVocabPoolError(false); }}>
              {tx(lang, 'もう一度読み込む', '重新加载')}
            </button>
            <button type="button" className={`${pressFx} mt-2 w-full min-h-[44px] text-sm text-gray-500 underline`}
              onClick={() => { setBattle(null); setView('home'); }}>
              {tx(lang, 'ホームへ戻る', '返回主页')}
            </button>
          </div>
        );
      }
      return <AdvLoading lang={lang} note={tx(lang, '問題を用意しています…', '正在准备题目…')} />;
    }
    const seen = seenQuestionKeys(prof.mastery);
    const wrong = recentWrongKeysOf(prof, notebook);
    // 错题本からの解き直しは、選んだ問題だけを持つ専用プールで出す
    const isMistakeBattle = battle.targetId === MISTAKE_TARGET_ID;
    const mistakePool = (() => {
      if (!isMistakeBattle) return null;
      const want = new Set(mistakeKeys);
      const picked: AdvBattleQuestion[] = [];
      const taken = new Set<string>();
      for (const qs of pools.byItem.values()) {
        for (const q of qs) {
          if (want.has(q.key) && !taken.has(q.key)) { taken.add(q.key); picked.push(q); }
        }
      }
      return new Map<string, AdvBattleQuestion[]>([[MISTAKE_TARGET_ID, picked]]);
    })();
    // 解き直す問題が1問も解決できないまま画面へ入ったら、空のバトルを見せない（行き止まり回避）。
    // 描画中にsetStateすると再描画ループになるので、戻る導線を描いて止める
    if (isMistakeBattle && (mistakePool?.get(MISTAKE_TARGET_ID)?.length ?? 0) === 0) {
      return (
        <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
          <p className="mb-4 text-sm text-gray-700">
            {tx(lang, 'いま解き直せる問題が見つかりませんでした。', '现在没有找到可以重做的题目。')}
          </p>
          <button type="button" className={`${pressFx} action-secondary min-h-[44px] rounded-xl border border-gray-300 bg-white px-6 py-2`}
            onClick={() => { setBattle(null); setView('mistakes'); }}>
            {tx(lang, '間違えた問題ノートへ戻る', '返回错题本')}
          </button>
        </div>
      );
    }
    return (
      <AdvBattleRunner
        key={`${battle.tier}:${battle.targetId}`}
        lang={lang} tier={battle.tier} targetId={battle.targetId} targetLabel={battle.targetLabel}
        targetIds={battle.targetIds}
        pool={mistakePool ?? (isVocabBattle && vocabPoolReady ? vocabPoolReady : pools.byItem)} level={level}
        seenKeys={seen} recentWrongKeys={wrong}
        priorAttempts={prof.mastery[battle.targetId] ?? []}
        dateKey={dateKey} nowISO={nowISO}
        companionId={prof.companionId}
        onFinish={(attempt: AdvMasteryAttempt, mastery: MasteryStatus) => {
          let ledger = recordAttempt(prof.mastery, battle.targetId, attempt);
          if (battle.tier === 'midboss' || battle.tier === 'rankboss') {
            ledger = recordAttempt(ledger, currentStageOf(route, masteredTargetIds(ledger, nowISO))?.stageId ?? battle.targetId, attempt);
          }
          if (mastery.state === 'mastered') trackAdv('delayed_mastery_reached', { locale: lang });
          else if (mastery.qualifyingDays.length >= 1 && attempt.scorePct >= 80) trackAdv('mastery_80_reached', { locale: lang });
          setLastMastery(mastery);
          // 30分設定では1日に複数のバトルstep（文法＋語彙）があるため、
          // 終えたバトルのtargetに一致する未完了stepを消し込む（先頭一致だと語彙完了が文法stepを誤消し込みする）
          /**
           * 消し込むstepは**そのバトルを始めたstepだけ**（2026-08-17 監査P0）。
           * 以前は「一致するstepが無ければ、未完了のバトルstepのどれか」を消していたため、
           * おかわりバトル・错题本の解き直し・冒険マップからのバトルを1回やると、
           * **やっていない語彙バトルや弱点補強が✓完了**になっていた（やっていないことを記録する）。
           * step から始めたときだけ fromStepIdx が入る。それ以外は何も消し込まない。
           */
          const battleIdx = (() => {
            if (!quest || battle.fromStepIdx === undefined) return -1;
            const i = battle.fromStepIdx;
            const s = quest.steps[i];
            if (!s || doneSteps.has(i)) return -1;
            return (s.kind === 'battle' || s.kind === 'weak_reinforce') ? i : -1;
          })();
          // XPはバトル参加で+5・80%以上で+5（努力の通貨。攻略には影響しない・advXp.ts）
          const next = { ...prof, mastery: ledger, xp: (prof.xp ?? 0) + xpForBattle(attempt.scorePct) };
          save(battleIdx >= 0 ? withStepDone(next, battleIdx, keyOfStepIdx(battleIdx)) : next);
        }}
        onClose={() => { setBattle(null); setView(isMistakeBattle ? 'mistakes' : 'home'); }}
      />
    );
  }

  // ── 読解 ──
  // onFinishは ①記録 ②homeへ戻す（原則15: 最終問題で「結果を見る」を押したのに
  // 何も起きない行き止まりが監査で見つかった）。
  // ③二重発火ガード: 遷移前の連打で同じattemptがmastery台帳へ重複記録され、
  // 準備度のエビデンスが水増しされる（原則13違反）ため、1回で締める
  if (view === 'reading') {
    // 毎日同じ先頭3セットの再演で証拠を貯めない（原則9）。未出セット優先・日替わりの決定的選出
    const seenR = seenQuestionKeys(prof.mastery);
    const allR = readingSetsFor(level);
    const seedR = [...dateKey].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11);
    const sets = [
      ...seededShuffle(allR.filter((s) => !seenR.has(readingKeyOf(s))), seedR),
      ...seededShuffle(allR.filter((s) => seenR.has(readingKeyOf(s))), seedR),
    ].slice(0, 3);
    const stepIdx = quest?.steps.findIndex((s) => s.kind === 'reading_short') ?? -1;
    return (
      <AdvReadingRunner
        lang={lang} sets={sets}
        onFinish={(r) => {
          if (skillFinishGuard.current) return;
          skillFinishGuard.current = true;
          if (stepIdx >= 0) recordSkillResult(prof, 'reading', r, stepIdx);
          setView('home');
        }}
        onClose={() => setView('home')}
      />
    );
  }

  // ── 聴解 ──
  if (view === 'listening') {
    const seenL = seenQuestionKeys(prof.mastery);
    const allL = listeningSetsFor(level);
    const seedL = [...dateKey].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 13);
    const sets = [
      ...seededShuffle(allL.filter((s) => !seenL.has(`listen:${s.setId}`)), seedL),
      ...seededShuffle(allL.filter((s) => seenL.has(`listen:${s.setId}`)), seedL),
    ].slice(0, 3);
    const stepIdx = quest?.steps.findIndex((s) => s.kind === 'listening_practice') ?? -1;
    return (
      <AdvListeningRunner
        lang={lang} sets={sets}
        onFinish={(r) => {
          if (skillFinishGuard.current) return;
          skillFinishGuard.current = true;
          if (stepIdx >= 0) recordSkillResult(prof, 'listening', r, stepIdx);
          setView('home');
        }}
        onClose={() => setView('home')}
      />
    );
  }

  // ── 先生の設定（あとから変更できる） ──
  if (view === 'teacher') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={tx(lang, '案内の先生', '引导你的老师')} />
        <p className="mb-4 text-sm leading-relaxed text-gray-600">
          {tx(lang,
            '学習内容・出題・レベル判定は変わりません。話し方と見た目が変わります。いつでも変えられます。',
            '学习内容、出题和级别判定都不会改变，改变的是说话方式和外观。随时可以更改。')}
        </p>
        <div className="space-y-3" role="radiogroup" aria-label={tx(lang, '先生', '老师')}>
          {ALL_TEACHERS.map((tc) => {
            const on = teacher.id === tc.id;
            return (
              <button key={tc.id} type="button" role="radio" aria-checked={on}
                className={`${pressFx} action-choice flex w-full min-h-[44px] items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                  on ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'}`}
                onClick={() => pickTeacher(tc.id)}>
                <TeacherAvatar teacher={tc} size={56} lang={lang} labeled={false} className={`ring-2 ${tc.ringClass}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">{tx(lang, tc.nameJa, tc.nameZh)}</span>
                  <span className="block text-sm text-gray-600">{tx(lang, tc.roleJa, tc.roleZh)}</span>
                  {/* 音声の印象。公式に性別分類されていないため「女性声／男性声」とは書かない */}
                  <span className="block text-xs text-gray-500">
                    {tx(lang, `AI会話の声：${tc.voiceToneJa}`, `AI会话的声音：${tc.voiceToneZh}`)}
                  </span>
                  {!tc.voiceSwitchAvailable && (tc.voiceNoteJa || tc.voiceNoteZh) && (
                    <span className="mt-1 block text-xs text-amber-800">
                      {tx(lang, tc.voiceNoteJa ?? '', tc.voiceNoteZh ?? tc.voiceNoteJa ?? '')}
                    </span>
                  )}
                </span>
                {on && <span className="shrink-0 text-sm font-bold text-blue-700">{tx(lang, '選択中', '已选择')}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-gray-500">
          {tx(lang, '選んだ先生は、今日の冒険・AI会話・学習レポート・言い直し・復習・先生レッスン準備のすべてに表示されます。',
            '所选的老师会显示在今天的冒险、AI会话、学习报告、改口练习、复习和真人课准备的所有页面。')}
        </p>
        <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setView('home')}>
          {tx(lang, 'ホームへもどる', '返回主页')}
        </button>
      </div>
    );
  }

  // ── 過去問の試験場（答案用紙・N2受験者のみ）──
  // 問題文はアプリに無い（先生がWeChatで個別に送る）。ここは答案の記入と時間計測だけ
  if (view === 'sheets') {
    if (!answerSheetsVisible(prof)) {
      // 目的が変わって対象外になった等。行き止まりにせずhomeへ
      setView('home');
      return <AdvLoading lang={lang} />;
    }
    return (
      <AdvAnswerSheetRunner
        lang={lang} profile={prof} onSave={save}
        onBack={() => setView('home')}
      />
    );
  }

  // ── 帰化面接の表現特訓（発行された人だけ）──
  // 模擬面接はアプリでやらない（CEOの授業）。表現の特訓と記録だけ
  if (view === 'interview') {
    if (!interviewPrepVisible(prof)) {
      setView('home');
      return <AdvLoading lang={lang} />;
    }
    return (
      <AdvInterviewPrep lang={lang} profile={prof} onSave={save} onBack={() => setView('home')} />
    );
  }

  // ── ミニ模試（§9）──
  if (view === 'mock') {
    // 層Cの語彙bank（gzip 約320kB）は模試のときだけ要る。
    // Homeを開くたびに読ませないよう、この画面へ来てから動的importで取りに行く。
    // 語彙chunkの読込失敗を無限スピナーにしない（原則15）
    if (vocabPoolError) {
      return (
        <div className="mx-auto w-full max-w-xl px-4 py-6">
          <BackBar lang={lang} onBack={() => setView('home')} title={tx(lang, 'ミニ模試', '迷你模拟考')} teacherLang={lang} />
          <p className="text-sm leading-relaxed text-gray-700" role="alert">
            {tx(lang,
              '模試の問題を読み込めませんでした。通信環境を確認して、もう一度お試しください。',
              '模拟考的题目加载失败。请检查网络后重试。')}
          </p>
          <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setVocabPoolError(false)}>
            {tx(lang, 'もう一度読み込む', '重新加载')}
          </button>
          <button type="button" className={`${secondaryBtn} mt-2`} onClick={() => setView('home')}>
            {tx(lang, 'ホームへ戻る', '返回主页')}
          </button>
        </div>
      );
    }
    if (!pools || !vocabPoolReady || mockSeed === null) {
      return <AdvLoading lang={lang} note={tx(lang, '問題を用意しています…', '正在准备题目…')} />;
    }
    const rPool = readingPool(level);
    const lPool = listeningPool(level);
    const vPool = vocabPoolReady;
    const merged = new Map(pools.byItem);
    for (const [k, v] of rPool) merged.set(k, v);
    for (const [k, v] of lPool) merged.set(k, v);
    for (const [k, v] of vPool) merged.set(k, v);
    let vocabCount = 0; let grammarCount = 0;
    for (const qs of [...pools.byItem.values(), ...vPool.values()]) {
      for (const q of qs) {
        if (q.skill === 'charactersVocabulary') vocabCount += 1;
        else if (q.skill === 'grammar') grammarCount += 1;
      }
    }
    const readingCount = [...rPool.values()].reduce((n, v) => n + v.length, 0);
    const listeningCount = [...lPool.values()].reduce((n, v) => n + v.length, 0);
    const spec = buildMockSpec(level, { vocabCount, grammarCount, readingCount, listeningCount });
    // 基礎固め中の受験者には「いまの低得点は正常」の文脈を先に添える（2026-08-17）
    const mockStageKind = (() => {
      if (!prof.route) return null;
      const m = masteredTargetIds(prof.mastery, nowISO);
      const sd = deriveMasteredStageIds(prof.route, m, pools.n3Ids, pools.n2ByUnit, pools.n3BundleByItem, pools.basicByUnit, pools.basicBundleByUnit);
      return currentStageOf(prof.route, sd)?.kind ?? null;
    })();
    return (
      <AdvMockRunner
        lang={lang} spec={spec} pools={merged}
        attemptSeed={mockSeed}
        seenKeys={seenQuestionKeys(prof.mastery)}
        history={prof.mockLog}
        contextNoteJa={mockStageKind === 'foundation_camp' || mockStageKind === 'n3_bridge'
          ? `いまは基礎固めの途中です。模試は${level}全域から出るので、いまの得点は低く出ます。腕試しとして気軽にどうぞ。`
          : null}
        contextNoteZh={mockStageKind === 'foundation_camp' || mockStageKind === 'n3_bridge'
          ? `现在还在打基础阶段。模拟考覆盖${level}全部范围，所以当前分数会偏低。当作试身手轻松参加就好。`
          : null}
        savedState={prof.mockSession}
        onPersist={(s: MockSessionState | null) => save({ ...prof, mockSession: s })}
        onFinish={(r: MockResult) => {
          const completedAt = new Date().toISOString();
          const seen = seenQuestionKeys(prof.mastery);
          // 模試は timed evidence と skill別evidenceを同時に台帳へ入れる（準備度へ反映）
          const attempt = toMockAttempt(r, dateKey, seen, completedAt) as unknown as AdvMasteryAttempt;
          const ledger = recordAttempt(prof.mastery, `mock-${level.toLowerCase()}`, attempt);
          save({
            ...prof,
            mastery: ledger,
            mockSession: null,
            mockLog: [...prof.mockLog, toMockLogEntry(r, dateKey, completedAt)].slice(-30),
            xp: (prof.xp ?? 0) + XP_RULES.mock,
          });
          for (const s of r.skills) trackAdv('readiness_skill_updated', { locale: lang, skillType: s as ExamSkill });
        }}
        onClose={() => setView('home')}
      />
    );
  }

  // ── 言い直し（素材0件でも必ず進める・§14）──
  if (view === 'restate') {
    // ① 今日のAI会話レポートの修正が最優先素材（正準Journey「AI会話→レポート→言い直し」）
    const todayCorrection = (() => {
      for (const s of [...props.sessions].reverse()) {
        if (s.startedAt.slice(0, 10) !== dateKey) continue;
        const c = s.report?.corrections?.[0];
        if (c && c.original.trim() && c.improved.trim()) return { beforeJa: c.original, afterJa: c.improved };
      }
      return null;
    })();
    // ② バトル誤答は内部IDではなくpatternで見せる（原則13）。patternを引けないIDは素材にしない
    const wrongExpressions = Object.entries(prof.mastery)
      .filter(([id, at]) => (id.startsWith('n2g-') || id.startsWith('n3g-')) && at && at[at.length - 1]?.scorePct < 80)
      .map(([id]) => grammarPatternById(id))
      .filter((p): p is string => p !== null)
      .slice(0, 3)
      .map((p) => ({ expression: p, meaningJa: tx(lang, 'バトルで間違えた文法', '战斗中答错的语法') }));
    const material = pickRestateMaterial({
      conversationCorrection: todayCorrection,
      battleMistakes: wrongExpressions,
      targetExpressions: quest?.targetExpressions ?? [],
      usedExpressions: [],
    });
    const stepIdx = quest?.steps.findIndex((s) => s.kind === 'restate') ?? -1;
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={tx(lang, '言い直し', '改口练习')} teacherLang={lang} />
        <div className={card}>
          <p className="text-sm font-semibold text-gray-900">{tx(lang, material.titleJa, material.titleZh)}</p>
          {material.beforeJa && (
            <p className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-gray-900">✕ {material.beforeJa}</p>
          )}
          {material.afterJa && (
            <p className="mt-1 rounded bg-emerald-50 px-2 py-1 text-sm text-gray-900">◯ {material.afterJa}</p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-gray-700">
            {tx(lang, material.instructionJa, material.instructionZh)}
          </p>
        </div>
        <button type="button" className={`${primaryBtn} mt-4`}
          onClick={() => { if (stepIdx >= 0) markStep(stepIdx); setView('home'); }}>
          {material.source === 'none'
            ? tx(lang, '次に進む', '继续')
            : tx(lang, '言えた（次に進む）', '说出来了（继续）')}
        </button>
      </div>
    );
  }

  // ── grammar study ──
  if (view === 'grammar' && studyGrammarId) {
    return (
      <AdvGrammarStudy
        lang={lang} grammarId={studyGrammarId} doc={grammarDoc} setDoc={setGrammarDoc}
        onBattle={() => {
          setBattle({
            // masteryはN3文法を束（n3g-unit-*）で判定するため、確認バトルも束のプールで戦う
            tier: 'normal',
            targetId: stageCt?.grammarBundleByItem.get(studyGrammarId) ?? studyGrammarId,
            targetLabel: grammarDoc?.pattern ?? studyGrammarId,
            targetIds: [stageCt?.grammarBundleByItem.get(studyGrammarId) ?? studyGrammarId],
          });
          setView('battle');
        }}
        onBack={() => { setStudyGrammarId(null); setGrammarDoc(null); setView('home'); }}
        onLearned={() => {
          const i = quest?.steps.findIndex((s) => s.kind === 'grammar_new') ?? -1;
          if (i >= 0) markStep(i);
        }}
      />
    );
  }

  // ── 错题本（間違えた問題ノート・2026-08-17） ──
  //
  // 中国語話者の受験文化で最も信頼されている学習法。期限ベースの復習（システムが決めた日）と違い、
  // **自分の意思でいま弱いところを潰せる**のがここ。
  // 「克服」の定義（別の日に2回続けて正解）と、数えている範囲（台帳に残っている記録だけ）を
  // 画面上で必ず断る（原則13: 数字を作らない）。
  if (view === 'mistakes') {
    const summary = summarizeMistakes(notebook);
    // 解き直しは「いま出題できる問題」だけを対象にする。プールから消えた問題を
    // 「解き直せます」と出すと押しても何も起きない（原則15: 行き止まりを作らない）
    const resolvable = new Map<string, AdvBattleQuestion>();
    if (pools) for (const qs of pools.byItem.values()) for (const q of qs) resolvable.set(q.key, q);
    const redoKeys = pickMistakeReviewKeys(notebook, 10).filter((k) => resolvable.has(k));
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={tx(lang, '間違えた問題ノート', '错题本')} teacherLang={lang} />
        <div className={card}>
          <p className="text-sm font-bold text-gray-900">{lang === 'zh' ? summary.headline.zh : summary.headline.ja}</p>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">{lang === 'zh' ? summary.note.zh : summary.note.ja}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">{lang === 'zh' ? summary.coverageNote.zh : summary.coverageNote.ja}</p>
          {summary.unverifiedNote && (
            <p className="mt-1 text-xs leading-relaxed text-amber-700">
              {lang === 'zh' ? summary.unverifiedNote.zh : summary.unverifiedNote.ja}
            </p>
          )}
        </div>

        {redoKeys.length > 0 && (
          <button type="button"
            className={`${pressFx} action-primary-blue mt-4 w-full min-h-[52px] rounded-xl bg-blue-600 px-4 text-base font-bold text-white`}
            onClick={() => {
              setMistakeKeys(redoKeys);
              setBattle({
                tier: 'normal', targetId: MISTAKE_TARGET_ID,
                targetLabel: tx(lang, '間違えた問題の解き直し', '错题重做'),
                targetIds: [MISTAKE_TARGET_ID],
              });
              setView('battle');
            }}>
            {tx(lang, `間違えた問題を解き直す（${redoKeys.length}問）`, `重做错题（${redoKeys.length}题）`)}
          </button>
        )}
        {/* 出題できるものが1問も無いときは、押せないボタンを置かずに理由を書く */}
        {redoKeys.length === 0 && notebook.entries.length > 0 && (
          <p className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
            {tx(lang,
              'いまここから解き直せる問題はありません（読解・聴解・模試で間違えたぶんは、それぞれの練習から出ます）。',
              '现在这里没有可以重做的题（阅读・听力・模拟考的错题会在各自的练习里出现）。')}
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {notebook.entries.slice(0, 40).map((e) => {
            const st = mistakeStatusText(e);
            const doneMark = e.resolution === 'overcome';
            return (
              <li key={e.questionKey}
                className={`rounded-xl border p-3 ${doneMark ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-start justify-between gap-2">
                  {/* 問題文そのものは持たない設計なので、何の問題かは「学習対象」で示す（内部IDは出さない） */}
                  <p className="text-sm font-semibold text-gray-800">
                    {grammarPatternById(e.targetId) ?? targetLabelOf(e.targetId, lang)}
                  </p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    doneMark ? 'bg-emerald-600 text-white'
                      : e.resolution === 'unverifiable' ? 'bg-amber-500 text-white' : 'bg-gray-500 text-white'}`}>
                    {doneMark ? tx(lang, MISTAKE_TERMS.overcome.ja, MISTAKE_TERMS.overcome.zh)
                      : e.resolution === 'unverifiable'
                        ? tx(lang, MISTAKE_TERMS.unverifiable.ja, MISTAKE_TERMS.unverifiable.zh)
                        : tx(lang, MISTAKE_TERMS.unresolved.ja, MISTAKE_TERMS.unresolved.zh)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-600">{lang === 'zh' ? st.zh : st.ja}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {tx(lang, `間違えた回数 ${e.wrongCount}回／最後は${e.daysSinceLastWrong}日前`,
                    `做错 ${e.wrongCount}次／最近一次是${e.daysSinceLastWrong}天前`)}
                </p>
              </li>
            );
          })}
        </ul>
        {notebook.entries.length > 40 && (
          <p className="mt-2 text-center text-xs text-gray-400">
            {tx(lang, `ほかに${notebook.entries.length - 40}問あります（優先度の高い順に40問を表示）`,
              `另有${notebook.entries.length - 40}题（按优先级显示前40题）`)}
          </p>
        )}
      </div>
    );
  }

  // ── 成長マップ（旧「成長」の12週リストと旧ルート表示をここへ統合・canon §5） ──
  //
  // 地図の各地域のCTAは**実際の行動へ繋ぐ**（原則15・行き止まりを作らない）。
  // 使えない行き先（復習が0件・会話が未開放）は AdvAdventureMap 側で今日の冒険へ倒れる。
  if (view === 'map') {
    const mapNextIdx = quest ? quest.steps.findIndex((_, i) => !doneSteps.has(i)) : -1;
    const mapNextStep = quest && mapNextIdx >= 0 ? quest.steps[mapNextIdx] : null;
    const mapDays = daysToExamOf(prof.examDateISO, dateKey);
    const mapPace = pools && prof.goalType !== 'conversation'
      ? computePace({
        route, ledger: prof.mastery, nowISO,
        daysToExam: mapDays !== null && mapDays >= 0 ? mapDays : null,
        stageDone: deriveMasteredStageIds(route, masteredTargetIds(prof.mastery, nowISO), pools.n3Ids, pools.n2ByUnit, pools.n3BundleByItem, pools.basicByUnit, pools.basicBundleByUnit),
        n3Ids: pools.n3Ids, n2ByUnit: pools.n2ByUnit, n3BundleByItem: pools.n3BundleByItem,
        basicByUnit: pools.basicByUnit,
        basicBundleByUnit: pools.basicBundleByUnit,
      })
      : null;
    return (
      <AdvAdventureMap
        lang={lang}
        profile={prof}
        route={route}
        mastered={masteredTargetIds(prof.mastery, nowISO)}
        paceNoteJa={mapPace && mapPace.remainingTargets > 0
          ? `目的地まで残り${mapPace.remainingStages}地域・${mapPace.remainingTargets}項目${mapPace.estWeeksLeft !== null && mapPace.estWeeksLeft > 0 ? `／いまのペースだと約${mapPace.estWeeksLeft}週間（推定）` : ''}`
          : null}
        paceNoteZh={mapPace && mapPace.remainingTargets > 0
          ? `距离目的地还剩${mapPace.remainingStages}个地区・${mapPace.remainingTargets}个项目${mapPace.estWeeksLeft !== null && mapPace.estWeeksLeft > 0 ? `／按现在的节奏约需${mapPace.estWeeksLeft}周（推算）` : ''}`
          : null}
        currentWeek={learner.currentWeek ?? 1}
        quest={quest}
        nextStepTitleJa={mapNextStep?.titleJa ?? null}
        nextStepTitleZh={mapNextStep?.titleZh ?? null}
        onStartToday={() => setView('home')}
        onBack={() => setView('home')}
        onOpenReview={props.onOpenReview}
        reviewAvailable={props.reviewsDue > 0}
        onStartConversation={() => {
          trackAdv('conversation_started', { locale: lang });
          props.onStartConversation();
        }}
        conversationAvailable={props.conversationAvailable}
        onOpenMock={openMock}
        sheetsVisible={answerSheetsVisible(prof)}
        sheetCount={prof.answerSheets.length}
        onOpenSheets={() => setView('sheets')}
        interviewVisible={interviewPrepVisible(prof)}
        onOpenInterview={() => setView('interview')}
      />
    );
  }

  if (view === 'readiness') {
    const r = computeReadiness(prof.targetJlpt ?? 'N2', prof.skills, prof.mastery, prof.mockLog);
    const gateRows: { key: keyof typeof r.overallGate; ja: string; zh: string }[] = [
      { key: 'languageKnowledgeEvidence', ja: '言語知識（文字・語彙・文法）のデータ', zh: '语言知识（文字・词汇・语法）数据' },
      { key: 'readingEvidence', ja: '読解のデータ', zh: '阅读数据' },
      { key: 'listeningEvidence', ja: '聴解のデータ', zh: '听力数据' },
      { key: 'timedEvidence', ja: '制限時間つきの記録', zh: '限时记录' },
      { key: 'unseenEvidence', ja: '初めて見る問題での記録', zh: '首次见到的题的记录' },
      { key: 'delayedEvidence', ja: '7日後の測り直し', zh: '7天后的复测' },
      { key: 'mockCount', ja: `ミニ模試 ${r.mockCount}/3回`, zh: `迷你模拟考 ${r.mockCount}/3次` },
    ];
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={`${prof.targetJlpt ?? 'N2'}${term('readiness', lang)}`}
          teacherLang={lang} />
        <div className={`${card} mb-3 bg-gray-50`}>
          <p className="text-xs font-semibold text-gray-700">{tx(lang, '本試験の構成', '本考试的构成')}</p>
          <ul className="mt-1 space-y-0.5">
            {r.examParts.map((p) => (
              <li key={p.labelJa} className="text-xs text-gray-600">
                ・{tx(lang, p.labelJa, p.labelZh)}（{p.minutes}{tx(lang, '分', '分钟')}）
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          {r.rows.map((row) => (
            <div key={row.key} className={card}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {tx(lang, row.labelJa, row.labelZh)}
                    {row.sectionJa && (
                      <span className="ml-1 text-[11px] font-normal text-gray-400">
                        （{tx(lang, row.sectionJa, row.sectionZh ?? row.sectionJa)}）
                      </span>
                    )}
                    {row.provisional && row.pct !== null && <span className="ml-1 text-xs text-amber-700">（{term('provisional', lang)}）</span>}
                  </p>
                  {(row.noteJa || row.noteZh) && <p className="text-xs text-gray-500">{tx(lang, row.noteJa ?? '', row.noteZh ?? '')}</p>}
                  <p className="mt-1 text-[11px] text-gray-400">
                    {tx(lang, '出題', '出题')}{row.evidence.evidenceCount}・{tx(lang, '未出', '未见过')}{row.evidence.unseenQuestionCount}・
                    {tx(lang, '7日後', '7天后')}{row.evidence.delayedEvidenceCount}・{tx(lang, '時間つき', '限时')}{row.evidence.timedEvidenceCount}
                  </p>
                </div>
                <p className={`shrink-0 text-xl font-bold ${row.pct === null ? 'text-gray-400' : 'text-blue-800'}`}>
                  {row.pct === null ? term('undetermined', lang) : `${row.pct}%`}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className={`${card} mt-4 bg-blue-50`}>
          <p className="text-sm font-bold text-gray-900">
            {tx(lang, '総合', '综合')}：{r.overallPct === null ? term('undetermined', lang) : `${r.overallPct}%`}
          </p>
          {r.overallPct === null && (
            <ul className="mt-1 space-y-0.5">
              {(lang === 'zh' ? r.overallBlockersZh : r.overallBlockersJa).slice(0, 3).map((b) => (
                <li key={b} className="text-xs text-gray-700">・{b}</li>
              ))}
            </ul>
          )}
          {r.topIssueJa && <p className="mt-1 text-sm text-gray-700">{tx(lang, r.topIssueJa, r.topIssueZh ?? '')}</p>}
          <p className="mt-2 text-xs leading-relaxed text-gray-600">{tx(lang, r.summaryJa, r.summaryZh)}</p>
        </div>

        {/* 総合を出すための条件（§10）。何が足りないかを隠さない */}
        <div className={`${card} mt-3`}>
          <p className="text-sm font-bold text-gray-900">{tx(lang, '総合準備度を出す条件', '给出综合准备度的条件')}</p>
          <ul className="mt-1 space-y-0.5">
            {gateRows.map((g) => (
              <li key={g.key} className="flex items-center gap-2 text-xs">
                <span aria-hidden className={r.overallGate[g.key] ? 'text-emerald-600' : 'text-gray-300'}>
                  {r.overallGate[g.key] ? '✓' : '○'}
                </span>
                <span className={r.overallGate[g.key] ? 'text-gray-700' : 'text-gray-500'}>{tx(lang, g.ja, g.zh)}</span>
              </li>
            ))}
          </ul>
          {!r.overallGate.mockCount && (
            <button type="button" className={`${primaryBtn} mt-3`} onClick={openMock}>
              {tx(lang, 'ミニ模試を受ける', '参加迷你模拟考')}
            </button>
          )}
        </div>
        <div className={`${card} mt-3`}>
          <p className="text-sm font-bold text-gray-900">{tx(lang, '会話・実践力（JLPTとは別）', '会话・实践力（与JLPT分开）')}</p>
          {r.practical.map((p) => (
            <div key={p.key} className="mt-1 flex items-center justify-between">
              <span className="text-sm text-gray-700">{tx(lang, p.labelJa, p.labelZh)}</span>
              <span className={`text-sm font-bold ${p.pct === null ? 'text-gray-400' : 'text-emerald-700'}`}>
                {p.pct === null ? term('undetermined', lang) : `${p.pct}%`}
              </span>
            </div>
          ))}
          <p className="mt-1 text-xs text-gray-500">{tx(lang, r.practical[0].noteJa, r.practical[0].noteZh)}</p>
        </div>
      </div>
    );
  }

  // ── 人間レッスン準備 ──
  if (view === 'prep') {
    const s = buildLessonPrepSummary(prof, nowISO);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={term('seeTeacherPrep', lang)} teacherLang={lang} />
        <div className={card}>
          <p className="text-sm text-gray-700">{tx(lang, `今週の学習：${s.weekStudyDays}日`, `本周学习：${s.weekStudyDays}天`)}</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">{tx(lang, '次の先生レッスンで扱うこと', '下次真人课要处理的内容')}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
            {(lang === 'zh' ? s.learnerViewZh : s.learnerViewJa).map((t2) => <li key={t2}>{t2}</li>)}
            {s.learnerViewJa.length === 0 && <li>{tx(lang, 'まだデータが少ないです。冒険を続けると候補が出ます。', '数据还不多。继续冒险后会出现候选。')}</li>}
          </ul>
        </div>
        {/* 先生に相談したいこと（2026-08-17 監査: humanLesson.learnerTopicsの表示側は
            実装済みなのに、書く場所がどこにも無かった）。最大3件・1件60字 */}
        <div className={`${card} mt-3`}>
          <p className="text-sm font-semibold text-gray-900">
            {tx(lang, '先生に相談したいこと（レッスンで扱ってほしいこと）', '想和老师商量的事（希望课上处理的内容）')}
          </p>
          <ul className="mt-1 space-y-1">
            {(prof.humanLesson.learnerTopics ?? []).map((t2, i) => (
              <li key={`${t2}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-sm text-gray-800">
                <span className="min-w-0 flex-1">・{t2}</span>
                <button type="button" aria-label={tx(lang, 'この相談を削除', '删除这条')}
                  className={`${pressFx} shrink-0 rounded px-2 text-xs text-gray-400 active:bg-gray-200`}
                  onClick={() => save({
                    ...prof,
                    humanLesson: {
                      ...prof.humanLesson,
                      learnerTopics: (prof.humanLesson.learnerTopics ?? []).filter((_, j) => j !== i),
                    },
                  })}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {(prof.humanLesson.learnerTopics ?? []).length < 3 ? (
            <form className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('topic') as HTMLInputElement | null;
                const v = input?.value.trim().slice(0, 60) ?? '';
                if (!v) return;
                save({
                  ...prof,
                  humanLesson: {
                    ...prof.humanLesson,
                    learnerTopics: [...(prof.humanLesson.learnerTopics ?? []), v],
                  },
                });
                if (input) input.value = '';
              }}>
              <input name="topic" type="text" maxLength={60}
                placeholder={tx(lang, '例：電話で日程を変更する言い方', '例如：打电话改时间的说法')}
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="submit"
                className={`${pressFx} action-secondary min-h-[44px] shrink-0 rounded-xl border border-blue-600 bg-white px-4 text-sm font-bold text-blue-700`}>
                {tx(lang, '追加', '添加')}
              </button>
            </form>
          ) : (
            <p className="mt-2 text-xs text-gray-500">
              {tx(lang, '相談は3件まで。レッスンで扱ったら消して、次を追加してください。', '最多3条。课上处理完后删除，再添加新的。')}
            </p>
          )}
          <p className="mt-1.5 text-xs text-gray-400">
            {tx(lang, 'ここに書いたことは先生に共有され、次のレッスンの材料になります。',
              '写在这里的内容会共享给老师，作为下次课的材料。')}
          </p>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {tx(lang, 'AIが毎日の量を担当し、先生は難所攻略と方向修正に集中します。', 'AI负责每天的练习量，老师专注于攻克难点和调整方向。')}
        </p>
        {/* 次の一歩を必ず示す（canon 原則15）。戻る矢印だけを次の一歩にしない */}
        <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setView('home')}>
          {tx(lang, '今日の冒険へ戻る', '回到今天的冒险')}
        </button>
      </div>
    );
  }

  // ── 週のまとめ（PRODUCT_CANON §6）。数値の羅列ではなく「何ができるようになったか」を先に出す ──
  if (view === 'weekly') {
    const wk = buildWeeklySummary(prof, nowISO, props.sessions);
    const wkDays = daysToExamOf(prof.examDateISO, dateKey);
    const wkPace = pools && prof.goalType !== 'conversation'
      ? computePace({
        route, ledger: prof.mastery, nowISO,
        daysToExam: wkDays !== null && wkDays >= 0 ? wkDays : null,
        stageDone: deriveMasteredStageIds(route, masteredTargetIds(prof.mastery, nowISO), pools.n3Ids, pools.n2ByUnit, pools.n3BundleByItem, pools.basicByUnit, pools.basicBundleByUnit),
        n3Ids: pools.n3Ids, n2ByUnit: pools.n2ByUnit, n3BundleByItem: pools.n3BundleByItem,
        basicByUnit: pools.basicByUnit,
        basicBundleByUnit: pools.basicBundleByUnit,
      })
      : null;
    weeklyTracked.current ||= (() => {
      trackAdv('weekly_learning_days', { countBucket: bucketOf(wk.studyDays), targetLevel: prof.targetJlpt ?? undefined, locale: lang });
      trackAdv('weekly_quest_completion', { countBucket: bucketOf(wk.completedQuests), locale: lang });
      return true;
    })();
    const measurable = wk.skillChanges.filter((c) => c.deltaPct !== null);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={() => setView('home')} title={tx(lang, '今週のまとめ', '本周小结')} teacherLang={lang} />

        {/* いちばん上は数値ではなく「何ができるようになったか」 */}
        <div className={`${card} border-blue-200`}>
          <div className="flex items-start gap-3">
            <TeacherAvatar size={40} expression="smile" lang={lang} className={`shrink-0 ring-2 ${teacher.ringClass}`} />
            <p className="text-sm leading-relaxed text-gray-800">{tx(lang, wk.headlineJa, wk.headlineZh)}</p>
          </div>
          {/* 相棒のひとこと（§8）。学習した週だけ出す（記録ゼロの週に褒めない・原則13） */}
          {prof.companionId && wk.studyDays > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-600">
              <CompanionAvatar id={prof.companionId} size={20} />
              <span>
                <span className="font-semibold">{tx(lang, companionById(prof.companionId).nameJa, companionById(prof.companionId).nameZh)}</span>
                ：{tx(lang, companionById(prof.companionId).weeklyJa, companionById(prof.companionId).weeklyZh)}
              </span>
            </p>
          )}
        </div>

        <div className={`${card} mt-3`}>
          <p className="text-sm text-gray-700">
            {tx(lang, `学習した日：${wk.studyDays}日`, `学习天数：${wk.studyDays}天`)}
            {' ／ '}
            {tx(lang, `やりきった冒険：${wk.completedQuests}回`, `完成的冒险：${wk.completedQuests}次`)}
            {wk.mockCount > 0 && ` ／ ${tx(lang, `ミニ模試：${wk.mockCount}回`, `迷你模拟考：${wk.mockCount}次`)}`}
            {wk.conversationCount > 0 && ` ／ ${tx(lang, `AI会話：${wk.conversationCount}回`, `AI会话：${wk.conversationCount}次`)}`}
          </p>
          {wk.estimatedMinutes !== null && (
            <p className="mt-1 text-xs text-gray-400">
              {tx(lang, `学習時間はおおよそ${wk.estimatedMinutes}分（設定した1日の時間からの目安です）`,
                `学习时间大约${wk.estimatedMinutes}分钟（根据设定的每日时长估算）`)}
            </p>
          )}
          {/* オンボーディングで決めた「週◯日」を実測と並べる（聞いた決断を効かせる・原則17。週の途中でも嘘にならない事実表記） */}
          {prof.weeklyDays !== null && (
            <p className="mt-1 text-xs text-gray-500">
              {tx(lang, `はじめに決めた予定：週${prof.weeklyDays}日／今週ここまで：${wk.studyDays}日`,
                `一开始定的计划：每周${prof.weeklyDays}天／本周到目前：${wk.studyDays}天`)}
            </p>
          )}
          {/* 目的地までの残りと実測ペース（CEO要望 2026-08-14）。未測定の値は出さない（原則13） */}
          {wkPace && wkPace.remainingTargets > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              {tx(lang, `目的地まで残り${wkPace.remainingTargets}項目`, `距离目的地还剩${wkPace.remainingTargets}个项目`)}
              {wkPace.measuredPerWeek !== null && tx(lang,
                `／いまの実測ペース：週${wkPace.measuredPerWeek}項目`, `／目前实测节奏：每周${wkPace.measuredPerWeek}个`)}
              {wkPace.neededPerWeek !== null && wkPace.neededPerWeek > 0 && tx(lang,
                `／受験日までに終えるには週${wkPace.neededPerWeek}項目`, `／要赶上考试日需每周${wkPace.neededPerWeek}个`)}
            </p>
          )}
        </div>

        {/* あゆみのカレンダー（直近5週・実測のみ）。「積み上げてきた事実」を物的証拠として見せる
            （2026-08-17 競合調査: WaniKaniヒートマップ/中国系打卡文化。金額に見合う蓄積の可視化） */}
        {(() => {
          const activeDays = new Set<string>();
          for (const q of prof.questLog) activeDays.add(q.dateKey);
          for (const at of Object.values(prof.mastery)) for (const a of at ?? []) activeDays.add(a.dateKey);
          if (activeDays.size === 0) return null;
          const today = Date.parse(dateKey);
          const cells: { key: string; active: boolean; isToday: boolean }[] = [];
          for (let i = 34; i >= 0; i -= 1) {
            const k = new Date(today - i * 86400000).toISOString().slice(0, 10);
            cells.push({ key: k, active: activeDays.has(k), isToday: k === dateKey });
          }
          return (
            <div className={`${card} mt-3`}>
              <p className="text-sm font-semibold text-gray-900">{tx(lang, 'あゆみ（直近5週間）', '足迹（最近5周）')}</p>
              <div className="mt-2 grid grid-cols-7 gap-1" aria-hidden>
                {cells.map((c) => (
                  <span key={c.key}
                    className={`h-5 rounded ${c.active ? 'bg-emerald-400' : 'bg-gray-100'} ${c.isToday ? 'ring-2 ring-blue-400' : ''}`} />
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {tx(lang, `通算学習日数：${activeDays.size}日。休んだ日があっても、積み上げは消えません。`,
                  `累计学习天数：${activeDays.size}天。即使有休息的日子，积累也不会消失。`)}
              </p>
            </div>
          );
        })()}

        {wk.newlyMastered.length > 0 && (
          <div className={`${card} mt-3`}>
            <p className="text-sm font-semibold text-gray-900">{tx(lang, '今週あたらしく定着したもの', '本周新巩固的内容')}</p>
            <p className="mt-1 text-sm text-gray-700">
              {tx(lang, `${wk.newlyMastered.length}項目`, `${wk.newlyMastered.length}个项目`)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {tx(lang, '別の日に3回できて、時間をおいた確認も通ったものだけを数えています。',
                '只统计在不同日子做对3次、并且隔一段时间再确认也通过的内容。')}
            </p>
          </div>
        )}

        <div className={`${card} mt-3`}>
          <p className="text-sm font-semibold text-gray-900">{tx(lang, '技能ごとの変化', '各项能力的变化')}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {wk.skillChanges.map((c) => (
              <li key={c.skill} className="flex items-center justify-between gap-2">
                <span className="text-gray-700">{tx(lang, c.labelJa, c.labelZh)}</span>
                <span className={c.deltaPct === null ? 'text-gray-400' : c.deltaPct > 0 ? 'text-emerald-700 font-semibold' : 'text-gray-600'}>
                  {c.deltaPct === null
                    ? tx(lang, '未判定', '尚未判定')
                    : `${c.deltaPct > 0 ? '+' : ''}${c.deltaPct}${tx(lang, 'ポイント', '个百分点')}`}
                </span>
              </li>
            ))}
          </ul>
          {measurable.length === 0 && (
            <p className="mt-2 text-xs text-gray-500">
              {tx(lang, '変化を出すには、同じ技能を2週続けて10問以上解く必要があります。数字を作らず「未判定」と表示しています。',
                '要判断变化，需要同一项能力连续两周各做满10题以上。在此之前显示「尚未判定」，不编造数字。')}
            </p>
          )}
        </div>

        <div className={`${card} mt-3`}>
          <p className="text-sm font-semibold text-gray-900">{tx(lang, '来週の重点', '下周的重点')}</p>
          <p className="mt-1 text-sm text-gray-700">{tx(lang, wk.nextWeekJa, wk.nextWeekZh)}</p>
        </div>

        <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setView('home')}>
          {tx(lang, '今日の冒険へ', '去今天的冒险')}
        </button>
        <div className="mt-2">
          <SubLink lang={lang} label={term('seeTeacherPrep', lang)}
            onClick={() => { trackAdv('human_lesson_summary_viewed', { locale: lang }); setView('prep'); }} />
        </div>
      </div>
    );
  }

  // ── complete ──
  if (view === 'complete' && quest) {
    const mastered = masteredTargetIds(prof.mastery, nowISO);
  const stageDoneC = pools ? deriveMasteredStageIds(route, mastered, pools.n3Ids, pools.n2ByUnit, pools.n3BundleByItem, pools.basicByUnit, pools.basicBundleByUnit) : mastered;
    const daily = buildDailySummary(prof, dateKey, nowISO);
    // 今日「直した表現」。言い直しstepと同じ素材の作り方をそろえる
    const completeCorrection = (() => {
      for (const s of [...props.sessions].reverse()) {
        if (s.startedAt.slice(0, 10) !== dateKey) continue;
        const c = s.report?.corrections?.[0];
        if (c && c.original.trim() && c.improved.trim()) return { beforeJa: c.original, afterJa: c.improved };
      }
      return null;
    })();
    const todayRestate = pickRestateMaterial({
      conversationCorrection: completeCorrection,
      battleMistakes: Object.entries(prof.mastery)
        .filter(([id, at]) => (id.startsWith('n2g-') || id.startsWith('n3g-'))
          && at && at[at.length - 1]?.dateKey === dateKey && at[at.length - 1]?.scorePct < 80)
        .map(([id]) => grammarPatternById(id))
        .filter((p): p is string => p !== null)
        .slice(0, 1)
        .map((p) => ({ expression: p, meaningJa: tx(lang, 'バトルで間違えた文法', '战斗中答错的语法') })),
      targetExpressions: quest.targetExpressions,
      usedExpressions: [],
    });
    return (
      <div className={`mx-auto w-full max-w-xl px-4 py-6 ${riseIn}`}>
        <div className="flex items-center gap-3">
          <TeacherAvatar size={44} expression="smile" lang={lang} className={`shrink-0 ring-2 ${teacher.ringClass}`} />
          <h2 className="text-lg font-bold text-gray-900">{tx(lang, '今日の冒険 おつかれさま！', '今天的冒险辛苦了！')}</h2>
        </div>
        {/* 相棒の労い（相棒で「応援のしかたが変わる」を締めくくりでも果たす） */}
        {prof.companionId && (
          <div className="mt-2 flex items-center gap-2">
            <CompanionAvatar id={prof.companionId} size={28} />
            <p className="text-xs text-gray-600">
              <span className="font-semibold">{tx(lang, companionById(prof.companionId).nameJa, companionById(prof.companionId).nameZh)}</span>
              ：{tx(lang, companionById(prof.companionId).doneJa, companionById(prof.companionId).doneZh)}
            </p>
          </div>
        )}
        <div className={`${card} mt-3`}>
          <p className="text-sm font-semibold text-gray-900">{tx(lang, '今日できたこと', '今天做到的事')}</p>
          <ul className="mt-1 space-y-1 text-sm text-gray-700">
            {quest.steps.map((s, i) => (
              <li key={s.titleJa + i}>{doneSteps.has(i) ? '✅' : '⬜'} {tx(lang, s.titleJa, s.titleZh)}</li>
            ))}
          </ul>
        </div>
        {quest.targetExpressions.length > 0 && (
          <div className={`${card} mt-3`}>
            <p className="text-sm font-semibold text-gray-900">{tx(lang, '今日の表現', '今天的表达')}</p>
            <p className="mt-1 text-sm text-gray-700">{quest.targetExpressions.join('・')}</p>
          </div>
        )}
        {lastMastery && (
          <div className={`${card} mt-3`}>
            <p className="text-sm font-semibold text-gray-900">{tx(lang, 'バトルの成果', '战斗成果')}</p>
            <p className="mt-1 text-sm text-gray-700">{tx(lang, lastMastery.nextJa, lastMastery.nextZh)}</p>
          </div>
        )}
        {/* 今回伸びた技能。**解いていない技能は出さない**（0%と並べて誤読させない・canon 原則13） */}
        {daily.skillResults.length > 0 && (
          <div className={`${card} mt-3`}>
            <p className="text-sm font-semibold text-gray-900">{tx(lang, '今日の手ごたえ', '今天的手感')}</p>
            <ul className="mt-1 space-y-1 text-sm text-gray-700">
              {daily.skillResults.map((r) => (
                <li key={r.skill} className="flex items-center justify-between gap-2">
                  <span>{tx(lang, r.labelJa, r.labelZh)}</span>
                  <span className="text-gray-600">{r.correct}/{r.total}（{r.pct}%）</span>
                </li>
              ))}
            </ul>
            {daily.newlyMasteredToday > 0 && (
              <p className="mt-2 text-sm font-semibold text-emerald-700">
                {tx(lang, `今日、${daily.newlyMasteredToday}項目が定着まで届きました`,
                  `今天有${daily.newlyMasteredToday}个项目达到了巩固`)}
              </p>
            )}
          </div>
        )}

        {/* 直した表現（AI会話の言い直し素材）。無いときは出さない */}
        {todayRestate.source !== 'none' && (todayRestate.beforeJa || todayRestate.afterJa) && (
          <div className={`${card} mt-3`}>
            <p className="text-sm font-semibold text-gray-900">{tx(lang, '直した表現', '改正的表达')}</p>
            {todayRestate.beforeJa && (
              <p className="mt-1 rounded bg-red-50 px-2 py-1 text-sm text-gray-900">✕ {todayRestate.beforeJa}</p>
            )}
            {todayRestate.afterJa && (
              <p className="mt-1 rounded bg-emerald-50 px-2 py-1 text-sm text-gray-900">◯ {todayRestate.afterJa}</p>
            )}
          </div>
        )}

        <div className={`${card} mt-3`}>
          <p className="text-sm font-semibold text-gray-900">{term('masteryRate', lang)}</p>
          <p className="mt-1 text-sm text-gray-700">{routeProgressPct(route, stageDoneC)}%</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">{tx(lang, '次の復習', '下次复习')}</p>
          <p className="mt-1 text-sm text-gray-700">
            {props.reviewsDue > 0 ? tx(lang, `残り${props.reviewsDue}件`, `还剩${props.reviewsDue}项`) : tx(lang, '明日・約3分', '明天・约3分钟')}
          </p>
          {/* 次の冒険を必ず示す（canon 原則15: 行き止まりを作らない） */}
          <p className="mt-2 text-sm font-semibold text-gray-900">{tx(lang, '次の冒険', '下次冒险')}</p>
          <p className="mt-1 text-sm text-gray-700">
            {tx(lang, `明日・約${prof.dailyMinutes ?? 15}分。${teacherLabel}が続きを用意します。`,
              `明天・约${prof.dailyMinutes ?? 15}分钟。${teacherLabel}会准备好接下来的内容。`)}
          </p>
        </div>
        <p className="mt-4 text-center">
          {/* 締めくくり保存が先に走るので prof.xp は加算済み。ここで再加算しない */}
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-amber-800">
            ⭐ XP +{doneSteps.size * XP_RULES.questStep}
            <span className="font-normal">
              {tx(lang, `｜合計 ${prof.xp ?? 0}・Lv.${levelOf(prof.xp ?? 0)}`, `｜共计 ${prof.xp ?? 0}・Lv.${levelOf(prof.xp ?? 0)}`)}
            </span>
          </span>
        </p>
        <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setView('home')}>
          {tx(lang, 'ホームへ', '回到主页')}
        </button>
        <div className="mt-2">
          <SubLink lang={lang} label={tx(lang, '今週のまとめを見る', '查看本周小结')}
            onClick={() => { trackAdv('weekly_progress_viewed', { locale: lang }); setView('weekly'); }} />
        </div>
      </div>
    );
  }

  // ── home（1画面1決断） ──
  const mastered = masteredTargetIds(prof.mastery, nowISO);
  const stageDone = pools ? deriveMasteredStageIds(route, mastered, pools.n3Ids, pools.n2ByUnit, pools.n3BundleByItem, pools.basicByUnit, pools.basicBundleByUnit) : mastered;
  const stage = currentStageOf(route, stageDone);
  const daysToExam = daysToExamOf(prof.examDateISO, dateKey);
  // 目的地までの残り量と実測ペース（原則13: ペース・予測は実測2週未満ならnull＝出さない）
  const pace = pools && prof.goalType !== 'conversation'
    ? computePace({
      route, ledger: prof.mastery, nowISO,
      daysToExam: daysToExam !== null && daysToExam >= 0 ? daysToExam : null,
      stageDone, n3Ids: pools.n3Ids, n2ByUnit: pools.n2ByUnit, n3BundleByItem: pools.n3BundleByItem,
        basicByUnit: pools.basicByUnit,
        basicBundleByUnit: pools.basicBundleByUnit,
    })
    : null;
  const allDone = quest !== null && nextStepIdx === -1;
  const trainingSkill = nextStep ? skillOfStep(nextStep.kind) : 'grammar';
  // 中断した模試・進行中の答案用紙は残り時間が壁時計で動いているので、その間は「今日の一手」を再開側にする。
  // 主要CTAを2つ並べない（canon 原則3）ため、今日の冒険側は副次スタイルへ落とす。
  const mockPending = prof.mockSession !== null;
  // 進行中の答案の紙が手元にまだあるか。紙が消えていたら（発行取り下げ等）
  // 「再開できます」と言い続けない（原則13）。破棄の出口を出す（原則15）
  const sheetSession = prof.answerSheetSession;
  const sheetPaper = sheetSession ? paperById(prof, sheetSession.paperId) : null;
  const sheetResumable = !!sheetSession && !!sheetPaper && sheetSession.sectionIndex < sheetPaper.sections.length;

  const runStep = (i: number) => {
    if (!quest) return;
    const s = quest.steps[i];
    setStepNotice(null);
    trackAdv('today_quest_started', { goalType: prof.goalType ?? undefined, routeStage: stage?.kind, durationBucket: String(prof.dailyMinutes ?? 15) as '5' | '15' | '30', locale: lang });
    // 押しただけでは完了にしない（2026-08-17 CEO報告: 開いて戻ったら✓になっていた）。
    // 復習は期限切れが0件になったときに、下の効果で自動的に完了する
    if (s.kind === 'review_due') { props.onOpenReview(); return; }
    if (s.kind === 'conversation_mission') {
      if (props.conversationAvailable) { trackAdv('conversation_started', { locale: lang }); props.onStartConversation(); return; }
      // 押しても無反応、を作らない（原則15）。進めない理由を言う
      setStepNotice(tx(lang,
        'いまAI会話を始められません（今日の回数を使い切ったか、準備中です）。下のボタンでこのstepを飛ばして、先へ進めます。',
        '现在无法开始AI会话（今天的次数已用完，或正在准备中）。可以点下面的按钮跳过这一步，继续后面的内容。'));
      return;
    }
    if (s.kind === 'kana_dojo') { setView('kana'); return; }
    if (s.kind === 'restate') { setView('restate'); return; }
    if (s.kind === 'reading_short') { skillFinishGuard.current = false; setView('reading'); return; }
    if (s.kind === 'listening_practice') { skillFinishGuard.current = false; setView('listening'); return; }
    if (s.kind === 'vocab_new' && s.refIds[0]?.startsWith('n3u-')) {
      // ここは単元ページ（AdvShellの外）へ渡すので完了の合図が返ってこない。
      // それでも「開いた＝学んだ」にはしない（2026-08-17）。戻ってきたら
      // ホームの「学び終わった」リンクを本人が押したときだけ完了になる
      props.onOpenArea(AREA_BY_UNIT[s.refIds[0]] ?? 'area01-minato');
      return;
    }
    if (s.kind === 'grammar_new' && s.refIds[0]) { setStudyGrammarId(s.refIds[0]); setView('grammar'); return; }
    if (s.kind === 'weak_reinforce' && s.refIds.length > 0) {
      setBattle({ tier: 'normal', targetId: s.refIds[0], targetLabel: tx(lang, '弱点補強', '弱点补强'), targetIds: s.refIds, fromStepIdx: i });
      setView('battle'); return;
    }
    if (s.kind === 'battle') {
      const targets = s.refIds.length > 0 ? s.refIds : (stageCt?.battleTargetIds ?? []);
      const isVocab = targets[0]?.startsWith('vocab-') === true;
      setBattle({
        tier: (s.tier ?? 'normal'),
        targetId: targets[0] ?? (stage?.stageId ?? 'stage'),
        targetLabel: isVocab ? tx(lang, '語彙', '词汇') : (stage ? tx(lang, stage.titleJa, stage.titleZh) : ''),
        targetIds: targets,
        fromStepIdx: i,
      });
      setView('battle'); return;
    }
  };

  /** 第一CTAの文言は「次の1動作」を名指しする */
  const ctaLabel = (): string => {
    if (!nextStep) return term('startToday', lang);
    if (doneSteps.size === 0) {
      return nextStep.kind === 'review_due'
        ? tx(lang, 'まず復習から始める', '先从复习开始')
        : tx(lang, `まず「${nextStep.titleJa}」から始める`, `先从「${nextStep.titleZh}」开始`);
    }
    return term('continueNext', lang);
  };

  // 復習画面から「次へ」で戻ってきた要求をここで実行する。
  // effectではなく描画中に合わせる（requestViewと同じやり方。1フレーム古い画面を挟まない）
  if (pendingNextN !== 0 && consumedNextN !== pendingNextN && quest) {
    setConsumedNextN(pendingNextN);
    // 実行するのは**復習stepを除いた**次のstep（復習画面から来ているため。素のnextStepIdxだと
    // 復習step自身を開き直して「押しても何も起きない」になる。2026-08-17 CEO実機報告）
    const idx = nextAfterReviewIdx;
    // 実行は描画のあと。runStepは画面遷移とrefに触るので描画中には呼ばない。
    // lintは「描画中にrefへ触る」と見るが、実際に走るのはsetTimeoutの中＝描画後。
    // eslint-disable-next-line react-hooks/refs -- 実行はsetTimeoutで描画後へ送っている
    if (idx >= 0) setTimeout(() => runStep(idx), 0);
  }

  // 休み明けの検知（2026-08-17 監査: 10日ぶりに開いた人に通常挨拶＋amber警告が並び、
  // 罪悪感だけ与えて復帰の後押しがなかった）。最終学習日はquestLogとmastery実測の新しい方
  const lastStudyKey = (() => {
    let last: string | null = null;
    for (const q of prof.questLog) if (!last || q.dateKey > last) last = q.dateKey;
    for (const at of Object.values(prof.mastery)) {
      for (const a of at ?? []) if (!last || a.dateKey > last) last = a.dateKey;
    }
    return last;
  })();
  const daysAway = (() => {
    if (!lastStudyKey) return 0;
    const diff = Math.floor((Date.parse(dateKey) - Date.parse(lastStudyKey)) / 86400000);
    return Number.isFinite(diff) ? Math.max(0, diff) : 0;
  })();
  // まだ1日も学習していない人（診断だけ終えて止まっている）。李さんの実測で判明した
  // 最大の離脱点（2026-08-17）。「全部やる」ではなく「まず1つだけ」を約束する
  const neverStudied = lastStudyKey === null;
  // 3日空いたら声をかける（7日待つと戻ってこない）。ペース警告の抑制も同じ条件
  const welcomeBack = daysAway >= 3;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6" aria-label={term('todayAdventure', lang)}>
      {/* 1. 目標と残日数 */}
      <p className="text-sm font-semibold text-gray-600">
        {prof.goalType === 'conversation'
          ? tx(lang, '会話力を上げる', '提升会话能力')
          : daysToExam === null
            ? tx(lang, `${prof.targetJlpt ?? ''}合格をめざす`, `目标：${prof.targetJlpt ?? ''}合格`)
            : daysToExam < 0
              ? tx(lang, '試験おつかれさまでした。次の目標を先生と決めましょう', '考试辛苦了。下一个目标和老师一起商量决定吧')
              : daysToExam === 0
                ? tx(lang, `今日が${prof.targetJlpt ?? ''}の試験日です。いってらっしゃい！`, `今天是${prof.targetJlpt ?? ''}的考试日。加油！`)
                : tx(lang, `${prof.targetJlpt ?? ''}合格まであと${daysToExam}日`, `距离${prof.targetJlpt ?? ''}合格还有${daysToExam}天`)}
      </p>

      {/*
        現在地（PRODUCT_CANON §5-2）。目的地の下に必ず出す。
        基礎が足りない学習者にも「N3へ降格」ではなく「N2攻略の経由地としていまここ」と見せる（原則2）。
      */}
      {stage && (
        <p className="mt-1 text-xs text-gray-500">
          {tx(lang,
            `現在地：${stage.titleJa}（${term('masteryRate', 'ja')} ${routeProgressPct(route, stageDone)}%）`,
            `当前位置：${stage.titleZh}（${term('masteryRate', 'zh')} ${routeProgressPct(route, stageDone)}%）`)}
          {prof.targetJlpt === 'N2' && stage.kind !== 'n2_grammar' && stage.kind !== 'n2_gate' && (
            <span className="ml-1 text-gray-400">
              {tx(lang, '＝N2攻略の経由地', '＝通往N2的中途站')}
            </span>
          )}
        </p>
      )}

      {/* 目的地までの残り量と推定（CEO要望 2026-08-14: 理想と現状のギャップ・残りを見せる） */}
      {pace && pace.remainingTargets > 0 && (
        <p className="mt-1 text-xs text-gray-500">
          {tx(lang,
            `目的地まで残り${pace.remainingStages}地域・${pace.remainingTargets}項目`,
            `距离目的地还剩${pace.remainingStages}个地区・${pace.remainingTargets}个项目`)}
          {pace.estWeeksLeft !== null && pace.estWeeksLeft > 0 && (
            tx(lang,
              `／いまのペースだと約${pace.estWeeksLeft}週間（推定）`,
              `／按现在的节奏约需${pace.estWeeksLeft}周（推算）`)
          )}
        </p>
      )}
      {/* 復帰初日はペース警告を出さない（まず戻ってきたことを歓迎する） */}
      {pace && pace.onTrack === false && pace.neededPerWeek !== null && !welcomeBack && (
        <p className="mt-0.5 text-xs font-semibold text-amber-700">
          {tx(lang,
            `受験日までに終えるには週${pace.neededPerWeek}項目の定着が必要です（いまは週${pace.measuredPerWeek ?? 0}）`,
            `要在考试日前完成，需要每周巩固${pace.neededPerWeek}个项目（现在是每周${pace.measuredPerWeek ?? 0}个）`)}
        </p>
      )}
      {/* XP＝努力の見える化（やるほど増える・攻略とは別軸・advXp.ts）。0のうちは出さない */}
      {(prof.xp ?? 0) > 0 && (
        <p className="mt-1 text-xs font-semibold text-amber-600">
          ⭐ Lv.{levelOf(prof.xp ?? 0)}・XP {prof.xp}
          <span className="ml-1 font-normal text-gray-400">
            {tx(lang, `（次のレベルまで${xpToNextLevel(prof.xp ?? 0)}）`, `（距下一级还差${xpToNextLevel(prof.xp ?? 0)}）`)}
          </span>
        </p>
      )}

      {/* 案内の先生の一文（次の行動を言う）。7画面すべてで同じ先生に揃える */}
      <div className="mt-2 mb-4 flex items-center gap-3">
        <TeacherAvatar size={48} expression="smile" lang={lang}
          className={`shrink-0 ring-2 ${teacher.ringClass}`} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500">{teacherLabel}</p>
          <p className="text-sm leading-snug text-gray-700">
            {neverStudied && quest
              ? tx(lang,
                `はじめまして。今日は全部やらなくて大丈夫です。まず「${quest.steps[0]?.titleJa ?? '最初の1つ'}」だけ、3分ほどやってみましょう。`,
                `初次见面。今天不用全部做完。先只做「${quest.steps[0]?.titleZh ?? '第一项'}」，3分钟左右就好。`)
              : welcomeBack && quest
              ? tx(lang,
                `おかえりなさい！休んでも記録はぜんぶ残っています。今日は${quest.estimatedMinutes}分、続きからゆっくり始めましょう。`,
                `欢迎回来！休息期间的记录都还在。今天${quest.estimatedMinutes}分钟，从接下来的内容慢慢开始吧。`)
              : quest
                ? tx(lang,
                  `今日は${quest.estimatedMinutes}分。${nextStep ? `まず「${nextStep.titleJa}」から始めましょう。` : '今日のぶんは終わりました！'}`,
                  `今天${quest.estimatedMinutes}分钟。${nextStep ? `先从「${nextStep.titleZh}」开始吧。` : '今天的份量已经完成了！'}`)
                : tx(lang, teacher.greetJa, teacher.greetZh)}
          </p>
        </div>
      </div>
      {/* 旅の相棒の声掛け（§8）。オンボーディングの「応援のしかたが少し変わります」をここで果たす。
          復習が残っている日は毎日同文のgreetでなく「復習の知らせ役」になる（状況対応・CEO要望 2026-08-14） */}
      {prof.companionId && (
        <div className="-mt-2 mb-4 flex items-center gap-2">
          <CompanionAvatar id={prof.companionId} size={32} />
          <p className="text-xs text-gray-600">
            <span className="font-semibold">{tx(lang, companionById(prof.companionId).nameJa, companionById(prof.companionId).nameZh)}</span>
            ：{props.reviewsDue > 0
              ? tx(lang, companionById(prof.companionId).reviewNudgeJa, companionById(prof.companionId).reviewNudgeZh)
              : tx(lang, companionById(prof.companionId).greetJa, companionById(prof.companionId).greetZh)}
          </p>
        </div>
      )}

      {/* 開いたままのタブが古いJSで動いている（2026-08-17 実際に起きた事故）。
          直したはずの不具合が生徒の画面では直っていない状態を、本人に見えるようにする。
          勝手に再読み込みはしない（バトル・模試の最中に飛ばさないため。押すのは本人） */}
      {staleBuild && (
        <div className={`${card} mb-4 border-amber-300 bg-amber-50`} role="status">
          <p className="text-sm font-semibold text-amber-900">
            {tx(lang, 'アプリの新しい版が出ています', '应用有新版本了')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            {tx(lang, 'いま開いている画面は前の版のままです。読み込み直すと最新になります（学習の記録は消えません）。',
              '现在打开的界面还是旧版本。重新加载就会更新（学习记录不会消失）。')}
          </p>
          <button type="button"
            className={`${pressFx} action-amber mt-2 w-full min-h-[44px] rounded-xl border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900`}
            onClick={() => window.location.reload()}>
            {tx(lang, '読み込み直す', '重新加载')}
          </button>
        </div>
      )}

      {/* 先生からの一言（週1・2026-08-17）。未読が1件あるときだけ出す。
          AIの自動生成文ではなく**人が書いたもの**なので、相棒やAI先生の吹き出しと見た目を変える */}
      {unreadNote && (
        <div className={`${card} mb-4 border-rose-200 bg-rose-50`}>
          <p className="text-xs font-bold text-rose-700">
            {tx(lang, `${unreadNote.authorLabel || teacherLabel}から`, `来自${unreadNote.authorLabel || teacherLabel}`)}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {lang === 'zh' && unreadNote.bodyZh ? unreadNote.bodyZh : unreadNote.bodyJa}
          </p>
          <button type="button"
            className={`${pressFx} action-secondary mt-3 min-h-[44px] w-full rounded-xl border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-700`}
            onClick={() => save({ ...prof, teacherNotes: markNoteRead(prof.teacherNotes ?? [], unreadNote.id, nowISO) })}>
            {tx(lang, '読みました', '已读')}
          </button>
        </div>
      )}

      {/* 復習の渋滞レスキュー（2026-08-17）。
          数日あけると解禁ぶんが1日に集中するので、今日は一部だけ出して残りを分散したことを伝える。
          「サボったから溜まった」とは言わない（責めても戻ってこない） */}
      {forecast?.rescue && (
        <div className={`${card} mb-4 border-sky-200 bg-sky-50`} role="status">
          <p className="text-sm font-semibold text-sky-900">
            {tx(lang, '復習を何日かに分けました', '把复习分成了几天')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-sky-800">
            {lang === 'zh' ? forecast.rescue.noticeZh : forecast.rescue.noticeJa}
          </p>
        </div>
      )}

      {/* 中断したミニ模試があれば、他の何より先に再開させる（§9 reload recovery） */}
      {prof.mockSession && (
        <div className={`${card} mb-4 border-amber-300 bg-amber-50`} role="status">
          <p className="text-sm font-semibold text-gray-900">
            {tx(lang, 'ミニ模試が途中です', '迷你模拟考进行到一半')}
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {tx(lang, '同じ問題・同じ残り時間から再開できます。', '可以从相同的题目和剩余时间继续。')}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={`${pressFx} action-primary-blue min-h-[48px] flex-1 rounded-xl bg-blue-600 px-3 py-2 text-base font-bold text-white`}
              onClick={openMock}>
              {tx(lang, '模試を再開する', '继续模拟考')}
            </button>
            <button type="button" className={`${pressFx} action-amber min-h-[44px] rounded-xl border border-amber-400 bg-white px-3 py-2 text-sm text-amber-900`}
              onClick={() => save({ ...prof, mockSession: null })}>
              {tx(lang, '破棄', '放弃')}
            </button>
          </div>
        </div>
      )}

      {/* 進行中の答案用紙。**時間は壁時計で進んでいる**ので、模試と同様に最優先で再開させる */}
      {sheetSession && answerSheetsVisible(prof) && sheetResumable && (
        <div className={`${card} mb-4 border-amber-300 bg-amber-50`} role="status">
          <p className="text-sm font-semibold text-gray-900">
            {tx(lang, '過去問の答案が途中です', '真题答案填到一半')}
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {tx(lang, '試験の時間は本番と同じように進んでいます。', '考试时间正像正式考试一样继续。')}
          </p>
          <button type="button" className={`${pressFx} action-primary-blue mt-2 w-full min-h-[48px] rounded-xl bg-blue-600 px-3 py-2 text-base font-bold text-white`}
            onClick={() => setView('sheets')}>
            {tx(lang, '答案に戻る', '回到答题')}
          </button>
        </div>
      )}
      {/* 紙が消えた答案（発行取り下げ等）。再開できないバナーを永遠に残さない（原則15） */}
      {sheetSession && answerSheetsVisible(prof) && !sheetResumable && (
        <div className={`${card} mb-4 border-amber-300 bg-amber-50`} role="status">
          <p className="text-sm font-semibold text-gray-900">
            {tx(lang, '途中だった答案用紙が見つかりません', '填到一半的答题卡已不存在')}
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {tx(lang, '先生が答案用紙を取り下げた可能性があります。この答案は再開できないため、破棄してください。',
              '老师可能已撤回这份答题卡。这份答案无法继续，请将其放弃。')}
          </p>
          <button type="button" className={`${pressFx} action-amber mt-2 w-full min-h-[44px] rounded-xl border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900`}
            onClick={() => save({ ...prof, answerSheetSession: null })}>
            {tx(lang, 'この答案を破棄する', '放弃这份答案')}
          </button>
        </div>
      )}

      {!quest && !poolsError && <AdvLoading lang={lang} inline />}
      {!quest && poolsError && (
        <div className={`${card} mb-4 border-red-200 bg-red-50 text-center`} role="alert">
          <p className="text-sm text-gray-800">
            {tx(lang, '教材データを読み込めませんでした。通信環境を確認してもう一度お試しください。',
              '教材数据加载失败。请检查网络后重试。')}
          </p>
          <button type="button"
            className={`${pressFx} action-secondary mt-3 min-h-[44px] rounded-xl border border-gray-300 bg-white px-6 py-2 text-sm font-bold text-gray-700`}
            onClick={() => { setPoolsError(false); setPoolsRetryNonce((n) => n + 1); }}>
            {tx(lang, 'もう一度読み込む', '重新加载')}
          </button>
        </div>
      )}

      {quest && (
        <div className={`${card} mb-4 border-blue-200`}>
          <div className="flex items-center gap-2">
            <TeacherAvatar size={28} lang={lang} labeled={false} className="shrink-0" />
            <h1 className="text-lg font-bold text-gray-900">{term('todayAdventure', lang)}</h1>
          </div>
          <p className="mt-0.5 text-sm text-gray-600">
            {tx(lang, `今日はこの${quest.steps.length}つだけ・約${quest.estimatedMinutes}分`,
              `今天只做这${quest.steps.length}项・约${quest.estimatedMinutes}分钟`)}
          </p>
          {/* 今鍛えている試験科目（§8） */}
          {!isPracticalStep(nextStep?.kind ?? '') && (
            <p className="mt-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
              {term('nowTraining', lang)}：{nowTrainingLabel(trainingSkill, lang)}
            </p>
          )}

          {/* 2. 今日行う全step（番号は必ず連番）。上の細いバーはstepを終えるたびに伸びる */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
            <div className="h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${Math.round((doneSteps.size / quest.steps.length) * 100)}%` }} />
          </div>
          <ol className="mt-2 space-y-1.5">
            {quest.steps.map((s, i) => {
              const done = doneSteps.has(i);
              const isNext = i === nextStepIdx;
              return (
                <li key={s.titleJa + i}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${isNext ? 'bg-blue-50 font-semibold' : ''}`}>
                  <span aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs transition-colors duration-300 ${
                      done ? 'bg-emerald-100 font-bold text-emerald-600'
                      : isNext ? 'bg-blue-600 font-bold text-white'
                      : 'bg-gray-100 text-gray-500'}`}>
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={`flex-1 text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {tx(lang, s.titleJa, s.titleZh)}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">{tx(lang, `約${s.estMinutes}分`, `约${s.estMinutes}分钟`)}</span>
                </li>
              );
            })}
          </ol>

          {/* 3. 今日のゴール */}
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs font-semibold text-gray-600">{term('todayGoal', lang)}</p>
            <p className="text-sm text-gray-800">{tx(lang, quest.successConditionJa, quest.successConditionZh)}</p>
          </div>

          {/* 4. 主要CTAは常に一つ＝次の1動作 */}
          {!allDone && nextStepIdx >= 0 && (
            <button type="button"
              className={mockPending || sheetResumable ? `${secondaryBtn} mt-4` : `${primaryBtn} mt-4`}
              onClick={() => runStep(nextStepIdx)}>
              {mockPending ? tx(lang, '模試のあとで今日の冒険をする', '模拟考之后再做今天的冒险')
                : sheetResumable ? tx(lang, '答案のあとで今日の冒険をする', '交完答案再做今天的冒险')
                : ctaLabel()}
            </button>
          )}
          {/*
            中断への安心（CEO指示 2026-08-08）。始める前の学習者は
            「途中でやめたら消えるのでは」を一番心配する。仕組みは実在する
            （todaySteps がDB保存・questは同日決定的＝端末を変えても続きから）ので、
            事実をそのまま1行で言う。※やりかけの1step内の途中経過は保存しない仕様のため
            「終わったstepまで」と正確に書く（盛らない・原則13）
          */}
          {stepNotice && (
            <div role="status" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-xs leading-relaxed text-amber-900">{stepNotice}</p>
              {/* 案内を実行不能にしない出口（原則15）: 会話が使えない日はこのstepを飛ばして後続（言い直し等）へ進める */}
              {nextStep?.kind === 'conversation_mission' && !props.conversationAvailable && (
                <button type="button"
                  className={`${pressFx} action-amber mt-2 w-full min-h-[44px] rounded-xl border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900`}
                  onClick={() => { markStep(nextStepIdx); setStepNotice(null); }}>
                  {tx(lang, 'AI会話を飛ばして次へ進む', '跳过AI会话，继续下一步')}
                </button>
              )}
            </div>
          )}
          {/* 単元のことば・復習は別画面へ渡すので、完了の合図が戻ってこない。
              「開いた＝やった」にはしないぶん、本人が終わりを言える口をここに出す（2026-08-17） */}
          {!stepNotice && (nextStep?.kind === 'vocab_new' || nextStep?.kind === 'review_due') && (
            <button type="button"
              className={`${pressFx} mt-2 w-full min-h-[40px] text-xs text-gray-500 underline active:bg-gray-100`}
              onClick={() => { markStep(nextStepIdx); }}>
              {nextStep.kind === 'review_due'
                ? tx(lang, '復習は終わった（次へ進む）', '复习做完了（继续下一步）')
                : tx(lang, 'この単元のことばは学び終わった（次へ進む）', '这个单元的词汇学完了（继续下一步）')}
            </button>
          )}
          {/* 会話がうまく動かない環境でも詰まらせない（2026-08-16 サマーさん報告）:
              次がAI会話のときは、いつでも飛ばせる小さな出口を常設する */}
          {!stepNotice && nextStep?.kind === 'conversation_mission' && (
            <button type="button"
              className={`${pressFx} mt-2 w-full min-h-[40px] text-xs text-gray-500 underline active:bg-gray-100`}
              onClick={() => { markStep(nextStepIdx); }}>
              {tx(lang, '今日はAI会話を飛ばして次へ進む（マイクの調子が悪いときなど）',
                '今天跳过AI会话，继续下一步（比如麦克风不太好用的时候）')}
            </button>
          )}
          {!allDone && (
            <p className="mt-2 text-center text-xs text-gray-500">
              {tx(lang,
                '途中でやめても、終わったstepまで自動で保存されます。次に開くと続きから始められます。',
                '中途退出也没关系，已完成的步骤会自动保存。下次打开时会从上次中断的地方继续。')}
            </p>
          )}
          {/* 締めくくりは1日1回だけ（2026-08-16 CEO指摘）。
              締めくくり済みのホームは「完了」状態に変わり、緑CTA→完了画面→ホーム→緑CTA…の
              ループにしない。完了画面はリンクからもう一度見られる（再記録はしない） */}
          {allDone && !prof.questLog.some((e) => e.dateKey === dateKey) && (
            <button type="button"
              className={`${pressFx} action-emerald mt-4 w-full min-h-[48px] rounded-xl bg-emerald-600 px-4 py-3 text-base font-bold text-white`}
              onClick={() => {
                const log = prof.questLog.filter((e) => e.dateKey !== dateKey);
                save({
                  ...prof,
                  questLog: [...log, { dateKey, completedSteps: doneSteps.size, totalSteps: quest.steps.length }].slice(-60),
                  lastQuest: { dateKey, primaryTargets: quest.primaryTargets, stepKinds: quest.steps.map((s) => s.kind) },
                  xp: (prof.xp ?? 0) + doneSteps.size * XP_RULES.questStep,
                });
                trackAdv('today_quest_completed', { goalType: prof.goalType ?? undefined, locale: lang });
                setView('complete');
              }}>
              {tx(lang, '今日の冒険を締めくくる', '结束今天的冒险')}
            </button>
          )}
          {allDone && prof.questLog.some((e) => e.dateKey === dateKey) && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-sm font-bold text-emerald-800">
                {tx(lang, '🎉 今日の冒険は完了！おつかれさま', '🎉 今天的冒险完成了！辛苦啦')}
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                {tx(lang, '明日、先生が続きを用意します。もっとやりたい日はこのまま続けられます',
                  '明天老师会准备好接下来的内容。想多学的话，现在就可以继续')}
              </p>
              {/* 「続けたいのに行き先がない」の解消（2026-08-16 サマーさん報告:
                  完了後に何を押しても完了ページに戻るように感じていた）。
                  おかわりバトルへの直行ボタンをここに置く（メニューを開かなくても続けられる） */}
              {(stageCt?.battleTargetIds.length ?? 0) > 0 && (
                <button type="button"
                  className={`${pressFx} action-emerald mt-3 w-full min-h-[44px] rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white`}
                  onClick={() => {
                    const targets = stageCt?.battleTargetIds ?? [];
                    setBattle({
                      tier: 'normal',
                      targetId: targets[0] ?? (stage?.stageId ?? 'stage'),
                      targetLabel: tx(lang, 'おかわりバトル', '加练战斗'),
                      targetIds: targets,
                    });
                    setView('battle');
                  }}>
                  {tx(lang, 'おかわりバトルで続ける（何度でも・XPがたまる）', '继续加练战斗（不限次数・攒XP）')}
                </button>
              )}
              <button type="button"
                className={`${pressFx} mt-2 min-h-[40px] rounded-lg px-3 text-xs text-emerald-700 underline active:bg-emerald-100`}
                onClick={() => setView('complete')}>
                {tx(lang, '今日のまとめをもう一度見る', '再看一次今天的小结')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. 二次メニューは折りたたみ（第一CTAより強い表現を使わない） */}
      <div className="mt-2">
        <button type="button" aria-expanded={showMore}
          className={`${pressFx} action-secondary flex w-full min-h-[44px] items-center justify-between rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-600`}
          onClick={() => setShowMore((v) => !v)}>
          <span>{term('otherLearning', lang)}</span>
          <span aria-hidden className={`inline-block transition-transform duration-200 ${showMore ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showMore && (
          /* 開いたことがひと目で分かる面（枠つきパネル）＋3グループで選びやすく（項目過多の解消） */
          <div className="mt-2 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
            <p className="mb-1.5 px-1 text-[11px] font-bold tracking-wide text-gray-500">{tx(lang, '学ぶ', '学习')}</p>
            <div className="space-y-1.5">
              {/* かな道場: 進行中の人だけ（今日の分より先へ進みたい人向けの入口） */}
              {prof.kana && prof.kana.needed !== false && (
                <SubLink lang={lang} label={tx(lang, 'かな道場（ひらがな・カタカナ）', '假名道场（平假名・片假名）')}
                  onClick={() => setView('kana')} />
              )}
              <SubLink lang={lang} label={term('seeReviewList', lang)} badge={props.reviewsDue} onClick={props.onOpenReview} />
              {/* 错题本（2026-08-17）。間違えた問題だけを自分の意思で潰せる場所。
                  誤答の記録がまだ無い人には出さない（空の画面へ連れて行かない） */}
              {notebook.entries.length > 0 && (
                <SubLink lang={lang}
                  label={tx(lang, '間違えた問題ノート', '错题本')}
                  badge={summarizeMistakes(notebook).pendingCount}
                  onClick={() => setView('mistakes')} />
              )}
              {/* おかわりバトル（2026-08-16 CEO要望「問題を変えて何度も復習・XPはやるほど増える」）。
                  出題は未出問題優先で毎回変わる。XPは毎回たまるが、攻略の記録は1日1回まで（原則13） */}
              {(stageCt?.battleTargetIds.length ?? 0) > 0 && (
                <SubLink lang={lang}
                  label={tx(lang, 'おかわりバトル（何度でも・XPがたまる）', '加练战斗（不限次数・攒XP）')}
                  onClick={() => {
                    const targets = stageCt?.battleTargetIds ?? [];
                    setBattle({
                      tier: 'normal',
                      targetId: targets[0] ?? (stage?.stageId ?? 'stage'),
                      targetLabel: tx(lang, 'おかわりバトル', '加练战斗'),
                      targetIds: targets,
                    });
                    setView('battle');
                  }} />
              )}
              <SubLink lang={lang}
                label={tx(lang, `${level}ミニ模試（時間つき）`, `${level}迷你模拟考（限时）`)}
                onClick={openMock} />
              {/* 過去問の試験場。**N2の試験を受ける人にだけ見せる**（それ以外の画面には出さない） */}
              {answerSheetsVisible(prof) && (
                <SubLink lang={lang}
                  label={tx(lang, '過去問の試験場（先生から届いた問題）', '真题考场（老师发来的题目）')}
                  badge={prof.answerSheets.length}
                  onClick={() => setView('sheets')} />
              )}
              {/* 帰化面接の表現特訓。発行された人だけ */}
              {interviewPrepVisible(prof) && (
                <SubLink lang={lang}
                  label={tx(lang, '帰化面接の表現特訓', '入籍面试表达特训')}
                  onClick={() => setView('interview')} />
              )}
            </div>
            {/* メニュー整理（2026-08-16 CEO指摘「項目が多すぎる」）:
                ・攻略ルート → 上部ナビ「冒険マップ」と完全重複のため削除
                ・設定を変える（先生・目的レベル）→ 上部ナビ「設定」画面へ移設 */}
            <p className="mb-1.5 mt-3 px-1 text-[11px] font-bold tracking-wide text-gray-500">{tx(lang, '記録を見る', '查看记录')}</p>
            <div className="space-y-1.5">
              <SubLink lang={lang} label={term('seeReadiness', lang)} onClick={() => { trackAdv('report_viewed', { locale: lang }); setView('readiness'); }} />
              <SubLink lang={lang} label={tx(lang, '今週のまとめ', '本周小结')}
                onClick={() => { trackAdv('weekly_progress_viewed', { locale: lang }); setView('weekly'); }} />
              <SubLink lang={lang} label={term('seeTeacherPrep', lang)} onClick={() => { trackAdv('human_lesson_summary_viewed', { locale: lang }); setView('prep'); }} />
            </div>
            <p className="px-1 pt-2 text-[11px] text-gray-400">
              {tx(lang, `${term('masteryRate', 'ja')}＝単元ごとの定着／${term('readiness', 'ja')}＝試験全体の技能評価`,
                `${term('masteryRate', 'zh')}＝各单元的巩固度／${term('readiness', 'zh')}＝考试整体的能力评估`)}
            </p>
            <p className="px-1 pt-1 text-[11px] text-gray-400">
              {tx(lang, '先生や目的・レベルの変更は、いちばん上の「設定」からできます',
                '更换老师或更改目标・级别，请从最上方的「设置」进入')}
            </p>
          </div>
        )}
      </div>

      {/* 「従来のホームに戻す」は撤去（2026-08-17 監査P1）。
          progress.length>0 は「旧コース歴」の判定に使えない（V2のAI会話完了でも増えるため、
          V2専業の生徒にも表示されてしまっていた）。旧コースが必要な場合は ?legacy 明示＋
          管理者側でenabledを切り替える運用に一本化（現役生徒は全員V2で自己降格の正当な用途がない） */}
    </div>
  );

}

const AREA_BY_UNIT: Record<string, string> = Object.fromEntries(
  Object.entries(AREA_UNIT_MAP).flatMap(([area, units]) => units.map((u) => [u, area])),
);

function AdvLoading({ lang, inline, note }: { lang: L; inline?: boolean; note?: string }) {
  return (
    <div className={inline ? 'py-8 text-center' : 'flex min-h-[40vh] flex-col items-center justify-center gap-2'} role="status" aria-live="polite">
      {/* 回転はCSSアニメーション＝合成スレッド側で動くので、生成中でも止まって見えない */}
      <span aria-hidden className="h-6 w-6 rounded-full border-2 border-gray-200 border-t-blue-500 motion-safe:animate-spin" />
      <p className="text-sm text-gray-500">{note ?? tx(lang, '冒険の準備をしています…', '正在准备冒险…')}</p>
    </div>
  );
}

function BackBar({ lang, onBack, title, teacherLang }: {
  lang: L; onBack: () => void; title: string;
  /** 指定すると案内の先生のアバターを出す（画面間で案内キャラクターを揃えるため） */
  teacherLang?: L;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button type="button" className={`${pressFx} action-secondary min-h-[44px] min-w-[44px] rounded-xl border border-gray-200 bg-white px-3`} onClick={onBack} aria-label={tx(lang, 'もどる', '返回')}>←</button>
      {teacherLang && <TeacherAvatar size={32} lang={teacherLang} labeled={false} className="shrink-0" />}
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
    </div>
  );
}

function SubLink({ lang, label, badge, onClick }: { lang: L; label: string; badge?: number; onClick: () => void }) {
  return (
    <button type="button"
      className={`${pressFx} action-secondary flex w-full min-h-[44px] items-center justify-between rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-700`}
      onClick={onClick}>
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-amber-500 px-2 text-xs font-bold text-white">{badge}</span>
      )}
      {(badge === undefined || badge === 0) && <span aria-hidden className="text-gray-300">›</span>}
      <span className="sr-only">{tx(lang, '開く', '打开')}</span>
    </button>
  );
}

function AdvGrammarStudy({ lang, grammarId, doc, setDoc, onBattle, onBack, onLearned }: {
  lang: L; grammarId: string; doc: N2GrammarDraft | null;
  setDoc: (d: N2GrammarDraft | null) => void;
  onBattle: () => void; onBack: () => void; onLearned: () => void;
}) {
  // 「読込中」と「見つからない/読込失敗」を区別する（無限ローディングにしない・原則15）。
  // どのgrammarIdで失敗したかを持ち、id切替時は照合が外れて自然に読込中へ戻る（effect内での同期リセット不要）
  const [missingId, setMissingId] = useState<string | null>(null);
  const missing = missingId === grammarId;
  useEffect(() => {
    let alive = true;
    void (async () => {
      const n3 = (N3_GRAMMAR_DRAFTS as unknown as N2GrammarDraft[]).find((d) => d.grammarId === grammarId);
      if (n3) { if (alive) setDoc(n3); return; }
      try {
        // 初級文法（n5g-/n4g-）はN2より先に見る。基礎帯の学習者が毎回N2本文を取りに行かないように
        if (/^n[45]g-/.test(grammarId)) {
          const basic = (await loadAllBasicDrafts()).find((d) => d.grammarId === grammarId);
          if (!alive) return;
          if (basic) { setDoc(basic as unknown as N2GrammarDraft); return; }
        }
        const n2 = (await loadAllN2Drafts()).find((d) => d.grammarId === grammarId);
        if (!alive) return;
        if (n2) setDoc(n2);
        else setMissingId(grammarId);
      } catch {
        if (alive) setMissingId(grammarId);
      }
    })();
    return () => { alive = false; };
  }, [grammarId, setDoc]);

  // 読み込めた瞬間に完了にしない（2026-08-17 CEO実機報告: 開いて戻っただけで✓が付いた）。
  // 完了は本人が「読み終わった」かバトルへ進んだときだけ。教材が表示されたことは学習の証拠にならない

  if (!doc && missing) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <BackBar lang={lang} onBack={onBack} title={tx(lang, '文法の教材', '语法教材')} teacherLang={lang} />
        <p className="text-sm leading-relaxed text-gray-700" role="alert">
          {tx(lang,
            'この文法の教材を読み込めませんでした。通信環境を確認してもう一度開くか、ホームへ戻って他のstepから進めてください。',
            '无法加载这条语法的教材。请检查网络后重新打开，或返回主页从其他步骤继续。')}
        </p>
        <button type="button" className={`${primaryBtn} mt-4`} onClick={onBack}>
          {tx(lang, 'ホームへ戻る', '返回主页')}
        </button>
      </div>
    );
  }
  if (!doc) return <AdvLoading lang={lang} />;
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <BackBar lang={lang} onBack={onBack} title={doc.pattern} />
      <p className="mb-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
        {TERMS.nowTraining[lang]}：{nowTrainingLabel('grammar', lang)}
      </p>
      <div className={card}>
        <p className="text-sm text-gray-600">{doc.meaningJa}</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-800">{doc.explanationZh}</p>
        <p className="mt-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">{tx(lang, '接続', '接续')}：{doc.formation}</p>
        <div className="mt-3 space-y-2">
          {doc.examplesJa.map((ex, i) => (
            <div key={ex} className="rounded-xl border border-gray-100 bg-gray-50 p-2">
              <p className="text-sm text-gray-900">{ex}</p>
              {doc.examplesZh[i] && <p className="text-xs text-gray-500">{doc.examplesZh[i]}</p>}
            </div>
          ))}
        </div>
        {doc.commonMistakesZh && <p className="mt-3 text-xs leading-relaxed text-amber-800">⚠️ {doc.commonMistakesZh}</p>}
        {doc.contrast && <p className="mt-2 text-xs leading-relaxed text-gray-600">{doc.contrast}</p>}
      </div>
      <button type="button" className={`${primaryBtn} mt-4`} onClick={() => { onLearned(); onBattle(); }}>
        {tx(lang, 'この文法でバトルに挑む', '用这个语法挑战战斗')}
      </button>
      {/* バトルに進まず読むだけで終える人の出口。ここを押さないと完了にならない＝
          「読んだ」と言ったのは本人、という記録になる（2026-08-17） */}
      <button type="button"
        className={`${pressFx} action-secondary mt-2 w-full min-h-[48px] rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700`}
        onClick={() => { onLearned(); onBack(); }}>
        {tx(lang, '読み終わった（今日の冒険に戻る）', '读完了（返回今天的冒险）')}
      </button>
    </div>
  );
}
