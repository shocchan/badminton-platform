// 24学習週マッピング（§24W）。DB制約(current_week 1..12)と60ミッション本文は不変のまま、
// 表示層で 6章×4週=24学習週 を実現する決定的マッピング。
// 内部1週(5ミッション) = 表示2週 [2ミッション+3ミッション] ／ 内部2週 = 1章(10ミッション)。
// アクセス層: starter_12w(3か月・Week1〜12=内部1〜6週) / full_24w(6か月・全週)。
// 正: admin_overrides.accessTier（管理者設定）→ settings.accessTier → 既定 full_24w（既存受講生を誤ロックしない）。

import type { Learner, Mission } from './types';

export type AccessTier = 'starter_12w' | 'full_24w' | 'graduated' | 'advanced';

export const TOTAL_DISPLAY_WEEKS = 24;
export const STARTER_MAX_DISPLAY_WEEK = 12;   // = 内部6週 = 第3章まで
const STARTER_MAX_INTERNAL_WEEK = 6;

/** 6章（各章=内部2週=表示4週=10ミッション）。タイトルはi18n側（chapters）に対応 */
export const CHAPTER_COUNT = 6;
export const chapterOfInternalWeek = (w: number): number => Math.min(Math.max(Math.ceil(w / 2), 1), CHAPTER_COUNT);
export const internalWeeksOfChapter = (c: number): [number, number] => [c * 2 - 1, c * 2];
export const displayWeeksOfChapter = (c: number): [number, number] => [c * 4 - 3, c * 4];

/** ミッション→表示週（週2/3/2/3配分: 各内部週の m1-m2=前半週, m3-m5=後半週） */
export const displayWeekOfMission = (m: Pick<Mission, 'week' | 'order'>): number =>
  (m.week - 1) * 2 + (m.order <= 2 ? 1 : 2);

/** 内部週＋その週の完了数→現在の表示週（0〜1完了=前半週・2以上=後半週） */
export const currentDisplayWeek = (internalWeek: number, doneInWeek: number): number =>
  Math.min((internalWeek - 1) * 2 + (doneInWeek >= 2 ? 2 : 1), TOTAL_DISPLAY_WEEKS);

/** アクセス層の解決（admin_overrides優先・不正値/未設定はfull_24w=安全側） */
const VALID: AccessTier[] = ['starter_12w', 'full_24w', 'graduated', 'advanced'];
export const accessTierOf = (learner: Pick<Learner, 'settings' | 'adminOverrides'>): AccessTier => {
  const fromAdmin = (learner.adminOverrides as { accessTier?: string } | undefined)?.accessTier;
  const fromSettings = (learner.settings as { accessTier?: string }).accessTier;
  const v = (fromAdmin ?? fromSettings) as AccessTier | undefined;
  return v && VALID.includes(v) ? v : 'full_24w';
};

/** 鍵判定: starterは内部7週以降（=表示Week13以降・第4章〜）を利用不可 */
export const isInternalWeekLocked = (tier: AccessTier, internalWeek: number): boolean =>
  tier === 'starter_12w' && internalWeek > STARTER_MAX_INTERNAL_WEEK;
export const isMissionLockedByTier = (tier: AccessTier, m: Pick<Mission, 'week'>): boolean =>
  isInternalWeekLocked(tier, m.week);
