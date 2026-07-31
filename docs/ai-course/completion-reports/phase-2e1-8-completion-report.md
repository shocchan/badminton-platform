# Phase 2E-1.8 完了報告書（Decision Integrity & Review Readiness）

日付: 2026-07-27 ／ ブランチ: feature/ai-course-learning-polish ／ staging反映済み
依頼元: 自律ループ#2のChatGPT設計（prompts/2e1-8-prompt.md・decision=CONTINUE）
コミット: c7bd23c（完全性監査・provenance・stale検出）・ac0326f（双方向導線・監査情報UI・バナー階層）

## 1. 完全性監査の実数（§2・auditDecisionQueue()で恒等式をテスト固定）

- **source candidate総数 218 ＝ 採用91 ＋ 採用済み除外108 ＋ 対象外除外19**（type別にも恒等式成立・duplicate 0）
- type別: example 4候補→1採用/3採用済み ／ cognate 109→11/98 ／ meaning_zh 27→20/7 ／
  role 74→57採用/17対象外（現roleがoptional以外） ／ sense 4→2採用/2対象外（全Senseレビュー済み）
- **数値差異の検出と訂正（§19・隠さず記載）**: 2E-1.7報告の「meaning_zh 17・role 60」は誤集計だった。
  実数は **meaning_zh 20・role 57**（総数91/72語は偶然一致）。2E-1.7報告書に訂正を追記済み
- decisionIdはitemId+typeのみから決まり元データ順序に依存しない（テストで担保）

## 2. P0=3の由来（§3・調査結果）

- 原因特定: priorityは`buildReviewComparisons()`の**語単位**導出で、`buildDecisionQueue`が同一語の全判断事項へ継承していた
- 対応（§3.1に従いpriorityの意味は変更せず）: provenanceに`independentPriority`と`priorityInheritedFromWord`を追加。
  **fi-namae: example=独立P0**（ふりがな/日本語major由来）**・meaning_zh/role=語のP0を継承**（単独ではP1/P2相当）
- UI: 継承priorityは「P0†」表示＋監査情報に独立/継承を明記。全体内訳: **独立70・継承21**（凡例表示）

## 3. provenance（§4）

各判断事項に sourceReview/sourceField/sourceConfidence/sourcePriority/independentPriority/derivationRule/datasetVersion を付与（既存データからの導出のみ・推測生成なし）。UIは「監査情報（由来）」折りたたみ。

## 4. stale/orphaned検出（§5・§13）

- 判断保存時に対象スナップショット（current/proposed値・データ版）を記録
- 分類: current／stale（対象値変化）／orphaned（現キューに無いID）／incompatible（別版）。スナップショット無しの旧ドラフトは誤stale表示しない
- 自動削除・自動確定・自動supersededは実装しない（曖昧な対応付けを避ける・§5）
- importプレビューに stale/orphaned/incompatible件数＋exportedAt表示。未知IDはエラー→orphaned警告に変更（判断履歴を失わせない）

## 5. 双方向リンク（§6）

- Console→語彙詳細: 各判断事項に「語彙詳細を見る」（セクションanchorは未実装・未完成事項）
- 語彙詳細→Console: 未処理判断がある語のみバッジ表示「判断キュー: 未判断3・P0 3 →」（fi-namae実機確認済み・未処理なしは非表示・専用lazy chunk 0.83KB）
- 戻り文脈: フィルター/検索/選択中IDをsessionStorageで復元（テスト担保）

## 6. role説明・影響範囲（§7-§8）

- role判断詳細に定義説明（required/diagnostic/optionalの既存実装上の意味・現在の接続先=ロードマップ診断対象数とパック開始診断問題数・出題頻度は未接続と明示）
- 影響範囲を「現在接続済み」と「将来影響候補（未接続・断定しない）」に分離表示

## 7. 実ブラウザ・モバイル検証（§9-§10・今回は実施できた）

方法: CEOのChromeウィンドウはOS制約でリサイズ不可のままだが、**同一オリジンiframe（実レイアウトエンジン・media queryはiframe幅に反応）**で実ブラウザ計測を実施:

| 幅 | 横overflow | バナー占有 | radioラベル<28px | 保存ボタン高 | 詳細+監査情報 |
|---|---|---|---|---|---|
| 320×568 | なし | 3% | 0件 | 40px | 表示OK |
| 375×667 | なし | 3% | 0件 | — | 表示OK |
| 390×844 | なし | 2% | 0件 | — | 表示OK（lang属性確認） |
| 768×1024 | なし | 2% | — | — | — |
| desktop 1440 | なし | — | — | — | 表示OK |

スクリーンショット証跡取得（390px: モバイルナビ・バナー・P0†・詳細カードまで正常）。iframeは検証後に除去・コミットしない。
制約: OSウィンドウそのもののリサイズ・ソフトウェアキーボード実挙動は未検証（実機スマホでのCEO確認を推奨）。

## 8. アクセシビリティ（§11・Decision Console範囲）

fieldset/legendのradioグループ・label関連付け・aria-live（保存/import通知）・role=alert（importエラー）・
aria-expanded（詳細）・aria-disabled（保存）・zh値へのlang="zh-CN"・色非依存（P0†テキスト・状態はテキスト表示）・
native button/input（keyboard操作可）・details/summary（バナー補足・監査情報）。
未実施: contrast自動計測・reduced motion（アニメーション未使用のため対象なし）・自動a11yテスト基盤の導入（既存基盤なし）

## 9. バナー階層（§12）

主メッセージ「この端末だけの判断ドラフト・教材未反映」常時表示＋補足（非正式承認・非正式CEO権限・localStorageのみ）は展開式。安全文言の削除なし（テストで担保）。

## 10. 品質ゲート

- テスト **604件全パス（+15）** ／ tsc 0 ／ lint 45E/6W=51（ベースライン一致・増分0） ／ build成功
- bundle: **main 590.30KB増加0**。decision系はlazy: queue共有chunk 8.35KB＋Console 12.78KB＋バッジ0.83KB。VocabularyHub +1.0KB（配線）
- staging: console error 0・判断キュー/バッジ実機確認済み・教材/Supabase/認証/learnerデータ/本番/main 変更なし

## 11. 未完成・人間判断待ち

- Console→語彙詳細のセクションanchor未実装／supersededの自動対応付けなし（意図的）／contrast自動計測なし
- 人間判断: 91判断事項の採否（Decision Consoleで開始可能）・P0を語単位/判断事項単位のどちらで運用するか・role 57件の判断基準・正式CEO権限制御の将来導入
