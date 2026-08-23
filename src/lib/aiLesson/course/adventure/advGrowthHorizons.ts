/**
 * 成長の4段階（今日・今週・30日・半年）。2026-08-23 実生徒監査。
 *
 * 【なぜ作るか】
 * 実機で通しで使うと、見えるのは「今日やったこと」ばかりで、
 * 半年コースなのに **「前より話せるようになった」が画面のどこにも出ない**。
 * かといって指標を増やすと読めなくなるので、**段階を4つに固定**して
 * それぞれ1行ずつだけ言う。
 *
 * 【絶対に守ること（原則13）】
 * - 数えられる事実だけを出す。推定・按分・「だいたい」を作らない
 * - 記録が足りない段は **`measured: false`** にして「まだ言えません」と書く。
 *   0件を「0日」と出すと、始めたばかりの人に「何もしていない」と言うことになる
 * - 学習日数は questLog（冒険の記録）と mastery 台帳（実際に解いた記録）の**和集合**。
 *   どちらか一方だけだと、バトルしかしなかった日・会話しかしなかった日が落ちる
 * - questLog は直近60件しか持たない。半年の段は「記録に残っている範囲」と断る
 */
import type { AdventureV2Profile } from './advTypes';
import { MASTERY_RULES } from './advMastery';

export type HorizonKey = 'today' | 'week' | 'month' | 'halfYear';

export interface GrowthHorizon {
  key: HorizonKey;
  /** 数えられる事実がある段か。false のとき数値は出さない */
  measured: boolean;
  /** 学習した日数（この期間内） */
  studyDays: number;
  /** やりきった冒険の回数 */
  completedQuests: number;
  /** 合格（7割以上）した挑戦の回数。台帳の実測 */
  passedCount: number;
  /** 解いた問題の延べ数（台帳の試行数） */
  attempts: number;
}

export interface GrowthHorizons {
  today: GrowthHorizon;
  week: GrowthHorizon;
  month: GrowthHorizon;
  halfYear: GrowthHorizon;
  /** 記録に残っている最初の学習日（半年の段の「いつから」） */
  firstStudyDateKey: string | null;
  /** questLog の保持上限に当たっているか（半年の段に断りを出すため） */
  logTruncated: boolean;
}

/** questLog が保持する件数の上限（AdvShell の slice(-60) と揃える） */
export const QUEST_LOG_LIMIT = 60;

const daysBetween = (fromKey: string, toKey: string): number =>
  Math.floor((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);

/** その日付キーが「今日から n 日以内」か（n=0 は今日だけ） */
const withinDays = (dateKey: string, todayKey: string, n: number): boolean => {
  const d = daysBetween(dateKey, todayKey);
  return Number.isFinite(d) && d >= 0 && d <= n;
};

/** 週のはじまり（月曜）からの日数。advWeekly と同じ「月曜はじまり」に揃える */
const daysSinceMonday = (todayKey: string): number => {
  const day = new Date(`${todayKey}T00:00:00Z`).getUTCDay();   // 0=日
  return day === 0 ? 6 : day - 1;
};

const emptyHorizon = (key: HorizonKey): GrowthHorizon => ({
  key, measured: false, studyDays: 0, completedQuests: 0, passedCount: 0, attempts: 0,
});

/**
 * 4段階を組み立てる。
 * @param todayKey 'YYYY-MM-DD'（JSTの今日。呼び出し側の dateKey をそのまま渡す）
 */
export const buildGrowthHorizons = (
  profile: Pick<AdventureV2Profile, 'questLog' | 'mastery'> | null | undefined,
  todayKey: string,
): GrowthHorizons => {
  const questLog = profile?.questLog ?? [];
  const ledger = profile?.mastery ?? {};

  /** 日付キー → その日の実績（冒険の完了・試行数） */
  const attemptsByDay = new Map<string, number>();
  /** 合格（7割以上）した挑戦が起きた日（延べ） */
  const passedDays: string[] = [];
  for (const attempts of Object.values(ledger)) {
    for (const a of attempts ?? []) {
      if (!a?.dateKey) continue;
      attemptsByDay.set(a.dateKey, (attemptsByDay.get(a.dateKey) ?? 0) + 1);
      if (a.scorePct >= MASTERY_RULES.passPct) passedDays.push(a.dateKey);
    }
  }

  const studyDayKeys = new Set<string>([
    ...questLog.map((q) => q.dateKey).filter(Boolean),
    ...attemptsByDay.keys(),
  ]);

  const firstStudyDateKey = [...studyDayKeys].sort()[0] ?? null;
  const weekSpan = daysSinceMonday(todayKey);

  const spanOf = (key: HorizonKey): number => {
    if (key === 'today') return 0;
    if (key === 'week') return weekSpan;
    if (key === 'month') return 29;
    return 179;                                  // 半年（180日）
  };

  const build = (key: HorizonKey): GrowthHorizon => {
    const n = spanOf(key);
    const days = [...studyDayKeys].filter((d) => withinDays(d, todayKey, n));
    const quests = questLog.filter(
      (q) => q.dateKey && withinDays(q.dateKey, todayKey, n) && q.completedSteps > 0,
    );
    let attempts = 0;
    for (const d of days) attempts += attemptsByDay.get(d) ?? 0;
    const passed = passedDays.filter((d) => withinDays(d, todayKey, n)).length;
    return {
      key,
      // 「その期間に学習した日が1日でもある」ときだけ数字を出す。
      // 0日を「0」と出すと、始めたばかりの人に何もしていないと言うことになる
      measured: days.length > 0,
      studyDays: days.length,
      completedQuests: quests.length,
      passedCount: passed,
      attempts,
    };
  };

  return {
    today: studyDayKeys.size > 0 ? build('today') : emptyHorizon('today'),
    week: studyDayKeys.size > 0 ? build('week') : emptyHorizon('week'),
    month: studyDayKeys.size > 0 ? build('month') : emptyHorizon('month'),
    halfYear: studyDayKeys.size > 0 ? build('halfYear') : emptyHorizon('halfYear'),
    firstStudyDateKey,
    logTruncated: questLog.length >= QUEST_LOG_LIMIT,
  };
};

/** 画面に出す見出し（ja/zh）。段の名前は固定＝毎回同じ場所に同じものが出る */
export const HORIZON_LABEL: Record<HorizonKey, { ja: string; zh: string }> = {
  today: { ja: '今日', zh: '今天' },
  week: { ja: '今週', zh: '本周' },
  month: { ja: '30日', zh: '30天' },
  halfYear: { ja: '半年', zh: '半年' },
};
