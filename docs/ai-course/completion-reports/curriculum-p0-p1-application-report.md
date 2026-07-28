# 教材P0/P1 CEO判断 反映報告（curriculum-p0-p1-application-report）

日付: 2026-07-28 ／ ブランチ: feature/ai-course-learning-polish（staging反映済み・本番未反映）
状態: **Vocabulary Content Draft RC**（正式なapproved教材ではない）

---

## 1. 14件の反映結果（すべて field 単位・human_review_candidate）

| # | ID | field | CEO確定値 | 反映先 |
|---|---|---|---|---|
| 1 | fi-namae:example | 例文 | 私の名前は王小明です。／我叫王小明。 | foundationUnit1 + ふりがな再構成 |
| 2 | fi-namae:meaning_zh | 訳語 | 姓名；名字 ＋ usageNote「在表格或正式场合…」 | foundationUnit1 |
| 3 | fi-komaru:meaning_zh | 訳語 | 为难；困扰（維持）＋ usageNote「不知道怎么办…」 | foundationVocabN3 |
| 4 | fi-kyoumi:cognate | 同源語 | **mostly_same（維持）**＋ learningFocus追記 | メタ維持 + contentMeta |
| 5 | fi-genki:cognate | 同源語 | partial_overlap ＋ learningFocus | メタ + contentMeta |
| 6 | fi-kaishain:cognate | 同源語 | japanese_specific ＋ learningFocus | メタ + contentMeta |
| 7 | fi-kibun:cognate | 同源語 | japanese_specific ＋ usageNote「≠气氛」 | メタ + N3データ |
| 8 | fi-nanji:cognate | 同源語 | partial_overlap ＋ learningFocus | メタ + contentMeta |
| 9 | fi-nihongo:cognate | 同源語 | japanese_specific ＋ learningFocus | メタ + contentMeta |
| 10 | fi-soudan:cognate | 同源語 | partial_overlap ＋ learningFocus | メタ + contentMeta |
| 11 | fi-tomodachi:cognate | 同源語 | japanese_specific ＋ learningFocus | メタ + contentMeta |
| 12 | fi-yakusoku:cognate | 同源語 | **false_friend** ＋ learningFocus | メタ + contentMeta + N3診断 |
| 13 | fi-yasui:cognate | 同源語 | **false_friend** ＋ learningFocus | メタ + contentMeta + 基礎診断 |
| 14 | fi-zenzen:cognate | 同源語 | partial_overlap ＋ learningFocus | メタ + contentMeta + N3診断 |

分類の内訳: mostly_same 1（維持）／partial_overlap 4／japanese_specific 4／false_friend 2／
訳語・例文 3。CEO文言はそのまま使用（AIによる書き換えなし）。

## 2. field状態の遷移（§2）

`vocabFieldReviewDecisions.ts`（新規）で管理。item・sense・pack全体の状態は**一切変更していない**
（全140語 `review: 'draft'` のまま。テストで担保）。

ceo_decided → **applied_draft**（反映・validation・829→837テスト・build完了）
→ **human_review_candidate**（下記のstaging表示確認済み）

## 3. §4 確認結果（staging実機・全項目pass）

### fi-namae
| 確認 | 結果 |
|---|---|
| 例文表示 | ✅ 「私の名前は王小明です。」 |
| 例文中国語 | ✅ 「我叫王小明。」 |
| 例文ふりがな | ✅ 「私わたしの名前なまえは王小明おうしょうめいです。」（再構成・全文一致テストあり） |
| 意味問題・選択肢自動生成 | ✅ 正答テキスト「姓名；名字」（テストで担保・選択肢は自動追随） |
| direct URL | ✅ `?vview=detail&vitem=fi-namae` で直接表示 |
| locale切り替え | ✅ 中文注記（usageNote・訳）表示。UI言語は画面内の中文ボタンで切替（既存挙動） |

### cognate
| 確認 | 結果 |
|---|---|
| バッジ／注意表示 | ✅ fi-yasui: 「中国語と使い方が違うことばです。（日语「安い」表示价格低…）」 |
| learningFocusZh | ✅ 語詳細の学習ポイント欄にCEO文言 |
| 診断対象 | ✅ 4問追加（約束=约定／安い=价格便宜的超市／何時=几点／全然=否定呼応）。分類名は問わない |
| 推薦理由 | ✅ 変更なし（roleベースのまま。cognateを推薦根拠に使用しない） |
| 集計 | ✅ 基礎78語の未確定0・N3の未確定0（判断キューはcognate 0件） |
| review画面・connection inspector | ✅ フィルタ・集計は新分類で動作（既存テストで担保） |

resolvedにできない事象（apply失敗・test失敗・UI不一致・古い値の残存・日中不整合・
ふりがな再構成失敗）: **なし**。→ 14件すべて resolved候補（human_review_candidate）。

## 4. severityモデルの修正と再集計（§3）

原則を実装へ反映: **unreviewedのcognateは、断定表示せず・false friend診断に使わず・
推薦根拠に使わないなら P2**（現アプリはこの3条件を満たすことをテストで担保）。
誤った分類が表示・診断で利用中の場合のみP1。release_blockerは「その項目自体がP0/P1」だけ。

### rootIssueId単位の再集計（14件反映後・重複カウントなし）

| 区分 | 反映前 | 反映後 |
|---|---|---|
| 判断キュー総数 | 91 | **77**（meaning_zh 18・role 57・sense 2） |
| **root P0** | 1 | **0** |
| **root P1** | 13 | **0** |
| P2（local） | — | **59** |
| P3（local） | — | **18** |
| release_blocker | 14 | **0** |
| before_beta_recommended | 77 | **59** |
| can_defer | 0 | **18** |

監査恒等式: 候補218 = 選定77 + 反映済み111 + 対象外19 + **CEO判断済み11**
（14件のうち3件は確定値がChatGPT提案と一致したため「反映済み」側で除外）。

## 5. 品質

テスト **837件全パス**（+33: CEO判断担保26・草案dry-run7）／tsc 0／lint 45E/6W=51（増分0）／
build成功／main bundle 590.30KB（増加0）。
human_reviewed・approved・一括承認・pack承認: **変更なし**。

## 6. 今後

- 本snapshotの呼称は **Vocabulary Content Draft RC**
- human_reviewed へ進めるfieldはCEOが次回指定（Release Gateは release-readiness-matrix.md 参照）
