// ことば図鑑 拡張語彙バンク（Phase 2C+ §8-§10・全draft・重複Item禁止）。
// 既存foundationItemBank/UNIT1_ITEMSのItemはそのまま再利用し、本ファイルは新規語のみ登録する。
// 出典監査 2026-07-27（原資料Excel読み取り専用照合・確認済みセルのみ記載）。
import type { FoundationItem } from './foundationTypes';
import { BANK_ITEMS } from './foundationItemBank';
import { UNIT1_ITEMS } from './foundationUnit1';
import { N3_ITEMS } from './foundationVocabN3';

type Ref = FoundationItem['sources'][number];
const MIN = '最初に覚える最低限表現';
const KATSUYO = '動詞活用形';
const HINDO = '動詞使用頻度順';
const xls = (sheet: string, row: number, cell: string, label: string): Ref =>
  ({ sourceKind: 'teacher_workbook', sourceSheet: sheet, sourceRow: row, cellRange: cell, sourceMatchType: 'exact_lexeme', sourceLabel: label });
const ext = (label: string): Ref =>
  ({ sourceKind: 'reviewed_textbook_scope', sourceSheet: null, sourceRow: null, cellRange: null, sourceMatchType: 'external_scope', sourceLabel: label });
const extNote = 'Excel内に単独語彙セルなし。標準初級範囲から補完';

export const VOCAB_NEW_ITEMS: FoundationItem[] = [
  // ── 動詞（追加9語・§8） ──
  { id: 'fi-nomu', lemma: '飲む', displayForm: '飲む', readingKana: 'のむ', readingRomaji: 'nomu', partOfSpeech: 'verb', verbGroup: 'g1', coreLevel: 'A', imageAssetId: 'va-verb-nomu-scene', meaningZh: '喝', exampleJa: '水を飲みます。', exampleZh: '喝水。', usageNoteZh: '吃药也用「飲む」：薬を飲みます。', sources: [xls(MIN, 182, 'C182', '語彙行「飲む」'), xls(KATSUYO, 44, 'B44', '活用表「飲む」')], review: 'draft' },
  { id: 'fi-tsukau', lemma: '使う', displayForm: '使う', readingKana: 'つかう', readingRomaji: 'tsukau', partOfSpeech: 'verb', verbGroup: 'g1', coreLevel: 'A', imageAssetId: 'va-verb-tsukau-scene', meaningZh: '使用', exampleJa: 'スマホを使います。', exampleZh: '用手机。', sources: [xls(MIN, 185, 'C185', '語彙行「使う」'), xls(KATSUYO, 47, 'B47', '活用表「使う」')], review: 'draft' },
  { id: 'fi-tsukuru', lemma: '作る', displayForm: '作る', readingKana: 'つくる', readingRomaji: 'tsukuru', partOfSpeech: 'verb', verbGroup: 'g1', coreLevel: 'A', imageAssetId: 'va-verb-tsukuru-scene', meaningZh: '做・制作', exampleJa: '晩ごはんを作ります。', exampleZh: '做晚饭。', sources: [xls(MIN, 186, 'C186', '語彙行「作る」'), xls(KATSUYO, 48, 'B48', '活用表「作る」')], review: 'draft' },
  { id: 'fi-au', lemma: '会う', displayForm: '会う', readingKana: 'あう', readingRomaji: 'au', partOfSpeech: 'verb', verbGroup: 'g1', coreLevel: 'A', imageAssetId: 'va-verb-au-scene', meaningZh: '见面', exampleJa: '友達に会います。', exampleZh: '和朋友见面。', usageNoteZh: '对象用「に」：友達に会います（不用「を」）。', sources: [ext(extNote)], review: 'draft' },
  { id: 'fi-neru', lemma: '寝る', displayForm: '寝る', readingKana: 'ねる', readingRomaji: 'neru', partOfSpeech: 'verb', verbGroup: 'g2', coreLevel: 'A', imageAssetId: 'va-verb-neru-scene', meaningZh: '睡觉', exampleJa: '11時に寝ます。', exampleZh: '11点睡觉。', sources: [xls(HINDO, 23, 'D23', '使用頻度順「寝る」')], review: 'draft' },
  { id: 'fi-hairu', lemma: '入る', displayForm: '入る', readingKana: 'はいる', readingRomaji: 'hairu', partOfSpeech: 'verb', verbGroup: 'g1', coreLevel: 'A', imageAssetId: 'va-verb-hairu-scene', meaningZh: '进入', exampleJa: '店に入ります。', exampleZh: '进店。', usageNoteZh: '虽然以「る」结尾，但是一类动词：入ります・入って。', sources: [xls(MIN, 191, 'C191', '語彙行「入る」'), xls(KATSUYO, 53, 'B53', '活用表「入る」')], review: 'draft' },
  { id: 'fi-deru', lemma: '出る', displayForm: '出る', readingKana: 'でる', readingRomaji: 'deru', partOfSpeech: 'verb', verbGroup: 'g2', coreLevel: 'A', imageAssetId: 'va-verb-deru-scene', meaningZh: '出去・离开', exampleJa: '家を出ます。', exampleZh: '出门。', usageNoteZh: '离开的场所用「を」：家を出ます。', sources: [xls(MIN, 192, 'C192', '語彙行「出る」')], review: 'draft' },
  { id: 'fi-noru', lemma: '乗る', displayForm: '乗る', readingKana: 'のる', readingRomaji: 'noru', partOfSpeech: 'verb', verbGroup: 'g1', coreLevel: 'A', imageAssetId: 'va-verb-noru-scene', meaningZh: '乘坐', exampleJa: '電車に乗ります。', exampleZh: '坐电车。', usageNoteZh: '交通工具用「に」：電車に乗ります（不用「を」）。', sources: [ext(extNote)], review: 'draft' },
  { id: 'fi-oriru', lemma: '降りる', displayForm: '降りる', readingKana: 'おりる', readingRomaji: 'oriru', partOfSpeech: 'verb', verbGroup: 'g2', coreLevel: 'A', imageAssetId: 'va-verb-oriru-scene', meaningZh: '下（车）', exampleJa: '駅で電車を降ります。', exampleZh: '在车站下车。', usageNoteZh: '下车的交通工具用「を」。', sources: [ext(extNote)], review: 'draft' },
  // ── い形容詞（16語・反対語ペア・§9） ──
  { id: 'fi-ookii', lemma: '大きい', displayForm: '大きい', readingKana: 'おおきい', readingRomaji: 'ookii', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-chiisai', imageAssetId: 'va-adj-ookii-chiisai-contrast', meaningZh: '大', exampleJa: '大きいかばんです。', exampleZh: '很大的包。', sources: [xls(MIN, 219, 'C219', '語彙行「大きい」')], review: 'draft' },
  { id: 'fi-chiisai', lemma: '小さい', displayForm: '小さい', readingKana: 'ちいさい', readingRomaji: 'chiisai', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-ookii', imageAssetId: 'va-adj-ookii-chiisai-contrast', meaningZh: '小', exampleJa: '小さい店です。', exampleZh: '很小的店。', sources: [xls(MIN, 220, 'C220', '語彙行「小さい」')], review: 'draft' },
  { id: 'fi-takai', lemma: '高い', displayForm: '高い', readingKana: 'たかい', readingRomaji: 'takai', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-yasui', imageAssetId: 'va-adj-takai-yasui-contrast', meaningZh: '贵／高', senses: [{ id: 'takai-price', meaningZh: '（价格）贵', noteJa: '反対は「安い」' }, { id: 'takai-height', meaningZh: '（高度）高', noteJa: '反対は「低い」' }], exampleJa: 'この店は高いです。', exampleZh: '这家店很贵。', usageNoteZh: '「高い」有两个意思：贵（⇔安い）和高（⇔低い）。', sources: [xls(MIN, 221, 'C221', '語彙行「高い」')], review: 'draft' },
  { id: 'fi-yasui', lemma: '安い', displayForm: '安い', readingKana: 'やすい', readingRomaji: 'yasui', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-takai', imageAssetId: 'va-adj-takai-yasui-contrast', meaningZh: '便宜', exampleJa: '安いスーパーで買います。', exampleZh: '在便宜的超市买。', sources: [xls(MIN, 223, 'C223', '語彙行「安い」')], review: 'draft' },
  { id: 'fi-atarashii', lemma: '新しい', displayForm: '新しい', readingKana: 'あたらしい', readingRomaji: 'atarashii', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-furui', imageAssetId: 'va-adj-atarashii-furui-contrast', meaningZh: '新', exampleJa: '新しいスマホです。', exampleZh: '新手机。', sources: [xls(MIN, 228, 'C228', '語彙行「新しい」')], review: 'draft' },
  { id: 'fi-furui', lemma: '古い', displayForm: '古い', readingKana: 'ふるい', readingRomaji: 'furui', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-atarashii', imageAssetId: 'va-adj-atarashii-furui-contrast', meaningZh: '旧', exampleJa: '古い家に住んでいます。', exampleZh: '住在老房子里。', usageNoteZh: '不用于人的年龄。', sources: [xls(MIN, 229, 'C229', '語彙行「古い」')], review: 'draft' },
  { id: 'fi-atsui', lemma: '暑い', displayForm: '暑い', readingKana: 'あつい', readingRomaji: 'atsui', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-samui', imageAssetId: 'va-adj-atsui-samui-contrast', meaningZh: '热（天气）', exampleJa: '今日は暑いです。', exampleZh: '今天很热。', usageNoteZh: '天气热用「暑い」，东西烫是「熱い」（同音）。', sources: [xls(MIN, 230, 'C230', '語彙行「暑い」')], review: 'draft' },
  { id: 'fi-samui', lemma: '寒い', displayForm: '寒い', readingKana: 'さむい', readingRomaji: 'samui', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-atsui', imageAssetId: 'va-adj-atsui-samui-contrast', meaningZh: '冷（天气）', exampleJa: '冬は寒いです。', exampleZh: '冬天很冷。', sources: [xls(MIN, 231, 'C231', '語彙行「寒い」')], review: 'draft' },
  { id: 'fi-isogashii', lemma: '忙しい', displayForm: '忙しい', readingKana: 'いそがしい', readingRomaji: 'isogashii', partOfSpeech: 'iAdj', coreLevel: 'A', meaningZh: '忙', exampleJa: '仕事が忙しいです。', exampleZh: '工作很忙。', sources: [xls(MIN, 252, 'C252', '語彙行「忙しい」')], review: 'draft' },
  { id: 'fi-tanoshii', lemma: '楽しい', displayForm: '楽しい', readingKana: 'たのしい', readingRomaji: 'tanoshii', partOfSpeech: 'iAdj', coreLevel: 'A', meaningZh: '开心・愉快', exampleJa: '日本の生活は楽しいです。', exampleZh: '在日本的生活很开心。', sources: [xls(MIN, 242, 'C242', '語彙行「楽しい」')], review: 'draft' },
  { id: 'fi-muzukashii', lemma: '難しい', displayForm: '難しい', readingKana: 'むずかしい', readingRomaji: 'muzukashii', partOfSpeech: 'iAdj', coreLevel: 'A', meaningZh: '难', exampleJa: '漢字は難しいです。', exampleZh: '汉字很难。', sources: [xls(MIN, 234, 'C234', '語彙行「難しい」')], review: 'draft' },
  { id: 'fi-chikai', lemma: '近い', displayForm: '近い', readingKana: 'ちかい', readingRomaji: 'chikai', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-tooi', imageAssetId: 'va-adj-chikai-tooi-contrast', meaningZh: '近', exampleJa: '駅は家から近いです。', exampleZh: '车站离家很近。', sources: [xls(MIN, 251, 'C251', '語彙行「近い」')], review: 'draft' },
  { id: 'fi-tooi', lemma: '遠い', displayForm: '遠い', readingKana: 'とおい', readingRomaji: 'tooi', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-chikai', imageAssetId: 'va-adj-chikai-tooi-contrast', meaningZh: '远', exampleJa: '会社は少し遠いです。', exampleZh: '公司有点远。', sources: [xls(MIN, 250, 'C250', '語彙行「遠い」')], review: 'draft' },
  { id: 'fi-ooi', lemma: '多い', displayForm: '多い', readingKana: 'おおい', readingRomaji: 'ooi', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-sukunai', meaningZh: '多', exampleJa: '人が多いです。', exampleZh: '人很多。', usageNoteZh: '一般不直接修饰名词说「多い人」，说「人が多い」。', sources: [xls(MIN, 248, 'C248', '語彙行「多い」')], review: 'draft' },
  { id: 'fi-sukunai', lemma: '少ない', displayForm: '少ない', readingKana: 'すくない', readingRomaji: 'sukunai', partOfSpeech: 'iAdj', coreLevel: 'A', antonymId: 'fi-ooi', meaningZh: '少', exampleJa: '休みが少ないです。', exampleZh: '休息日很少。', sources: [xls(MIN, 249, 'C249', '語彙行「少ない」')], review: 'draft' },
  { id: 'fi-oishii', lemma: 'おいしい', displayForm: 'おいしい', readingKana: 'おいしい', readingRomaji: 'oishii', partOfSpeech: 'iAdj', coreLevel: 'A', imageAssetId: 'va-scene-restaurant', meaningZh: '好吃', exampleJa: 'このラーメンはおいしいです。', exampleZh: '这个拉面很好吃。', sources: [ext(extNote)], review: 'draft' },
  // ── な形容詞（7語） ──
  { id: 'fi-suki', lemma: '好き', displayForm: '好き', readingKana: 'すき', readingRomaji: 'suki', partOfSpeech: 'naAdj', coreLevel: 'A', meaningZh: '喜欢', exampleJa: '音楽が好きです。', exampleZh: '喜欢音乐。', usageNoteZh: '「好き」不是动词，是な形容词。对象用「が」：音楽が好きです。', sources: [ext(extNote + '（頻出表現シートの完全一致セルなし）')], review: 'draft' },
  { id: 'fi-genki', lemma: '元気', displayForm: '元気', readingKana: 'げんき', readingRomaji: 'genki', partOfSpeech: 'naAdj', coreLevel: 'A', meaningZh: '有精神・健康', exampleJa: '子どもは元気です。', exampleZh: '孩子很有精神。', sources: [ext(extNote)], review: 'draft' },
  { id: 'fi-shizuka', lemma: '静か', displayForm: '静か', readingKana: 'しずか', readingRomaji: 'shizuka', partOfSpeech: 'naAdj', coreLevel: 'A', meaningZh: '安静', exampleJa: '静かな部屋です。', exampleZh: '安静的房间。', usageNoteZh: '修饰名词加「な」：静かな部屋。', sources: [ext(extNote)], review: 'draft' },
  { id: 'fi-benri', lemma: '便利', displayForm: '便利', readingKana: 'べんり', readingRomaji: 'benri', partOfSpeech: 'naAdj', coreLevel: 'A', meaningZh: '方便', exampleJa: '電車は便利です。', exampleZh: '电车很方便。', sources: [ext(extNote)], review: 'draft' },
  { id: 'fi-kantan', lemma: '簡単', displayForm: '簡単', readingKana: 'かんたん', readingRomaji: 'kantan', partOfSpeech: 'naAdj', coreLevel: 'A', meaningZh: '简单', exampleJa: 'この問題は簡単です。', exampleZh: '这道题很简单。', sources: [ext(extNote)], review: 'draft' },
  { id: 'fi-yuumei', lemma: '有名', displayForm: '有名', readingKana: 'ゆうめい', readingRomaji: 'yuumei', partOfSpeech: 'naAdj', coreLevel: 'A', meaningZh: '有名', exampleJa: '有名な店です。', exampleZh: '有名的店。', sources: [ext(extNote)], review: 'draft' },
  { id: 'fi-jouzu', lemma: '上手', displayForm: '上手', readingKana: 'じょうず', readingRomaji: 'jouzu', partOfSpeech: 'naAdj', coreLevel: 'A', meaningZh: '擅长', exampleJa: '料理が上手です。', exampleZh: '擅长做菜。', usageNoteZh: '对象用「が」。夸自己一般不用「上手」。', sources: [ext(extNote)], review: 'draft' },
  // ── 名詞・場面（12語・§10） ──
  { id: 'fi-ie', lemma: '家', displayForm: '家', readingKana: 'いえ', readingRomaji: 'ie', partOfSpeech: 'noun', sceneCategory: 'life', coreLevel: 'A', meaningZh: '家・房子', exampleJa: '家に帰ります。', exampleZh: '回家。', sources: [xls(MIN, 80, 'C80', '語彙行「家」')], review: 'draft' },
  { id: 'fi-eki', lemma: '駅', displayForm: '駅', readingKana: 'えき', readingRomaji: 'eki', partOfSpeech: 'noun', sceneCategory: 'transport', coreLevel: 'A', imageAssetId: 'va-scene-station', meaningZh: '车站', exampleJa: '駅で会いましょう。', exampleZh: '在车站见吧。', sources: [xls(MIN, 73, 'C73', '語彙行「駅」')], review: 'draft' },
  { id: 'fi-gakkou', lemma: '学校', displayForm: '学校', readingKana: 'がっこう', readingRomaji: 'gakkou', partOfSpeech: 'noun', sceneCategory: 'work_school', coreLevel: 'A', meaningZh: '学校', exampleJa: '学校に行きます。', exampleZh: '去学校。', sources: [xls(MIN, 71, 'C71', '語彙行「学校」')], review: 'draft' },
  { id: 'fi-byouin', lemma: '病院', displayForm: '病院', readingKana: 'びょういん', readingRomaji: 'byouin', partOfSpeech: 'noun', sceneCategory: 'health', coreLevel: 'A', imageAssetId: 'va-scene-hospital', meaningZh: '医院', exampleJa: '病院に行きます。', exampleZh: '去医院。', usageNoteZh: '「びょういん」和「びよういん（美容院）」读音不同，注意长音。', sources: [xls(MIN, 75, 'C75', '語彙行「病院」')], review: 'draft' },
  { id: 'fi-kusuri', lemma: '薬', displayForm: '薬', readingKana: 'くすり', readingRomaji: 'kusuri', partOfSpeech: 'noun', sceneCategory: 'health', coreLevel: 'A', meaningZh: '药', exampleJa: '薬を飲みます。', exampleZh: '吃药。', usageNoteZh: '日语「吃药」用「飲む」。', sources: [ext(extNote)], review: 'draft' },
  { id: 'fi-mizu', lemma: '水', displayForm: '水', readingKana: 'みず', readingRomaji: 'mizu', partOfSpeech: 'noun', sceneCategory: 'food', coreLevel: 'A', meaningZh: '水', exampleJa: '水をください。', exampleZh: '请给我水。', sources: [xls(MIN, 122, 'C122', '語彙行「水」')], review: 'draft' },
  { id: 'fi-tomodachi', lemma: '友達', displayForm: '友達', readingKana: 'ともだち', readingRomaji: 'tomodachi', partOfSpeech: 'noun', sceneCategory: 'people', coreLevel: 'A', meaningZh: '朋友', exampleJa: '友達と話します。', exampleZh: '和朋友聊天。', sources: [xls(MIN, 58, 'C58', '語彙行「友達」')], review: 'draft' },
  { id: 'fi-kazoku', lemma: '家族', displayForm: '家族', readingKana: 'かぞく', readingRomaji: 'kazoku', partOfSpeech: 'noun', sceneCategory: 'people', coreLevel: 'A', meaningZh: '家人', exampleJa: '家族は中国にいます。', exampleZh: '家人在中国。', sources: [xls(MIN, 59, 'C59', '語彙行「家族」')], review: 'draft' },
  { id: 'fi-shigoto', lemma: '仕事', displayForm: '仕事', readingKana: 'しごと', readingRomaji: 'shigoto', partOfSpeech: 'noun', sceneCategory: 'work_school', coreLevel: 'A', meaningZh: '工作', exampleJa: '仕事が忙しいです。', exampleZh: '工作很忙。', sources: [xls(MIN, 152, 'C152', '語彙行「仕事」')], review: 'draft' },
  { id: 'fi-okane', lemma: 'お金', displayForm: 'お金', readingKana: 'おかね', readingRomaji: 'okane', partOfSpeech: 'noun', sceneCategory: 'time_money', coreLevel: 'A', meaningZh: '钱', exampleJa: 'お金を払います。', exampleZh: '付钱。', sources: [xls(MIN, 151, 'C151', '語彙行「お金」')], review: 'draft' },
  { id: 'fi-basu', lemma: 'バス', displayForm: 'バス', readingKana: 'ばす', readingRomaji: 'basu', partOfSpeech: 'noun', sceneCategory: 'transport', coreLevel: 'A', meaningZh: '公交车', exampleJa: 'バスに乗ります。', exampleZh: '坐公交车。', sources: [xls(MIN, 107, 'C107', '語彙行「バス」')], review: 'draft' },
  { id: 'fi-sensei', lemma: '先生', displayForm: '先生', readingKana: 'せんせい', readingRomaji: 'sensei', partOfSpeech: 'noun', sceneCategory: 'people', coreLevel: 'A', meaningZh: '老师', exampleJa: '先生に聞きます。', exampleZh: '问老师。', usageNoteZh: '日语「先生」指老师・医生等，不是中文「先生（Mr.）」。', sources: [ext(extNote)], review: 'draft' },
];

/** ことば図鑑の全語彙（既存Item再利用＋新規・重複禁止・§23） */
export const allVocabularyItems = (): FoundationItem[] => {
  const map = new Map<string, FoundationItem>();
  for (const it of [...UNIT1_ITEMS, ...BANK_ITEMS, ...VOCAB_NEW_ITEMS, ...N3_ITEMS]) {
    if (!map.has(it.id)) map.set(it.id, it);
  }
  return [...map.values()];
};

export type VocabCategory = 'verbs' | 'iAdj' | 'naAdj' | 'nouns' | 'scenes' | 'all';
export const vocabByCategory = (items: FoundationItem[], cat: VocabCategory): FoundationItem[] => {
  switch (cat) {
    case 'verbs': return items.filter((i) => i.partOfSpeech === 'verb');
    case 'iAdj': return items.filter((i) => i.partOfSpeech === 'iAdj');
    case 'naAdj': return items.filter((i) => i.partOfSpeech === 'naAdj');
    case 'nouns': return items.filter((i) => i.partOfSpeech === 'noun');
    case 'scenes': return items.filter((i) => !!i.sceneCategory);
    default: return items;
  }
};
