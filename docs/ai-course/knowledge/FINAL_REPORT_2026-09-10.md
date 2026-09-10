# 最終報告 — N5〜N1＋Business Japanese 完全学習基盤フェーズ（2026-09-10）

指示の報告形式に沿う。数字はすべてこのリポジトリのテスト・スクリプトで再現できる実測（本番DBの実在生徒データは一切読んでいない）。

## Knowledge Graph
| | |
|---|---|
| 総item数 | 文法 **552**（N5 62／N4 86／N3 76／N2 178／N1 150）＋ ギャップ教材 23（draft・未公開）／ 語彙 **4,915**（うち N1 513）／ 基礎語彙 fi- 129／ 読解 **422**／ 聴解 **358** |
| relationship数 | 文法↔文法（similarPatterns）608 ＋ 文法→基礎語彙 508（Phase 1）／ 教材間接続 **22,848**（explicit 1,194・derived 21,654。Phase 4） |
| 解決率 | 関連参照の未解決 265 種（358 本）→ alias 73／partial 56／ambiguous 19／non-item 5／**missing 112**（参照2回以上の欠落 0） |
| 孤立item | 語彙にも教材にも繋がらない文法 **7／552**（1.3%）。読解・聴解で何にも繋がらないもの 1／780 |

## Coverage（Before → After）
| 級 | 文法 | 語彙 | 読解 | 聴解 |
|---|---|---|---|---|
| N5 | 62 | （N5 語は basic bank） | 80 | 60 |
| N4 | 86 | | 80 | 60 |
| N3 | 76 | | 100 | 100 |
| N2 | 178 | | 120 | 100 |
| **N1** | 150 | **317 → 513** | **30 → 42** | **0 → 38** |
| Business | 10 文脈（既存の文法・語彙の参照のみ。複製なし） | | | |

## Practical Axis
| | |
|---|---|
| domain coverage | 10 分野すべてに strong の語 20 以上（strong タグ 1,381 語・weak 275 本）。10 分野すべてで 語彙→文法→読解→聴解→産出 の経路が組める |
| situation coverage | 9 場面（依頼・謝罪・確認・断り・説明・報告・交渉・予定・質問）。「仕事で依頼する」は N2 の学習者に 語彙5・文法5・例文・読解5・聴解5・産出5 で組めることをテストで固定 |

## Missing Grammar（265 件）
| 分類 | 種類数 | 扱い |
|---|---|---|
| alias（別表記） | 73 | Alias 層で既存 ID へ |
| partial（既存の一部・活用形） | 56 | 既存 ID へ |
| ambiguous | 19 | 人が決める（括弧なしの参照） |
| ignored / non-item | 5 | 単独の助詞・接続 |
| actual missing | 112 | うち 23 をギャップ教材（draft・未公開）に。残りは参照1回のみ |

## N1（Before / After）
| | Before | After |
|---|---|---|
| Vocabulary | 317 | **513**（＋218。教材コーパス逆算・件数合わせなし。うち N2 相当 21・N3 1 は級を分けて収録） |
| Reading | 30（短文 0） | **42**（短文 12：仕事の文書 6・評論の断片 6） |
| Listening | 0 | **38**（模試1回分・事前生成音声・Realtime 不使用） |

## Learner State（Knowledge Item との接続）
| 経路 | 接続 |
|---|---|
| mastery | 既存 `AdvMasteryLedger` の targetId をそのまま正準 ID として使用。台帳は読むだけ（1件も書き換えない） |
| retry | `profile.knowledgeLog`（append-only・上限400）。言い直しの成否を production 経路で記録（AdvShell 配線済み） |
| review | `dueKnowledgeItems`（昨日間違えた／忘れかけ 1・3・7・30 日）→ 既存の錯題本の問題キーへ戻す `reviewKeysForItems`。新エンジンなし |
| conversation | AI会話の結果（used_self / used_with_hint / incorrect / avoided）を grammarId へ。会話コース 55 本＋ practice 会話（advconv-/bizconv-） |
| recognition / production / conversation の分離 | `KnowledgeItemState` で3経路を別々の習熟に。「選択では分かるが自分では言えない」＝ `knownButCannotProduce` |

## Next Best Action
`nextBestActions(state, {dateKey, edges, candidateIds})`: production_retry → prerequisite_review → review_recognition → production_first → refresh → conversation_apply。
仕様の例（昨日 選択○・産出× → 翌日 production 優先）をテストで固定。配線: AdvShell の弱点文法（全級・産出失敗を先に）。
「今日の冒険」の生成ロジック自体は無変更＝推薦 AI の完成ではなく、必要なデータ接続まで。

## AI Conversation
- 方針維持: 冒険に出さない／任意選択／全員 週3回。
- 接続: 会話コース 90 本のうち文法に当たる 55 本を grammarId へ（未解決 0・部分一致不使用）。文法の practice を既存 runtime が読める Mission に（N3 全 76 項目から生成可）。
  場面選択に「今日の文法を使って話す」「仕事の場面で話す」（級以下だけ）を追加。structured result のみ保存（ログ全文は残さない）。

## Interruption（Before / After）
| | Before（半二重・全員） | After（adaptive・QA/staging のみ） |
|---|---|---|
| false interruption（「あ」・咳） | マイク停止で起きない | 550ms 未満は無視（起きない） |
| valid interruption（「ちょっと待って」） | **止まらない** | 止まる（response.cancel） |
| echo fallback | — | 疑い 2 回／60 秒で**そのセッションだけ**半二重へ |
| WeChat | 半二重 | WeChat×スピーカーは半二重で開始 |
| headphone | 半二重 | adaptive |
| 本番の生徒 | 半二重 | **半二重のまま**（CEO 確認まで） |

実測は未（実在生徒で試さない）。QA アカウント×staging の3条件（スピーカー／イヤホン／WeChat）で `voice_interruption` の数を見る手順を PHASE7 に記載。

## QA
| | |
|---|---|
| test数 | **5,384 PASS / 0 FAIL**（開始時 5,311） |
| regression | 既存学習者のプロフィール（knowledgeLog は restore で []）／JLPT 級選択／目標級／語彙選択（N1 に vocab-n1 を追加＝以前は N1 語がバトルに出ていなかった不具合を修正）／学習日／AI 回数／個別 URL／entitlement：全既存テストが通過 |
| Data | duplicate ID 0・dangling 0（gap 教材・Business・N1 knowledge）・unresolved alias（参照2回以上）0・invalid level 0・orphan（孤立文法）7・domain coverage 10/10 |

## Existing Data Safety
- 実在生徒アカウントへのログイン 0。実在生徒の mastery／review／streak／conversation／AI cost への変更 0。
- 本番 DB への write 0（`remote-sql.mjs --write` を1回も実行していない）。

## Code
| | |
|---|---|
| commits | 12（Phase 1／2-1／2-2／2-3／2-4／2-5／3／4／5／6／7／8）＋ このドキュメント |
| files | 107 files changed（+9,039 / −43。うち音声 38 本・語彙 218 語・読解 12 本・聴解 38 本・N1 知識接続） |
| migrations | 1 本準備（`20260910130000_fix_realtime_text_output_price.sql`）。**未適用** |

## Production
- production deploy: **していない**（`deploy-production.sh` 未実行）。
- production DB write: **していない**。

## CEO 確認が要るもの（停止条件に当たる）
1. **本番 deploy**（Phase 2-3〜7 の全て。N1 聴解・語彙・読解、弱点文法の全級化、vocab-n1、AI会話の場面追加、割り込み方針＝本番は半二重のまま）
2. **本番 DB write**: `20260910130000_fix_realtime_text_output_price.sql`（16→24。価格には影響なし）
3. ギャップ教材 23 件（draft）を出題プールへ入れるか（中身の確認後）
4. adaptive 割り込みを本番へ（QA→staging→limited の結果を見てから）

## 詳細
`docs/ai-course/knowledge/PHASE1_KNOWLEDGE_GRAPH.md`〜`PHASE7_INTERRUPTION.md`、`PHASE2_2_UNRESOLVED.md`〜`PHASE2_5_N1_READING.md`、`DEFERRED_COST_FIX.md`。
