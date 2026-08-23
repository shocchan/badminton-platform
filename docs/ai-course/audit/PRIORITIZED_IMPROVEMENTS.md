# 改善の優先順位（2026-08-23 実生徒監査）

分類: **P0**=商品価値・売上・安全性を壊す ／ **P1**=CVR・継続率・学習効果への影響大 ／ **P2**=質を上げるが開始を止めない

状態の凡例: ✅ staging反映・実測済み ／ ⏸ コード修正済み・**デプロイにCEO承認が要る** ／ ⬜ 未着手（提案）

---

## P0

### P0-1 ⏸ 会話後レポートが全件失敗している（`ai-lesson-report` 502）
- **Evidence**: curl で単独再現 `HTTP 502 {"error":"openai_error","status":400}`。DB実測で 8/23 の全5セッションが `corrections 0 / naturalPhrases 0`。8/15〜19 のセッションには `naturalPhrases 2` があり、以前は動いていた
- **Problem**: OpenAI structured output の strict モードは properties 全部を required に要求する。中国語補助2項目が required から外れていた（8/04 に `f011e44` で直った事故が、別ブランチだったため現行ブランチに入っていなかった）
- **Learner impact**: 会話しても「次に直すこと」「言い直し素材」が1件も返らない。商品の核が空
- **Business impact**: 600円体験パスの価値体験が成立しない＝アップセルが機能しない
- **Fix**: `achievementsZh`/`encouragementZh` を required に入れ、型に `null` を許す。＋**ソースを読んで「properties ⊆ required」を固定する回帰テスト**（`reportSchemaStrict.test.ts`）
- **Effort**: 済（デプロイ1コマンド）／**Risk**: 低（8/04と同一の修正）
- **Acceptance**: 会話を1本終えて `corrections` か `naturalPhrases` が実発話ベースで入る
- ⚠️ **要CEO承認**: `supabase functions deploy ai-lesson-report --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw`（staging と production が同一Supabaseのため production 変更）

### P0-2 ✅ 設定→「目的・レベル変更」が無限ローディング・出口なし
- **Evidence**: `evidence/A3-redo-entry-desktop.png`（本番で再現）
- **Problem**: 診断プール読込 effect の条件に `adjustOnboarding` が無い（8/20の調整モード追加時の配線漏れ）
- **Learner impact**: 目的・先生・相棒・ペース変更の**全入口が死亡**。リロード以外に出口なし
- **Fix**: effect条件へ追加＋ヘッダーのナビを調整モードの出口にする＋読込失敗画面に「元の設定のまま戻る」
- **Acceptance**: 設定→変更→目的選択画面が3秒以内に出る（staging実測OK）／回帰テスト3件

### P0-3 ✅ 調整モードで申告した級が保存されない
- **Evidence**: 更新直後のDB実測 `{"goal":"conversation","declared":null}`
- **Problem**: `finishAdjust` が outcome に `declaredJlpt` を載せていない。初期値も毎回 null
- **Learner impact**: N1保持者の会話が第1週「〜といいます」へ巻き戻る
- **Fix**: outcome に載せる＋保存済みの級を初期値として渡す
- **Acceptance**: 調整後のDBが `declared: "N1"`（staging実測OK）

### P0-4 ✅ 級を申告した人に「かなチェック（ひらがなを読めますか）」が出る
- **Evidence**: `evidence/S4-staging-home-after-conv-mobile.png`
- **Problem**: 以前の設定で立った `kana.needed=null` が、級を申告しても取り下げられない。quest生成も申告を見ていない
- **Learner impact**: 10万円商品として最も失礼な出し方
- **Fix**: 申告時に `needed:false` へ＋quest生成側でも申告があればかな系stepを作らない（二重）
- **Acceptance**: N1申告直後の今日の1手が AI会話（staging実測OK）／回帰テスト2件

### P0-5 ⬜ 購入者にパスワードが届かないケースがある
- **Evidence**: `ai-course-checkout` が Checkout を `customer_email` / `customer_creation` なしで作成。webhook はメールが無いと `no buyer email on session` をログに出すだけで**アカウントは発行済み**。完了ページはIDのみ表示しパスワードは出さない
- **Learner impact**: 支払ったのにログインできない・自力復旧不能
- **Fix案（要CEO判断）**: ① Checkout で確実にメールを取る ② 完了ページに「メールが届かない場合」の連絡先を出す ③ 初期パスワードを完了ページに出すか（セキュリティとのトレードオフ）
- **Risk**: 決済フロー変更のため要承認

### P0-6 ⬜ 中国語圏の主要決済手段が使えない
- **Evidence**: 8/21 実測で Stripe の `payment_method_types` は `card` のまま（Alipay/WeChat Pay は capability 未申請）
- **Business impact**: 小红书・微信からの流入が決済で落ちる。自動販売の前提が崩れる
- **Fix**: Stripeダッシュボードで有効化申請（**CEO作業**）。有効化後に `payment_method_options` を付ける（先に付けるとLinkが消える・実測済み）

---

## P1

### P1-1 ⬜ 語彙バトルの難易度が目標と噛み合わない
会話目標・基礎帯の学習者に N2 語彙（「教頭」「願書」）が出た。会話ルートの人が出会う語彙帯を、申告級／会話週から決める。

### P1-2 ⏸ AI会話が毎ターン質問を2つ出す
`reaction` に疑問文が入り `question` と合わせて2問。どちらに答えるか迷う。→ プロンプト規則＋**サーバー側で reaction の疑問文を機械的に落とすガード**を実装済み。**Edge Function デプロイ待ち**。

### P1-3 ⏸ AI会話がテーマへ誘導せず雑談で終わる
5ターン中、目標表現を使う場面が0回。→「遅くとも3ターン目までにテーマに合う具体的な状況を question の中で設定する」をプロンプトへ。**デプロイ待ち**。

### P1-4 ✅ 現在地の呼び名がホームとマップで食い違う／会話マップが第12週で途切れる
N1/N2申告者は現在地が地図に存在しなかった。→ 会話マップを18地域へ拡張（章「会話の旅4 上級の言い回し」追加）、ホームの現在地を地図と同じ週の場所名に統一、世界地図は現在地を含む12地域の窓で描画。級で飛ばした週は「已攻略」ではなく「按申报级别已通过」。

### P1-5 ⬜ ホーム画面に相棒が居ない
毎日見る画面に相棒が不在で「最初に選ぶ意味」が薄い。ホームの挨拶行に `CompanionAvatar` と一言を足す（教材・難易度は変えない現行方針は維持）。

### P1-6 ⬜ 成長実感が「今日」に偏っている
今日／今週／30日／**半年**の4段階に整理する。半年枠には `courseBeforeAfter`（実発話のみ・捏造しない仕組みが既にある）で「初日の自分 vs 今」を置くのが最も効く。表示を増やすのではなく並べ替える。

### P1-7 ✅ 完了画面の「解き直す問題なし」と錯題本の件数が食い違う
数の出所は変えず、差があるときは「解き直しに出せる問題はありません（ノートには6問。語彙バトルの誤答は同じバトルでもう一度出会います）」と正直に言う形へ。

### P1-8 ⬜ ログインできない人の復旧導線が無い
ログイン画面にパスワード再設定が無く、設定画面にしか「修改密码」が無い＝ログインできない人は到達できない。最低限「パスワードが分からない方は info@kawabado.com へ」をログイン画面に置く。

### P1-9 ✅ 計測の欠落（login / purchase_fail / trial_start成功 / first_adventure / upsell_dismiss）
5種を追加。`quest_completed` に `first` フラグを付け、初回とN回目を区別できるようにした。

### P1-10 ⬜ ファネルが1本で見られない
管理画面は「決済→発行→初回設定→会話開始→D1→D7」まで。前半（Visitors→Plan viewed→Account）はGA4に、後半（Upsell→Premium）はDBにあるが束ねられていない。`adminFunnel` に前後を足して1枚にする。

### P1-11 ✅ LPに実際の学習画面が1枚も無い
実画面4枚（今日の冒険／冒険マップ／語彙バトル／AI会話）を ja/zh で撮影して LP に追加。架空UIは作っていない。1x/2x WebP・lazy・横スクロールは枠内に閉じる。

### P1-12 ⬜ 音声会話・レポート・成長記録の実画面が未提示
P0-1 の復旧後に撮影して LP に足す（壊れた状態のレポートは見せない）。

### P1-13 ✅ 「ChatGPTでよくない？」への答えがLPに無い
FAQ に ja/zh で追加（実装済み機能のみで構成）。機能名「12週間ロードマップ」→「冒険マップ」へ改名し、実装と名前を一致させた。

### P1-14 ⬜ 申込フォーム経由のリードにUTMが付かない
購入は `ai_plan_purchases.utm` まで届くが、`buildApplication` は UTM を持たない。相談経由（＝10万円コースの唯一の入口）の流入元が分からない。

### P1-15 ⬜ 紹介ループが存在しない
share card + `?ref=` + `referral_visit/signup/purchase` の計測。報酬額はCEO未確定なので**金額を決めずに**土台だけ作る。

---

## P2

- **P2-1** ⬜ `ai_upsert_unit_progress` が毎回500（probe設計だが console が常時赤く、本物の障害が埋もれる）
- **P2-2** ⬜ 画面遷移がURLに乗らない（リロードでホームへ／ブラウザの戻るでアプリ外）
- **P2-3** ⬜ 読み問題の誤答解説が「这是别的词的读音」＝情報ゼロ
- **P2-4** ⬜ バトルの選択肢ボタンにアクセシブル名が無い
- **P2-5** ⬜ アプリの `<title>` が空
- **P2-6** ⬜ LPのコーチ写真が `complete=false` 判定（4パターンとも）
- **P2-7** ⬜ LPに creation story（なぜ作ったか）が無い
- **P2-8** ✅ バトル解説に内部ID（`vc-25-013`）が露出 → 削除
- **P2-9** ✅ 音声UIの「「こんにちは」」二重カギ括弧 → 修正
- **P2-10** ✅ 敬語ミッションのzh訳が機械訳的（「压低自己的行为」→「用谦让语说自己的行为」）・会話相手の肩書「翔子老师（词汇的向导）」→「（AI老师）」
- **P2-11** ✅ Stripe Session ID が GA4 へ送られていた → 末尾8桁のみ＋URLから除去
- **P2-12** ⬜ AI会話だけの日にも「今鍛えている試験力」が出る件は修正済みだが、会話目標の人に試験科目ラベル自体が要るかは商品判断

---

## 今すぐやらなくていいこと（TOP5）

1. 音声会話の悠斗先生まわりの追加調整（既に voice 切替は実API確認済み）
2. 読解・聴解の在庫追加（N3は全タイプ saturated と実測済み）
3. 冒険マップのビジュアル追加投資（現状で「現在地・次・その先」は成立している）
4. 新プランの追加・価格変更（3段階で足りている。まず60分パスの価値体験を直す）
5. share card のデザイン作り込み（計測の土台が先。報酬額も未確定）
