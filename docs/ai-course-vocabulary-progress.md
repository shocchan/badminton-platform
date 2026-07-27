# 語彙進捗モデル（Phase 2C+ §20-§22）

## 二層モデル（絶対条件: self_knownでもretainedにしない）
- selfAssessment（本人の自己評価）: unseen → seen → learning / self_known / needs_review
- verifiedState（問題・時間経過による検証）: not_tested / guided / independent / retained_candidate
  - deriveMasteryStateを流用し問題履歴のみから導出。別の暦日の再確認自力正解でretained_candidate
  - 本人が「覚えた」にしても誤答の弱点は復習候補に残る（テストで担保）

## UI表示
利用者向けは「覚えた／まだ不安」の2ボタン（§21・派手な演出なし・変更可能）。
読みと意味で状態が違う場合の文言: 「意味は分かっています。読みをもう一度確認しましょう」（mixNote）。

## sessionStorage（試作・§46）
キー `ai_course_vocab_preview_v1`（schemaVersion 1・しくみラボ進捗とは分離・PIIなし）。
entries[itemId] = { selfAssessment, imageViewed, firstSeenAt, lastSeenAt, encounterCount, tests[] }
dailyWords = { dateKey, itemIds }。不正JSON/version不一致は安全破棄。リセットは専用キーのみ。
会話で使えた回数（usedInConversationCount）は会話側との正式連携まで表示しない（架空値禁止・§22）。

## 成長表示（§33）
見たことば／覚えたと思う／問題で確認（independent以上）／定着候補（retained_candidate）の4カウントのみ。
「語彙力N」「N語完全習得」等の断定表現は禁止。

## 将来のDB設計（§47・未適用）
`supabase/migrations_draft/20260727000000_ai_course_vocab_progress_DRAFT.sql` 参照。
教材・画像manifest=TS静的（レビューがgitで完結・デプロイと同期・DBに教材本文を置かない）、
学習者進捗=DB（ai_course_foundation_vocabulary_progress）という分担を採用。
visual asset metadataはDBへ入れない（運用比較の結論: 画像差し替えはgit+deployで原子的に行う方が安全）。

## Phase 2E-1 更新（2026-07-27）

- sessionStorage `ai_course_vocab_preview_v1` を schemaVersion 2 へ（次元別診断）。
  v1からの移行はlegacy保持（confirmed→partially_confirmed・次元をでっち上げない）。
- 教材レビュー専用 `ai_course_vocab_review_preview_v1`（schemaVersion 1）を新設。
  語彙進捗と教材レビューは混ぜない（キー・型・テストで分離）。
- 正式保存（migration適用）時は diagnostics の次元構造をそのままJSONBへ移せる設計。
