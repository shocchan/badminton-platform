# Phase 2-2 — 未解決表現 265件の分類と Alias層（2026-09-10）

Phase 1 の知識グラフで「関連（similarPatterns）として参照されているのに、IDへ解決できない」
表示文字列が **265種**（参照本数 358）あった。これを「無い」と決めつけず、5つに仕分けた。

## 結果

| 分類 | 意味 | 種類数 | 参照本数 | 扱い |
|---|---|---|---|---|
| alias | 既存項目の別表記（括弧・丁寧体／普通体・末尾の助詞） | **73** | 134 | Alias層で既存IDへ解決。教材は増やさない |
| partial | 既存項目の一部・活用形・敬語形（「〜はともかく」⊂「〜はともかくとして」） | **56** | 63 | 既存IDへ解決（最も近い項目） |
| ambiguous | 既存項目が複数当たり、括弧でも決められない（「〜ています」→ 進行／状態） | **19** | 40 | 人が決める。当てずっぽうで繋がない |
| non-item | 単独の助詞・接続（〜より／〜けど）。教材の1項目にする対象ではない | **5** | 9 | 解決しない（正常） |
| missing | 本当に教材が無い | **112** | 112 | うち **23件をギャップ教材（draft）として追加**。残りは参照1回のみ |

- 追加前の missing は 139。ギャップ教材23件で **26本の参照**が解決した。
- **参照2回以上でまだ無いものは 0**（「〜結果」「〜ですよね」は人が読んで既存へ対応づけ＝MANUAL_ALIASES）。
- 残る missing 112 は全て参照1回。文法項目として成立するものも混ざる（〜がてら／〜っぱなし／〜づらい 等）が、
  1回参照のために教材を作ると「265件を265教材にする」方向へ戻るので、Phase 4（教材横断接続）で
  実際に必要と分かったものだけ足す。

## 何を作ったか

| ファイル | 役割 |
|---|---|
| `src/lib/aiLesson/course/knowledge/aliasLayer.ts` | 表示文字列 → 正準ID。`splitQualifier`（括弧）／`formVariants`（丁寧体↔普通体・助詞）／`resolveAlias`／`resolvePartial`／`classifyUnresolved`／`MANUAL_ALIASES` |
| `src/lib/aiLesson/course/knowledge/grammarGapDrafts.ts` | ギャップ教材 23件（N3 14・N2 9）。N3ドラフトと同じ27フィールド。`reviewStatus:'draft'`・`approved:false` |
| `aliasLayer.test.ts` / `grammarGapDrafts.test.ts` | 「〜ています を別教材にしない」「当たらなければ none」「出題プールに入っていない」「語彙リンクは実在IDだけ」 |

### Alias層の設計で守ったこと
- 既存の表示文字列は1文字も変えない（画面にそのまま出ている）。Alias層は**読み方の追加**。
- 「〜ています」と「〜ている」は**同じ概念の丁寧体／普通体**＝1つの知識項目の2つの表示形。別教材にしない。
- 解決は確度の高い順（exact → variant → partial）。決められなければ ambiguous / none。近い項目へ当てずっぽうで繋がない。
- 括弧の中身（主題・伝聞…）は曖昧なときの決め手として使う。捨てない。
- 機械で決められないものだけ `MANUAL_ALIASES`（5件）に人が書く。規則に無理に載せると誤爆が増える
  （「〜てくださる」は部分一致だと授受の別項目に、「〜られない」は迷惑の受身に当たっていた）。

### ギャップ教材で守ったこと
- **学習者には出さない。** `N3_GRAMMAR_DRAFTS` へ連結していない（`advContent` は読まない）。知識グラフと Alias索引だけが読む。
  テストで「出題プールに同じIDが無い」ことを固定。
- IDは綴り式（`n3g-nitsurete`）。既存の番号式（`n2g-001`〜178）と衝突せず、1件も動かしていない。
- 語彙リンクは実在する fi- のみ（基礎語彙 = `BANK_ITEMS` ∪ `N3_ITEMS` ∪ `VOCAB_NEW_ITEMS` = 129 ID）。QA 0件。

追加した23件:
N3 — につれて／だけでなく／さえ／た結果／に関して／気味／と同時に／ごとに／必要はない／はずがない／可能性がある／意外に／途中で／きれない
N2 — 場合ではない／とはいえ／を機に／や否や／なくはない／傾向がある／において／つつも／てこそ

## 次に人が決めること（停止理由ではない）
- ambiguous 19件：「〜ています」「〜そうです」等、括弧なしの参照をどちらの既存項目へ繋ぐか。
  参照元の教材の文脈で決まる。Phase 4 で参照元ごとに付け直す候補。
- ギャップ教材23件の中身確認 → 確認後に `N3_GRAMMAR_DRAFTS` 等へ連結して公開（別コミット・CEO確認）。

## 付録：265件の全分類表
| 分類 | 表示文字列 | 参照数 | 解決先 |
|---|---|---|---|
| missing | 〜あたり | 1 | — |
| missing | 〜おきに | 1 | — |
| missing | 〜かけた | 1 | — |
| missing | 〜がてら | 1 | — |
| missing | 〜かと思えば | 1 | — |
| missing | 〜がなければ | 1 | — |
| missing | 〜から判断して | 1 | — |
| missing | 〜が一番だ | 1 | — |
| missing | 〜が可能だ | 1 | — |
| missing | 〜が見える | 1 | — |
| missing | 〜が聞こえる | 1 | — |
| missing | 〜しよう | 1 | — |
| missing | 〜そうになった | 1 | — |
| missing | 〜たきり | 1 | — |
| missing | 〜だけしか | 1 | — |
| missing | 〜だけでも | 1 | — |
| missing | 〜だけのことはある | 1 | — |
| missing | 〜たとしても | 1 | — |
| missing | 〜たまま | 1 | — |
| missing | 〜たらすぐ | 1 | — |
| missing | 〜って | 1 | — |
| missing | 〜っぱなし | 1 | — |
| missing | 〜づらい | 1 | — |
| missing | 〜て、〜て | 1 | — |
| missing | 〜て（形容詞の並列） | 1 | — |
| missing | 〜て（並列） | 1 | — |
| missing | 〜ていただく | 1 | — |
| missing | 〜ていただけますか | 1 | — |
| missing | 〜でいっぱい | 1 | — |
| missing | 〜できない | 1 | — |
| missing | 〜てくる | 1 | — |
| missing | 〜です・〜ます（丁寧形） | 1 | — |
| missing | 〜ては | 1 | — |
| missing | 〜てもらいたい | 1 | — |
| missing | 〜て間もない | 1 | — |
| missing | 〜と、いつも | 1 | — |
| missing | 〜といっしょに | 1 | — |
| missing | 〜ときどき〜する | 1 | — |
| missing | 〜としても | 1 | — |
| missing | 〜とても | 1 | — |
| missing | 〜と仮定して | 1 | — |
| missing | 〜と言えば | 1 | — |
| missing | 〜と言われた | 1 | — |
| missing | 〜と思い込む | 1 | — |
| missing | 〜と思って | 1 | — |
| missing | 〜と反対に | 1 | — |
| missing | 〜な（禁止） | 1 | — |
| missing | 〜な＋名詞 | 1 | — |
| missing | 〜なくちゃ | 1 | — |
| missing | 〜なくてすむ | 1 | — |
| missing | 〜なくて大丈夫 | 1 | — |
| missing | 〜なしでは | 1 | — |
| missing | 〜ならまだしも | 1 | — |
| missing | 〜にあります | 1 | — |
| missing | 〜における | 1 | — |
| missing | 〜について | 1 | — |
| missing | 〜については | 1 | — |
| missing | 〜には〜が | 1 | — |
| missing | 〜にふさわしく | 1 | — |
| missing | 〜にも | 1 | — |
| missing | 〜に関係なく | 1 | — |
| missing | 〜に乗ります | 1 | — |
| missing | 〜に任せて | 1 | — |
| missing | 〜の？ | 1 | — |
| missing | 〜のため | 1 | — |
| missing | 〜のみ | 1 | — |
| missing | 〜のも無理はない | 1 | — |
| missing | 〜の下で | 1 | — |
| missing | 〜の間 | 1 | — |
| missing | 〜の際は | 1 | — |
| missing | 〜の面では | 1 | — |
| missing | 〜は〜が | 1 | — |
| missing | 〜べきではない | 1 | — |
| missing | 〜み | 1 | — |
| missing | 〜も〜ば〜も | 1 | — |
| missing | 〜や〜 | 1 | — |
| missing | 〜やりがい | 1 | — |
| missing | 〜をください | 1 | — |
| missing | 〜をメインに | 1 | — |
| missing | 〜を気にせず | 1 | — |
| missing | 〜を顧みず | 1 | — |
| missing | 〜を受けて | 1 | — |
| missing | 〜を切に願う | 1 | — |
| missing | 〜を代表として | 1 | — |
| missing | 〜を通して | 1 | — |
| missing | 〜以来 | 1 | — |
| missing | 〜気持ちで | 1 | — |
| missing | 〜出す | 1 | — |
| missing | 〜場合がある | 1 | — |
| missing | 〜場面を | 1 | — |
| missing | 〜通す | 1 | — |
| missing | 〜程度 | 1 | — |
| missing | 〜特有の | 1 | — |
| missing | 〜余裕がない | 1 | — |
| missing | 〜曜日 | 1 | — |
| missing | いつ・いくら・どう | 1 | — |
| missing | こちら・そちら・あちら | 1 | — |
| missing | こんな・そんな・あんな | 1 | — |
| missing | つまり | 1 | — |
| missing | どこ | 1 | — |
| missing | どっちもどっち | 1 | — |
| missing | どの | 1 | — |
| missing | どれ | 1 | — |
| missing | どれ・どの | 1 | — |
| missing | どんなに〜ても | 1 | — |
| missing | ひとつ・ふたつ・みっつ | 1 | — |
| missing | むしろ | 1 | — |
| missing | 可能形（〜られる） | 1 | — |
| missing | 絶対〜ない | 1 | — |
| missing | 動詞ます形 | 1 | — |
| missing | 動詞辞書形 | 1 | — |
| missing | 命令形 | 1 | — |
| ambiguous | 〜ています | 5 | n5g-teimasu-progressive / n5g-teimasu-state |
| ambiguous | 〜から | 4 | n3g-kara-riyuu / n5g-kara-riyuu |
| ambiguous | 〜ている | 4 | n5g-teimasu-progressive / n5g-teimasu-state |
| ambiguous | 〜と | 4 | n5g-to / n4g-to-joken |
| ambiguous | 〜そうだ | 3 | n3g-souda-yousu / n4g-soudesu-denbun / n4g-soudesu-youtai |
| ambiguous | 〜で | 3 | n5g-de-place / n5g-de-means / n5g-keiyoushi-te |
| ambiguous | 〜そうです | 2 | n4g-soudesu-denbun / n4g-soudesu-youtai |
| ambiguous | 〜だ | 2 | n5g-desu / n5g-na-adjective |
| ambiguous | 〜ないと | 2 | n3g-naide / n5g-masu-masen |
| ambiguous | 〜には | 2 | n5g-ni-time / n5g-ni-goal |
| ambiguous | 〜そうで | 1 | n3g-souda-yousu / n4g-soudesu-denbun / n4g-soudesu-youtai |
| ambiguous | 〜ところで | 1 | n2g-094 / n4g-tokorodesu |
| ambiguous | 〜とは | 1 | n5g-to / n4g-to-joken |
| ambiguous | 〜に | 1 | n5g-ni-time / n5g-ni-goal |
| ambiguous | 〜の（所有） | 1 | n5g-no-possessive / n5g-no-pronoun |
| ambiguous | 〜のに（用途） | 1 | n4g-noni-gyakusetsu / n4g-koto-no-nominalize |
| ambiguous | 〜のは | 1 | n5g-no-possessive / n5g-no-pronoun |
| ambiguous | 〜みたいだ | 1 | n3g-mitai / n4g-mitaidesu |
| ambiguous | 〜上に | 1 | n2g-006 / n2g-007 / n2g-055 |
| partial | 〜として | 3 | n2g-143 |
| partial | 〜たり〜たり | 2 | n3g-taritari |
| partial | 〜と思う | 2 | n4g-toomoimasu |
| partial | 〜なくて | 2 | n3g-temoii |
| partial | 〜なければ | 2 | n3g-nakerebanaranai |
| partial | 〜はともかく | 2 | n2g-142 |
| partial | 〜がいいです | 1 | n4g-nara-gaii |
| partial | 〜からよかったが | 1 | n5g-i-adjective |
| partial | 〜ことだろう | 1 | n2g-046 |
| partial | 〜ことにしている | 1 | n3g-koto-meirei |
| partial | 〜ことになっています | 1 | n4g-koto-no-nominalize |
| partial | 〜させてください | 1 | n5g-te-kudasai |
| partial | 〜すぎて | 1 | n3g-sugiru |
| partial | 〜たあとで | 1 | n5g-atode |
| partial | 〜だから | 1 | n2g-047 |
| partial | 〜たことがある | 1 | n3g-kotogaaru |
| partial | 〜たために | 1 | n4g-tameni |
| partial | 〜だったよね | 1 | n5g-na-adjective |
| partial | 〜ているときに | 1 | n5g-teimasu-progressive |
| partial | 〜できません | 1 | n5g-masu-masen |
| partial | 〜でしたよね | 1 | n5g-na-adjective |
| partial | 〜ですか | 1 | n4g-tara-dou-desuka |
| partial | 〜てほしいと言われた | 1 | n3g-tehoshii |
| partial | 〜てみたい | 1 | n3g-mitai |
| partial | 〜てもよろしいでしょうか | 1 | n3g-deshou |
| partial | 〜てもらう代わりに | 1 | n2g-038 |
| partial | 〜てよかったものの | 1 | n2g-161 |
| partial | 〜というものだ | 1 | n2g-157 |
| partial | 〜とおっしゃいました | 1 | n5g-mashita-masendeshita |
| partial | 〜ときがあります | 1 | n5g-arimasu-imasu |
| partial | 〜ところがある | 1 | n2g-094 |
| partial | 〜とたん | 1 | n2g-065 |
| partial | 〜と言うほかない | 1 | n2g-148 |
| partial | 〜と言っていました | 1 | n5g-mashita-masendeshita |
| partial | 〜と思っています | 1 | n5g-teimasu-progressive |
| partial | 〜ないだろう | 1 | n3g-darou |
| partial | 〜ないつもりだ | 1 | n2g-074 |
| partial | 〜ないではいられない | 1 | n3g-naide |
| partial | 〜ないで済む | 1 | n3g-naide |
| partial | 〜なくなります | 1 | n5g-kunarimasu-ninarimasu |
| partial | 〜のだから | 1 | n2g-158 |
| partial | 〜のは〜だ | 1 | n3g-toiunoha |
| partial | 〜のほうが | 1 | n5g-yori-hou |
| partial | 〜は難しいです | 1 | n5g-i-adjective |
| partial | 〜ほしがっています | 1 | n5g-teimasu-progressive |
| partial | 〜みたいな | 1 | n3g-mitai |
| partial | 〜ようとしています | 1 | n5g-teimasu-progressive |
| partial | 〜ようと思う | 1 | n4g-toomoimasu |
| partial | 〜ように見えて | 1 | n3g-you-ishi |
| partial | 〜ように見せる | 1 | n3g-you-ishi |
| partial | 〜をきっかけに | 1 | n2g-019 |
| partial | 〜を中心として | 1 | n2g-173 |
| partial | 〜感じがする | 1 | n3g-gasuru |
| partial | い形容詞の活用 | 1 | n5g-adj-noun |
| partial | とても〜／あまり〜 | 1 | n2g-002 |
| partial | な形容詞の活用 | 1 | n5g-adj-noun |
| alias | 〜ため | 6 | n4g-tameni |
| alias | 〜そうだ（伝聞） | 4 | n4g-soudesu-denbun |
| alias | 〜てもいいですか | 4 | n5g-temo-ii |
| alias | 〜など | 4 | n4g-toka-nado |
| alias | 〜につれて | 4 | n3g-nitsurete |
| alias | 〜はずだ | 4 | n4g-hazudesu |
| alias | 〜ませんか | 4 | n5g-mashou-masenka |
| alias | 〜けど | 3 | n5g-ga-kedo |
| alias | 〜だけだ | 3 | n4g-dake-shika |
| alias | 〜だけでなく | 3 | n3g-dakedenaku |
| alias | 〜たとたん | 3 | n2g-065 |
| alias | 〜てはいけない | 3 | n5g-tewa-ikemasen |
| alias | 〜なくはない | 3 | n2g-nakuwanai |
| alias | 〜はずがない | 3 | n3g-hazuganai |
| alias | 〜べきだ | 3 | n2g-147 |
| alias | 〜可能性がある | 3 | n3g-kanouseigaaru |
| alias | 〜ぎみ | 2 | n3g-gimi |
| alias | 〜ごとに | 2 | n3g-gotoni |
| alias | 〜さえ | 2 | n3g-sae |
| alias | 〜たい | 2 | n5g-tai-desu |
| alias | 〜たほうがいい | 2 | n4g-tahougaii |
| alias | 〜てくださる | 2 | n4g-tekureru |
| alias | 〜ですよね | 2 | n5g-ne-yo |
| alias | 〜ということ | 2 | n2g-085 |
| alias | 〜とはいえ | 2 | n2g-towaie |
| alias | 〜と同時に | 2 | n3g-todoujini |
| alias | 〜に関して | 2 | n3g-nikanshite |
| alias | 〜に関しては | 2 | n3g-nikanshite |
| alias | 〜は | 2 | n5g-wa |
| alias | 〜やいなや | 2 | n2g-yainaya |
| alias | 〜を機に | 2 | n2g-wokini |
| alias | 〜結果 | 2 | n3g-takekka |
| alias | 〜場合ではない | 2 | n2g-baaidewanai |
| alias | 〜必要はない | 2 | n3g-hitsuyouwanai |
| alias | 〜予定だ | 2 | n4g-yoteidesu |
| alias | この・その・あの | 2 | n5g-kono-sono-ano |
| alias | 〜あいだ | 1 | n3g-aidani |
| alias | 〜い＋名詞 | 1 | n5g-i-adjective |
| alias | 〜きれない | 1 | n3g-kirenai |
| alias | 〜ことだ | 1 | n2g-046 |
| alias | 〜ことです | 1 | n2g-046 |
| alias | 〜させられる | 1 | n4g-shieki-ukemi |
| alias | 〜じゃないです | 1 | n5g-na-adjective |
| alias | 〜だけで | 1 | n4g-dake-shika |
| alias | 〜だけに | 1 | n4g-dake-shika |
| alias | 〜たところだ | 1 | n2g-063 |
| alias | 〜たところです | 1 | n2g-063 |
| alias | 〜た結果 | 1 | n3g-takekka |
| alias | 〜つつも | 1 | n2g-tsutsumo |
| alias | 〜てこそ | 1 | n2g-tekoso |
| alias | 〜でした | 1 | n5g-na-adjective |
| alias | 〜と〜 | 1 | n5g-to |
| alias | 〜ところだ | 1 | n4g-tokorodesu |
| alias | 〜ないこと | 1 | n2g-100 |
| alias | 〜の（名詞化） | 1 | n4g-koto-no-nominalize |
| alias | 〜のです | 1 | n4g-koto-no-nominalize |
| alias | 〜ばかりだ | 1 | n3g-bakari |
| alias | 〜ましょうか | 1 | n5g-mashouka-moushide |
| alias | 〜ません | 1 | n5g-masu-masen |
| alias | 〜まで | 1 | n4g-madeni |
| alias | 〜までに | 1 | n4g-madeni |
| alias | 〜ような | 1 | n3g-noyouna |
| alias | 〜られない | 1 | n4g-kanoukei |
| alias | 〜を | 1 | n5g-wo |
| alias | 〜を除いて | 1 | n2g-176 |
| alias | 〜以外に | 1 | n3g-igaini |
| alias | 〜以外は | 1 | n3g-igaini |
| alias | 〜傾向がある | 1 | n2g-keikougaaru |
| alias | 〜次第では | 1 | n2g-054 |
| alias | 〜代わりに（N3・代替） | 1 | n2g-038 |
| alias | 〜途中 | 1 | n3g-tochuude |
| alias | 〜途中で | 1 | n3g-tochuude |
| alias | いらっしゃる・召し上がる・ご覧になる | 1 | n4g-sonkeigo-tokubetsu |
| non-item | 〜けれども | 2 | — |
| non-item | 〜し | 2 | — |
| non-item | 〜て、〜 | 2 | — |
| non-item | 〜より | 2 | — |
| non-item | 〜や | 1 | — |