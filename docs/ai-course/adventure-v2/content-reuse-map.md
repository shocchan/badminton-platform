# Adventure V2 — 教材再利用マップ（§17）

分類: KEEP=そのまま / REMAP=V2構造へ役割再割当 / REWRITE=作り直し / HOLD=今回触らない。
humanReviewState は全教材 draft / human_review_candidate のまま変えない（昇格は人間のみ）。

## 教材ソース別

| sourceType | sourceId範囲 | 件数 | level | V2での用途 | 分類 |
|---|---|---|---|---|---|
| N2文法draft | n2g-001〜180（alias 2除く） | 178 | N2 | target grammar / exam enemy / conversation transfer / review | **KEEP**＋variant生成で問題拡張 |
| N2 aliases | n2g-024→023, 104→102 | 2 | N2 | 進捗引き継ぎのみ（canonicalN2GrammarId） | KEEP |
| N3文法draft | n3g-*（4バッチ） | 76 | N3 | target grammar / bridge / exam enemy / review | **KEEP**＋variant生成 |
| 語彙 foundation | fi-*（UNIT1〜6） | 78 | 基礎 | base reinforcement / 診断第1戦 / boss素材 | KEEP |
| 語彙 N3prep | n3-* 62語 | 62 | N3 | N3橋 / 診断 / conversation transfer | KEEP |
| N3単元 | n3u-01〜12（specs） | 12 | N3 | N3実践ミッション / 単元バトル | **REMAP**（routeStageへ所属付け） |
| N3単元生成問題 | buildUnitQuestions | 608 | N3 | 通常敵/診断プール | KEEP（選択制御をV2側で追加） |
| 会話context | 140語ぶん | 140 | 会話 | AI会話ミッション / 転用練習 | KEEP |
| 60ミッション | courseData.ts 12週×5 | 60 | 会話 | 従来コース（legacy Home） | **HOLD**（V2はクエスト生成で代替・削除しない） |
| Chapter 1〜10 | rpg/chapters | 50 quests | 物語 | 冒険演出・エリア開放 | KEEP（V2 routeの経由地演出として参照） |
| World 10エリア | worldAtlas | 10 | — | Map・現在地/目的地表現 | **REMAP**（下表） |

## エリア → V2 route役割（実データ整合済み。名称は仮称のまま＝human_review_candidate）

| area | 実コンテンツ | V2 route役割 |
|---|---|---|
| area01 ミナト | n3u-01 | 基礎キャンプ（foundation） |
| area02 ヒノデ台 | n3u-02, 05 | 基礎キャンプ |
| area03 オウライ街道 | n3u-03 | 基礎→N3橋 |
| area04 イチバ通り | n3u-04 | 基礎→N3橋 |
| area05 ユカリの森 | n3u-06, 07 | N3実践（感情・人間関係） |
| area06 ハタラキ街 | n3u-09, 10 | N3実践（仕事・会話転用の主エリア） |
| area07 カタチの遺跡 | n3u-08, 11, 12 + N3文法76 | N3文法攻略（N2の門の手前） |
| area08 ソラノ塔 | N2 178 | **N2攻略の最終目的地** |
| area09 カタリ港 | 会話context 140 | 会話ルートの主エリア（会話開始地点） |
| area10 オモイデ庭園 | 復習 | 復習（全ルート共通・経由地扱いにしない） |

仕様§11の推奨候補「N3=ユカリの森・ハタラキ街／N2=カタチの遺跡・ソラノ塔」は実コンテンツと
不一致（カタチの遺跡はN3単元8/11/12＋N3文法の座）のため、**実態に合わせて上表を正とする**（D-002）。

## 問題プールの状態区分（§18）

- `authored`: recognition 254問（N2 178 + N3文法 76）… G2監査済（漏洩0・複数正解0）→ validated_beta 扱い
- `generated_runtime`: N3単元 608問（決定的生成・G2監査済）→ validated_beta 扱い
- `generated_draft`: V2 variant生成分（新規）→ 機械検査PASSで validated_beta へ。
  human_review_candidate 昇格は別途。**Pilot learnerへ出すのは validated_beta 以上のみ**
