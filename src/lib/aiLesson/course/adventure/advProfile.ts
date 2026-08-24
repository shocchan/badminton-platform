// Adventure V2 プロファイルの読み書き（LearnerSettings.adventureV2 = jsonb内・D-003）。
// 方針: 壊れたデータでも落ちない（安全側で default に戻す）／既存learnerの他フィールドへ触らない／
// 既存進捗からの能力認定はしない（unknown/needs_assessment・§23）。
import { migrateCompanionId } from './advCompanion';
import { migrateSavedRoute } from './advRoute';
import type { LearnerSettings, ItemProgress } from '../types';
import type {
  AdventureV2Profile, AdvSkillProfile, AdvSkillScore, AdvSkill, AdvBand, AdvMockSessionState,
  AdvStreakState,
} from './advTypes';
import { ADV_SKILLS } from './advTypes';
import { isTeacherId } from './advTeacher';
import { restorePapers, restoreSheetSession, restoreSheetLog } from './advAnswerSheet';
import { restoreInterviewPrep, emptyInterviewPrep } from './interview/advInterview';
import {
  restorePersonalPacks, restorePersonalPackState, emptyPersonalPackState,
} from './personal/advPersonalPack';
import { restoreTeacherNotes } from './advTeacherNote';

const emptySkill = (): AdvSkillScore => ({
  currentScore: 0, confidence: 'none', evidenceCount: 0, lastAssessedAt: null, band: 'needs_assessment',
});

export const emptySkillProfile = (): AdvSkillProfile => {
  const p = {} as AdvSkillProfile;
  for (const s of ADV_SKILLS) p[s] = emptySkill();
  return p;
};

export const defaultAdvProfile = (nowISO: string): AdventureV2Profile => ({
  schemaVersion: 1,
  enabled: false,
  goalType: null,
  targetJlpt: null,
  declaredJlpt: null,
  examDateISO: null,
  weeklyDays: null,
  dailyMinutes: null,
  companionId: null,
  teacherId: null,
  diagnosis: null,
  skills: emptySkillProfile(),
  route: null,
  mastery: {},
  lastQuest: null,
  todaySteps: null,
  questLog: [],
  xp: 0,
  mockSession: null,
  mockLog: [],
  kana: null,
  streak: null,
  answerSheets: [],
  answerSheetSession: null,
  answerSheetLog: [],
  interviewPrep: emptyInterviewPrep(),
  personalPacks: [],
  personalPack: emptyPersonalPackState(),
  teacherNotes: [],
  humanLesson: {},
  stuckSkips: [],
  createdAt: nowISO,
  updatedAt: nowISO,
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const VALID_GOALS = new Set(['jlpt', 'conversation', 'hybrid']);
const VALID_LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);
const VALID_MINUTES = new Set([5, 15, 30]);
const VALID_COMPANIONS = new Set(['natsu', 'haru', 'aki']);
const VALID_BANDS = new Set<AdvBand>([
  'needs_assessment', 'pre_n5', 'n5', 'n4', 'n4_late',
  'n3_early', 'n3', 'n3_late', 'n2_early', 'n2', 'n2_plus',
]);

const restoreSkill = (v: unknown): AdvSkillScore => {
  if (!isRecord(v)) return emptySkill();
  const score = typeof v.currentScore === 'number' && Number.isFinite(v.currentScore)
    ? Math.max(0, Math.min(100, v.currentScore)) : 0;
  const conf = v.confidence === 'low' || v.confidence === 'medium' || v.confidence === 'high' ? v.confidence : 'none';
  const band = VALID_BANDS.has(v.band as AdvBand) ? (v.band as AdvBand) : 'needs_assessment';
  return {
    currentScore: score,
    confidence: conf,
    evidenceCount: typeof v.evidenceCount === 'number' && v.evidenceCount >= 0 ? Math.floor(v.evidenceCount) : 0,
    lastAssessedAt: typeof v.lastAssessedAt === 'string' ? v.lastAssessedAt : null,
    band,
  };
};

/**
 * 進行中ミニ模試の復元（§9 reload recovery）。
 * 形が壊れていれば null（＝模試は最初からになるが、学習は止まらない）。
 */
const restoreMockSessionState = (v: unknown): AdvMockSessionState | null => {
  if (!isRecord(v)) return null;
  const level = v.level === 'N2' || v.level === 'N3' ? v.level : null;
  const mode = v.mode === 'short' || v.mode === 'fullTime' ? v.mode : null;
  if (!level || !mode) return null;
  if (typeof v.mockId !== 'string' || typeof v.attemptSeed !== 'number' || typeof v.startedAt !== 'string') return null;
  if (!Array.isArray(v.remainingSecBySection)) return null;
  const remaining = v.remainingSecBySection
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if (remaining.length !== v.remainingSecBySection.length || remaining.length === 0) return null;
  const idx = typeof v.sectionIndex === 'number' ? Math.floor(v.sectionIndex) : 0;
  if (idx < 0 || idx >= remaining.length) return null;
  const answers: Record<string, string | null> = {};
  if (isRecord(v.answers)) {
    for (const [k, val] of Object.entries(v.answers)) if (typeof val === 'string') answers[k] = val;
  }
  return {
    mockId: v.mockId, level, mode, attemptSeed: v.attemptSeed, startedAt: v.startedAt,
    sectionIndex: idx,
    remainingSecBySection: remaining,
    answers,
    completedSections: Array.isArray(v.completedSections)
      ? v.completedSections.filter((s): s is string => typeof s === 'string') : [],
    finishedAt: typeof v.finishedAt === 'string' ? v.finishedAt : null,
  };
};

/**
 * つづけた日（streak）の復元（2026-08-19）。
 * 壊れた形は null（＝初回の活動時に履歴からseedし直す。積み上げの本体は
 * questLog∪mastery なので、streakが飛んでも「祝い」が一度リセットされるだけで害がない）。
 * best < current の保存値は current まで引き上げる（bestの定義を壊さない）。
 */
const restoreStreak = (v: unknown): AdvStreakState | null => {
  if (!isRecord(v)) return null;
  if (typeof v.current !== 'number' || !Number.isFinite(v.current) || v.current < 1) return null;
  if (typeof v.lastActiveKey !== 'string') return null;
  const current = Math.floor(v.current);
  const best = typeof v.best === 'number' && Number.isFinite(v.best) && v.best >= current
    ? Math.floor(v.best) : current;
  return { current, best, lastActiveKey: v.lastActiveKey };
};

/**
 * settings.adventureV2 からプロファイルを復元。無い/壊れている場合は null。
 * （壊れた部分fieldは default 側へ倒す＝reloadで学習が止まらない）
 */
export const readAdvProfile = (settings: LearnerSettings | null | undefined): AdventureV2Profile | null => {
  const raw = settings?.adventureV2;
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== 1) return null;
  const nowISO = new Date().toISOString();
  const base = defaultAdvProfile(typeof raw.createdAt === 'string' ? raw.createdAt : nowISO);
  const skills = emptySkillProfile();
  if (isRecord(raw.skills)) {
    for (const s of ADV_SKILLS) skills[s as AdvSkill] = restoreSkill((raw.skills as Record<string, unknown>)[s]);
  }
  return {
    ...base,
    enabled: raw.enabled === true,
    goalType: VALID_GOALS.has(raw.goalType as string) ? (raw.goalType as AdventureV2Profile['goalType']) : null,
    targetJlpt: VALID_LEVELS.has(raw.targetJlpt as string) ? (raw.targetJlpt as AdventureV2Profile['targetJlpt']) : null,
    // 自己申告レベル（会話目標のみ）。想定外の値は null に落とす
    declaredJlpt: (['N1', 'N2', 'N3'] as const).includes(raw.declaredJlpt as 'N1')
      ? (raw.declaredJlpt as AdventureV2Profile['declaredJlpt']) : null,
    examDateISO: typeof raw.examDateISO === 'string' ? raw.examDateISO : null,
    weeklyDays: typeof raw.weeklyDays === 'number' && raw.weeklyDays >= 1 && raw.weeklyDays <= 7 ? Math.floor(raw.weeklyDays) : null,
    dailyMinutes: VALID_MINUTES.has(raw.dailyMinutes as number) ? (raw.dailyMinutes as AdventureV2Profile['dailyMinutes']) : null,
    // 旧キャラID（nami/fukuro/kaji・〜2026-08-14）は役割の近い正式キャラへ移行する
    companionId: VALID_COMPANIONS.has(raw.companionId as string)
      ? (raw.companionId as AdventureV2Profile['companionId'])
      : migrateCompanionId(raw.companionId as string),
    // 未選択（null）は既定の先生で表示する。保存値は書き換えない（既存learner非破壊）
    teacherId: isTeacherId(raw.teacherId) ? raw.teacherId : null,
    diagnosis: isRecord(raw.diagnosis) && typeof raw.diagnosis.completedAt === 'string'
      ? (raw.diagnosis as unknown as AdventureV2Profile['diagnosis']) : null,
    skills,
    // 保存済みルートは生成時のスナップショット。generateRoute を直しても既存learnerには
    // 届かないので、stage種別から決まるぶんだけ取り込み時に補う（migrateSavedRoute・冪等）
    route: isRecord(raw.route) && Array.isArray((raw.route as Record<string, unknown>).stages)
      ? migrateSavedRoute(raw.route as unknown as NonNullable<AdventureV2Profile['route']>) : null,
    mastery: isRecord(raw.mastery) ? (raw.mastery as AdventureV2Profile['mastery']) : {},
    lastQuest: isRecord(raw.lastQuest) && typeof raw.lastQuest.dateKey === 'string'
      ? (raw.lastQuest as unknown as AdventureV2Profile['lastQuest']) : null,
    todaySteps: isRecord(raw.todaySteps) && typeof raw.todaySteps.dateKey === 'string' && Array.isArray(raw.todaySteps.done)
      ? {
        dateKey: raw.todaySteps.dateKey,
        done: (raw.todaySteps.done as unknown[]).filter((n): n is number => typeof n === 'number'),
        doneKeys: Array.isArray(raw.todaySteps.doneKeys)
          ? (raw.todaySteps.doneKeys as unknown[]).filter((k): k is string => typeof k === 'string')
          : undefined,
      }
      : null,
    questLog: Array.isArray(raw.questLog)
      ? (raw.questLog.filter((e) => isRecord(e) && typeof e.dateKey === 'string') as AdventureV2Profile['questLog'])
      : [],
    xp: typeof raw.xp === 'number' && Number.isFinite(raw.xp) ? Math.max(0, Math.floor(raw.xp)) : 0,
    mockSession: restoreMockSessionState(raw.mockSession),
    mockLog: Array.isArray(raw.mockLog)
      ? (raw.mockLog.filter((e) =>
        isRecord(e) && typeof e.mockId === 'string' && typeof e.completedAt === 'string'
        && typeof e.totalQuestions === 'number') as AdventureV2Profile['mockLog']).slice(-30)
      : [],
    kana: isRecord(raw.kana)
      ? {
        needed: raw.kana.needed === true ? true : raw.kana.needed === false ? false : null,
        doneRowIds: Array.isArray(raw.kana.doneRowIds)
          ? (raw.kana.doneRowIds as unknown[]).filter((s): s is string => typeof s === 'string') : [],
        checkedAt: typeof raw.kana.checkedAt === 'string' ? raw.kana.checkedAt : null,
      }
      : null,
    streak: restoreStreak(raw.streak),
    // 期限切れのスキップは読み込み時点で落とす（保存が肥大化しない・解除漏れも起きない）
    stuckSkips: Array.isArray(raw.stuckSkips)
      ? (raw.stuckSkips as unknown[]).filter((x): x is AdventureV2Profile['stuckSkips'][number] =>
        isRecord(x) && typeof x.targetId === 'string' && typeof x.skippedOnKey === 'string'
        && typeof x.returnDateKey === 'string').slice(-20)
      : [],
    answerSheets: restorePapers(raw.answerSheets),
    answerSheetSession: restoreSheetSession(raw.answerSheetSession),
    answerSheetLog: restoreSheetLog(raw.answerSheetLog),
    interviewPrep: restoreInterviewPrep(raw.interviewPrep),
    personalPacks: restorePersonalPacks(raw.personalPacks),
    personalPack: restorePersonalPackState(raw.personalPack),
    teacherNotes: restoreTeacherNotes(raw.teacherNotes),
    humanLesson: isRecord(raw.humanLesson) ? (raw.humanLesson as AdventureV2Profile['humanLesson']) : {},
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowISO,
  };
};

/**
 * プロファイルを settings に書き戻した新settingsを返す（他フィールド非破壊・イミュータブル）。
 *
 * 耐久性の鉄則（2026-08-15 監査P0）: adventureV2 を**全置換しない**。
 * 既存jsonbの未知キーを温存してから profile を重ねる。これが無いと、
 * デプロイで新フィールドを追加したとき、キャッシュされた旧JSのクライアントが
 * 1回保存しただけで新フィールド（過去実例: answerSheets・interviewPrep）が消える。
 */
export const writeAdvProfile = (
  settings: LearnerSettings, profile: AdventureV2Profile, nowISO: string,
): LearnerSettings => {
  const raw = settings?.adventureV2;
  const preserved = isRecord(raw) ? (raw as Record<string, unknown>) : {};
  return {
    ...settings,
    adventureV2: { ...preserved, ...profile, updatedAt: nowISO },
  };
};

/**
 * 「読めない」と「無い」の区別（2026-08-15 監査P1）。
 * adventureV2 に実データがあるのにパース不能（将来のschemaVersion変更・破損）な場合、
 * defaultAdvProfile で上書き保存すると生徒の積み上げが全消しになる。
 * 呼び出し側は readAdvProfile が null でもこれが true なら**保存せず**リロードを促すこと。
 */
export const hasRawAdvData = (settings: LearnerSettings | null | undefined): boolean =>
  isRecord(settings?.adventureV2);

/**
 * enabledフラグだけを安全に切り替える（V2入口・従来ホームへ戻す・V2に戻るバナー用）。
 * データが読めない（将来スキーマ・破損）場合でも defaultAdvProfile で全置換せず、
 * 生のjsonbに enabled だけを重ねて他フィールドを温存する（監査P1: 破損時の全消し初期化の防止）。
 */
export const setAdvEnabled = (
  settings: LearnerSettings, enabled: boolean, nowISO: string,
): LearnerSettings => {
  const prof = readAdvProfile(settings);
  if (prof) return writeAdvProfile(settings, { ...prof, enabled }, nowISO);
  if (hasRawAdvData(settings)) {
    const raw = settings.adventureV2 as Record<string, unknown>;
    return { ...settings, adventureV2: { ...raw, enabled, updatedAt: nowISO } };
  }
  return writeAdvProfile(settings, { ...defaultAdvProfile(nowISO), enabled }, nowISO);
};

/** V2が有効なlearnerか（feature flag・D-004） */
export const isAdvEnabled = (settings: LearnerSettings | null | undefined): boolean =>
  readAdvProfile(settings)?.enabled === true;

/**
 * 既存learnerの進捗をV2プロファイルへ対応付ける（§23）。
 * - 既存140語の定着は vocabulary の evidence として持ち込む（confidence low まで）
 * - JLPTランクは認定しない（diagnosis を受けるまで needs_assessment）
 * - 既存進捗そのものは読み取りのみ（削除・変更しない）
 */
export const migrateLegacyEvidence = (
  profile: AdventureV2Profile, legacyProgress: ItemProgress[], nowISO: string,
): AdventureV2Profile => {
  const retained = legacyProgress.filter((p) =>
    p.masteryState === 'retained_day7' || p.masteryState === 'retained_day30').length;
  const touched = legacyProgress.length;
  if (touched === 0) return profile;
  const vocab: AdvSkillScore = {
    // scoreは「触れた中で定着した比率」を弱く反映。断定を避け low 止まり
    currentScore: Math.round((retained / Math.max(1, touched)) * 60),
    confidence: 'low',
    evidenceCount: touched,
    lastAssessedAt: nowISO,
    band: 'needs_assessment',
  };
  return { ...profile, skills: { ...profile.skills, vocabulary: vocab } };
};

/**
 * 教材（語彙・読解など）を選ぶときの実効レベル（2026-08-23 実生徒監査）。
 *
 * 会話目標の人は `targetJlpt` が null なので、これまで各所で
 * `targetJlpt === 'N3' ? 'N3' : 'N2'` と丸められ、**基礎帯の会話学習者にも
 * N2 の文字語彙（「教頭」「願書」）が出ていた**（実測）。
 *
 * 目的別の決め方:
 *  - 試験目標: 選んだ目標レベルがそのまま実効レベル（従来どおり）
 *  - 会話目標: 本人の申告（N1/N2→N2圏・N3→N3圏）。申告が無ければ **N3 に倒す**
 *    （測っていない人へ上の帯を出さない。物足りなければ申告で上げられる）
 */
export const effectiveContentLevel = (
  profile: Pick<AdventureV2Profile, 'targetJlpt' | 'declaredJlpt' | 'goalType'> | null | undefined,
): 'N5' | 'N4' | 'N3' | 'N2' => {
  const declared = profile?.declaredJlpt;
  const fromDeclared = declared === 'N1' || declared === 'N2' ? 'N2' : declared === 'N3' ? 'N3' : null;
  // 会話目標では **申告レベルを優先**する。targetJlpt は試験目標のための値で、
  // 目的を切り替えたあとも古い値が残ることがある（実測: 会話目標なのに targetJlpt='N3'）
  if (profile?.goalType === 'conversation') return fromDeclared ?? 'N3';
  const target = profile?.targetJlpt;
  if (target === 'N5' || target === 'N4' || target === 'N3') return target;
  if (target === 'N2' || target === 'N1') return 'N2';
  return fromDeclared ?? 'N3';
};
