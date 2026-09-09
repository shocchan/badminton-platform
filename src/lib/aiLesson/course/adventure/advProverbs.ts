// 今日のことば＝開いた日にひとつだけ受け取る、ことわざ・慣用句・四字熟語。2026-09-07。
//
// なぜこれを配るか（CEO案 2026-09-07）:
//   「ログインすること自体に意味がある」ものが要る。ミッションを始める体力が無い日でも、
//   開いて1つ読んだら**それだけで少し学んだ**と言える状態にする。
//
// なぜ「ことわざ・慣用句」なのか:
//   - 著作権が発生しない（近現代の名言は引けない）。ここは原則として**古くから使われている
//     言い回しだけ**を置く。出典のある個人の言葉は入れない
//   - 中国語母語話者には**同じ意味の中国語がある**ものが多く（百闻不如一见・一石二鸟・温故知新）、
//     母語の知識をそのまま日本語の運用に乗せられる。zhSame はそのための欄
//   - JLPTの読解・聴解にも実際に出る。飾りではなく素材になる
//
// 数の決め方: 60件。半年つづける商品なので40件（＝40日で一巡）では足りず、2026-09-07に20件足した。
// 配る順は「まだ持っていないものを先に」＋「その日の状況に合うものを優先」（advDailyGift.ts）。
// 同じ日に開き直しても内容は変わらない。増やすときはこの配列の末尾に足すだけでよい。

export type ProverbKind = 'kotowaza' | 'kanyoku' | 'yojijukugo';

/**
 * むずかしさの帯（2026-09-07）。**JLPTの級とは言わない**——ことわざは級の範囲に
 * 載っているものではないので、「N3の語です」と書くのは作り話になる（原則13）。
 * ここで決めているのは「初級の人に先に出すか、あとに回すか」だけ。
 * 判断のもと: 見出しの語のやさしさ＋例文の文型。
 */
export type ProverbBand = 'basic' | 'middle' | 'upper';

/**
 * どんな日に渡すと効くか（2026-09-07）。
 * 久しぶりに戻ってきた人に「三日坊主」を渡してはいけない、という程度の粗い分類。
 * - comeback  … 間があいて戻ってきた日
 * - keepgoing … 続いている日
 * - start     … 始めたばかりの日
 * - mistake   … うまくいかなかった日・間違いの多い日
 * - daily     … いつでも（日常・場面の言い回し）
 */
export type ProverbMood = 'comeback' | 'keepgoing' | 'start' | 'mistake' | 'daily';

export interface Proverb {
  id: string;
  kind: ProverbKind;
  /** 初級の人に先に出すか（JLPTの級ではない。ProverbBand の説明を読むこと） */
  band: ProverbBand;
  /** どんな日に渡すと効くか（1つ以上） */
  mood: ProverbMood[];
  /** 見出し（漢字かな交じり） */
  ja: string;
  /** 全文のよみ（ひらがな）。かなしか読めない人でも音にできる */
  yomi: string;
  /** やさしい日本語の意味 */
  meaningJa: string;
  /** 簡体字の意味 */
  meaningZh: string;
  /** 使う場面の例文 */
  exampleJa: string;
  exampleZh: string;
  /** 中国語に同じ意味の決まった言い方があるとき（無ければ省略） */
  zhSame?: string;
}

export const PROVERBS: Proverb[] = [
  {
    id: 'keizoku', kind: 'kotowaza',
    band: 'basic', mood: ['keepgoing', 'comeback'],
    ja: '継続は力なり', yomi: 'けいぞくはちからなり',
    meaningJa: '少しずつでも続けることが、いちばん強い。',
    meaningZh: '哪怕每次很少，坚持下去本身就是力量。',
    exampleJa: '毎日5分でいいんです。継続は力なりですから。',
    exampleZh: '每天5分钟就够了。因为坚持就是力量。',
    zhSame: '坚持就是胜利',
  },
  {
    id: 'ishinoue', kind: 'kotowaza',
    band: 'middle', mood: ['keepgoing'],
    ja: '石の上にも三年', yomi: 'いしのうえにもさんねん',
    meaningJa: '冷たい石でも三年すわれば温かくなる。がまん強く続ければ実る。',
    meaningZh: '再冷的石头坐三年也会暖。忍耐着做下去，总会有结果。',
    exampleJa: '最初の半年はつらかったけど、石の上にも三年ですね。',
    exampleZh: '最初的半年很辛苦，不过正所谓功到自然成。',
    zhSame: '功到自然成',
  },
  {
    id: 'senri', kind: 'kotowaza',
    band: 'basic', mood: ['start', 'comeback'],
    ja: '千里の道も一歩から', yomi: 'せんりのみちもいっぽから',
    meaningJa: '大きなことも、最初の小さな一歩から始まる。',
    meaningZh: '再大的事，也是从第一小步开始的。',
    exampleJa: 'N2はまだ遠いけど、千里の道も一歩からです。',
    exampleZh: 'N2还很远，但千里之行始于足下。',
    zhSame: '千里之行，始于足下',
  },
  {
    id: 'chirimo', kind: 'kotowaza',
    band: 'basic', mood: ['keepgoing'],
    ja: '塵も積もれば山となる', yomi: 'ちりもつもればやまとなる',
    meaningJa: '小さなものでも、積み重なれば大きくなる。',
    meaningZh: '再小的东西，积累起来也会变大。',
    exampleJa: '1日3語でも、塵も積もれば山となるですよ。',
    exampleZh: '一天3个词，积少成多。',
    zhSame: '积少成多',
  },
  {
    id: 'anzuru', kind: 'kotowaza',
    band: 'middle', mood: ['start', 'mistake'],
    ja: '案ずるより産むが易し', yomi: 'あんずるよりうむがやすし',
    meaningJa: '心配するより、やってみると意外に簡単だ。',
    meaningZh: '与其担心，不如做做看，往往比想象中简单。',
    exampleJa: '電話、こわかったけど案ずるより産むが易しでした。',
    exampleZh: '打电话之前很怕，做了才发现没那么难。',
  },
  {
    id: 'narau', kind: 'kotowaza',
    band: 'basic', mood: ['start', 'daily'],
    ja: '習うより慣れろ', yomi: 'ならうよりなれろ',
    meaningJa: '教わるより、何度もやって体で覚えるほうが早い。',
    meaningZh: '与其听讲解，不如多做几次、用身体记住。',
    exampleJa: '文法書を読むより、習うより慣れろで話しましょう。',
    exampleZh: '与其读语法书，不如熟能生巧，先开口说。',
    zhSame: '熟能生巧',
  },
  {
    id: 'sukikoso', kind: 'kotowaza',
    band: 'middle', mood: ['keepgoing'],
    ja: '好きこそ物の上手なれ', yomi: 'すきこそもののじょうずなれ',
    meaningJa: '好きなことは、自然に上手になる。',
    meaningZh: '喜欢的事情，自然而然就会做得好。',
    exampleJa: 'アニメで覚えたんですか。好きこそ物の上手なれですね。',
    exampleZh: '是看动画学的吗？兴趣是最好的老师。',
    zhSame: '兴趣是最好的老师',
  },
  {
    id: 'isogaba', kind: 'kotowaza',
    band: 'basic', mood: ['mistake', 'daily'],
    ja: '急がば回れ', yomi: 'いそがばまわれ',
    meaningJa: '急ぐときほど、安全で確実な道を行くほうが早い。',
    meaningZh: '越着急，越应该走稳妥可靠的路，反而更快。',
    exampleJa: '基礎を飛ばさないで。急がば回れです。',
    exampleZh: '别跳过基础。欲速则不达。',
    zhSame: '欲速则不达',
  },
  {
    id: 'korobanu', kind: 'kotowaza',
    band: 'middle', mood: ['daily'],
    ja: '転ばぬ先の杖', yomi: 'ころばぬさきのつえ',
    meaningJa: '失敗する前に、用意しておくこと。',
    meaningZh: '在失败之前先做好准备。',
    exampleJa: '面接の前に一度練習しましょう。転ばぬ先の杖です。',
    exampleZh: '面试前先练一次吧，有备无患。',
    zhSame: '未雨绸缪',
  },
  {
    id: 'nanakorobi', kind: 'kotowaza',
    band: 'basic', mood: ['mistake', 'comeback'],
    ja: '七転び八起き', yomi: 'ななころびやおき',
    meaningJa: '何度失敗しても、また立ち上がること。',
    meaningZh: '不管跌倒多少次，都再站起来。',
    exampleJa: '不合格でも七転び八起きですよ。',
    exampleZh: '就算没考过，也要百折不挠。',
    zhSame: '百折不挠',
  },
  {
    id: 'hyakubun', kind: 'kotowaza',
    band: 'middle', mood: ['daily'],
    ja: '百聞は一見に如かず', yomi: 'ひゃくぶんはいっけんにしかず',
    meaningJa: '百回聞くより、一回自分の目で見るほうがよく分かる。',
    meaningZh: '听一百次，不如自己看一次。',
    exampleJa: '写真を見せますね。百聞は一見に如かずですから。',
    exampleZh: '我给你看照片吧，百闻不如一见。',
    zhSame: '百闻不如一见',
  },
  {
    id: 'ronyori', kind: 'kotowaza',
    band: 'upper', mood: ['daily'],
    ja: '論より証拠', yomi: 'ろんよりしょうこ',
    meaningJa: '議論するより、証拠を見せるほうが早い。',
    meaningZh: '与其争论，不如拿出证据。',
    exampleJa: '論より証拠、実際の画面をお見せします。',
    exampleZh: '事实胜于雄辩，我直接给你看实际画面。',
    zhSame: '事实胜于雄辩',
  },
  {
    id: 'deru-kui', kind: 'kotowaza',
    band: 'upper', mood: ['daily'],
    ja: '出る杭は打たれる', yomi: 'でるくいはうたれる',
    meaningJa: '目立つ人は、まわりから抑えられやすい。日本の職場の話でよく出る。',
    meaningZh: '出头的人容易被打压。在日本职场的话题里经常出现。',
    exampleJa: '意見は言いたいけど、出る杭は打たれるからね。',
    exampleZh: '虽然想发表意见，但枪打出头鸟啊。',
    zhSame: '枪打出头鸟',
  },
  {
    id: 'gouni', kind: 'kotowaza',
    band: 'upper', mood: ['daily'],
    ja: '郷に入っては郷に従え', yomi: 'ごうにいってはごうにしたがえ',
    meaningJa: 'その土地に来たら、その土地のやり方に合わせる。',
    meaningZh: '到了一个地方，就按那里的规矩来。',
    exampleJa: '日本ではこうするんですね。郷に入っては郷に従えです。',
    exampleZh: '在日本是这样做的啊。入乡随俗。',
    zhSame: '入乡随俗',
  },
  {
    id: 'fukusui', kind: 'kotowaza',
    band: 'upper', mood: ['mistake'],
    ja: '覆水盆に返らず', yomi: 'ふくすいぼんにかえらず',
    meaningJa: 'こぼした水は戻らない。してしまったことは取り消せない。',
    meaningZh: '泼出去的水收不回来。做过的事无法撤回。',
    exampleJa: '言ってしまった言葉は覆水盆に返らずです。',
    exampleZh: '说出口的话，覆水难收。',
    zhSame: '覆水难收',
  },
  {
    id: 'inumo', kind: 'kotowaza',
    band: 'middle', mood: ['start'],
    ja: '犬も歩けば棒に当たる', yomi: 'いぬもあるけばぼうにあたる',
    meaningJa: '動いていれば、思いがけない出来事に出会う。いい意味でも悪い意味でも使う。',
    meaningZh: '只要行动，就会遇上意想不到的事。好事坏事都能用。',
    exampleJa: 'とりあえず行ってみます。犬も歩けば棒に当たるですね。',
    exampleZh: '总之先去看看。走出去总会遇到点什么。',
  },
  {
    id: 'hanayori', kind: 'kotowaza',
    band: 'basic', mood: ['daily'],
    ja: '花より団子', yomi: 'はなよりだんご',
    meaningJa: '見て楽しむものより、実際に役に立つもののほうがいい。',
    meaningZh: '比起好看的东西，更看重实惠实用的东西。',
    exampleJa: 'お花見に行っても、花より団子です。',
    exampleZh: '就算去赏花，我也是更在意吃的。',
  },
  {
    id: 'mikkabouzu', kind: 'kotowaza',
    band: 'basic', mood: ['comeback', 'mistake'],
    ja: '三日坊主', yomi: 'みっかぼうず',
    meaningJa: '始めてもすぐにやめてしまうこと。自分のことを軽く言うときによく使う。',
    meaningZh: '开始了很快就放弃。常用来自嘲。',
    exampleJa: '私はいつも三日坊主で……今回は続けたいです。',
    exampleZh: '我总是三分钟热度……这次想坚持下去。',
    zhSame: '三分钟热度',
  },
  {
    id: 'shoshin', kind: 'kotowaza',
    band: 'middle', mood: ['comeback', 'keepgoing'],
    ja: '初心忘るべからず', yomi: 'しょしんわするべからず',
    meaningJa: '始めたころの気持ちを忘れてはいけない。',
    meaningZh: '不要忘记刚开始时的心情。',
    exampleJa: '慣れてきたときこそ、初心忘るべからずです。',
    exampleZh: '越是习惯了，越要不忘初心。',
    zhSame: '不忘初心',
  },
  {
    id: 'ichigo', kind: 'yojijukugo',
    band: 'middle', mood: ['daily'],
    ja: '一期一会', yomi: 'いちごいちえ',
    meaningJa: 'この出会いは一生に一度。だから大切にする。',
    meaningZh: '这次相遇一生只有一次，所以要珍惜。',
    exampleJa: '今日お会いできてうれしいです。一期一会ですね。',
    exampleZh: '今天能见到你很高兴。这份相遇很珍贵。',
  },
  {
    id: 'isseki', kind: 'yojijukugo',
    band: 'basic', mood: ['daily'],
    ja: '一石二鳥', yomi: 'いっせきにちょう',
    meaningJa: 'ひとつのことで、ふたつの得がある。',
    meaningZh: '做一件事得到两个好处。',
    exampleJa: '通勤中に聞けば、一石二鳥ですね。',
    exampleZh: '通勤路上听的话，一举两得。',
    zhSame: '一石二鸟／一举两得',
  },
  {
    id: 'juunin', kind: 'yojijukugo',
    band: 'basic', mood: ['daily'],
    ja: '十人十色', yomi: 'じゅうにんといろ',
    meaningJa: '人はそれぞれ、考え方も好みも違う。',
    meaningZh: '每个人的想法和喜好都不一样。',
    exampleJa: '勉強のやり方は十人十色です。',
    exampleZh: '学习方法因人而异。',
    zhSame: '各有各的不同',
  },
  {
    id: 'jigou', kind: 'yojijukugo',
    band: 'middle', mood: ['mistake'],
    ja: '自業自得', yomi: 'じごうじとく',
    meaningJa: '自分がしたことの結果を、自分が受けること。',
    meaningZh: '自己做的事，结果自己承担。',
    exampleJa: '寝坊したのは自業自得です。',
    exampleZh: '睡过头是自作自受。',
    zhSame: '自作自受',
  },
  {
    id: 'rinki', kind: 'yojijukugo',
    band: 'upper', mood: ['daily'],
    ja: '臨機応変', yomi: 'りんきおうへん',
    meaningJa: 'その場の様子を見て、やり方を変えること。',
    meaningZh: '看当时的情况，灵活改变做法。',
    exampleJa: 'マニュアル通りでなくて、臨機応変にお願いします。',
    exampleZh: '不必完全照手册，请随机应变。',
    zhSame: '随机应变',
  },
  {
    id: 'onko', kind: 'yojijukugo',
    band: 'upper', mood: ['comeback'],
    ja: '温故知新', yomi: 'おんこちしん',
    meaningJa: '昔のことを学び直して、新しいことに気づく。',
    meaningZh: '重新学习旧的东西，从中得到新的领悟。',
    exampleJa: '前のノートを読み返すと温故知新ですね。',
    exampleZh: '重读以前的笔记，温故而知新。',
    zhSame: '温故而知新',
  },
  {
    id: 'yuugen', kind: 'yojijukugo',
    band: 'middle', mood: ['keepgoing'],
    ja: '有言実行', yomi: 'ゆうげんじっこう',
    meaningJa: '言ったことを、そのとおりにやること。',
    meaningZh: '说了的事就照做，说到做到。',
    exampleJa: '毎日やると言ったので、有言実行します。',
    exampleZh: '既然说了每天做，就说到做到。',
    zhSame: '说到做到',
  },
  {
    id: 'nekonote', kind: 'kanyoku',
    band: 'basic', mood: ['daily'],
    ja: '猫の手も借りたい', yomi: 'ねこのてもかりたい',
    meaningJa: 'とても忙しくて、誰でもいいから手伝ってほしい。',
    meaningZh: '忙得不可开交，谁来帮忙都好。',
    exampleJa: '年末は猫の手も借りたいくらい忙しいです。',
    exampleZh: '年底忙得恨不得多长两只手。',
  },
  {
    id: 'atamaga', kind: 'kanyoku',
    band: 'basic', mood: ['keepgoing'],
    ja: '頭が下がる', yomi: 'あたまがさがる',
    meaningJa: '相手を心から立派だと思う。尊敬する。',
    meaningZh: '打从心里佩服对方。',
    exampleJa: '毎日続けているなんて、頭が下がります。',
    exampleZh: '居然每天都坚持，真让人佩服。',
  },
  {
    id: 'mekara', kind: 'kanyoku',
    band: 'middle', mood: ['daily'],
    ja: '目からうろこが落ちる', yomi: 'めからうろこがおちる',
    meaningJa: '急に分かるようになる。今までの見方が変わる。',
    meaningZh: '突然想通了，看事情的角度一下子变了。',
    exampleJa: 'その説明で目からうろこが落ちました。',
    exampleZh: '听了那个解释，我恍然大悟。',
    zhSame: '恍然大悟',
  },
  {
    id: 'tewonuku', kind: 'kanyoku',
    band: 'basic', mood: ['daily'],
    ja: '手を抜く', yomi: 'てをぬく',
    meaningJa: 'やるべきことを、わざと省いていいかげんにする。',
    meaningZh: '偷工减料、故意敷衍。',
    exampleJa: '疲れていても、確認は手を抜きません。',
    exampleZh: '就算累，确认这一步也不马虎。',
  },
  {
    id: 'kigaokenai', kind: 'kanyoku',
    band: 'upper', mood: ['daily'],
    ja: '気が置けない', yomi: 'きがおけない',
    meaningJa: '遠慮しなくていい、気楽な相手。**「油断できない」という意味ではない**ので注意。',
    meaningZh: '不用客气、可以放松相处的关系。**不是「不能大意」的意思**，容易误解。',
    exampleJa: '気が置けない友だちと話すと元気が出ます。',
    exampleZh: '和不用客气的朋友聊天，人就有精神了。',
  },
  {
    id: 'honega', kind: 'kanyoku',
    band: 'middle', mood: ['daily'],
    ja: '骨が折れる', yomi: 'ほねがおれる',
    meaningJa: 'とても手間がかかる、大変だ。けがの話ではない。',
    meaningZh: '很费力气、很麻烦。不是真的骨折。',
    exampleJa: '書類を全部そろえるのは骨が折れました。',
    exampleZh: '把材料全部凑齐真是费了不少劲。',
  },
  {
    id: 'kaogahiroi', kind: 'kanyoku',
    band: 'basic', mood: ['daily'],
    ja: '顔が広い', yomi: 'かおがひろい',
    meaningJa: '知り合いが多い。',
    meaningZh: '认识的人多、人脉广。',
    exampleJa: '田中さんは顔が広いから、聞いてみましょう。',
    exampleZh: '田中先生人脉广，我们问问他吧。',
  },
  {
    id: 'udewo', kind: 'kanyoku',
    band: 'basic', mood: ['keepgoing'],
    ja: '腕を上げる', yomi: 'うでをあげる',
    meaningJa: '前より上手になる。',
    meaningZh: '技术比以前更好了。',
    exampleJa: '発音、腕を上げましたね。',
    exampleZh: '你的发音进步了呢。',
  },
  {
    id: 'kokorowo', kind: 'kanyoku',
    band: 'middle', mood: ['daily'],
    ja: '心を打つ', yomi: 'こころをうつ',
    meaningJa: '強く感動させる。',
    meaningZh: '深深打动人心。',
    exampleJa: '彼女の話は心を打ちました。',
    exampleZh: '她的话打动了我。',
  },
  {
    id: 'kuchiga', kind: 'kanyoku',
    band: 'middle', mood: ['mistake'],
    ja: '口が滑る', yomi: 'くちがすべる',
    meaningJa: '言うつもりのなかったことを、うっかり言ってしまう。',
    meaningZh: '不小心说漏嘴。',
    exampleJa: 'つい口が滑って、秘密を話してしまいました。',
    exampleZh: '一不小心说漏了嘴，把秘密说出来了。',
    zhSame: '说漏嘴',
  },
  {
    id: 'mimiga', kind: 'kanyoku',
    band: 'middle', mood: ['mistake'],
    ja: '耳が痛い', yomi: 'みみがいたい',
    meaningJa: '言われたことが自分の弱いところに当たっていて、聞くのがつらい。',
    meaningZh: '别人说的正好戳到自己的短处，听着难受。',
    exampleJa: '毎日やりなさいと言われると耳が痛いです。',
    exampleZh: '被说「要每天做」，听着真是不好意思。',
  },
  {
    id: 'aburawo', kind: 'kanyoku',
    band: 'middle', mood: ['daily'],
    ja: '油を売る', yomi: 'あぶらをうる',
    meaningJa: '仕事の途中でむだ話をして、時間をつぶす。',
    meaningZh: '干活时闲聊、磨蹭时间。',
    exampleJa: 'どこで油を売っていたんですか。',
    exampleZh: '你刚才跑哪儿偷懒去了？',
  },
  {
    id: 'umaga', kind: 'kanyoku',
    band: 'basic', mood: ['daily'],
    ja: '馬が合う', yomi: 'うまがあう',
    meaningJa: '気が合う。一緒にいて楽だ。',
    meaningZh: '合得来、投缘。',
    exampleJa: '新しい同僚とは馬が合いそうです。',
    exampleZh: '感觉和新同事挺合得来。',
    zhSame: '合得来',
  },
  {
    id: 'kiganagai', kind: 'kanyoku',
    band: 'basic', mood: ['keepgoing', 'comeback'],
    ja: '気が長い', yomi: 'きがながい',
    meaningJa: 'あせらないで待てる性格。反対は「気が短い」。',
    meaningZh: '性子慢、能耐心等待。反义是「気が短い（急性子）」。',
    exampleJa: '語学は気が長い人のほうが伸びます。',
    exampleZh: '学语言，性子慢一点的人反而进步更快。',
  },
  {
    id: 'ishibashi', kind: 'kotowaza',
    band: 'middle', mood: ['daily'],
    ja: '石橋を叩いて渡る', yomi: 'いしばしをたたいてわたる',
    meaningJa: '安全そうに見えても、よく確かめてから進む。とても用心深いこと。',
    meaningZh: '就算看起来安全，也要确认清楚再走。形容非常谨慎。',
    exampleJa: '彼は石橋を叩いて渡る人だから、準備は完璧です。',
    exampleZh: '他做事非常谨慎，所以准备一定很周全。',
    zhSame: '谨小慎微',
  },
  {
    id: 'nito', kind: 'kotowaza',
    band: 'middle', mood: ['mistake'],
    ja: '二兎を追う者は一兎をも得ず', yomi: 'にとをおうものはいっとをもえず',
    meaningJa: '同時に二つを狙うと、どちらも取れない。',
    meaningZh: '同时想要两样，结果一样也得不到。',
    exampleJa: '今月は会話だけにします。二兎を追う者は一兎をも得ずですから。',
    exampleZh: '这个月只练会话。因为贪多嚼不烂。',
    zhSame: '贪多嚼不烂',
  },
  {
    id: 'shippai', kind: 'kotowaza',
    band: 'basic', mood: ['mistake', 'comeback'],
    ja: '失敗は成功のもと', yomi: 'しっぱいはせいこうのもと',
    meaningJa: '失敗しても、そこから学べば次の成功につながる。',
    meaningZh: '就算失败，从中学到东西就能通往下一次的成功。',
    exampleJa: '間違えても大丈夫。失敗は成功のもとです。',
    exampleZh: '答错也没关系。失败乃成功之母。',
    zhSame: '失败乃成功之母',
  },
  {
    id: 'saiou', kind: 'kotowaza',
    band: 'upper', mood: ['comeback'],
    ja: '人間万事塞翁が馬', yomi: 'にんげんばんじさいおうがうま',
    meaningJa: 'いいことも悪いことも、あとになってみないと分からない。',
    meaningZh: '是好是坏，要过后才知道。',
    exampleJa: '転職はつらかったけど、人間万事塞翁が馬ですね。',
    exampleZh: '换工作虽然辛苦，不过塞翁失马，焉知非福。',
    zhSame: '塞翁失马，焉知非福',
  },
  {
    id: 'sarumo', kind: 'kotowaza',
    band: 'basic', mood: ['mistake'],
    ja: '猿も木から落ちる', yomi: 'さるもきからおちる',
    meaningJa: '上手な人でも、ときには失敗する。',
    meaningZh: '再擅长的人，偶尔也会失手。',
    exampleJa: '日本人でも書き間違えます。猿も木から落ちるですよ。',
    exampleZh: '日本人也会写错。智者千虑，必有一失。',
    zhSame: '智者千虑，必有一失',
  },
  {
    id: 'hayaoki', kind: 'kotowaza',
    band: 'basic', mood: ['daily'],
    ja: '早起きは三文の徳', yomi: 'はやおきはさんもんのとく',
    meaningJa: '早く起きると、少しいいことがある。',
    meaningZh: '早起会有一点好处。',
    exampleJa: '朝に勉強すると静かですよ。早起きは三文の徳です。',
    exampleZh: '早上学习很安静。早起三分利。',
    zhSame: '早起三分利',
  },
  {
    id: 'kuchiwa', kind: 'kotowaza',
    band: 'middle', mood: ['mistake'],
    ja: '口は災いの元', yomi: 'くちはわざわいのもと',
    meaningJa: 'うっかり言った言葉が、後で問題になる。',
    meaningZh: '一时说出口的话，之后会惹麻烦。',
    exampleJa: '会議では気をつけます。口は災いの元ですから。',
    exampleZh: '开会时我会注意的。祸从口出。',
    zhSame: '祸从口出',
  },
  {
    id: 'sumeba', kind: 'kotowaza',
    band: 'basic', mood: ['daily'],
    ja: '住めば都', yomi: 'すめばみやこ',
    meaningJa: 'どんな場所でも、住み慣れれば居心地がよくなる。',
    meaningZh: '不管什么地方，住惯了就会觉得舒服。',
    exampleJa: '最初は不安でしたが、住めば都ですね。',
    exampleZh: '刚来的时候很不安，不过住久了就习惯了。',
  },
  {
    id: 'inonaka', kind: 'kotowaza',
    band: 'middle', mood: ['daily'],
    ja: '井の中の蛙大海を知らず', yomi: 'いのなかのかわずたいかいをしらず',
    meaningJa: 'せまい世界しか知らないと、広い世界が分からない。',
    meaningZh: '只知道狭小的世界，就不了解外面有多大。',
    exampleJa: '留学して、井の中の蛙大海を知らずだったと思いました。',
    exampleZh: '留学之后才觉得自己以前是井底之蛙。',
    zhSame: '井底之蛙',
  },
  {
    id: 'rakuareba', kind: 'kotowaza',
    band: 'middle', mood: ['keepgoing'],
    ja: '楽あれば苦あり', yomi: 'らくあればくあり',
    meaningJa: '楽しいことのあとには、苦しいこともある。その逆もある。',
    meaningZh: '有轻松的时候，也会有辛苦的时候，反过来也一样。',
    exampleJa: '今週は大変ですが、楽あれば苦ありですね。',
    exampleZh: '这周很辛苦，不过有苦就有甜。',
    zhSame: '有苦就有甜',
  },
  {
    id: 'taiki', kind: 'yojijukugo',
    band: 'upper', mood: ['comeback'],
    ja: '大器晩成', yomi: 'たいきばんせい',
    meaningJa: '大きく育つ人は、ゆっくり時間をかけて力をつける。',
    meaningZh: '有大成就的人，往往需要更长的时间才成熟。',
    exampleJa: '進みが遅くても心配いりません。大器晩成です。',
    exampleZh: '进度慢也不用担心。大器晚成。',
    zhSame: '大器晚成',
  },
  {
    id: 'sessa', kind: 'yojijukugo',
    band: 'upper', mood: ['keepgoing'],
    ja: '切磋琢磨', yomi: 'せっさたくま',
    meaningJa: '仲間どうしで励まし合い、競い合って伸びること。',
    meaningZh: '同伴之间互相鼓励、互相竞争，一起进步。',
    exampleJa: '同じクラスの人と切磋琢磨しています。',
    exampleZh: '我和同班的人在互相切磋。',
    zhSame: '切磋琢磨',
  },
  {
    id: 'gojippo', kind: 'yojijukugo',
    band: 'middle', mood: ['daily'],
    ja: '五十歩百歩', yomi: 'ごじっぽひゃっぽ',
    meaningJa: '少し違うだけで、どちらも似たようなもの。',
    meaningZh: '只差一点点，其实两边差不多。',
    exampleJa: '私も間違えました。五十歩百歩ですね。',
    exampleZh: '我也做错了。五十步笑百步。',
    zhSame: '五十步笑百步',
  },
  {
    id: 'ichiwo', kind: 'kotowaza',
    band: 'middle', mood: ['daily'],
    ja: '一を聞いて十を知る', yomi: 'いちをきいてじゅうをしる',
    meaningJa: '少し聞いただけで、全体を理解してしまう。とても賢い。',
    meaningZh: '只听一点就能明白全部。形容非常聪明。',
    exampleJa: '説明が早いですね。一を聞いて十を知るタイプです。',
    exampleZh: '你理解得真快，是闻一知十的类型。',
    zhSame: '闻一知十',
  },
  {
    id: 'kubiwo', kind: 'kanyoku',
    band: 'basic', mood: ['daily'],
    ja: '首を長くする', yomi: 'くびをながくする',
    meaningJa: '楽しみにして、待ち遠しく思う。',
    meaningZh: '满心期待地等着。',
    exampleJa: '合格の知らせを首を長くして待っています。',
    exampleZh: '我正翘首以盼合格的通知。',
    zhSame: '翘首以盼',
  },
  {
    id: 'temoashimo', kind: 'kanyoku',
    band: 'basic', mood: ['mistake'],
    ja: '手も足も出ない', yomi: 'てもあしもでない',
    meaningJa: 'むずかしすぎて、何もできない。',
    meaningZh: '太难了，完全无从下手。',
    exampleJa: '去年の問題は手も足も出ませんでした。',
    exampleZh: '去年的题目我完全束手无策。',
    zhSame: '束手无策',
  },
  {
    id: 'mewotoosu', kind: 'kanyoku',
    band: 'middle', mood: ['daily'],
    ja: '目を通す', yomi: 'めをとおす',
    meaningJa: '全部をざっと読む。細かく読むのとは違う。',
    meaningZh: '大致过一遍，不是仔细精读。',
    exampleJa: '資料に目を通しておいてください。',
    exampleZh: '请先把资料大致看一遍。',
  },
  {
    id: 'hanashiga', kind: 'kanyoku',
    band: 'middle', mood: ['daily'],
    ja: '話が弾む', yomi: 'はなしがはずむ',
    meaningJa: '会話が楽しく、どんどん続く。',
    meaningZh: '聊得很起劲，话题一个接一个。',
    exampleJa: '同じ趣味だったので、話が弾みました。',
    exampleZh: '因为兴趣相同，我们聊得很起劲。',
  },
  {
    id: 'kaowo', kind: 'kanyoku',
    band: 'basic', mood: ['daily'],
    ja: '顔を出す', yomi: 'かおをだす',
    meaningJa: '少しの時間だけ、その場に行く。',
    meaningZh: '露个面、短暂地到场一下。',
    exampleJa: '飲み会には少しだけ顔を出します。',
    exampleZh: '聚会我会去露个面。',
  },
  {
    id: 'ikiga', kind: 'kanyoku',
    band: 'middle', mood: ['daily'],
    ja: '息が合う', yomi: 'いきがあう',
    meaningJa: '相手と調子がぴったり合う。一緒にやりやすい。',
    meaningZh: '和对方配合得很默契。',
    exampleJa: 'ペアの人と息が合って、うまくいきました。',
    exampleZh: '和搭档配合默契，进行得很顺利。',
    zhSame: '配合默契',
  },
];

export const proverbById = (id: string): Proverb | null =>
  PROVERBS.find((p) => p.id === id) ?? null;

/* ──────────────────────────────────────────────────────────────
   読み上げ用のテキスト（2026-09-09 CEO実機報告）

   報告: 「住めば都」の読み上げボタンを押したら **「すめばと」** と発音された。

   原因: ブラウザの音声合成へ**漢字のまま**渡していた。合成側は文脈で読みを決めるので、
   「都」のように読みが割れる字（みやこ / と）は外す。ことわざは短くて文脈が無いぶん、
   ふつうの文より外しやすい。

   なぜ直すか（数字の問題ではない）:
   日本語を教える商品が、ことわざの読みを**間違えて教えている**。
   聞いた人はそのまま覚える。教材の誤植と同じ重さで、放置してよいものではない。

   直し方: 見出しは authored の `yomi`（ひらがな全文）をそのまま読ませる。
   例文は、見出しがそのまま入っているとき（60件中45件）だけ、その部分を `yomi` に置き換える。
   置き換えても**音は変わらない**（yomi は見出しの正しい読みそのもの）ので、
   もともと正しく読めていたことばが悪くなることはない。
   ────────────────────────────────────────────────────────────── */

/** 見出しの読み上げテキスト。漢字ではなく authored のよみを読ませる */
export const proverbSpeechText = (p: Pick<Proverb, 'ja' | 'yomi'>): string =>
  p.yomi.trim() || p.ja;

/**
 * 例文の読み上げテキスト。
 * 見出しがそのままの形で入っているときだけ、その部分をよみに置き換える。
 * 活用して入っている慣用句（頭が下がる → 頭が下がります）は置き換えない
 * ＝機械で読みを作らない（原則13: 作った読みを教えない）。
 */
export const proverbExampleSpeechText = (
  p: Pick<Proverb, 'ja' | 'yomi' | 'exampleJa'>,
): string => {
  const head = p.ja.trim();
  const yomi = p.yomi.trim();
  if (!head || !yomi || !p.exampleJa.includes(head)) return p.exampleJa;
  return p.exampleJa.split(head).join(yomi);
};
