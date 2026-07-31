# Cleanup Packet: 最終正準値確認＋偶発会話記録（2026-07-30・読み取り専用セッション）

HEAD: 5502781（作業branch feature/ai-course-learning-polish・working tree clean）
本セッションの変更: **code 0・commit 0・deploy 0・remote write 0**（remoteはCEO本人トークンでのGET 12回のみ。本パケットのみ新規・未commit）

## サマリー
- Cognate counts consistent: **YES**（過去=エンジン4分類・最新=UI7分類。どちらもHEADから完全再現・データ/taxonomy変更なし）
- 140語の使用問題接続: **要言い換え**（Stage2は140/140でTRUE。ただし「使用問題（文脈∪コロケ）」は139/140）
- 偶発会話記録: **特定済み**（session `cd58eebf` ほか関連7行）
- Remote write: **0**
- 推奨Cleanup: **A**（スナップショット添付の完全削除。item_progress前値のみ推定復元である点に留意）
- 推奨エリア名方針: **B**（日本語固有名詞＋中国語gloss併記。地図ラベルとariaのみ実務例外）

---

## 1. Cognate分類の正準値（単一集計関数・HEAD実データ）

### 二層taxonomy（データ変更・taxonomy変更は無し）
| taxonomy | 集計関数 | 用途 | HEAD値 |
|---|---|---|---|
| **4分類（エンジン）** | `cognateProfileFor`（明示プロファイル＋未登録は漢字→partial/かな→jp推定） | 出題次元の選択・教える画面の転移注意 | false_friend **8**・partial_overlap **10**・mostly_same **54**・japanese_specific **68**（=140） |
| **7分類（UI/図鑑）** | `aggregateCognates`＝`levelMetaOf`（VOCAB_LEVEL_META＋N3_LEVEL_META） | 図鑑フィルター・バッジ・ヘッダー・正準statsのJSON | transparent_same **54**・mostly_same **2**・partial_overlap **46**・false_friend **9**・japanese_specific **13**・no_cognate **16**・unreviewed **0**（=140） |

**過去報告（8/10/54/68）＝4分類そのもの。最新報告（ff9・partial46）＝7分類そのもの。** 両者はHEADで同時に成立し、矛盾ではなく**ラベル未記載の引用が原因**。

### 定義と実ID
- **「同形語注意」フィルター9語**＝`levelMetaOf(id).cognate === 'false_friend'`：
  出身・勉強する・安い・上手・先生・情報・都合・約束・大変
- **partial 46語**＝`levelMetaOf(id).cognate === 'partial_overlap'`（漢字同形だが意味範囲がずれる語）
- **contrast完成15語**（partial∩バンク収録）: fi-miru, fi-hanasu, fi-kiku, fi-kaku, fi-tsukau, fi-neru, fi-takai, fi-eki, fi-okane, fi-fueru, fi-shiraberu, fi-komaru, fi-yotei, fi-muri※, fi-zenzen※（※この2語はlevelMetaではpartial扱いだが4分類ではfalse_friend）
- **contrast未完成31語**: fi-namae, fi-iku, fi-kuru, fi-yomu, fi-kau, fi-kaeru, fi-densha, fi-okiru, fi-nanji, fi-tsukuru, fi-au, fi-hairu, fi-deru, fi-noru, fi-oriru, fi-tanoshii, fi-suki, fi-genki, fi-kawaru, fi-kaeru-change, fi-heru, fi-tsuzukeru, fi-tsuzuku, fi-kimeru, fi-kimaru, fi-omou, fi-soudan, fi-renraku, fi-yoyaku, fi-ureshii, fi-hazukashii
- **過去のpartial_overlap 10との違い**: 過去の10は4分類の明示プロファイル（会社・高い・元気・病院・家族・相談する・困る・予定・情報・厳しい）。46は7分類。**同名別物**。

### manifest間の不一致（3件・今回は修正せず）
1. `vocab-canonical-stats-20260730.json` は7分類の数値のみでtaxonomyラベル無し → 4分類の過去報告と並べると矛盾に見える（ラベル追記を推奨）
2. **接続ギャップ（実害候補）**: levelMeta ffの「出身」「都合」は4分類では japanese_specific のため、昨夜追加した対照問題が**バンクに存在するのに通常出題（buildAssessQuestions）へ流れない**（jp_specificパスはcontrast非収録）。情報はpartialなので接続済み。→ profile再分類 or エンジンパス追加は人間確認後の課題
3. 2E-1.5の「fi-jouhou mostly_same→false_friend訂正」はlevelMeta側のみ反映。profileはpartial_overlapのまま（意図的かの確認が必要）

### UI表示に使用している値
- 図鑑（フィルター/ヘッダー内訳/同形語バッジ）: **7分類**（vocabCanonical→levelMetaOf）
- 出題次元の選択・第1章teach画面の「中国語の◯◯と違います」・N3単元の同形語注意: **4分類**（cognateProfileFor）

### 「使用問題」と「日中対照問題」の分離
- **使用問題**＝エンジンが語データから決定的生成する、文中での使用を測る問題。context（穴埋め・122語）と collocation（自然な組み合わせ・84語）。conjugation（活用56語）は「形」の問題でこれとは別
- **日中対照問題**＝`COGNATE_CONTRAST_BANK` の手書き問題（transfer_error/scope_contrast/register）。**25語・26問**（昨夜+13問）。中国語からの転移誤用そのものを測る
- 昨夜の「15/46」は **7分類partialに対する対照バンクのカバー率**であり、使用問題の数ではない

---

## 2. 140語の問題接続（次元別・分離集計）

| 接続 | 語数/140 |
|---|---|
| usage: context（穴埋め） | **122** |
| usage: collocation | **84** |
| usage: context∪collocation | **139**（例外: fi-benkyo※） |
| conjugation（活用） | 56（動詞56語全数） |
| contrast（日中対照バンク） | 25（26問） |
| production（産出・並べ替え） | 65 |
| review connection（単元復習文脈） | **140**（全語が≥1単元のreview contextに所属。間隔反復への実接続は学習操作で動的に発生） |
| Stage2（使い分け）いずれか | **140**・活用のみに依存する語 **0** |

※fi-benkyo（勉強する）は4分類false_friendのため出題パスにcollocationが無く、contextも例文構造で不成立。代わりに **transfer_error（対照）＋conjugation** でStage2を満たす。

### 「全140語が使い分け問題を持つ」の再評価
- Stage2定義（context/collocation/particle/conjugation/scope_contrast/transfer_error/register）なら**正確**（140/140・契約テストあり）
- 「使い分け＝文中での使用選択」と読まれると **139/140** が正しい（benkyo例外）

**言い換え候補（UI変更なし・報告文言のみ）**:
1. 「全140語が使い分け段階（Stage2）の問題を1問以上持ちます（文脈・コロケーション・活用・日中対照のいずれか。活用だけに頼る語は0）」
2. 「文の中での使用を直接測る問題（穴埋め／コロケーション）は139/140語。残る1語『勉強する』は日中対照＋活用で測ります」
3. 数値併記型: 「Stage2 140/140・使用系（文脈∪コロケ）139/140・日中対照25語26問」

---

## 3. 偶発的に作成されたCEO会話記録（全行特定・read-only）

**特定方法**: CEO本人のstagingログインセッション（RLS準拠・本人行のみ可視）でREST GET。他learnerへのアクセスは構造上不可能（かつ実施していない）。

| 項目 | 値 |
|---|---|
| learner | `6d967731-9b57-47bb-8bc8-50ae1de03d98`（display_name: sho・N2・week3） |
| session ID | `cd58eebf-f4d9-4821-8120-632814721a94` |
| mission / kind | `w01m3`（〜をしています）/ `review_day3`・mode voice・difficulty 1 |
| startedAt | 2026-07-29T16:02:31.453Z（JST 7/30 01:02:31） |
| endedAt | 2026-07-29T16:03:13.010Z・**duration 35秒** |
| completion | completed / end_reason `student-request`・target_used **false** |
| transcript | ai_session_utterances **2行のみ**（system「connected」・tutor「では、短く振り返って…」）。**学習者発話0**（speech_metrics: studentTurns 0, totalStudentChars 0） |
| report | session行内のjsonb（corrections/targetUsage/achievements/summary…）。別テーブルなし |
| コスト | estimated_cost_usd **$0.0784** |
| mission completion record | `ai_item_progress` 2行が16:03:12に更新: ①**w01m3**（id `026c7f37…`）→ state reviewed_day1・stage **extra**・next_review **2026-08-01**・successful 1・**failed 1**（target未使用のため失敗計上） ②**w01m4**（id `b91859b5…`）→ state reviewed_day3・stage day7・next_review **2026-08-06**・successful 2・failed 0 |
| usage counter | `ai_usage_daily` 2行: **7/30行**（sessions_count 1・seconds 0・cost 0 — セッション開始時に新規作成＝当日残−1の実体） / **7/29行**（終了時に seconds+35・cost+$0.0784 が合算。日付キーが開始=ローカル日付/終了=UTC日付で分裂している実装quirkも判明） |
| XP/成長snapshot | **影響なし**（ai_growth_snapshots・ai_feedback・ai_issue_reports に該当時刻以降の行0。冒険XPはremoteに存在しない） |
| 関連テーブル・行数 | sessions 1行・utterances 2行・item_progress 2行（更新痕）・usage_daily 2行（1新規+1加算）＝**計7行touch** |
| 会話回数22→23 | ai_learning_sessions 総行数 **23**（completed 19）で整合 |

補足: `ai_course_unit_progress` はremoteに**存在しない**ことも確認（H2未適用の想定どおり・sync probeの安全設計が機能）。

---

## 4. Cleanup案（未実行・remote write 0のまま）

> 共通の事前手順（どの案でも）: 対象7行の現在値JSONスナップショットを保存してから実行（本パケット§3が実質のスナップショット。実行時は生JSONを再取得して添付）。
> **item_progress 2行の「事故前の値」はDBに履歴が無く、レビュー状態機械からの推定になる**（推定値: w01m3=stage day3/next 2026-07-29/failed 0、w01m4=stage day3/next 2026-07-29/successful 1）。ここだけは厳密復元不可能な点を先に明示します。

### 案A: 全関連記録を削除して検証前へ戻す（推奨）
- 削除/更新: utterances 2行 DELETE → session 1行 DELETE（FK順）→ usage_daily 7/30行 DELETE・7/29行 UPDATE（seconds −35・cost −0.0784）→ item_progress 2行 UPDATE（推定前値）＝ **7行**
- 集計影響: 累计会话 23→22・当日残復元・復習キューは w01m3/m4 が7/29 due に戻る（=即「期限切れ2件」表示に戻る）
- FK: utterances→sessions のみ。growth/feedback/issueは無関係（行0確認済み）
- rollback: スナップショットJSONをINSERT/UPDATEで完全復元可（session idも保持）
- 残リスク: item_progress前値が推定（上記明示）
- 承認文言: `APPROVE_CEO_TEST_SESSION_CLEANUP_A`

### 案B: test/invalid扱いにして集計から除外
- 更新: session 1行のみ（`error_code='invalidated_ceo_test'` 等のフラグ転用）
- ただし**スキーマにinvalidフラグが無い**ため、集計側（累计・残数・復習）の除外には**アプリのコード変更＋通常deployが別途必要**（本日は禁止のため提案のみ）。コード反映までは表示23のまま
- rollback: error_codeをnullへ（1行）
- 承認文言: `APPROVE_CEO_TEST_SESSION_CLEANUP_B`

### 案C: 記録は残し、回数・Mission・Reviewだけ戻す
- 更新: item_progress 2行（推定前値）＋ usage_daily 7/30 DELETE・7/29 UPDATE ＝ 4行。session/utterances/reportは保持
- 集計影響: 残数・復習は戻るが、**累计会话はsessions行由来のため23のまま**（「回数を戻す」は満たせない）
- rollback: 現値スナップショットから復元
- 承認文言: `APPROVE_CEO_TEST_SESSION_CLEANUP_C`

### 案D: 何もしない
- 実害: $0.0784・35秒・review 2件の後ろ倒し（w01m3はfailed+1で早期再会枠）。テストアカウントのため実learner影響なし。speech_metrics（発話0）が無効セッションであることを自己記述しており、将来の分析時に機械識別可能
- 承認文言: 不要

**推奨: A**。理由: 対象7行が完全特定済み・FK単純・rollback可能・テストアカウントの記録衛生が最優先。item_progressの推定復元が許容できない場合のみDを選択（BとCは中途半端: Bはコード変更依存、Cは回数が戻らない）。

---

## 5. エリア名の表示方針（現状一覧・変更なし）

| 表示面 | ja画面 | zh画面 | 現方針 |
|---|---|---|---|
| World Map ラベル | ミナト等（nameJa短縮） | **同じ（日本語）** | ja固定 |
| World Map aria | 「ソラノ塔へ行く（N2文法…）」 | 「前往ソラノ塔（N2语法…）」 | **名前ja＋機能zh** |
| World Home 現在地 | 現在地: ミナト | 当前位置: **ミナト** | ja固定 |
| 列島名 | ミナモ列島 | **米纳莫列岛** | zh訳 |
| 施設カード | 記憶の書庫＋機能ja | **記憶の書庫**＋機能zh | ja名＋zh機能 |
| Area detail 見出し | カタチの遺跡（文法の遺跡） | **形之遗迹（语法遗迹）** | zh完全置換 |
| Area badge/breadcrumb | ミナモ列島・第7エリア／地図へ | 米纳莫列岛・第7区域／**返回米纳莫列岛地图** | zh訳 |
| N2塔/庭園/港 見出し | ソラノ塔（N2文法攻略）等 | **ソラノ塔（N2语法攻略）**・オモイデ庭園（记忆之庭）・カタリ港（会话之港） | **ja名＋zh gloss併記** |
| 第1章 地名/Quest | 町の入口・Quest n | **小镇入口**・任务 n | zh完全置換 |

→ 現状は**4方式が混在**（ja固定/併記/zh置換/訳し分け）。最悪の齟齬は「地図=ソラノ塔・カタチの遺跡（ja）」→「詳細=形之遗迹（zh）」の同一性断絶。

### 比較と推奨
| 観点 | A: 地図ja・詳細zh | B: 併記 | C: locale完全切替 |
|---|---|---|---|
| 日本語学習RPGの一貫性 | △ 同一性断絶が残る | **◎ 固有名詞=学習対象として常時露出** | × ja名の学習機会消失 |
| 理解しやすさ（初学者） | ○ | **◎ gloss常備** | ◎ |
| mobile幅 | ◎ | ○（塔・庭園・港の併記は390px実測済みで問題なし。地図ラベルのみ不可） | ◎ |
| 読み上げ | △ | ○（ariaは現行の「名前ja＋機能zh」を維持すれば冗長化しない） | ○ |

**推奨: B**（全画面「日本語固有名詞（中国語gloss）」併記。実務例外2つ: ①地図ラベルは幅制約でja短縮形のまま ②ariaは現行形式を維持）。すでに塔・庭園・港・施設がB形式のため、**変更対象はArea detail見出し・第1章地名・米纳莫列岛表記の3系統のみ**で工数最小。名称は全て仮称（human_review_candidate）のため、正式名称確定時に一括適用が効率的。
