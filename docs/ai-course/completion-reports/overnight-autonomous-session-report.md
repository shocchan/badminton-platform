# 夜間自律セッション報告（overnight-20260727-c）

## 1. セッション情報

| 項目 | 値 |
|---|---|
| session ID | overnight-20260727-c |
| 開始 | 2026-07-27 22:52 JST（Fable 5 → Opus 5 へ切替直後） |
| 停止 | 2026-07-28 01:00 JST |
| 実作業 | 約2時間 |
| **停止理由** | **BLOCKED_BROWSER**（次Phase 2E-1.13の中核であるE2E完走が、ブラウザ自動操作の反復タイムアウトで実行不能と判断） |
| ループ | 3 / 5（#1→2E-1.11、#2→2E-1.12、#3→2E-1.13設計を受領・未実行） |

## 2. 実行したPhase

| Phase | 内容 | コミット |
|---|---|---|
| **2E-1.10** | Release Readiness Learner Journey & Learning Loop Closure（CEO直接依頼） | 051220d・15b3196・a8386a6・980c044・02914e5・a11cc63・3aae037 |
| **2E-1.11** | First-Run Guided Journey & Learner Recovery UX（ChatGPT設計） | e955c5c・c09e5da・4390121・bb6a9c0 |
| **2E-1.12** | Guided Journey Continuity & Safe Local State Isolation（ChatGPT設計） | 67209b2・e8b2bfe・07eb1a9・123b6de |

## 3. 完成した学習者向け改善

1. **間隔反復**（誤答→翌日／補助あり→3日後／自力正解→7日後／別日2回目→定着候補）
   同日の再正解で段階を進めない・「覚えた」で予定は消えない・「まだ不安」で優先度が上がる
2. **今日の復習**（ことば図鑑の第一表示・件数と所要時間・内訳は折りたたみ・0件なら非表示）
3. **ホーム第一CTAの最優先を期限復習へ**（理由と件数を明示・第一CTAは一つのまま）
4. **学習完了画面**（今日できたこと／次の復習「行く」は明日もう一度確認します／明日n語）
5. **role→推薦の実接続**（11段階の決定的優先順位＋説明可能な理由）
6. **会話コア11語**の診断・練習接続（診断partial 11→0・練習12→13語）
7. **初回4ステップJourney**（目的→短い確認→最初の練習→今日のまとめ・進捗n/4・aria-current）
8. **Recovery UX**（問題読込失敗／問題不足／保存データ破損／保存失敗）＋Error Boundary（再試行上限2回）
9. **Journey往復契約**（診断完了→Step3・練習完了→Step4の自動復帰・実結果をStep4へ）

## 4. 復習・推薦・会話接続（接続監査の変化）

| surface | 変更前 | 変更後 |
|---|---|---|
| 語彙画面 | connected 140 | connected 140 |
| 診断 | connected 129 / **partial 11** | **connected 140 / partial 0** |
| 復習 | **partial 140** | **connected 140** |
| 会話 | connected 12 | connected 13（残127はgeneric＝一般導線のみ） |

接続品質を4段階へ（verified 320・contextual 113・generic 127・none 0）。

## 5. モバイル・Premium UX

- iframe実測で **320／375／390／430／768／desktop** すべて横overflow 0・第一CTA高48px・44px未満のタップ領域0
- 完了画面・Journey・Recoveryはすべて第一CTA一つ＋補助最大2つ
- 内部state名（day1・retained_preview・masteryState・roleDriven等）を学習者画面に出さないことをテストで担保

## 6. 教材・画像

**教材変更なし**（meaningZh・exJa/exZh・cognate・role確定値・human_reviewed・approvedすべて不変）。
画像変更なし（残8枚は次Phase以降）。

## 7. テスト・品質

| 指標 | 値 |
|---|---|
| セッション開始時テスト数 | 612 |
| 終了時テスト数 | **688** |
| セッション増加 | **+76** |
| Phase別増加 | 2E-1.10 +32／2E-1.11 +25／2E-1.12 +19 |
| 新規テストファイル | 7 |
| tsc | 0エラー |
| lint | 45E/6W=51（ベースライン一致・途中で検出した増分はすべて解消） |
| build | 成功 |
| main bundle | 590.30KB（**増加0**） |
| staging | console error 0・4xx 0・画像404 0 |

## 8. 実ブラウザ確認（到達範囲）

✅ 今日の復習カード→問題→完了画面→次回予定（Journey B相当）
✅ 初回Journey Step1→2→リロード再開→Step3→練習画面
✅ **診断完了→Step3自動復帰**（契約completed・checkedCount 28）
⚠️ **練習完了→Step4自動復帰は未確認**（ブラウザ自動操作が反復タイムアウト。ユニットテストでは担保）
⚠️ 実機スマートフォンのタッチ・ソフトキーボードは未確認（CEO確認事項）

## 9. 解消したリスク

- **R9（検証操作で学習進捗を消した事故）を構造的に再発不能化**:
  storage key登録簿9キー＋Journey用3キーのみのallowlist＋allowlist外は削除拒否＋
  storage.clear/prefix/正規表現削除を使わない＋検証用sandbox namespace。回帰テスト5件
- 復習の間隔反復未実装（2E-1.9で発見した最大の構造的欠陥）を解消
- 会話コア11語が診断に一度も出ない問題を解消

## 10. 残リスク・人間判断待ち

| 項目 | 状態 |
|---|---|
| root P0 = 1（fi-namae例文） | **CEO判断待ち** |
| root P1 = 13（cognate不一致11語ほか） | **CEO判断待ち** |
| admin_overrides の RLS問題 | **正式公開ブロッカー** |
| 語彙進捗・復習スケジュールの正式DB保存 | **正式公開ブロッカー**（現在はsessionStorageのpreviewのみ） |
| 教材の human_reviewed / approved 確定 | CEO判断 |
| 実機スマートフォン確認・contrast自動計測 | CEO確認 / 次Phase |
| 会話 generic 127語のcontextual化 | 次Phase候補 |

## 11. READY_FOR_PREPRODUCTION か

**まだ到達していない。** 理由:
1. root P0=1・root P1=13 がCEO判断待ち
2. 練習完了→Step4のE2E実証が未完了
3. 正式DB保存とadmin_overridesのRLSが未解決

## 12. CEOが確認する画面

staging: https://staging.badminton-platform.pages.dev

1. ことば図鑑トップ → 「今日の復習」（期限がある日）／初回案内（履歴がない場合）
2. `?app=1&vocab=1&vview=firstrun` → 初回4ステップJourney
3. `?app=1&vocab=1&vview=decisions` → 判断キュー91件（P0=fi-namae先頭）
4. `?app=1&vocab=1&vview=connectivity` → 学習接続監査

## 13. 次に必要な判断

1. fi-namae の例文（root P0）を採用するか
2. cognate不一致13件（root P1）の判定
3. 正式DB保存とadmin_overrides RLSの着手時期（どちらもSTOP_FOR_HUMAN扱い）

## 14. 再開地点

- 次Phase: **2E-1.13 First-Run Journey E2E Closure & Learner Interaction Hardening**
  （依頼文: `docs/ai-course/autonomous-loop/prompts/2e1-13-prompt.md`・ChatGPT decision=CONTINUE）
- 最優先: **練習完了→Step4自動復帰の実証**と、その前提となる**timeout根本原因の調査**
- 監督チャット: 「AI日本語学習監督」（https://chatgpt.com/c/6a66f2a3-4984-83e8-b900-d413bf2dcf17）
- 最新コミット: 123b6de ／ テスト688 ／ git clean ／ branch feature/ai-course-learning-polish
