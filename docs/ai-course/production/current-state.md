# 自律制作セッション 現在地（2026-07-29・session-12終了時点）

新しいセッションはまずこのファイルと `autonomous-loop-state.json` を読むこと。

## いまどこにいるか

- **FOREST FIRST（F1〜F10）完了済み**。Whole Product Complete on Staging = YES（whole-product-completion-matrix.md）
- **session-12（2026-07-29）**: 72fd19dをstagingへ反映し、認証済みlearner実画面で
  Journey A〜I・全10エリア・N3全12単元・N2 180項目（173+7）を確認。
  実画面で見つけたP1 3件（試作バッジ／N3診断「まだ習っていない」行き止まり／（仮称）表示）を修正
- 保全branch: `backup/forest-first-f10`（72fd19d）
- ブランチ: `feature/ai-course-learning-polish`／テスト1068／main bundle 589KB／staging反映済み（deploy 61864808）
- N2恒等式: completeDraft 173 + humanDecisionRequired 7 = 180（learner表示180）

## 次にやること

- `next-production-hardening-plan.md` の **Phase H1（Docker導入後のlocal DB実証）** から
- 人間ゲートは H3（CEO教材/ビジュアル/世界名承認・法務・実機・support送信先）
- 品質深掘りは H4（G2監査・deferred-polish-backlog.md P2-1〜P2-15）
- Unit 8制作へ戻らない（過去レポートの「N2 99件・tests 911」はREPORT_ONLY_STALE）

## 不変の原則

- 未完成は隠さず完成させる（非表示化の例外は権利・法務・内部監査のみ）
- 単一集計・手計算禁止（`generated/*.json` が唯一の情報源、同期ガードテストあり）
- human_reviewed/approved昇格・権利最終判断・共有Supabase/migration/RLS・本番/mainは人間のみ
- 監督ループ: 完了報告→再集計→<AUTONOMOUS_REVIEW>→<NEXT_PHASE_PROMPT>→Validator→意味検証→実行
- ブラウザ操作・ChatGPT入出力の鉄則はメモリファイル `ai-course-autonomous-loop` 参照
