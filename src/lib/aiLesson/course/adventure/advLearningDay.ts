// 「学習した日」の唯一の判定（2026-09-09 CEO決定・P0-1）。
//
// ■ なぜ要るか（2026-09-09 監査の実測）
//   「学習した日」の定義が3か所でバラバラだった。
//     - advStreak.activeDayKeys      … questLog ∪ mastery
//     - adminFunnel                  … 会話セッション ∪ ai_usage_daily ∪ ai_course_events
//     - adminAccountModel            … adv.lastStudyDateKey ∪ ai_usage_daily
//   いちばん狭い定義（questLog ∪ mastery）が学習者の画面と管理画面を支配していたため、
//   **かな道場だけの日・AI会話だけの日・途中でやめた日が、どこにも学習日として残らなかった**。
//
//   実例（本番）: 小蒋さんは3日かけてかな18行を終えたのに
//   学習日数0・streak null・管理画面「未学習」・先生の一言は「はじめまして」のまま。
//   sijiaさんも会話ミッションを1回終えているのに同じ状態だった。
//
// ■ この module が答える唯一の問い
//   「その日、この人に **意味のある学習行動（Meaningful Learning Action）** があったか」
//   streak も・あゆみも・管理画面も・先生の一言も、答えはここからしか取らない。
//
// ■ Meaningful Learning Action の定義（CEO 2026-09-09）
//   数える:
//     - 問題を解いた（バトル・読解・聴解・模試・語彙確認＝mastery台帳の試行）
//     - AI会話を1回終えた（completed のセッション）
//     - 今日の冒険のstepを1つでも終えた（かな道場・新しいことば・単元・言い直しを含む）
//     - 会話の言い直しに答えた（自己申告）
//     - 冒険をやりきった（questLog）
//   数えない:
//     - 開いただけ（visit）・今日のことばを読んだだけ・設定を見ただけ・ログインだけ
//   「来た日」は advVisit が別に持つ。**混ぜない**（混ぜると生徒の記録が嘘になる）。
//
// ■ 過去を偽造しない（原則13）
//   この記録は 2026-09-09 に始まる。それ以前のぶんは**既存の記録から導出できる範囲だけ**を
//   埋め戻す（deriveLearningDays）。導出元が持っていない日は「無い」ままにする。
//   かなの各行には日付が無いので、かな中心の生徒の過去日は完全には戻らない。
//   戻せるのは「今日ぶん」からで、そこは今日以降ずっと正しく積まれる。
//
// ■ 表示ログ（A）と永続学習記録（B）の分離（CEO 2026-09-09 追加P0）
//   questLog は直近60件で切られる**表示用の履歴（A）**のまま残す。
//   ここ（learningDays）は切らずに1年ぶん持つ**永続側（B）の第一歩**。
//   knowledge item 単位の永続履歴は docs/ai-course/design/LONG_TERM_LEARNING_MEMORY.md を参照。
import type { AdventureV2Profile } from './advTypes';

/** 意味のある学習行動の種類。**日単位**で持つ（回数は台帳が持っているので数えない） */
export type MeaningfulActionKind =
  /** 今日の冒険のstepを終えた（かな道場・新しいことば・単元・読解・聴解を含む） */
  | 'step'
  /** 問題を解いた（mastery台帳に試行が残った＝バトル・模試・語彙確認） */
  | 'battle'
  /** AI会話を1回終えた */
  | 'conv'
  /** 会話の言い直しに答えた（自己申告） */
  | 'restate'
  /** 冒険をやりきった（questLog） */
  | 'quest';

export const MEANINGFUL_ACTION_KINDS: readonly MeaningfulActionKind[] =
  ['step', 'battle', 'conv', 'restate', 'quest'] as const;

/** 1日ぶんの記録。`d`=YYYY-MM-DD / `k`=その日にあった行動の種類（重複なし・昇順） */
export interface AdvLearningDay {
  d: string;
  k: MeaningfulActionKind[];
}

/**
 * 保持する日数の上限。**1年ぶん**。
 * questLog（60件）と違ってここは切り詰めないのが目的なので、上限は「壊れないため」の安全弁。
 * 1件あたり約45バイト＝400日で約18KB。jsonb全体（実測で最大54KB）に対して許容範囲。
 */
export const LEARNING_DAY_KEEP = 400;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDayKey = (v: unknown): v is string => typeof v === 'string' && DAY_RE.test(v);
const isKind = (v: unknown): v is MeaningfulActionKind =>
  typeof v === 'string' && (MEANINGFUL_ACTION_KINDS as readonly string[]).includes(v);

export const emptyLearningDays = (): AdvLearningDay[] => [];

/** 保存値の復元。壊れた形・重複・空の kind を落として日付の昇順にそろえる */
export const restoreLearningDays = (raw: unknown): AdvLearningDay[] => {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map<string, Set<MeaningfulActionKind>>();
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const d = (e as AdvLearningDay).d;
    if (!isDayKey(d)) continue;
    const kinds = Array.isArray((e as AdvLearningDay).k) ? (e as AdvLearningDay).k : [];
    const set = byDay.get(d) ?? new Set<MeaningfulActionKind>();
    for (const k of kinds) if (isKind(k)) set.add(k);
    // kind が1つも読めない日は「学習した事実」だけは残す（記録を消さない側に倒す）
    if (set.size === 0) set.add('step');
    byDay.set(d, set);
  }
  return [...byDay.entries()]
    .map(([d, set]) => ({ d, k: [...set].sort() }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    .slice(-LEARNING_DAY_KEEP);
};

/** その日にその種類を足した新しい配列。**変化が無ければ null**（毎描画で保存しに行かないため） */
export const addLearningAction = (
  log: readonly AdvLearningDay[], dateKey: string, kind: MeaningfulActionKind,
): AdvLearningDay[] | null => {
  if (!isDayKey(dateKey) || !isKind(kind)) return null;
  const hit = log.find((e) => e.d === dateKey);
  if (hit && hit.k.includes(kind)) return null;
  const next = hit
    ? log.map((e) => (e.d === dateKey ? { d: e.d, k: [...e.k, kind].sort() } : e))
    : [...log, { d: dateKey, k: [kind] }];
  return next
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    .slice(-LEARNING_DAY_KEEP);
};

/** 会話セッションのうち「終えた」ものの日付キー（ローカル日付＝画面の dateKeyOf と同じ基準） */
export const sessionLearningDayKeys = (
  sessions: readonly { startedAt: string; completionStatus: string }[] | null | undefined,
): string[] => {
  const out: string[] = [];
  for (const s of sessions ?? []) {
    if (s?.completionStatus !== 'completed') continue;
    const t = Date.parse(s.startedAt);
    if (!Number.isFinite(t)) continue;
    out.push(new Date(t).toLocaleDateString('sv-SE'));
  }
  return [...new Set(out)].sort();
};

/**
 * 既存の記録から導出できる学習日（埋め戻し用）。
 *
 * **推定はしない。** 日付を持っている記録だけを読む:
 *   - questLog.dateKey            → 'quest'
 *   - mastery[].dateKey           → 'battle'
 *   - restateLog[].dateKey        → 'restate'
 *   - todaySteps（doneKeysが1つ以上ある日）→ 'step'
 *   - 会話セッション（completed）  → 'conv'
 *
 * かな道場の各行・単元の完了・ことば集めは日付を持っていないので、ここでは戻せない。
 * それらは todaySteps 経由で**その日のうちに**記録される（下の reconcileLearningDays）。
 */
export const deriveLearningDays = (
  profile: Pick<AdventureV2Profile, 'questLog' | 'mastery' | 'restateLog' | 'todaySteps'>,
  extraConversationDayKeys: readonly string[] = [],
): AdvLearningDay[] => {
  const byDay = new Map<string, Set<MeaningfulActionKind>>();
  const add = (d: unknown, k: MeaningfulActionKind) => {
    if (!isDayKey(d)) return;
    const set = byDay.get(d) ?? new Set<MeaningfulActionKind>();
    set.add(k);
    byDay.set(d, set);
  };

  for (const q of profile.questLog ?? []) add(q?.dateKey, 'quest');
  for (const attempts of Object.values(profile.mastery ?? {})) {
    for (const a of attempts ?? []) add(a?.dateKey, 'battle');
  }
  for (const r of profile.restateLog ?? []) add(r?.dateKey, 'restate');
  for (const d of extraConversationDayKeys) add(d, 'conv');

  // 今日のstep完了チェック。**1つでも終えていれば**その日は学習日
  //（旧形式 done[]（添字）しか無い保存データもここで拾う）
  const ts = profile.todaySteps;
  const stepCount = (ts?.doneKeys?.length ?? 0) + (ts?.done?.length ?? 0);
  if (ts && stepCount > 0) add(ts.dateKey, 'step');

  return [...byDay.entries()]
    .map(([d, set]) => ({ d, k: [...set].sort() }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    .slice(-LEARNING_DAY_KEEP);
};

/**
 * 保存済みの記録に、導出できるぶんを重ねる。**変化が無ければ null**。
 *
 * 画面はこれを毎描画で呼んでよい（変化が無ければ保存しない）。
 * 既存learnerの埋め戻しも、今日ぶんの記録も、この1本で済む。
 */
export const reconcileLearningDays = (
  profile: Pick<AdventureV2Profile, 'learningDays' | 'questLog' | 'mastery' | 'restateLog' | 'todaySteps'>,
  extraConversationDayKeys: readonly string[] = [],
): AdvLearningDay[] | null => {
  const stored = profile.learningDays ?? [];
  const derived = deriveLearningDays(profile, extraConversationDayKeys);
  const byDay = new Map<string, Set<MeaningfulActionKind>>();
  for (const e of [...stored, ...derived]) {
    const set = byDay.get(e.d) ?? new Set<MeaningfulActionKind>();
    for (const k of e.k) set.add(k);
    byDay.set(e.d, set);
  }
  const next = [...byDay.entries()]
    .map(([d, set]) => ({ d, k: [...set].sort() }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    .slice(-LEARNING_DAY_KEEP);
  return sameLog(stored, next) ? null : next;
};

const sameLog = (a: readonly AdvLearningDay[], b: readonly AdvLearningDay[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].d !== b[i].d) return false;
    if (a[i].k.length !== b[i].k.length) return false;
    for (let j = 0; j < a[i].k.length; j += 1) if (a[i].k[j] !== b[i].k[j]) return false;
  }
  return true;
};

/* ──────────────────────────────────────────────────────────────
   ここから下が **唯一の参照点**。
   streak・あゆみ・管理画面・先生の一言は、必ずこの3つのどれかを通す。
   ────────────────────────────────────────────────────────────── */

/**
 * 学習した日の集合（保存済み ∪ 導出）。
 * @param extraConversationDayKeys 会話セッションを持っている画面だけ渡す（無くても壊れない）
 */
export const learningDayKeys = (
  profile: Pick<AdventureV2Profile, 'learningDays' | 'questLog' | 'mastery' | 'restateLog' | 'todaySteps'>
    | null | undefined,
  extraConversationDayKeys: readonly string[] = [],
): Set<string> => {
  if (!profile) return new Set();
  const out = new Set<string>();
  for (const e of profile.learningDays ?? []) out.add(e.d);
  for (const e of deriveLearningDays(profile, extraConversationDayKeys)) out.add(e.d);
  return out;
};

/** その日に意味のある学習行動があったか（**この関数が「学習した」の定義**） */
export const hasMeaningfulLearningAction = (
  profile: Pick<AdventureV2Profile, 'learningDays' | 'questLog' | 'mastery' | 'restateLog' | 'todaySteps'>
    | null | undefined,
  dateKey: string,
  extraConversationDayKeys: readonly string[] = [],
): boolean => isDayKey(dateKey) && learningDayKeys(profile, extraConversationDayKeys).has(dateKey);

/** 最後に学習した日。まだ1日も無ければ null */
export const lastLearningDayKey = (
  profile: Pick<AdventureV2Profile, 'learningDays' | 'questLog' | 'mastery' | 'restateLog' | 'todaySteps'>
    | null | undefined,
  extraConversationDayKeys: readonly string[] = [],
): string | null => {
  const keys = [...learningDayKeys(profile, extraConversationDayKeys)].sort();
  return keys[keys.length - 1] ?? null;
};

/** 最初に学習した日。まだ1日も無ければ null */
export const firstLearningDayKey = (
  profile: Pick<AdventureV2Profile, 'learningDays' | 'questLog' | 'mastery' | 'restateLog' | 'todaySteps'>
    | null | undefined,
  extraConversationDayKeys: readonly string[] = [],
): string | null => {
  const keys = [...learningDayKeys(profile, extraConversationDayKeys)].sort();
  return keys[0] ?? null;
};
