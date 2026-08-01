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
| D-020 | 語彙の最終状態を **`active_beta` / `excluded_from_core` の2つだけ**にし、`needs_human_review` を全廃 | 「保留」を残すと未完了が永久に積み上がる。教材化できない見出しは理由（`VocabExclusionReason` 8種）を型と文章で残して CORE から外す＝どちらに倒したかが必ず説明できる状態にする |
| D-021 | active_beta には `explanationJa` / `explanationZh` を必須にし、`toSenseRecord()` が必須10項目を機械検査する | 「訳と例文だけ」では学習者が使い方を判断できない。既存686語にも遡って backfill した |
| D-022 | 選択問題が2問未満の語は CORE から外す（`question_unbuildable`） | 1問しか作れない語を無理に水増しすると、語尾や長さで当てられる問題が混ざる。実測で外したのは45語 |
| D-023 | 同音異表記が密集する語群（点く/付く、計る/図る/量る 等）は最も基本的な1語だけ active にする | 表記問題の誤答をactive語から選ぶ設計のため、同読みの別表記が複数activeだと**正解が2つ**になる |
| D-024 | Edge Function は teacherId を**明示送信したリクエストにだけ**話し方の方針を足す | 共有Supabaseのため production frontend も同じ関数を使う。旧クライアントの instructions を1バイトも変えないための後方互換策。実APIで marin 継続を確認した |
| D-025 | 教材データ（層C語彙・読解・聴解）を `manualChunks` で画面コードから分離 | AdvShell が gzip 568kB まで膨らみ、UIを1行直すたびに教材ぜんぶを再取得させていた。分離後 AdvShell は 43kB。初回総量は変わらない（静的importのため）ので、動的import化はP2として残す |
| D-026 | 一時QA learner は `.invalid` ドメイン＋`temporary_qa` メタデータで作り、作業後に削除して前後件数を照合 | 実learnerへ誤配信・誤削除しないため。orphan行が残っていないことも機械確認した |
| D-027 | `docs/ai-course/PRODUCT_CANON.md` を最上位のプロダクト判断基準として制定。実装・AI作業promptはこれを参照する | 機能仕様が増えるほど「何のための機能か」がぶれる。中核（目的地は本人／現在地はAI／今日の一歩はAI）と絶対原則18を1か所に固定し、迷ったらここへ戻る |
| D-028 | 中断した模試があるときは**模試の再開を唯一の主要CTA**にし、今日の冒険は副次スタイルへ落とす | 残り時間が動いているのは模試のほうなので優先度が高い。主要CTAを2本並べない（原則3） |
| D-029 | 週のまとめは、2週続けて各10問以上の記録が無い技能を **deltaPct=null＝未判定** として出す | 3問で50%→100%を「伸びた」と表示すると学習者を欺く。有料商品なので、盛るくらいなら未判定と書く（原則13） |
| D-030 | Pilot analyticsの日数・回数は `bucketOf()` で階級化して送る | 3名のPaid Pilotでは「7日連続」のような生の値がほぼ個人を指す。傾向を見るのに十分な粒度だけ残す |
| D-031 | 語彙の誤答除外を訳の完全一致から `glossTooClose()`（括弧補足を落とした語義の重なり）へ | 「学习」と「学习（有计划地学）」が別物と判定され、意味問題に**正解が2つ**入っていた（Pilotサンプル監査P0） |
| D-032 | 日中同形語（訳が日本語表記をそのまま含む語）は意味・用法・易混の観点を出さない | 「表示『温泉』的词是哪个？→ 温泉」のように、中国語の設問が答えをそのまま見せてしまう |
| D-033 | 読みの誤答は**実在する語の読み**からのみ採る。3つ集まらなければその観点を出さない | かなを1文字ずらす生成では「ふきゅぬ」のような非語が並び、日本語を知らなくても消去法で当たる（監査: reading観点38問中28問が機能せず）。数より測定妥当性を採る |
| D-034 | TTSの誤読は**読み上げ用テキストだけ**を置換して直す（画面の原稿は自然な表記のまま） | `十分`→じゅうぶん・`一日`→ついたち・`一行`→いっこう を実測で確認。原稿表記を変えると画面が不自然になるため、音声側だけ直す。前に数字が付く「三十分」は置換しない |
| D-035 | 層Cの語彙bank（gzip 323kB）は模試画面で動的importする | V2入場の転送が gzip 779kB→455kB（-42%）。語彙bankは模試でしか使わないのに、Homeを開くたびに読ませていた |
