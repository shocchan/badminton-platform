# 例文の構造化ふりがな（Phase 2E-1 §11-§13）

作成: 2026-07-27。実装: `vocabFurigana.ts`（データ）／`RubyText.tsx`（表示）。全draft。

## 1. データ構造

`EXAMPLE_FURIGANA: Record<itemId, FuriganaTextSegment[]>`。
segment = `{ text, reading?, level?('hard'), isTarget? }`。

**絶対条件（すべてテストで強制）**:
- `segments.map(s => s.text).join('') === item.exampleJa`（完全再構成・文字抜け/重複なし）
- 漢字を含むセグメントは必ず reading を持つ
- 対象語セグメント（isTarget）が存在し、見出し語の先頭部分と一致する
- HTML文字列挿入なし（React ruby/rt のみ）。読みを alt / aria へ漏らさない

現在: **140/140語・667セグメント**（`furiganaCoverage()` で算出）。

## 2. 推測しすぎない方針（§12）

- 読みは教材Item・確定した一般語のみ。不確実な読みを含む例文は登録せず、
  `furiganaForItem() === null` → 例文はplain text＋見出し語のみruby（RubyWord）へフォールバック。
- 誤ったふりがなを表示するより、表示しない方を優先する。
- 形態素解析ライブラリは追加しない（依存増・誤読リスク）。segmentsは教材データとして人間レビュー対象。
- reviewStatus: 全件draft（`VocabularyReviewRecord.furiganaStatus`）。

## 3. 表示ルール（§13）

`resolveFuriganaMode(setting, ctx)` → `'all' | 'hard' | 'none'`:

| 設定 | 挙動 |
|---|---|
| always | 読みのある全セグメントを表示 |
| first_time | 初回表示（encounterCount≦1）・弱点語は全表示、それ以外は難読（level:'hard'）のみ |
| hard_only | 難読のみ。弱点語（まだ不安・直近誤答・false friend）は全表示 |
| off | 非表示。ただし詳細画面の「読みを表示」ボタンで確認可能（アクセシビリティ・完全遮断しない） |

- 設定変更は sessionStorage 経由で即時反映（リロード不要）。locale切替でも失われない
  （設定はURLでなくRepositoryに保持・URLは画面位置のみ）。
- 読み問題では `hideTargetReading` で対象語のrubyを隠し、回答後に表示する。

## 4. 難読（level:'hard'）の目安

現在目標より上の語・特殊読み・視認性の低い複合語（例: 機会・体重・先月・引っ越し・転職・
上達・希望・上司・面接・感謝・接客・散歩・現在・合格・発音・子育て・手続き・印鑑・運動・敬語・遅刻）。
分類自体もdraftで、教材レビュー画面の確認対象。
