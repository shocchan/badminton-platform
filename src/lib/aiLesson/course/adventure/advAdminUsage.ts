// 管理者向け: 学習者ごとの利用状況（冒険モードV2）を settings から集計する純関数。
// CEO要望（2026-08-15）:「どれくらいログインして、各々どれくらい利用したか見たい」
//
// 鉄則（原則13）: 実記録から数えられるものだけを出す。推定値は出さない。
// 学習日の定義: questLog または mastery attempt が記録された日（別々の日付キーの和集合）。
import type { LearnerSettings } from '../types';
import { readAdvProfile } from './advProfile';

export interface AdvLearnerUsage {
  /** V2オンボーディング完了済みか（ルートがあるか） */
  onboarded: boolean;
  /** 学習した日数（累計・直近7日・直近30日） */
  totalStudyDays: number;
  studyDays7: number;
  studyDays30: number;
  /** 最後に学習した日（YYYY-MM-DD）。まだなら null */
  lastStudyDateKey: string | null;
  /** やりきった冒険（全step完了のクエスト）数 */
  completedQuests: number;
  /** バトル試行の総数（mastery台帳のattempt数） */
  battleAttempts: number;
  /** ミニ模試の完了回数 */
  mockCount: number;
  /** 相棒・目標（一覧の文脈用） */
  targetJlpt: string | null;
  goalType: string | null;
}

const dayKeyOf = (iso: string): string => iso.slice(0, 10);

export const advLearnerUsageOf = (
  settings: LearnerSettings | null | undefined, nowISO: string,
): AdvLearnerUsage => {
  const prof = readAdvProfile(settings);
  if (!prof) {
    return {
      onboarded: false, totalStudyDays: 0, studyDays7: 0, studyDays30: 0,
      lastStudyDateKey: null, completedQuests: 0, battleAttempts: 0, mockCount: 0,
      targetJlpt: null, goalType: null,
    };
  }
  const days = new Set<string>();
  for (const q of prof.questLog) days.add(q.dateKey);
  let battleAttempts = 0;
  for (const attempts of Object.values(prof.mastery)) {
    for (const a of attempts ?? []) {
      battleAttempts += 1;
      days.add(a.dateKey);
    }
  }
  const now = Date.parse(dayKeyOf(nowISO));
  const withinDays = (k: string, n: number): boolean => {
    const d = Date.parse(k);
    return Number.isFinite(d) && now - d < n * 24 * 60 * 60 * 1000;
  };
  const sorted = [...days].sort();
  return {
    onboarded: prof.route !== null,
    totalStudyDays: days.size,
    studyDays7: sorted.filter((k) => withinDays(k, 7)).length,
    studyDays30: sorted.filter((k) => withinDays(k, 30)).length,
    lastStudyDateKey: sorted[sorted.length - 1] ?? null,
    completedQuests: prof.questLog.filter((q) => q.totalSteps > 0 && q.completedSteps >= q.totalSteps).length,
    battleAttempts,
    mockCount: prof.mockLog.length,
    targetJlpt: prof.targetJlpt,
    goalType: prof.goalType,
  };
};
