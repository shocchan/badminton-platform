// 漢字バンク N4 バッチD — 動作・変化（30字）。
//
// ■ このバッチの範囲
//   「体や物が動く／状態が変わる／頭の中で何かをする」を表す字に絞った。
//   テーマ指定にあった「送」「受」「集」、および候補に挙げていた「引」「返」「思」「変」は
//   他バッチ（n4a / n4b / n4c）が先に収録していたため外し、
//   同じ動作・変化の枠に入る「開 閉 起 押 落 選 覚 忘 投 進 折 割」を足して30字ちょうどにした。
//   仕事・学校（n4b）、生活手続き（n4a）、気持ち・性質（n4c）、自然・場所（n5d）の字は入れていない。
//
// ■ 鉄則（kanjiTypes.ts の冒頭と同じ）
// - 読み・訳・例語・注記はすべて**自社で書き起こしたもの**。他ソースの音訓表・訳文は写していない。
// - onyomi / kunyomi は「N4段階で実際に使う主要な読み」だけを載せる。
//   常用漢字表にあっても稀にしか出ない読み（止の「や(める)」は表外、定の「さだ(める)」「ジョウ」、
//   取の「シュ」の熟語など）は学習者を混乱させるので意図的に落とした。
//   → 空配列は「常用の読みが無い」ではなく「この段階で覚える読みが無い」を含む。
// - 画数・部首は1字ずつ数え、部首は日本の漢和辞典の分類に合わせた
//   （化＝匕部、直＝目部、曲＝曰部、割＝刂部。見た目の偏に引きずられない）。
// - 中国語フィールドは簡体字。日本語を出すときは必ず「」で引用する。
// - chineseNote は「中国語母語者が実際につまずく点」だけを書く。字の意味の説明はしない
//   （意味は既に知っている。測る価値があるのは 読み／日中の字形差・意味差／送り仮名）。
//
// ■ 例語の裏取り
//   inVocabBank は層Cの語彙バンク（ALL_VOCAB_CONTENT の active_beta）に同じ表記が実在するかを
//   実測して入れた値（例語96件中79件が実在＝82%）。false の17語
//   （始める・終わる・予定・考える・気持ち・使う・作る・曲・開店・閉店・起きる・押さえる・
//     割る・選ぶ・覚える・忘れる・忘年会）は教材上どうしても外せない基本語なので、
//   訳をこのファイルで新規に書き起こした。
//
import type { KanjiEntry } from './kanjiTypes';

const BATCH_ID = 'n4d';

export const KANJI_N4_D: KanjiEntry[] = [
  {
    entryId: 'kj-n4d-01',
    character: '始',
    onyomi: ['シ'],
    kunyomi: ['はじ・める', 'はじ・まる'],
    meaningZh: '开始；起头',
    strokeCount: 8,
    radical: { form: '女', readingJa: 'おんなへん', meaningZh: '与女性、生育有关' },
    level: 'N4',
    words: [
      { surface: '始まる', reading: 'はじまる', glossZh: '开始（自然发生，不由人控制）', inVocabBank: true },
      { surface: '始める', reading: 'はじめる', glossZh: '开始做（人主动着手）', inVocabBank: false },
      { surface: '開始', reading: 'かいし', glossZh: '开始（正式说法）', inVocabBank: true },
    ],
    chineseNote: '字形与简体字相同，难点全在用法。中文一个"开始"两边通吃，日语却分成一对自他动词：'
      + '「授業が始まる」（课自己开始了）和「授業を始める」（人把课开起来）。'
      + '中国学习者最常说错「授業を始まります」。读音也要分开记：训读「はじ」用于这一对动词，'
      + '音读「シ」只出现在「開始」这类汉语词里。',
    mnemonicZh: '「女」＋「台」＝生命从母亲那里"登台"起步 → 开始。左边的「女」要写得窄长。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-02',
    character: '終',
    onyomi: ['シュウ'],
    kunyomi: ['お・わる', 'お・える'],
    meaningZh: '结束；末尾',
    strokeCount: 11,
    radical: { form: '糸', readingJa: 'いとへん', meaningZh: '与线、纺织有关' },
    level: 'N4',
    words: [
      { surface: '終わる', reading: 'おわる', glossZh: '结束（自然结束）', inVocabBank: false },
      { surface: '終わり', reading: 'おわり', glossZh: '结束；末尾', inVocabBank: true },
      { surface: '最終', reading: 'さいしゅう', glossZh: '最终的；最后一班', inVocabBank: true },
      { surface: '終電', reading: 'しゅうでん', glossZh: '末班电车', inVocabBank: true },
    ],
    chineseNote: '简体字是「终」，左边的「纟」在日语里写成完整的「糸」（六画），右边同样是「冬」。'
      + '用法上注意：日语的「終電」指当天最后一班电车，是生活里天天用的词，中文没有"终电"这种说法，'
      + '要整词记。另外「終わる」（自）和「終える」（他）也成对，跟「始まる／始める」是同一个思路。',
    mnemonicZh: '「糸」＋「冬」＝线走到了冬天就到头了；一年的最后是冬天 → 结束。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-03',
    character: '続',
    onyomi: ['ゾク'],
    kunyomi: ['つづ・く', 'つづ・ける'],
    meaningZh: '继续；接连',
    strokeCount: 13,
    radical: { form: '糸', readingJa: 'いとへん', meaningZh: '与线、纺织有关' },
    level: 'N4',
    words: [
      { surface: '続く', reading: 'つづく', glossZh: '持续下去，接连不断', inVocabBank: true },
      { surface: '続ける', reading: 'つづける', glossZh: '（人主动）坚持做下去', inVocabBank: true },
      { surface: '連続', reading: 'れんぞく', glossZh: '连续', inVocabBank: true },
    ],
    chineseNote: '这个字的字形要单独记：简体字「续」右边是「卖」，而日语的「続」右边是「売」（七画），'
      + '两者形状完全不一样，不能靠简体字推。用法上又是一对自他动词：'
      + '「雨が続く」（雨一直下）／「勉強を続ける」（坚持学习）。',
    mnemonicZh: '「糸」＋「売」＝丝线一根接一根不断头。右边按日语字形「売」记，不要写成简体的「卖」。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-04',
    character: '止',
    onyomi: ['シ'],
    kunyomi: ['と・まる', 'と・める'],
    meaningZh: '停；停止',
    strokeCount: 4,
    radical: { form: '止', readingJa: 'とめる', meaningZh: '脚；停下' },
    level: 'N4',
    words: [
      { surface: '止まる', reading: 'とまる', glossZh: '停；停下来', inVocabBank: true },
      { surface: '止める', reading: 'とめる', glossZh: '使…停下；关掉', inVocabBank: true },
      { surface: '中止', reading: 'ちゅうし', glossZh: '中止；停办', inVocabBank: true },
    ],
    chineseNote: '中文里表示"停"多用「停」，「止」偏书面；日语正好反过来，「止まる」是每天都用的口语词。'
      + '读音随词而变：训读「と」用于「止まる・止める」，音读「シ」只用于「中止」「禁止」这类汉语词。'
      + '另外「やめる」（不做了）虽然有时也写成这个字，但常用汉字表里没有这个读法，'
      + '初级阶段一律写假名或用「辞める」（辞职），不要混进来。',
    mnemonicZh: '象形字，本来画的是一只停在原地的脚掌 → 停。四画，最后一横写得最长。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-05',
    character: '動',
    onyomi: ['ドウ'],
    kunyomi: ['うご・く', 'うご・かす'],
    meaningZh: '动；活动',
    strokeCount: 11,
    radical: { form: '力', readingJa: 'ちから', meaningZh: '力气；用力' },
    level: 'N4',
    words: [
      { surface: '動く', reading: 'うごく', glossZh: '动；运转', inVocabBank: true },
      { surface: '動かす', reading: 'うごかす', glossZh: '移动；开动（他动词）', inVocabBank: true },
      { surface: '運動', reading: 'うんどう', glossZh: '运动（锻炼身体）', inVocabBank: true },
      { surface: '自動', reading: 'じどう', glossZh: '自动', inVocabBank: true },
    ],
    chineseNote: '简体字「动」把左半边整个换掉了，日语保留「重」＋「力」共十一画，要按日语字形写。'
      + '用法上注意「動く」不只是"动"，机器"能用、转得起来"也说「動く」'
      + '（「このパソコンは動かない」＝这台电脑开不了机）。这层意思中文一般说"运转"，别直译。',
    mnemonicZh: '「重」＋「力」＝要用力才搬得动沉重的东西 → 动。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-06',
    character: '運',
    onyomi: ['ウン'],
    kunyomi: ['はこ・ぶ'],
    meaningZh: '搬运；运行；运气',
    strokeCount: 12,
    radical: { form: '辶', readingJa: 'しんにょう', meaningZh: '与走路、道路有关' },
    level: 'N4',
    words: [
      { surface: '運ぶ', reading: 'はこぶ', glossZh: '搬运；运送', inVocabBank: true },
      { surface: '運転', reading: 'うんてん', glossZh: '驾驶；开（车）', inVocabBank: true },
      { surface: '運動', reading: 'うんどう', glossZh: '运动（锻炼身体）', inVocabBank: true },
    ],
    chineseNote: '简体字「运」里面是「云」，日语的「運」里面是「軍」，字形差得很远，必须单独记。'
      + '意思上有一个大陷阱：日语的「運転」是"开车、驾驶"（「運転免許」＝驾照），'
      + '不是中文的"运转"；机器转动要说「動く」。另外「運」单用时是"运气"（「運がいい」＝运气好）。',
    mnemonicZh: '「辶（走之）」＋「軍」＝军队在路上行进 → 搬运、运行。日语保留「軍」，不写成「云」。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-07',
    character: '転',
    onyomi: ['テン'],
    kunyomi: ['ころ・ぶ'],
    meaningZh: '转动；翻倒',
    strokeCount: 11,
    radical: { form: '車', readingJa: 'くるまへん', meaningZh: '与车辆有关' },
    level: 'N4',
    words: [
      { surface: '運転', reading: 'うんてん', glossZh: '驾驶；开（车）', inVocabBank: true },
      { surface: '自転車', reading: 'じてんしゃ', glossZh: '自行车', inVocabBank: true },
      { surface: '転ぶ', reading: 'ころぶ', glossZh: '摔倒', inVocabBank: true },
    ],
    chineseNote: '三种字形要分清：繁体「轉」、简体「转」、日语新字体「転」。'
      + '日语是「車」＋「云」，左边的车字旁保留七画的「車」，右边不是简体的「专」。'
      + '意思上，日语的「転ぶ」＝摔倒，中文的「转」没有这个用法，是靠日语单独记的词。',
    mnemonicZh: '「車」＋「云」＝车轮像云一样滚动 → 转动、滚倒。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-08',
    character: '取',
    onyomi: ['シュ'],
    kunyomi: ['と・る'],
    meaningZh: '拿；取得',
    strokeCount: 8,
    radical: { form: '又', readingJa: 'また', meaningZh: '右手；手的动作' },
    level: 'N4',
    words: [
      { surface: '取る', reading: 'とる', glossZh: '拿；取', inVocabBank: true },
      { surface: '受け取る', reading: 'うけとる', glossZh: '收下；接收', inVocabBank: true },
      { surface: '取り替える', reading: 'とりかえる', glossZh: '更换；替换', inVocabBank: true },
    ],
    chineseNote: '字形与中文相同，没有书写负担，难在「取る」的用法极广：'
      + '拿东西、请假（「休みを取る」）、订位（「席を取る」）、拿到资格（「資格を取る」）、'
      + '上年纪（「年を取る」）都用它。只按中文"取"去理解会漏掉一大半。'
      + '音读「シュ」在N4阶段几乎不出现，先把训读「と」用熟。',
    mnemonicZh: '「耳」＋「又（右手）」＝用手抓住耳朵拿过来 → 拿、取。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-09',
    character: '決',
    onyomi: ['ケツ'],
    kunyomi: ['き・める', 'き・まる'],
    meaningZh: '决定；确定',
    strokeCount: 7,
    radical: { form: '氵', readingJa: 'さんずい', meaningZh: '与水有关' },
    level: 'N4',
    words: [
      { surface: '決める', reading: 'きめる', glossZh: '（自己）决定，确定下来', inVocabBank: true },
      { surface: '決まる', reading: 'きまる', glossZh: '定下来，被确定（不由自己控制）', inVocabBank: true },
      { surface: '決定', reading: 'けってい', glossZh: '决定', inVocabBank: true },
    ],
    chineseNote: '这是最容易写错的一个：简体字「决」左边是两点水「冫」，日语的「決」是三点水「氵」，'
      + '一共七画。手写时务必写三点。用法上仍是自他成对：'
      + '「日程を決める」（我来定）／「日程が決まった」（日程定下来了）。',
    mnemonicZh: '「氵」＋「夬（缺口）」＝水冲开堤坝的缺口，一下子就定了 → 决定。记住是三点水。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-10',
    character: '定',
    onyomi: ['テイ'],
    kunyomi: [],
    meaningZh: '固定；确定下来',
    strokeCount: 8,
    radical: { form: '宀', readingJa: 'うかんむり', meaningZh: '房屋；屋顶' },
    level: 'N4',
    words: [
      { surface: '予定', reading: 'よてい', glossZh: '计划；安排好的日程', inVocabBank: false },
      { surface: '決定', reading: 'けってい', glossZh: '决定', inVocabBank: true },
      { surface: '安定', reading: 'あんてい', glossZh: '稳定', inVocabBank: true },
      { surface: '定期', reading: 'ていき', glossZh: '定期的；固定周期的', inVocabBank: true },
    ],
    chineseNote: '字形与中文相同，陷阱在词义：日语的「予定」＝计划、打算（「明日の予定」＝明天的安排），'
      + '而中文的"预定"多指预订、订购，两边对不上，是典型的同形异义词。'
      + '另外「定食（ていしょく）」＝套餐，是日本餐馆里天天见的词，中文没有对应说法。'
      + '这个字在N4阶段基本只出现在汉语词里，先记音读「テイ」。',
    mnemonicZh: '「宀（宝盖）」＋下面的「疋」＝人在屋子里安顿下来 → 定。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-11',
    character: '投',
    onyomi: ['トウ'],
    kunyomi: ['な・げる'],
    meaningZh: '投；扔',
    strokeCount: 7,
    radical: { form: '扌', readingJa: 'てへん', meaningZh: '与手的动作有关' },
    level: 'N4',
    words: [
      { surface: '投げる', reading: 'なげる', glossZh: '扔；投', inVocabBank: true },
      { surface: '投票', reading: 'とうひょう', glossZh: '投票', inVocabBank: true },
    ],
    chineseNote: '字形与中文相同（提手旁＋「殳」），共七画，书写没有负担。'
      + '难点在读音分工：动词用训读「な」（「ボールを投げる」），'
      + '「投票」这类汉语词用音读「トウ」。'
      + '另外日语的「投げる」多出一层引申义——半途撂挑子'
      + '（「仕事を投げる」＝把工作扔下不管），中文的"投"没有这个用法。',
    mnemonicZh: '「扌（提手旁）」＋「殳（手持的兵器）」＝举起手把东西掷出去 → 投、扔。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-12',
    character: '化',
    onyomi: ['カ'],
    kunyomi: ['ば・ける'],
    meaningZh: '变化；转化',
    strokeCount: 4,
    radical: { form: '匕', readingJa: 'さじのひ', meaningZh: '倒过来的人形；变化' },
    level: 'N4',
    words: [
      { surface: '文化', reading: 'ぶんか', glossZh: '文化', inVocabBank: true },
      { surface: '変化', reading: 'へんか', glossZh: '变化', inVocabBank: true },
      { surface: '化学', reading: 'かがく', glossZh: '化学', inVocabBank: true },
    ],
    chineseNote: '字形与中文相同，但部首不是左边的「亻」，而是右边的「匕」，查字典时要注意。'
      + '读音上有个日本人自己也头疼的地方：「化学」读「かがく」，跟「科学（かがく）」完全同音，'
      + '所以说话时常特意把「化学」念成「ばけがく」来区分。这是日语独有的现象，中文里不存在。',
    mnemonicZh: '「亻（站着的人）」＋「匕（倒过来的人）」＝一个人翻个身变成另一个样子 → 变化。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-13',
    character: '考',
    onyomi: ['コウ'],
    kunyomi: ['かんが・える'],
    meaningZh: '思考；琢磨',
    strokeCount: 6,
    radical: { form: '耂', readingJa: 'おいかんむり', meaningZh: '老人；年长' },
    level: 'N4',
    words: [
      { surface: '考える', reading: 'かんがえる', glossZh: '思考；认为', inVocabBank: false },
      { surface: '参考', reading: 'さんこう', glossZh: '参考', inVocabBank: true },
      { surface: '参考書', reading: 'さんこうしょ', glossZh: '详细讲解课本内容的辅导书', inVocabBank: true },
    ],
    chineseNote: '这是重要的同形异义字。中文的「考」第一反应是"考试、考上"，'
      + '但日语的「考える」＝思考、想，几乎不表示考试；考试要说「試験」或「テスト」。'
      + '看到「よく考えてください」千万别理解成"好好考一考"，意思是"请好好想一想"。'
      + '送假名固定写成「考える」，不写「考がえる」。',
    mnemonicZh: '「耂（老字头）」＋「丂」＝老人弯着腰慢慢琢磨 → 思考。共六画。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-14',
    character: '知',
    onyomi: ['チ'],
    kunyomi: ['し・る'],
    meaningZh: '知道；知识',
    strokeCount: 8,
    radical: { form: '矢', readingJa: 'やへん', meaningZh: '箭' },
    level: 'N4',
    words: [
      { surface: '知る', reading: 'しる', glossZh: '知道', inVocabBank: true },
      { surface: '知らせる', reading: 'しらせる', glossZh: '通知；告知', inVocabBank: true },
      { surface: '知識', reading: 'ちしき', glossZh: '知识', inVocabBank: true },
    ],
    chineseNote: '字形与中文相同，难点在活用。中文说"知道"是两个字的词，日语「知る」一个动词就够了，'
      + '但表示"（现在）知道"这个状态时必须说「知っています」，不能只说「知ります」。'
      + '否定更特别：要说「知りません」，说成「知っていません」就不自然。这一条是N4的常考点。',
    mnemonicZh: '「矢（箭）」＋「口」＝话说得像箭一样又快又准，说明心里清楚 → 知道。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-15',
    character: '進',
    onyomi: ['シン'],
    kunyomi: ['すす・む', 'すす・める'],
    meaningZh: '前进；进展',
    strokeCount: 11,
    radical: { form: '辶', readingJa: 'しんにょう', meaningZh: '与走路、道路有关' },
    level: 'N4',
    words: [
      { surface: '進む', reading: 'すすむ', glossZh: '前进；进展', inVocabBank: true },
      { surface: '進める', reading: 'すすめる', glossZh: '推进；使前进', inVocabBank: true },
      { surface: '進歩', reading: 'しんぽ', glossZh: '进步（技术、社会的发展）', inVocabBank: true },
      { surface: '進学', reading: 'しんがく', glossZh: '升学', inVocabBank: true },
    ],
    chineseNote: '字形差别很大：简体字「进」里面是「井」，只有七画；'
      + '日语的「進」里面是「隹」（短尾鸟，八画），一共十一画，不能按简体字推着写。'
      + '意思上两边接近，但日语多出两个中文不这么说的用法：'
      + '事情有进展说「工事が進む」，钟表走快了说「時計が進んでいる」。'
      + '仍然是自他成对：「進む」（自己往前）／「進める」（人去推进）。',
    mnemonicZh: '「辶（走之）」＋「隹（鸟）」＝鸟只会往前飞，不会倒着退 → 前进。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-16',
    character: '持',
    onyomi: ['ジ'],
    kunyomi: ['も・つ'],
    meaningZh: '拿着；持有',
    strokeCount: 9,
    radical: { form: '扌', readingJa: 'てへん', meaningZh: '与手的动作有关' },
    level: 'N4',
    words: [
      { surface: '持つ', reading: 'もつ', glossZh: '拿；带着', inVocabBank: true },
      { surface: '持ち物', reading: 'もちもの', glossZh: '当天需要带去的东西', inVocabBank: true },
      { surface: '気持ち', reading: 'きもち', glossZh: '心情；感受；身体的舒适程度', inVocabBank: false },
    ],
    chineseNote: '字形与中文相同。用法比中文的「持」宽得多：除了"拿着"，还表示"拥有"'
      + '（「車を持っている」＝有车）和"（食物、东西）撑得住"（「夏は持たない」＝夏天放不住）。'
      + '最重要的是「気持ち」——中文没有"气持"这个词，但日语里天天用，'
      + '既指心情（「気持ちがいい」＝舒服），也指心意。要当成一个整词背下来。',
    mnemonicZh: '「扌（提手旁）」＋「寺」＝手里稳稳地拿着东西 → 拿、持有。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-17',
    character: '使',
    onyomi: ['シ'],
    kunyomi: ['つか・う'],
    meaningZh: '使用；差遣',
    strokeCount: 8,
    radical: { form: '亻', readingJa: 'にんべん', meaningZh: '与人有关' },
    level: 'N4',
    words: [
      { surface: '使う', reading: 'つかう', glossZh: '用；使用；花（钱、时间）', inVocabBank: false },
      { surface: '使用', reading: 'しよう', glossZh: '使用（正式说法）', inVocabBank: true },
      { surface: '大使館', reading: 'たいしかん', glossZh: '大使馆', inVocabBank: true },
    ],
    chineseNote: '中文的「使」多半出现在书面词里（使用、使者、致使），'
      + '日语的「使う」却是最日常的动词之一：用工具、花钱（「お金を使う」）、'
      + '说某种语言（「日本語を使う」）、用心（「気を使う」＝顾及别人）都靠它。'
      + '读音上，音读「シ」在「使用」「大使館」里出现，训读「つか」用于动词，两边要分开记。',
    mnemonicZh: '「亻（人）」＋「吏（当差的官）」＝派人去办事 → 差遣、使用。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-18',
    character: '作',
    onyomi: ['サク', 'サ'],
    kunyomi: ['つく・る'],
    meaningZh: '做；制作',
    strokeCount: 7,
    radical: { form: '亻', readingJa: 'にんべん', meaningZh: '与人有关' },
    level: 'N4',
    words: [
      { surface: '作る', reading: 'つくる', glossZh: '做；制作', inVocabBank: false },
      { surface: '作文', reading: 'さくぶん', glossZh: '作文', inVocabBank: true },
      { surface: '作品', reading: 'さくひん', glossZh: '作品', inVocabBank: true },
      { surface: '作業', reading: 'さぎょう', glossZh: '（具体的）工作、操作', inVocabBank: true },
    ],
    chineseNote: '字形与中文相同，难点是音读有两个：「サク」（「作文」「作品」）和「サ」（「作業」「動作」）。'
      + '中文只有一个读法，所以这两组必须整词背，光看字猜不出来。'
      + '另外日语里同一个「つくる」还能写成「造る」（造船、酿酒）「創る」（创作），'
      + '意思有细微差别，初级阶段一律写「作る」就好。',
    mnemonicZh: '「亻（人）」＋「乍」＝人动手把东西做出来 → 制作。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-19',
    character: '直',
    onyomi: ['チョク', 'ジキ'],
    kunyomi: ['なお・す', 'なお・る'],
    meaningZh: '直；改正、修理',
    strokeCount: 8,
    radical: { form: '目', readingJa: 'め', meaningZh: '眼睛' },
    level: 'N4',
    words: [
      { surface: '直す', reading: 'なおす', glossZh: '修理；改正', inVocabBank: true },
      { surface: '直る', reading: 'なおる', glossZh: '修好；恢复原状', inVocabBank: true },
      { surface: '正直', reading: 'しょうじき', glossZh: '诚实；老实说', inVocabBank: true },
    ],
    chineseNote: '中文的「直」主要是"笔直、一直"，日语在此之外多出一层中文没有的用法：'
      + '「直す」＝修理、改正（「時計を直す」＝修表，「間違いを直す」＝改错），'
      + '「直る」＝修好了。这是N4的高频词，不能按中文语感理解。'
      + '还要跟同音的「治す・治る」分清：修东西、改错用「直す」，治病、病好了用「治る」，'
      + '读音一模一样，写法和对象不同，是听写常错点。'
      + '音读也有两个：「チョク」（直接）和「ジキ」（正直），要分开记。部首是「目」不是「十」。',
    mnemonicZh: '十＋目＋乚＝眼睛直直地沿着一条线看过去 → 笔直。共八画。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-20',
    character: '曲',
    onyomi: ['キョク'],
    kunyomi: ['ま・がる', 'ま・げる'],
    meaningZh: '弯；乐曲',
    strokeCount: 6,
    radical: { form: '曰', readingJa: 'ひらび', meaningZh: '说；扁扁的日字框' },
    level: 'N4',
    words: [
      { surface: '曲がる', reading: 'まがる', glossZh: '拐弯；（形状）变弯', inVocabBank: true },
      { surface: '作曲', reading: 'さっきょく', glossZh: '作曲', inVocabBank: true },
      { surface: '曲', reading: 'きょく', glossZh: '歌曲；乐曲（一首一首的那种）', inVocabBank: false },
    ],
    chineseNote: '字形与中文相同，但部首是扁的「曰（ひらび）」不是「日」，查字典时容易找错。'
      + '用法上有两点：一是「曲」单用就是"歌"（「好きな曲」＝喜欢的歌），'
      + '中文一般说"歌曲"不单说"曲"；二是「曲がる」＝拐弯，问路指路天天用'
      + '（「次の角を右に曲がってください」＝下个路口请右拐）。',
    mnemonicZh: '象形字，画的是弯弯的竹编器具 → 弯。六画，中间两竖不出头。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-21',
    character: '開',
    onyomi: ['カイ'],
    kunyomi: ['ひら・く', 'あ・く', 'あ・ける'],
    meaningZh: '开；打开',
    strokeCount: 12,
    radical: { form: '門', readingJa: 'もんがまえ', meaningZh: '门；门框' },
    level: 'N4',
    words: [
      { surface: '開ける', reading: 'あける', glossZh: '打开（他动）', inVocabBank: true },
      { surface: '開く', reading: 'あく', glossZh: '开（自动）', inVocabBank: true },
      { surface: '開始', reading: 'かいし', glossZh: '开始（正式说法）', inVocabBank: true },
      { surface: '開店', reading: 'かいてん', glossZh: '开门营业；新店开张', inVocabBank: false },
    ],
    chineseNote: '简体字「开」把门框整个去掉了，日语的「開」保留完整的「門」，共十二画。'
      + '读法有三种，要按词分：「開ける（あける）」是他动（人去开），'
      + '「開く（あく）」是自动（门自己开了），「開く（ひらく）」用于书、店、会议'
      + '（「本を開く」「店を開く」）。中文一个"开"全包，所以这里最容易出错。',
    mnemonicZh: '「門」＋里面的「开」＝两只手把门闩抬起来 → 开门。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-22',
    character: '閉',
    onyomi: ['ヘイ'],
    kunyomi: ['し・める', 'し・まる', 'と・じる'],
    meaningZh: '关；闭合',
    strokeCount: 11,
    radical: { form: '門', readingJa: 'もんがまえ', meaningZh: '门；门框' },
    level: 'N4',
    words: [
      { surface: '閉める', reading: 'しめる', glossZh: '关（他动）', inVocabBank: true },
      { surface: '閉まる', reading: 'しまる', glossZh: '关上；关门', inVocabBank: true },
      { surface: '閉店', reading: 'へいてん', glossZh: '（店铺）打烊、结束营业', inVocabBank: false },
    ],
    chineseNote: '简体字「闭」里面是「才」，日语的「閉」也是「才」，差别只在门框：日语用完整的「門」。'
      + '用法上要特别小心：中文一个"关"，日语要分三个词——关门窗是「閉める」，'
      + '关灯、关电视是「消す」，关（合上）书本、眼睛是「閉じる」。'
      + '说「電気を閉める」是典型的中国学习者错误，正确是「電気を消す」。',
    mnemonicZh: '「門」＋「才（门闩）」＝门里插上门闩 → 关门。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-23',
    character: '起',
    onyomi: ['キ'],
    kunyomi: ['お・きる', 'お・こす', 'お・こる'],
    meaningZh: '起来；发生',
    strokeCount: 10,
    radical: { form: '走', readingJa: 'そうにょう', meaningZh: '跑；行走' },
    level: 'N4',
    words: [
      { surface: '起きる', reading: 'おきる', glossZh: '起床；醒来', inVocabBank: false },
      { surface: '起こす', reading: 'おこす', glossZh: '叫醒；扶起', inVocabBank: true },
      { surface: '起こる', reading: 'おこる', glossZh: '发生', inVocabBank: true },
    ],
    chineseNote: '中文的「起」几乎总要跟别的字连用（起来、起床、引起），'
      + '日语的「起きる」一个词就是"起床、醒来"（「毎朝六時に起きます」）。'
      + '另一层是"发生"：「事故が起きる」＝出事故，这时不能翻成"起来"。'
      + '还要分清「起こる」（事情发生，自动）和「起こす」（把人叫醒、把事引起，他动），'
      + '两个读音只差一个假名，听写时最容易错。',
    mnemonicZh: '「走」＋「己」＝自己迈开腿站起来 → 起身。左边的走字底要写得托住右边。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-24',
    character: '折',
    onyomi: ['セツ'],
    kunyomi: ['お・る', 'お・れる'],
    meaningZh: '折断；折叠',
    strokeCount: 7,
    radical: { form: '扌', readingJa: 'てへん', meaningZh: '与手的动作有关' },
    level: 'N4',
    words: [
      { surface: '折る', reading: 'おる', glossZh: '折；弄断', inVocabBank: true },
      { surface: '折れる', reading: 'おれる', glossZh: '断；折断', inVocabBank: true },
      { surface: '骨折', reading: 'こっせつ', glossZh: '骨折', inVocabBank: true },
    ],
    chineseNote: '字形与中文相同（提手旁＋「斤」），共七画。'
      + '用法比中文宽：既是"弄断"（「枝を折る」），也是"折叠"（「紙を折る」＝折纸），'
      + '还能表示拐弯（「次の角を右に折れる」）。'
      + '最要注意的是：中文的"打折"在日语里是「割引」，跟这个字没有关系，'
      + '看到「折」不要联想到减价。另外「折る」（他）和「折れる」（自）成对。',
    mnemonicZh: '「扌（提手旁）」＋「斤（斧头）」＝手拿斧头把东西砍断 → 折断。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-25',
    character: '押',
    onyomi: ['オウ'],
    kunyomi: ['お・す', 'お・さえる'],
    meaningZh: '按；推',
    strokeCount: 8,
    radical: { form: '扌', readingJa: 'てへん', meaningZh: '与手的动作有关' },
    level: 'N4',
    words: [
      { surface: '押す', reading: 'おす', glossZh: '按；推', inVocabBank: true },
      { surface: '押し入れ', reading: 'おしいれ', glossZh: '壁橱；日式储物间', inVocabBank: true },
      { surface: '押さえる', reading: 'おさえる', glossZh: '按住；摁住不让动', inVocabBank: false },
    ],
    chineseNote: '这是典型的同形异义字。中文的「押」是抵押、押金、押送，跟"推"没关系；'
      + '日语的「押す」＝按、推（「ボタンを押す」＝按按钮，门上写着「押」就是"推"）。'
      + '门上的另一个字「引」是"拉"，两个字配成一对，进店时天天见。'
      + '中文的"押金"在日语里要说「敷金」或「保証金」，不能用这个字。',
    mnemonicZh: '「扌（提手旁）」＋「甲」＝用手把印章按下去 → 按、压。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-26',
    character: '割',
    onyomi: ['カツ'],
    kunyomi: ['わ・る', 'わ・れる'],
    meaningZh: '分开；分摊',
    strokeCount: 12,
    radical: { form: '刂', readingJa: 'りっとう', meaningZh: '刀；用刀切' },
    level: 'N4',
    words: [
      { surface: '割る', reading: 'わる', glossZh: '打碎；分开；（数学）除', inVocabBank: false },
      { surface: '割れる', reading: 'われる', glossZh: '破碎；裂开', inVocabBank: true },
      { surface: '割合', reading: 'わりあい', glossZh: '比例；比率', inVocabBank: true },
      { surface: '割引', reading: 'わりびき', glossZh: '打折；从原来的价钱上减价', inVocabBank: true },
    ],
    chineseNote: '字形与中文相同（「害」＋「刂」），共十二画。'
      + '差别在语感：中文的「割」偏"切开"，日语的这个字重心在"分开、分摊"，'
      + '所以打折说「割引」，AA制说「割り勘」，课程表说「時間割」——'
      + '这几个都是生活里天天用的词，靠中文猜不出来。'
      + '动词是自他成对：「コップを割る」（我把杯子打碎）／「コップが割れる」（杯子碎了）。',
    mnemonicZh: '「害」＋「刂（立刀旁）」＝用刀把整块东西分开 → 分割。右边的刀写成两竖。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-27',
    character: '落',
    onyomi: ['ラク'],
    kunyomi: ['お・ちる', 'お・とす'],
    meaningZh: '落下；掉',
    strokeCount: 12,
    radical: { form: '艹', readingJa: 'くさかんむり', meaningZh: '草；植物' },
    level: 'N4',
    words: [
      { surface: '落ちる', reading: 'おちる', glossZh: '（东西）掉下来；（考试）没通过', inVocabBank: true },
      { surface: '落とす', reading: 'おとす', glossZh: '把东西弄掉、弄丢；使降低', inVocabBank: true },
      { surface: '落ち着く', reading: 'おちつく', glossZh: '冷静下来；（生活、状况）安定下来', inVocabBank: true },
    ],
    chineseNote: '字形与中文相同（草字头＋洛），十二画。'
      + '意思上多出一条中文没有的用法：考试没考上说「試験に落ちる」，'
      + '考上则说「受かる」或「合格する」。'
      + '另外东西丢了说「財布を落とした」（钱包掉了），中文这时说"丢"，不说"落"。'
      + '「落ち着く」＝冷静下来，也是日常高频词。',
    mnemonicZh: '「艹（草）」＋「洛（水流）」＝草叶飘落进水里 → 掉下来。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-28',
    character: '選',
    onyomi: ['セン'],
    kunyomi: ['えら・ぶ'],
    meaningZh: '选；挑选',
    strokeCount: 15,
    radical: { form: '辶', readingJa: 'しんにょう', meaningZh: '与走路、道路有关' },
    level: 'N4',
    words: [
      { surface: '選ぶ', reading: 'えらぶ', glossZh: '选；挑选', inVocabBank: false },
      { surface: '選手', reading: 'せんしゅ', glossZh: '（比赛的）选手、运动员', inVocabBank: true },
      { surface: '選択', reading: 'せんたく', glossZh: '选择', inVocabBank: true },
    ],
    chineseNote: '字形差别很大：简体字「选」里面是「先」，一共九画；'
      + '日语的「選」里面是「巽」，一共十五画。完全不能按简体字推，必须专门练写。'
      + '意思上两边一致，负担全在字形和读音（训读「えら」／音读「セン」）。'
      + '「選択（せんたく）」跟表示洗衣服的「洗濯（せんたく）」同音，听的时候要靠上下文分辨。',
    mnemonicZh: '「辶（走之）」＋「巽」＝在路上把人一个个挑出来送走 → 挑选。里面的「巽」有十二画。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-29',
    character: '覚',
    onyomi: ['カク'],
    kunyomi: ['おぼ・える', 'さ・める', 'さ・ます'],
    meaningZh: '记住；醒来；感觉',
    strokeCount: 12,
    radical: { form: '見', readingJa: 'みる', meaningZh: '看；眼睛' },
    level: 'N4',
    words: [
      { surface: '覚える', reading: 'おぼえる', glossZh: '记住；学会', inVocabBank: false },
      { surface: '覚める', reading: 'さめる', glossZh: '醒；睡醒', inVocabBank: true },
      { surface: '感覚', reading: 'かんかく', glossZh: '感觉；知觉', inVocabBank: true },
    ],
    chineseNote: '简体字「觉」下面是「见」，日语的「覚」下面是完整的「見」，共十二画。'
      + '意思上有一个很大的错位：中文的「觉」最常见的是"睡觉"，'
      + '而日语的「覚める」正好相反，是"睡醒"（「目が覚める」＝醒过来）；'
      + '睡觉要说「寝る」。更常用的是「覚える」＝记住、学会（「単語を覚える」＝背单词），'
      + '这个意思中文的「觉」完全没有，必须重新记。',
    mnemonicZh: '上面「⺍」＋「冖」＋下面「見」＝眼睛看见了，心里就明白了 → 醒、记住。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
  {
    entryId: 'kj-n4d-30',
    character: '忘',
    onyomi: ['ボウ'],
    kunyomi: ['わす・れる'],
    meaningZh: '忘记',
    strokeCount: 7,
    radical: { form: '心', readingJa: 'こころ', meaningZh: '心；心情' },
    level: 'N4',
    words: [
      { surface: '忘れる', reading: 'わすれる', glossZh: '忘记；（东西）落下', inVocabBank: false },
      { surface: '忘れ物', reading: 'わすれもの', glossZh: '遗忘的东西', inVocabBank: true },
      { surface: '忘年会', reading: 'ぼうねんかい', glossZh: '年底的聚餐会（送走这一年的酒会）', inVocabBank: false },
    ],
    chineseNote: '字形与中文相同。用法上多出一条：东西落在某处也说「忘れる」——'
      + '「電車に傘を忘れました」＝把伞落在电车上了，中文这时说"落"不说"忘"。'
      + '车站广播里的「お忘れ物のないように」就是"请不要遗漏随身物品"。'
      + '另外「忘年会」是日本独有的年末聚餐文化，中文的"忘年"指年龄差距大的交情，意思完全不同。',
    mnemonicZh: '「亡（没了）」＋「心」＝心里没有了 → 忘记。共七画。',
    state: 'active_beta',
    reviewNotes: [],
    batchId: BATCH_ID,
  },
];
