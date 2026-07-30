// 同義判断待ちpre-draft（Phase 3P-5後 Priority 3）→ 2026-07-30 CEO裁定により全件処理済み。
// - 統合2件（n2g-024→023・n2g-104→102）: n2GrammarAliases.ts が正準記録（進捗引き継ぎ付き）。
// - 独立維持5件（007/018/064/099/162）: 各UnitチャンクへN2GrammarDraftとして昇格済み。
// 元の予稿全文はgit履歴（〜commit 5502781）に保存されている。
import type { N2GrammarDraft } from './n2GrammarDrafts';

export interface N2GrammarPredraft extends N2GrammarDraft {
  mergeDecision: unknown;
}

/** CEO裁定反映済みのため空。恒等式は canonical 178 ＋ alias 2 ＝ 原本180（n2GrammarAliases.ts） */
export const N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE: N2GrammarPredraft[] = [];
