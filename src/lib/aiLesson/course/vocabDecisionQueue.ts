// Human Decision Queue（Phase 2E-1.7 目的A・レビュー画面lazy chunk専用）。
// 人間判断待ちを「判断事項単位」で決定的に導出する（語単位で潰さない・§2）。
// ここで作るのは表示用の派生データのみ。教材本体への書き込み・自動確定は一切しない。
import { buildVocabularyReviewRecords } from './vocabularyReview';
import { CHATGPT_REVIEWS } from './vocabChatgptReview';
import { buildReviewComparisons } from './vocabDualReview';
import type { HumanReviewPriority } from './vocabDualReview';

export type DecisionType = 'example' | 'cognate' | 'meaning_zh' | 'role' | 'sense';

export interface HumanDecisionItem {
  decisionId: string;               // `${itemId}:${decisionType}`（決定的・重複なし）
  itemId: string;
  wordJa: string;
  decisionType: DecisionType;
  priority: HumanReviewPriority;
  /** 現在の教材値（人が読める短い表現） */
  currentValueJa: string;
  /** 提案値（採用は人間のみ。AI多数決で確定しない） */
  proposedValueJa: string;
  proposalSource: 'claude' | 'chatgpt' | 'both';
  reasonJa: string;
  impactAreas: string[];            // 例: ['ことば図鑑', '診断', '出題頻度']
}

/**
 * 判断キューの決定的導出（教材データ＋二重AIレビューの現在値から毎回導出。
 * 判断ドラフトの保存はvocabDecisionStore側・このファイルは読み取りのみ）。
 */
export const buildDecisionQueue = (): HumanDecisionItem[] => {
  const records = buildVocabularyReviewRecords();
  const prioById = new Map(buildReviewComparisons().map((c) => [c.itemId, c.humanReviewPriority]));
  const out: HumanDecisionItem[] = [];
  for (const rec of records) {
    const g = CHATGPT_REVIEWS[rec.itemId];
    const prio = prioById.get(rec.itemId) ?? 'P3';
    const word = rec.item.displayForm;
    // ① 例文の提案が未採用（fi-namae等・P0はここに乗る）
    if (g?.suggestedExampleJa && g.suggestedExampleJa !== rec.item.exampleJa) {
      out.push({
        decisionId: `${rec.itemId}:example`, itemId: rec.itemId, wordJa: word, decisionType: 'example',
        priority: prio,
        currentValueJa: `${rec.item.exampleJa}／${rec.item.exampleZh}`,
        proposedValueJa: `${g.suggestedExampleJa}／${g.suggestedExampleZh ?? '(中国語提案なし)'}`,
        proposalSource: 'chatgpt', reasonJa: g.rationaleJa,
        impactAreas: ['ことば図鑑', '例文ふりがな', '出題'],
      });
    }
    // ② cognate分類のAI不一致（提案が現分類と異なり、未採用のまま）
    if (g?.suggestedCognate && g.suggestedCognate !== rec.cognateDefault) {
      out.push({
        decisionId: `${rec.itemId}:cognate`, itemId: rec.itemId, wordJa: word, decisionType: 'cognate',
        priority: prio,
        currentValueJa: rec.cognateDefault,
        proposedValueJa: g.suggestedCognate,
        proposalSource: 'chatgpt', reasonJa: g.rationaleJa,
        impactAreas: ['同源語バッジ', 'false friend注意', '診断の優先次元'],
      });
    }
    // ③ meaningZhの提案が未採用
    if (g?.suggestedMeaningZh && g.suggestedMeaningZh !== rec.item.meaningZh) {
      out.push({
        decisionId: `${rec.itemId}:meaning_zh`, itemId: rec.itemId, wordJa: word, decisionType: 'meaning_zh',
        priority: prio,
        currentValueJa: rec.item.meaningZh,
        proposedValueJa: g.suggestedMeaningZh,
        proposalSource: 'chatgpt', reasonJa: g.rationaleJa,
        impactAreas: ['ことば図鑑の訳語', '意味問題の正答'],
      });
    }
    // ④ role提案（基礎会話トラック optional→diagnostic。roleは変更しない・表示のみ）
    if (g?.issueTypes.includes('role_mismatch')) {
      const current = rec.rolesByTrack.conversation ?? 'optional';
      if (current === 'optional') {
        out.push({
          decisionId: `${rec.itemId}:role`, itemId: rec.itemId, wordJa: word, decisionType: 'role',
          priority: prio,
          currentValueJa: `conversation: ${current}`,
          proposedValueJa: 'conversation: diagnostic',
          proposalSource: 'chatgpt', reasonJa: '基礎語のため任意ではなく短い確認（diagnostic）で通過させる提案',
          impactAreas: ['出題頻度', '診断対象', '学習体験'],
        });
      }
    }
    // ⑤ Sense未レビュー（fi-taihen/fi-tsugou等・Claude側uncertain）
    if (rec.cognateSenseOverrides.some((o) => o.reviewStatus === 'unreviewed')) {
      out.push({
        decisionId: `${rec.itemId}:sense`, itemId: rec.itemId, wordJa: word, decisionType: 'sense',
        priority: prio,
        currentValueJa: rec.cognateSenseOverrides.map((o) => `${o.senseId}:${o.reviewStatus}`).join('・'),
        proposedValueJa: '未レビューSenseの focus 文言と分類を人間が確認',
        proposalSource: 'claude', reasonJa: 'Sense別cognate上書きに unreviewed が残っている',
        impactAreas: ['多義語の注意表示'],
      });
    }
  }
  // 決定的順序: P0→P1→P2→P3、同一priorityはitemId昇順、同一語はdecisionType順
  const pOrder: Record<HumanReviewPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const tOrder: Record<DecisionType, number> = { example: 0, cognate: 1, meaning_zh: 2, sense: 3, role: 4 };
  return out.sort((a, b) =>
    pOrder[a.priority] - pOrder[b.priority] || a.itemId.localeCompare(b.itemId) || tOrder[a.decisionType] - tOrder[b.decisionType]);
};

export interface DecisionQueueSummary {
  itemCount: number;                 // 判断事項数
  wordCount: number;                 // 対象語数（判断事項数と分けて表示・§7）
  byType: Record<DecisionType, number>;
  byPriority: Record<HumanReviewPriority, number>;
}

export const decisionQueueSummary = (queue = buildDecisionQueue()): DecisionQueueSummary => {
  const byType: Record<DecisionType, number> = { example: 0, cognate: 0, meaning_zh: 0, role: 0, sense: 0 };
  const byPriority: Record<HumanReviewPriority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const words = new Set<string>();
  for (const d of queue) { byType[d.decisionType] += 1; byPriority[d.priority] += 1; words.add(d.itemId); }
  return { itemCount: queue.length, wordCount: words.size, byType, byPriority };
};
