# 【ADAPTIVE ADVENTURE V2 FINAL】

作成: 2026-07-31 ／ branch `feature/ai-course-adaptive-adventure-v2`

| 項目 | 判定 |
|---|---|
| Goal Selection | **COMPLETE** |
| N3 Target Route | **COMPLETE** |
| N2 Target Route | **COMPLETE** |
| Conversation Route | **COMPLETE** |
| Hybrid Route | **COMPLETE** |
| Diagnosis | **COMPLETE** |
| Skill Profile | **COMPLETE** |
| Route Generator | **COMPLETE** |
| Today Adventure | **COMPLETE** |
| Problem Battle | **COMPLETE** |
| 80% Multi-day Mastery | **COMPLETE** |
| Readiness Dashboard | **COMPLETE** |
| AI Conversation Connection | **COMPLETE**（既存runtimeへの導線・使用判定。実会話の実走はstaging監査対象外） |
| Human Lesson Bridge | **COMPLETE** |
| Legacy Compatibility | **COMPLETE**（flag off→従来Home実走確認・既存データ非破壊） |
| N2 Canonical | **178**（+ aliases 2 = 180・実データ再集計） |
| N2 Aliases | **2** |
| N3 Canonical | **文法76・単元12・語彙140（foundation 78 + N3prep 62）** |
| P0 | **0** |
| P1 | **0**（staging実画面で2件発見→即修正・回帰テスト化） |
| P2 | **3**（下記） |
| P3 | **2**（下記） |
| **V2 Technical Complete** | **YES** |
| **Staging Ready** | **YES**（deploy `b7f82110` → staging alias反映済み） |
| **Production Deploy** | **NOT_EXECUTED**（§32遵守） |

## 詳細

1. **branch**: `feature/ai-course-adaptive-adventure-v2`（base = hotfix tip 2795685 = origin/main + staging検証済UX修正。D-001）
2. **HEAD**: 最終commit参照（git log）。origin push済
3. **commits**: Phase単位のcheckpoint commits（監査→docs→lib→battle層→bridge→UI→P1修正）
4. **working tree**: clean（最終commit後）
5. **origin**: push済み
6. **V2 feature flag**: `settings.adventureV2.enabled`（learner単位・既定OFF）。入口は `?v2=1` のopt-in画面のみ。既存learnerは自動移行しない
7. **current production safety**: kawabado.com非接触。V2はstagingのみ。DB migration差分0（profileは既存jsonbフィールド追加のみ）
8. **content reuse**: content-reuse-map.md。canonical教材の書き換え0・再生成0。alias進捗引継ぎ維持
9. **onboarding**: 目的3種→N3/N2選択（N5/N4/N1はenum整備済み・UI非公開）→受験日→週日数/5・15・30分→相棒3種→診断→ルート提示
10. **goal routes**: jlpt/conversation/hybrid の3系統（generateRoute）
11. **diagnosis**: 12問（既存validatedプールのみ）＋会話サンプル2問（skippable・D-011）。未回答は集計/gapに入れない
12. **skill model**: 7能力×{score, confidence, evidenceCount, lastAssessedAt, band}。既存進捗はlow止まり・ランク認定なし（§23）
13. **route generator**: 現在地帯に応じ経由地を増減。目的地不変。降格語を使わない（テスト固定）
14. **Today Adventure**: 優先順位§13・時間別構成・前日重複回避・why/成功条件/次の一歩必須
15. **Map**: 目的地/現在地/経由地/攻略率/復習推奨。全stage閲覧・挑戦可（ロック無し）
16. **N3 route**: 単元12（エリア1〜7）＋N3文法76（カタチの遺跡）
17. **N2 route**: ソラノ塔・12単元束178項目＋読解ステージ＋模擬ボス
18. **foundation bridge**: 基礎キャンプ→N3橋（低帯のみ挿入）
19. **battle engine**: 通常/強敵/中ボス（時間制限）/ランクボス。未出優先・誤答再出題・タイプrobin
20. **problem pools**: authored recognition 254＋単元問題608＋**決定的variant生成（cloze/meaning/form）**。機械検査（漏洩0/重複0/解説・出典必須）を通った validated_beta のみ出題。生成不能は rejected として可視化
21. **mastery**: 80%×別日3回×未出比率≥0.3×複数タイプ→7日後遅延確認でmastered。1回の高得点で跳ねない
22. **readiness**: 技能別＋confidence＋未出成績＋遅延定着＋時間配分（timedのみ）。未判定を隠さず合格を保証しない
23. **AI conversation**: 文法→会話ミッション仕様（buildConversationMission）・使用判定は完全包含のみ・転用/言い直し分岐。既存8ターン/closingPhase/レポート/復習は非変更
24. **review**: 既存day1/3/7/30へ接続（復習の庭・クエスト先頭）
25. **human lesson**: lessonPrepSummary（週日数・苦手skill・focus候補・本人相談）。カレンダー連携なし（D-013）
26. **analytics**: §24の18イベント（許可キーのみ・本文送信なし・sandbox停止は既存機構）
27. **ja**: 全画面
28. **zh**: 全画面（staging実測・天空塔gloss等）
29. **mobile**: 375px実測 overflow 0・42px未満ボタン0
30. **accessibility**: 44px標的・aria-label・reduced motionは既存Shell踏襲・キーボード（button要素のみで構成）
31. **legacy data**: 読み取りのみ。V2 profileはsettings jsonb内。従来Home復帰可
32. **tests**: **1360全PASS**（ベース1306＋V2 54）
33. **build**: PASS（main 591.63KB・AdvShellはlazy 68KB）
34. **lint**: AIコース側 **0**（残はバドミントン側レガシーのみ・従来基準維持）
35. **staging**: deploy b7f82110・実画面検証 evidence/staging-smoke.md
36. **persona A**: staging実走PASS（N2維持・基礎補強・降格語なし）
37. **persona B**: ユニットテスト固定（N3目的地＋foundation bridge・N2混入なし）
38. **persona C**: ユニットテスト固定（会話開始地点N3エリア・JLPT stageなし・知識否定なし）
39. **persona D**: ユニットテスト固定（hybrid合流）
40. **persona E**: ユニットテスト固定（5分構成・会話goalは試験バトルなし）
41. **P0**: 0
42. **P1**: 0（発見2件は修正済み: 単元バトル空プール／結果表示と記録の不一致。詳細 evidence/staging-smoke.md）
43. **P2/P3**: P2-a 読解・聴解・並べ替え等の専用問題タイプが薄い（読解はvariant流用・聴解は未実装=未判定表示で正直運用）／P2-b AI会話ミッションの実会話実走は未監査（既存runtime自体はPilot検証済み）／P2-c 言い直しstepは素材0時チェックのみ。P3-a 診断の会話診断はテキスト2問のみ（voice任意は未実装）／P3-b 相棒の声掛けバリエーションが各1種
44. **RC tag candidate**: `ai-course-adventure-v2-rc1`（本commitに付与・既存tag非上書き）
45. **CEO staging check URLs**: `https://staging.badminton-platform.pages.dev/ja/ai-course?v2=1`（zh: `/zh/ai-course?v2=1`）。ログイン後にopt-in→オンボーディング。従来に戻すボタンあり
46. **remaining work**: 上記P2/P3＋N5/N4/N1教材（今回範囲外）＋human_reviewed昇格（人間ゲート）＋本番反映判断
47. **exact resumeFrom**: work-queue全complete。次はCEO staging確認→フィードバック反映サイクル（next-session-prompt.md）
