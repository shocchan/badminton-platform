// Grammar Human Review Packet生成（§15）。実行: ./node_modules/.bin/vite-node scripts/ai-course/generate-grammar-review-packet.ts
// 人間が文法教材を確認しやすいよう、項目ごとに8分割のsection＋出典＋riskを1 packetへ整形する。
// 出力は docs/ai-course/reviews/。human_reviewed／approved の状態は一切変更しない（表示用データのみ）。
import { writeFileSync } from 'node:fs';
import { N2_GRAMMAR_DRAFTS } from '../../src/lib/aiLesson/course/n2GrammarDrafts';
import { N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE } from '../../src/lib/aiLesson/course/n2GrammarPredraftsAwaitingMerge';
import { N3_N2_OVERLAP_USAGES } from '../../src/lib/aiLesson/course/n3n2OverlapUsages';
import { N3_GRAMMAR_DRAFTS } from '../../src/lib/aiLesson/course/n3GrammarDrafts';

const overlapById = new Map(N3_N2_OVERLAP_USAGES.map(o => [o.n2ItemId, o]));

const sectionsOf = (d: (typeof N2_GRAMMAR_DRAFTS)[number]) => ({
  s1_pattern_meaning: { pattern: d.pattern, reading: d.reading, meaningJa: d.meaningJa },
  s2_chinese_explanation: { explanationZh: d.explanationZh, usageScene: d.usageScene, nuance: d.nuance },
  s3_formation: { formation: d.formation, register: d.register },
  s4_examples: { examplesJa: d.examplesJa, examplesZh: d.examplesZh, furigana: d.furigana,
    sourceExample: d.sourceExample.text, runtimeExampleOrigin: d.runtimeExampleOrigin },
  s5_common_mistakes: { commonMistakesZh: d.commonMistakesZh, learnerFocus: d.learnerFocus },
  s6_questions_answers: { recognition: d.recognition, production: d.production },
  s7_practice: d.practice,
  s8_relation_overlap: { similarPatterns: d.similarPatterns, contrast: d.contrast,
    n3Overlap: overlapById.get(d.grammarId) ?? null },
});

const risksOf = (d: (typeof N2_GRAMMAR_DRAFTS)[number]): string[] => {
  const r: string[] = [];
  if (d.runtimeExampleOrigin === 'source_confirmed' && d.examplesJa[0] !== d.sourceExample.text)
    r.push('runtime_normalized_from_source'); // 原本を教育用に正規化（例: ら抜き→ら入り）
  if (d.runtimeExampleOrigin === 'original_authored') r.push('runtime_examples_original_authored');
  const ov = overlapById.get(d.grammarId);
  if (ov) r.push(ov.relationCandidate === 'same_item_extended_usage' ? 'n3_overlap_extended_usage' : 'n3_overlap_same_usage');
  if (d.zhSourceRowId) r.push('zh_from_n3_sheet');
  return r;
};

const packet = {
  generatedAt: new Date().toISOString(),
  note: '表示用packet。approve/revise/holdは将来のレビューconsoleの操作候補であり、本packetは状態を変更しない',
  identity: { completeDraft: N2_GRAMMAR_DRAFTS.length, awaitingMerge: N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE.length,
    total: N2_GRAMMAR_DRAFTS.length + N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE.length },
  n2: N2_GRAMMAR_DRAFTS.map(d => ({
    grammarId: d.grammarId, unit: d.unit, status: d.reviewStatus,
    humanReviewed: d.humanReviewed, approved: d.approved,
    sections: sectionsOf(d), risks: risksOf(d),
    reviewActions: ['approve', 'revise', 'hold'],
  })),
  n2AwaitingMerge: N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE.map(p => ({
    grammarId: p.grammarId, unit: p.unit, status: p.reviewStatus,
    mergeDecision: p.mergeDecision, sections: sectionsOf(p), risks: ['awaiting_merge_decision'],
    reviewActions: ['merge', 'keep_separate', 'hold'],
  })),
  n3: N3_GRAMMAR_DRAFTS.map(d => ({
    grammarId: d.grammarId, status: d.reviewStatus, summary: { pattern: d.pattern },
  })),
};

const out = 'docs/ai-course/reviews/grammar-review-packet.json';
writeFileSync(out, JSON.stringify(packet, null, 1) + '\n');

const riskCounts: Record<string, number> = {};
for (const item of packet.n2) for (const r of item.risks) riskCounts[r] = (riskCounts[r] ?? 0) + 1;
const md = `# Grammar Human Review Packet（生成: ${packet.generatedAt}）

- 対象: N2 completeDraft ${packet.identity.completeDraft}件 + 同義判断待ち ${packet.identity.awaitingMerge}件 = ${packet.identity.total}件（+ N3 ${packet.n3.length}件の索引）
- 8分割section: ①pattern/meaning ②中文説明 ③formation ④examples（原本併記） ⑤誤用注意 ⑥問題/正解 ⑦practice ⑧関連/overlap
- risk内訳: ${Object.entries(riskCounts).map(([k, v]) => `${k}=${v}`).join('・') || 'なし'}
- 本packetは表示用。human_reviewed/approvedの変更は人間のみ（自動昇格なし）
- データ: [grammar-review-packet.json](grammar-review-packet.json)
`;
writeFileSync('docs/ai-course/reviews/grammar-review-packet.md', md);
console.log('packet written:', packet.identity, 'risks:', riskCounts);
