# 人間ゲートの evidence 台帳

**このファイルには、実際に確認された結果だけを書く。** 推測・例文・想定は書かない。

作成: 2026-07-31 ／ RC: `ai-course-content-rc1`（e85c3c8）

## COMPLETE

| ゲート | 確認日 | 確認者 | evidence |
|---|---|---|---|
| ① Remote DB・RLS・Server Sync | 2026-07-30 適用 / 2026-07-31 再照合 | AI（read-only） | `gate1-integrity-recheck.md`・`decisions/ceo-decisions-20260730.json` |
| ⑤ Backup・Monitoring・Rollback | 2026-07-30 | AI＋CEO承認 | `release-manifest-august-pilot.md`・rollback drill PASS |
| 認証済み staging smoke | 2026-07-31 | AI（合成fixture） | `authenticated-staging-smoke.md` |
| production preflight | 2026-07-31 | AI（read-only） | `production-preflight.md` |

## 未取得（CEOの入力・物理端末が要る）

| ゲート | 必要なもの | 現状 |
|---|---|---|
| ② 実機確認 | iPhone/Android/VoiceOver/TalkBack の実結果 | `device-check-packet.md` に記入なし |
| ③ 法務 | 事実14項目（`legalFacts.ts` の null） | 未回答。ページ実装側は完了 |
| ④ 公開教材範囲の人間確認 | 公開する教材範囲の目視結果 | repo内に記録なし |
| 本番リリース承認 | `APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE` | 未受領 |

## 注意（過去の取り違えを防ぐため）

`device-check-packet.md` の末尾にある「A1〜A8 PASS / A9 FAIL / C3 FAIL」は
**回答のしかたを示す例**であって、CEOの確認結果ではない。
実際の結果は、このファイルの表に日付・確認者つきで記録されたときにだけ有効とする。
