// 共有語彙バンク（Phase 2B §6）。同じ語を単元ごとに重複登録しない。
// 各単元は本バンクのItemを参照し、別Rule・Question・dimensionから同一Itemへ接続する。
// 出典監査 2026-07-26 実施（原資料Excelを読み取り専用で全セル照合・確認済みセルのみ記載）。
import type { FoundationItem } from './foundationTypes';

type Ref = FoundationItem['sources'][number];
const MIN = '最初に覚える最低限表現';
const KATSUYO = '動詞活用形';
const HINDO = '動詞使用頻度順';
const xls = (sheet: string, row: number, cell: string, match: Ref['sourceMatchType'], label: string): Ref =>
  ({ sourceKind: 'teacher_workbook', sourceSheet: sheet, sourceRow: row, cellRange: cell, sourceMatchType: match, sourceLabel: label });
const ext = (label: string): Ref =>
  ({ sourceKind: 'reviewed_textbook_scope', sourceSheet: null, sourceRow: null, cellRange: null, sourceMatchType: 'external_scope', sourceLabel: label });
/** 基本動詞の定型出典（最低限表現の語彙行＋動詞活用形の活用表） */
const verbRefs = (lemma: string, minRow: number, katsuyoB: number | null, katsuyoC: number | null): Ref[] => [
  xls(MIN, minRow, `C${minRow}`, 'exact_lexeme', `語彙行「${lemma}」`),
  ...(katsuyoB !== null ? [xls(KATSUYO, katsuyoB, `B${katsuyoB}`, 'exact_lexeme', `活用表見出し「${lemma}」`)] : []),
  ...(katsuyoC !== null ? [xls(KATSUYO, katsuyoC, `C${katsuyoC}`, 'exact_lexeme', `活用表「${lemma}（対訳注記付き）」`)] : []),
];

export const BANK_ITEMS: FoundationItem[] = [
  // --- 基本動詞（単元2・3・5で共有） ---
  { id: 'fi-iku', lemma: '行く', displayForm: '行く', readingKana: 'いく', readingRomaji: 'iku', partOfSpeech: 'verb', verbGroup: 'g1', meaningZh: '去', exampleJa: '学校に行きます。', exampleZh: '我去学校。', usageNoteZh: '目的地用「に／へ」。て形是例外「行って」。', sources: verbRefs('行く', 173, 35, 107), review: 'draft' },
  { id: 'fi-kuru', lemma: '来る', displayForm: '来る', readingKana: 'くる', readingRomaji: 'kuru', partOfSpeech: 'verb', verbGroup: 'g3', meaningZh: '来', exampleJa: '友だちが来ます。', exampleZh: '朋友要来。', usageNoteZh: '三类动词：来ます（きます）・来ない（こない）・来て（きて），读音会变。', sources: verbRefs('来る', 174, 36, 108), review: 'draft' },
  { id: 'fi-suru', lemma: 'する', displayForm: 'する', readingKana: 'する', readingRomaji: 'suru', partOfSpeech: 'verb', verbGroup: 'g3', meaningZh: '做', exampleJa: '仕事をします。', exampleZh: '我工作。', usageNoteZh: '三类动词：します・しない・して。', sources: verbRefs('する', 172, 34, 106), review: 'draft' },
  { id: 'fi-taberu', lemma: '食べる', displayForm: '食べる', readingKana: 'たべる', readingRomaji: 'taberu', partOfSpeech: 'verb', verbGroup: 'g2', meaningZh: '吃', exampleJa: '朝ごはんを食べます。', exampleZh: '我吃早饭。', sources: verbRefs('食べる', 181, 43, 115), review: 'draft' },
  { id: 'fi-miru', lemma: '見る', displayForm: '見る', readingKana: 'みる', readingRomaji: 'miru', partOfSpeech: 'verb', verbGroup: 'g2', meaningZh: '看', exampleJa: '映画を見ます。', exampleZh: '我看电影。', sources: verbRefs('見る', 176, 38, 110), review: 'draft' },
  { id: 'fi-hanasu', lemma: '話す', displayForm: '話す', readingKana: 'はなす', readingRomaji: 'hanasu', partOfSpeech: 'verb', verbGroup: 'g1', meaningZh: '说；讲', exampleJa: '日本語を話します。', exampleZh: '我说日语。', sources: verbRefs('話す', 178, 40, 112), review: 'draft' },
  { id: 'fi-kiku', lemma: '聞く', displayForm: '聞く', readingKana: 'きく', readingRomaji: 'kiku', partOfSpeech: 'verb', verbGroup: 'g1', meaningZh: '听／问', senses: [{ id: 'kiku-listen', meaningZh: '听（音楽を聞く）' }, { id: 'kiku-ask', meaningZh: '问（先生に聞く）' }], exampleJa: '音楽を聞きます。', exampleZh: '听音乐。', usageNoteZh: '「聞く」有「听」和「问」两个意思。', sources: verbRefs('聞く', 177, 39, 111), review: 'draft' },
  { id: 'fi-kaku', lemma: '書く', displayForm: '書く', readingKana: 'かく', readingRomaji: 'kaku', partOfSpeech: 'verb', verbGroup: 'g1', meaningZh: '写', exampleJa: '名前を書きます。', exampleZh: '我写名字。', sources: [xls(MIN, 179, 'C179', 'exact_lexeme', '語彙行「書く」'), xls(KATSUYO, 5, 'G5', 'exact_lexeme', '活用表「書く」')], review: 'draft' },
  { id: 'fi-yomu', lemma: '読む', displayForm: '読む', readingKana: 'よむ', readingRomaji: 'yomu', partOfSpeech: 'verb', verbGroup: 'g1', meaningZh: '读', exampleJa: '本を読みます。', exampleZh: '我读书。', sources: verbRefs('読む', 180, 42, 114), review: 'draft' },
  { id: 'fi-kau', lemma: '買う', displayForm: '買う', readingKana: 'かう', readingRomaji: 'kau', partOfSpeech: 'verb', verbGroup: 'g1', meaningZh: '买', exampleJa: '水を買います。', exampleZh: '我买水。', usageNoteZh: 'ない形是「買わない」（不是「買あない」）。', sources: verbRefs('買う', 183, 45, 117), review: 'draft' },
  { id: 'fi-kaeru', lemma: '帰る', displayForm: '帰る', readingKana: 'かえる', readingRomaji: 'kaeru', partOfSpeech: 'verb', verbGroup: 'g1', meaningZh: '回家；回去', exampleJa: '家に帰ります。', exampleZh: '回家。', usageNoteZh: '虽然以「る」结尾，但是一类动词：帰ります・帰らない・帰って。', sources: verbRefs('帰る', 175, 37, 109), review: 'draft' },
  { id: 'fi-wakaru', lemma: '分かる', displayForm: '分かる', readingKana: 'わかる', readingRomaji: 'wakaru', partOfSpeech: 'verb', verbGroup: 'g1', meaningZh: '明白；懂', exampleJa: '日本語が分かります。', exampleZh: '懂日语。', usageNoteZh: '对象用「が」：日本語が分かります（不用「を」）。', sources: verbRefs('分かる', 195, 57, 131), review: 'draft' },
  // --- 存在動詞（単元4で使用・ない形例外は単元2の規則で言及） ---
  { id: 'fi-aru', lemma: 'ある', displayForm: 'ある', readingKana: 'ある', readingRomaji: 'aru', partOfSpeech: 'verb', verbGroup: 'g1', meaningZh: '有；在（无生命）', exampleJa: '時間があります。', exampleZh: '有时间。', usageNoteZh: '物・事用「ある」，人・动物用「いる」。ない形是例外：「あらない」不存在，是「ない」。', sources: [xls(HINDO, 4, 'D4', 'exact_lexeme', '使用頻度順「ある」')], review: 'draft' },
  { id: 'fi-iru-exist', lemma: 'いる', displayForm: 'いる', readingKana: 'いる', readingRomaji: 'iru', partOfSpeech: 'verb', verbGroup: 'g2', meaningZh: '有；在（有生命）', exampleJa: '猫がいます。', exampleZh: '有一只猫。', usageNoteZh: '中文都是「有」，日语必须区分：人・动物→いる，物→ある。', sources: [ext('Excel内に「いる」単独の語彙セルなし。標準初級範囲（存在動詞）から補完')], review: 'draft' },
  { id: 'fi-neko', lemma: '猫', displayForm: '猫', readingKana: 'ねこ', readingRomaji: 'neko', partOfSpeech: 'noun', meaningZh: '猫', exampleJa: '猫がいます。', exampleZh: '有一只猫。', sources: [ext('Excel内に「猫」単独の語彙セルなし。標準初級範囲（身近な名詞）から補完')], review: 'draft' },
  // --- 単元5（に・で・へ） ---
  { id: 'fi-densha', lemma: '電車', displayForm: '電車', readingKana: 'でんしゃ', readingRomaji: 'densha', partOfSpeech: 'noun', meaningZh: '电车', exampleJa: '電車で行きます。', exampleZh: '坐电车去。', usageNoteZh: '交通手段用「で」。', sources: [xls(MIN, 106, 'C106', 'exact_lexeme', '語彙行「電車」'), xls(MIN, 225, 'F225', 'example_contains', '例文「電車が遅れています」内')], review: 'draft' },
  { id: 'fi-okiru', lemma: '起きる', displayForm: '起きる', readingKana: 'おきる', readingRomaji: 'okiru', partOfSpeech: 'verb', verbGroup: 'g2', meaningZh: '起床', exampleJa: '7時に起きます。', exampleZh: '7点起床。', usageNoteZh: '时刻用「に」：7時に起きます。', sources: [ext('Excel内に「起きる」単独の語彙セルなし。標準初級範囲（日常動詞）から補完')], review: 'draft' },
  // --- 単元6（数字・時間・値段と買い物） ---
  { id: 'fi-ikura', lemma: 'いくら', displayForm: 'いくら', readingKana: 'いくら', readingRomaji: 'ikura', partOfSpeech: 'expression', meaningZh: '多少钱', exampleJa: 'これはいくらですか。', exampleZh: '这个多少钱？', sources: [xls(MIN, 275, 'C275', 'exact_lexeme', '語彙行「いくら」')], review: 'draft' },
  { id: 'fi-ikutsu', lemma: 'いくつ', displayForm: 'いくつ', readingKana: 'いくつ', readingRomaji: 'ikutsu', partOfSpeech: 'expression', meaningZh: '几个；多少；几岁', exampleJa: 'りんごはいくつありますか。', exampleZh: '有几个苹果？', sources: [xls(MIN, 274, 'C274', 'exact_lexeme', '語彙行「いくつ」')], review: 'draft' },
  { id: 'fi-nanji', lemma: '何時', displayForm: '何時', readingKana: 'なんじ', readingRomaji: 'nanji', partOfSpeech: 'expression', meaningZh: '几点', exampleJa: '今、何時ですか。', exampleZh: '现在几点？', sources: [ext('Excel内に「何時」単独の語彙セルなし。標準初級範囲（時刻）から補完')], review: 'draft' },
  { id: 'fi-kore', lemma: 'これ', displayForm: 'これ', readingKana: 'これ', readingRomaji: 'kore', partOfSpeech: 'noun', meaningZh: '这个', exampleJa: 'これをください。', exampleZh: '请给我这个。', usageNoteZh: 'これ（近己方）／それ（近对方）／あれ（都远）。', sources: [ext('Excel内に「これ」単独の語彙セルなし。標準初級範囲（指示詞）から補完')], review: 'draft' },
  { id: 'fi-en', lemma: '円', displayForm: '円', readingKana: 'えん', readingRomaji: 'en', partOfSpeech: 'noun', meaningZh: '日元', exampleJa: '500円です。', exampleZh: '500日元。', sources: [ext('Excel内に「円」単独の語彙セルなし。標準初級範囲（通貨）から補完')], review: 'draft' },
  { id: 'fi-kudasai', lemma: 'ください', displayForm: 'ください', readingKana: 'ください', readingRomaji: 'kudasai', partOfSpeech: 'expression', meaningZh: '请给我／请（做）', exampleJa: 'これをください。', exampleZh: '请给我这个。', usageNoteZh: '「名词＋を＋ください」＝请给我〜。「て形＋ください」＝请做〜。', sources: [ext('Excel内に「ください」単独の語彙セルなし。標準初級範囲（買い物表現）から補完')], review: 'draft' },
];

export const bankItem = (id: string): FoundationItem => {
  const it = BANK_ITEMS.find((i) => i.id === id);
  if (!it) throw new Error(`unknown bank item: ${id}`);
  return it;
};
