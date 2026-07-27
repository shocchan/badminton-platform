// 二重AIレビュー（Phase 2E-1.5 §2-§7）。
// Claude（作成者側の系統的監査）とChatGPT（独立監査）を突き合わせ、
// 一致/不一致と人間レビュー優先度（P0-P3）を導出する。
// どちらのAIが「問題なし」でも human_reviewed / approved にはならない（§2）。
// データはレビュー画面のlazy chunkからのみ読み込む（mainへ入れない・§29）。
import { buildVocabularyReviewRecords } from './vocabularyReview';
import { CHATGPT_REVIEWS } from './vocabChatgptReview';

export type ReviewFieldStatus = 'ok' | 'minor_issue' | 'major_issue' | 'uncertain';
export type ReviewSeverity = 'none' | 'low' | 'medium' | 'high';
export type ReviewConfidence = 'high' | 'medium' | 'low';
export type AiReviewState = 'claude_reviewed' | 'chatgpt_reviewed' | 'ai_consensus' | 'ai_disagreement' | 'human_review_required';
export type HumanReviewPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface ExternalVocabularyReview {
  itemId: string;
  japaneseStatus: ReviewFieldStatus;
  chineseStatus: ReviewFieldStatus;
  furiganaStatus: ReviewFieldStatus;
  cognateStatus: ReviewFieldStatus;
  curriculumStatus: ReviewFieldStatus;
  severity: ReviewSeverity;
  confidence: ReviewConfidence;
  issueTypes: string[];
  suggestedMeaningZh?: string | null;
  suggestedLearningFocusZh?: string | null;
  suggestedExampleJa?: string | null;
  suggestedExampleZh?: string | null;
  suggestedCognate?: string | null;
  rationaleJa: string;
  requiresHumanReview: boolean;
}

const FIELDS = ['japaneseStatus', 'chineseStatus', 'furiganaStatus', 'cognateStatus', 'curriculumStatus'] as const;
type FieldKey = typeof FIELDS[number];

/**
 * Claude側の明示フラグ（独立パスで気づいた点のみ・残りはデフォルト導出）。
 * デフォルト: 各status=ok。ただしcognate=unreviewedの語は cognateStatus='uncertain'（断定しない）。
 */
const CLAUDE_OVERRIDES: Record<string, Partial<ExternalVocabularyReview>> = {
  'fi-namae': { japaneseStatus: 'minor_issue', issueTypes: ['example_ja'], rationaleJa: '「名前は王です。」はやや不自然（「私の名前は〜」「名字は王です」の方が自然）' },
  'fi-basu': { japaneseStatus: 'minor_issue', issueTypes: ['reading'], rationaleJa: 'カタカナ語の読み表記が「ばす」（ひらがな）になっている（表記方針の確認）' },
  'fi-taihen': { cognateStatus: 'uncertain', rationaleJa: 'taihen-serious Senseのfocus文言が未レビュー' },
  'fi-tsugou': { cognateStatus: 'uncertain', rationaleJa: 'tsugou-arrangement Senseが未レビュー' },
};

export const claudeReviewOf = (itemId: string, cognateUnreviewed: boolean): ExternalVocabularyReview => {
  const base: ExternalVocabularyReview = {
    itemId,
    japaneseStatus: 'ok', chineseStatus: 'ok', furiganaStatus: 'ok',
    cognateStatus: cognateUnreviewed ? 'uncertain' : 'ok',
    curriculumStatus: 'ok',
    severity: 'none', confidence: 'high', issueTypes: [],
    rationaleJa: cognateUnreviewed ? 'cognate分類が未実施（分類の断定を保留）' : '系統的監査で問題を検出せず',
    requiresHumanReview: cognateUnreviewed,
  };
  const ov = CLAUDE_OVERRIDES[itemId];
  if (!ov) return base;
  const merged = { ...base, ...ov, issueTypes: [...base.issueTypes, ...(ov.issueTypes ?? [])] };
  merged.severity = 'low';
  return merged;
};

export interface VocabularyReviewComparison {
  itemId: string;
  claude: ExternalVocabularyReview;
  chatgpt: ExternalVocabularyReview | null;   // 未取得バッチはnull
  agreementFields: FieldKey[];
  disagreementFields: FieldKey[];
  aiReviewState: AiReviewState;
  consensusSeverity: ReviewSeverity;
  autoFixEligible: boolean;
  humanReviewPriority: HumanReviewPriority;
}

const worse = (a: ReviewSeverity, b: ReviewSeverity): ReviewSeverity => {
  const order: ReviewSeverity[] = ['none', 'low', 'medium', 'high'];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
};

const bad = (s: ReviewFieldStatus) => s === 'major_issue' || s === 'uncertain';

/** 優先度導出（§7）: P0=読み/日本語の明確な誤り、P1=中国語/Sense/false friend/例文の重大誤解、P2=role/レベル/ふりがな粒度、P3=軽微 */
const priorityOf = (c: Omit<VocabularyReviewComparison, 'humanReviewPriority'>): HumanReviewPriority => {
  const g = c.chatgpt;
  const majors = (r: ExternalVocabularyReview | null, f: FieldKey) => r?.[f] === 'major_issue';
  if (majors(g, 'japaneseStatus') || majors(g, 'furiganaStatus') || majors(c.claude, 'japaneseStatus') || majors(c.claude, 'furiganaStatus')) return 'P0';
  if (majors(g, 'chineseStatus') || majors(c.claude, 'chineseStatus') || (c.disagreementFields.includes('cognateStatus') && c.consensusSeverity !== 'none')) return 'P1';
  if (c.aiReviewState === 'ai_disagreement' || c.disagreementFields.length > 0) return 'P2';
  if (c.claude.cognateStatus === 'uncertain' || (g?.cognateStatus === 'uncertain')) return 'P2';
  if (c.consensusSeverity === 'low') return 'P3';
  return 'P3';
};

/** 全140語の比較（レビュー画面用・単一導出関数） */
export const buildReviewComparisons = (): VocabularyReviewComparison[] => {
  const records = buildVocabularyReviewRecords();
  return records.map((rec) => {
    const claude = claudeReviewOf(rec.itemId, rec.cognateDefault === 'unreviewed');
    const chatgpt = CHATGPT_REVIEWS[rec.itemId] ?? null;
    const agreementFields: FieldKey[] = [];
    const disagreementFields: FieldKey[] = [];
    if (chatgpt) {
      for (const f of FIELDS) {
        // ok同士 or 双方問題あり=一致。片方ok・片方問題あり=不一致
        const a = claude[f] === 'ok';
        const b = chatgpt[f] === 'ok';
        if (a === b) agreementFields.push(f); else disagreementFields.push(f);
      }
    }
    const consensusSeverity = worse(claude.severity, chatgpt?.severity ?? 'none');
    const anyBad = FIELDS.some((f) => bad(claude[f]) || (chatgpt ? bad(chatgpt[f]) : false));
    const aiReviewState: AiReviewState = !chatgpt
      ? 'claude_reviewed'
      : anyBad || claude.requiresHumanReview || chatgpt.requiresHumanReview
        ? 'human_review_required'
        : disagreementFields.length > 0 ? 'ai_disagreement' : 'ai_consensus';
    // 自動修正可能: 双方high confidenceで一致した軽微修正のみ（§8）。レベル/roleの確定は含めない
    const autoFixEligible = !!chatgpt && aiReviewState !== 'human_review_required'
      && chatgpt.confidence === 'high' && claude.confidence === 'high'
      && consensusSeverity !== 'high'
      && (chatgpt.suggestedMeaningZh != null || chatgpt.suggestedExampleZh != null || chatgpt.suggestedLearningFocusZh != null);
    const partial = { itemId: rec.itemId, claude, chatgpt, agreementFields, disagreementFields, aiReviewState, consensusSeverity, autoFixEligible };
    return { ...partial, humanReviewPriority: priorityOf(partial) };
  });
};

export interface DualReviewSummary {
  total: number;
  chatgptReviewed: number;
  consensus: number;
  disagreement: number;
  humanRequired: number;
  byPriority: Record<HumanReviewPriority, number>;
}
export const dualReviewSummary = (): DualReviewSummary => {
  const cs = buildReviewComparisons();
  const byPriority: Record<HumanReviewPriority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const c of cs) byPriority[c.humanReviewPriority] += 1;
  return {
    total: cs.length,
    chatgptReviewed: cs.filter((c) => !!c.chatgpt).length,
    consensus: cs.filter((c) => c.aiReviewState === 'ai_consensus').length,
    disagreement: cs.filter((c) => c.aiReviewState === 'ai_disagreement').length,
    humanRequired: cs.filter((c) => c.aiReviewState === 'human_review_required').length,
    byPriority,
  };
};
