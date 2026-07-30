// N2文法のCEO統合判断（2026-07-30決定）の正準記録。
//
// 原本 n2GrammarData.ts の180項目のうち、同義判断待ちだった7件をCEOが裁定:
// - 統合2件: n2g-024「〜かと思えば」→ n2g-023「〜かと思うと」（exact_synonym）
//            n2g-104「〜なくはない」→ n2g-102「〜ないでもない」（exact_synonym）
//   統合元の内容は統合先の similarPatterns / contrast へ吸収済み。
// - 独立維持5件: n2g-007・n2g-018・n2g-064・n2g-099・n2g-162 → 本編draftへ昇格。
//
// 新しい恒等式: canonical draft 178 ＋ 統合alias 2 ＝ 原本180（過不足なし）。
// 統合前IDで保存された学習進捗は canonicalN2GrammarId / n2AliasSourcesOf 経由で引き継ぐ
// （remote migrationは行わない。読み取り時のローカル正規化のみ）。
export const N2_GRAMMAR_ALIASES: Record<string, string> = {
  'n2g-024': 'n2g-023',
  'n2g-104': 'n2g-102',
};

/** 統合前ID→canonical ID（未統合IDはそのまま） */
export const canonicalN2GrammarId = (grammarId: string): string =>
  N2_GRAMMAR_ALIASES[grammarId] ?? grammarId;

/** canonical IDに統合された旧IDの一覧（進捗の読み取り引き継ぎ用） */
export const n2AliasSourcesOf = (canonicalId: string): string[] =>
  Object.entries(N2_GRAMMAR_ALIASES).filter(([, to]) => to === canonicalId).map(([from]) => from);
