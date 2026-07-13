import type { Tournament } from '../types';

export const isDoublesEvent = (t: Tournament) => t.event_type?.includes('ダブルス') ?? false;

// ダブルスの entry_fee はペア（2名）単位で登録されている。表示は1人あたりに換算する
export const feePerPerson = (t: Tournament) =>
  isDoublesEvent(t) ? Math.round(t.entry_fee / 2) : t.entry_fee;

// カード・詳細ページ用の表示文字列（ダブルスは「/人」を付ける）
export const feeDisplay = (t: Tournament, lang: 'ja' | 'zh' = 'ja') => {
  const per = feePerPerson(t).toLocaleString();
  if (!isDoublesEvent(t)) return `¥${per}`;
  return lang === 'zh' ? `¥${per}/人` : `¥${per} /人`;
};

// シャトル持参不要なのは超初級ダブルスのみ（FAQ・キャンセルポリシーと同じルール）
export const isShuttleFree = (t: Tournament) =>
  t.level === '超初級' && isDoublesEvent(t);
