// 正式DB保存の設計（CEO指示 2026-07-28・草案・未接続）。
// ⚠️ このモジュールはまだどこからもimportしない。migration適用のCEO承認後に配線する。
// テーブル定義: supabase/migrations_draft/20260728000000_ai_course_vocab_persistence_DRAFT.sql
// 方針: docs/ai-course/decision-packets/formal-vocabulary-persistence-implementation-packet.md

import type { SelfAssessment } from '../vocabProgress';
import type { ReviewStage, ReviewResult, ReviewSource } from '../vocabSpacedReview';

/** ai_course_vocab_item_progress の1行（テーブルと1:1） */
export interface VocabItemProgressRow {
  learnerId: string;
  itemId: string;
  /** senseが無い語は '-'（PKにnullを置かないための番兵値） */
  senseKey: string;
  selfAssessment: SelfAssessment;
  /** 6次元固定の小さなオブジェクト（reading/meaning/form/connection/usage/collocation） */
  dimensionStates: Record<string, string>;
  reviewStage: ReviewStage | 'none';
  lastResult: ReviewResult | null;
  lastAttemptAt: string | null;          // timestamptz(UTC)
  /** 期限のローカル日付キー（LearningClockが唯一の決定者・サーバーで変換しない） */
  nextReviewOn: string | null;           // YYYY-MM-DD
  consecutiveIndependent: number;
  source: ReviewSource | 'journey';
  contentVersion: string;
  /** 楽観ロック。更新時は読み取り時の値を添え、0行更新なら再読込して再適用 */
  rowVersion: number;
}

/** ai_course_vocab_pack_progress の1行 */
export interface VocabPackProgressRow {
  learnerId: string;
  packId: string;
  selectedGoal: 'daily_conversation' | 'life_in_japan' | 'jlpt_n3' | 'work' | null;
  status: 'not_started' | 'in_progress' | 'completed';
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  rowVersion: number;
}

/** ai_course_vocab_diagnostic_attempts の1行 */
export interface VocabDiagnosticAttemptRow {
  /** クライアント生成UUID。再送・再読込では同じIDをupsertする（冪等キー） */
  attemptId: string;
  learnerId: string;
  packId: string;
  questionSetVersion: string;
  /** 出題のitemIdと次元の並びのみ（教材本文は含めない） */
  questionRefs: { itemId: string; dimension: string }[];
  state: 'in_progress' | 'completed' | 'abandoned';
  answeredCount: number;
  startedAt: string;
  completedAt: string | null;
  rowVersion: number;
}

/** 保存先の共通interface（local実装とSupabase実装を同じ形で差し替える） */
export interface VocabPersistenceGateway {
  upsertItemProgress(row: VocabItemProgressRow): Promise<{ ok: boolean; conflict?: boolean }>;
  upsertPackProgress(row: VocabPackProgressRow): Promise<{ ok: boolean; conflict?: boolean }>;
  upsertDiagnosticAttempt(row: VocabDiagnosticAttemptRow): Promise<{ ok: boolean; conflict?: boolean }>;
  /** 期限の来た語（nextReviewOn <= 学習上の今日）。並びはクライアントで決定的に整列する */
  listDueItems(learnerId: string, todayKey: string): Promise<VocabItemProgressRow[]>;
  loadAll(learnerId: string): Promise<{
    items: VocabItemProgressRow[];
    packs: VocabPackProgressRow[];
  }>;
}

export type GatewayMode = 'local' | 'supabase';

/**
 * 切り替え設計:
 *   - 'local': 現行の sessionStorage repository を Gateway interface で包む（既定・現行動作）
 *   - 'supabase': migration適用のCEO承認後に実装する（このファイルでは未実装のまま）
 * 学習体験はDB接続に依存させない。書き込みは常にlocalへ先に行い、オンライン時にoutboxで同期する。
 */
export const GATEWAY_DESIGN_NOTE =
  'supabase実装は migration 適用承認後。それまで本モジュールはどこからもimportしない。';
