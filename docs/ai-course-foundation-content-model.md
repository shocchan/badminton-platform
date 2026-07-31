# しくみラボ データモデル（Phase 1設計・migration未実施）
## エンティティ（§11準拠）
- **FoundationItem**: id(uuid・Excel行に非依存)/itemType(word|phrase|pattern)/lemma/displayForm/readingKana/readingRomaji/partOfSpeech[]/levelTags[]/canDoIds[]/situationTags[]/functionTags[]/priorityTier(coreA|coreB|goal|jlpt|extended)/priorityReasons[]/sourceIds[]/senseIds[]/ruleIds[]/usagePatternIds[]/reviewStatus
- **FoundationSource**: id/sourceKind(official_framework|official_course|jlpt_official|teacher_workbook|reviewed_textbook_scope|learner_need|coach_observation)/sourceTitle/sourceSheet/sourceRow/sourceLabel/sourceConfidence/frequencyEvidence(none|teacher|corpus)/teacherPriority/importedAt
- **FoundationSense**: id/itemId/meaningZh/meaningJa/register(casual|polite|written|business)/usageNote/exampleIds — 多義語=複数sense（例:「高い」高度/価格、「でも」接続/助詞的）
- **FoundationRule**: id/category(conjugation|particle|plainForm|connection|order)/explanation(ja/zh)/prerequisites[]/exceptions[]/applicableItemIds[]/reviewStatus
- **FoundationQuestion**: id/targetIds[]/dimension(reading|meaning|form|connection|particle|usage)/type(choice|input|order|fix)/prompt/acceptedAnswers[]/explanation/errorTags[]/difficulty/reviewStatus
- **学習状態（per learner）**: itemId×dimension → state(new|learning|review_due|stable)＋履歴。**会話masteryStateとは別テーブル・XP不変**
## 承認フロー
source→normalized→aligned(Can-do紐づけ)→draft→**human review**→beta→approved／rejected。**Excel自動変換のままbeta/approved化は禁止**（テストで強制予定）。未レビューは学習開始不可。
## 重複処理
自動統合=表記+読み+品詞+意味の完全一致のみ。表記同一で意味/品詞違い→sense/item分離候補として**人間レビューキュー**へ。統合後もsourceIds全保持。
## DB設計案（Phase 2で承認後にmigration）
新テーブル4+進捗1（foundation_items/sources/senses+rules/questions/learner_foundation_progress）。RLS: 教材=authenticated SELECT(approved/betaのみ)・書込service role／進捗=本人のみRW。**既存テーブル・XP・復習間隔・会話進捗に変更なし**。MVP代替案（テーブル承認前）: 教材はTS静的データ(60ミッション方式)＋進捗はlearner.settings jsonb —— 6〜8単元規模なら十分、正式版でテーブル移行。
