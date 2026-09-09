# 長期学習記憶の設計（表示ログと学習記録を分ける）

2026-09-09 CEO指示（追加P0）。**設計と実装計画まで。この文書の時点で実装はしていない。**
すでに入っている第一歩（learningDays）だけが例外で、それは §5 に書く。

> `questLog limit = 60` を `limit = 10000` へ変えるだけでは解決としない。
> **表示ログと長期学習記憶を分離する**方向で設計すること。（CEO 2026-09-09）

---

## 1. いま起きていること

### 1.1 記録がぜんぶ1つのjsonbに入っている

学習者の記録は `ai_learners.settings.adventureV2`（jsonb 1カラム）にすべて入っている。
保存は `ai_save_learner_settings` RPC で**まるごと1回**書く。

本番の実測（2026-09-09・テスト含む13人）:

| 学習者 | 全体 | 内訳（大きい順） |
|---|---|---|
| サマー | **53.6KB** | mastery 21.9 / personalPacks 13.0 / personalPack 9.5 / mockLog 4.1 |
| ユウキ | 22.8KB | personalPacks 8.0 / personalPack 6.5 / mastery 3.6 |
| 李 | 18.5KB | mastery 4.5 / proverbDex 4.2 / mockLog 3.9 |
| 小蒋 | 13.2KB | personalPacks 9.4 / route 1.4 |

サマーさんは**学習日6日・試行39回**でこの大きさ。半年（学習100日・試行700回想定）まで
線形に伸びると仮定すると mastery だけで数百KB。実際には `maxAttemptsKept=24`（target当たり）で
頭打ちになるが、**targetの数**（N2ルートで文法束・単元・語彙バンド・漢字束を合わせて100超）が
効くので、上限は「24 × target数」で決まる。半年〜1年で数百KB〜1MB規模はあり得る。

### 1.2 切り詰めが「記憶の消失」になっている

肥大を止めるために、いくつかの配列に上限がある。

| 配列 | 上限 | 消えるもの |
|---|---|---|
| `questLog` | 60件 | **半年使うと前半120日ぶんのやりきった記録** |
| `mastery[target]` | 24試行 | 古い試行（合格の証拠は保護済み・`recordAttempt`） |
| `mockLog` | 30件 | 古い模試 |
| `restateLog` | 120件 | 古い言い直し |
| `visit` | 30日 | 30日より前の「来た日」 |
| `learningDays` | 400日 | 1年より前の学習日 |

`questLog` の60件は「半年の成長」を出す `advGrowthHorizons` の材料そのもの。
**半年コースを売りながら、半年の記録を持っていない。**

### 1.3 知識の粒度が「その日の出来事」しかない

いま持っているのは「いつ・どのtargetを・何%で解いたか」。
持っていないのは「**どの語・どの文法項目を**いつ初めて見て、いつ最後に会って、
いま覚えているか、次はいつ出すか」。

`vocabDex`（単語図鑑）は mastery の `questionKeys` から**毎回導出**していて保存しない、
という良い設計になっている。ただしそれは「台帳に残っている24試行の範囲」でしか数えられない。
古い試行が間引かれると、**その語に出会った事実そのものが消える**。

N5 → N1 → ビジネス日本語まで伸ばすなら、ここが土台になる。

---

## 2. 分けかた（A / B）

| | A：表示ログ | B：長期学習記録 |
|---|---|---|
| 目的 | 「最近どうだったか」を見せる | 「この人は何を知っているか」を持ち続ける |
| 例 | やりきった冒険60件・直近の模試・あゆみカレンダー | 語・文法項目ごとの初見／最終／定着／次回 |
| 量 | 小さい（切ってよい） | 大きい（**切ってはいけない**） |
| 置き場 | いまのまま `settings.adventureV2`（jsonb） | **専用テーブル（行）** |
| 消えたら | 見た目が寂しくなるだけ | 学習者の資産が消える＝商品が壊れる |

**判断: Bをjsonbに置き続けない。** 理由は3つ。

1. **1バイトでも増えるたびに全体を書き直す。** いまは保存のたびに数十KBを送っている。
   Bが増え続ける前提だと、いずれ保存そのものが重くなる。
2. **部分更新ができない。** 「この語だけ次回を更新する」ができず、常に全書き換え。
   同時保存の競合（過去にF1として実際に起きている）の面積が増え続ける。
3. **問い合わせられない。** 「『〜てもらう』を苦手にしている生徒は誰か」が出せない。
   100人になったら、これが分かるかどうかで打てる手が変わる。

---

## 3. Bの形（案）

### 3.1 knowledge item を先に決める

いちばん大事なのはテーブルではなく **ID体系**。ここがぶれると後で全部やり直しになる。

```
item_id  ::=  <kind>:<level>:<key>

kind  = vocab | grammar | kanji | expression | listening | reading | situation
level = n5 | n4 | n3 | n2 | n1 | biz          （ビジネス日本語は級と直交させず1つの帯として置く）
key   = 表記|よみ（語）/ 文法ID（n3g-tearu）/ 漢字1文字 / 表現ID
```

例: `vocab:n3:状況|じょうきょう` / `grammar:n2:n2g-074` / `kanji:n4:議` / `expression:biz:休暇相談`

いまのキーからの写像は既にほぼ作れる:

- 語彙問題キー `vocab:<表記>:<よみ>:<観点>` → `vocab:<level>:<表記>|<よみ>`（`vocabDex.parseVocabKey`）
- 文法束 `n3g-unit-*` / 項目 `n3g-*` `n2g-*` `n5g-*` → `grammar:<level>:<id>`
- 漢字束 → `kanji:<level>:<字>`

**level は語そのものが持っている**（`vocabContentBank` のバンド）ので、
学習者の目標レベルではなく**教材側の帯**を入れる。あとで「N3の語は8割覚えた」が出せる。

### 3.2 テーブル（3枚）

```sql
-- ① 知識ごとの現在地（1人×1項目＝1行）。**これがB本体**
create table ai_learning_items (
  user_id        uuid not null,
  item_id        text not null,               -- 上のID体系
  kind           text not null,               -- vocab / grammar / kanji / ...
  level          text not null,               -- n5..n1 / biz
  first_seen_on  date not null,               -- 初めて出会った日
  last_seen_on   date not null,               -- 最後に出会った日
  attempts       integer not null default 0,
  correct        integer not null default 0,
  wrong          integer not null default 0,
  -- 「別の日に◯回正解した」を数えるための日付集合（小さいので配列でよい）
  correct_days   date[] not null default '{}',
  last_wrong_on  date,
  mastery        text not null default 'met', -- met / familiar / mastered（advVocabDexと同じ段階）
  next_review_on date,                        -- 次に出す日（間隔は §3.3）
  -- 会話で実際に使えたか（speaking）。回数だけ持ち、本文は持たない
  conv_used      integer not null default 0,
  conv_corrected integer not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- ② 学習した日（Meaningful Learning Action）。**すでに settings 側で動いている（§5）**
--    100人Betaのあと、行にするならこちら
create table ai_learning_days (
  user_id  uuid not null,
  day      date not null,
  kinds    text[] not null,     -- step / battle / conv / restate / quest
  primary key (user_id, day)
);

-- ③ 出来事の生ログ（任意・分析用）。学習者の画面はこれを読まない
create table ai_learning_events (
  id       bigserial primary key,
  user_id  uuid not null,
  at       timestamptz not null default now(),
  item_id  text,
  outcome  text,              -- correct / wrong / skipped / used_in_conversation
  source   text               -- battle / mock / vocab_learn / conversation / restate
);
```

**本文は1文字も入れない。** 問題文・例文・学習者の発話は入れない
（`advMistakeNotebook` が守っている規律と同じ）。①はキーと数だけなので、
1項目あたり約120バイト。1人3,000項目でも約360KB——ただし**行なので部分更新で済む**。

### 3.3 間隔（next_review_on）

いまは固定（別日3回＋7日後 / 言い直し1・3・7日 / ことば10日）。
①ができると、正答率と最終誤答日から**項目ごとに**伸縮できる。
ただし **100人のデータを見てから**（CEO 2026-09-09「机上で全部実装しない」）。
テーブルには `next_review_on` の列だけ用意し、当面は現在の固定間隔をそのまま書く。

### 3.4 A（表示ログ）はいまのまま

`questLog` 60件・`mockLog` 30件・`visit` 30日はそのまま jsonb に残す。
**上限は上げない。** これらは「最近の見え方」であって記録ではない、と決める。
半年の成長・図鑑・錯題本は①から作る。

---

## 4. 移行計画（壊さない順）

| 段階 | やること | 生徒に見える変化 | 戻し方 |
|---|---|---|---|
| **0（済）** | 学習した日を settings に持つ（`learningDays`） | streak・あゆみ・管理画面が実態に合う | 列を読まなくすれば元に戻る |
| **1** | ①③のテーブルを作る（**読まない・書くだけ**） | なし | テーブルを落とす |
| **2** | 台帳へ試行を書くとき①へも二重書き（jsonbが正のまま） | なし | 二重書きを止める |
| **3** | 図鑑・錯題本・半年の成長を①から読むよう切替（jsonbはフォールバック） | 古い記録が戻ってくる | 読み先をjsonbへ戻す |
| **4** | jsonbの mastery を「直近90日ぶんの作業領域」に縮める | なし（①が正になっている） | 縮小をやめる |

**段階1・2は100人Betaの最中でも安全**（読まないので体験が変わらない）。
段階3は実データを見てから。段階4は段階3が2週間安定してから。

### 埋め戻し

既存learnerの①は、いまの `mastery` から作れる（`questionKeys` / `wrongKeys` / `dateKey`）。
ただし**間引かれた古い試行は戻らない**。戻らないものを推定で埋めない（原則13）。
`first_seen_on` は「台帳に残っている最古の日」であって「本当の初見」ではないので、
`first_seen_estimated boolean` を持たせて画面でもそう断る。

---

## 5. すでに入っている第一歩

`learningDays`（2026-09-09・P0-1）が、Bのうち **meaningful learning date** だけを先に実装したもの。

- 判定は `src/lib/aiLesson/course/adventure/advLearningDay.ts` の1か所だけ
- 1年（400日）ぶん持ち、questLog のように60件で切らない
- streak・あゆみ・週まとめ・半年の成長・管理画面・先生の一言・離脱メールが全部ここを見る

上の表の②はこれを行にしたもの。**いま急いで行にする必要はない**
（1年ぶんで約18KB。100人Betaのあいだは jsonb で足りる）。

---

## 6. 決めていないこと（CEO判断が要る）

1. **ビジネス日本語を level に入れるか、別の軸にするか。** 上の案は `level=biz` として
   級と同じ列に置いている。「N2かつビジネス」を表したいなら列を分ける必要がある。
2. **段階3をいつやるか。** 100人Betaの最中に読み先を変えると、不具合の原因の切り分けが難しい。
   Beta後を推す。
3. **`ai_learning_events`（③）を作るか。** 分析には効くが、100人×1日20件×180日＝36万行。
   Supabaseの無料枠では重い。**当面は作らない**を推す（①だけで図鑑・錯題本・復習は作れる）。
