# Phase 2E-1.9 完了報告書（Learning Connectivity Audit & Lab Inspector）

日付: 2026-07-27 ／ ブランチ: feature/ai-course-learning-polish ／ staging反映済み
依頼元: 自律ループ#4のChatGPT設計（prompts/2e1-9-prompt.md・decision=CONTINUE）
コミット: 26f59df（接続グラフ＋恒等式テスト）・aa9795c（Inspector＋anchor）

## 1. 接続グラフの実数（read-only導出・恒等式テスト固定）

- 対象: **140語（基礎78＋N3 62）× 4surface = 560edge・重複0・不正参照0**
- 前提の明示: ことば図鑑全体が現在labPreviewゲート内＝一般受講生にはintentionally-isolated（graph.labOnly・Inspector冒頭に明記）。以下は「lab学習体験内部」の接続

| surface | 実数 | 発見 |
|---|---|---|
| 語彙画面 | connected 140（直接） | 全語が一覧/詳細でmeaningZh・例文・cognate・画像到達 |
| 診断 | connected 129（直接29+導出100）・**partial 11** | partial 11語=会話コア語（行く/来る/食べる等）。全trackでrequiredのため診断セットに一度も入らない |
| 会話 | **connected 12・unverified 128** | 明示参照はスクリプト会話練習の12語のみ。他128語は「AI自由会話で使われる可能性」しか保証がない |
| 復習 | **partial 140** | 3分復習の候補選定コードパスは全語接続済み。**間隔反復（翌日/3日/7日）の予定生成が未実装**という構造的ギャップ |

- 総合状態: connected 0・partial 12・unverified 128・orphaned 0（完全孤立語なし）
- 各edgeにreason＋evidence（ファイル/export/関数名）。決定的（再導出同一・順序非依存・テスト担保）

## 2. 診断カバレッジ監査

プール問題33問・参照ユニーク語29（基礎9＋N3 20）・存在しないwordId 0・問題ID重複0・
false friend probe 2・**N3診断適格 62/62=100%**（プール参照 or role=diagnosticで診断セット到達可能）

## 3. Connectivity Inspector（vview=connectivity・labPreview限定・lazy 10.7KB）

surface別サマリーカード・診断カバレッジ行・フィルター（レベル/role/surface/総合状態/語彙検索）・
aria-live表示件数・語ごとの4surfaceバッジ（色非依存のテキスト併記）・詳細にreason/evidence・
語彙詳細/判断キューへのリンク。graph可視化ライブラリなし（§13遵守）。

## 4. 語彙詳細セクションanchor（前Phase繰り越し分・§11）

`#vsec-meaning`／`#vsec-examples` を追加（scroll＋focus移動・履歴はreplaceStateでクリーン）。
Decision Consoleの「語彙詳細を見る」は判断typeに応じたセクションへ（example→例文・他→意味）。

## 5. 品質ゲート

- テスト **612件全パス（+8）**・tsc 0・lint 45E/6W=51（+1警告を検出→即修正しベースライン一致）・build成功
- bundle: **main 590.30KB増加0**。Inspector 10.71KB lazy・VocabularyHubは再チャンクで66.9→50.7KB
- staging実機: Inspector表示・140語/560edge/診断33問の数値一致・console error 0・4xxリソース0
- ガードレール: 教材本体・role・診断問題・会話/復習ロジック・human_reviewed/approved・Supabase・認証・learnerデータ・本番・main 変更なし。orphan自動修正なし（そもそもorphaned 0）

## 6. ChatGPTの次回分析に渡すべき構造的発見（自動接続はしていない）

1. **復習の間隔反復（翌日/3日/7日）が未実装**（140語全部がpartialの根本原因）
2. **会話との接続が12/140語のみ**（実LLM会話へのwordId接続はEdge設計後の課題）
3. **会話コア11語は診断で一度も確認されない**（required設計の意図か要人間判断）
4. role提案57件をCEOが採用しても、roleは出題頻度に未接続（判断の効果範囲を要説明）

## 7. 未完成・制約

- contrast自動計測は未実施（既存基盤なし・次Phase以降の候補）
- モバイル実表示は2E-1.8のiframe手法で検証可能だが、本Phaseでは新規レイアウトが軽微（バッジ折返し設計）のため
  デスクトップ実機＋既存パターン準拠で確認。ソフトキーボード実挙動は実機スマホでCEO確認推奨
- Inspector→語彙詳細のconnectivityセクションanchorは未実装（詳細画面に接続情報セクション自体がないため）
