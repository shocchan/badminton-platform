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

CEOの回答は一括トークンで届きます。次のとおり解釈してください。

1. 法務（legalFacts.ts へ記入）
   - `LEGAL_RECOMMENDATIONS_APPROVED` があれば、
     L02〜L08・L10・L11・L13 の10件を final-release-input.md
     「一括承認できる10件（実際に入る値）」の表の値どおりに入れる
   - L01・L09・L12・L14 は **CEOが書いた値だけ** を入れる。
     書かれていなければ入れず、不足として報告して停止する（推測で補わない）
   - 個別に「L05 = …」等の上書きがあれば、そちらを優先する

2. 実機
   - `DEVICE_ALL_PASS` → D01〜D34 を CEO確認済みPASS として
     human-gate-evidence.md の取り込み欄へ一括記録
     （evidence source / recordedAt / HEAD / CEO confirmation を必ず埋める）
   - `DEVICE_FAIL：D番号 …` → その番号のみFAILとして記録し、P0/P1なら先に修正

3. 教材
   - `CONTENT_REVIEW_PASS` → Pilot公開範囲のevidenceとして記録（P0 0 / P1 0）
   - **human_reviewed / approved への一括昇格はしない**
   - `CONTENT_REVIEW_FAIL：対象ID …` → 該当だけ修正

4. 環境
   - `ENV_ALL_VERIFIED` → **無条件PASSにしない**。
     自動検証できる E03/E04/E05/E12/E16/E17 は `npm run validate:ai-course-env` の
     実結果を使い、人間しか確認できない E01/E02/E06/E08/E19/E20 等だけを
     CEO evidence として `VERIFIED_PRESENT` で記録する
   - `ENV_FAIL：E番号 …` → 該当を解消するまで本番へ進まない

【重要】`npm run validate:ai-course-legal` は**通常モードでPASS**すること。
`--simulate-filled` のPASSは自己診断でしかなく、Legal Complete の根拠にしない。

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
