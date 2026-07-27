# Phase履歴（自律ループ用サマリー）

| Phase | 目的 | 主な実装 | コミット | テスト | 未完成 | 次Phase |
|---|---|---|---|---|---|---|
| 2E-1 | 教材品質レビュー基盤・例文ふりがな・診断深化・Premium UX | レビュー画面・ふりがなruby140語・診断次元化・ホームHero | 9de5923/2d43c02/1dd7073 | 575 | 画像残・第二校正 | 2E-1.5 |
| 2E-1.5 | 教材第二校正・実機UX監査・Premium最終調整 | ChatGPT独立監査140語・自動修正60件・draft分類90語・レビュー永続化v2・比較UI・N3診断16問・モバイルナビ案A・画像4枚 | ace72b5/3e56a50/08121a8 | 577 | 画像8枚・モバイル目視・人間判断待ち | 2E-1.6 |
| 2E-1.6 | 自律改善ループ基盤 | autonomous-loop docs一式・分析テンプレート・prompt validator・報告生成スクリプト・state管理 | 9b9f4a7 | 577 | — | 自律ループ1回目（ChatGPT分析） |
| 2E-1.7 | Human Decision Console & Proposal Triage（ChatGPT設計・CONTINUE） | 判断キュー91件/72語の導出・判断ドラフトストアv3・Decision Console UI（vview=decisions） | 028854e ほか | 589 | モバイル目視・詳細画面への逆リンク | ループ#2分析で決定 |
| 2E-1.8 | Decision Integrity & Review Readiness（ChatGPT設計・CONTINUE） | 完全性監査218→91＋恒等式テスト・provenance/独立継承priority・stale/orphaned検出・Console⇔語彙詳細双方向リンク・iframe実ブラウザ5幅検証 | c7bd23c/ac0326f | 604 | 詳細セクションanchor・contrast計測 | ループ#4分析で決定 |
| 2E-1.9 | Learning Connectivity Audit & Lab Inspector（ChatGPT設計・CONTINUE） | 接続グラフ140語×4surface=560edge・診断カバレッジ監査・Connectivity Inspector（vview=connectivity）・詳細anchor | 26f59df/aa9795c | 612 | contrast計測・connectivityセクションanchor | ループ#6分析で決定（構造的発見4点を報告） |
| 2E-1.10 | Release Readiness Learner Journey & Learning Loop Closure（CEO直接依頼） | 間隔反復(day1/3/7)・LearningClock・role推薦接続11段階・会話コア11語の診断/練習接続・今日の復習/完了画面/次回予定・リリース分類とP0継承分離・接続品質4段階 | 051220d/15b3196/a8386a6/980c044/02914e5/（ホームCTA・docs） | 644 | 初回Journey専用フロー・会話generic127・contrast計測 | ループ#1のChatGPT分析へ |
| 2E-1.11 | First-Run Guided Journey & Learner Recovery UX（ChatGPT設計・CONTINUE） | 初回判定6状態の決定的導出・4ステップJourney(vview=firstrun)・中断再開・Recovery UI 4種・Error Boundary(再試行上限)・内部用語の非表示 | (firstRunJourney/FirstRunJourney/LearnerRecovery) | 669 | Journeyへの復帰導線・実機スマホ・contrast計測 | ループ#2分析で決定 |
| 2E-1.12 | Guided Journey Continuity & Safe Local State Isolation（ChatGPT設計・CONTINUE） | storage登録簿9キー＋allowlist reset＋sandbox（R9再発防止）・Journey Task Contract（3点一致でのみ完了）・診断/練習からの自動復帰・Step4実結果・実機で往復不具合を検出し修正 | (courseStorageRegistry/journeyTaskContract/FirstRunJourney/VocabularyHub) | 688 | 練習→Step4のstaging実機・sandbox導線・browser back実機 | ループ#3分析で決定 |
