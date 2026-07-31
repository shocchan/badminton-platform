# Adventure V2 — staging実画面検証（2026-07-31）

環境: https://staging.badminton-platform.pages.dev ／ 最終deploy `b7f82110`（V2 branch build）
fixture: `stage-verify-session.mjs` の合成learner（.invalidドメイン・is_test）。
**検証後に撤去済み**（cleanup 200・前後count: auth_users=5 / learners=1 で原状一致）。

## 実施フロー（Persona A: N2目標×現在地 基礎の入口）

| # | 確認 | 結果 |
|---|---|---|
| 1 | 既存learnerへの非影響: flag無し状態で従来Home表示 | PASS（V2は`?v2=1`が無い限り一切出ない） |
| 2 | `?v2=1` opt-in画面（ja）→ 冒険を始める | PASS |
| 3 | goal選択（3種表示）→ JLPT → N2選択（N5/N4/N1は「今後追加」表記） | PASS |
| 4 | 受験日 2026-12-06 → 週5日/15分 → 相棒3種（自前SVG表示）→ フク老師 | PASS |
| 5 | 診断12問（実プール出題・「わからない」対応）＋会話サンプル入力 | PASS |
| 6 | ルート提示: **目的地N2・ソラノ塔維持／現在地「基礎の入口」／「N2を攻略するために…目的地はN2のまま変わりません」** | PASS（§5） |
| 7 | 今日の冒険Home: 第一CTA一つ・所要12分・why・成功条件・試験まで129日 | PASS（§12/§13） |
| 8 | 問題バトル（通常敵・基礎キャンプ 7問・実単元問題・解説・スキップ=誤答） | PASS |
| 9 | バトル結果 = 記録一致（表示43% / 記録43%・未出71% / 0.71） | PASS（下記P1-2修正後） |
| 10 | mastery: 80%達成日 0/3・「1回では攻略にならない」表示 | PASS（§15） |
| 11 | step完了✅がprofile保存され**reload後も復元**（deploy跨ぎ・`?v2=1`なしでV2復帰） | PASS（server sync） |
| 12 | 攻略マップ: 目的地/攻略率/📍現在地/全stage挑戦可（ロック無し） | PASS（§21） |
| 13 | 合格準備度: 語彙38%(暫定)・文法/読解/聴解/時間配分=未判定＋理由・総合未判定・保証しない文 | PASS（§16） |
| 14 | zh切替: 全文中国語（天空塔gloss・改口练习 等） | PASS |
| 15 | mobile 375px: 横overflow 0px・42px未満ボタン0 | PASS |
| 16 | 従来ホームへ戻す → 既存World Home完全表示（データ保持） | PASS（§23） |
| 17 | console error | 0件 |

## 実画面で発見→即修正したP1（回帰ガード済み）

1. **P1-1: 単元(unitId)対象のバトルが空**（プールが文法のみだった）
   → advContentで単元問題608問をバトルプール化（`u<dimension>:`キー・診断と共有）。
   回帰テスト: advBridge.test.ts「単元にもバトルプールがある」
2. **P1-2: バトル結果表示が記録と不一致（0%表示）**
   → onFinish→保存→再レンダーで新seenKeysにより編成が再構築されるのが原因。
   編成をmount時にuseStateで凍結＋battle keyで分離。再battleで表示=記録一致を実測確認。

## 未実施（正直な残置・理由つき）

- AI会話ミッションの**実会話実行**（音声/実LLM）: マイク・課金を伴うため本監査では導線接続のみ確認。
  既存会話runtimeは本番Pilotで検証済み（変更なし・§19遵守）
- Persona B/C/D/E のstaging実走: ユニットテストで固定（advCore/advQuest）。実走はPersona Aのみ
- 言い直しstep実走: 新規learnerは素材0のためチェックのみ
- analytics実発火: gtag非存在環境では送信しない設計のため画面では未確認（実装はcourseAnalytics委譲）
