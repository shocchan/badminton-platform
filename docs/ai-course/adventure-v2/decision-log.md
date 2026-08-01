# Adventure V2 — Decision Log（合理的既定値の記録・§26）

| ID | 決定 | 理由 |
|---|---|---|
| D-001 | V2 branch base = hotfix tip `2795685`（origin/main + staging検証済UX修正2commits） | origin/main直ベースだとUX-001(P1)修正等を失い将来衝突。hotfixはAIコースUX修正のみで安全 |
| D-002 | エリア役割は実コンテンツ整合を優先（N2=ソラノ塔のみ。カタチの遺跡はN3文法の座） | §11「名称だけで無理に割り当てない」。worldAtlas実データがN3単元8/11/12をarea07に持つ |
| D-003 | V2 profile は `ai_learners.settings`(jsonb) 内 `adventureV2` キーに保存（新テーブルなし） | §9の段階実装許容。remote migration禁止下で reload/server sync 既存経路が使える。将来の正規化手順は db-normalization-plan.md に記載 |
| D-004 | feature flag = `settings.adventureV2.enabled`（learner単位・既定false）＋ 設定画面で本人切替可 | §2優先案そのまま。既存learnerは従来Homeのまま。V2→従来へ戻ってもデータ非破壊 |
| D-005 | goalType 内部値 = `jlpt` / `conversation` / `hybrid`（新設。既存schemaに該当命名なし） | §4の候補どおり |
| D-006 | 目標レベル enum = `N5 N4 N3 N2 N1` を型に持ち、選択UIには N3/N2 のみ表示 | §5。将来追加はUI解放のみで済む |
| D-007 | 文法バトルのvariant生成は**決定的（seed付き）純関数**＋機械validatorで、実行時LLM生成はしない | §18 P0（漏洩/複数正解）をテストで0保証するため。LLM生成はhuman_review前提になり1週間MVPに不適 |
| D-008 | variant distractor は similarPatterns・同義族を除外したプールから採る | G2で複数正解22件を修正した教訓。同義除外が複数正解の主対策 |
| D-009 | 読解=既存例文の連結短文＋内容一致（生成）、聴解=TTS不使用のため**「文字での会話理解」型で代替**し、UI上「聴解」と表示しない（readiness上は listening=データ不足の暫定扱い） | 音声合成の新規導入は1週間MVP範囲外。§10「診断不能な項目を推測で高精度表示しない」に従う |
| D-010 | 相棒3種はオリジナルSVG新規作成（会話型ナミ/知識型フクロウ博士/実践型カジ、名称は仮称=human_review_candidate） | 既存キャラasset（翔子先生・ゆい先生）は講師役で相棒と役割衝突。§8禁止事項を回避した軽量SVG |
| D-011 | 診断のAI会話戦は既存 text会話runtime（courseChatTurn）を1〜2往復で使用。voice診断は初回MVPでは任意ステップ（skippable） | マイク許可が初回onboardingの離脱点になるため。§10「可能なら話す」の範囲内 |
| D-012 | 「時間配分」readinessは中ボス/ランクボス（制限時間つき）の実測のみから算出。データ無しは「未判定」 | §16 誠実表示。無データで高精度表示しない |
| D-013 | 人間レッスンbridgeはprofile内 `humanLesson`（nextHumanLessonAt / teacherFocusNotes / lessonPrepSummary）＋管理画面表示。カレンダー連携なし | §20の指示どおり |
| D-014 | XHS関連機能なし。分析は既存 courseAnalytics（匿名イベント）へ§24イベントを追加 | 全社ルール0・§24送信禁止項目の遵守 |
| D-015 | 先生別realtime音声の変換は **Edge Function 側の allowlist のみ**（`TEACHER_VOICE = { shoko: 'marin', yuto: 'cedar' }`）。クライアントは teacherId しか送らない | 任意のvoice文字列を受け取ると未対応値・第三者音声を注入されうる。クライアント側の写し（`CANONICAL_TEACHER_VOICE`）はテストがEdge Functionのソースを読んで一致を固定 |
| D-016 | 先生名・話し方（ペルソナ1文）もサーバー側 `TEACHER_PERSONA` で決める。`voiceTutorPrompt.ts` の「翔子先生」ハードコードは廃止 | 画面が悠斗先生なのにAIが「翔子先生です」と名乗る不整合を消すため。教材・出題・難易度・レベル判定は teacherId で一切変えない |
| D-017 | `effectiveVoice`（marin / cedar）は **analyticsへ送らない**。検証はサーバーログと `generated/teacher-voice-smoke.json` で行う | どのTTS音声かはlearnerの学習計測に不要な内部運用情報。§19の「不適切ならserver-side diagnosticのみ」に従った |
| D-018 | 悠斗先生の `voiceSwitchAvailable` は **false のまま据え置き**、ja/zhの注意書きも残す | staging と production が同一Supabaseプロジェクト（`jdkwijdphlkrcoiggfqw`）を共有しており、`ai-lesson-token` のデプロイは **production Edge Function deploy に等しい＝禁止事項**。実音声smokeを実走できていない以上、「切り替わる」と表示してはならない（§7・§27） |
| D-019 | 先生変更時は既存realtime sessionを `stop()` で正常終了してから新規sessionを作る（依存は `teacher.id` のみ） | 音声は session 作成時に確定するため、生成済みsessionのvoiceは差し替えない。言語切替（§4のmount1回設計）では発火させない |
