# 内部権限（entitlement）／RLS 判断パケット

作成: 2026-07-28 ／ 状態: **草案。共有Supabaseへは一切適用していない。**

---

## 1. いま何が問題か（確認済みの事実）

- 内部権限（labPreview＝ことば図鑑・しくみラボ・判断キュー等の入口）は
  `ai_learners.admin_overrides`（jsonb）に入っている
- `ai_learners_update` policy は **本人による自分の行の全列更新を許している**
  （`using (user_id = auth.uid() or ai_is_admin())`・列制限なし）
- つまり**一般learnerが自分で admin_overrides を書き換えれば内部画面を開ける**（権限昇格）
- クライアント側は `hasLabPreview(learner.adminOverrides)` で判定しており、
  サーバー側の強制がない

## 2. 3案の比較

| 観点 | 案A: 専用entitlementテーブル | 案B: Security Definer RPC＋更新列制限 | 案C: admin_overrides維持＋更新経路分離 |
|---|---|---|---|
| learner本人の書き換え | **構造的に不可能**（write policy自体を作らない） | policy/trigger次第（列比較triggerが必要） | jsonbの部分比較が必要で漏れやすい |
| 権限の個別制御（labPreview / internalReview / decisionConsole / contentReviewer） | **列で個別に持てる** | jsonbのまま（構造なし） | jsonbのまま |
| 期限付き付与（expires_at） | **列で自然に表現** | 追加実装 | 追加実装 |
| 誰がいつ付与したか（granted_by/at） | **列で自然に表現** | 追加実装 | 追加実装 |
| 既存コードへの影響 | 読み込み1箇所の差し替え（hasLabPreview→entitlement取得） | 更新経路の全書き換え | 最小 |
| 監査のしやすさ | 高（1表を見れば全権限が分かる） | 中 | 低（学習設定と権限が同居） |
| リスク | 新テーブル1つ増える | RPCの実装ミスがそのまま権限昇格になる | **jsonb比較の抜けが権限昇格になる**（現状の問題の温存） |

## 3. 推奨: **案A（専用テーブル）＋ ai_learners側の穴も塞ぐ**

理由:
1. 「learner本人が権限を書き換えられない」を **policyの不存在**で保証できる
   （案B/Cは「正しく実装された比較ロジック」に依存し続ける）
2. CEO要件（個別制御・期限・付与記録・read-only）がすべて**列**で自然に表現できる
3. 読み込み側の差し替えは小さい（labPreview判定の1関数）

**案Aだけでは不十分な点**: entitlementsを分離しても、`ai_learners_update` が全列更新を
許したままだと admin_overrides の別用途（nextMissionId等の管理者指定）を本人が書き換えられる。
併せて **ai_learners の update policy に列制限**（trigger方式: admin_overrides の変更は
service_role/adminのみ許可）を入れる。これは案Bの技法を「防御の二層目」として使うもの。

## 4. 成果物（作成済み・未適用）

- migration草案: `supabase/migrations/20260728010000_ai_course_entitlements.sql`
  - `ai_course_entitlements`（learner_id PK・4権限列・granted_by/at・expires_at）
  - learner本人は **select のみ**（insert/update/deleteのgrantもpolicyも無し）
  - 書き込みは service_role のみ
  - 既存 labPreview フラグの移行insert（admin_overridesは**変更しない**。削除は動作確認後の別migration）
- rollback: 草案末尾に記載（`drop table if exists public.ai_course_entitlements;`）

## 5. クライアント側の移行方針（適用承認後）

1. `hasLabPreview(adminOverrides)` の呼び出し元を `entitlements.lab_preview` 参照へ差し替え
2. **取得失敗時は安全側へ閉じる**（entitlement不明＝権限なし。今のadminOverrides参照はfallbackにしない）
3. 内部画面のlazy chunkは entitlement 確認後にのみ import（URL直打ちでchunkを読ませない）
4. sessionStorage/localStorage だけで権限判定しない（毎セッションDBから取得）
5. 「初回学習を安全に試す」（検証モード）は `internal_review` へ紐づけ、一般利用者には
   入口非表示・chunk非読込・analytics非送信とする（§9対応。現在はlabPreviewのみで守っている）

## 6. 段階計画

| 段階 | 内容 | 誰が |
|---|---|---|
| 1 | 本パケットの案A承認 | **CEO** |
| 2 | shadow DBでmigration＋rollback往復のdry-run | AI |
| 3 | 共有DBへ適用（立ち会い推奨）＋shocchan learnerのみで動作確認 | **CEO承認のもと** |
| 4 | クライアント差し替え（読み込み・chunk gate・検証モード）→staging→CEO確認 | AI |
| 5 | admin_overridesからlabPreviewを外す別migration | **CEO承認のもと** |

## 7. 今回やっていないこと

migration適用・RLS適用・admin_overrides変更・learnerデータ変更: **なし**。
