# 人間ゲートの evidence 台帳

**このファイルには、実際に確認された結果だけを書く。** 推測・例文・想定は書かない。

作成: 2026-07-31 ／ RC: `ai-course-content-rc1`（e85c3c8）

## COMPLETE

| ゲート | 確認日 | 確認者 | evidence |
|---|---|---|---|
| ① Remote DB・RLS・Server Sync | 2026-07-30 適用 / 2026-07-31 再照合 | AI（read-only） | `gate1-integrity-recheck.md`・`docs/ai-course/decisions/ceo-decisions-20260730.json` |
| ⑤ Backup・Monitoring・Rollback | 2026-07-30 | AI＋CEO承認 | `release-manifest-august-pilot.md`・rollback drill PASS |
| 認証済み staging smoke | 2026-07-31 | AI（合成fixture） | `authenticated-staging-smoke.md` |
| production preflight | 2026-07-31 | AI（read-only） | `production-preflight.md` |

## 未取得（CEOの入力・物理端末が要る）

| ゲート | 必要なもの | 現状 |
|---|---|---|
| ② 実機確認 | iPhone/Android/VoiceOver/TalkBack の実結果 | `device-check-packet.md` に記入なし |
| ③ 法務 | 事実14項目（`src/lib/aiLesson/course/legal/legalFacts.ts` の null） | 未回答。ページ実装側は完了 |
| ④ 公開教材範囲の人間確認 | 公開する教材範囲の目視結果 | repo内に記録なし |
| 本番リリース承認 | `APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE` | 未受領 |

## CEO最終入力の受領記録（2026-07-31）

**CEO本人による正式入力。回答例・仮入力ではない。** 承認文字列を同時受領。

### 実機（D01〜D34）
| 項目 | 値 |
|---|---|
| CEO回答 | **DEVICE_ALL_PASS** |
| evidence source | CEO本人メッセージ（実施済みの報告） |
| recordedAt | 2026-07-31 |
| HEAD（記録時） | `3988f58` 直前（法務反映commitの親） |
| CEO confirmation | 「これはCEO本人による正式な最終入力です。回答例や仮入力ではありません。」 |
| 判定 | D01〜D34 を **CEO確認済みPASS** として一括記録。FAIL申告なし |

### 教材目視（C01〜C11）
| 項目 | 値 |
|---|---|
| CEO回答 | **CONTENT_REVIEW_PASS** |
| 対象 | Pilot公開範囲 |
| recordedAt | 2026-07-31 |
| P0 / P1 | 0 / 0 |
| 注意 | 教材の `human_reviewed` / `approved` は**一括更新していない**。Pilot公開範囲のevidenceとしてのみ使用 |

### 本番環境（E01〜E20）
| 区分 | 確認 | 結果 |
|---|---|---|
| 自動検証（E03/E04/E05/E12/E16/E17） | `npm run validate:ai-course-env` | **P0 FAIL 0 / P1 FAIL 0**（クライアント鍵 `role=anon` 実確認・秘密露出0件） |
| 人間のみ（E01/E02/E06/E08/E19/E20 ほか） | CEO **ENV_ALL_VERIFIED** | `VERIFIED_PRESENT` として記録 |

### 法務14項目
| 区分 | 内容 |
|---|---|
| 一括承認 | **LEGAL_RECOMMENDATIONS_APPROVED**（L02〜L08・L10・L11・L13 の10件） |
| CEO個別入力 | L01 `kawabado 安田翔` ／ L09 保存期間 ／ L12 `13` ／ L14 準拠法・さいたま地裁 |
| 補足方針 | 18歳未満は保護者が契約者となるか保護者の同意を得る。13歳未満は対象外 |
| 実装 | `LEGAL_PUBLISH: true` ／ `npm run validate:ai-course-legal` **PASS** |

### 本番リリース承認
| 項目 | 値 |
|---|---|
| 承認文字列 | **APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE**（完全一致で受領） |
| 受領日時 | 2026-07-31 |
| 範囲 | **3名限定 Pilot Release**。一般公開・learner招待は含まない |

---

## CEO一括回答の取り込み欄（様式）

CEOから一括回答を受け取ったら、**ここに転記してから**先へ進む。
この表が埋まっていない状態を「確認済み」として扱わない。

### 実機（D01〜D34）

| 項目 | 値 |
|---|---|
| CEO回答 | `（DEVICE_ALL_PASS または DEVICE_FAIL：…）` |
| evidence source | CEOメッセージ（本人の実施報告） |
| recordedAt | `（記録日時）` |
| HEAD | `（記録時のHEAD）` |
| CEO confirmation | `（受領した文言をそのまま）` |
| 判定 | `DEVICE_ALL_PASS` なら D01〜D34 を CEO確認済みPASS として一括記録 |

### 教材目視（C01〜C11）

| 項目 | 値 |
|---|---|
| CEO回答 | `（CONTENT_REVIEW_PASS または CONTENT_REVIEW_FAIL：…）` |
| 対象 | Pilot公開範囲 |
| recordedAt | `（記録日時）` |
| HEAD | `（記録時のHEAD）` |
| P0 / P1 | `0 / 0`（FAIL申告がない場合） |
| 注意 | **教材の human_reviewed / approved は一括更新しない。** Pilot公開範囲のevidenceとしてのみ使う |

### 本番環境（E01〜E20）

| 区分 | 確認者 | 記録 |
|---|---|---|
| 自動検証可（E03/E04/E05/E12/E16/E17） | `npm run validate:ai-course-env` | 実行結果を貼る（現時点 P0 0 / P1 0） |
| 人間のみ（E01/E02/E06/E08/E19/E20 ほか） | CEO | `ENV_ALL_VERIFIED` を受領した場合に `VERIFIED_PRESENT` として記録 |
| CEO回答 | | `（ENV_ALL_VERIFIED または ENV_FAIL：…）` |

### 本番リリース承認

| 項目 | 値 |
|---|---|
| 承認文字列 | `（APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE を完全一致で）` |
| 受領日時 | `（記録日時）` |

---

## 注意（過去の取り違えを防ぐため）

`device-check-packet.md` の末尾にある「A1〜A8 PASS / A9 FAIL / C3 FAIL」は
**回答のしかたを示す例**であって、CEOの確認結果ではない。
実際の結果は、このファイルの表に日付・確認者つきで記録されたときにだけ有効とする。
