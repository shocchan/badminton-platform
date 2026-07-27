// ChatGPT独立レビュー結果（Phase 2E-1.5 §5-§6・収集スクリプトが更新する生成データ・全draft）。
// このファイルはレビュー画面のlazy chunk専用（mainバンドルへ入れない・§29）。
// ChatGPTの「問題なし」も人間承認ではない（§2）。
import type { ExternalVocabularyReview } from './vocabDualReview';

/** 収集済みバッチ（1-7）。未収集の語はキー無し=claude_reviewedのみ扱い */
export const CHATGPT_REVIEWS: Record<string, ExternalVocabularyReview> = {};

/** 高確信一致の自動修正を反映済みのitemId（auto-fix-log.jsonと同期・§8） */
export const AUTO_FIXED_ITEM_IDS: string[] = [];
