# 教材 P0/P1 CEO判断シート（14件）

生成: 2026-07-28 ／ 出典: 判断キュー（datasetVersion: phase-2e-1.5）
**推奨はAIの提案であり、承認ではありません。** 教材データへは未反映です。
human_reviewed / approved は変更していません。判断はこのシートに記入いただくか、
staging の判断キュー（`?app=1&vocab=1&vview=decisions`）でも同じ14件を確認できます。

cognate（同源語分類）の選択肢: `mostly_same`（ほぼ同じ）／`partial_overlap`（部分的に重なる）／
`false_friend`（形が似て意味がずれる・要注意）／`japanese_specific`（日本語固有寄り）

---

## 1. 名前（なまえ） — exampleJa / exampleZh（P0）

| 項目 | 内容 |
|---|---|
| ID | `fi-namae:example`（itemId: `fi-namae` / senseId: -） |
| 現在値 | 名前は王です。／我姓王。 |
| ChatGPT案 | 名前は王小明です。／我叫王小明。 |
| Claude案 | ChatGPT案に同意（王小明／我叫王小明） |
| 案A | ChatGPT案を採用（名前は王小明です。／我叫王小明。） |
| 案B | 現状維持 |
| 案C | 「名字は王です。／我姓王。」へ変更（語を名前→名字にせず例文側の対応を直す案） |
| **推奨（AI提案・承認ではない）** | **案A**（confidence: high） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 「名前（フルネーム）は王です」と「我姓王（姓は王）」で、名前と姓の範囲が一致していない。
- **学習者に起きる誤解**: 「名前＝姓」と誤解する。自己紹介で「名前は王です」と言うと日本語側では不自然（名字は王です、が自然）。
- **変更した場合のUI表示**: ことば図鑑の例文・例文ふりがなが変わる。診断・練習の本文出題には現在使っていないため採点への影響なし。
- **変更しない場合のリスク**: 初回学習の最初期に出る語で、フルネームと姓の混同をそのまま教えることになる。

</details>

---

## 2. 名前（なまえ） — meaningZh（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-namae:meaning_zh`（itemId: `fi-namae` / senseId: -） |
| 現在値 | 名字 |
| ChatGPT案 | 名字；姓名 |
| Claude案 | ChatGPT案に同意（名前はフルネームも指すため） |
| 案A | ChatGPT案を採用（名字；姓名） |
| 案B | 現状維持 |
| **推奨（AI提案・承認ではない）** | **案A**（confidence: high） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 中国語の「名字」は下の名前寄り。「名前」はフルネームも指すため訳の範囲が狭い。
- **学習者に起きる誤解**: 「名前＝下の名前だけ」と覚え、書類の「名前」欄でフルネームを書かない等の混乱。
- **変更した場合のUI表示**: ことば図鑑の訳語・意味問題の正答テキストが変わる（選択肢は自動生成のため追随）。
- **変更しない場合のリスク**: 例文（P0）だけ直して訳を直さないと、例文と訳の間で範囲の不一致が残る。

</details>

---

## 3. 困る（こまる） — meaningZh（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-komaru:meaning_zh`（itemId: `fi-komaru` / senseId: -） |
| 現在値 | 为难；困扰 |
| ChatGPT案 | 为难；困扰；不知道怎么办 |
| Claude案 | 訳は現状維持し、usageNoteZhで「不知道怎么办」のニュアンスを補足する |
| 案A | ChatGPT案を採用（訳に3語目を追加） |
| 案B | 現状維持 |
| 案C | 訳は維持し、usageNoteZhに「≈不知道怎么办的感觉」を追記 |
| **推奨（AI提案・承認ではない）** | **案C**（confidence: medium） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 「不知道怎么办」は訳語というより説明。訳に混ぜると意味問題の正答テキストが長くなる。
- **学習者に起きる誤解**: 現状でも大きな誤解はない。例文の「読めなくて困りました」は既に「不会读…很为难」で整合。
- **変更した場合のUI表示**: 案Aは意味問題の正答が長文化。案CはことばカードのusageNote欄のみ変わる。
- **変更しない場合のリスク**: 変更しなくても誤学習の実害は小さい（優先度は低め）。

</details>

---

## 4. 興味（きょうみ） — cognate（同源語分類）（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-kyoumi:cognate`（itemId: `fi-kyoumi` / senseId: -） |
| 現在値 | mostly_same（ほぼ同じ） |
| ChatGPT案 | false_friend（要注意） |
| Claude案 | ChatGPT案に同意（現代中文で兴味は一般的でない） |
| 案A | ChatGPT案を採用（false_friend） |
| 案B | 現状維持（mostly_same） |
| **推奨（AI提案・承認ではない）** | **案A**（confidence: medium） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 現代中国語で「兴味」は「兴趣」の意味でほぼ使わない（文語・慣用句のみ）。
- **学習者に起きる誤解**: 「兴味=兴趣だから同じ」と思い、中国語話者が日本語の興味を軽視／逆に中文作文で兴味を使う。
- **変更した場合のUI表示**: 語カードにfalse friend注意バッジが付き、診断のfalse friend問題の対象になる。
- **変更しない場合のリスク**: 「同じ」と表示し続けると、実際は範囲が違う語で安心させてしまう。

</details>

---

## 5. 元気（げんき） — cognate（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-genki:cognate`（itemId: `fi-genki` / senseId: -） |
| 現在値 | unreviewed（未分類） |
| ChatGPT案 | false_friend |
| Claude案 | partial_overlap を提案（现代中文の元气は「元气满满」等で活力の意味では通じる。完全な偽同源ではない） |
| 案A | ChatGPT案を採用（false_friend） |
| 案B | 現状維持（unreviewed） |
| 案C | partial_overlap（部分的に重なる）として注意表示 |
| **推奨（AI提案・承認ではない）** | **案C**（confidence: medium） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 中文の元气は「活力・生命力」寄りで、日本語の「元気ですか（健康・調子）」と範囲がずれる。
- **学習者に起きる誤解**: 「元气满满だから同じ」と思い、挨拶の「お元気ですか」の意味範囲を取り違える。
- **変更した場合のUI表示**: 案A/Cとも語カードに注意バッジ。案Cは「部分的に同じ」の穏やかな表現。
- **変更しない場合のリスク**: unreviewedのままだと分類バッジが出ず、注意喚起の機会を失う。

</details>

---

## 6. 会社員（かいしゃいん） — cognate（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-kaishain:cognate`（itemId: `fi-kaishain` / senseId: -） |
| 現在値 | unreviewed |
| ChatGPT案 | japanese_specific（日本語固有寄り） |
| Claude案 | ChatGPT案に同意（中文に会社という語自体がない） |
| 案A | ChatGPT案を採用（japanese_specific） |
| 案B | 現状維持 |
| **推奨（AI提案・承認ではない）** | **案A**（confidence: high） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 中国語では公司职员と言い、「会社」という語形が対応しない。
- **学習者に起きる誤解**: 漢字から意味は推測できるが、中文で「会社」と書いてしまう。
- **変更した場合のUI表示**: 語カードの同源語バッジが「日本語らしい言い方」系の表示になる。
- **変更しない場合のリスク**: 小。ただし分類が空のままだと同源語学習の説明が出ない。

</details>

---

## 7. 気分（きぶん） — cognate（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-kibun:cognate`（itemId: `fi-kibun` / senseId: -） |
| 現在値 | unreviewed |
| ChatGPT案 | false_friend |
| Claude案 | japanese_specific を提案（中文に气分という語は無い。混同相手は气氛＝雰囲気で、これは別語） |
| 案A | ChatGPT案を採用（false_friend） |
| 案B | 現状維持 |
| 案C | japanese_specific＋usageNoteで「≠气氛」を明記 |
| **推奨（AI提案・承認ではない）** | **案C**（confidence: medium） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 中文に「气分」は存在しない。学習者が混同しやすいのは形の近い「气氛（雰囲気）」。
- **学習者に起きる誤解**: 気分（心情）を气氛（雰囲気）と取り違える。
- **変更した場合のUI表示**: 案Cはバッジ＋注意書きの両方。usageNoteZhの1行追加を伴う。
- **変更しない場合のリスク**: 気分/气氛の混同は実際の会話で意味が大きくずれる（雰囲気がいい≠気分がいい）。

</details>

---

## 8. 何時（なんじ） — cognate（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-nanji:cognate`（itemId: `fi-nanji` / senseId: -） |
| 現在値 | unreviewed |
| ChatGPT案 | japanese_specific |
| Claude案 | ChatGPT案に同意（日常中文は几点。何时は書面語で「いつ」の意味になり、時刻を聞く用法と一致しない） |
| 案A | ChatGPT案を採用（japanese_specific） |
| 案B | 現状維持 |
| **推奨（AI提案・承認ではない）** | **案A**（confidence: medium） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 中文の何时は書面語の「いつ」。時刻を聞く「何時ですか」は几点であり対応しない。
- **学習者に起きる誤解**: 何时＝何時と思い、時刻質問のつもりで「何时」を使う／読める気がして聞き取れない。
- **変更した場合のUI表示**: 同上（バッジ表示）。会話コア語のため診断のコア問題にも注意が反映される。
- **変更しない場合のリスク**: 時刻の聞き方は初級会話の頻出。分類なしのままは惜しい。

</details>

---

## 9. 日本語（にほんご） — cognate（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-nihongo:cognate`（itemId: `fi-nihongo` / senseId: -） |
| 現在値 | unreviewed |
| ChatGPT案 | japanese_specific |
| Claude案 | ChatGPT案に同意（中文は日语） |
| 案A | ChatGPT案を採用（japanese_specific） |
| 案B | 現状維持 |
| **推奨（AI提案・承認ではない）** | **案A**（confidence: high） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 中国語では「日语」であり「日本語」という語形は使わない。
- **学習者に起きる誤解**: 小（意味は明瞭）。中文作文で日本語と書く程度。
- **変更した場合のUI表示**: バッジ表示のみ。
- **変更しない場合のリスク**: 小。

</details>

---

## 10. 相談する（そうだんする） — cognate（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-soudan:cognate`（itemId: `fi-soudan` / senseId: -） |
| 現在値 | unreviewed |
| ChatGPT案 | false_friend |
| Claude案 | ChatGPT案に同意（現代中文の日常語は商量。相谈は成語・書面語に残るのみ） |
| 案A | ChatGPT案を採用（false_friend） |
| 案B | 現状維持 |
| **推奨（AI提案・承認ではない）** | **案A**（confidence: medium） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 中文の相谈は現代の日常語ではない（相谈甚欢など成語的用法のみ）。日常は商量。
- **学習者に起きる誤解**: 相谈で通じると思って使う／商量との対応を覚えない。
- **変更した場合のUI表示**: バッジ＋false friend問題の対象。
- **変更しない場合のリスク**: ビジネス会話（上司に相談）で頻出のため対応語の定着が重要。

</details>

---

## 11. 友達（ともだち） — cognate（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-tomodachi:cognate`（itemId: `fi-tomodachi` / senseId: -） |
| 現在値 | unreviewed |
| ChatGPT案 | japanese_specific |
| Claude案 | ChatGPT案に同意（中文は朋友。友达という語はない） |
| 案A | ChatGPT案を採用（japanese_specific） |
| 案B | 現状維持 |
| **推奨（AI提案・承認ではない）** | **案A**（confidence: high） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 中文は朋友であり、友達という語形は対応しない。
- **学習者に起きる誤解**: 小（意味は文脈で明瞭）。
- **変更した場合のUI表示**: バッジ表示のみ。
- **変更しない場合のリスク**: 小。

</details>

---

## 12. 約束（やくそく） — cognate（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-yakusoku:cognate`（itemId: `fi-yakusoku` / senseId: -） |
| 現在値 | unreviewed |
| ChatGPT案 | mostly_same |
| Claude案 | false_friend を提案（現代中文の约束は主に「制約する・縛る」。日本語の約束＝约定であり、意味の中心がずれる典型例） |
| 案A | ChatGPT案を採用（mostly_same） |
| 案B | 現状維持（unreviewed） |
| 案C | false_friend として注意表示（Claude案） |
| **推奨（AI提案・承認ではない）** | **案C**（confidence: medium） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: ChatGPT案はmostly_sameだが、その根拠文自身が「中文约束は約束・制約の意味」と述べており分類と矛盾している。
- **学習者に起きる誤解**: 约束＝约定と思い込むと、中文の约束（束縛）を約束（promise）と誤読する。
- **変更した場合のUI表示**: 案Cならfalse friendバッジ＋注意問題の対象。
- **変更しない場合のリスク**: mostly_sameを付けると「同じ」と保証することになり、典型的な日中のずれを見逃させる。

</details>

---

## 13. 安い（やすい） — cognate（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-yasui:cognate`（itemId: `fi-yasui` / senseId: -） |
| 現在値 | unreviewed |
| ChatGPT案 | partial_overlap（理由記載は「目的語補完」で分類根拠として不明瞭） |
| Claude案 | false_friend を提案（中文の安は安全・平安であり「値段が安い」の意味はない。便宜が対応語） |
| 案A | ChatGPT案を採用（partial_overlap） |
| 案B | 現状維持 |
| 案C | false_friend として注意表示（Claude案） |
| **推奨（AI提案・承認ではない）** | **案C**（confidence: medium） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 漢字「安」の中文の意味（安全・安心）と日本語「安い（値段）」が一致しない。
- **学習者に起きる誤解**: 安＝安全と読んで「安いスーパー」を「安全なスーパー」と誤読する。
- **変更した場合のUI表示**: 案Cならバッジ＋注意問題。
- **変更しない場合のリスク**: 買い物会話の頻出語で、誤読の実害が具体的。

</details>

---

## 14. 全然（ぜんぜん） — cognate（P1）

| 項目 | 内容 |
|---|---|
| ID | `fi-zenzen:cognate`（itemId: `fi-zenzen` / senseId: -） |
| 現在値 | unreviewed |
| ChatGPT案 | false_friend |
| Claude案 | ChatGPT案に同意（中文の全然は文語のみ。完全没〜が日常表現） |
| 案A | ChatGPT案を採用（false_friend） |
| 案B | 現状維持 |
| **推奨（AI提案・承認ではない）** | **案A**（confidence: medium） |

**CEO判断: ＿＿＿＿（A / B / C / 保留）　理由: ＿＿＿＿**

<details>
<summary>詳しい根拠・影響（展開）</summary>

- **問題の内容**: 中文の全然は日常語ではない（文語）。日本語の「全然〜ない」の呼応も学習が必要。
- **学習者に起きる誤解**: 読めるので分かった気になるが、否定呼応（全然＋ない）を落とす。
- **変更した場合のUI表示**: バッジ＋注意問題の対象。
- **変更しない場合のリスク**: 否定呼応は誤用が目立ちやすい文法点。

</details>

---

## 集計

| 区分 | 件数 |
|---|---|
| P0（例文） | 1 |
| P1（訳語） | 2 |
| P1（同源語分類） | 11 |
| AI間で提案が一致 | 10 |
| **AI間で提案が食い違う（要注目）** | **4**（fi-genki・fi-kibun・fi-yakusoku・fi-yasui） |

判断後の反映手順: CEO判断を受領 → 対象fieldのみdraftへ反映 → stagingでCEO確認 → human_review_candidate へ。
**一括承認は行いません。**
