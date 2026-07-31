# Gate① 維持検証（read-only・2026-07-31）

適用時（2026-07-30）の記録と、リリース直前の実測が一致するかだけを確認した。
**remote write は一切行っていない**（`remote-sql.mjs` の write判定 `write=false`・sha256記録あり）。

実行: `node scripts/ai-course/remote-sql.mjs --file /tmp/gate1-recheck.sql --label "gate1 integrity recheck (read-only)"`
結果: `# OK ... write=false sha256=fbf7972115476408`

| 検査 | 実測 | 適用時の記録 | 判定 |
|---|---|---|---|
| migration history 行数 | 17 | 14 → 17（duplicates 0） | 一致 |
| 期待3migrationの存在 | 3 | 20260728000000 / 20260728010000 / 20260729000000 | 一致 |
| RLS有効テーブル | 43 | （5は今回追加分） | 整合 |
| public policies | 89 | （11は今回追加分） | 整合 |
| definer関数 with search_path | 28 | （2は今回追加分） | 整合 |
| ai_learners 行数 | 1 | 1 | **一致** |
| ai_item_progress 行数 | 12 | 12 | **一致** |
| ai_learning_sessions 行数 | 24 | 24 | **一致** |
| fixture（`%.invalid`）残存 | 0 | 撤去済み | **一致** |

baseline に予期しない行変化なし・fixture残存0。**新規FAILなし → Gate① COMPLETE を維持**。

注: 前回作成のSQLは表名を `ai_learner_item_progress` と誤っていた（実際は `ai_item_progress`）。
実表名で再実行して上記を取得した。誤った表名のまま「PASS」にはしていない。
