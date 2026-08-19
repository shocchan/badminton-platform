// つまずき救済（2026-08-19）。同じ束で合格できない日が続く生徒を挫折させないための純関数層。
//
// 背景（CEO懸念）: 5/7合格ライン・束内ローテーション・weak_reinforce・錯題本があっても、
// 「同じ束で別日3回不合格」が続くと本人には打つ手が見えず、そこで学習が止まる。
// ここでは **合格水準は一切下げずに**、詰まりの検知と「今日の見せ方」の変更だけを提案する:
//   level1: 今日のバトルを「間違えた問題だけの7問」に差し替える提案（既出問題中心なので
//           unseenRatio が minUnseenRatio に届かず、qualifying試行には自然に化けない＝水準は下がらない）
//   level2: 束を一時スキップして次の束と並行にする提案。スキップは skipReturnDays（3日）で
//           **必ず自動で戻る**。永久スキップは型として存在しない（returnDateKey必須）。
//
// このファイルは判定と提案だけ（純関数）。AdvShell への配線は別途:
//   - detectStuck は「いま攻略中の束のtargetId」で呼ぶ（quest生成時に1回）
//   - level1採択時は buildEncounter の代わりに focusBattle.questionKeys で編成し、
//     採点は通常どおり gradeEncounter → recordAttempt（unseenCapped は必ず false のまま）
//   - level2採択時は StuckSkipState をプロファイルへ保存し、quest生成側は
//     activeStuckSkips() に入っている束を今日の主対象から外して nextTargetId を出す。
//     returnDateKey を過ぎた記録は activeStuckSkips が自動で落とすので解除処理は不要
import type { AdvCompanionId, AdvMasteryLedger } from './advTypes';
import { MASTERY_RULES } from './advMastery';
import { addDayKey, dateKeyOf } from './advReviewForecast';

export const STUCK_RESCUE_RULES = {
  /** 別日この回数、不合格（合格ライン未満）が続いたら stuck（level1）。2回では発火しない */
  failDaysForStuck: 3,
  /** さらに続いてこの別日数に達したら一時スキップ（level2）も提案する */
  failDaysForSkip: 5,
  /** これより古い日の不合格は数えない（昔の記録で今日を責めない） */
  recentWindowDays: 14,
  /** スキップした束を自動で戻すまでの日数。**永久スキップは無い**＝合格水準を下げない */
  skipReturnDays: 3,
  /** 救済バトルの問題数（通常のnormalバトルと同じ7問） */
  focusBattleSize: 7,
} as const;

// ────────────────────────────── 詰まり判定 ──────────────────────────────

export interface StuckStatus {
  stuck: boolean;
  /** 0=詰まっていない / 1=救済バトル提案 / 2=一時スキップも提案 */
  level: 0 | 1 | 2;
  /**
   * 直近の連続不合格の別日（新しい順）。最新日から遡り、合格した日か
   * recentWindowDays より古い日に当たった時点で数えるのをやめる
   */
  failDayKeys: string[];
  /**
   * 直近試行で間違えたままの問題キー（新しい順・重複なし）＝救済バトルの材料。
   * 後の試行で正解し直した問題は含めない（もう克服した問題を「弱点」と呼ばない）。
   * wrongKeys が無い旧データの試行は正誤不明なので、正解扱いにも誤答扱いにもしない
   */
  recentWrongKeys: string[];
}

/**
 * 直近の試行から「詰まり」を判定する（純関数）。
 * - 完走した試行（partialでない）だけで日ごとのベストを取り、
 *   **最新日から連続して**合格ライン未満だった別日を数える
 * - 途中でやめた回は不合格の証拠にしない（advMastery が攻略に数えないのと同じ扱い。
 *   「やめた」ことまで失敗に数えると、忙しかった日が詰まり判定を早める）
 * - 同じ日に何回不合格でも1日と数える（1日で3回挑んだ人を3日詰まった人にしない）
 */
export const detectStuck = (
  ledger: AdvMasteryLedger, targetId: string, nowISO: string,
): StuckStatus => {
  const attempts = ledger[targetId] ?? [];
  const todayKey = dateKeyOf(nowISO);
  const windowStartKey = addDayKey(todayKey, -STUCK_RESCUE_RULES.recentWindowDays);

  // 日ごとのベストスコア（完走した試行のみ）
  const bestByDay = new Map<string, number>();
  for (const a of attempts) {
    if (a.partial) continue;
    if (a.dateKey < windowStartKey) continue;
    bestByDay.set(a.dateKey, Math.max(bestByDay.get(a.dateKey) ?? 0, a.scorePct));
  }

  // 最新日から遡って連続不合格日を数える（合格日に当たったら止まる＝立ち直りを尊重）
  const daysDesc = [...bestByDay.keys()].sort().reverse();
  const failDayKeys: string[] = [];
  for (const day of daysDesc) {
    if ((bestByDay.get(day) ?? 0) >= MASTERY_RULES.passPct) break;
    failDayKeys.push(day);
  }

  const level: 0 | 1 | 2 =
    failDayKeys.length >= STUCK_RESCUE_RULES.failDaysForSkip ? 2
      : failDayKeys.length >= STUCK_RESCUE_RULES.failDaysForStuck ? 1 : 0;

  // 間違えたままの問題キー: 正誤を記録した試行（wrongKeysあり）を新しい順に見て、
  // 各問題キーの**最新の結果**を採る。最新が誤答のものだけを弱点として残す
  const withOutcome = attempts
    .filter((a) => a.wrongKeys !== undefined && a.dateKey >= windowStartKey)
    .sort((x, y) => (x.completedAt < y.completedAt ? 1 : x.completedAt > y.completedAt ? -1 : 0));
  const decided = new Set<string>();
  const recentWrongKeys: string[] = [];
  for (const a of withOutcome) {
    const wrong = new Set(a.wrongKeys);
    for (const k of a.questionKeys) {
      if (decided.has(k)) continue; // より新しい試行の結果が既に決まっている
      decided.add(k);
      if (wrong.has(k)) recentWrongKeys.push(k);
    }
  }

  return { stuck: level > 0, level, failDayKeys, recentWrongKeys };
};

// ────────────────────────────── 救済の提案 ──────────────────────────────

export interface StuckBundleInput {
  /** 詰まっている束（targetId） */
  targetId: string;
  /** 束の出題プールにある全問題キー（救済バトルの補充候補） */
  poolKeys: string[];
  /**
   * この学習者が既に見た問題キー（advMastery.seenQuestionKeys）。
   * 補充は既出問題を優先する: 未出問題で埋めると救済バトルが unseenRatio>=0.3 を満たして
   * qualifying試行（攻略の証拠）に化け得る＝救済のつもりで合格水準が下がるのを防ぐ
   */
  seenKeys?: Set<string>;
  /** 次の束（level2の並行先）。無ければスキップ提案は出さない（最後の束は先が無い） */
  nextTargetId?: string | null;
  /** 今日の日付キー（YYYY-MM-DD）。スキップ復帰日の計算に使う */
  todayKey: string;
}

export interface StuckFocusBattle {
  kind: 'focus_battle';
  targetId: string;
  /**
   * 間違えた問題を先頭に、足りない分だけ束のプール（既出優先）で補った問題キー。
   * プールが focusBattleSize に満たなければその分だけ短くなる（存在するふりをしない）
   */
  questionKeys: string[];
  titleJa: string; titleZh: string;
  whyJa: string; whyZh: string;
}

export interface StuckSkipProposal {
  kind: 'skip_parallel';
  skipTargetId: string;
  /** スキップ中に並行して進める束 */
  parallelTargetId: string;
  /** この日になったら自動で戻す（永久スキップは無い） */
  returnDateKey: string;
  titleJa: string; titleZh: string;
  whyJa: string; whyZh: string;
}

export interface StuckRescuePlan {
  level: 0 | 1 | 2;
  /** level>=1 で必ずある。今日のバトルの差し替え候補 */
  focusBattle: StuckFocusBattle | null;
  /** level2 かつ nextTargetId がある場合のみ。無ければ focusBattle で続行 */
  skip: StuckSkipProposal | null;
  /** 相棒の励まし（責めない・「よくあること」と伝える）。level0 では空文字 */
  encourageJa: string; encourageZh: string;
}

/** 相棒別の励ましセリフ。責めない・「よくあること」と必ず伝える（ja/zh とも） */
const STUCK_CHEER: Record<AdvCompanionId, Record<1 | 2, { ja: string; zh: string }>> = {
  natsu: {
    1: {
      ja: '同じところで足踏みするのは、よくあることだよ。今日は間違えた問題だけ、いっしょにゆっくり見直そう',
      zh: '在同一个地方停下脚步，是很常见的事哦。今天我们只把做错的题，慢慢地再看一遍吧',
    },
    2: {
      ja: 'ここで少し休んでも、負けじゃないよ。よくあることだから、先に進んで3日後にまた戻ろう。わたしもいっしょだよ',
      zh: '在这里稍作停留，并不是失败哦。这很常见，我们先往前走，3天后再回来。我会一直陪着你',
    },
  },
  haru: {
    1: {
      ja: 'つまずきは発見のチャンス！よくあることだよ。間違えた問題だけ集めて、今日はそこを見に行こう',
      zh: '卡住其实是发现的机会！这很常见哦。我们把做错的题集中起来，今天就去看看它们吧',
    },
    2: {
      ja: 'ここはいったん置いて、新しい風に乗ろう！よくあることだから大丈夫。3日後に戻ってきたら、きっと見え方が変わってるよ',
      zh: '先把这里放一放，乘上新的风吧！这很常见，别担心。3天后回来时，你一定会有新的发现',
    },
  },
  aki: {
    1: {
      ja: '大丈夫、ここで止まるのはよくあることだよ！今日は間違えた問題だけの7問勝負。いっしょにリベンジしよ！',
      zh: '没关系，在这里停一下是很常见的！今天来一场只有错题的7题挑战，我们一起雪耻吧！',
    },
    2: {
      ja: 'ちょっと作戦変更！よくあることだから気にしない！先に次へ進んで、3日後にまた挑戦しに戻ろう。ぼくがついてるよ！',
      zh: '稍微换个作战计划！这很常见，别放在心上！先去下一关，3天后再回来挑战。有我在呢！',
    },
  },
};

/** 相棒の励ましセリフ（未選択は既定のナツ＝advCompanion.companionById と同じ既定） */
export const stuckCheerOf = (
  companionId: AdvCompanionId | null | undefined, level: 1 | 2,
): { ja: string; zh: string } => STUCK_CHEER[companionId ?? 'natsu']?.[level] ?? STUCK_CHEER.natsu[level];

/**
 * 詰まり判定から救済の提案を作る（純関数）。
 * - level1: 今日のバトルを「間違えた問題だけの7問」に差し替える提案
 * - level2: 上に加えて、束を skipReturnDays（3日）だけスキップして次の束と並行にする提案。
 *   nextTargetId が無い（最後の束など）ときは skip を出さず focusBattle で続行する
 * - 合格水準は変えない: 救済バトルも通常の採点・台帳記録で、passPct や requiredDays には触らない
 */
export const rescuePlanOf = (
  stuck: StuckStatus, bundle: StuckBundleInput, companionId?: AdvCompanionId | null,
): StuckRescuePlan => {
  if (stuck.level === 0) {
    return { level: 0, focusBattle: null, skip: null, encourageJa: '', encourageZh: '' };
  }

  // 間違えた問題を先頭に、既出プール→未出プールの順で focusBattleSize まで補充
  const keys: string[] = [];
  const used = new Set<string>();
  const push = (k: string): void => {
    if (keys.length >= STUCK_RESCUE_RULES.focusBattleSize || used.has(k)) return;
    used.add(k);
    keys.push(k);
  };
  for (const k of stuck.recentWrongKeys) push(k);
  const seen = bundle.seenKeys ?? new Set<string>();
  for (const k of bundle.poolKeys) if (seen.has(k)) push(k);
  for (const k of bundle.poolKeys) push(k);

  const focusBattle: StuckFocusBattle = {
    kind: 'focus_battle',
    targetId: bundle.targetId,
    questionKeys: keys,
    titleJa: '間違えた問題だけの救済バトル',
    titleZh: '只做错题的救援战',
    whyJa: '同じ束で足踏みが続いたので、今日は間違えた問題に絞って挑戦する（合格ラインは変わらない）',
    whyZh: '因为在同一关卡停留了几天，今天只集中挑战做错的题（合格线不变）',
  };

  const skip: StuckSkipProposal | null =
    stuck.level >= 2 && bundle.nextTargetId
      ? {
        kind: 'skip_parallel',
        skipTargetId: bundle.targetId,
        parallelTargetId: bundle.nextTargetId,
        returnDateKey: addDayKey(bundle.todayKey, STUCK_RESCUE_RULES.skipReturnDays),
        titleJa: 'この束をいったん置いて、次の束と並行する（3日後に自動で戻る）',
        titleZh: '暂时放下这一关，与下一关并行（3天后自动回来）',
        whyJa: '気分を変えて次の束を先に進める。スキップは3日間だけで、この束には必ず戻ってくる（永久スキップは無い）',
        whyZh: '换换心情，先推进下一关。跳过只有3天，这一关一定会回来（不会永久跳过）',
      }
      : null;

  // level2でもスキップ先が無ければ提案の実体は救済バトルなので、セリフもlevel1のものを使う
  const cheer = stuckCheerOf(companionId, skip ? 2 : 1);
  return { level: stuck.level, focusBattle, skip, encourageJa: cheer.ja, encourageZh: cheer.zh };
};

// ────────────────────────────── スキップ状態（3日で必ず戻る） ──────────────────────────────

/** プロファイルへ保存する一時スキップの記録。returnDateKey が必須＝期限の無いスキップは作れない */
export interface StuckSkipState {
  targetId: string;
  /** スキップを始めた日 YYYY-MM-DD */
  skippedOnKey: string;
  /** この日から自動で戻る（skippedOnKey + skipReturnDays） */
  returnDateKey: string;
}

/** スキップ記録を作る（採択時に呼ぶ）。復帰日はここで確定し、後から延ばす口は無い */
export const makeStuckSkip = (targetId: string, todayKey: string): StuckSkipState => ({
  targetId,
  skippedOnKey: todayKey,
  returnDateKey: addDayKey(todayKey, STUCK_RESCUE_RULES.skipReturnDays),
});

/** 今日まだ有効なスキップか。returnDateKey 当日から false＝その日から束は自動で戻る */
export const isStuckSkipActive = (skip: StuckSkipState, todayKey: string): boolean =>
  todayKey < skip.returnDateKey;

/**
 * 有効なスキップだけを残す（期限切れは自動で落ちる＝解除処理を書き忘れても永久スキップにならない）。
 * quest生成側はこの結果に入っている targetId だけを今日の主対象から外す
 */
export const activeStuckSkips = (skips: StuckSkipState[], todayKey: string): StuckSkipState[] =>
  skips.filter((s) => isStuckSkipActive(s, todayKey));
