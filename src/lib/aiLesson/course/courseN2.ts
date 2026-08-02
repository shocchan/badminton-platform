// N2総合能力マップ＆既存60ミッションのN2カバレッジ分類（Phase N2-A）。
// 方針: 既存の会話コア（N4→N3中心）を土台に、N2力を「理解→聞く→使う→読解→試験→会話」の
// 循環で伸ばす。ここでは "分析（分類）" のみを持ち、N2文法・問題などの教材本文は持たない
// （捏造しない・人間レビュー前提。教材はPhase N2-B以降で固定教材として追加）。

import { COURSE_MISSIONS } from './courseMissionIndex.generated';
import { atLeast } from './courseEngine';
import type { ItemProgress } from './types';

/** N2能力の6軸（試験＝知識/読解/聴解、実用＝会話使用/語彙運用/復習定着） */
export type N2Axis = 'vocab' | 'grammar' | 'reading' | 'listening' | 'conversation' | 'review';
export const N2_AXES: N2Axis[] = ['vocab', 'grammar', 'reading', 'listening', 'conversation', 'review'];

/**
 * 既存ミッションのN2関連度（人間レビュー可能な固定分類）。
 * - 'daily'    : N4〜N5相当の会話基礎（土台。N2そのものではない）
 * - 'n3'       : N3相当（N2への足場）
 * - 'n2bridge' : N3〜N2境界（N2文法へ橋渡し）
 * ※ 現行60ミッションに「純粋なN2文法」は含まれない（下の分類が根拠）。
 */
export type N2Level = 'daily' | 'n3' | 'n2bridge';

/** ミッションid → N2関連度（会話コアの実際の目標表現を精査した分類・要人間レビュー） */
export const MISSION_N2_LEVEL: Record<string, N2Level> = {
  // Week1 自己紹介（N5〜N4）
  w01m1: 'daily', w01m2: 'daily', w01m3: 'daily', w01m4: 'daily', w01m5: 'daily',
  // Week2 過去の経験（N4）
  w02m1: 'daily', w02m2: 'daily', w02m3: 'daily', w02m4: 'n3', w02m5: 'daily',
  // Week3 変化（N4〜N3）
  w03m1: 'n3', w03m2: 'n3', w03m3: 'daily', w03m4: 'n3', w03m5: 'daily',
  // Week4 習慣（N4〜N3）
  w04m1: 'n3', w04m2: 'n3', w04m3: 'daily', w04m4: 'daily', w04m5: 'daily',
  // Week5 許可・依頼（N4〜N3敬語）
  w05m1: 'daily', w05m2: 'daily', w05m3: 'n3', w05m4: 'daily', w05m5: 'daily',
  // Week6 困りごと（N4）
  w06m1: 'daily', w06m2: 'daily', w06m3: 'daily', w06m4: 'daily', w06m5: 'daily',
  // Week7 意見・理由（N5〜N4）
  w07m1: 'daily', w07m2: 'daily', w07m3: 'daily', w07m4: 'daily', w07m5: 'daily',
  // Week8 比較（N4〜N3、一部N2橋渡し）
  w08m1: 'daily', w08m2: 'n3', w08m3: 'n2bridge', w08m4: 'n3', w08m5: 'daily',
  // Week9 推測（N4〜N3）
  w09m1: 'daily', w09m2: 'n3', w09m3: 'n3', w09m4: 'n3', w09m5: 'daily',
  // Week10 仕事・実用（N3〜N2橋渡し敬語）
  w10m1: 'n2bridge', w10m2: 'daily', w10m3: 'n2bridge', w10m4: 'daily', w10m5: 'daily',
  // Week11 バドミントン交流（N4〜N5）
  w11m1: 'daily', w11m2: 'daily', w11m3: 'daily', w11m4: 'daily', w11m5: 'daily',
  // Week12 総合会話（N4〜N3総合）
  w12m1: 'daily', w12m2: 'daily', w12m3: 'daily', w12m4: 'daily', w12m5: 'daily',
};

export const missionN2Level = (missionId: string): N2Level => MISSION_N2_LEVEL[missionId] ?? 'daily';

export interface N2CoverageSummary {
  total: number;
  daily: number;
  n3: number;
  n2bridge: number;
  /** 純粋なN2文法を扱うミッション数（現行は0） */
  pureN2Grammar: number;
}

/** 既存60ミッションのN2カバレッジ集計（監査の根拠） */
export const n2CoverageSummary = (): N2CoverageSummary => {
  const levels = COURSE_MISSIONS.map((m) => missionN2Level(m.id));
  return {
    total: levels.length,
    daily: levels.filter((l) => l === 'daily').length,
    n3: levels.filter((l) => l === 'n3').length,
    n2bridge: levels.filter((l) => l === 'n2bridge').length,
    pureN2Grammar: 0,
  };
};

/**
 * N2能力マップ（成長画面の補助）。
 * 現行データから "正直に" 出せるのは会話軸と復習軸の一部だけ。
 * 文法/語彙/読解/聴解は専用トラック（Phase N2-B以降）が無いため "準備中" とする。
 * 合格率・合格可能性は一切算出しない。
 */
export interface N2AxisState {
  axis: N2Axis;
  /** データがあり表示できるか。無ければ "準備中" 扱い */
  ready: boolean;
  /** 表示できる場合の到達数（例: 会話で使えた表現数） */
  value?: number;
  /** 分母（対象数） */
  total?: number;
}

export const buildN2Map = (progresses: ItemProgress[]): N2AxisState[] => {
  const learnedIds = new Set(progresses.filter((p) => atLeast(p.masteryState, 'used_independently')).map((p) => p.itemId));
  const reviewedIds = new Set(progresses.filter((p) => atLeast(p.masteryState, 'reviewed_day1')).map((p) => p.itemId));
  // 会話で自力使用できた「N3以上（=N2への足場）」の表現数
  const bridgeIds = COURSE_MISSIONS.filter((m) => missionN2Level(m.id) !== 'daily').map((m) => m.id);
  const conversationValue = bridgeIds.filter((id) => learnedIds.has(id)).length;
  const reviewValue = bridgeIds.filter((id) => reviewedIds.has(id)).length;
  return N2_AXES.map((axis) => {
    if (axis === 'conversation') return { axis, ready: true, value: conversationValue, total: bridgeIds.length };
    if (axis === 'review') return { axis, ready: true, value: reviewValue, total: bridgeIds.length };
    // 文法/語彙/読解/聴解の専用トラックは未実装 → 準備中（架空の達成は出さない）
    return { axis, ready: false };
  });
};
