// 错题本（誤答ノート）の純関数層。
//
// なぜ作るか:
// 中国語話者の受験文化では「間違えた問題だけを集めて潰す」错题本がもっとも信頼される学習法。
// 現状の復習は期限ベース（システムが決めた日に出る）しかなく、学習者が自分で
// 「いま自分の弱いところを潰す」自己決定型の復習ができない。ここはその土台。
//
// なぜこの設計か:
// - 問題文そのものは持たない。**キーだけ**を扱う（問題プールの解決は呼び出し側）。
//   台帳（AdvMasteryLedger）は jsonb に入るので、本文を二重に持つと肥大化するため。
// - 純関数のみ。時刻は nowISO 引数から導く（テスト可能にする）。
//
// 正直さの原則（PRODUCT_CANON 原則13「数字を作らない」）:
// - 正誤が記録されていない旧試行から「たぶん正解しただろう」を推定しない。
//   判定できないものは 'unverifiable'（まだ確認していない）として**型で表に出す**。
// - 「克服」はこのノート上の定義（最後の誤答より後に、別の日をまたいで連続正解した記録）
//   であって、試験の合格を保証するものではない。文言でもそう言い切らない。
// - 誤答が1件も無いときに「間違いゼロ！」と言わない。記録が無いだけかもしれないので
//   recordingAvailable で「記録がまだ無い」と「本当に誤答が無い」を区別する。
// - 数えられるのは**台帳に残っている範囲**だけ（MASTERY_RULES.maxAttemptsKept で古い試行は
//   間引かれる）。件数を「全期間の合計」と言わない（coverageNote で毎回そう断る）。
// - 喪失恐怖（ストリークを失う脅し等）の文言は作らない。
//
// 原則9（証拠の質）:
// おかわりバトルで同じ日に何度でも解き直せる以上、「同じ日に続けて正解した」は
// 記憶に残った証拠にならない。克服判定は**日をまたぐこと**を条件にする
// （単元レベルの MASTERY_RULES.requiredDays=3・delayDays=7 と同じ思想を1問レベルへ）。
import type { AdvMasteryAttempt, AdvMasteryLedger } from './advTypes';
import { questionTypeOf, MASTERY_RULES } from './advMastery';
import type { Term } from './advTerms';

export interface MistakeRules {
  /** 「克服」とみなす、最後の誤答より後の連続正解回数 */
  readonly clearStreak: number;
  /**
   * その連続正解が「別々の日」で起きていることを求めるか（原則9）。
   * true のとき、最後に間違えた日**より後**の異なる日付キーが clearStreak 日ぶん必要。
   * 同じ日のおかわりバトルで2回続けて正解しても克服にはしない。
   */
  readonly requireDifferentDays: boolean;
}

export const MISTAKE_RULES: MistakeRules = {
  clearStreak: 2,
  requireDifferentDays: true,
};

/**
 * このモジュール専用の状態語。
 *
 * zh を advTerms.TERMS.cleared（ja「攻略済み」/ zh「已攻克」）と**別語**にしてある。
 * 「已攻克」は単元を「別日3回80%＋7日後の遅延確認」でクリアした状態を指す既存語で、
 * 1問レベルの「別の日に2回続けて正解」に同じ語を当てると、中国語話者はより厳しい
 * 基準を満たしたと読んでしまう（他所で積んだ信用を借りることになる）。
 * ja「克服」/ zh「已订正」は错题本の文脈でそのまま通じ、既存語と衝突しない。
 */
export const MISTAKE_TERMS = {
  /** 克服（このノート上の定義） */
  overcome: { ja: '克服', zh: '已订正' },
  /** 未克服（記録上まだ条件を満たしていない） */
  unresolved: { ja: '未克服', zh: '未订正' },
  /** 未確認（正誤の記録が無く判定できない）。「未克服」と断定しない */
  unverifiable: { ja: '未確認', zh: '待确认' },
} as const satisfies Record<string, Term>;

/**
 * 正誤キー付きの試行。
 * advTypes.AdvMasteryAttempt へ `wrongKeys?: string[]` を足す前提の設計だが、
 * 型追加は別作業なのでここでは構造的に読む（追加後もこの型はそのまま成立する）。
 *
 * 重要: **wrongKeys が配列として存在すること自体が「正誤を記録した試行」の印**。
 * 全問正解でも `wrongKeys: []` を入れること（省略すると旧データと区別できない）。
 */
export type GradedMasteryAttempt = AdvMasteryAttempt & {
  /** この試行で間違えた問題キー。undefined = 旧データ（正誤不明） */
  wrongKeys?: string[];
  /** 正解キー（任意）。wrongKeys があればそちらを優先し、無ければ questionKeys との差で誤答を求める */
  correctKeys?: string[];
};

/** 誤答1件の状態。「判定できない」を型で持つのが要点 */
export type MistakeResolution =
  /** 未克服: 克服の条件（別の日をまたぐ連続正解）をまだ満たしていない */
  | 'unresolved'
  /** 克服: 最後の誤答より後に、条件を満たす連続正解の記録がある */
  | 'overcome'
  /** 判定不能: 直近に「正誤を記録していない試行」で出題されており、いまの状態を確認できていない */
  | 'unverifiable';

export interface MistakeEntry {
  questionKey: string;
  /** 問題キーの型接頭辞（rec: / cloze: / meaning: …）。絞り込み表示用 */
  questionType: string;
  /** 表示用の代表target（最後に間違えたときのtarget。安定のため辞書順の先頭） */
  targetId: string;
  /** この問題が記録された全target（束バトルでは stage束IDと単元IDの両方に載る） */
  targetIds: string[];
  /**
   * 何回間違えたか。**全期間ではなく「台帳に残っている範囲」**。
   * 台帳は1target当たり MASTERY_RULES.maxAttemptsKept 試行までしか保持せず、
   * 古い試行から間引かれる（advMastery.recordAttempt）。間引かれた誤答はここに数えられず、
   * 未克服のまま該当試行が全部間引かれると、その誤答はノートからも消える。
   * 表示のときは「記録に残っている範囲」と断ること（summarizeMistakes.coverageNote）。
   */
  wrongCount: number;
  /**
   * 最後に間違えた日（日付キー YYYY-MM-DD）。
   * 試行の dateKey（AdvMasteryAttempt の約束では JST）をそのまま使い、
   * 欠落・不正形式のときだけ completedAt から JST で導く（UTCの日付を混ぜない）。
   */
  lastWrongDateKey: string;
  /** 最後に間違えた時刻（ISO） */
  lastWrongAt: string;
  /**
   * 最後に間違えてから何日たったか（0以上）。
   * lastWrongDateKey と nowISO の**JSTカレンダー日付**の差。経過ミリ秒ではないので、
   * 「0日前」は「JSTで同じ日」を意味する（日付キーと基準が食い違わない）。
   */
  daysSinceLastWrong: number;
  /** 最後の誤答より後に、正誤が記録された試行で正解した回数（連続でなくても数える） */
  correctSinceLastWrong: number;
  /** そのうち「連続」正解の回数（誤答・正誤不明の試行が挟まると0に戻る） */
  correctStreakSinceLastWrong: number;
  /**
   * いまの連続正解のうち、最後に間違えた日**より後**の日付キー（昇順・重複なし）。
   * 克服（別日条件）の証拠そのもの。間違えた当日の正解はここに入らない。
   */
  clearDayKeysSinceLastWrong: string[];
  /** 最後の誤答より後に出題されたが正誤が記録されていない試行の回数（参考値） */
  unverifiedSinceLastWrong: number;
  /**
   * 最後に「正誤が記録された試行」より後の、正誤不明の試行の回数。
   * >0 なら現在の状態を確認できない（'unverifiable' の判定条件はこちら）。
   * 途中に旧データが挟まっても、そのあと正誤つきで解いていれば未確認扱いにしない。
   */
  unverifiedSinceLastGraded: number;
  resolution: MistakeResolution;
}

export interface MistakeNotebook {
  /** 優先度順（未克服→克服、誤答回数が多い順、最近間違えた順）。出題順と同じ */
  entries: MistakeEntry[];
  /** 台帳にある試行数（同一試行の重複記録は1回に畳んだあと・台帳に残っている範囲） */
  totalAttempts: number;
  /** そのうち正誤が記録されている試行数 */
  gradedAttempts: number;
  /**
   * 正誤が記録された試行が1件でもあるか。
   * false のとき entries が空なのは「誤答が無い」ではなく「まだ記録していない」。
   */
  recordingAvailable: boolean;
  /**
   * 集計の対象が「台帳に残っている試行」に限られることを型でも示す上限。
   * = MASTERY_RULES.maxAttemptsKept（1target当たり）。これより古い誤答は含まれない。
   */
  retainedAttemptsPerTarget: number;
  /** 算出時刻（nowISO をそのまま返す） */
  generatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 学習の「1日」は Asia/Tokyo 基準（AdvMasteryAttempt.dateKey・courseUsage.jstTodayISO と同じ約束）。
 * completedAt.slice(0,10) は UTC の日付になり、JST 00:00〜09:00 の試行が1日ずれるので使わない。
 * 不正な ISO では '' を返す（呼び出し側でフォールバックする）。
 */
const JST_KEY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' });
export const mistakeDateKeyOf = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : JST_KEY_FMT.format(new Date(t));
};

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const isDateKey = (v: unknown): v is string => typeof v === 'string' && DATE_KEY_RE.test(v);

const stringsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isNonEmptyString) : []);

/** 同一試行を畳んだ単位（束バトルは同じ attempt が stage束IDと単元IDの両方へ記録される） */
interface Sitting {
  completedAt: string;
  /** JST日付キー（試行の dateKey を優先し、無ければ completedAt から導く） */
  dateKey: string;
  /** dateKey が試行に明記されていたか（マージ時にどちらを採るかの判断に使う） */
  dateKeyExplicit: boolean;
  targetIds: string[];
  /** この試行で出題された問題キー（wrongKeys にしか無いキーも取りこぼさない） */
  keys: string[];
  /** 正誤が記録された試行か */
  graded: boolean;
  wrong: Set<string>;
}

/**
 * 台帳を「試行」の時系列へ畳む。
 * 同じ attempt が複数targetへ記録されている（AdvShell の midboss/rankboss 記録）ため、
 * completedAt と出題内容で同一視しないと誤答回数が二重に数えられる。
 */
const collectSittings = (ledger: AdvMasteryLedger | undefined): Sitting[] => {
  const byId = new Map<string, Sitting>();
  for (const [targetId, list] of Object.entries(ledger ?? {})) {
    if (!isNonEmptyString(targetId) || !Array.isArray(list)) continue;
    for (const raw of list) {
      const a = raw as GradedMasteryAttempt | null | undefined;
      if (!a || typeof a !== 'object' || !isNonEmptyString(a.completedAt)) continue;
      const questionKeys = stringsOf(a.questionKeys);
      // 正誤の記録があるか＝wrongKeys（優先）か correctKeys が配列として存在するか
      const hasWrong = Array.isArray(a.wrongKeys);
      const hasCorrect = Array.isArray(a.correctKeys);
      const graded = hasWrong || hasCorrect;
      const correct = new Set(stringsOf(a.correctKeys));
      const wrong = hasWrong
        ? new Set(stringsOf(a.wrongKeys))
        : new Set(hasCorrect ? questionKeys.filter((k) => !correct.has(k)) : []);
      // 台帳が壊れていて wrongKeys にしか無いキーがあっても誤答として拾う
      const keys = [...new Set([...questionKeys, ...wrong])];
      const explicitKey = isDateKey(a.dateKey) ? a.dateKey : '';
      const id = `${a.completedAt}|${questionKeys.length}|${questionKeys[0] ?? ''}`;
      const prev = byId.get(id);
      if (prev) {
        if (!prev.targetIds.includes(targetId)) prev.targetIds.push(targetId);
        // 同一試行のはずだが、片方にしか無い情報がある壊れ方に備えて「情報が多い方」へ寄せる。
        // ここで keys をマージしないと、graded 側の wrongKeys にしか無いキーが拾えない。
        if (keys.length > 0) prev.keys = [...new Set([...prev.keys, ...keys])];
        if (graded) {
          prev.graded = true;
          // どれか1つの記録でも誤答と言っているなら誤答として扱う（正解だったと言い切らない）
          for (const k of wrong) prev.wrong.add(k);
        }
        if (!prev.dateKeyExplicit && explicitKey) { prev.dateKey = explicitKey; prev.dateKeyExplicit = true; }
        continue;
      }
      byId.set(id, {
        completedAt: a.completedAt,
        dateKey: explicitKey || mistakeDateKeyOf(a.completedAt),
        dateKeyExplicit: explicitKey !== '',
        targetIds: [targetId],
        keys,
        graded,
        wrong,
      });
    }
  }
  return [...byId.values()].sort((x, y) => (x.completedAt < y.completedAt ? -1 : x.completedAt > y.completedAt ? 1 : 0));
};

interface Acc {
  targets: Set<string>;
  wrongCount: number;
  lastWrongAt: string | null;
  lastWrongDateKey: string;
  lastWrongTargets: string[];
  correctSince: number;
  streak: number;
  /** 連続正解のうち「最後に間違えた日より後」の日付キー（別日条件の証拠） */
  clearDays: Set<string>;
  unverifiedSinceWrong: number;
  unverifiedSinceGraded: number;
}

const newAcc = (): Acc => ({
  targets: new Set(), wrongCount: 0, lastWrongAt: null, lastWrongDateKey: '',
  lastWrongTargets: [], correctSince: 0, streak: 0, clearDays: new Set(),
  unverifiedSinceWrong: 0, unverifiedSinceGraded: 0,
});

/** 克服の条件を満たしているか（連続正解の回数＋別日条件） */
const isCleared = (streak: number, clearDayCount: number): boolean => {
  if (streak < MISTAKE_RULES.clearStreak) return false;
  // 原則9: 同じ日に何度正解しても記憶に残った証拠にならない（おかわりバトルで当日に何度でも挑戦できる）
  if (MISTAKE_RULES.requireDifferentDays && clearDayCount < MISTAKE_RULES.clearStreak) return false;
  return true;
};

const resolutionOf = (a: Acc): MistakeResolution => {
  if (isCleared(a.streak, a.clearDays.size)) return 'overcome';
  // 最後の正誤つき試行より後に「正誤を記録していない試行」で出ている＝いまの状態が分からない。
  // ここで未克服と言い切ることも克服と推定することもしない（原則13）。
  if (a.unverifiedSinceGraded > 0) return 'unverifiable';
  return 'unresolved';
};

const rankOf = (e: MistakeEntry): number => (e.resolution === 'overcome' ? 1 : 0);

/** 優先度: 未克服が先 → 間違えた回数が多い → 最近間違えた → キー辞書順（決定的） */
export const compareMistakeEntries = (a: MistakeEntry, b: MistakeEntry): number => {
  if (rankOf(a) !== rankOf(b)) return rankOf(a) - rankOf(b);
  if (a.wrongCount !== b.wrongCount) return b.wrongCount - a.wrongCount;
  if (a.lastWrongAt !== b.lastWrongAt) return a.lastWrongAt < b.lastWrongAt ? 1 : -1;
  return a.questionKey < b.questionKey ? -1 : a.questionKey > b.questionKey ? 1 : 0;
};

/** 日付キー同士のカレンダー日数差（不正な形式なら null） */
const daysBetweenDateKeys = (fromKey: string, toKey: string): number | null => {
  if (!isDateKey(fromKey) || !isDateKey(toKey)) return null;
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / DAY_MS));
};

/** 経過ミリ秒ベースの日数（日付キーが読めないときのフォールバック・0以上） */
const daysBetweenISO = (fromISO: string, toISO: string): number => {
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.floor((to - from) / DAY_MS));
};

/**
 * 台帳から错题本を作る（純関数）。
 * 誤答が1件も見つからなくても recordingAvailable を見れば
 * 「本当に誤答が無い」と「まだ正誤を記録していない」を取り違えない。
 */
export const buildMistakeNotebook = (
  ledger: AdvMasteryLedger | undefined, nowISO: string,
): MistakeNotebook => {
  const sittings = collectSittings(ledger);
  const acc = new Map<string, Acc>();

  for (const s of sittings) {
    for (const key of s.keys) {
      const a = acc.get(key) ?? newAcc();
      for (const t of s.targetIds) a.targets.add(t);
      if (!s.graded) {
        // 正誤不明の試行。誤答後なら「連続正解」とは言えないので連続をリセットする
        if (a.lastWrongAt !== null) {
          a.unverifiedSinceWrong += 1;
          a.unverifiedSinceGraded += 1;
          a.streak = 0;
          a.clearDays.clear();
        }
      } else if (s.wrong.has(key)) {
        a.wrongCount += 1;
        a.lastWrongAt = s.completedAt;
        a.lastWrongDateKey = s.dateKey;
        a.lastWrongTargets = [...s.targetIds].sort();
        a.correctSince = 0; a.streak = 0; a.clearDays.clear();
        a.unverifiedSinceWrong = 0; a.unverifiedSinceGraded = 0;
      } else if (a.lastWrongAt !== null) {
        a.correctSince += 1; a.streak += 1;
        a.unverifiedSinceGraded = 0;
        // 別日条件: 間違えた当日の正解は「日をまたいだ」証拠にならないので数えない
        if (s.dateKey > a.lastWrongDateKey) a.clearDays.add(s.dateKey);
      }
      acc.set(key, a);
    }
  }

  const nowKey = mistakeDateKeyOf(nowISO);
  const entries: MistakeEntry[] = [];
  for (const [questionKey, a] of acc) {
    if (a.lastWrongAt === null) continue; // 一度も間違えていない問題はノートに載せない
    const targetIds = [...a.targets].sort();
    entries.push({
      questionKey,
      questionType: questionTypeOf(questionKey),
      targetId: a.lastWrongTargets[0] ?? targetIds[0] ?? '',
      targetIds,
      wrongCount: a.wrongCount,
      lastWrongDateKey: a.lastWrongDateKey,
      lastWrongAt: a.lastWrongAt,
      daysSinceLastWrong: daysBetweenDateKeys(a.lastWrongDateKey, nowKey)
        ?? daysBetweenISO(a.lastWrongAt, nowISO),
      correctSinceLastWrong: a.correctSince,
      correctStreakSinceLastWrong: a.streak,
      clearDayKeysSinceLastWrong: [...a.clearDays].sort(),
      unverifiedSinceLastWrong: a.unverifiedSinceWrong,
      unverifiedSinceLastGraded: a.unverifiedSinceGraded,
      resolution: resolutionOf(a),
    });
  }
  entries.sort(compareMistakeEntries);

  const gradedAttempts = sittings.filter((s) => s.graded).length;
  return {
    entries,
    totalAttempts: sittings.length,
    gradedAttempts,
    recordingAvailable: gradedAttempts > 0,
    retainedAttemptsPerTarget: MASTERY_RULES.maxAttemptsKept,
    generatedAt: nowISO,
  };
};

/** まだ克服できていない（未克服＋判定不能）か。克服と言い切れないものは全部こちら */
export const isPendingMistake = (e: MistakeEntry): boolean => e.resolution !== 'overcome';

/** 克服まであと何回正解が要るか（別日条件込み・最低1） */
export const remainingCorrectsForOvercome = (e: MistakeEntry): number => {
  const byStreak = MISTAKE_RULES.clearStreak - e.correctStreakSinceLastWrong;
  const byDays = MISTAKE_RULES.requireDifferentDays
    ? MISTAKE_RULES.clearStreak - e.clearDayKeysSinceLastWrong.length
    : 0;
  return Math.max(1, byStreak, byDays);
};

export interface MistakePickOptions {
  /** このtargetの誤答だけに絞る（target別の解き直し） */
  targetId?: string;
  /** キーの型接頭辞で絞る（rec: / cloze: など） */
  questionType?: string;
  /** 克服済みも混ぜる（維持確認したいとき）。既定は混ぜない */
  includeOvercome?: boolean;
}

/**
 * 解き直し用の問題キーを返す（出題そのものは呼び出し側がプールから解決する）。
 * 優先度は entries の並び（未克服が先 → 間違えた回数が多い → 最近間違えた）。
 * limit は小数を切り捨てる（2.7 → 2問。切り上げて約束より多く出さない）。
 */
export const pickMistakeReviewKeys = (
  notebook: MistakeNotebook, limit: number, opts: MistakePickOptions = {},
): string[] => {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const max = Math.floor(limit);
  if (max <= 0) return [];
  const picked: string[] = [];
  for (const e of notebook.entries) {
    if (!opts.includeOvercome && !isPendingMistake(e)) continue;
    if (opts.targetId && !e.targetIds.includes(opts.targetId)) continue;
    if (opts.questionType && e.questionType !== opts.questionType) continue;
    picked.push(e.questionKey);
    if (picked.length >= max) break;
  }
  return picked;
};

/** バトル編成の recentWrongKeys（優先再出題）へ渡す集合。未克服＋判定不能のみ */
export const pendingMistakeKeySet = (notebook: MistakeNotebook): Set<string> =>
  new Set(notebook.entries.filter(isPendingMistake).map((e) => e.questionKey));

export interface MistakeTargetBreakdown {
  targetId: string;
  label: Term;
  unresolved: number;
  unverifiable: number;
  overcome: number;
  /** 未克服＋判定不能 */
  pending: number;
  total: number;
}

export interface MistakeSummary {
  unresolvedCount: number;
  unverifiableCount: number;
  overcomeCount: number;
  /** 未克服＋判定不能（「あと何問みるか」の数）。見出しではこの2つを混ぜて断定しない */
  pendingCount: number;
  totalCount: number;
  /** pending が多い順（同数なら total 多い順 → targetId 辞書順） */
  byTarget: MistakeTargetBreakdown[];
  /** 見出し。記録がまだ無い場合はそう言う（「間違いゼロ」と言わない） */
  headline: Term;
  /** 「克服」の意味の但し書き（別日条件・合格を保証しない） */
  note: Term;
  /** 数えられる範囲の但し書き（台帳に残っている試行だけ）。常に出す */
  coverageNote: Term;
  /** 判定不能が混じるときだけ出す説明。無ければ null */
  unverifiedNote: Term | null;
}

export interface MistakeSummaryOptions {
  /** targetId → 表示名。無ければ targetId をそのまま出す（存在しない名前を作らない） */
  labelOf?: (targetId: string) => Term | undefined;
}

/** 「克服」の定義文。数字と別日条件は MISTAKE_RULES から埋める（説明だけ実装とずれるのを防ぐ） */
export const mistakeRuleNote = (): Term => {
  const n = MISTAKE_RULES.clearStreak;
  if (MISTAKE_RULES.requireDifferentDays) {
    return {
      ja: `「${MISTAKE_TERMS.overcome.ja}」は、最後に間違えたあと、別々の${n}日で続けて${n}回正解した記録です。同じ日に続けて正解しただけでは${MISTAKE_TERMS.overcome.ja}にしません（覚えていられるかは日をまたがないと確かめられないため）。試験の合格を保証するものではありません。`,
      zh: `“${MISTAKE_TERMS.overcome.zh}”指最后一次做错之后，在不同的${n}天里连续答对${n}次的记录。只在同一天里连续答对不算，因为能不能记住，要隔一天才看得出来。这并不保证考试合格。`,
    };
  }
  return {
    ja: `「${MISTAKE_TERMS.overcome.ja}」は、最後に間違えたあと、同じ問題に続けて${n}回正解した記録です。試験の合格を保証するものではありません。`,
    zh: `“${MISTAKE_TERMS.overcome.zh}”指最后一次做错之后，这道题连续答对${n}次的记录。这并不保证考试合格。`,
  };
};

/** 数えられる範囲の但し書き（台帳の保持上限より古い誤答は入らない） */
export const mistakeCoverageNote = (): Term => ({
  ja: `この一覧は台帳に残っている記録（1単元あたり最大${MASTERY_RULES.maxAttemptsKept}回の記録）から作っています。それより古い誤答は入っていません。`,
  zh: `这份清单只根据台账里保留的记录（每个单元最多${MASTERY_RULES.maxAttemptsKept}次）生成，更早的错题不在其中。`,
});

const EMPTY_HEADLINE: Term = {
  ja: '誤答の記録はまだありません（これからのバトルから記録します）',
  zh: '还没有错题记录（从下次战斗开始记录）',
};

const NO_MISTAKE_HEADLINE: Term = {
  ja: '記録された誤答はありません',
  zh: '记录中没有错题',
};

/** 表示用の集計（未克服・未確認・克服・target別の内訳） */
export const summarizeMistakes = (
  notebook: MistakeNotebook, opts: MistakeSummaryOptions = {},
): MistakeSummary => {
  let unresolvedCount = 0, unverifiableCount = 0, overcomeCount = 0;
  const rows = new Map<string, MistakeTargetBreakdown>();
  for (const e of notebook.entries) {
    if (e.resolution === 'overcome') overcomeCount += 1;
    else if (e.resolution === 'unverifiable') unverifiableCount += 1;
    else unresolvedCount += 1;
    // 内訳の合計が全体と一致するよう、1件は代表targetにだけ数える
    const row = rows.get(e.targetId) ?? {
      targetId: e.targetId,
      label: opts.labelOf?.(e.targetId) ?? { ja: e.targetId, zh: e.targetId },
      unresolved: 0, unverifiable: 0, overcome: 0, pending: 0, total: 0,
    };
    if (e.resolution === 'overcome') row.overcome += 1;
    else if (e.resolution === 'unverifiable') { row.unverifiable += 1; row.pending += 1; }
    else { row.unresolved += 1; row.pending += 1; }
    row.total += 1;
    rows.set(e.targetId, row);
  }
  const pendingCount = unresolvedCount + unverifiableCount;
  const totalCount = pendingCount + overcomeCount;

  const byTarget = [...rows.values()].sort((a, b) => {
    if (a.pending !== b.pending) return b.pending - a.pending;
    if (a.total !== b.total) return b.total - a.total;
    return a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0;
  });

  // 「未確認」を「未克服」に混ぜて断定しない（判定不能は判定不能のまま見出しに出す）
  const counted: Term = unverifiableCount === 0
    ? {
      ja: `${MISTAKE_TERMS.unresolved.ja} ${unresolvedCount}問 / ${MISTAKE_TERMS.overcome.ja} ${overcomeCount}問`,
      zh: `${MISTAKE_TERMS.unresolved.zh} ${unresolvedCount}题 / ${MISTAKE_TERMS.overcome.zh} ${overcomeCount}题`,
    }
    : {
      ja: `${MISTAKE_TERMS.unresolved.ja} ${unresolvedCount}問 / ${MISTAKE_TERMS.unverifiable.ja} ${unverifiableCount}問 / ${MISTAKE_TERMS.overcome.ja} ${overcomeCount}問`,
      zh: `${MISTAKE_TERMS.unresolved.zh} ${unresolvedCount}题 / ${MISTAKE_TERMS.unverifiable.zh} ${unverifiableCount}题 / ${MISTAKE_TERMS.overcome.zh} ${overcomeCount}题`,
    };
  const headline: Term = totalCount === 0
    ? (notebook.recordingAvailable ? NO_MISTAKE_HEADLINE : EMPTY_HEADLINE)
    : counted;

  const unverifiedNote: Term | null = unverifiableCount === 0 ? null : {
    ja: `うち${unverifiableCount}問は正誤を記録していない時期に出題されており、${MISTAKE_TERMS.overcome.ja}できたかまだ確認できていません。`,
    zh: `其中${unverifiableCount}题是在没有记录对错的时期做的，是否已经订正还无法确认。`,
  };

  return {
    unresolvedCount, unverifiableCount, overcomeCount, pendingCount, totalCount,
    byTarget, headline, note: mistakeRuleNote(), coverageNote: mistakeCoverageNote(), unverifiedNote,
  };
};

/**
 * 語彙の問題キーから「何の語だったか」を取り出す（2026-08-23）。
 *
 * 【なぜ要るか】
 * 错题本は設計上「キーだけ」を持ち、問題文の解決は呼び出し側の責任にしてある。
 * ところが画面側がその解決をしておらず、18件の誤答が全部「词汇」という
 * 学習対象名だけで並んでいた（本番実測）。**何を間違えたのかが1件も分からない。**
 *
 * 語彙キーは `vocab:${surface}:${reading}:${aspect}` の形で、**語そのものを含んでいる**。
 * 出題プールを読み込めない状況（chunk未ロード・語がプールから外れた等）でも、
 * キーだけは台帳にあるので、ここから最低限「どの語か」は必ず出せる。
 *
 * プールが引けるときは、そちらの問題（中国語の意味つき）を優先すること。
 * ここは「最後の砦」であって、これで十分という意味ではない。
 */
export interface VocabMistakeKeyParts {
  /** 表記（例: 経済） */
  surface: string;
  /** 読み（例: けいざい） */
  reading: string;
  /** 観点（reading / writing / meaning など） */
  aspect: string;
}

export const parseVocabMistakeKey = (questionKey: string): VocabMistakeKeyParts | null => {
  if (typeof questionKey !== 'string') return null;
  // surface/reading に ':' は入らない前提だが、aspect 側は末尾を採って崩れに強くする
  const parts = questionKey.split(':');
  if (parts.length < 4 || parts[0] !== 'vocab') return null;
  const [, surface, reading] = parts;
  const aspect = parts[parts.length - 1];
  if (!isNonEmptyString(surface) || !isNonEmptyString(reading) || !isNonEmptyString(aspect)) return null;
  return { surface, reading, aspect };
};

/** 誤答1件の状態文（あと何回で克服か。脅し文句は使わない） */
export const mistakeStatusText = (e: MistakeEntry): Term => {
  const n = MISTAKE_RULES.clearStreak;
  const differentDays = MISTAKE_RULES.requireDifferentDays;
  if (e.resolution === 'overcome') {
    return differentDays
      ? { ja: `${MISTAKE_TERMS.overcome.ja}（別の日に続けて${n}回正解）`, zh: `${MISTAKE_TERMS.overcome.zh}（在不同的日子连续答对${n}次）` }
      : { ja: `${MISTAKE_TERMS.overcome.ja}（続けて${n}回正解）`, zh: `${MISTAKE_TERMS.overcome.zh}（连续答对${n}次）` };
  }
  const remain = remainingCorrectsForOvercome(e);
  // 「あと何回」は判定不能のときも出す（未確認としか言わないと、次に何をすればいいか分からない）
  const nextJa = differentDays
    ? `別の日にあと${remain}回正解すると${MISTAKE_TERMS.overcome.ja}`
    : `あと${remain}回正解すると${MISTAKE_TERMS.overcome.ja}`;
  const nextZh = differentDays
    ? `在不同的日子再答对${remain}次，就记为“${MISTAKE_TERMS.overcome.zh}”`
    : `再答对${remain}次，就记为“${MISTAKE_TERMS.overcome.zh}”`;
  if (e.resolution === 'unverifiable') {
    // 「何回ぶん確認できていないか」を数で言う（曖昧に「何度か」と盛らない）
    const n = e.unverifiedSinceLastGraded;
    return {
      ja: `正誤を記録していない回が${n}回あるため${MISTAKE_TERMS.unverifiable.ja}（${nextJa}）`,
      zh: `有${n}次没有记录对错，${MISTAKE_TERMS.unverifiable.zh}（${nextZh}）`,
    };
  }
  return { ja: nextJa, zh: nextZh };
};
