// 学習日付の単一情報源（Phase 2E-1.10 §5）。
// 日付境界の判定はここだけで行う（各所で new Date() を直接呼ばない）。
// 利用者のローカル日付を使う（UTCで日付をずらさない）。テストでは固定時刻を注入する。

export interface LearningClock {
  now(): Date;
  /** ローカル日付キー 'YYYY-MM-DD'（タイムゾーン変換をしない＝同日判定がずれない） */
  localDateKey(d?: Date): string;
  /** 日付キーにn日足したキー（月跨ぎ・年跨ぎ・DSTでもローカル日付として正しい） */
  addDays(dateKey: string, days: number): string;
  /** a が b より前の日付か（同日はfalse） */
  isBefore(dateKeyA: string, dateKeyB: string): boolean;
  /** 2つの日付キーの差（日数・a - b） */
  diffDays(dateKeyA: string, dateKeyB: string): number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 実時刻のClock。fixedNowを渡すとテスト用の固定Clockになる */
export const createLearningClock = (fixedNow?: Date | string): LearningClock => {
  const now = () => (fixedNow ? new Date(fixedNow) : new Date());
  const localDateKey = (d: Date = now()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);   // ローカル正午でなく0時。日付演算のみに使う
  };
  return {
    now,
    localDateKey,
    addDays: (dateKey, days) => {
      const d = parse(dateKey);
      d.setDate(d.getDate() + days);   // ローカル日付での加算（DSTでも日付は正しく進む）
      return localDateKey(d);
    },
    isBefore: (a, b) => a < b,          // 'YYYY-MM-DD' は辞書順=日付順
    diffDays: (a, b) => Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000),
  };
};

/** アプリ既定のClock（実時刻）。テストからは createLearningClock(fixed) を渡す */
export const defaultLearningClock = createLearningClock();
