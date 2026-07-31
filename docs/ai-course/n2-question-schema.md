# N2 Question Item スキーマ設計（Phase 3A §6-§8・実装は3C）

作成: 2026-07-28 ／ 状態: 設計のみ（コード未実装・runtime変更なし）

## 設計原則

1. **問題画像をそのまま最終UIにしない。** 標準は構造化テキスト＋タップ可能な選択肢ボタン
2. OCR/AI抽出結果を**自動的に正解データとして採用しない**（§12の二重確認が必須）
3. 正解をalt/aria/DOM hidden textへ漏らさない
4. rightsStatusが公開可（original/licensed/official_permission_confirmed/public_domain）
   以外のQuestionはexport対象に**構造的に**含めない

## N2QuestionItem

```ts
interface N2QuestionItem {
  questionId: string;            // sourceId + 内容hash由来（行順・ページ順に依存しない）
  sourceId: string;              // N2QuestionSource参照（必須）
  formatEra: 'legacy_pre_2010' | 'current_2010_plus' | 'original_current_style';
  level: 'N2';
  section: 'vocabulary' | 'grammar' | 'reading' | 'listening';
  questionType: string;          // 実際のN2形式監査後に確定（公式名の断定は公式資料を根拠にする）
  promptBlocks: ContentBlock[];  // 問題文（text | image | furigana）
  passageBlocks: ContentBlock[]; // 読解本文等（不要なら空）
  choices: { choiceId: string; blocks: ContentBlock[] }[];
  correctChoiceId: string;       // §12の二重確認を通過するまで answerReviewStatus≠verified
  explanationJa: string;
  explanationZh: string;         // 段階表示（先に正解を漏らさない・§13）
  wrongChoiceExplanations: Record<string, string>;   // choiceId → なぜ違うか
  vocabularyLinks: { itemId: string; senseId?: string; dimension: string }[];
  grammarLinks: { grammarItemId: string; usageId?: string }[];
  skillDimensions: string[];     // reading_skill / inference / listening_key_point 等
  difficultyEstimate: number | null;   // 妥当性検証前はnull（推測で埋めない）
  timeEstimateSeconds: number | null;
  imageAssets: { assetId: string; alt: string; altReviewStatus: 'draft' | 'human_reviewed' }[];
  audioAssets: { assetId: string; transcriptStatus: string }[];
  extractionConfidence: 'high' | 'medium' | 'low';   // lowは公開不可
  answerConfidence: 'source_matched' | 'human_verified' | 'unverified';
  contentReviewStatus: 'draft' | 'human_review_candidate' | 'human_reviewed' | 'approved' | 'blocked';
  answerReviewStatus: 'unverified' | 'source_matched' | 'ai_reviewed' | 'human_verified';
  rightsStatus: RightsStatus;    // copyright-and-rights-gate.md 参照
  sourceRefs: { page?: number; region?: string; rawTextHash: string; extractedAt: string }[];
  originality?: {                // 独自問題のみ（§11）
    sourceSimilarityRisk: 'low' | 'medium' | 'high';
    phraseOverlapRisk: 'low' | 'medium' | 'high';
    structureSimilarityRisk: 'low' | 'medium' | 'high';
    originalityReviewStatus: 'pending' | 'passed' | 'rejected';
  };
  contentVersion: string;
}
```

## 正解の二重確認（§12・公開の最低条件）

extractor answer / source answer / Claude review / ChatGPT review / human answer review を分離して記録。
公開条件は「source answerと一致」または「独自問題で人間が正解確認」。**AI間一致だけでは不可。**
誤答選択肢が複数正解にならないことも確認対象。

## UI要件（§8・実装は3D）

- 問題番号・セクション・問題文・選択肢・回答確定・次へ・後で確認・残り問題数
- 選択しただけで確定しない（確定前は変更可）— 既存Journeyと同じ原則
- 確定後: 正誤→日本語解説→中国語ポイント（短く）→展開で他選択肢・関連教材
- キーボード: Arrow/Tab/Enter/Space ／ モバイル: 44px・sticky CTA・safe area・200% zoom
- 画像が必要な場合も選択肢は画像外のボタン。回答位置を画像座標に依存させない

## 取り込みPipeline（§9・実装は3C/3D）

source登録 → rights preflight → file hash → page分割 → region抽出 → text/choice候補 →
answer候補 → image crop → schema validation → duplicate detection → human review queue →
answer verification → 中文解説 → Item/Grammar link → approved candidate → runtime export。
自動抽出は原文・抽出文・差分・confidenceを人間が比較できる形で提示。低confidenceは公開不可。

## 既存教材との接続（§14・実装は3E）

誤答→ vocabularyLinks/grammarLinksを通じて既存のneeds_review・翌日/3日後/7日後Repositoryへ。
**N2問題だけの別復習体系は作らない。**
