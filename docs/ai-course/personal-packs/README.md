# 個人復習パック（自分の文章で復習）

生徒が授業で書いた作文（日記・スピーチ原稿）に出てきた**表現**と**漢字の読み**を、
その人の文のまま復習できるようにする仕組み。生徒ごとに内容が違うが、**コードは共通**。
新しい生徒に出すときも、やることは「JSONを1枚書いて発行する」だけ。

## なぜ冒険（地図・攻略・準備度）と分けてあるか

冒険は全員に同じ基準で測るから準備度に意味がある。個人ごとに違う教材で mastery を動かすと、
その基準が人によって別物になる。だから個人パックは書き込む場所を完全に分けてある：

| 触るもの | 触らないもの |
|---|---|
| `settings.adventureV2.personalPacks`（先生が発行した教材） | route / mastery / skills / xp / streak |
| `settings.adventureV2.personalPack`（本人の答えた記録） | mockLog / 間違えた問題ノート / 準備度 |

何度やっても冒険の進み方は変わらない。実装の入口は
`src/lib/aiLesson/course/adventure/personal/advPersonalPack.ts`（純関数）と
`src/components/ai-course/adventure/AdvPersonalPackRunner.tsx`（画面）。

## 生徒側の見え方

メニュー →「自分の文章で復習（先生から届いた復習）」（発行された人にだけ出る）。

- **今日の復習**: まだやっていない問題 → 復習日が来た問題の順に最大20問
- **ぜんぶ通して練習する**: 全問を通しでやる（記録は同じように付く）
- **自分の文章を読み返す**: 発行した本文をそのまま表示（ふりがなは出さない＝読みの答えが透けるため）

正解するたびに次の復習が 1日 → 3日 → 7日 → 14日 → 30日 と伸びる。間違えたらその日のうちにもう一度出る。

## パックJSONの書き方

```jsonc
{
  "packId": "summer-20260824-diary",   // 英小文字・数字・ハイフン。生徒名+日付が分かりやすい
  "titleJa": "サマーさんの作文から（6本）",
  "titleZh": "来自Summer的作文（6篇）",
  "sourceLabelJa": "授業で書いた日記（〜2026年8月）",
  "sourceLabelZh": "课上写的日记（截至2026年8月）",
  "passages": [                         // 本人の文章そのもの（読み返す用・任意）
    { "id": "p1", "titleJa": "船橋で車の修理", "titleZh": "在船桥修车", "textJa": "昨日は8時に…" }
  ],
  "items": [
    // ① 漢字の読み
    { "id": "r-funabashi", "kind": "reading", "target": "船橋",
      "promptJa": "午前中は、千葉県の船橋へ行きました。",   // ← 本人の文をそのまま
      "answer": "ふなばし", "distractors": ["ふねばし", "せんきょう", "ふなはし"],
      "meaningZh": "船桥（地名）", "noteJa": "地名の「橋」は「ばし」と濁ることが多い。" },

    // ② 表現の意味（日本語の表現 → **中国語の意味**を選ぶ）
    { "id": "m-inshou", "kind": "meaning", "target": "印象に残る",
      "promptJa": "昨日一番印象に残ったことは、娘と自転車に乗ったことです。",
      "answer": "留下深刻的印象", "distractors": ["感到满意", "映入眼帘", "想起从前"] },

    // ③ 自分の文の空欄うめ（空欄は全角の ＿＿ をちょうど1つ）
    { "id": "c-nagara", "kind": "cloze", "target": "花を見ながら歩く",
      "promptJa": "娘と一緒に花を見＿＿、ゆっくり歩きました。",
      "answer": "ながら", "distractors": ["たあとで", "てから", "たまま"],
      "meaningZh": "一边…一边…" }
  ]
}
```

守ること（守らないと発行スクリプトが弾く）:

- **答えを例文の中に書かない。** 例文に答えがそのまま出ていると、意味が分からなくても
  写すだけで正解できる（2026-08-24 に実際に起きた。`meaning` の向きを
  「中国語 → 日本語の表現」から「日本語の表現 → 中国語の意味」へ反転して直した）
- `meaning` の `answer`・`distractors` は**中国語の意味**、`target` が日本語の表現
- `distractors` は**正解と違うものが2つ以上**（2択未満は当てずっぽうで当たる）
- `cloze` の `promptJa` には空欄 `＿＿` がちょうど1つ
- `reading` の `promptJa` には `target` の語が入っている（＝本人の文からの出題であること）
- `reading` の答え・ダミーはひらがな
- 本文に読みがな（例「緊張（きんちょう）」）を入れない。**読みの問題の答えが透ける**ので、
  文章から括弧のふりがなは外して `passages` に入れる

## 発行のしかた

先に一度だけ必要なもの（初回のみ）:

1. `supabase/migrations/20260824090000_ai_personal_packs_protection.sql` を本番へ適用
   （発行したパックを生徒の保存で消させないため。答案用紙と同じ保護）
2. フロントを本番へデプロイ（画面が無いと発行しても出ない）

この2つが済む前に発行すると、生徒が何か操作した拍子にパックが消えることがある。


```bash
node scripts/ai-course/issue-personal-pack.mjs --email <生徒のメール> --pack docs/ai-course/personal-packs/<file>.json
```

`--confirm` を付けなければ dry-run（何も書き込まない）。内容を確認してから付ける。

- 内容を直して入れ直す: `--replace --confirm`
- 取り消す: `--revoke <packId> --confirm`（本人の答えた記録は残る。同じIDで出し直せば戻る）

発行前の検品はテストでもできる（このフォルダの全JSONを、アプリと同じ復元で通す）:

```bash
npx vitest run src/lib/aiLesson/course/adventure/personal
```

## 新しい生徒に出すとき

1. 授業で書いた文章を集める（そのままの日本語で。直しは入れてよい）
2. その文から `reading` / `meaning` / `cloze` を作る（1本の作文につき5〜10問が目安）
3. このフォルダに `<生徒ID>-<日付>.json` として置く
4. `npx vitest run src/lib/aiLesson/course/adventure/personal` で検品
5. `issue-personal-pack.mjs` で発行

コードの変更は要らない。パックは何枚でも追加でき、生徒の画面では新しい順に並ぶ。
