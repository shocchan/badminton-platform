# 本番リリース実行用プロンプト（CEO入力の記入後に、このまま貼る）

```
AI日本語コース — August Pilot 本番リリース実行

CEO入力は docs/ai-course/production/final-release-input.md に記入済みです。
その内容を正準として、本番公開まで実行してください。

repo: /Users/shocchan/badminton-platform
branch: feature/ai-course-learning-polish
RC tag: ai-course-content-rc2（code 57a8804）

手順は docs/ai-course/production/pilot-release-execution.md に全6フェーズがあります。
そのとおりに進めてください。

【最重要の前提】
final-release-input.md の「E. 本番リリース承認」に
APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE
が完全一致で書かれている場合のみ、main統合と本番デプロイを実行してください。
無い場合は Phase 2 までで止め、何が足りないかを報告してください。

【Phase 1: 入力の取り込み】
- final-release-input.md の A（法務14項目）を
  src/lib/aiLesson/course/legal/legalFacts.ts へ記入する
  ※ CEOが書いた値だけを入れる。書かれていない事実を推測で補わないこと
- B（実機 D01〜D34）・C（教材 C01〜C11）・D（環境 E01〜E20）の結果を
  docs/ai-course/production/human-gate-evidence.md へ日付つきで記録する
- FAIL があれば P0/P1 は先に修正する

【Phase 2: Preflight】
npm run validate:ai-course-legal     → PASS（LEGAL_PUBLISH: true）
npm run validate:ai-course-env       → P0 FAIL 0
npx vitest run                       → 全PASS
npm run build                        → PASS
npx eslint src/components/ai-course src/pages/ai-lesson src/lib/aiLesson → 0E/0W
node scripts/ai-course/audit-release-inventory.mjs
staging deploy → 法務16URLがpreview無しで表示されること・同意チェックが出ることを実画面で確認

ここまでで問題があれば、本番へ進まず報告してください。

【Phase 3〜4: main統合と本番デプロイ】
承認文字列がある場合のみ。手順書どおり --no-ff merge → push → 本番deploy。
conflict が出たら自動解決せず停止して報告。
deploy 前に直前の deployment ID を必ず控える（rollback先）。

【Phase 5: post-deploy smoke】
kawabado.com で20項目。特に法務16URLと同意チェック、
法務ページから noindex が外れていること（学習アプリ本体は noindex のままが正しい）。

【Phase 6: 問題があれば rollback】
引き金は手順書の一覧。DB変更を含まないのでコードを戻すだけで復旧する。

【実行しないこと】
- 学習者への招待送信（別フェーズ）
- learner個別データの作成・変更
- Stripe本番課金の開始
- 教材の human_reviewed / approved への一括昇格
- RC2 tag の強制更新

【完了後】
- 新しい production deploy ID を記録
- release manifest と current-state を実測値で更新
- 完了報告に、実施したsmokeの結果とrollback可否を明記
```
