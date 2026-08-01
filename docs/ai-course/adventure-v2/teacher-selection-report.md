# 先生選択（Teacher Selection）報告

作成: 2026-08-01 ／ branch `feature/ai-course-adventure-v2-completion`
staging: https://staging.badminton-platform.pages.dev （deploy `fdc9745c`）
**production へは反映していない。**

---

## 最終報告

```
Teacher Selection      : COMPLETE
Shoko Connected        : YES
Yuto Connected         : YES
All V2 Screens Consistent : YES
```

ただし1点だけ、**AI会話の音声はまだ切り替わらない**（画面と文章は切り替わる）。
学習者に誤解させないよう、選択画面に注意書きを出している。詳細は「7. 既知の制限」。

---

## 1. 何を作ったか

| ファイル | 役割 |
|---|---|
| `advTeacher.ts` | 先生のレジストリ（teacherId・名前ja/zh・役割文・挨拶・asset・モノグラム・音声） |
| `advTeacherText.ts` | 文言中の先生名だけを選択結果へ差し替える（`brand` は差し替えない） |
| `TeacherAvatar.tsx` | アバター本体＋`TeacherProvider`。asset失敗時はモノグラムへ落とす |
| `teacherContext.ts` | 「いま案内している先生」を画面ツリー全体へ配る |
| `ShokoAvatar.tsx` | 既存呼び出し互換のため残し、中身を `TeacherAvatar` へ委譲 |
| `AdvOnboarding.tsx` | 初回設定に「案内の先生」ステップを追加 |
| `AdvShell.tsx` | 設定画面（`view='teacher'`）＋各画面のアバター表示 |
| `AiCoursePage.tsx` | 保存値を読み、Provider と文言差し替えを全画面へ適用 |

---

## 2. 確認項目への回答

### teacherIdで管理

`AdvTeacherId = 'shoko' | 'yuto'`。保存も表示も分岐もすべて `teacherId` を通す。

### 性別を固定条件にしない

- 型・レジストリに `gender` / `sex` / `isFemale` / `isMale` **といったフィールドを一切持たない**
  （テストで「これらのキーが存在しないこと」を固定）
- 教材・出題・難易度・ルート生成・準備度判定は teacherId によって**一切変わらない**
  （先生は表示と話し方のペルソナのみ）
- 先生を増やすときは `TEACHER_DEFS` に1件足すだけ。性別を問わない

### 選択をサーバー保存

`settings.adventureV2.teacherId`（Supabase `ai_learners.settings` jsonb）へ保存。
既存のV2プロファイルと同じ経路（`writeAdvProfile` → `courseRepository.updateLearner`）なので
**マイグレーション不要**。選択した瞬間に保存される。

### reload後も維持

`readAdvProfile` で復元。settings往復を2回繰り返しても値が変わらないことをテストで固定。
壊れた値（数値など）が入っていた場合は `null` へ落とし、**既定の先生で表示**する
（画面が空にならない）。

### PC／スマホで一致

保存先がサーバー（learner settings）なので端末に依存しない。
localStorage も cookie も使っていない。ログインすればどの端末でも同じ先生になる。

### ja／zh対応

名前・役割文・挨拶・注意書きすべてに ja/zh を持つ。
アバターの `alt` / `aria-label` も表示言語に追従する（`翔子先生` / `翔子老师`）。
文言辞書側の「翔子先生」「翔子老师」も選択結果へ差し替わる。

### assetがない場合の安全なfallback

3段構え。

1. **表情のfallback** — 悠斗先生には cheer 画像が無いので `smile` は `neutral` へ落ちる
   （無い絵をでっち上げない）。どの表情でも必ず1枚返ることをテストで固定
2. **読み込み失敗のfallback** — `onError` でモノグラム（翔／悠）の丸バッジへ切り替える。
   **空表示にはならない**。テストで `fireEvent.error` を発火させて確認済み
3. **未選択・不正値のfallback** — 既定の先生（翔子先生）へ落とす

加えて、**宣言したassetが実際にファイルとして存在するか**をテストで検査している
（欠けたまま気づかずリリースしない）。

### 既存learnerのデフォルトを勝手に変更しない

- 新フィールドの初期値は **`null`（未選択）**。既存learnerの保存データを書き換えない
- 未選択の表示は**従来どおり翔子先生**。既存learnerから見た画面は今までと同じ
- テストで「未設定プロファイルを読み書きしても `teacherId` が `null` のまま」を固定

---

## 3. 選択できる場所

| 入口 | 場所 |
|---|---|
| 初回設定 | onboarding の「案内してくれる先生を選んでください」（学習スケジュールの次） |
| 設定変更 | Home →「ほかの学習を見る」→「案内の先生を変える（いまは◯◯先生）」 |

どちらの画面にも
「学習内容・出題・レベル判定は変わりません。話し方と見た目が変わります。」
と明記している（選択が成績に影響すると誤解させないため）。

---

## 4. 7画面の統一状況

| 画面 | 実装 | 表示 |
|---|---|---|
| Home | AdvShell | 先生のアバター＋名前＋今日の一言 |
| 今日の冒険 | AdvShell | カード見出しに先生アバター／完了画面にも表示 |
| AI会話 | CourseVoiceLesson | `ShokoAvatar`→Provider追従。文言の先生名も差し替え |
| 学習レポート | AdvShell（準備度）／CourseReport | BackBarに先生アバター／レポート冒頭にも表示 |
| 言い直し | AdvShell | BackBarに先生アバター |
| 復習 | CourseReviewNote | `ShokoAvatar`→Provider追従。「◯◯先生から」の見出しも追従 |
| 先生レッスン準備 | AdvShell | BackBarに先生アバター |

Home の案内キャラクターは、これまで「旅の相棒」（なみ／ふくろう／かじ）のSVGだった。
**案内キャラクターを1人に統一する**ため、Homeの案内枠は選択した先生に置き換えた。
相棒はクエスト構成の重みづけとしては残っている（選択も onboarding に残っている）が、
Homeでアバターとしては表示しない（マスコットが2人並ぶのを避けるため）。

### 実装のしかた

`AiCoursePage` の `Shell` が `TeacherProvider` で画面ツリー全体を包む。
既存の `ShokoAvatar` 呼び出し（15箇所）は中身が `TeacherAvatar` に変わっているだけなので、
**呼び出し側を書き換えずに全画面が選択結果へ揃う**。

---

## 5. 文言の先生名

文言辞書は「翔子先生」固定で書かれていた。辞書を先生ごとに二重管理せず、
**表示時に名前だけを差し替える**方式にした（`applyTeacherName`）。

- 対象: `aiCourseI18n` の全文字列（入れ子・配列も走査）
- **除外: `brand`（商品名）** — 学習者の選択で商品名は変えない
- 既定の先生なら**元のオブジェクトをそのまま返す**（余計な再生成をしない）

---

## 6. 検証

```
vitest         1,509 pass / 0 fail
tsc            エラー 0
eslint         src/components/ai-course・src/lib/aiLesson・src/pages/ai-lesson・scripts でエラー 0
build:staging  成功
staging deploy fdc9745c
```

追加テスト 22件:

- `advTeacher.test.ts`（15件）— 2名登録／性別フィールド非保持／ja・zh充足／全表情でasset有／
  **宣言assetの実在**／未選択・不正値のfallback／音声注意書き／既存learner非破壊／
  reload維持／壊れた値の処理／他フィールド非破壊／文言差し替え／brand保護／入れ子走査
- `teacherAvatar.test.tsx`（7件）— ja・zh表示／未選択の既定／**画像失敗時のモノグラム**／
  既存 `ShokoAvatar` の追随／明示指定の優先／装飾用途の読み上げ除外

staging の実バンドル `TeacherAvatar-ConW5ACF.js` を取得して確認:

```
悠斗先生 / 悠斗老师 / 翔子先生 / 翔子老师                        … すべて含まれる
yuto-sensei-base.webp / yuto-sensei-teaching.webp        … 含まれる
モノグラム 翔 / 悠                                        … 含まれる
音声の注意書き（ja / zh）                                  … 含まれる
```

配信asset: `/images/ai-course/yuto-sensei-base.webp` `…-teaching.webp` ともに 200。

### ブラウザでの見た目確認について

Browser pane は webp をデコードできず（既存の翔子先生画像も `naturalWidth=0` になる）、
この環境では画像の見た目そのものを画面キャプチャで確認できなかった。
代わりに **ファイル実体を直接確認**した（`yuto-sensei-base.webp` は有効なWebP・
胸から上の正面ポートレートで、丸トリミング `object-position: center 12%` に適合）。
なお、この環境で画像が表示できないこと自体が **fallback が効く条件**であり、
その場合はモノグラムが出る（テストで確認済み）。

---

## 7. 既知の制限（正直な記載）

**AI会話の音声はまだ切り替わらない。**

realtime音声はサーバー側（`supabase/functions/ai-lesson-token`）で
`VOICE = "marin"` に固定されており、クライアントから指定できない。
Edge Function の変更＋デプロイはリモート操作のため、このセッションでは行っていない。

そのため悠斗先生を選ぶと：

- 画面のアバター・名前・文言 … **悠斗先生になる**
- AI会話の声 … **まだ翔子先生の声のまま**

これを隠さないよう、先生選択画面（初回設定・設定変更の両方）に
「AI会話の声は、いまはまだ切り替わりません（画面と文章は悠斗先生になります）。」
と表示している（中国語も同文）。

`advTeacher.ts` には各先生の希望音声（`realtimeVoice`: marin / cedar）と
`voiceSwitchAvailable` フラグを持たせてあるので、Edge Function が
音声指定を受け取れるようになれば、フラグを `true` にするだけで注意書きが消える。

---

## 8. 次にやるなら

1. Edge Function `ai-lesson-token` に音声パラメータを追加し、`realtimeVoice` を渡す
   （リモートデプロイのためCEO承認が必要）
2. 悠斗先生の `cheer`（笑顔）画像の追加 — いまは base で代用している
3. staging の learner セッションでの実操作確認（先生を切り替えて7画面を目視）
