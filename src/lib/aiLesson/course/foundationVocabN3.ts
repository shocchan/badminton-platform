// N3準備・語彙拡張パック（Phase 2D §6-§8・全draft・N3は「目安」で公式断定なし）。
// 既存Itemと重複しない新規62語。出典監査 2026-07-27（Excel読み取り専用照合・未発見はexternal_scope明示）。
// 目標別role監査は vocabularyRoleMeta.ts（Phase 2E-1 §3）。
import type { FoundationItem } from './foundationTypes';

type Ref = FoundationItem['sources'][number];
const xls = (sheet: string, row: number, cell: string, match: Ref['sourceMatchType'], label: string): Ref =>
  ({ sourceKind: 'teacher_workbook', sourceSheet: sheet, sourceRow: row, cellRange: cell, sourceMatchType: match, sourceLabel: label });
const ext = (label = 'Excel内に単独語彙セルなし。標準N3目安範囲から補完'): Ref =>
  ({ sourceKind: 'reviewed_textbook_scope', sourceSheet: null, sourceRow: null, cellRange: null, sourceMatchType: 'external_scope', sourceLabel: label });
const SAN = '3単語例文'; const MIN = '最初に覚える最低限表現'; const JIDO = '自動詞・他動詞46選';

const v = (id: string, lemma: string, kana: string, romaji: string, pos: FoundationItem['partOfSpeech'],
  zh: string, forms: string[], exJa: string, exZh: string, src: Ref[], noteZh?: string, group?: FoundationItem['verbGroup']): FoundationItem => ({
  id, lemma, displayForm: lemma, readingKana: kana, readingRomaji: romaji, partOfSpeech: pos,
  ...(group ? { verbGroup: group } : {}), coreLevel: 'B',
  meaningZh: zh, commonFormsJa: forms, exampleJa: exJa, exampleZh: exZh,
  ...(noteZh ? { usageNoteZh: noteZh } : {}), sources: src, review: 'draft',
});

export const N3_ITEMS: FoundationItem[] = [
  // ── 変化・自他（自動詞・他動詞46選と接続） ──
  v('fi-kawaru', '変わる', 'かわる', 'kawaru', 'verb', '（自）变化；改变', ['状況が変わる', '予定が変わりました'], '来年、仕事が変わります。', '明年工作会有变动。', [xls(JIDO, 18, 'C18', 'exact_lexeme', '自動詞・他動詞46選「変わる」')], '自动词：〜が変わる。', 'g1'),
  v('fi-kaeru-change', '変える', 'かえる', 'kaeru', 'verb', '（他）改变；换', ['予定を変える', '考え方を変えました'], '会議の時間を変えました。', '改了会议时间。', [xls(JIDO, 18, 'D18', 'exact_lexeme', '自動詞・他動詞46選「変える」')], '他动词：〜を変える。和「帰る（かえる）」同音。', 'g2'),
  v('fi-fueru', '増える', 'ふえる', 'fueru', 'verb', '（自）增加', ['仕事が増える', '人が増えています'], '日本語を話す機会が増えました。', '说日语的机会变多了。', [ext()], undefined, 'g2'),
  v('fi-heru', '減る', 'へる', 'heru', 'verb', '（自）减少', ['残業が減る', 'お金が減りました'], '最近、体重が減りました。', '最近体重减轻了。', [ext()], undefined, 'g1'),
  v('fi-hajimeru', '始める', 'はじめる', 'hajimeru', 'verb', '（他）开始（做某事）', ['勉強を始める', '仕事を始めました'], '先月、日本語の勉強を始めました。', '上个月开始学日语了。', [xls(SAN, 17, 'D17', 'exact_lexeme', '3単語例文「始める」')], '自动词是「始まる」。', 'g2'),
  v('fi-owaru', '終わる', 'おわる', 'owaru', 'verb', '（自）结束', ['仕事が終わる', '会議が終わりました'], '仕事は6時に終わります。', '工作6点结束。', [xls(MIN, 194, 'C194', 'exact_lexeme', '語彙行「終わる」')], undefined, 'g1'),
  v('fi-tsuzukeru', '続ける', 'つづける', 'tsuzukeru', 'verb', '（他）继续（做）', ['勉強を続ける', '運動を続けています'], '毎日少しずつ勉強を続けています。', '每天继续学一点。', [xls(SAN, 18, 'D18', 'exact_lexeme', '3単語例文「続ける」')], undefined, 'g2'),
  v('fi-tsuzuku', '続く', 'つづく', 'tsuzuku', 'verb', '（自）持续', ['雨が続く', '忙しい日が続いています'], '暑い日が続いています。', '炎热的天气一直持续着。', [xls(JIDO, 14, 'C14', 'exact_lexeme', '自動詞・他動詞46選「続く」')], undefined, 'g1'),
  v('fi-kimeru', '決める', 'きめる', 'kimeru', 'verb', '（他）决定', ['予定を決める', '行く日を決めました'], '引っ越しの日を決めました。', '定了搬家的日子。', [xls(JIDO, 15, 'D15', 'exact_lexeme', '自動詞・他動詞46選「決める」')], undefined, 'g2'),
  v('fi-kimaru', '決まる', 'きまる', 'kimaru', 'verb', '（自）定下来', ['予定が決まる', '仕事が決まりました'], '新しい仕事が決まりました。', '新工作定下来了。', [xls('N3の文法120例文集', 22, 'C22', 'example_contains', 'N3文法例文内「決まる」（公式N3語彙の根拠にはしない）')], undefined, 'g1'),
  // ── 思考・伝達 ──
  v('fi-omou', '思う', 'おもう', 'omou', 'verb', '想；觉得', ['〜と思います', 'いいと思います'], '日本の生活は楽しいと思います。', '我觉得在日本的生活很开心。', [xls(MIN, 198, 'C198', 'exact_lexeme', '語彙行「思う」')], '表达意见的核心句型「〜と思います」。', 'g1'),
  v('fi-kangaeru', '考える', 'かんがえる', 'kangaeru', 'verb', '思考；考虑', ['方法を考える', 'よく考えてから決めます'], '転職について考えています。', '正在考虑换工作的事。', [xls('原：ビジネス敬語', 14, 'A14', 'exact_lexeme', 'ビジネス敬語シート「考える」')], '「思う」=感觉，「考える」=动脑思考。', 'g2'),
  v('fi-kanjiru', '感じる', 'かんじる', 'kanjiru', 'verb', '感觉到', ['成長を感じる', '不安を感じました'], '日本語の上達を感じています。', '我感觉自己的日语进步了。', [ext()], undefined, 'g2'),
  v('fi-tsutaeru', '伝える', 'つたえる', 'tsutaeru', 'verb', '转达；传达', ['気持ちを伝える', '予定を伝えました'], '店の人に希望を伝えました。', '我把自己的要求告诉了店员。', [xls('原：ビジネス敬語', 12, 'A12', 'exact_lexeme', 'ビジネス敬語シート「伝える」')], undefined, 'g2'),
  v('fi-setsumei', '説明する', 'せつめいする', 'setsumei suru', 'verb', '说明', ['理由を説明する', '使い方を説明します'], '状況を説明してください。', '请说明一下情况。', [xls(SAN, 22, 'D22', 'exact_lexeme', '3単語例文「説明する」')], undefined, 'g3'),
  v('fi-soudan', '相談する', 'そうだんする', 'soudan suru', 'verb', '商量；咨询', ['先生に相談する', '家族と相談します'], '上司に相談してから決めます。', '和上司商量后再决定。', [xls(SAN, 9, 'D9', 'exact_lexeme', '3単語例文「相談する」')], '对象用「に」或「と」。', 'g3'),
  v('fi-renraku', '連絡する', 'れんらくする', 'renraku suru', 'verb', '联系', ['会社に連絡する', '後で連絡します'], '遅れるときは連絡してください。', '要迟到时请联系我。', [xls(SAN, 16, 'D16', 'exact_lexeme', '3単語例文「連絡する」')], undefined, 'g3'),
  v('fi-kakunin', '確認する', 'かくにんする', 'kakunin suru', 'verb', '确认', ['予定を確認する', 'メールを確認しました'], '時間と場所を確認します。', '确认时间和地点。', [ext()], undefined, 'g3'),
  // ── 準備・生活動詞 ──
  v('fi-junbi', '準備する', 'じゅんびする', 'junbi suru', 'verb', '准备', ['資料を準備する', '引っ越しの準備をしています'], '面接の準備をしています。', '正在准备面试。', [xls(SAN, 12, 'D12', 'exact_lexeme', '3単語例文「準備する」')], undefined, 'g3'),
  v('fi-yoyaku', '予約する', 'よやくする', 'yoyaku suru', 'verb', '预约；预订', ['店を予約する', '病院を予約しました'], 'レストランを予約しました。', '订了餐厅。', [xls(MIN, 213, 'C213', 'exact_lexeme', '語彙行「予約する」')], undefined, 'g3'),
  v('fi-riyou', '利用する', 'りようする', 'riyou suru', 'verb', '利用；使用（服务）', ['電車を利用する', 'アプリを利用しています'], 'よくこのアプリを利用しています。', '经常使用这个APP。', [xls('原：動詞使用頻度順', 10, 'C10', 'exact_lexeme', '使用頻度順「利用する」')], '「使う」=具体工具，「利用する」=服务・设施。', 'g3'),
  v('fi-erabu', '選ぶ', 'えらぶ', 'erabu', 'verb', '选择', ['プレゼントを選ぶ', '言葉を選んで話します'], '安い方を選びました。', '选了便宜的那个。', [ext()], undefined, 'g1'),
  v('fi-shiraberu', '調べる', 'しらべる', 'shiraberu', 'verb', '查；调查', ['意味を調べる', 'ネットで調べました'], '分からない言葉を調べます。', '查不懂的单词。', [ext()], undefined, 'g2'),
  v('fi-oboeru', '覚える', 'おぼえる', 'oboeru', 'verb', '记住', ['単語を覚える', '名前を覚えました'], '毎日3語ずつ覚えています。', '每天记3个词。', [ext()], undefined, 'g2'),
  v('fi-wasureru', '忘れる', 'わすれる', 'wasureru', 'verb', '忘记', ['読み方を忘れる', '傘を忘れました'], '漢字の読み方を忘れました。', '忘了汉字的读法。', [xls(MIN, 197, 'C197', 'exact_lexeme', '語彙行「忘れる」')], undefined, 'g2'),
  v('fi-kuraberu', '比べる', 'くらべる', 'kuraberu', 'verb', '比较', ['値段を比べる', '前と比べて'], '中国と比べて、日本は電車が多いです。', '和中国相比，日本电车更多。', [ext()], '「〜と比べて」表示比较基准。', 'g2'),
  v('fi-nareru', '慣れる', 'なれる', 'nareru', 'verb', '习惯', ['生活に慣れる', '仕事に慣れました'], '日本の生活にだいぶ慣れました。', '已经很习惯日本的生活了。', [ext()], '对象用「に」：〜に慣れる。', 'g2'),
  v('fi-komaru', '困る', 'こまる', 'komaru', 'verb', '为难；困扰', ['返事に困る', 'お金に困っています'], '漢字が読めなくて困りました。', '因为不会读汉字，我很为难。', [xls(SAN, 13, 'E13', 'exact_lexeme', '3単語例文「困る」')], '表示“不知道怎么办”的为难或困扰感。', 'g1'),
  v('fi-ganbaru', '頑張る', 'がんばる', 'ganbaru', 'verb', '努力；加油', ['仕事を頑張る', 'もう少し頑張ります'], '日本語の勉強を頑張っています。', '正在努力学日语。', [xls(SAN, 32, 'D32', 'exact_lexeme', '3単語例文「頑張る」')], undefined, 'g1'),
  // ── 抽象名詞 ──
  v('fi-kimochi', '気持ち', 'きもち', 'kimochi', 'noun', '心情；感受；心意', ['気持ちを伝える', '気持ちが分かる'], '感謝の気持ちを伝えたいです。', '我想表达感谢之情。', [ext()]),
  v('fi-kibun', '気分', 'きぶん', 'kibun', 'noun', '状态；心情好坏', ['気分がいい', '気分が悪くなりました'], '今日は気分がいいです。', '今天状态很好。', [ext()], '「気持ち」=内心感受，「気分」=当下状态。「気分が悪い」多指身体不舒服。注意不要和中文“气氛”混淆：「気分」表示个人的心情或身体感受，“气氛”表示环境中的氛围。'),
  v('fi-riyuu', '理由', 'りゆう', 'riyuu', 'noun', '理由', ['理由を説明する', '遅れた理由'], '日本に来た理由は仕事です。', '来日本的理由是工作。', [xls('N3の文法120例文集', 60, 'C60', 'example_contains', 'N3文法例文内「理由」（公式N3語彙の根拠にはしない）')]),
  v('fi-iken', '意見', 'いけん', 'iken', 'noun', '意见；看法', ['意見を言う', '意見を聞く'], '会議で意見を言いました。', '在会议上发表了意见。', [xls(SAN, 21, 'C21', 'exact_lexeme', '3単語例文「意見」')]),
  v('fi-keiken', '経験', 'けいけん', 'keiken', 'noun', '经验；经历', ['経験がある', 'いい経験になりました'], '接客の経験があります。', '有接待客人的经验。', [xls(SAN, 24, 'C24', 'exact_lexeme', '3単語例文「経験」')]),
  v('fi-yotei', '予定', 'よてい', 'yotei', 'noun', '计划；安排；预定事项', ['予定がある', '予定を変える'], '週末は予定があります。', '周末有安排。', [xls(SAN, 19, 'C19', 'exact_lexeme', '3単語例文「予定」')]),
  v('fi-shuukan', '習慣', 'しゅうかん', 'shuukan', 'noun', '习惯', ['習慣にする', '毎朝の習慣'], '朝散歩するのが習慣です。', '早上散步是我的习惯。', [xls(SAN, 18, 'C18', 'exact_lexeme', '3単語例文「習慣」')]),
  v('fi-houhou', '方法', 'ほうほう', 'houhou', 'noun', '方法', ['いい方法', '方法を考える'], '覚える方法を変えました。', '改变了记忆的方法。', [ext()]),
  v('fi-mondai', '問題', 'もんだい', 'mondai', 'noun', '问题', ['問題がある', '問題を解決する'], '特に問題はありません。', '没有什么问题。', [xls(MIN, 156, 'C156', 'exact_lexeme', '語彙行「問題」')]),
  v('fi-joukyou', '状況', 'じょうきょう', 'joukyou', 'noun', '情况；状况', ['状況を確認する', '状況が変わる'], '現在の状況を説明します。', '说明一下现在的情况。', [ext()]),
  v('fi-kankei', '関係', 'かんけい', 'kankei', 'noun', '关系', ['仕事に関係がある', '人間関係'], '仕事に関係がある言葉を覚えたいです。', '想记住和工作有关的词。', [ext()]),
  v('fi-jouhou', '情報', 'じょうほう', 'jouhou', 'noun', '信息', ['情報を集める', '新しい情報'], 'ネットで情報を集めました。', '在网上收集了信息。', [ext()]),
  v('fi-tsugou', '都合', 'つごう', 'tsugou', 'noun', '（时间上的）方便', ['都合がいい', '都合が悪い'], '明日は都合が悪いです。', '明天不方便。', [ext()], '拒绝邀约的常用委婉说法。'),
  v('fi-yakusoku', '約束', 'やくそく', 'yakusoku', 'noun', '约定', ['約束を守る', '友達と約束がある'], '友達と約束があります。', '和朋友有约。', [ext()]),
  v('fi-kyoumi', '興味', 'きょうみ', 'kyoumi', 'noun', '兴趣', ['興味がある', '日本文化に興味を持つ'], '日本の文化に興味があります。', '对日本文化感兴趣。', [ext()], '对象用「に」：〜に興味がある。'),
  // ── 感情・状態の形容詞 ──
  v('fi-ureshii', '嬉しい', 'うれしい', 'ureshii', 'iAdj', '高兴', ['会えて嬉しい', '嬉しかったです'], '合格できて嬉しいです。', '能合格很开心。', [xls(MIN, 241, 'C241', 'exact_lexeme', '語彙行「嬉しい」')]),
  v('fi-kanashii', '悲しい', 'かなしい', 'kanashii', 'iAdj', '悲伤', ['悲しいニュース', '悲しくなりました'], '別れは悲しいです。', '离别很伤感。', [xls(MIN, 243, 'C243', 'exact_lexeme', '語彙行「悲しい」')]),
  v('fi-sabishii', '寂しい', 'さびしい', 'sabishii', 'iAdj', '寂寞', ['一人で寂しい', '家族と離れて寂しいです'], '家族と離れて寂しいです。', '和家人分开很寂寞。', [ext()]),
  v('fi-hazukashii', '恥ずかしい', 'はずかしい', 'hazukashii', 'iAdj', '害羞；难为情', ['間違えて恥ずかしい', '恥ずかしがらないで'], '発音を間違えて恥ずかしかったです。', '发音错了很不好意思。', [xls(SAN, 4, 'E4', 'exact_lexeme', '3単語例文「恥ずかしい」')]),
  v('fi-kibishii', '厳しい', 'きびしい', 'kibishii', 'iAdj', '严格；严峻', ['厳しい先生', '時間に厳しい'], '日本の会社は時間に厳しいです。', '日本公司对时间要求很严格。', [xls('性格（動画1）', 4, 'B4', 'exact_lexeme', '性格シート「厳しい」')]),
  v('fi-taihen', '大変', 'たいへん', 'taihen', 'naAdj', '辛苦；不容易', ['仕事が大変', '大変ですね'], '子育ては大変ですが、楽しいです。', '带孩子很辛苦，但也很快乐。', [ext()], '寒暄常用「大変ですね」。'),
  v('fi-hitsuyou', '必要', 'ひつよう', 'hitsuyou', 'naAdj', '必要；需要', ['準備が必要', 'ビザが必要です'], 'この手続きには印鑑が必要です。', '这个手续需要印章。', [ext()], '「〜が必要です」＝需要〜。'),
  v('fi-muri', '無理', 'むり', 'muri', 'naAdj', '勉强；办不到', ['無理をしない', '今日は無理です'], '無理をしないでください。', '请不要勉强自己。', [xls(SAN, 32, 'C32', 'exact_lexeme', '3単語例文「無理」')], '拒绝时常用「ちょっと無理です」。'),
  v('fi-fukuzatsu', '複雑', 'ふくざつ', 'fukuzatsu', 'naAdj', '复杂', ['複雑な手続き', '気持ちが複雑'], '日本の電車は少し複雑です。', '日本的电车有点复杂。', [xls(SAN, 22, 'C22', 'exact_lexeme', '3単語例文「複雑」')]),
  v('fi-jiyuu', '自由', 'じゆう', 'jiyuu', 'naAdj', '自由', ['自由な時間', '自由に選ぶ'], '週末は自由な時間が多いです。', '周末自由时间比较多。', [ext()]),
  // ── 副詞・接続 ──
  v('fi-tabun', 'たぶん', 'たぶん', 'tabun', 'expression', '大概；可能', ['たぶん大丈夫', 'たぶん行けます'], 'たぶん間に合うと思います。', '我想大概来得及。', [xls('原：副詞使用頻度順', 48, 'C48', 'exact_lexeme', '副詞使用頻度順「たぶん」')]),
  v('fi-kanarazu', '必ず', 'かならず', 'kanarazu', 'expression', '一定；务必', ['必ず連絡する', '必ず来てください'], '明日は必ず連絡します。', '明天一定联系你。', [ext()]),
  v('fi-saikin', '最近', 'さいきん', 'saikin', 'expression', '最近', ['最近忙しい', '最近始めた'], '最近、運動を始めました。', '最近开始运动了。', [ext()]),
  v('fi-zenzen', '全然', 'ぜんぜん', 'zenzen', 'expression', '完全（不）', ['全然分からない', '全然大丈夫'], '説明が速くて全然分かりませんでした。', '解释太快完全没听懂。', [ext()], '基本和否定搭配：全然〜ない。'),
  v('fi-nakanaka', 'なかなか', 'なかなか', 'nakanaka', 'expression', '（不）容易；相当', ['なかなか覚えられない', 'なかなかいい'], '敬語はなかなか覚えられません。', '敬语很难记住。', [xls(SAN, 14, 'E14', 'exact_lexeme', '3単語例文「なかなか」')], '「なかなか〜ない」＝怎么也不…。'),
  v('fi-yatto', 'やっと', 'やっと', 'yatto', 'expression', '终于', ['やっと終わった', 'やっと慣れました'], 'やっと仕事に慣れました。', '终于习惯工作了。', [xls(SAN, 22, 'E22', 'exact_lexeme', '3単語例文「やっと」')]),
  v('fi-tsumari', 'つまり', 'つまり', 'tsumari', 'expression', '也就是说', ['つまり〜ということ'], 'つまり、明日は休みということですね。', '也就是说明天休息，对吧。', [xls('原：接続詞使用頻度順（話し言葉）', 18, 'C18', 'exact_lexeme', '接続詞頻度順「つまり」')]),
  v('fi-sorede', 'それで', 'それで', 'sorede', 'expression', '所以；然后', ['それでどうしましたか'], '電車が遅れました。それで、会社に遅刻しました。', '电车晚点了，所以我上班迟到了。', [xls(SAN, 7, 'E7', 'exact_lexeme', '3単語例文「それで」')]),
];

// 多義語sense（Phase 2E-1 §7・Item分類だけでは誤解が出る語のみ。無理に全語へ付けない）
const withSenses = (id: string, senses: NonNullable<FoundationItem['senses']>): void => {
  const it = N3_ITEMS.find((i) => i.id === id);
  if (it) it.senses = senses;
};
withSenses('fi-taihen', [
  { id: 'taihen-hard', meaningZh: '辛苦；费力（仕事が大変）' },
  { id: 'taihen-serious', meaningZh: '不得了；糟了（大変だ！）', noteJa: '程度が大きい・緊急の意' },
]);
withSenses('fi-tsugou', [
  { id: 'tsugou-convenience', meaningZh: '（时间上）方便与否（都合がいい／悪い）' },
  { id: 'tsugou-arrangement', meaningZh: '因故；安排上的原因（都合により）', noteJa: '書き言葉寄り' },
]);

export const n3ItemById = (id: string): FoundationItem | undefined => N3_ITEMS.find((i) => i.id === id);
