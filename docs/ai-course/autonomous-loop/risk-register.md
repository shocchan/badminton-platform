# リスク台帳（自律ループ・各Phaseでレビュー）

| riskId | 内容 | severity | status | mitigation | humanDecisionRequired | firstDetected | lastReviewed |
|---|---|---|---|---|---|---|---|
| R1 | fi-namae 例文（王姓の読み・姓名範囲）P0未解決 | high | open | レビュー画面P0表示・修正案提示済み | yes | 2E-1.5 | 2E-1.6 |
| R2 | cognate分類のAI不一致11語（nihongo/yasui/genki/soudan/zenzen/yakusoku/kyoumi等） | medium | open | unreviewed維持・不一致理由をdocs化 | yes | 2E-1.5 | 2E-1.6 |
| R3 | role提案（基礎会話トラックoptional→diagnostic約40語）未決 | medium | open | 未適用・提案として記録 | yes | 2E-1.5 | 2E-1.6 |
| R4 | モバイル実表示（320-768px）の目視監査未実施 | medium | open | jsdomテスト＋DOM配線検証でカバー。非フルスクリーン時に実施 | no | 2E-1.5 | 2E-1.6 |
| R5 | 画像8枚未生成（対比4・場面4）→該当語はplaceholder | low | open | planned assetとして管理・404なし | no | 2E-1.5 | 2E-1.6 |
| R6 | human required教材15語が未確定のまま蓄積 | medium | open | Decision Console候補・decision packet整備 | yes | 2E-1.5 | 2E-1.6 |
| R7 | ChatGPT提案の無検証実行によるガードレール violation | high | mitigated | validator＋意味検証＋抽出マーカー限定・§52手順 | no | 2E-1.6 | 2E-1.6 |
| R8 | 自律ループの暴走（無限ループ・費用超過） | high | mitigated | 最大5ループ/8h・品質ゲート・state.json記録 | no | 2E-1.6 | 2E-1.6 |
