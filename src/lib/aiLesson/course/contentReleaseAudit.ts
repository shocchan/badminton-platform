// 教材Release監査の単一集計（Phase 3A §1・手計算禁止）。
//
// 「ファイルを読み込んだ」と「公開教材として利用可能」を区別するため、
// 語彙・文法の完成度を**この1モジュールだけ**から導出する。
// docs/ai-course/content-release-matrix.json はここの出力から生成される
// （Excel部分のみ、実行環境の都合で scripts 側のopenpyxl集計を合成する）。
//
// 公開可能（releasable）の定義はRelease Gate（release-readiness-matrix.md）に従う:
// human_reviewed / approved は人間のみが付与でき、現時点で該当0件＝公開可能0件が正しい。
import { buildVocabularyReviewRecords } from './vocabularyReview';
import { EXAMPLE_FURIGANA } from './vocabFurigana';
import { N2_GRAMMAR_ITEMS } from './n2GrammarData';
import { N2_GRAMMAR_CONTENT } from './n2GrammarContent';
import { buildConnectivityGraph } from './vocabConnectivity';
import { CEO_FIELD_DECISIONS } from './vocabFieldReviewDecisions';
import { decisionQueueSummary, buildDecisionQueue } from './vocabDecisionQueue';

export interface VocabularyReleaseMatrix {
  total: number;
  byReview: { draft: number; human_review_candidate_fields: number; human_reviewed: number; approved: number };
  byRole: { required: number; diagnostic: number; optional: number; enrichment: number };
  sourceVerified: number;        // Excel/教材由来のsourceRefを1つ以上持つ（external_scopeのみは除く）
  sourceExternalOnly: number;    // 標準範囲からの補完のみ（人間確認対象）
  chineseVerified: number;       // zh未確認issueが無い
  exampleVerified: number;       // 例文があり、例文系のP0/P1未解決が無い
  furiganaVerified: number;      // 例文ふりがな登録済み
  imageImported: number;         // 実画像あり（draft）
  imagePlannedOrNone: number;
  conversationConnected: number; // 会話surfaceがconnected
  reviewConnected: number;       // 復習surfaceがconnected
  releasableNow: number;         // approved かつ Gate通過（現時点0が正）
}

export interface GrammarReleaseMatrix {
  total: number;
  contentComplete: number;       // 補完コンテンツ（読み/訳/接続等）が揃った項目
  exampleComplete: number;       // 例文を1つ以上持つ
  chineseComplete: number;       // meaningZhあり（needs_meaningZhが解消）
  diagnosticComplete: number;    // 出題データあり（needs_quiz解消）
  conversationConnected: number; // 会話接続あり（needs_connection解消）
  reviewConnected: number;       // 復習体系への接続（現状:未接続=0が正直な値）
  humanReviewed: number;
  approved: number;
}

export interface ContentReleaseMatrix {
  generatedAt: string;
  vocabulary: VocabularyReleaseMatrix;
  grammar: GrammarReleaseMatrix;
  fieldDecisions: { total: number; humanReviewCandidate: number };
  decisionQueue: { open: number; rootP0: number; rootP1: number };
  usedExcelSheets: string[];     // 既存sourceRefsが参照しているシート
  sourceRefTotal: number;
}

export const buildContentReleaseMatrix = (): ContentReleaseMatrix => {
  const records = buildVocabularyReviewRecords();
  const graph = buildConnectivityGraph();
  const convConnected = new Set(
    graph.words.filter((w) => w.surfaces.conversation.status === 'connected').map((w) => w.itemId));
  const reviewConnected = new Set(
    graph.words.filter((w) => w.surfaces.review.status === 'connected').map((w) => w.itemId));

  const roles = { required: 0, diagnostic: 0, optional: 0, enrichment: 0 };
  let sourceVerified = 0; let sourceExternalOnly = 0; let chineseVerified = 0;
  let exampleVerified = 0; let imageImported = 0;
  const usedSheets = new Set<string>();
  let sourceRefTotal = 0;

  for (const r of records) {
    const role = r.rolesByTrack.life_basic ?? r.rolesByTrack.n3_prep ?? 'optional';
    roles[role as keyof typeof roles] = (roles[role as keyof typeof roles] ?? 0) + 1;
    sourceRefTotal += r.item.sources.length;
    const nonExternal = r.item.sources.filter((s) => s.sourceMatchType !== 'external_scope');
    if (nonExternal.length > 0) sourceVerified += 1; else sourceExternalOnly += 1;
    for (const s of r.item.sources) if (s.sourceSheet) usedSheets.add(s.sourceSheet);
    if (!r.outstandingIssues.includes('zh_unreviewed')) chineseVerified += 1;
    if (r.item.exampleJa && r.item.exampleZh) exampleVerified += 1;
    if (r.imageStatus === 'imported_draft') imageImported += 1;
  }

  const q = buildDecisionQueue();
  const qs = decisionQueueSummary(q);

  const vocabulary: VocabularyReleaseMatrix = {
    total: records.length,
    byReview: {
      draft: records.filter((r) => r.item.review === 'draft').length,
      human_review_candidate_fields: CEO_FIELD_DECISIONS.filter((d) => d.status === 'human_review_candidate').length,
      // item全体の型は source/draft/beta/approved（human_reviewedはfield構造側で管理）
      human_reviewed: 0,
      approved: records.filter((r) => r.item.review === 'approved').length,
    },
    byRole: roles,
    sourceVerified, sourceExternalOnly, chineseVerified, exampleVerified,
    furiganaVerified: Object.keys(EXAMPLE_FURIGANA).length,
    imageImported,
    imagePlannedOrNone: records.length - imageImported,
    conversationConnected: convConnected.size,
    reviewConnected: reviewConnected.size,
    releasableNow: records.filter((r) => r.item.review === 'approved').length,
  };

  const grammar: GrammarReleaseMatrix = {
    total: N2_GRAMMAR_ITEMS.length,
    contentComplete: Object.keys(N2_GRAMMAR_CONTENT).length,
    exampleComplete: N2_GRAMMAR_ITEMS.filter((g) => g.examples.length > 0 && g.examples[0]).length,
    chineseComplete: N2_GRAMMAR_ITEMS.filter((g) => !g.reviewFlags.includes('needs_meaningZh')).length,
    diagnosticComplete: N2_GRAMMAR_ITEMS.filter((g) => !g.reviewFlags.includes('needs_quiz')).length,
    conversationConnected: N2_GRAMMAR_ITEMS.filter((g) => !g.reviewFlags.includes('needs_connection')).length,
    reviewConnected: 0,   // 文法は翌日/3日後/7日後の復習体系へ未接続（正直な0）
    humanReviewed: 0,     // 人間レビューは未実施（reviewStatus:'reviewed'は原本転記確認のみ）
    approved: 0,
  };

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    vocabulary, grammar,
    fieldDecisions: {
      total: CEO_FIELD_DECISIONS.length,
      humanReviewCandidate: CEO_FIELD_DECISIONS.filter((d) => d.status === 'human_review_candidate').length,
    },
    decisionQueue: { open: q.length, rootP0: qs.rootP0Count, rootP1: qs.rootP1Count },
    usedExcelSheets: [...usedSheets].sort(),
    sourceRefTotal,
  };
};
