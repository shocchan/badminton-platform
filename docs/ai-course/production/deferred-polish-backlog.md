# Deferred Polish Backlog（P2／P3・FOREST FIRST）

全体実装を止めないために後回しにした改善点。P0/P1は含めない（P0/P1は即修正）。

## P2（品質改善・機能は成立している）

| # | 領域 | 内容 |
|---|---|---|
| P2-1 | 語彙イラスト | approved 0のため、learnerには全語が中立図形（共通Visual kit）表示。draft画像115件の承認・品質改善はVisual Backlog |
| P2-2 | しくみラボ進捗 | foundationProgressはsessionStorage（同一タブのreloadは保持・タブを閉じると消える）。localStorage化はhardeningで検討 |
| P2-3 | Home施設カード | 施設が6枚になったためlg 3列に変更。地図上の施設配置（F3のWorld Map統合）で再設計余地 |
| P2-4 | ~~N2旧content overlay~~ | ✅ 確認済み（2026-07-29）: `imilarGrammarIds` typoは現存しない（全10箇所が正しい `similarGrammarIds`）。過去に修正済みか誤記録 |

| P2-5 | 世界の命名 | 会話Journeyの地名（はじまりの村/思い出の道…週ベース）とWorld Atlasのエリア名が別系統。「この先の道」は会話Journey名のまま。統一はCEOの名称承認後 |
| P2-6 | ~~N2旧UI~~ | ✅ H4で解消（2026-07-29）: 未参照のCourseN2Grammar/N2GrammarLazyを削除（辞書キーは現行Quest UIと共用のため残置） |
| P2-7 | 会話中の世界文脈 | 会話画面（Voice/Text）内へのエリア・人物表示は未実装（エンジン非変更方針のため）。旅立ちカード＋レポートで前後は接続済み |
| P2-8 | ~~Chapter1進捗の記録カード反映~~ | ✅ H4で解消（2026-07-29）: AdventureRecordCardに「第1章クエスト x/5」タイルを追加。※storage keyの旧名（rpgLabSandbox）は実体がlearner本番進行と共用のため、改名はDB同期（H2）のkey整理と同時に行う |
| P2-9 | N2確認問題の誤答後UX | 誤答時に正解がハイライトされた後「もう一度えらぶ」で正解を選び直せる（学習フィードバックとしては許容・出題順の工夫は後日） |
| P2-10 | ~~IslandsMapの縦伸び~~ | ✅ H4で解消（2026-07-29）: maxHeight 72vhを追加（主人公はSVG内描画のためズレなし） |
| P2-11 | ~~quickreview空状態のCTA~~ | ✅ H4で解消（2026-07-29）: 空状態に理由ヒント＋「ことば図鑑トップへ」「AI会話で話す」を追加。staging実画面確認済み |
| P2-12 | ~~庭園→N3復習のdeep-link~~ | ✅ H4で解消（2026-07-29）: `n3FirstReviewAreaId`で復習語のあるエリアへ着地（無ければ現在地へフォールバック）。staging実画面確認済み |
| P2-13 | N2結果の会話導線 | 「会話の広場で使ってみる」が学んだ文型ではなく今日のテーマの音声レッスンを起動する（文型を使う会話にするにはRealtime prompt変更が必要＝ガードレール領域のため保留） |
| P2-14 | レポートの定着判定の甘さ | 音声レッスンで雑音転写しかない場合でも「自分の力で使えました」表示になり得る（実発話ベース原則はテキストでは機能。音声の転写品質依存） |
| P2-15 | ~~AIコース内404の戻り先~~ | ✅ H4で解消（2026-07-29）: /:lang/ai-course/*の不明URLをコース入口へ絶対パスでリダイレクト（空スプラットは入口描画＝自己ループ防止） |

## P3（文言・装飾）

| # | 領域 | 内容 |
|---|---|---|
| P3-1 | Loading演出 | 各stepのLoadingは汎用文言。世界観に合わせた演出は後日（ソラノ塔のみ「塔の書物を開いています…」） |
| P3-2 | N2単元名 | ソラノ塔の単元は「第N単元」のみでテーマ名がない。文型群の命名は教材確認と同時に |
| P3-3 | n2grammar戻り先 | ロードマップから開いた場合も戻り先はHome（以前はroadmap）。導線として破綻はない |

## question-quality-backlog

問題品質のP2は `question-quality-backlog.json` へ（§11）。今回のFOREST FIRSTでは
新規のP1問題（答え漏洩・複数正解・正解なし）は機械検査で0件（n2QuestData.test 180件全数）。

## 2026-07-30 Final Preflight分類（AI単独A/remote承認後B/CEO入力C/法務D/実機E/Production承認F/後日G）

- **A（AI単独で今回完了可能）: 0件**（QP-3ガイド作成・migration正式化・旧パス参照更新まで消化済み）
- B: post-apply検証実行・entitlement切替配線・sync有効化（APPLY_SHARED_SUPABASE_MIGRATIONS後）
- C: P2-5（会話Journey週名の扱い）・legal質問10件・価格/返金/保存期間
- D: 利用規約/プライバシー/特商法の専門家レビュー（legal-draft-packet-20260730.md）
- E: P2-1画像承認・実機チェック（physical-device-check-packet-20260730.md）
- F: production deploy（APPROVE_AI_COURSE_PRODUCTION_RELEASE）
- G（非ブロッカー後日）: P2-2/3/7/9/13/14・P3-1/2/3・contrast残31語・senses拡張
