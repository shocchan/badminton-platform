# 招待別計測（2026-09-13）

管理画面: https://kawabado.com/ja/ai-course/admin?tab=ops
「招待リンク別の閲覧・登録」。開始日時は日本時間、既定は2026-09-13 19:00。更新ボタンで再集計。

- 保存先は既存 `ai_funnel_events`。invite_code / landing_page / session_id / event_id を追加。
- anon_id は既存ブラウザIDを再利用。session_id はページ来訪ごとのUUID。再読み込みは新しい閲覧、StrictModeは重複排除。
- first_visited_at = 同じ招待コード・anon_id の invite_page_view の最小 occurred_at。
- registration_started_at = invite_registration_started の occurred_at（入力条件を満たした申込送信時）。再送は同一来訪で1件。
- registration_completed_at = サーバーで受講権＋案内メール記録を確認した invite_registration_completed の occurred_at。user_idはサーバーのみ設定可能。
- 登録完了件数には既存 ai_course_access と ai_course_mail_log の履歴も含む（送信時刻で期間絞り込み）。is_testの学習者と招待コードを除外。
- CVR = 指定期間に観測できた訪問者のうち登録完了した匿名ID数 / 観測できた匿名ID数。計測前の登録は分子に混ぜない。分母0は未算出。
- 閲覧・登録開始は計測前のデータを復元できない。ブラウザを跨ぐ同一人物は重複し得る。計測拒否・通信障害は未記録になる。
- UTMは既存 captureTouch のブラウザ保存を維持。今回の追加イベントにはメール・WeChat・IP・完全URLを保存しない。
- 検証環境は自動is_test。`invite_test=1`もテスト印。`notrack=1`は既存通り送信停止。
- 集計RPCは管理者のみ。匿名から登録完了送信は拒否。既存ユーザー行・登録フローの権利判定は変更しない。

既存調査: GA4設定 G-YMTSZRQWJ3。招待の既存GAイベントはlangのみ。通常page_viewのURLで追える可能性はあるがGA4閲覧認証未接続。Cloudflareの公開HTMLにはWeb Analytics beaconなし、RUM一覧APIは403。Supabaseの旧funnelには招待イベントなし。
エリさん: E69APBEW（本番 ai_course_invites.label で確認）。

検証: node scripts/invite-analytics-test.mjs、招待ページ/紹介特典/既存計測/追加計測のテスト30件、TypeScript build。
戻す場合: 今回のフロントとEdge Function変更をgit revertし、正規deployスクリプトを使用。DB追加列は残しても従来コードに影響しない。履歴を失うためテーブルは削除しない。
