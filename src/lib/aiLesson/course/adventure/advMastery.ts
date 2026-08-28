// 80%攻略台帳（§15）。「1回80%」で攻略にしない:
// ① ランダム問題で80%以上（未出問題を一定割合含む） ② 別の日に3回 ③ 7日後の遅延確認でも80%以上
// ④ 問題ID暗記では達成できない（unseenRatio条件） ⑤ 複数問題タイプを含む。
import type { AdvMasteryAttempt, AdvMasteryLedger, AdvMasteryState } from './advTypes';

export const MASTERY_RULES = {
  /**
   * 合格ライン（2026-08-18 CEO決定: 7問中5問）。
   *
   * 80 だった頃、通常バトルは7問なので 5/7=71% は不合格・6/7=86% で合格となり、
   * 「8割」と書いてありながら**実際は約9割を要求**していた。
   * 実測で正答率75%の生徒は120日たっても最初の束から出られなかった。
   * 71 にすると 5/7 が合格になり、表示どおりの水準になる
   * （10問なら8問・12問なら9問・20問なら15問）。
   * 既存の記録に対しては「合格が増える方向」にしか効かないので、進捗が減る生徒はいない。
   */
  passPct: 71,
  /** qualifying試行に必要な未出問題比率（プールが小さい場合は attempt側で下がるが、0は不可） */
  minUnseenRatio: 0.3,
  /** 別日回数 */
  requiredDays: 3,
  /** 遅延確認までの日数 */
  delayDays: 7,
  /** 5問以上の試行に求める問題タイプ数（プールに複数タイプがある場合） */
  minQuestionTypes: 2,
  /** 1target当たり保持する試行履歴の上限（jsonb肥大防止・古い順に間引く） */
  maxAttemptsKept: 24,
} as const;

/**
 * 画面に出す合格ラインの言い方。数字（71%）をそのまま見せると分かりにくいので
 * 「7割」で統一する。ここを直せば全画面が追随する
 */
export const PASS_LABEL = { ja: '7割以上', zh: '七成以上' } as const;

/** 問題キーの型接頭辞（rec: / cloze: / meaning: / form: / n3q: …） */
export const questionTypeOf = (key: string): string => key.split(':')[0] ?? 'unknown';

/** 試行がqualifying（攻略にカウントできる）か */
export const isQualifyingAttempt = (a: AdvMasteryAttempt, poolHasMultipleTypes: boolean): boolean => {
  // 欠けた項目があっても落ちない（2026-08-28 統合で復帰・元は 2a0a2a8）。
  // 定着の記録が1件でも壊れていると学習画面が丸ごと真っ白になり、
  // リロードしても同じ場所で落ちる＝その生徒は二度と入れなくなる。
  // 判定できないものは「合格していない」に倒す（甘く数えない）
  if (typeof a?.scorePct !== 'number' || a.scorePct < MASTERY_RULES.passPct) return false;
  // 途中でやめた回は「解いたぶんだけ」の記録なので攻略には数えない（2026-08-18）。
  // 数えると「解けそうな2問だけ答えて抜ける」で80%達成日が積める抜け道になる
  if (a.partial) return false;
  // プールを解き尽くして未出問題を供給できなかった回は、未出比率を問わない（2026-08-18 P0）。
  // 供給不能なものを要求すると、まじめに解いた生徒ほど永久に攻略できなくなる（実測で34束中6束が該当）
  if (!a.unseenCapped && (typeof a.unseenRatio !== 'number' || a.unseenRatio < MASTERY_RULES.minUnseenRatio)) return false;
  const keys = Array.isArray(a.questionKeys) ? a.questionKeys : [];
  if (poolHasMultipleTypes && keys.length >= 5) {
    // 文字列でないキーが混じっていても questionTypeOf で落ちないようにする（甘くはしない）
    const types = new Set(keys.map((k) => (typeof k === 'string' ? questionTypeOf(k) : 'unknown')));
    if (types.size < MASTERY_RULES.minQuestionTypes) return false;
  }
  return true;
};

/** 試行を台帳へ追記（イミュータブル・履歴上限あり） */
export const recordAttempt = (
  ledger: AdvMasteryLedger, targetId: string, attempt: AdvMasteryAttempt,
): AdvMasteryLedger => {
  const prev = ledger[targetId] ?? [];
  const next = [...prev, attempt];
  if (next.length <= MASTERY_RULES.maxAttemptsKept) return { ...ledger, [targetId]: next };

  /**
   * 上限を超えたら古いものから落とすが、**攻略の証拠になる試行は落とさない**（2026-08-18 監査P0）。
   *
   * 以前は単純に古い順で切っていたため、練習を重ねた生徒ほど
   * 「別の日に80%以上を3回」の達成日が台帳から消え、攻略が確定しなくなっていた。
   * 練習すればするほど攻略が遠のく（努力が罰になる）という最悪の壊れ方をしていた。
   *
   * 守るのは「合格点に届いた日の**最初の1回**を、古い方から requiredDays 日ぶん」。
   * qualifying の厳密判定（未出比率など）はプール情報が要るためここでは行わず、
   * 必要条件（passPct以上）で広めに守る。守りすぎても害は無い（記録が少し多く残るだけ）。
   */
  const protectedAttempts: AdvMasteryAttempt[] = [];
  const seenDays = new Set<string>();
  for (const a of next) {
    if (seenDays.size >= MASTERY_RULES.requiredDays) break;
    // 途中でやめた回は攻略に数えない（isQualifyingAttempt）ので、証拠として守らない。
    // 守ってしまうと、本物の合格記録が押し出されて攻略が確定しなくなる（2026-08-18 検証で発覚）
    if (a.partial || a.scorePct < MASTERY_RULES.passPct || seenDays.has(a.dateKey)) continue;
    seenDays.add(a.dateKey);
    protectedAttempts.push(a);
  }
  const protectedSet = new Set(protectedAttempts);
  const room = Math.max(0, MASTERY_RULES.maxAttemptsKept - protectedAttempts.length);
  const recent: AdvMasteryAttempt[] = [];
  for (let i = next.length - 1; i >= 0 && recent.length < room; i -= 1) {
    if (!protectedSet.has(next[i])) recent.push(next[i]);
  }
  const keep = new Set([...protectedAttempts, ...recent]);
  return { ...ledger, [targetId]: next.filter((a) => keep.has(a)) };   // 時系列は元の並びのまま
};

/** この学習者が過去に見た問題キー（未出判定に使う） */
export const seenQuestionKeys = (ledger: AdvMasteryLedger, targetIds?: string[]): Set<string> => {
  const seen = new Set<string>();
  const entries = targetIds ?? Object.keys(ledger);
  for (const t of entries) for (const a of ledger[t] ?? []) for (const k of a.questionKeys) seen.add(k);
  return seen;
};

export interface MasteryStatus {
  state: AdvMasteryState;
  /** qualifying達成済みの別日（昇順・最大 requiredDays 表示） */
  qualifyingDays: string[];
  /** 遅延確認が可能になる日時（ISO）。null=まだ3日未達 */
  delayCheckOpensAt: string | null;
  /** 遅延確認済みか */
  delayedConfirmed: boolean;
  /** 次に必要なこと（正直な表示・§21） */
  nextJa: string; nextZh: string;
}

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

/**
 * 攻略状態の算出（純関数）。
 * poolHasMultipleTypes: 対象の問題プールに複数タイプが存在するか（存在しない場合はタイプ条件を課さない）
 */
export const computeMastery = (
  attempts: AdvMasteryAttempt[] | undefined, nowISO: string, poolHasMultipleTypes = true,
): MasteryStatus => {
  const all = attempts ?? [];
  if (all.length === 0) {
    return {
      state: 'not_started', qualifyingDays: [], delayCheckOpensAt: null, delayedConfirmed: false,
      nextJa: `ランダム問題で${PASS_LABEL.ja}を目指す`, nextZh: `目标：随机题拿到${PASS_LABEL.zh}`,
    };
  }
  const qualifying = all.filter((a) => isQualifyingAttempt(a, poolHasMultipleTypes));
  const dayMap = new Map<string, AdvMasteryAttempt>();
  for (const a of qualifying) if (!dayMap.has(a.dateKey)) dayMap.set(a.dateKey, a);
  const days = [...dayMap.keys()].sort();

  if (days.length < MASTERY_RULES.requiredDays) {
    const remain = MASTERY_RULES.requiredDays - days.length;
    return {
      state: 'in_progress', qualifyingDays: days, delayCheckOpensAt: null, delayedConfirmed: false,
      nextJa: `別の日にあと${remain}回、${PASS_LABEL.ja}（未出問題を含む）`,
      nextZh: `还需在不同的日子再拿${remain}次${PASS_LABEL.zh}（含未见过的题）`,
    };
  }

  // 3日目のqualifying完了時刻から delayDays 後に遅延確認が開く
  const thirdDay = days[MASTERY_RULES.requiredDays - 1];
  const thirdAt = dayMap.get(thirdDay)?.completedAt ?? nowISO;
  const opensAt = addDays(thirdAt, MASTERY_RULES.delayDays);
  // 遅延確認は「7日後も忘れていないか」の確認（§15③）。初見比率は①のqualifying 3日で担保済み。
  // 毎日続けるほど未出問題が枯れて確認が永久に通らない行き止まり（原則15違反）を防ぐため、
  // 遅延確認の試行には unseenRatio 条件を課さない（80%以上のみ要求）。
  const delayed = all.some((a) => a.scorePct >= MASTERY_RULES.passPct && a.completedAt >= opensAt);
  if (delayed) {
    return {
      state: 'mastered', qualifyingDays: days.slice(0, 3), delayCheckOpensAt: opensAt, delayedConfirmed: true,
      nextJa: '攻略済み。ときどき復習で維持', nextZh: '已攻克。偶尔复习保持',
    };
  }
  const open = nowISO >= opensAt;
  return {
    state: 'cleared_pending_delay', qualifyingDays: days.slice(0, 3), delayCheckOpensAt: opensAt, delayedConfirmed: false,
    nextJa: open ? `7日後の確認バトルで${PASS_LABEL.ja}を取れば攻略` : '7日後に確認バトルがあります（忘れていないかの確認）',
    nextZh: open ? `通过7天后的复查战（${PASS_LABEL.zh}）即攻克` : '7天后有一场复查战（确认没有遗忘）',
  };
};

/**
 * 7日待ち（確認解禁前）と確認解禁済みのtargetを分類する（2026-08-15 進度改善）。
 * 旧実装は7日待ちのtargetを「次の学習対象」に据え続けたため、待ちの間の営業日が
 * 同じtargetへの無効バトルで消え、週7日満点でも21target完走に209日かかっていた。
 * waiting は次候補から外して先へ進み、confirmReady は確認バトルとして最優先で出す。
 */
export const classifyPendingDelay = (
  ledger: AdvMasteryLedger, nowISO: string,
): { waiting: Set<string>; confirmReady: Set<string> } => {
  const waiting = new Set<string>();
  const confirmReady = new Set<string>();
  for (const [t, attempts] of Object.entries(ledger)) {
    const st = computeMastery(attempts, nowISO);
    if (st.state !== 'cleared_pending_delay' || !st.delayCheckOpensAt) continue;
    if (nowISO >= st.delayCheckOpensAt) confirmReady.add(t);
    else waiting.add(t);
  }
  return { waiting, confirmReady };
};

/** ledger全体から mastered な targetId 集合 */
export const masteredTargetIds = (ledger: AdvMasteryLedger, nowISO: string): Set<string> => {
  const done = new Set<string>();
  for (const [t, attempts] of Object.entries(ledger)) {
    if (computeMastery(attempts, nowISO).state === 'mastered') done.add(t);
  }
  return done;
};

/**
 * ある時点でのmastered集合（時点評価）。
 * masteredTargetIds は台帳の**全attempt**を見るため、評価時刻を過去にしても
 * 「その時点の状態」を返せない（遅延確認attemptが台帳にあれば過去時点でもmastered扱いになる）。
 * 「今週あたらしく定着」やペース実測のような時点比較では必ずこちらを使う。
 */
export const masteredTargetIdsAsOf = (ledger: AdvMasteryLedger, atISO: string): Set<string> => {
  const sliced: AdvMasteryLedger = {};
  for (const [t, attempts] of Object.entries(ledger)) {
    sliced[t] = (attempts ?? []).filter((a) => a.completedAt <= atISO);
  }
  return masteredTargetIds(sliced, atISO);
};

/** stage攻略判定: stage束target（targetId=stageId）が mastered か */
export const masteredStageIds = (ledger: AdvMasteryLedger, stageIds: string[], nowISO: string): Set<string> => {
  const done = new Set<string>();
  for (const s of stageIds) if (computeMastery(ledger[s], nowISO).state === 'mastered') done.add(s);
  return done;
};

/** 攻略率（qualifying日数と遅延確認を重みづけ。1回の高得点で跳ねない） */
export const masteryProgressPct = (attempts: AdvMasteryAttempt[] | undefined, nowISO: string, poolHasMultipleTypes = true): number => {
  const st = computeMastery(attempts, nowISO, poolHasMultipleTypes);
  if (st.state === 'mastered') return 100;
  const dayPart = Math.min(st.qualifyingDays.length, 3) * 25; // 3日で75%
  const delayPart = st.state === 'cleared_pending_delay' ? 10 : 0;
  return Math.min(85, dayPart + delayPart);
};

/**
 * masteredが**確定した時刻**（遅延確認を通過した最初のattemptのcompletedAt）。mastered以外はnull（2026-08-19）。
 * computeMastery と同じ規則で導出する（qualifying3日目→opensAt→それ以降のpassPct以上の最初の回）。
 * 攻略バッジの「獲得日」表示に使う。導出できないもの（束由来のstage doneなど台帳が無いケース）は
 * 呼び出し側が日付を出さない＝推定で埋めない（原則13）。
 */
export const masteredAtOf = (
  attempts: AdvMasteryAttempt[] | undefined, nowISO: string, poolHasMultipleTypes = true,
): string | null => {
  const all = attempts ?? [];
  if (all.length === 0) return null;
  const qualifying = all.filter((a) => isQualifyingAttempt(a, poolHasMultipleTypes));
  const dayMap = new Map<string, AdvMasteryAttempt>();
  for (const a of qualifying) if (!dayMap.has(a.dateKey)) dayMap.set(a.dateKey, a);
  const days = [...dayMap.keys()].sort();
  if (days.length < MASTERY_RULES.requiredDays) return null;
  const thirdDay = days[MASTERY_RULES.requiredDays - 1];
  const thirdAt = dayMap.get(thirdDay)?.completedAt ?? nowISO;
  const opensAt = addDays(thirdAt, MASTERY_RULES.delayDays);
  // 遅延確認は computeMastery と同じ条件（passPct以上・opensAt以降。unseenRatioは課さない）
  const confirms = all
    .filter((a) => a.scorePct >= MASTERY_RULES.passPct && a.completedAt >= opensAt)
    .map((a) => a.completedAt)
    .sort();
  return confirms[0] ?? null;
};
